"use strict";

const crypto = require("node:crypto");

const {
  canonicalJson
} = require("./canonical-json");

const {
  executeObservedCommerce
} = require("./commerce-middleware");

const {
  BASE_CHAIN_ID,
  BASE_USDC
} = require("./base-usdc");


const VERSION =
  "1.0.0";

const CAPABILITY =
  "safegate_base_agent_commerce";

const PAYLOAD_SCHEMA =
  "SAFEGATE_AGENT_COMMERCE_PROOF_V1";

const STATEMENT_SCHEMA =
  "SAFEGATE_AGENT_COMMERCE_SIGNING_STATEMENT_V1";

const ENVELOPE_SCHEMA =
  "SAFEGATE_SIGNED_AGENT_COMMERCE_PROOF_V1";

const DOMAIN =
  "safegate.agent-commerce.v1";


function fail(code, message) {
  const error =
    new Error(message || code);

  error.code =
    code;

  throw error;
}


function isObject(value) {
  return !!value &&
    typeof value === "object" &&
    !Array.isArray(value);
}


function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(
      Buffer.from(
        String(value),
        "utf8"
      )
    )
    .digest("hex");
}


function sha256Canonical(value) {
  return sha256(
    canonicalJson(value)
  );
}


function rejectCallerAssuranceElevation(input) {
  if (!isObject(input)) {
    fail(
      "INVALID_AGENT_COMMERCE_INPUT"
    );
  }

  const forbidden = [
    "assurance",
    "commerce_verified",
    "commerceVerified",
    "validated",
    "independently_validated",
    "production_evidence",
    "productionEvidence"
  ];

  for (const field of forbidden) {
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


function requireText(
  value,
  code,
  pattern = null
) {
  const text =
    String(value || "").trim();

  if (
    !text ||
    (
      pattern &&
      !pattern.test(text)
    )
  ) {
    fail(code);
  }

  return text;
}


function normalizeRawVerification(result) {
  if (
    !isObject(result) ||
    result.ok !== true
  ) {
    fail(
      "PAYMENT_VERIFICATION_FAILED"
    );
  }

  const verification =
    isObject(result.verification)
      ? result.verification
      : result;

  const paymentStatus =
    String(
      verification.payment_status || ""
    ).toUpperCase();

  if (
    paymentStatus !==
    "PAYMENT_VERIFIED"
  ) {
    fail(
      "PAYMENT_NOT_VERIFIED"
    );
  }

  const requestId =
    requireText(
      verification.request_id,
      "VERIFIED_REQUEST_ID_REQUIRED"
    );

  const transactionHash =
    requireText(
      verification.transaction_hash,
      "VERIFIED_TRANSACTION_HASH_REQUIRED",
      /^0x[a-fA-F0-9]{64}$/
    ).toLowerCase();

  const chainId =
    Number(
      verification.chain_id
    );

  if (
    chainId !==
    BASE_CHAIN_ID
  ) {
    fail(
      "UNSUPPORTED_COLOSSEUM_CHAIN"
    );
  }

  const asset =
    String(
      verification.asset || ""
    ).trim().toUpperCase();

  if (
    asset !== "USDC"
  ) {
    fail(
      "UNSUPPORTED_COLOSSEUM_ASSET"
    );
  }

  const paymentSender =
    requireText(
      verification.payment_sender,
      "VERIFIED_PAYMENT_SENDER_REQUIRED",
      /^0x[a-fA-F0-9]{40}$/
    ).toLowerCase();

  const merchantReceiver =
    requireText(
      verification.merchant_receiver,
      "VERIFIED_MERCHANT_RECEIVER_REQUIRED",
      /^0x[a-fA-F0-9]{40}$/
    ).toLowerCase();

  const amountBaseUnits =
    requireText(
      verification.amount_base_units,
      "VERIFIED_AMOUNT_REQUIRED",
      /^[0-9]+$/
    );

  if (
    BigInt(amountBaseUnits) <= 0n
  ) {
    fail(
      "VERIFIED_AMOUNT_INVALID"
    );
  }

  const tokenContract =
    requireText(
      verification.token_contract,
      "VERIFIED_TOKEN_CONTRACT_REQUIRED",
      /^0x[a-fA-F0-9]{40}$/
    ).toLowerCase();

  if (
    tokenContract !==
    BASE_USDC
  ) {
    fail(
      "UNEXPECTED_BASE_USDC_CONTRACT"
    );
  }

  const blockNumber =
    Number(
      verification.block_number
    );

  if (
    !Number.isInteger(blockNumber) ||
    blockNumber < 0
  ) {
    fail(
      "VERIFIED_BLOCK_NUMBER_REQUIRED"
    );
  }

  return {
    paymentStatus,
    requestId,
    transactionHash,
    chainId,
    asset,
    paymentSender,
    merchantReceiver,
    amountBaseUnits,
    tokenContract,
    blockNumber
  };
}


function fingerprintPublicKey(
  publicKeyPem
) {
  let key;

  try {
    key =
      crypto.createPublicKey(
        String(publicKeyPem || "")
      );
  } catch {
    fail(
      "INVALID_AGENT_COMMERCE_PUBLIC_KEY"
    );
  }

  if (
    key.asymmetricKeyType !==
    "ed25519"
  ) {
    fail(
      "UNSUPPORTED_AGENT_COMMERCE_KEY_TYPE"
    );
  }

  const der =
    key.export({
      type: "spki",
      format: "der"
    });

  return crypto
    .createHash("sha256")
    .update(der)
    .digest("hex");
}


function normalizeSigner(
  provider
) {
  if (!isObject(provider)) {
    fail(
      "AGENT_COMMERCE_SIGNER_REQUIRED"
    );
  }

  const forbidden = [
    "privateKey",
    "privateKeyPem",
    "seed",
    "mnemonic",
    "secret"
  ];

  for (const field of forbidden) {
    if (
      Object.prototype.hasOwnProperty.call(
        provider,
        field
      )
    ) {
      fail(
        "RAW_PRIVATE_KEY_FORBIDDEN"
      );
    }
  }

  const id =
    requireText(
      provider.id,
      "AGENT_COMMERCE_SIGNER_ID_REQUIRED",
      /^[A-Za-z0-9._:-]{1,100}$/
    );

  if (
    provider.scheme !==
    "Ed25519"
  ) {
    fail(
      "UNSUPPORTED_AGENT_COMMERCE_SIGNER_SCHEME"
    );
  }

  const publicKeyPem =
    requireText(
      provider.publicKeyPem,
      "AGENT_COMMERCE_PUBLIC_KEY_REQUIRED"
    );

  let publicKey;

  try {
    publicKey =
      crypto.createPublicKey(
        publicKeyPem
      );
  } catch {
    fail(
      "INVALID_AGENT_COMMERCE_PUBLIC_KEY"
    );
  }

  if (
    publicKey.asymmetricKeyType !==
    "ed25519"
  ) {
    fail(
      "UNSUPPORTED_AGENT_COMMERCE_KEY_TYPE"
    );
  }

  if (
    typeof provider.sign !==
    "function"
  ) {
    fail(
      "AGENT_COMMERCE_SIGN_CALLBACK_REQUIRED"
    );
  }

  return {
    id,
    scheme: "Ed25519",
    publicKeyPem,
    publicKey,
    fingerprint:
      fingerprintPublicKey(
        publicKeyPem
      ),
    sign:
      provider.sign
  };
}


function createProofPayload(
  observed,
  payment
) {
  if (
    !isObject(observed) ||
    observed.ok !== true ||
    !isObject(observed.evidence)
  ) {
    fail(
      "INVALID_OBSERVED_COMMERCE_RESULT"
    );
  }

  const evidence =
    observed.evidence;

  if (
    evidence.assurance?.level !==
    "OBSERVED"
  ) {
    fail(
      "OBSERVED_ASSURANCE_REQUIRED"
    );
  }

  const identity = {
    request_id:
      evidence.binding.request_id,

    request_hash:
      evidence.binding.request_hash,

    transaction_hash:
      payment.transactionHash,

    response_hash:
      evidence.execution.response_hash,

    consume_key:
      evidence.replay_safety.consume_key
  };

  const proofId =
    "SG-AGENT-PROOF-" +
    sha256Canonical(identity)
      .slice(0, 32)
      .toUpperCase();

  return {
    schema:
      PAYLOAD_SCHEMA,

    version:
      VERSION,

    proof_id:
      proofId,

    issued_at:
      evidence.observation.completed_at,

    request: {
      request_id:
        evidence.binding.request_id,

      request_hash:
        evidence.binding.request_hash,

      payment_request_binding:
        "VALID"
    },

    payment: {
      status:
        payment.paymentStatus,

      chain_id:
        payment.chainId,

      asset:
        payment.asset,

      token_contract:
        payment.tokenContract,

      transaction_hash:
        payment.transactionHash,

      block_number:
        payment.blockNumber,

      payment_sender:
        payment.paymentSender,

      merchant_receiver:
        payment.merchantReceiver,

      amount_base_units:
        payment.amountBaseUnits
    },

    replay_safety: {
      consume_status:
        "CONSUMED",

      consume_key:
        evidence.replay_safety.consume_key,

      durability:
        evidence.replay_safety.durability
    },

    execution: {
      outcome:
        evidence.execution.outcome,

      response_status:
        evidence.execution.response_status,

      response_hash:
        evidence.execution.response_hash
    },

    observation: {
      started_at:
        evidence.observation.started_at,

      completed_at:
        evidence.observation.completed_at
    },

    assurance: {
      level:
        "OBSERVED",

      independently_validated:
        false,

      limitation:
        "SafeGate observed the bound execution path. OBSERVED is not independent validation."
    },

    provenance: {
      payment:
        "VERIFIED_BASE_MAINNET_USDC",

      execution:
        "SAFEGATE_OBSERVED_MIDDLEWARE"
    },

    commerce_verified:
      false
  };
}


function createSigningStatement(
  payload,
  signerId
) {
  const statement = {
    schema:
      STATEMENT_SCHEMA,

    version:
      VERSION,

    domain:
      DOMAIN,

    algorithm:
      "Ed25519",

    key_id:
      signerId,

    payload_schema:
      payload.schema,

    payload_sha256:
      sha256Canonical(
        payload
      ),

    proof_id:
      payload.proof_id,

    issued_at:
      payload.issued_at
  };

  return {
    statement,

    bytes:
      Buffer.from(
        canonicalJson(statement),
        "utf8"
      )
  };
}


async function signProof(
  payload,
  provider
) {
  const signer =
    normalizeSigner(
      provider
    );

  const {
    statement,
    bytes
  } =
    createSigningStatement(
      payload,
      signer.id
    );

  const rawSignature =
    await signer.sign(
      bytes
    );

  if (
    !Buffer.isBuffer(rawSignature) &&
    !(
      rawSignature instanceof
      Uint8Array
    )
  ) {
    fail(
      "INVALID_AGENT_COMMERCE_SIGNATURE"
    );
  }

  const signature =
    Buffer.from(
      rawSignature
    );

  if (!signature.length) {
    fail(
      "INVALID_AGENT_COMMERCE_SIGNATURE"
    );
  }

  const selfCheck =
    crypto.verify(
      null,
      bytes,
      signer.publicKey,
      signature
    );

  if (!selfCheck) {
    fail(
      "AGENT_COMMERCE_SIGNATURE_SELF_CHECK_FAILED"
    );
  }

  return {
    schema:
      ENVELOPE_SCHEMA,

    version:
      VERSION,

    payload,

    signing_statement:
      statement,

    signer: {
      key_id:
        signer.id,

      scheme:
        signer.scheme,

      trust:
        "CRYPTOGRAPHIC_INTEGRITY_ONLY",

      public_key_sha256:
        signer.fingerprint,

      public_key_pem:
        signer.publicKeyPem
    },

    signature_base64:
      signature.toString(
        "base64"
      )
  };
}


function verifySignedAgentCommerceProof(
  envelope
) {
  if (
    !isObject(envelope) ||
    envelope.schema !==
      ENVELOPE_SCHEMA
  ) {
    fail(
      "INVALID_AGENT_COMMERCE_ENVELOPE"
    );
  }

  const payload =
    envelope.payload;

  if (
    !isObject(payload) ||
    payload.schema !==
      PAYLOAD_SCHEMA
  ) {
    fail(
      "INVALID_AGENT_COMMERCE_PAYLOAD"
    );
  }

  if (
    payload.commerce_verified !==
      false ||
    payload.assurance?.level !==
      "OBSERVED" ||
    payload.assurance
      ?.independently_validated !==
      false
  ) {
    fail(
      "INVALID_AGENT_COMMERCE_ASSURANCE"
    );
  }

  const signer =
    envelope.signer;

  if (
    !isObject(signer) ||
    signer.scheme !==
      "Ed25519"
  ) {
    fail(
      "INVALID_AGENT_COMMERCE_SIGNER"
    );
  }

  let publicKey;

  try {
    publicKey =
      crypto.createPublicKey(
        String(
          signer.public_key_pem || ""
        )
      );
  } catch {
    fail(
      "INVALID_AGENT_COMMERCE_PUBLIC_KEY"
    );
  }

  if (
    publicKey.asymmetricKeyType !==
    "ed25519"
  ) {
    fail(
      "UNSUPPORTED_AGENT_COMMERCE_KEY_TYPE"
    );
  }

  const fingerprint =
    fingerprintPublicKey(
      signer.public_key_pem
    );

  if (
    fingerprint !==
    signer.public_key_sha256
  ) {
    fail(
      "AGENT_COMMERCE_KEY_FINGERPRINT_MISMATCH"
    );
  }

  const expected =
    createSigningStatement(
      payload,
      signer.key_id
    );

  if (
    canonicalJson(
      envelope.signing_statement
    ) !==
    canonicalJson(
      expected.statement
    )
  ) {
    fail(
      "AGENT_COMMERCE_SIGNING_STATEMENT_MISMATCH"
    );
  }

  let signature;

  try {
    signature =
      Buffer.from(
        String(
          envelope.signature_base64 || ""
        ),
        "base64"
      );
  } catch {
    fail(
      "INVALID_AGENT_COMMERCE_SIGNATURE"
    );
  }

  if (
    !signature.length ||
    !crypto.verify(
      null,
      expected.bytes,
      publicKey,
      signature
    )
  ) {
    fail(
      "AGENT_COMMERCE_SIGNATURE_INVALID"
    );
  }

  return {
    ok:
      true,

    proof_id:
      payload.proof_id,

    signature_status:
      "VERIFIED",

    signer_key_id:
      signer.key_id,

    signer_fingerprint_sha256:
      fingerprint,

    signer_trust:
      "CRYPTOGRAPHIC_INTEGRITY_ONLY",

    assurance_level:
      "OBSERVED",

    independently_validated:
      false,

    commerce_verified:
      false
  };
}


async function executeAgentCommerce(
  input,
  dependencies = {}
) {
  rejectCallerAssuranceElevation(
    input
  );

  if (
    typeof dependencies.verifyPayment !==
    "function"
  ) {
    fail(
      "AGENT_COMMERCE_VERIFY_PAYMENT_REQUIRED"
    );
  }

  if (
    typeof dependencies.consumeOnce !==
    "function"
  ) {
    fail(
      "AGENT_COMMERCE_CONSUME_ONCE_REQUIRED"
    );
  }

  if (
    typeof dependencies.execute !==
    "function"
  ) {
    fail(
      "AGENT_COMMERCE_EXECUTE_REQUIRED"
    );
  }

  const rawVerification =
    await dependencies.verifyPayment(
      input.proof
    );

  const payment =
    normalizeRawVerification(
      rawVerification
    );

  const observed =
    await executeObservedCommerce(
      input,
      {
        verifyPayment:
          async () =>
            rawVerification,

        consumeOnce:
          dependencies.consumeOnce,

        execute:
          dependencies.execute,

        now:
          dependencies.now
      }
    );

  const payload =
    createProofPayload(
      observed,
      payment
    );

  const envelope =
    await signProof(
      payload,
      dependencies.signer
    );

  const proofVerification =
    verifySignedAgentCommerceProof(
      envelope
    );

  return {
    ok:
      true,

    capability:
      CAPABILITY,

    version:
      VERSION,

    payment_status:
      payment.paymentStatus,

    request_binding:
      "VALID",

    replay_status:
      "CONSUMED",

    execution_outcome:
      observed.evidence
        .execution
        .outcome,

    assurance_level:
      "OBSERVED",

    independently_validated:
      false,

    commerce_verified:
      false,

    response:
      observed.response,

    commerce_proof:
      envelope,

    proof_verification:
      proofVerification
  };
}


module.exports = {
  VERSION,
  CAPABILITY,
  PAYLOAD_SCHEMA,
  STATEMENT_SCHEMA,
  ENVELOPE_SCHEMA,
  DOMAIN,
  normalizeRawVerification,
  createProofPayload,
  verifySignedAgentCommerceProof,
  executeAgentCommerce
};