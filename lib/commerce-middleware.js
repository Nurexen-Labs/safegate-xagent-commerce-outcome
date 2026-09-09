"use strict";

const crypto = require("crypto");
const { canonicalJson } = require("./canonical-json");

const VERSION = "1.0.0";
const EVIDENCE_SCHEMA = "SAFEGATE_OBSERVED_COMMERCE_V1";

function makeError(code, message, statusCode = 400, evidence = null) {
  const error = new Error(message || code);
  error.code = code;
  error.statusCode = statusCode;

  if (evidence) {
    error.safegateEvidence = evidence;
  }

  return error;
}

function fail(code, message, statusCode = 400, evidence = null) {
  throw makeError(
    code,
    message,
    statusCode,
    evidence
  );
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

function requireString(value, code, pattern = null) {
  const text = String(value || "").trim();

  if (
    !text ||
    (pattern && !pattern.test(text))
  ) {
    fail(
      code,
      "Invalid or missing middleware field."
    );
  }

  return text;
}

function normalizeRequest(request) {
  if (!isObject(request)) {
    fail(
      "INVALID_MIDDLEWARE_REQUEST",
      "request must be an object."
    );
  }

  const requestId = requireString(
    request.requestId,
    "INVALID_REQUEST_ID",
    /^SG-EVM-REQ-[A-Z0-9-]{12,80}$/
  );

  const method = requireString(
    request.method,
    "INVALID_REQUEST_METHOD",
    /^(GET|POST|PUT|PATCH|DELETE)$/i
  ).toUpperCase();

  const path = requireString(
    request.path,
    "INVALID_REQUEST_PATH",
    /^\/[A-Za-z0-9._~!$&'()*+,;=:@%\/-]{0,500}$/
  );

  const body =
    request.body === undefined
      ? null
      : request.body;

  const bodyHash = sha256(
    canonicalJson(body)
  );

  const requestDescriptor = {
    request_id: requestId,
    method,
    path,
    body_hash: bodyHash
  };

  return {
    requestId,
    method,
    path,
    body,
    requestHash: sha256(
      canonicalJson(requestDescriptor)
    )
  };
}

function normalizeVerification(result) {
  if (
    !isObject(result) ||
    result.ok !== true
  ) {
    fail(
      "PAYMENT_VERIFICATION_FAILED",
      "Payment verification did not succeed.",
      402
    );
  }

  const verification =
    isObject(result.verification)
      ? result.verification
      : result;

  const paymentStatus = String(
    verification.payment_status || ""
  ).toUpperCase();

  if (paymentStatus !== "PAYMENT_VERIFIED") {
    fail(
      "PAYMENT_NOT_VERIFIED",
      "Verified payment evidence is required.",
      402
    );
  }

  const requestId = requireString(
    verification.request_id,
    "VERIFIED_REQUEST_ID_REQUIRED"
  );

  const transactionHash = requireString(
    verification.transaction_hash,
    "VERIFIED_TRANSACTION_HASH_REQUIRED",
    /^0x[a-fA-F0-9]{64}$/
  ).toLowerCase();

  const chainId = Number(
    verification.chain_id
  );

  if (
    !Number.isInteger(chainId) ||
    chainId <= 0
  ) {
    fail(
      "VERIFIED_CHAIN_ID_REQUIRED",
      "Verified chain ID is required."
    );
  }

  const asset = requireString(
    verification.asset,
    "VERIFIED_ASSET_REQUIRED"
  ).toUpperCase();

  return {
    requestId,
    transactionHash,
    chainId,
    asset,
    paymentStatus
  };
}

function buildConsumeKey(payment) {
  return sha256(
    [
      "SAFEGATE_CONSUME_V1",
      payment.chainId,
      payment.transactionHash
    ].join("|")
  );
}

function buildEvidence({
  request,
  payment,
  consumeKey,
  outcome,
  responseStatus,
  responseHash,
  startedAt,
  completedAt
}) {
  return {
    schema: EVIDENCE_SCHEMA,
    version: VERSION,

    assurance: {
      level: "OBSERVED",
      independently_validated: false,
      limitation:
        "SafeGate middleware observed execution in-process. OBSERVED does not imply independent validation."
    },

    binding: {
      request_id: request.requestId,
      request_hash: request.requestHash,
      payment_request_binding: "VALID"
    },

    payment: {
      status: payment.paymentStatus,
      chain_id: payment.chainId,
      asset: payment.asset,
      transaction_hash: payment.transactionHash
    },

    replay_safety: {
      consume_status: "CONSUMED",
      consume_key: consumeKey,
      durability:
        "PROVIDED_BY_INTEGRATOR_CONSUME_ONCE"
    },

    execution: {
      outcome,
      response_status: responseStatus,
      response_hash: responseHash
    },

    observation: {
      started_at: startedAt,
      completed_at: completedAt
    }
  };
}

async function executeObservedCommerce(
  input,
  options = {}
) {
  if (!isObject(input)) {
    fail(
      "INVALID_MIDDLEWARE_INPUT",
      "Middleware input must be an object."
    );
  }

  const verifyPayment =
    options.verifyPayment;

  const consumeOnce =
    options.consumeOnce;

  const execute =
    options.execute;

  const now =
    typeof options.now === "function"
      ? options.now
      : () => new Date().toISOString();

  if (typeof verifyPayment !== "function") {
    fail(
      "VERIFY_PAYMENT_CALLBACK_REQUIRED",
      "verifyPayment callback is required.",
      500
    );
  }

  if (typeof consumeOnce !== "function") {
    fail(
      "DURABLE_CONSUME_CALLBACK_REQUIRED",
      "A durable consumeOnce callback is required.",
      500
    );
  }

  if (typeof execute !== "function") {
    fail(
      "EXECUTE_CALLBACK_REQUIRED",
      "execute callback is required.",
      500
    );
  }

  const request =
    normalizeRequest(input.request);

  const verifiedResult =
    await verifyPayment(input.proof);

  const payment =
    normalizeVerification(
      verifiedResult
    );

  if (
    payment.requestId !==
    request.requestId
  ) {
    fail(
      "REQUEST_BINDING_MISMATCH",
      "Verified payment proof is bound to a different request.",
      409
    );
  }

  const consumeKey =
    buildConsumeKey(payment);

  const consumed =
    await consumeOnce({
      consumeKey,
      requestId: request.requestId,
      requestHash: request.requestHash,
      chainId: payment.chainId,
      transactionHash:
        payment.transactionHash
    });

  if (consumed !== true) {
    fail(
      "ALREADY_CONSUMED",
      "This verified payment has already been consumed.",
      409
    );
  }

  const startedAt = now();

  try {
    const response =
      await execute({
        requestId: request.requestId,
        method: request.method,
        path: request.path,
        body: request.body
      });

    if (!isObject(response)) {
      fail(
        "INVALID_EXECUTION_RESPONSE",
        "Execution callback must return an object.",
        502
      );
    }

    const statusCode = Number(
      response.statusCode
    );

    if (
      !Number.isInteger(statusCode) ||
      statusCode < 100 ||
      statusCode > 599
    ) {
      fail(
        "INVALID_EXECUTION_STATUS",
        "Execution response statusCode is invalid.",
        502
      );
    }

    const responseBody =
      response.body === undefined
        ? null
        : response.body;

    const responseHash =
      sha256(
        canonicalJson(
          responseBody
        )
      );

    const completedAt = now();

    const evidence =
      buildEvidence({
        request,
        payment,
        consumeKey,
        outcome:
          statusCode >= 200 &&
          statusCode < 400
            ? "EXECUTION_COMPLETED"
            : "EXECUTION_RETURNED_ERROR",
        responseStatus: statusCode,
        responseHash,
        startedAt,
        completedAt
      });

    return {
      ok: true,
      capability:
        "safegate_observed_middleware",
      version: VERSION,
      assurance_level: "OBSERVED",
      commerce_verified: false,
      response: {
        statusCode,
        body: responseBody
      },
      evidence
    };

  } catch (cause) {
    if (
      cause &&
      cause.code &&
      String(cause.code).startsWith(
        "INVALID_EXECUTION_"
      )
    ) {
      throw cause;
    }

    const completedAt = now();

    const failureDescriptor = {
      error_code: String(
        cause && cause.code
          ? cause.code
          : "UPSTREAM_ERROR"
      )
    };

    const evidence =
      buildEvidence({
        request,
        payment,
        consumeKey,
        outcome:
          "EXECUTION_FAILED",
        responseStatus: 502,
        responseHash:
          sha256(
            canonicalJson(
              failureDescriptor
            )
          ),
        startedAt,
        completedAt
      });

    throw makeError(
      "UPSTREAM_EXECUTION_FAILED",
      "Observed upstream execution failed.",
      502,
      evidence
    );
  }
}

function describeMiddleware() {
  return {
    ok: true,
    capability:
      "safegate_observed_middleware",
    version: VERSION,
    mode:
      "SERVER_SIDE_EMBEDDED",
    assurance:
      "OBSERVED",
    side_effects:
      "execution occurs only inside the integrator-provided handler",
    requires: [
      "verifyPayment callback",
      "durable consumeOnce callback",
      "execute callback"
    ],
    guarantees: [
      "payment-to-request binding",
      "payment-level single-consume hook",
      "request hashing",
      "response hashing",
      "actual handler outcome observation"
    ],
    boundaries: {
      arbitrary_url_proxy: false,
      custody: false,
      payment_processing: false,
      independent_validation: false
    },
    next_proxy_mode:
      "REGISTERED_UPSTREAM_ONLY"
  };
}

module.exports = {
  VERSION,
  EVIDENCE_SCHEMA,
  normalizeRequest,
  normalizeVerification,
  buildConsumeKey,
  describeMiddleware,
  executeObservedCommerce
};