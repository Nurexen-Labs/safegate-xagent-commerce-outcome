"use strict";

const crypto = require("node:crypto");

const {
  createPaymentIntent,
  verifyIntentBoundBasePayment
} = require("./colosseum-payment-intent");

const {
  createSupabasePaymentIntentStore
} = require("./colosseum-supabase-payment-intent-store");

const {
  createSupabaseConsumeOnce
} = require("./colosseum-supabase-consume-store");

const {
  executeAgentCommerce
} = require("./colosseum-agent-commerce");

const {
  executeRegisteredDemoService,
  SERVICE_PATH
} = require("./colosseum-demo-service");

const VERSION = "1.0.0";

const FORBIDDEN_CALLER_FIELDS = [
  "assurance",
  "commerce_verified",
  "commerceVerified",
  "validated",
  "independently_validated",
  "production_evidence",
  "productionEvidence"
];

function fail(
  code,
  message,
  statusCode = 400
) {
  const error = new Error(message || code);
  error.code = code;
  error.statusCode = statusCode;
  throw error;
}

function isObject(value) {
  return !!value &&
    typeof value === "object" &&
    !Array.isArray(value);
}

function requireText(
  value,
  code,
  pattern = null
) {
  const text = String(value || "").trim();

  if (
    !text ||
    (pattern && !pattern.test(text))
  ) {
    fail(code);
  }

  return text;
}

function rejectCallerAssuranceFields(input) {
  if (!isObject(input)) {
    fail(
      "INVALID_HOSTED_AGENT_COMMERCE_INPUT"
    );
  }

  for (const field of FORBIDDEN_CALLER_FIELDS) {
    if (
      Object.prototype.hasOwnProperty.call(
        input,
        field
      )
    ) {
      fail(
        "CALLER_ASSURANCE_ELEVATION_FORBIDDEN"
      );
    }
  }
}

function createEnvEd25519Signer(
  env = process.env
) {
  const encoded = requireText(
    env.SAFEGATE_COLOSSEUM_SIGNING_KEY_B64,
    "COLOSSEUM_SIGNING_KEY_REQUIRED"
  );

  const signerId =
    String(
      env.SAFEGATE_COLOSSEUM_SIGNER_ID ||
      "safegate-colosseum-2026"
    ).trim();

  if (
    !/^[A-Za-z0-9._:-]{1,100}$/.test(
      signerId
    )
  ) {
    fail(
      "INVALID_COLOSSEUM_SIGNER_ID",
      null,
      500
    );
  }

  let privateKey;

  try {
    const pem = Buffer
      .from(encoded, "base64")
      .toString("utf8");

    privateKey =
      crypto.createPrivateKey(pem);

  } catch {
    fail(
      "INVALID_COLOSSEUM_SIGNING_KEY",
      null,
      500
    );
  }

  if (
    privateKey.asymmetricKeyType !==
    "ed25519"
  ) {
    fail(
      "UNSUPPORTED_COLOSSEUM_SIGNING_KEY",
      null,
      500
    );
  }

  const publicKey =
    crypto.createPublicKey(privateKey);

  const publicKeyPem =
    publicKey
      .export({
        type: "spki",
        format: "pem"
      })
      .toString();

  return {
    id: signerId,
    scheme: "Ed25519",
    publicKeyPem,
    async sign(bytes) {
      return crypto.sign(
        null,
        Buffer.from(bytes),
        privateKey
      );
    }
  };
}

function httpStatusForError(error) {
  if (
    error &&
    Number.isInteger(error.statusCode)
  ) {
    return error.statusCode;
  }

  const code = String(
    error && error.code
      ? error.code
      : ""
  );

  if (
    code === "PAYMENT_INTENT_NOT_FOUND"
  ) {
    return 404;
  }

  if (
    code === "ALREADY_CONSUMED" ||
    code ===
      "PAYMENT_INTENT_ALREADY_EXISTS" ||
    code ===
      "PAYMENT_INTENT_REQUEST_MISMATCH" ||
    code ===
      "REQUEST_BINDING_MISMATCH"
  ) {
    return 409;
  }

  if (
    code.includes("PAYMENT_NOT_VERIFIED") ||
    code.includes("PAYMENT_INTENT_PAYMENT") ||
    code === "TRANSACTION_NOT_FOUND" ||
    code === "TRANSACTION_FAILED" ||
    code === "USDC_TRANSFER_MISMATCH"
  ) {
    return 402;
  }

  if (
    code.startsWith("BASE_RPC_") ||
    code.includes("STORE_UNAVAILABLE") ||
    code.includes("STORE_TIMEOUT") ||
    code === "UPSTREAM_EXECUTION_FAILED"
  ) {
    return 502;
  }

  if (
    code.includes("SIGNING_KEY") ||
    code.includes("SIGNER_") ||
    code ===
      "SUPABASE_SERVICE_ROLE_KEY_REQUIRED" ||
    code ===
      "SUPABASE_URL_REQUIRED"
  ) {
    return 500;
  }

  return 400;
}

