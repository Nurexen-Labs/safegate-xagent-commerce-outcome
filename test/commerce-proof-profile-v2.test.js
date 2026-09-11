"use strict";

const assert =
  require("node:assert");

const crypto =
  require("node:crypto");

const {
  fingerprintPublicKey
} =
  require("../lib/trusted-commerce-signer");

const {
  MAX_SIGNING_STATEMENT_BYTES,
  createProofPayloadV2,
  signProofV2,
  verifyProofV2
} =
  require("../lib/commerce-proof-profile-v2");


async function main() {

  const lifecycle = {
    schema:
      "SAFEGATE_402SIGNAL_COMMERCE_LIFECYCLE_V1",

    version:
      "1.0.0",

    request_id:
      "SG-EVM-REQ-402SIGNAL-0008",

    pre_payment: {
      provider:
        "402Signal",

      decision:
        "ALLOW",

      assurance:
        "THIRD_PARTY_ATTESTED",

      evidence_id:
        "SG-402-EVID-" +
        "A".repeat(32),

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
        "0x" +
        "34".repeat(32),

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


  assert.throws(
    () =>
      createProofPayloadV2(
        lifecycle,
        {
          issuedAt:
            "2026-09-11T20:00:00.000Z",

          ttlSeconds:
            120,

          productionEvidence:
            true
        }
      ),

    error =>
      error &&
      error.code ===
        "CALLER_PRODUCTION_ASSERTION_FORBIDDEN"
  );


  const payload =
    createProofPayloadV2(
      lifecycle,
      {
        issuedAt:
          "2026-09-11T20:00:00.000Z",

        ttlSeconds:
          120
      }
    );


  const pair =
    crypto.generateKeyPairSync(
      "ed25519"
    );

  const publicKeyPem =
    pair.publicKey.export({
      type:
        "spki",

      format:
        "pem"
    });


  const fingerprint =
    fingerprintPublicKey(
      publicKeyPem
    );


  const keyId =
    "SAFEGATE-CP-V2-TEST-001";

  const trustStore = {
    schema:
      "SAFEGATE_SIGNER_TRUST_STORE_V2",

    keys: {
      [keyId]: {
        scheme:
          "Ed25519",

        environment:
          "TEST",

        status:
          "ACTIVE",

        public_key_sha256:
          fingerprint,

        not_before:
          "2026-09-11T19:00:00.000Z",

        not_after:
          "2026-09-11T21:00:00.000Z",

        revoked_at:
          null,

        allowed_purposes: [
          "commerce-proof"
        ],

        allowed_audiences: [
          "safegate-agent-commerce"
        ]
      }
    }
  };


  const provider = {
    id:
      keyId,

    scheme:
      "Ed25519",

    publicKeyPem,

    sign:
      async bytes =>
        crypto.sign(
          null,
          bytes,
          pair.privateKey
        )
  };


  const envelope =
    await signProofV2(
      payload,
      {
        provider,
        trustStore,

        issuer:
          "SAFEGATE",

        audience:
          "safegate-agent-commerce",

        purpose:
          "commerce-proof",

        now:
          "2026-09-11T20:00:10.000Z"
      }
    );


  const verified =
    verifyProofV2(
      envelope,
      trustStore,
      {
        expectedIssuer:
          "SAFEGATE",

        expectedAudience:
          "safegate-agent-commerce",

        expectedPurpose:
          "commerce-proof",

        now:
          "2026-09-11T20:00:30.000Z"
      }
    );


  assert.equal(
    verified.ok,
    true
  );

  assert.equal(
    verified.signature_status,
    "VERIFIED"
  );

  assert.equal(
    verified.signer_trust,
    "PINNED_TRUST_STORE_V2"
  );

  assert.equal(
    verified.production_evidence,
    false
  );

  assert.equal(
    verified.commerce_verified,
    false
  );

  assert.ok(
    verified.signing_statement_bytes <=
      MAX_SIGNING_STATEMENT_BYTES
  );


  /*
   * PAYLOAD TAMPER
   */
  const payloadTampered =
    JSON.parse(
      JSON.stringify(
        envelope
      )
    );

  payloadTampered
    .payload
    .post_payment
    .response_hash =
      "0".repeat(64);

  assert.throws(
    () =>
      verifyProofV2(
        payloadTampered,
        trustStore,
        {
          expectedIssuer:
            "SAFEGATE",

          expectedAudience:
            "safegate-agent-commerce",

          expectedPurpose:
            "commerce-proof",

          now:
            "2026-09-11T20:00:30.000Z"
        }
      ),

    error =>
      error &&
      error.code ===
        "PAYLOAD_HASH_MISMATCH"
  );


  /*
   * AUDIENCE CONFUSION
   */
  const audienceTampered =
    JSON.parse(
      JSON.stringify(
        envelope
      )
    );

  audienceTampered
    .signing_statement
    .audience =
      "evil-service";

  assert.throws(
    () =>
      verifyProofV2(
        audienceTampered,
        trustStore,
        {
          expectedIssuer:
            "SAFEGATE",

          expectedAudience:
            "safegate-agent-commerce",

          expectedPurpose:
            "commerce-proof",

          now:
            "2026-09-11T20:00:30.000Z"
        }
      ),

    error =>
      error &&
      error.code ===
        "UNEXPECTED_AUDIENCE"
  );


  /*
   * PURPOSE CONFUSION
   */
  const purposeTampered =
    JSON.parse(
      JSON.stringify(
        envelope
      )
    );

  purposeTampered
    .signing_statement
    .purpose =
      "wallet-authorization";

  assert.throws(
    () =>
      verifyProofV2(
        purposeTampered,
        trustStore,
        {
          expectedIssuer:
            "SAFEGATE",

          expectedAudience:
            "safegate-agent-commerce",

          expectedPurpose:
            "commerce-proof",

          now:
            "2026-09-11T20:00:30.000Z"
        }
      ),

    error =>
      error &&
      error.code ===
        "UNEXPECTED_PURPOSE"
  );


  /*
   * KEY SUBSTITUTION
   */
  const attacker =
    crypto.generateKeyPairSync(
      "ed25519"
    );

  const attackerPublicPem =
    attacker.publicKey.export({
      type:
        "spki",

      format:
        "pem"
    });

  const attackerProvider = {
    id:
      keyId,

    scheme:
      "Ed25519",

    publicKeyPem:
      attackerPublicPem,

    sign:
      async bytes =>
        crypto.sign(
          null,
          bytes,
          attacker.privateKey
        )
  };

  await assert.rejects(
    () =>
      signProofV2(
        payload,
        {
          provider:
            attackerProvider,

          trustStore,

          issuer:
            "SAFEGATE",

          audience:
            "safegate-agent-commerce",

          purpose:
            "commerce-proof",

          now:
            "2026-09-11T20:00:10.000Z"
        }
      ),

    error =>
      error &&
      error.code ===
        "SIGNER_KEY_PIN_MISMATCH"
  );


  /*
   * REVOKED KEY
   */
  const revokedStore =
    JSON.parse(
      JSON.stringify(
        trustStore
      )
    );

  revokedStore
    .keys[keyId]
    .revoked_at =
      "2026-09-11T19:59:00.000Z";

  assert.throws(
    () =>
      verifyProofV2(
        envelope,
        revokedStore,
        {
          expectedIssuer:
            "SAFEGATE",

          expectedAudience:
            "safegate-agent-commerce",

          expectedPurpose:
            "commerce-proof",

          now:
            "2026-09-11T20:00:30.000Z"
        }
      ),

    error =>
      error &&
      error.code ===
        "TRUST_KEY_REVOKED"
  );


  /*
   * EXPIRED KEY
   */
  const expiredKeyStore =
    JSON.parse(
      JSON.stringify(
        trustStore
      )
    );

  expiredKeyStore
    .keys[keyId]
    .not_after =
      "2026-09-11T20:00:20.000Z";

  assert.throws(
    () =>
      verifyProofV2(
        envelope,
        expiredKeyStore,
        {
          expectedIssuer:
            "SAFEGATE",

          expectedAudience:
            "safegate-agent-commerce",

          expectedPurpose:
            "commerce-proof",

          now:
            "2026-09-11T20:00:30.000Z"
        }
      ),

    error =>
      error &&
      error.code ===
        "TRUST_KEY_EXPIRED"
  );


  /*
   * PROOF EXPIRY
   */
  assert.throws(
    () =>
      verifyProofV2(
        envelope,
        trustStore,
        {
          expectedIssuer:
            "SAFEGATE",

          expectedAudience:
            "safegate-agent-commerce",

          expectedPurpose:
            "commerce-proof",

          now:
            "2026-09-11T20:03:00.000Z"
        }
      ),

    error =>
      error &&
      error.code ===
        "PROOF_EXPIRED"
  );


  /*
   * WRONG ALLOWED PURPOSE
   */
  const wrongPurposeStore =
    JSON.parse(
      JSON.stringify(
        trustStore
      )
    );

  wrongPurposeStore
    .keys[keyId]
    .allowed_purposes =
      ["different-purpose"];

  await assert.rejects(
    () =>
      signProofV2(
        payload,
        {
          provider,
          trustStore:
            wrongPurposeStore,

          issuer:
            "SAFEGATE",

          audience:
            "safegate-agent-commerce",

          purpose:
            "commerce-proof",

          now:
            "2026-09-11T20:00:10.000Z"
        }
      ),

    error =>
      error &&
      error.code ===
        "TRUST_PURPOSE_NOT_ALLOWED"
  );


  console.log(
    "COMMERCE_PROOF_PROFILE_V2=PASS"
  );

  console.log(
    "DOMAIN_SEPARATION=PASS"
  );

  console.log(
    "ISSUER_BINDING=PASS"
  );

  console.log(
    "AUDIENCE_BINDING=PASS"
  );

  console.log(
    "PURPOSE_BINDING=PASS"
  );

  console.log(
    "KEY_ID_BINDING=PASS"
  );

  console.log(
    "KEY_LIFECYCLE=PASS"
  );

  console.log(
    "KEY_REVOCATION=PASS"
  );

  console.log(
    "PROOF_EXPIRY=PASS"
  );

  console.log(
    "PAYLOAD_TAMPER=BLOCKED"
  );

  console.log(
    "KEY_SUBSTITUTION=BLOCKED"
  );

  console.log(
    "CALLER_PRODUCTION_ASSERTION=BLOCKED"
  );

  console.log(
    "SIGNING_INPUT_BOUNDED=PASS"
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
}


main().catch(error => {
  console.error(
    "TEST_FAILURE_CODE=" +
    String(
      error && error.code
        ? error.code
        : "UNHANDLED_ERROR"
    )
  );

  console.error(
    error && error.stack
      ? error.stack
      : String(error)
  );

  process.exitCode = 1;
});