"use strict";

const crypto = require("node:crypto");
const { canonicalJson } = require("./canonical-json");
const {
  executeObservedCommerce
} = require("./commerce-middleware");

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
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
    .update(String(value), "utf8")
    .digest("hex");
}

function verifyBoundPrePaymentEvidence(evidence, requestId) {
  if (!isObject(evidence)) {
    fail("INVALID_PREPAYMENT_EVIDENCE");
  }

  if (
    evidence.schema !==
      "SAFEGATE_402SIGNAL_PREPAYMENT_EVIDENCE_V1" ||
    evidence.stage !== "PRE_PAYMENT" ||
    evidence.decision !== "ALLOW"
  ) {
    fail("INVALID_PREPAYMENT_EVIDENCE");
  }

  if (
    !isObject(evidence.provenance) ||
    evidence.provenance.provider !== "402Signal" ||
    evidence.provenance.assurance !== "THIRD_PARTY_ATTESTED"
  ) {
    fail("INVALID_PREPAYMENT_PROVENANCE");
  }

  const binding = evidence.safegate_request_binding;

  if (!isObject(binding)) {
    fail("PREPAYMENT_REQUEST_NOT_BOUND");
  }

  if (binding.request_id !== requestId) {
    fail("PREPAYMENT_REQUEST_BINDING_MISMATCH");
  }

  const expectedBindingHash = sha256(
    canonicalJson({
      request_id: binding.request_id,
      evidence_id: evidence.evidence_id,
      quote_sha256: evidence.route_binding.quote_sha256,
      request: evidence.route_binding.request,
      accepted_sha256: evidence.route_binding.accepted_sha256
    })
  );

  if (binding.binding_sha256 !== expectedBindingHash) {
    fail("PREPAYMENT_BINDING_TAMPERED");
  }

  return true;
}

async function execute402SignalObservedLifecycle(input, options = {}) {
  if (!isObject(input)) {
    fail("INVALID_LIFECYCLE_INPUT");
  }

  if (!isObject(input.request)) {
    fail("INVALID_LIFECYCLE_REQUEST");
  }

  const requestId = String(
    input.request.requestId || ""
  ).trim();

  if (!requestId) {
    fail("REQUEST_ID_REQUIRED");
  }

  verifyBoundPrePaymentEvidence(
    input.prepaymentEvidence,
    requestId
  );

  const observed = await executeObservedCommerce(
    {
      request: input.request,
      proof: input.paymentProof
    },
    {
      verifyPayment: options.verifyPayment,
      consumeOnce: options.consumeOnce,
      execute: options.execute,
      now: options.now
    }
  );

  return {
    ok: true,
    schema: "SAFEGATE_402SIGNAL_COMMERCE_LIFECYCLE_V1",
    version: "1.0.0",

    request_id: requestId,

    pre_payment: {
      provider: "402Signal",
      decision: "ALLOW",
      assurance: "THIRD_PARTY_ATTESTED",
      evidence_id:
        input.prepaymentEvidence.evidence_id,
      quote_sha256:
        input.prepaymentEvidence.route_binding.quote_sha256
    },

    payment: {
      status:
        observed.evidence.payment.status,
      chain_id:
        observed.evidence.payment.chain_id,
      asset:
        observed.evidence.payment.asset,
      transaction_hash:
        observed.evidence.payment.transaction_hash,
      request_binding: "VALID",
      replay_status:
        observed.evidence.replay_safety.consume_status
    },

    post_payment: {
      assurance: "OBSERVED",
      execution_outcome:
        observed.evidence.execution.outcome,
      response_status:
        observed.evidence.execution.response_status,
      response_hash:
        observed.evidence.execution.response_hash
    },

    assurance: {
      pre_payment: "THIRD_PARTY_ATTESTED",
      post_payment: "OBSERVED",
      independently_validated: false
    },

    commerce_state: {
      payment_bound: true,
      outcome_observed: true,

      /*
       * Synthetic payment in this Stage 4 test.
       * Do not promote this lifecycle to COMMERCE_VERIFIED.
       */
      commerce_verified: false,
      commerce_proof_created: false
    },

    observed_evidence:
      observed.evidence
  };
}

module.exports = {
  verifyBoundPrePaymentEvidence,
  execute402SignalObservedLifecycle
};