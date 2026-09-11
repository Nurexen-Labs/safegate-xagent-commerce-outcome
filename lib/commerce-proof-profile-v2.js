"use strict";

const crypto = require("node:crypto");

const {
  canonicalJson
} = require("./canonical-json");

const {
  validateProvider
} = require("./external-commerce-signer");

const {
  fingerprintPublicKey
} = require("./trusted-commerce-signer");


const DOMAIN =
  "safegate.commerce-proof.v2";

const PAYLOAD_SCHEMA =
  "SAFEGATE_COMMERCE_PROOF_V2";

const STATEMENT_SCHEMA =
  "SAFEGATE_COMMERCE_PROOF_SIGNING_STATEMENT_V2";

const ENVELOPE_SCHEMA =
  "SAFEGATE_SIGNED_COMMERCE_PROOF_V2";

/*
 * Intentionally conservative.
 * Signer receives only this small statement,
 * never the entire commerce evidence blob.
 */
const MAX_SIGNING_STATEMENT_BYTES =
  2048;


function fail(code, message) {
  const error =
    new Error(message || code);

  error.code =
    code;

  throw error;
}


function isObject(value) {
  return !!value &&
    typeof value === "object" &&
    !Array.isArray(value);
}


function requireText(
  value,
  code,
  maxLength,
  pattern = null
) {
  const text =
    String(value || "").trim();

  if (
    !text ||
    text.length > maxLength ||
    (
      pattern &&
      !pattern.test(text)
    )
  ) {
    fail(code);
  }

  return text;
}


function sha256Canonical(value) {
  return crypto
    .createHash("sha256")
    .update(
      canonicalJson(value),
      "utf8"
    )
    .digest("hex");
}


function parseIso(value, code) {
  const text =
    String(value || "").trim();

  const time =
    Date.parse(text);

  if (
    !text ||
    !Number.isFinite(time)
  ) {
    fail(code);
  }

  return {
    text:
      new Date(time).toISOString(),

    time
  };
}


function validateLifecycle(lifecycle) {
  if (!isObject(lifecycle)) {
    fail("INVALID_LIFECYCLE");
  }

  if (
    lifecycle.schema !==
      "SAFEGATE_402SIGNAL_COMMERCE_LIFECYCLE_V1"
  ) {
    fail("UNSUPPORTED_LIFECYCLE_SCHEMA");
  }

  if (
    lifecycle.pre_payment?.provider !==
      "402Signal" ||
    lifecycle.pre_payment?.assurance !==
      "THIRD_PARTY_ATTESTED"
  ) {
    fail("INVALID_PREPAYMENT_ASSURANCE");
  }

  if (
    lifecycle.payment?.status !==
      "PAYMENT_VERIFIED" ||
    lifecycle.payment?.request_binding !==
      "VALID" ||
    lifecycle.payment?.replay_status !==
      "CONSUMED"
  ) {
    fail("INVALID_PAYMENT_STATE");
  }

  if (
    lifecycle.post_payment?.assurance !==
      "OBSERVED"
  ) {
    fail("INVALID_POSTPAYMENT_ASSURANCE");
  }

  if (
    lifecycle.commerce_state?.payment_bound !==
      true ||
    lifecycle.commerce_state?.outcome_observed !==
      true
  ) {
    fail("INCOMPLETE_COMMERCE_LIFECYCLE");
  }

  /*
   * Stage 8 remains synthetic/non-production.
   * A caller cannot promote it.
   */
  if (
    lifecycle.commerce_state
      ?.commerce_verified !== false
  ) {
    fail(
      "UNSUPPORTED_VERIFIED_COMMERCE_STATE"
    );
  }

  return lifecycle;
}


