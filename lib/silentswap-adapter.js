"use strict";

const crypto = require("crypto");

const INPUT_SCHEMA = "SILENTSWAP_ROUTE_EVIDENCE_V1";
const OUTPUT_SCHEMA = "SAFEGATE_SILENTSWAP_ROUTE_EVIDENCE_V1";
const CAPABILITY = "safegate_silentswap_route_adapter";
const VERSION = "1.0.0";

function fail(code, message, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  throw error;
}

function requireString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    fail(
      "INVALID_SILENTSWAP_EVIDENCE",
      `${field} must be a non-empty string`
    );
  }

  return value.trim();
}

function canonicalize(value) {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return (
      "[" +
      value.map((item) => canonicalize(item)).join(",") +
      "]"
    );
  }

  if (typeof value === "object") {
    const keys = Object.keys(value).sort();

    return (
      "{" +
      keys
        .map(
          (key) =>
            JSON.stringify(key) +
            ":" +
            canonicalize(value[key])
        )
        .join(",") +
      "}"
    );
  }

  return JSON.stringify(value);
}

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(value, "utf8")
    .digest("hex");
}

function normalizeLeg(leg) {
  if (!leg) {
    return null;
  }

  return {
    chain: requireString(
      leg.chain,
      "route leg chain"
    ),
    asset: requireString(
      leg.asset,
      "route leg asset"
    ),
    amount: requireString(
      String(leg.amount),
      "route leg amount"
    )
  };
}

function normalizeSilentSwapRouteEvidence(input) {
  if (!input || typeof input !== "object") {
    fail(
      "INVALID_SILENTSWAP_EVIDENCE",
      "route evidence must be an object"
    );
  }

  const schema = requireString(
    input.schema,
    "schema"
  );

  if (schema !== INPUT_SCHEMA) {
    fail(
      "UNSUPPORTED_SILENTSWAP_SCHEMA",
      `expected ${INPUT_SCHEMA}`
    );
  }

  const provider = requireString(
    input.provider,
    "provider"
  ).toUpperCase();

  if (provider !== "SILENTSWAP") {
    fail(
      "UNSUPPORTED_ROUTE_PROVIDER",
      "provider must be SILENTSWAP"
    );
  }

  const orderId = requireString(
    input.order_id,
    "order_id"
  );

  const status = requireString(
    input.status,
    "status"
  ).toUpperCase();

  const requestBinding =
    requireString(
      input.request_binding,
      "request_binding"
    ).toLowerCase();

  const paymentReference =
    requireString(
      input.payment_reference,
      "payment_reference"
    );

  const normalized = {
    schema: INPUT_SCHEMA,
    provider: "SILENTSWAP",
    order_id: orderId,
    status,
    request_binding: requestBinding,
    payment_reference: paymentReference,
    source: normalizeLeg(input.source),
    destination: normalizeLeg(
      input.destination
    )
  };

  if (
    Array.isArray(input.recipients) &&
    input.recipients.length > 0
  ) {
    normalized.recipients =
      input.recipients.map((recipient) => ({
        id: requireString(
          recipient.id,
          "recipient.id"
        ),
        status: requireString(
          recipient.status,
          "recipient.status"
        ).toUpperCase()
      }));
  }

  return normalized;
}

function buildSilentSwapConsumeKey(
  normalizedEvidence
) {
  return sha256(
    [
      "SAFEGATE_SILENTSWAP_CONSUME_V1",
      normalizedEvidence.provider,
      normalizedEvidence.order_id,
      normalizedEvidence.payment_reference
    ].join("|")
  );
}

function buildSilentSwapEvidenceHash(
  normalizedEvidence
) {
  return sha256(
    [
      "SAFEGATE_SILENTSWAP_EVIDENCE_V1",
      canonicalize(normalizedEvidence)
    ].join("|")
  );
}

async function verifySilentSwapRouteEvidence({
  routeEvidence,
  expectedRequestBinding,
  consumeOnce
}) {
  const normalized =
    normalizeSilentSwapRouteEvidence(
      routeEvidence
    );

  const expected =
    requireString(
      expectedRequestBinding,
      "expectedRequestBinding"
    ).toLowerCase();

  if (
    normalized.request_binding !== expected
  ) {
    fail(
      "REQUEST_BINDING_MISMATCH",
      "SilentSwap route evidence is not bound to the expected SafeGate request"
    );
  }

  if (normalized.status !== "COMPLETED") {
    fail(
      "SILENTSWAP_ROUTE_NOT_COMPLETED",
      `SilentSwap route status is ${normalized.status}`
    );
  }

  if (
    normalized.recipients &&
    normalized.recipients.some(
      (recipient) =>
        recipient.status !== "COMPLETED"
    )
  ) {
    fail(
      "SILENTSWAP_RECIPIENT_NOT_COMPLETED",
      "one or more SilentSwap recipients are not completed"
    );
  }

  if (typeof consumeOnce !== "function") {
    fail(
      "INVALID_CONSUME_HOOK",
      "consumeOnce must be a function"
    );
  }

  const consumeKey =
    buildSilentSwapConsumeKey(normalized);

  const consumed = await consumeOnce({
    consumeKey,
    provider: normalized.provider,
    orderId: normalized.order_id,
    paymentReference:
      normalized.payment_reference
  });

  if (consumed === false) {
    fail(
      "ALREADY_CONSUMED",
      "SilentSwap route evidence was already consumed",
      409
    );
  }

  const evidenceHash =
    buildSilentSwapEvidenceHash(normalized);

  return {
    ok: true,

    schema: OUTPUT_SCHEMA,

    capability: CAPABILITY,

    version: VERSION,

    decision:
      "ROUTE_EVIDENCE_ACCEPTED",

    commerce_verified: false,

    assurance: "CLAIMED",

    independently_validated: false,

    route: {
      provider: "SILENTSWAP",

      status:
        "PROVIDER_REPORTED_COMPLETED",

      order_id:
        normalized.order_id,

      payment_reference:
        normalized.payment_reference,

      source:
        normalized.source,

      destination:
        normalized.destination,

      recipients:
        normalized.recipients || null
    },

    binding: {
      status: "VALID",
      request_binding:
        normalized.request_binding
    },

    replay_safety: {
      consume_key: consumeKey,
      consume_status: "CONSUMED"
    },

    evidence: {
      evidence_hash: evidenceHash,
      evidence_class:
        "PROVIDER_ROUTE_EVIDENCE",

      provider:
        "SILENTSWAP",

      provider_outcome:
        "COMPLETED"
    }
  };
}

function getSilentSwapAdapterCapability() {
  return {
    capability: CAPABILITY,
    version: VERSION,
    input_schema: INPUT_SCHEMA,
    output_schema: OUTPUT_SCHEMA,

    security: {
      custody: false,
      routes_funds: false,
      arbitrary_url_proxy: false
    },

    semantics: {
      route_completion:
        "PROVIDER_REPORTED",
      assurance_ceiling:
        "CLAIMED",
      independently_validated:
        false,
      commerce_verified:
        false
    }
  };
}

module.exports = {
  INPUT_SCHEMA,
  OUTPUT_SCHEMA,
  normalizeSilentSwapRouteEvidence,
  buildSilentSwapConsumeKey,
  buildSilentSwapEvidenceHash,
  verifySilentSwapRouteEvidence,
  getSilentSwapAdapterCapability
};
