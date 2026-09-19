"use strict";

const crypto = require("node:crypto");

const {
  verifyNsgoodsVerdict
} = require("./nsgoods-signed-verdict-adapter");

async function createNsgoodsPrepaymentEvidence(input) {
  const verified = await verifyNsgoodsVerdict(input);

  const response = JSON.parse(input.rawResponse);

  const isPreview =
    verified.source_mode === "PREVIEW_TEST_ONLY";

  const evidenceId = crypto
    .createHash("sha256")
    .update(input.rawResponse, "utf8")
    .digest("hex");

  return {
    schema: "SAFEGATE_NSGOODS_PREPAYMENT_EVIDENCE_V1",

    evidence_id: "NSGOODS-" + evidenceId,

    provider: "nsgoods",
    service: "screen-multi",
    stage: "PRE_PAYMENT",

    evidence_type: "SIGNED_SANCTIONS_SCREENING",

    source_mode: verified.source_mode,

    assurance: isPreview
      ? "TEST_ONLY"
      : "PENDING_SOURCE_AND_FRESHNESS_VERIFICATION",

    subject: {
      screened_address: verified.screened_address,
      chain_hint: response.chain ?? null,
      expected_pay_to: verified.expected_pay_to,
      address_binding_verified: true
    },

    screening: {
      verdict: verified.verdict,
      any_list_match: response.any_list_match ?? null,
      lists: verified.lists,
      list_health: verified.list_health,
      generated_at: verified.generated_at,
      sdn_snapshot_at: verified.sdn_snapshot_at
    },

    provenance: {
      signer: verified.signed_by,
      signature: verified.signature,
      signature_verified: verified.signature_verified,
      manifest_url: verified.manifest_url,
      manifest_scope_verified:
        verified.manifest_scope_verified,
      raw_response_sha256:
        verified.raw_response_sha256,
      raw_response: input.rawResponse
    },

    boundaries: {
      preview_only: isPreview,
      freshness_assessed: false,
      payment_authorized: false,
      payment_verified: false,
      request_binding: "NOT_BOUND",
      post_payment_outcome_observed: false,
      independently_validated: false,
      commerce_verified: false
    }
  };
}

module.exports = {
  createNsgoodsPrepaymentEvidence
};