function createProofPayloadV2(
  lifecycle,
  options = {}
) {
  validateLifecycle(
    lifecycle
  );

  /*
   * Production classification must eventually
   * come from SafeGate's internal trusted verifier,
   * never from API caller input.
   */
  if (
    Object.prototype.hasOwnProperty.call(
      options,
      "productionEvidence"
    ) ||
    Object.prototype.hasOwnProperty.call(
      options,
      "production_evidence"
    ) ||
    Object.prototype.hasOwnProperty.call(
      options,
      "sourceMode"
    )
  ) {
    fail(
      "CALLER_PRODUCTION_ASSERTION_FORBIDDEN"
    );
  }

  const issued =
    parseIso(
      options.issuedAt,
      "INVALID_ISSUED_AT"
    );

  const ttlSeconds =
    Number(
      options.ttlSeconds === undefined
        ? 120
        : options.ttlSeconds
    );

  if (
    !Number.isInteger(ttlSeconds) ||
    ttlSeconds < 1 ||
    ttlSeconds > 300
  ) {
    fail("INVALID_PROOF_TTL");
  }

  const expiresAt =
    new Date(
      issued.time +
      ttlSeconds * 1000
    ).toISOString();

  const proofIdentity = {
    request_id:
      lifecycle.request_id,

    prepayment_evidence_id:
      lifecycle.pre_payment.evidence_id,

    quote_sha256:
      lifecycle.pre_payment.quote_sha256,

    transaction_hash:
      lifecycle.payment.transaction_hash,

    response_hash:
      lifecycle.post_payment.response_hash
  };

  const proofId =
    "SG-402-PROOF-V2-" +
    sha256Canonical(
      proofIdentity
    )
      .slice(0, 32)
      .toUpperCase();

  return {
    schema:
      PAYLOAD_SCHEMA,

    version:
      "2.0.0",

    proof_id:
      proofId,

    issued_at:
      issued.text,

    expires_at:
      expiresAt,

    evidence_context: {
      mode:
        "SYNTHETIC",

      classification_authority:
        "SAFEGATE_CORE",

      production_evidence:
        false
    },

    request_id:
      lifecycle.request_id,

    pre_payment: {
      provider:
        "402Signal",

      assurance:
        "THIRD_PARTY_ATTESTED",

      evidence_id:
        lifecycle.pre_payment.evidence_id,

      quote_sha256:
        lifecycle.pre_payment.quote_sha256
    },

    payment: {
      status:
        lifecycle.payment.status,

      chain_id:
        lifecycle.payment.chain_id,

      asset:
        lifecycle.payment.asset,

      transaction_hash:
        lifecycle.payment.transaction_hash,

      request_binding:
        lifecycle.payment.request_binding,

      replay_status:
        lifecycle.payment.replay_status,

      evidence_mode:
        "SYNTHETIC"
    },

    post_payment: {
      assurance:
        "OBSERVED",

      execution_outcome:
        lifecycle.post_payment.execution_outcome,

      response_status:
        lifecycle.post_payment.response_status,

      response_hash:
        lifecycle.post_payment.response_hash
    },

    assurance: {
      pre_payment:
        "THIRD_PARTY_ATTESTED",

      post_payment:
        "OBSERVED",

      independently_validated:
        false
    },

    commerce_state: {
      payment_bound:
        true,

      outcome_observed:
        true,

      commerce_verified:
        false
    }
  };
}


function normalizeTrustEntry(
  trustStore,
  keyId,
  context
) {
  if (
    !isObject(trustStore) ||
    trustStore.schema !==
      "SAFEGATE_SIGNER_TRUST_STORE_V2" ||
    !isObject(trustStore.keys)
  ) {
    fail("INVALID_TRUST_STORE_V2");
  }

  const entry =
    trustStore.keys[keyId];

  if (!isObject(entry)) {
    fail("SIGNING_KEY_NOT_TRUSTED");
  }

  if (entry.status !== "ACTIVE") {
    fail("SIGNING_KEY_NOT_ACTIVE");
  }

  if (entry.scheme !== "Ed25519") {
    fail("UNSUPPORTED_TRUSTED_KEY_SCHEME");
  }

  const expectedFingerprint =
    requireText(
      entry.public_key_sha256,
      "INVALID_TRUSTED_KEY_FINGERPRINT",
      64,
      /^[a-f0-9]{64}$/
    );

  const notBefore =
    parseIso(
      entry.not_before,
      "INVALID_KEY_NOT_BEFORE"
    );

  const notAfter =
    parseIso(
      entry.not_after,
      "INVALID_KEY_NOT_AFTER"
    );

  if (
    notAfter.time <=
    notBefore.time
  ) {
    fail("INVALID_KEY_LIFETIME");
  }

  const now =
    context.now;

  if (
    now.time <
    notBefore.time
  ) {
    fail("TRUST_KEY_NOT_YET_VALID");
  }

  if (
    now.time >
    notAfter.time
  ) {
    fail("TRUST_KEY_EXPIRED");
  }

  if (
    entry.revoked_at !== null &&
    entry.revoked_at !== undefined
  ) {
    const revoked =
      parseIso(
        entry.revoked_at,
        "INVALID_KEY_REVOCATION_TIME"
      );

    if (
      now.time >=
      revoked.time
    ) {
      fail("TRUST_KEY_REVOKED");
    }
  }

  if (
    !Array.isArray(
      entry.allowed_purposes
    ) ||
    !entry.allowed_purposes.includes(
      context.purpose
    )
  ) {
    fail("TRUST_PURPOSE_NOT_ALLOWED");
  }

  if (
    !Array.isArray(
      entry.allowed_audiences
    ) ||
    !entry.allowed_audiences.includes(
      context.audience
    )
  ) {
    fail("TRUST_AUDIENCE_NOT_ALLOWED");
  }

  return {
    expectedFingerprint,
    environment:
      requireText(
        entry.environment,
        "INVALID_TRUST_ENVIRONMENT",
        16,
        /^(TEST|STAGING|PRODUCTION)$/
      )
  };
}


