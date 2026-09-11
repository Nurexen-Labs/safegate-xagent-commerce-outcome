"use strict";

const { createHash } = require("node:crypto");
const { canonicalJson } = require("./canonical-json");

const HEX64 = /^[a-f0-9]{64}$/i;
const REQUEST_ID_RE = /^SG-[A-Z0-9-]{8,96}$/;

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  throw error;
}

function plainObject(value, code) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    fail(code);
  }

  return value;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (
    value &&
    typeof value === "object" &&
    !Object.isFrozen(value)
  ) {
    Object.freeze(value);

    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }

  return value;
}

function sha256String(value) {
  return createHash("sha256")
    .update(String(value), "utf8")
    .digest("hex");
}

function requireJsonString(value, code) {
  if (typeof value !== "string" || !value.length) {
    fail(code);
  }

  try {
    JSON.parse(value);
  } catch {
    fail(code);
  }

  return value;
}

function normalizeVerifiedAction(action) {
  plainObject(action, "INVALID_402SIGNAL_ACTION");

  if (action.model !== "proof_carrying_route_v1") {
    fail("UNSUPPORTED_402SIGNAL_MODEL");
  }

  const request =
    plainObject(action.request, "INVALID_402SIGNAL_REQUEST");

  if (
    typeof request.url !== "string" ||
    !request.url.startsWith("https://")
  ) {
    fail("INVALID_402SIGNAL_REQUEST_URL");
  }

  if (!["GET", "POST"].includes(request.method)) {
    fail("INVALID_402SIGNAL_REQUEST_METHOD");
  }

  if (
    typeof request.body_sha256 !== "string" ||
    !HEX64.test(request.body_sha256)
  ) {
    fail("INVALID_402SIGNAL_BODY_HASH");
  }

  const accepted =
    plainObject(action.accepted, "INVALID_402SIGNAL_ACCEPTED_TERMS");

  if (!Object.keys(accepted).length) {
    fail("EMPTY_402SIGNAL_ACCEPTED_TERMS");
  }

  if (
    !Number.isSafeInteger(action.expires_at) ||
    action.expires_at <= 0
  ) {
    fail("INVALID_402SIGNAL_EXPIRY");
  }

  if (
    typeof action.quote_sha256 !== "string" ||
    !HEX64.test(action.quote_sha256)
  ) {
    fail("INVALID_402SIGNAL_QUOTE_HASH");
  }

  return {
    model: action.model,
    request: clone(request),
    accepted: clone(accepted),
    expires_at: action.expires_at,
    quote_sha256: action.quote_sha256.toLowerCase()
  };
}

function create402SignalPrePaymentEvidence(input) {
  plainObject(input, "INVALID_INPUT");

  const action =
    normalizeVerifiedAction(input.verifiedAction);

  const routeRequestJson =
    requireJsonString(
      input.routeRequestJson,
      "INVALID_402SIGNAL_ROUTE_REQUEST"
    );

  const routeResponseJson =
    requireJsonString(
      input.routeResponseJson,
      "INVALID_402SIGNAL_ROUTE_RESPONSE"
    );

  const requestedSourceMode =
    input.sourceMode === undefined ||
    input.sourceMode === null
      ? "SYNTHETIC"
      : String(input.sourceMode)
          .trim()
          .toUpperCase();

  /*
   * Production provenance is a trusted-boundary decision.
   * A caller must never self-promote synthetic evidence.
   */
  if (requestedSourceMode !== "SYNTHETIC") {
    fail("CALLER_PRODUCTION_SOURCE_MODE_FORBIDDEN");
  }

  const sourceMode = "SYNTHETIC";

  const acceptedSha256 =
    sha256String(canonicalJson(action.accepted));

  const evidenceIdentity = {
    provider: "402Signal",
    model: action.model,
    request: action.request,
    quote_sha256: action.quote_sha256,
    accepted_sha256: acceptedSha256,
    expires_at: action.expires_at
  };

  const evidenceId =
    "SG-402-EVID-" +
    sha256String(canonicalJson(evidenceIdentity))
      .slice(0, 32)
      .toUpperCase();

  return deepFreeze({
    schema: "SAFEGATE_402SIGNAL_PREPAYMENT_EVIDENCE_V1",
    version: "1.0.0",

    evidence_id: evidenceId,

    stage: "PRE_PAYMENT",
    decision: "ALLOW",

    provenance: {
      provider: "402Signal",
      mechanism: "proof_carrying_route_v1",
      evidence_type: "THIRD_PARTY_ATTESTATION",

      assurance: "THIRD_PARTY_ATTESTED",

      independently_validated_by_safegate: false,
      source_mode: sourceMode
    },

    route_binding: {
      request: action.request,
      accepted: action.accepted,

      expires_at: action.expires_at,
      quote_sha256: action.quote_sha256,

      accepted_sha256: acceptedSha256,

      route_request_sha256:
        sha256String(routeRequestJson),

      route_response_sha256:
        sha256String(routeResponseJson)
    },

    authorization_state: {
      verification_boundary_reached: true,

      wallet_loaded_by_safegate: false,
      signature_created_by_safegate: false,
      payment_authorized_by_safegate: false,
      payment_executed_by_safegate: false
    },

    commerce_state: {
      payment_bound: false,
      outcome_observed: false,
      independently_validated: false,
      commerce_verified: false,
      commerce_proof_created: false
    }
  });
}

function bind402SignalPrePaymentEvidenceToRequest(input) {
  plainObject(input, "INVALID_BINDING_INPUT");

  const evidence =
    plainObject(
      input.evidence,
      "INVALID_PREPAYMENT_EVIDENCE"
    );

  if (
    evidence.schema !==
      "SAFEGATE_402SIGNAL_PREPAYMENT_EVIDENCE_V1" ||
    evidence.stage !== "PRE_PAYMENT" ||
    evidence.decision !== "ALLOW"
  ) {
    fail("INVALID_PREPAYMENT_EVIDENCE");
  }

  const requestId =
    String(input.requestId || "").trim();

  if (!REQUEST_ID_RE.test(requestId)) {
    fail("INVALID_SAFEGATE_REQUEST_ID");
  }

  const bindingInput = {
    request_id: requestId,
    evidence_id: evidence.evidence_id,
    quote_sha256:
      evidence.route_binding.quote_sha256,
    request:
      evidence.route_binding.request,
    accepted_sha256:
      evidence.route_binding.accepted_sha256
  };

  const bindingSha256 =
    sha256String(canonicalJson(bindingInput));

  return deepFreeze({
    ...clone(evidence),

    safegate_request_binding: {
      request_id: requestId,
      binding_sha256: bindingSha256,
      status: "BOUND"
    }
  });
}

module.exports = {
  create402SignalPrePaymentEvidence,
  bind402SignalPrePaymentEvidenceToRequest
};