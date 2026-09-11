"use strict";

const assert = require("node:assert");

const {
  create402SignalPrePaymentEvidence,
  bind402SignalPrePaymentEvidenceToRequest
} = require("../lib/402signal-prepayment-evidence");

const validAction = {
  model: "proof_carrying_route_v1",

  request: {
    url: "https://merchant.example/api",
    method: "GET",
    body_sha256: "a".repeat(64)
  },

  accepted: {
    scheme: "exact",
    network: "eip155:8453",
    amount: "1000",
    asset: "USDC",
    payTo: "0x1111111111111111111111111111111111111111"
  },

  expires_at: 1789160000,

  quote_sha256: "b".repeat(64)
};

const routeRequestJson =
  JSON.stringify({
    need: "synthetic-safe-commerce",
    networks: ["base"],
    require_route_binding: true
  });

const routeResponseJson =
  JSON.stringify({
    synthetic: true,
    selected: true
  });

const evidence =
  create402SignalPrePaymentEvidence({
    verifiedAction: validAction,
    routeRequestJson,
    routeResponseJson,
    sourceMode: "SYNTHETIC"
  });

assert.equal(
  evidence.schema,
  "SAFEGATE_402SIGNAL_PREPAYMENT_EVIDENCE_V1"
);

assert.equal(evidence.stage, "PRE_PAYMENT");
assert.equal(evidence.decision, "ALLOW");

assert.equal(
  evidence.provenance.provider,
  "402Signal"
);

assert.equal(
  evidence.provenance.assurance,
  "THIRD_PARTY_ATTESTED"
);

assert.equal(
  evidence.provenance.independently_validated_by_safegate,
  false
);

assert.equal(
  evidence.commerce_state.payment_bound,
  false
);

assert.equal(
  evidence.commerce_state.outcome_observed,
  false
);

assert.equal(
  evidence.commerce_state.commerce_verified,
  false
);

assert.match(
  evidence.evidence_id,
  /^SG-402-EVID-[A-F0-9]{32}$/
);

assert.match(
  evidence.route_binding.accepted_sha256,
  /^[a-f0-9]{64}$/
);

const bound =
  bind402SignalPrePaymentEvidenceToRequest({
    evidence,
    requestId:
      "SG-AGENT-REQ-402SIGNAL-0001"
  });

assert.equal(
  bound.safegate_request_binding.status,
  "BOUND"
);

assert.equal(
  bound.safegate_request_binding.request_id,
  "SG-AGENT-REQ-402SIGNAL-0001"
);

assert.match(
  bound.safegate_request_binding.binding_sha256,
  /^[a-f0-9]{64}$/
);

assert.equal(
  evidence.provenance.source_mode,
  "SYNTHETIC"
);

assert.throws(
  () =>
    create402SignalPrePaymentEvidence({
      verifiedAction: validAction,
      routeRequestJson,
      routeResponseJson,
      sourceMode: "PRODUCTION"
    }),
  error =>
    error &&
    error.code ===
      "CALLER_PRODUCTION_SOURCE_MODE_FORBIDDEN"
);

assert.throws(
  () =>
    create402SignalPrePaymentEvidence({
      verifiedAction: validAction,
      routeRequestJson,
      routeResponseJson,
      sourceMode: "production"
    }),
  error =>
    error &&
    error.code ===
      "CALLER_PRODUCTION_SOURCE_MODE_FORBIDDEN"
);
assert.throws(
  () =>
    create402SignalPrePaymentEvidence({
      verifiedAction: {
        ...validAction,
        quote_sha256: "bad"
      },
      routeRequestJson,
      routeResponseJson
    }),
  error =>
    error &&
    error.code ===
      "INVALID_402SIGNAL_QUOTE_HASH"
);

assert.throws(
  () =>
    create402SignalPrePaymentEvidence({
      verifiedAction: {
        ...validAction,
        model: "unknown_model"
      },
      routeRequestJson,
      routeResponseJson
    }),
  error =>
    error &&
    error.code ===
      "UNSUPPORTED_402SIGNAL_MODEL"
);

assert.throws(
  () =>
    bind402SignalPrePaymentEvidenceToRequest({
      evidence,
      requestId: "bad"
    }),
  error =>
    error &&
    error.code ===
      "INVALID_SAFEGATE_REQUEST_ID"
);

console.log("402SIGNAL_CORE_EVIDENCE=PASS");
console.log("402SIGNAL_REQUEST_BINDING=PASS");
console.log("ASSURANCE=THIRD_PARTY_ATTESTED");
console.log("INDEPENDENT_VALIDATION=NO");
console.log("PAYMENT_BOUND=NO");
console.log("OUTCOME_OBSERVED=NO");
console.log("COMMERCE_VERIFIED=NO");