function createSigningStatement(
  payload,
  metadata
) {
  if (
    !isObject(payload) ||
    payload.schema !==
      PAYLOAD_SCHEMA
  ) {
    fail("INVALID_V2_PAYLOAD");
  }

  const issuer =
    requireText(
      metadata.issuer,
      "INVALID_ISSUER",
      80,
      /^[A-Za-z0-9._:-]+$/
    );

  const audience =
    requireText(
      metadata.audience,
      "INVALID_AUDIENCE",
      120,
      /^[A-Za-z0-9._:/-]+$/
    );

  const purpose =
    requireText(
      metadata.purpose,
      "INVALID_PURPOSE",
      80,
      /^[A-Za-z0-9._:-]+$/
    );

  const keyId =
    requireText(
      metadata.keyId,
      "INVALID_KEY_ID",
      100,
      /^[A-Za-z0-9._:-]+$/
    );

  const statement = {
    schema:
      STATEMENT_SCHEMA,

    version:
      "2.0.0",

    domain:
      DOMAIN,

    algorithm:
      "Ed25519",

    issuer,

    audience,

    purpose,

    key_id:
      keyId,

    payload_schema:
      payload.schema,

    payload_sha256:
      sha256Canonical(
        payload
      ),

    proof_id:
      payload.proof_id,

    issued_at:
      payload.issued_at,

    expires_at:
      payload.expires_at
  };

  const bytes =
    Buffer.from(
      canonicalJson(statement),
      "utf8"
    );

  if (
    bytes.length >
    MAX_SIGNING_STATEMENT_BYTES
  ) {
    fail(
      "SIGNING_STATEMENT_TOO_LARGE"
    );
  }

  return {
    statement,
    bytes
  };
}


async function signProofV2(
  payload,
  options = {}
) {
  const provider =
    validateProvider(
      options.provider
    );

  const issuer =
    requireText(
      options.issuer,
      "INVALID_ISSUER",
      80,
      /^[A-Za-z0-9._:-]+$/
    );

  const audience =
    requireText(
      options.audience,
      "INVALID_AUDIENCE",
      120,
      /^[A-Za-z0-9._:/-]+$/
    );

  const purpose =
    requireText(
      options.purpose,
      "INVALID_PURPOSE",
      80,
      /^[A-Za-z0-9._:-]+$/
    );

  const now =
    parseIso(
      options.now,
      "INVALID_VERIFICATION_TIME"
    );

  const trust =
    normalizeTrustEntry(
      options.trustStore,
      provider.id,
      {
        now,
        audience,
        purpose
      }
    );

  const actualFingerprint =
    fingerprintPublicKey(
      provider.publicKeyPem
    );

  if (
    actualFingerprint !==
    trust.expectedFingerprint
  ) {
    fail(
      "SIGNER_KEY_PIN_MISMATCH"
    );
  }

  const {
    statement,
    bytes
  } =
    createSigningStatement(
      payload,
      {
        issuer,
        audience,
        purpose,
        keyId:
          provider.id
      }
    );

  const rawSignature =
    await provider.sign(
      bytes
    );

  if (
    !Buffer.isBuffer(
      rawSignature
    ) &&
    !(
      rawSignature instanceof
      Uint8Array
    )
  ) {
    fail(
      "INVALID_PROVIDER_SIGNATURE"
    );
  }

  const signature =
    Buffer.from(
      rawSignature
    );

  if (!signature.length) {
    fail(
      "INVALID_PROVIDER_SIGNATURE"
    );
  }

  return {
    schema:
      ENVELOPE_SCHEMA,

    version:
      "2.0.0",

    payload,

    signing_statement:
      statement,

    signer: {
      key_id:
        provider.id,

      scheme:
        "Ed25519",

      trust:
        "PINNED_TRUST_STORE_V2",

      environment:
        trust.environment,

      public_key_pem:
        provider.publicKeyPem
    },

    signature_base64:
      signature.toString(
        "base64"
      )
  };
}


