"use strict";

const assert = require("node:assert/strict");

const {
  verifyNsgoodsVerdict
} = require("../lib/nsgoods-signed-verdict-adapter");

const MANIFEST_URL =
  "https://x402.nsgoods.org/proof/index.json";

async function expectCode(input, code) {
  await assert.rejects(
    verifyNsgoodsVerdict(input),
    { code }
  );
}

async function main() {
  const [previewResponse, manifestResponse] = await Promise.all([
    fetch("https://sanctions.nsgoods.org/screen-multi/preview"),
    fetch(MANIFEST_URL)
  ]);

  assert.equal(previewResponse.ok, true);
  assert.equal(manifestResponse.ok, true);

  const raw = await previewResponse.text();
  const preview = JSON.parse(raw);
  const manifest = await manifestResponse.json();

  const originalFetch = global.fetch;
  let activeManifest = manifest;
  let manifestAvailable = true;

  global.fetch = async url => {
    assert.equal(url, MANIFEST_URL);

    return {
      ok: manifestAvailable,
      json: async () => activeManifest
    };
  };

  const validInput = {
    rawResponse: raw,
    expectedPayTo: preview.address,
    allowPreview: true
  };

  try {
    const evidence = await verifyNsgoodsVerdict(validInput);

    assert.equal(evidence.signature_verified, true);
    assert.equal(evidence.manifest_scope_verified, true);
    assert.equal(evidence.feed_health_complete, true);
    assert.equal(evidence.source_mode, "PREVIEW_TEST_ONLY");
    assert.equal(evidence.payment_authorized, false);
    assert.equal(evidence.commerce_verified, false);
    assert.equal(evidence.freshness_assessed, false);

    console.log("NSGOODS_VALID_PREVIEW=PASS");

    await expectCode(
      { ...validInput, allowPreview: false },
      "NSGOODS_PREVIEW_NOT_PRODUCTION_EVIDENCE"
    );

    console.log("NSGOODS_PREVIEW_REJECTION=PASS");

    await expectCode(
      {
        ...validInput,
        expectedPayTo:
          "0x0000000000000000000000000000000000000001"
      },
      "NSGOODS_PAYTO_BINDING_MISMATCH"
    );

    console.log("NSGOODS_WRONG_PAYTO_REJECTION=PASS");

    const tampered = {
      ...preview,
      verdict: preview.verdict === "deny" ? "clean" : "deny"
    };

    await expectCode(
      {
        ...validInput,
        rawResponse: JSON.stringify(tampered)
      },
      "NSGOODS_SIGNER_MISMATCH"
    );

    console.log("NSGOODS_TAMPER_REJECTION=PASS");

    activeManifest = { signers: {} };

    await expectCode(
      validInput,
      "NSGOODS_SIGNER_SCOPE_INVALID"
    );

    console.log("NSGOODS_REVOKED_SIGNER_REJECTION=PASS");

    activeManifest = manifest;
    manifestAvailable = false;

    await expectCode(
      validInput,
      "NSGOODS_MANIFEST_UNAVAILABLE"
    );

    console.log("NSGOODS_MANIFEST_FAILURE_CLOSED=PASS");
    console.log("NSGOODS_PERSISTENT_TEST=PASS");
  } finally {
    global.fetch = originalFetch;
  }
}

main().catch(error => {
  console.log("NSGOODS_PERSISTENT_TEST=FAIL");
  console.log(error.code || error.message);
  process.exitCode = 1;
});
