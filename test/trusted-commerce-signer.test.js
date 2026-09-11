"use strict";

const assert = require("node:assert");
const crypto = require("node:crypto");

const {
  createCommerceProofPayload,
  signCommerceProof,
  verifyCommerceProofEnvelope
} = require("../lib/402signal-commerce-proof");

const {
  fingerprintPublicKey,
  verifyTrustedCommerceProofEnvelope
} = require("../lib/trusted-commerce-signer");


const lifecycle = {
  schema:
    "SAFEGATE_402SIGNAL_COMMERCE_LIFECYCLE_V1",

  version:
    "1.0.0",

  request_id:
    "SG-EVM-REQ-402SIGNAL-0003",

  pre_payment: {
    provider:
      "402Signal",

    decision:
      "ALLOW",

    assurance:
      "THIRD_PARTY_ATTESTED",

    evidence_id:
      "SG-402-EVID-" + "A".repeat(32),

    quote_sha256:
      "b".repeat(64)
  },

  payment: {
    status:
      "PAYMENT_VERIFIED",

    chain_id:
      8453,

    asset:
      "USDC",

    transaction_hash:
      "0x" + "ef".repeat(32),

    request_binding:
      "VALID",

    replay_status:
      "CONSUMED"
  },

  post_payment: {
    assurance:
      "OBSERVED",

    execution_outcome:
      "EXECUTION_COMPLETED",

    response_status:
      200,

    response_hash:
      "c".repeat(64)
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
      false,

    commerce_proof_created:
      false
  }
};


const payload =
  createCommerceProofPayload(
    lifecycle,
    {
      issuedAt:
        "2026-09-11T18:00:00.000Z"
    }
  );


/*
 * Trusted TEST signer.
 * Both private keys exist only in process memory.
 */
const trustedPair =
  crypto.generateKeyPairSync(
    "ed25519"
  );

const trustedPublicPem =
  trustedPair.publicKey.export({
    type:
      "spki",

    format:
      "pem"
  });


const trustedFingerprint =
  fingerprintPublicKey(
    trustedPublicPem
  );


const trustStore = {
  schema:
    "SAFEGATE_SIGNER_TRUST_STORE_V1",

  signers: {
    "SAFEGATE-STAGE6-TRUSTED-TEST": {
      scheme:
        "Ed25519",

      environment:
        "TEST",

      status:
        "ACTIVE",

      public_key_sha256:
        trustedFingerprint
    }
  }
};


const trustedEnvelope =
  signCommerceProof(
    payload,
    {
      signerId:
        "SAFEGATE-STAGE6-TRUSTED-TEST",

      publicKeyPem:
        trustedPublicPem,

      sign:
        bytes =>
          crypto.sign(
            null,
            bytes,
            trustedPair.privateKey
          )
    }
  );


/*
 * Stage 5 cryptographic verification.
 */
const stage5Result =
  verifyCommerceProofEnvelope(
    trustedEnvelope
  );

assert.equal(
  stage5Result.signature_status,
  "VERIFIED"
);


/*
 * Stage 6 external trust verification.
 */
const trustedResult =
  verifyTrustedCommerceProofEnvelope(
    trustedEnvelope,
    trustStore
  );


assert.equal(
  trustedResult.ok,
  true
);

assert.equal(
  trustedResult.signature_status,
  "VERIFIED"
);

assert.equal(
  trustedResult.signer_trust,
  "PINNED_TRUST_STORE"
);

assert.equal(
  trustedResult.trust_environment,
  "TEST"
);

assert.equal(
  trustedResult.production_trust,
  false
);

assert.equal(
  trustedResult.production_evidence,
  false
);

assert.equal(
  trustedResult.commerce_verified,
  false
);


/* ========================================================
   ATTACK 1:
   attacker substitutes own key and validly re-signs payload
   ======================================================== */

const attackerPair =
  crypto.generateKeyPairSync(
    "ed25519"
  );

const attackerPublicPem =
  attackerPair.publicKey.export({
    type:
      "spki",

    format:
      "pem"
  });


const attackerEnvelope =
  signCommerceProof(
    payload,
    {
      /*
       * Attacker claims SAME signer ID.
       */
      signerId:
        "SAFEGATE-STAGE6-TRUSTED-TEST",

      publicKeyPem:
        attackerPublicPem,

      sign:
        bytes =>
          crypto.sign(
            null,
            bytes,
            attackerPair.privateKey
          )
    }
  );


/*
 * Important:
 * self-contained cryptographic verification succeeds,
 * because attacker signed with its own embedded public key.
 */
const attackerSelfVerification =
  verifyCommerceProofEnvelope(
    attackerEnvelope
  );

assert.equal(
  attackerSelfVerification.signature_status,
  "VERIFIED"
);


/*
 * But SafeGate external trust pin MUST reject it.
 */
assert.throws(
  () =>
    verifyTrustedCommerceProofEnvelope(
      attackerEnvelope,
      trustStore
    ),

  error =>
    error &&
    error.code ===
      "SIGNER_KEY_PIN_MISMATCH"
);


/* ========================================================
   ATTACK 2:
   unknown signer ID
   ======================================================== */

const unknownSignerEnvelope =
  signCommerceProof(
    payload,
    {
      signerId:
        "UNKNOWN-SIGNER",

      publicKeyPem:
        attackerPublicPem,

      sign:
        bytes =>
          crypto.sign(
            null,
            bytes,
            attackerPair.privateKey
          )
    }
  );


assert.throws(
  () =>
    verifyTrustedCommerceProofEnvelope(
      unknownSignerEnvelope,
      trustStore
    ),

  error =>
    error &&
    error.code ===
      "SIGNER_NOT_TRUSTED"
);


/* ========================================================
   ATTACK 3:
   trusted key but payload changed after signature
   ======================================================== */

const tampered =
  JSON.parse(
    JSON.stringify(
      trustedEnvelope
    )
  );

tampered
  .payload
  .post_payment
  .response_hash =
    "0".repeat(64);


assert.throws(
  () =>
    verifyTrustedCommerceProofEnvelope(
      tampered,
      trustStore
    ),

  error =>
    error &&
    error.code ===
      "SIGNATURE_MISMATCH"
);


console.log(
  "TRUSTED_SIGNER_BOUNDARY=PASS"
);

console.log(
  "SIGNATURE_VERIFICATION=PASS"
);

console.log(
  "EXTERNAL_KEY_PINNING=PASS"
);

console.log(
  "KEY_SUBSTITUTION_ATTACK=BLOCKED"
);

console.log(
  "UNKNOWN_SIGNER=BLOCKED"
);

console.log(
  "PAYLOAD_TAMPER=BLOCKED"
);

console.log(
  "SIGNER_TRUST=PINNED_TRUST_STORE"
);

console.log(
  "TRUST_ENVIRONMENT=TEST"
);

console.log(
  "PRODUCTION_TRUST=NO"
);

console.log(
  "PRODUCTION_EVIDENCE=NO"
);

console.log(
  "COMMERCE_VERIFIED=NO"
);

console.log(
  "PRIVATE_KEY_WRITTEN_TO_DISK=NO"
);

console.log(
  "WALLET_USED=NO"
);

console.log(
  "PAYMENT_SENT=NO"
);