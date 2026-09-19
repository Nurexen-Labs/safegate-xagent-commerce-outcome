"use strict";

const crypto = require("node:crypto");

const {
  createNsgoodsPrepaymentEvidence
} = require("./nsgoods-proof-evidence");

const {
  verifySignedAgentCommerceProof
} = require("./colosseum-agent-commerce");

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function hash(value) {
  return crypto
    .createHash("sha256")
    .update(value, "utf8")
    .digest("hex");
}

async function linkNsgoodsCommerce(input) {
  if (!input || typeof input !== "object" ||
      !input.commerceProof ||
      typeof input.requestId !== "string" ||
      !input.requestId.trim()) {
    fail("INVALID_NSGOODS_COMMERCE_LINK_INPUT");
  }

  const proof = input.commerceProof;

  const proofCheck =
    verifySignedAgentCommerceProof(proof);

  if (proofCheck.signature_status !== "VERIFIED") {
    fail("SAFEGATE_PROOF_NOT_VERIFIED");
  }

  const payload = proof.payload;

  if (payload.request?.request_id !== input.requestId) {
    fail("NSGOODS_REQUEST_BINDING_MISMATCH");
  }

  const receiver =
    payload.payment?.merchant_receiver;

  if (typeof receiver !== "string" || !receiver) {
    fail("NSGOODS_PROOF_RECEIVER_REQUIRED");
  }

  const evidence =
    await createNsgoodsPrepaymentEvidence({
      rawResponse: input.rawResponse,
      expectedPayTo: receiver,
      allowPreview: input.allowPreview === true
    });

  const screeningTime =
    Date.parse(evidence.screening.generated_at);

  const proofTime =
    Date.parse(payload.issued_at);

  if (!Number.isFinite(screeningTime) ||
      !Number.isFinite(proofTime) ||
      screeningTime > proofTime) {
    fail("NSGOODS_PREPAYMENT_CHRONOLOGY_INVALID");
  }

  const preview =
    evidence.source_mode === "PREVIEW_TEST_ONLY";

  const verdict =
    evidence.screening.verdict;

  return {
    schema: "SAFEGATE_NSGOODS_COMMERCE_LINK_V1",

    request_id: input.requestId,

    prepayment_evidence: evidence,

    commerce_proof_reference: {
      proof_id: payload.proof_id,
      proof_sha256: hash(JSON.stringify(proof)),
      signature_verified: true,
      signer_trust: "CRYPTOGRAPHIC_INTEGRITY_ONLY"
    },

    binding: {
      request_id_match: true,
      pay_to_match: true,
      prepayment_chronology_valid: true
    },

    screening_decision:
      verdict === "deny"
        ? "DENY_EVIDENCE"
        : "REVIEW_REQUIRED",

    assurance: {
      screening: preview
        ? "TEST_ONLY"
        : "PENDING_SOURCE_AND_FRESHNESS_VERIFICATION",
      commerce: payload.assurance.level,
      independently_validated: false,
      commerce_verified: false
    },

    boundaries: {
      preview_only: preview,
      payment_authorized: false,
      freshness_assessed: false,
      production_ready: false
    },

    note:
      "Unsigned evidence association. Original SafeGate signed CommerceProof remains unchanged."
  };
}

module.exports = {
  linkNsgoodsCommerce
};