function verifyProofV2(
  envelope,
  trustStore,
  options = {}
) {
  if (
    !isObject(envelope) ||
    envelope.schema !==
      ENVELOPE_SCHEMA
  ) {
    fail("INVALID_V2_ENVELOPE");
  }

  const payload =
    envelope.payload;

  const statement =
    envelope.signing_statement;

  if (
    !isObject(payload) ||
    payload.schema !==
      PAYLOAD_SCHEMA
  ) {
    fail("INVALID_V2_PAYLOAD");
  }

  if (
    !isObject(statement) ||
    statement.schema !==
      STATEMENT_SCHEMA ||
    statement.domain !==
      DOMAIN ||
    statement.algorithm !==
      "Ed25519"
  ) {
    fail(
      "INVALID_SIGNING_STATEMENT"
    );
  }

  const expectedIssuer =
    requireText(
      options.expectedIssuer,
      "EXPECTED_ISSUER_REQUIRED",
      80
    );

  const expectedAudience =
    requireText(
      options.expectedAudience,
      "EXPECTED_AUDIENCE_REQUIRED",
      120
    );

  const expectedPurpose =
    requireText(
      options.expectedPurpose,
      "EXPECTED_PURPOSE_REQUIRED",
      80
    );

  if (
    statement.issuer !==
    expectedIssuer
  ) {
    fail("UNEXPECTED_ISSUER");
  }

  if (
    statement.audience !==
    expectedAudience
  ) {
    fail("UNEXPECTED_AUDIENCE");
  }

  if (
    statement.purpose !==
    expectedPurpose
  ) {
    fail("UNEXPECTED_PURPOSE");
  }

  if (
    statement.key_id !==
    envelope.signer?.key_id
  ) {
    fail("KEY_ID_BINDING_MISMATCH");
  }

  if (
    statement.payload_sha256 !==
    sha256Canonical(
      payload
    )
  ) {
    fail("PAYLOAD_HASH_MISMATCH");
  }

  if (
    statement.proof_id !==
      payload.proof_id ||
    statement.issued_at !==
      payload.issued_at ||
    statement.expires_at !==
      payload.expires_at
  ) {
    fail(
      "STATEMENT_PAYLOAD_BINDING_MISMATCH"
    );
  }

  const now =
    parseIso(
      options.now,
      "INVALID_VERIFICATION_TIME"
    );

  const issued =
    parseIso(
      payload.issued_at,
      "INVALID_PAYLOAD_ISSUED_AT"
    );

  const expires =
    parseIso(
      payload.expires_at,
      "INVALID_PAYLOAD_EXPIRES_AT"
    );

  if (
    now.time <
    issued.time
  ) {
    fail("PROOF_NOT_YET_VALID");
  }

  if (
    now.time >
    expires.time
  ) {
    fail("PROOF_EXPIRED");
  }

  const keyId =
    requireText(
      envelope.signer?.key_id,
      "INVALID_KEY_ID",
      100
    );

  const trust =
    normalizeTrustEntry(
      trustStore,
      keyId,
      {
        now,
        audience:
          expectedAudience,
        purpose:
          expectedPurpose
      }
    );

  const publicKeyPem =
    requireText(
      envelope.signer
        ?.public_key_pem,
      "PUBLIC_KEY_REQUIRED",
      4096
    );

  const actualFingerprint =
    fingerprintPublicKey(
      publicKeyPem
    );

  if (
    actualFingerprint !==
    trust.expectedFingerprint
  ) {
    fail(
      "SIGNER_KEY_PIN_MISMATCH"
    );
  }

  const statementBytes =
    Buffer.from(
      canonicalJson(
        statement
      ),
      "utf8"
    );

  if (
    statementBytes.length >
    MAX_SIGNING_STATEMENT_BYTES
  ) {
    fail(
      "SIGNING_STATEMENT_TOO_LARGE"
    );
  }

  let signature;

  try {
    signature =
      Buffer.from(
        String(
          envelope.signature_base64 ||
          ""
        ),
        "base64"
      );
  } catch {
    fail("INVALID_SIGNATURE");
  }

  if (!signature.length) {
    fail("INVALID_SIGNATURE");
  }

  const valid =
    crypto.verify(
      null,
      statementBytes,
      publicKeyPem,
      signature
    );

  if (!valid) {
    fail(
      "SIGNATURE_MISMATCH"
    );
  }

  if (
    payload
      .evidence_context
      ?.production_evidence !==
      false
  ) {
    fail(
      "UNTRUSTED_PRODUCTION_EVIDENCE"
    );
  }

  return {
    ok:
      true,

    proof_id:
      payload.proof_id,

    signature_status:
      "VERIFIED",

    domain:
      DOMAIN,

    issuer:
      statement.issuer,

    audience:
      statement.audience,

    purpose:
      statement.purpose,

    key_id:
      keyId,

    key_environment:
      trust.environment,

    signer_trust:
      "PINNED_TRUST_STORE_V2",

    production_evidence:
      false,

    commerce_verified:
      false,

    signing_statement_bytes:
      statementBytes.length
  };
}


module.exports = {
  DOMAIN,
  MAX_SIGNING_STATEMENT_BYTES,
  createProofPayloadV2,
  createSigningStatement,
  signProofV2,
  verifyProofV2
};