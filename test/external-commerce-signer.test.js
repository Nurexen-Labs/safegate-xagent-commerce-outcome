"use strict";

async function main() {


const assert = require("node:assert");
const crypto = require("node:crypto");

const {
  fingerprintPublicKey
} = require("../lib/trusted-commerce-signer");

const {
  validateProvider,
  createTrustedCommerceProofWithProvider
} = require("../lib/external-commerce-signer");


const lifecycle = {
  schema:
    "SAFEGATE_402SIGNAL_COMMERCE_LIFECYCLE_V1",

  version:
    "1.0.0",

  request_id:
    "SG-EVM-REQ-402SIGNAL-0004",

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
      "0x" + "12".repeat(32),

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


/*
 * Trusted test provider.
 * Private key exists only in this process memory.
 */
const trustedPair =
  crypto.generateKeyPairSync(
    "ed25519"
  );

const trustedPublicPem =
  trustedPair.publicKey.export({
    type: "spki",
    format: "pem"
  });


const fingerprint =
  fingerprintPublicKey(
    trustedPublicPem
  );


const trustStore = {
  schema:
    "SAFEGATE_SIGNER_TRUST_STORE_V1",

  signers: {
    "SAFEGATE-EXTERNAL-SIGNER-TEST": {
      scheme:
        "Ed25519",

      environment:
        "TEST",

      status:
        "ACTIVE",

      public_key_sha256:
        fingerprint
    }
  }
};


let signCalls = 0;


const provider = {
  id:
    "SAFEGATE-EXTERNAL-SIGNER-TEST",

  scheme:
    "Ed25519",

  publicKeyPem:
    trustedPublicPem,

  sign:
    async bytes => {
      signCalls++;

      return crypto.sign(
        null,
        bytes,
        trustedPair.privateKey
      );
    }
};


const result =
  await createTrustedCommerceProofWithProvider(
    lifecycle,
    {
      provider,
      trustStore,

      issuedAt:
        "2026-09-11T19:00:00.000Z"
    }
  );


assert.equal(
  signCalls,
  1
);

assert.equal(
  result.verification.ok,
  true
);

assert.equal(
  result.verification.signature_status,
  "VERIFIED"
);

assert.equal(
  result.verification.signer_trust,
  "PINNED_TRUST_STORE"
);

assert.equal(
  result.verification.trust_environment,
  "TEST"
);

assert.equal(
  result.verification.production_trust,
  false
);

assert.equal(
  result.verification.production_evidence,
  false
);

assert.equal(
  result.verification.commerce_verified,
  false
);


/* =========================================================
   RAW PRIVATE KEY INPUT MUST BE REFUSED
   ========================================================= */

assert.throws(
  () =>
    validateProvider({
      id:
        "BAD",

      scheme:
        "Ed25519",

      publicKeyPem:
        trustedPublicPem,

      privateKeyPem:
        "DO_NOT_ACCEPT",

      sign:
        async () =>
          Buffer.alloc(64)
    }),

  error =>
    error &&
    error.code ===
      "RAW_PRIVATE_KEY_FORBIDDEN"
);


/* =========================================================
   WRONG SIGNING KEY WITH TRUSTED PUBLIC KEY
   ========================================================= */

const attackerPair =
  crypto.generateKeyPairSync(
    "ed25519"
  );


const wrongSignatureProvider = {
  id:
    "SAFEGATE-EXTERNAL-SIGNER-TEST",

  scheme:
    "Ed25519",

  /*
   * Claims trusted public key...
   */
  publicKeyPem:
    trustedPublicPem,

  /*
   * ...but signs with attacker private key.
   */
  sign:
    async bytes =>
      crypto.sign(
        null,
        bytes,
        attackerPair.privateKey
      )
};


await assert.rejects(
  () =>
    createTrustedCommerceProofWithProvider(
      lifecycle,
      {
        provider:
          wrongSignatureProvider,

        trustStore,

        issuedAt:
          "2026-09-11T19:00:00.000Z"
      }
    ),

  error =>
    error &&
    error.code ===
      "SIGNATURE_MISMATCH"
);


/* =========================================================
   KEY SUBSTITUTION
   ========================================================= */

const attackerPublicPem =
  attackerPair.publicKey.export({
    type:
      "spki",

    format:
      "pem"
  });


const substitutedProvider = {
  id:
    "SAFEGATE-EXTERNAL-SIGNER-TEST",

  scheme:
    "Ed25519",

  publicKeyPem:
    attackerPublicPem,

  sign:
    async bytes =>
      crypto.sign(
        null,
        bytes,
        attackerPair.privateKey
      )
};


await assert.rejects(
  () =>
    createTrustedCommerceProofWithProvider(
      lifecycle,
      {
        provider:
          substitutedProvider,

        trustStore,

        issuedAt:
          "2026-09-11T19:00:00.000Z"
      }
    ),

  error =>
    error &&
    error.code ===
      "SIGNER_KEY_PIN_MISMATCH"
);


console.log(
  "EXTERNAL_SIGNER_PROVIDER=PASS"
);

console.log(
  "PROVIDER_SIGNATURE=VERIFIED"
);

console.log(
  "PINNED_TRUST=PASS"
);

console.log(
  "RAW_PRIVATE_KEY_INPUT=BLOCKED"
);

console.log(
  "WRONG_SIGNING_KEY=BLOCKED"
);

console.log(
  "KEY_SUBSTITUTION=BLOCKED"
);

console.log(
  "PRIVATE_KEY_WRITTEN_TO_DISK=NO"
);

console.log(
  "PRODUCTION_SIGNER_CONNECTED=NO"
);

console.log(
  "PRODUCTION_EVIDENCE=NO"
);

console.log(
  "COMMERCE_VERIFIED=NO"
);

console.log(
  "WALLET_USED=NO"
);

console.log(
  "PAYMENT_SENT=NO"
);
}

main().catch(error => {
  console.error(
    "TEST_FAILURE_CODE=" +
    String(error && error.code ? error.code : "UNHANDLED_ERROR")
  );

  console.error(
    error && error.stack
      ? error.stack
      : String(error)
  );

  process.exitCode = 1;
});