"use strict";

const crypto = require("node:crypto");

const {
  verifyCommerceProofEnvelope
} = require("./402signal-commerce-proof");


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


function fingerprintPublicKey(publicKeyPem) {
  let key;

  try {
    key = crypto.createPublicKey(
      String(publicKeyPem || "")
    );
  } catch {
    fail("INVALID_SIGNER_PUBLIC_KEY");
  }

  if (
    key.asymmetricKeyType !== "ed25519"
  ) {
    fail("UNSUPPORTED_SIGNER_KEY_TYPE");
  }

  const der =
    key.export({
      type: "spki",
      format: "der"
    });

  return crypto
    .createHash("sha256")
    .update(der)
    .digest("hex");
}


function normalizeTrustStore(store) {
  if (!isObject(store)) {
    fail("INVALID_TRUST_STORE");
  }

  if (
    store.schema !==
      "SAFEGATE_SIGNER_TRUST_STORE_V1"
  ) {
    fail("UNSUPPORTED_TRUST_STORE");
  }

  if (!isObject(store.signers)) {
    fail("INVALID_TRUST_STORE_SIGNERS");
  }

  return store;
}


function trustedSignerEntry(
  envelope,
  trustStore
) {
  normalizeTrustStore(trustStore);

  if (!isObject(envelope)) {
    fail("INVALID_PROOF_ENVELOPE");
  }

  const signer =
    envelope.signer;

  if (!isObject(signer)) {
    fail("SIGNER_DESCRIPTOR_REQUIRED");
  }

  const signerId =
    String(signer.id || "").trim();

  if (!signerId) {
    fail("SIGNER_ID_REQUIRED");
  }

  const entry =
    trustStore.signers[signerId];

  if (!isObject(entry)) {
    fail("SIGNER_NOT_TRUSTED");
  }

  if (entry.status !== "ACTIVE") {
    fail("SIGNER_NOT_ACTIVE");
  }

  if (entry.scheme !== "Ed25519") {
    fail("UNSUPPORTED_TRUSTED_SIGNER_SCHEME");
  }

  const environment =
    String(entry.environment || "")
      .toUpperCase();

  if (
    ![
      "TEST",
      "STAGING",
      "PRODUCTION"
    ].includes(environment)
  ) {
    fail("INVALID_TRUST_ENVIRONMENT");
  }

  const expectedFingerprint =
    String(
      entry.public_key_sha256 || ""
    ).toLowerCase();

  if (
    !/^[a-f0-9]{64}$/.test(
      expectedFingerprint
    )
  ) {
    fail("INVALID_TRUSTED_KEY_FINGERPRINT");
  }

  const actualFingerprint =
    fingerprintPublicKey(
      signer.public_key_pem
    );

  if (
    actualFingerprint !==
    expectedFingerprint
  ) {
    fail("SIGNER_KEY_PIN_MISMATCH");
  }

  return {
    signerId,
    environment,
    fingerprint:
      actualFingerprint
  };
}


function verifyTrustedCommerceProofEnvelope(
  envelope,
  trustStore
) {
  const trusted =
    trustedSignerEntry(
      envelope,
      trustStore
    );

  /*
   * Key identity is checked against an external pin first.
   * Only then do we accept the cryptographic signature.
   */
  const cryptographic =
    verifyCommerceProofEnvelope(
      envelope
    );

  if (
    envelope.payload?.schema !==
      "SAFEGATE_402SIGNAL_COMMERCE_PROOF_V1"
  ) {
    fail("UNSUPPORTED_COMMERCE_PROOF_PAYLOAD");
  }

  const productionTrust =
    trusted.environment === "PRODUCTION";

  return {
    ok: true,

    proof_id:
      cryptographic.proof_id,

    signature_status:
      "VERIFIED",

    signer_id:
      trusted.signerId,

    signer_scheme:
      "Ed25519",

    signer_fingerprint_sha256:
      trusted.fingerprint,

    signer_trust:
      "PINNED_TRUST_STORE",

    trust_environment:
      trusted.environment,

    production_trust:
      productionTrust,

    production_evidence:
      envelope.payload.production_evidence === true,

    commerce_verified:
      envelope.payload
        ?.commerce_state
        ?.commerce_verified === true
  };
}


module.exports = {
  fingerprintPublicKey,
  verifyTrustedCommerceProofEnvelope
};