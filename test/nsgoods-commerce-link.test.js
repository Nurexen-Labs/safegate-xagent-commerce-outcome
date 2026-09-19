"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const { canonicalJson } = require("../lib/canonical-json");
const { linkNsgoodsCommerce } = require("../lib/nsgoods-commerce-link");

const REQUEST_ID = "SG-NSGOODS-TEST-001";
const WRONG_ADDRESS = "0x0000000000000000000000000000000000000001";

function makeSignedProof(issuedAt, receiver, requestId = REQUEST_ID) {
  const { publicKey, privateKey } =
    crypto.generateKeyPairSync("ed25519");

  const publicKeyPem = publicKey.export({
    type: "spki",
    format: "pem"
  });

  const fingerprint = crypto.createHash("sha256")
    .update(publicKey.export({
      type: "spki",
      format: "der"
    }))
    .digest("hex");

  const payload = {
    schema: "SAFEGATE_AGENT_COMMERCE_PROOF_V1",
    proof_id: "SG-NSGOODS-SYNTHETIC-TEST",
    issued_at: issuedAt,
    request: { request_id: requestId },
    payment: { merchant_receiver: receiver },
    assurance: {
      level: "OBSERVED",
      independently_validated: false
    },
    commerce_verified: false
  };

  const statement = {
    schema: "SAFEGATE_AGENT_COMMERCE_SIGNING_STATEMENT_V1",
    version: "1.0.0",
    domain: "safegate.agent-commerce.v1",
    algorithm: "Ed25519",
    key_id: "nsgoods-local-test",
    payload_schema: payload.schema,
    payload_sha256: crypto.createHash("sha256")
      .update(canonicalJson(payload))
      .digest("hex"),
    proof_id: payload.proof_id,
    issued_at: payload.issued_at
  };

  return {
    schema: "SAFEGATE_SIGNED_AGENT_COMMERCE_PROOF_V1",
    version: "1.0.0",
    payload,
    signing_statement: statement,
    signer: {
      key_id: "nsgoods-local-test",
      scheme: "Ed25519",
      trust: "CRYPTOGRAPHIC_INTEGRITY_ONLY",
      public_key_sha256: fingerprint,
      public_key_pem: publicKeyPem
    },
    signature_base64: crypto.sign(
      null,
      Buffer.from(canonicalJson(statement)),
      privateKey
    ).toString("base64")
  };
}

async function expectReject(input, code) {
  await assert.rejects(
    linkNsgoodsCommerce(input),
    { code }
  );
}

async function main() {
  const response = await fetch(
    "https://sanctions.nsgoods.org/screen-multi/preview"
  );

  assert.equal(response.ok, true);

  const rawResponse = await response.text();
  const preview = JSON.parse(rawResponse);

  const base = {
    rawResponse,
    requestId: REQUEST_ID,
    allowPreview: true,
    commerceProof: makeSignedProof(
      new Date(Date.parse(preview.generated_at) + 2000).toISOString(),
      preview.address
    )
  };

  const linked = await linkNsgoodsCommerce(base);

  assert.equal(linked.binding.request_id_match, true);
  assert.equal(linked.binding.pay_to_match, true);
  assert.equal(linked.binding.prepayment_chronology_valid, true);
  assert.equal(linked.prepayment_evidence.assurance, "TEST_ONLY");
  assert.equal(linked.boundaries.production_ready, false);
  assert.equal(linked.assurance.commerce_verified, false);

  console.log("NSGOODS_COMMERCE_LINK=PASS");

  await expectReject(
    { ...base, requestId: "SG-WRONG-REQUEST" },
    "NSGOODS_REQUEST_BINDING_MISMATCH"
  );

  console.log("NSGOODS_WRONG_REQUEST=PASS");

  await expectReject(
    {
      ...base,
      commerceProof: makeSignedProof(
        new Date(Date.parse(preview.generated_at) + 2000).toISOString(),
        WRONG_ADDRESS
      )
    },
    "NSGOODS_PAYTO_BINDING_MISMATCH"
  );

  console.log("NSGOODS_WRONG_RECEIVER=PASS");

  const tamperedProof = structuredClone(base.commerceProof);
  tamperedProof.payload.request.request_id = "SG-TAMPERED";

  await assert.rejects(
    linkNsgoodsCommerce({
      ...base,
      commerceProof: tamperedProof
    })
  );

  console.log("NSGOODS_TAMPERED_PROOF=PASS");

  await expectReject(
    {
      ...base,
      commerceProof: makeSignedProof(
        new Date(Date.parse(preview.generated_at) - 1000)
          .toISOString(),
        preview.address
      )
    },
    "NSGOODS_PREPAYMENT_CHRONOLOGY_INVALID"
  );

  console.log("NSGOODS_WRONG_CHRONOLOGY=PASS");

  console.log("NSGOODS_COMMERCE_LINK_TEST=PASS");
}

main().catch(error => {
  console.log("NSGOODS_COMMERCE_LINK_TEST=FAIL");
  console.log(error.code || error.message);
  process.exitCode = 1;
});
