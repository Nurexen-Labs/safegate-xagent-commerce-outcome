"use strict";

const crypto = require("node:crypto");

const MANIFEST_URL = "https://x402.nsgoods.org/proof/index.json";
const SERVICE = "screen-multi";

const PREVIEW_ONLY = new Set([
  "preview", "note", "demo_address", "demo_note", "input_ignored"
]);

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function canonical(value) {
  const sort = v =>
    Array.isArray(v) ? v.map(sort) :
    v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v).sort().map(k => [k, sort(v[k])])
        )
      : v;

  return JSON.stringify(sort(value)).replace(
    /[\u007f-\uffff]/g,
    c => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0")
  );
}

function addressMatches(actual, expected) {
  if (typeof actual !== "string" ||
      typeof expected !== "string" ||
      !actual || !expected) {
    return false;
  }

  const evm = /^0x[0-9a-fA-F]{40}$/;

  if (evm.test(actual) && evm.test(expected)) {
    return actual.toLowerCase() === expected.toLowerCase();
  }

  return actual === expected;
}

async function verifyNsgoodsVerdict(input) {
  if (!input || typeof input !== "object" ||
      typeof input.rawResponse !== "string" ||
      typeof input.expectedPayTo !== "string") {
    fail("INVALID_NSGOODS_INPUT");
  }

  const { verifyMessage } = require("ethers");

  let response;

  try {
    response = JSON.parse(input.rawResponse);
  } catch {
    fail("INVALID_NSGOODS_JSON");
  }

  if (!response || typeof response !== "object" ||
      Array.isArray(response)) {
    fail("INVALID_NSGOODS_RESPONSE");
  }

  const isPreview = Object.keys(response)
    .some(key => PREVIEW_ONLY.has(key));

  if (isPreview && input.allowPreview !== true) {
    fail("NSGOODS_PREVIEW_NOT_PRODUCTION_EVIDENCE");
  }

  if (!addressMatches(response.address, input.expectedPayTo)) {
    fail("NSGOODS_PAYTO_BINDING_MISMATCH");
  }

  if (!["deny", "clean", "indeterminate_ofac_unavailable"]
      .includes(response.verdict)) {
    fail("INVALID_NSGOODS_VERDICT");
  }

  if (typeof response.signature !== "string" ||
      typeof response.signed_by !== "string") {
    fail("INVALID_NSGOODS_SIGNATURE");
  }

  const body = Object.fromEntries(
    Object.entries(response).filter(
      ([key]) =>
        key !== "signature" &&
        key !== "signed_by" &&
        !PREVIEW_ONLY.has(key)
    )
  );

  let recovered;

  try {
    recovered = verifyMessage(
      canonical(body),
      response.signature
    );
  } catch {
    fail("NSGOODS_SIGNATURE_INVALID");
  }

  if (recovered.toLowerCase() !==
      response.signed_by.toLowerCase()) {
    fail("NSGOODS_SIGNER_MISMATCH");
  }

  let manifest;

  try {
    const result = await fetch(MANIFEST_URL, {
      signal: AbortSignal.timeout(10000),
      cache: "no-store"
    });

    if (!result.ok) {
      fail("NSGOODS_MANIFEST_UNAVAILABLE");
    }

    manifest = await result.json();
  } catch {
    fail("NSGOODS_MANIFEST_UNAVAILABLE");
  }

  if (!manifest || typeof manifest.signers !== "object" ||
      !manifest.signers) {
    fail("NSGOODS_MANIFEST_INVALID");
  }

  const signerEntry = Object.entries(manifest.signers)
    .find(([address]) =>
      address.toLowerCase() === recovered.toLowerCase()
    );

  if (!signerEntry ||
      !Array.isArray(signerEntry[1]) ||
      !signerEntry[1].includes(SERVICE)) {
    fail("NSGOODS_SIGNER_SCOPE_INVALID");
  }

  const feedNames = {
    EU: "eu",
    HMT: "hmt",
    OFAC: "ofac_sdn",
    UN: "un"
  };

  const health = response.list_health;
  const sources = response.sources;

  const feedHealthComplete = Object.entries(feedNames)
    .every(([name, source]) =>
      health &&
      health[name] &&
      health[name].available === true &&
      sources &&
      sources[source] === "ok"
    );

  if (response.verdict === "clean" && !feedHealthComplete) {
    fail("NSGOODS_CLEAN_FEED_UNAVAILABLE");
  }

  const snapshotAt = Date.parse(response.sdn_snapshot_at);

  if (!Number.isFinite(snapshotAt)) {
    fail("NSGOODS_SNAPSHOT_DATE_INVALID");
  }

  const issuedAt = Date.parse(response.generated_at);

  if (!Number.isFinite(issuedAt)) {
    fail("NSGOODS_GENERATED_AT_INVALID");
  }

  if (issuedAt > Date.now() + 300000) {
    fail("NSGOODS_FUTURE_VERDICT_REJECTED");
  }

  if (snapshotAt > issuedAt) {
    fail("NSGOODS_SNAPSHOT_CHRONOLOGY_INVALID");
  }

  return {
    schema: "SAFEGATE_NSGOODS_EVIDENCE_V1",
    provider: "nsgoods",
    service: SERVICE,
    stage: "PRE_PAYMENT",
    source_mode: isPreview ? "PREVIEW_TEST_ONLY" : "UNVERIFIED_SOURCE",
    expected_pay_to: input.expectedPayTo,
    screened_address: response.address,
    verdict: response.verdict,
    negative_evidence_only: true,
    payment_authorized: false,
    commerce_verified: false,
    independently_validated: false,
    signature_verified: true,
    manifest_scope_verified: true,
    signed_by: recovered,
    signature: response.signature,
    manifest_url: MANIFEST_URL,
    generated_at: response.generated_at,
    sdn_snapshot_at: response.sdn_snapshot_at ?? null,
    list_health: response.list_health ?? null,
    lists: response.lists ?? null,
    feed_health_complete: feedHealthComplete,
    freshness_assessed: false,
    payment_authorized: false,
    raw_response_sha256: crypto
      .createHash("sha256")
      .update(input.rawResponse, "utf8")
      .digest("hex"),
    raw_response: input.rawResponse
  };
}

module.exports = {
  canonical,
  addressMatches,
  verifyNsgoodsVerdict
};
