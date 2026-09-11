"use strict";

const crypto = require("node:crypto");
const { canonicalJson } = require("./canonical-json");

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
    lifecycle.pre_payment?.provider !== "402Signal" ||
    lifecycle.pre_payment?.assurance !==
      "THIRD_PARTY_ATTESTED"
  ) {
    fail("INVALID_PREPAYMENT_ASSURANCE");
  }

  if (
    lifecycle.payment?.status !==
      "PAYMENT_VERIFIED" ||
    lifecycle.payment?.request_binding !== "VALID" ||
    lifecycle.payment?.replay_status !== "CONSUMED"
  ) {
    fail("INVALID_PAYMENT_LIFECYCLE");
  }

  if (
    lifecycle.post_payment?.assurance !==
      "OBSERVED"
  ) {
    fail("INVALID_POSTPAYMENT_ASSURANCE");
  }

  if (
    lifecycle.commerce_state?.payment_bound !== true ||
    lifecycle.commerce_state?.outcome_observed !== true
  ) {
    fail("INCOMPLETE_COMMERCE_LIFECYCLE");
  }

  /*
   * Stage 5 uses synthetic payment evidence.
   * Never promote it to COMMERCE_VERIFIED.
   */
  if (
    lifecycle.commerce_state?.commerce_verified !== false
  ) {
    fail("SYNTHETIC_COMMERCE_MUST_NOT_BE_VERIFIED");
  }
}

function createCommerceProofPayload(
  lifecycle,
  options = {}
) {
  validateLifecycle(lifecycle);

  const issuedAt =
    String(
      options.issuedAt ||
      new Date().toISOString()
    );

  const descriptor = {
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
    "SG-402-PROOF-" +
    sha256(
      canonicalJson(descriptor)
    )
      .slice(0, 32)
      .toUpperCase();

  return {
    schema:
      "SAFEGATE_402SIGNAL_COMMERCE_PROOF_V1",

    version: "1.0.0",

    proof_id: proofId,
    issued_at: issuedAt,

    scope: "SYNTHETIC_INTEROP_TEST",

    production_evidence: false,

    request_id:
      lifecycle.request_id,

    pre_payment: {
      provider:
        lifecycle.pre_payment.provider,

      assurance:
        lifecycle.pre_payment.assurance,

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
        lifecycle.post_payment.assurance,

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
      payment_bound: true,
      outcome_observed: true,

      commerce_verified: false
    }
  };
}

function signCommerceProof(
  payload,
  options = {}
) {
  if (!isObject(payload)) {
    fail("INVALID_PROOF_PAYLOAD");
  }

  if (
    typeof options.sign !== "function"
  ) {
    fail("SIGN_CALLBACK_REQUIRED");
  }

  const signerId =
    String(options.signerId || "").trim();

  if (!signerId) {
    fail("SIGNER_ID_REQUIRED");
  }

  const publicKeyPem =
    String(options.publicKeyPem || "").trim();

  if (
    !publicKeyPem.includes(
      "BEGIN PUBLIC KEY"
    )
  ) {
    fail("PUBLIC_KEY_REQUIRED");
  }

  const canonicalPayload =
    canonicalJson(payload);

  const signature =
    options.sign(
      Buffer.from(
        canonicalPayload,
        "utf8"
      )
    );

  if (
    !Buffer.isBuffer(signature) ||
    !signature.length
  ) {
    fail("INVALID_SIGNATURE");
  }

  return {
    schema:
      "SAFEGATE_SIGNED_COMMERCE_PROOF_V1",

    version: "1.0.0",

    payload,

    signer: {
      id: signerId,
      scheme: "Ed25519",

      /*
       * Stage 5 only:
       * embedded key verifies integrity,
       * but does not establish production identity trust.
       */
      trust: "UNPINNED_TEST_KEY",

      public_key_pem:
        publicKeyPem
    },

    signature_base64:
      signature.toString("base64")
  };
}

function verifyCommerceProofEnvelope(
  envelope
) {
  if (!isObject(envelope)) {
    fail("INVALID_PROOF_ENVELOPE");
  }

  if (
    envelope.schema !==
      "SAFEGATE_SIGNED_COMMERCE_PROOF_V1"
  ) {
    fail("UNSUPPORTED_PROOF_ENVELOPE");
  }

  if (
    envelope.signer?.scheme !== "Ed25519"
  ) {
    fail("UNSUPPORTED_SIGNATURE_SCHEME");
  }

  const publicKeyPem =
    String(
      envelope.signer.public_key_pem || ""
    );

  if (
    !publicKeyPem.includes(
      "BEGIN PUBLIC KEY"
    )
  ) {
    fail("INVALID_PUBLIC_KEY");
  }

  const signature =
    Buffer.from(
      String(
        envelope.signature_base64 || ""
      ),
      "base64"
    );

  if (!signature.length) {
    fail("INVALID_SIGNATURE");
  }

  const canonicalPayload =
    canonicalJson(
      envelope.payload
    );

  const valid =
    crypto.verify(
      null,
      Buffer.from(
        canonicalPayload,
        "utf8"
      ),
      publicKeyPem,
      signature
    );

  if (!valid) {
    fail("SIGNATURE_MISMATCH");
  }

  return {
    ok: true,

    proof_id:
      envelope.payload.proof_id,

    signature_status:
      "VERIFIED",

    signer_scheme:
      "Ed25519",

    signer_trust:
      envelope.signer.trust,

    production_evidence:
      envelope.payload.production_evidence,

    commerce_verified:
      envelope.payload
        .commerce_state
        .commerce_verified
  };
}

module.exports = {
  createCommerceProofPayload,
  signCommerceProof,
  verifyCommerceProofEnvelope
};