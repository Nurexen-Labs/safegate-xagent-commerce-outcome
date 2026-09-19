"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const {
  createNsgoodsPrepaymentEvidence
} = require("../lib/nsgoods-proof-evidence");

async function main() {
  const response = await fetch(
    "https://sanctions.nsgoods.org/screen-multi/preview"
  );

  assert.equal(response.ok, true);

  const raw = await response.text();
  const preview = JSON.parse(raw);

  const evidence = await createNsgoodsPrepaymentEvidence({
    rawResponse: raw,
    expectedPayTo: preview.address,
    allowPreview: true
  });

  assert.equal(
    evidence.schema,
    "SAFEGATE_NSGOODS_PREPAYMENT_EVIDENCE_V1"
  );

  assert.equal(evidence.provider, "nsgoods");
  assert.equal(evidence.stage, "PRE_PAYMENT");
  assert.equal(
    evidence.subject.screened_address.toLowerCase(),
    preview.address.toLowerCase()
  );

  console.log("NSGOODS_EVIDENCE_MAPPING=PASS");

  assert.equal(evidence.provenance.signature_verified, true);
  assert.equal(
    evidence.provenance.manifest_scope_verified,
    true
  );

  const expectedHash = crypto
    .createHash("sha256")
    .update(raw, "utf8")
    .digest("hex");

  assert.equal(
    evidence.provenance.raw_response_sha256,
    expectedHash
  );

  assert.equal(evidence.provenance.raw_response, raw);

  console.log("NSGOODS_EVIDENCE_PROVENANCE=PASS");

  assert.equal(evidence.assurance, "TEST_ONLY");
  assert.equal(evidence.boundaries.preview_only, true);
  assert.equal(evidence.boundaries.freshness_assessed, false);
  assert.equal(evidence.boundaries.payment_authorized, false);
  assert.equal(evidence.boundaries.payment_verified, false);
  assert.equal(evidence.boundaries.request_binding, "NOT_BOUND");
  assert.equal(
    evidence.boundaries.post_payment_outcome_observed,
    false
  );
  assert.equal(evidence.boundaries.commerce_verified, false);

  console.log("NSGOODS_ASSURANCE_BOUNDARY=PASS");

  await assert.rejects(
    createNsgoodsPrepaymentEvidence({
      rawResponse: raw,
      expectedPayTo:
        "0x0000000000000000000000000000000000000001",
      allowPreview: true
    }),
    { code: "NSGOODS_PAYTO_BINDING_MISMATCH" }
  );

  console.log("NSGOODS_EVIDENCE_BINDING=PASS");
  console.log("NSGOODS_PROOF_EVIDENCE_TEST=PASS");
}

main().catch(error => {
  console.log("NSGOODS_PROOF_EVIDENCE_TEST=FAIL");
  console.log(error.code || error.message);
  process.exitCode = 1;
});