function createHostedAgentCommerceRuntime(
  options = {}
) {
  const env =
    options.env || process.env;

  let intentStore =
    options.intentStore || null;

  let consumeOnce =
    options.consumeOnce || null;

  let signer =
    options.signer || null;

  const now =
    typeof options.now === "function"
      ? options.now
      : undefined;

  const execute =
    typeof options.execute === "function"
      ? options.execute
      : executeRegisteredDemoService;

  function getIntentStore() {
    if (!intentStore) {
      intentStore =
        createSupabasePaymentIntentStore({
          url: env.SUPABASE_URL,
          serviceRoleKey:
            env.SUPABASE_SERVICE_ROLE_KEY
        });
    }

    return intentStore;
  }

  function getConsumeOnce() {
    if (!consumeOnce) {
      consumeOnce =
        createSupabaseConsumeOnce({
          url: env.SUPABASE_URL,
          serviceRoleKey:
            env.SUPABASE_SERVICE_ROLE_KEY
        });
    }

    return consumeOnce;
  }

  function getSigner() {
    if (!signer) {
      signer =
        createEnvEd25519Signer(env);
    }

    return signer;
  }

  async function createIntent(input) {
    rejectCallerAssuranceFields(input);

    const intent =
      createPaymentIntent(
        {
          request: input.request,
          payment: input.payment
        },
        {
          createdAt:
            now ? now() : undefined,
          ttlSeconds:
            input.ttl_seconds ??
            input.ttlSeconds
        }
      );

    const created =
      await getIntentStore()
        .createOnce(intent);

    if (created !== true) {
      fail(
        "PAYMENT_INTENT_ALREADY_EXISTS",
        "A payment intent already exists for this request.",
        409
      );
    }

    return {
      ok: true,
      capability:
        "safegate_hosted_agent_commerce_intent",
      version: VERSION,
      service_path: SERVICE_PATH,
      intent
    };
  }

  async function executeIntent(input) {
    rejectCallerAssuranceFields(input);

    const intentId =
      requireText(
        input.intent_id ??
        input.intentId,
        "PAYMENT_INTENT_ID_REQUIRED",
        /^SG-COL-INTENT-[A-F0-9]{32}$/
      );

    const transactionHash =
      requireText(
        input.transaction_hash ??
        input.transactionHash,
        "TRANSACTION_HASH_REQUIRED",
        /^0x[a-fA-F0-9]{64}$/
      ).toLowerCase();

    const storedIntent =
      await getIntentStore()
        .get(intentId);

    if (!storedIntent) {
      fail(
        "PAYMENT_INTENT_NOT_FOUND",
        "The payment intent does not exist.",
        404
      );
    }

    const request = input.request;

    const verificationDependencies = {
      now
    };

    if (
      typeof options.verifyTransfer ===
      "function"
    ) {
      verificationDependencies
        .verifyTransfer =
          options.verifyTransfer;
    }

    verificationDependencies
      .verifyOptions = {
        rpcUrl:
          env.BASE_RPC_URL ||
          undefined
      };

    const result =
      await executeAgentCommerce(
        {
          request,
          proof: {
            payment_intent_id:
              intentId,
            transaction_hash:
              transactionHash
          }
        },
        {
          verifyPayment:
            async () =>
              verifyIntentBoundBasePayment(
                {
                  intent:
                    storedIntent,
                  request,
                  transactionHash
                },
                verificationDependencies
              ),

          consumeOnce:
            getConsumeOnce(),

          execute,

          signer:
            getSigner(),

          now
        }
      );

    return {
      ...result,
      payment_intent_id:
        intentId
    };
  }

  return {
    createIntent,
    executeIntent
  };
}

module.exports = {
  VERSION,
  FORBIDDEN_CALLER_FIELDS,
  rejectCallerAssuranceFields,
  createEnvEd25519Signer,
  httpStatusForError,
  createHostedAgentCommerceRuntime
};