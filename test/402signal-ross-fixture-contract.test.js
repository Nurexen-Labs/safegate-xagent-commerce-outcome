"use strict";

const assert = require("node:assert");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const {
  create402SignalPrePaymentEvidence,
  bind402SignalPrePaymentEvidenceToRequest
} = require("../lib/402signal-prepayment-evidence");

const {
  createPaymentExpectation,
  validatePaymentExpectation,
  verifyPaymentAgainstExpectation,
  createBoundPaymentVerifier
} = require("../lib/402signal-economic-binding");

const {
  execute402SignalObservedLifecycle
} = require("../lib/402signal-commerce-lifecycle");

const {
  fingerprintPublicKey
} = require("../lib/trusted-commerce-signer");

const {
  createProofPayloadV2,
  signProofV2,
  verifyProofV2
} = require("../lib/commerce-proof-profile-v2");

const fixtureRoot = path.join(
  __dirname,
  "..",
  "verification",
  "402signal-ross-fixture-contract"
);

function readJson(name) {
  return JSON.parse(
    fs.readFileSync(
      path.join(fixtureRoot, name),
      "utf8"
    )
  );
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertCode(fn, expectedCode) {
  assert.throws(
    fn,
    error =>
      error &&
      error.code === expectedCode
  );
}

async function main() {
  const shape =
    readJson("fixture-shape.json");

  const fixture =
    readJson("synthetic-base-exact-case.json");

  const expected =
    readJson("expected-safegate-output.json");

  const mutations =
    readJson("negative-mutation-matrix.json");

  const lock =
    readJson("../402signal-route-guard-lock.json");

  /*
   * STABLE RELEASE LOCK IS SEPARATE FROM SANDBOX HANDSHAKE.
   */
  assert.equal(
    lock.package,
    shape.stable_release_lock.package
  );

  assert.equal(
    lock.version,
    shape.stable_release_lock.version
  );

  assert.equal(
    lock.release_commit,
    shape.stable_release_lock.release_commit
  );

  assert.equal(
    lock.sha256,
    shape.stable_release_lock.sha256
  );

  /*
   * EXACT 402SIGNAL FIXTURE -> PREPAYMENT EVIDENCE
   */
  const prepayment =
    create402SignalPrePaymentEvidence({
      verifiedAction:
        fixture.verifiedAction,

      routeRequestJson:
        fixture.routeRequestJson,

      routeResponseJson:
        fixture.routeResponseJson,

      sourceMode:
        "SYNTHETIC"
    });

  assert.equal(
    prepayment.schema,
    expected.prepayment.schema
  );

  assert.equal(
    prepayment.stage,
    expected.prepayment.stage
  );

  assert.equal(
    prepayment.decision,
    expected.prepayment.decision
  );

  assert.equal(
    prepayment.provenance.provider,
    expected.prepayment.provider
  );

  assert.equal(
    prepayment.provenance.assurance,
    expected.prepayment.assurance
  );

  assert.equal(
    prepayment.provenance.source_mode,
    expected.prepayment.source_mode
  );

  /*
   * CALLER CANNOT SELF-PROMOTE SYNTHETIC EVIDENCE.
   */
  assertCode(
    () =>
      create402SignalPrePaymentEvidence({
        verifiedAction:
          fixture.verifiedAction,

        routeRequestJson:
          fixture.routeRequestJson,

        routeResponseJson:
          fixture.routeResponseJson,

        sourceMode:
          "PRODUCTION"
      }),

    "CALLER_PRODUCTION_SOURCE_MODE_FORBIDDEN"
  );

  const boundPrepayment =
    bind402SignalPrePaymentEvidenceToRequest({
      evidence:
        prepayment,

      requestId:
        fixture.requestId
    });

  assert.equal(
    boundPrepayment
      .safegate_request_binding
      .status,
    expected
      .prepayment
      .request_binding_status
  );

  /*
   * PREPAYMENT -> PAYMENT EXPECTATION
   */
  const expectation =
    createPaymentExpectation({
      verifiedAction:
        fixture.verifiedAction,

      requestId:
        fixture.requestId,

      nowEpochSeconds:
        fixture.nowEpochSeconds
    });

  assert.equal(
    validatePaymentExpectation(
      expectation,
      fixture.nowEpochSeconds + 1
    ),
    true
  );

  assert.equal(
    expectation.schema,
    expected.payment_expectation.schema
  );

  assert.equal(
    expectation.request_id,
    expected.payment_expectation.request_id
  );

  assert.equal(
    expectation.terms.network,
    expected.payment_expectation.network
  );

  assert.equal(
    expectation.terms.asset,
    expected.payment_expectation.asset
  );

  assert.equal(
    expectation.terms.amount_base_units,
    expected.payment_expectation.amount_base_units
  );

  assert.equal(
    expectation.terms.recipient,
    expected.payment_expectation.recipient
  );

  /*
   * EXACT SYNTHETIC BASE PAYMENT BINDING
   */
  const matched =
    verifyPaymentAgainstExpectation(
      expectation,
      fixture.paymentVerification,
      fixture.nowEpochSeconds + 2
    );

  assert.equal(
    matched.ok,
    expected.payment_binding.ok
  );

  assert.equal(
    matched.binding_status,
    expected.payment_binding.binding_status
  );

  /*
   * BOUND PAYMENT VERIFIER -> OBSERVED LIFECYCLE
   */
  const boundVerifier =
    createBoundPaymentVerifier({
      expectation,

      nowEpochSeconds:
        () =>
          fixture.nowEpochSeconds + 3,

      verifyPayment:
        async () => ({
          ok: true,
          verification:
            fixture.paymentVerification
        })
    });

  const consumed =
    new Set();

  const lifecycle =
    await execute402SignalObservedLifecycle(
      {
        prepaymentEvidence:
          boundPrepayment,

        request:
          fixture.commerceRequest,

        paymentProof: {
          synthetic: true
        }
      },
      {
        verifyPayment:
          boundVerifier,

        consumeOnce:
          async ({ consumeKey }) => {
            if (consumed.has(consumeKey)) {
              return false;
            }

            consumed.add(consumeKey);
            return true;
          },

        execute:
          async () =>
            fixture.executionResult,

        now:
          (() => {
            const values = [
              "2026-09-11T20:40:00.000Z",
              "2026-09-11T20:40:01.000Z"
            ];

            return () =>
              values.shift() ||
              "2026-09-11T20:40:01.000Z";
          })()
      }
    );

  assert.equal(
    lifecycle.schema,
    expected.lifecycle.schema
  );

  assert.equal(
    lifecycle.pre_payment.assurance,
    expected.lifecycle.pre_payment_assurance
  );

  assert.equal(
    lifecycle.payment.status,
    expected.lifecycle.payment_status
  );

  assert.equal(
    lifecycle.payment.request_binding,
    expected.lifecycle.request_binding
  );

  assert.equal(
    lifecycle.payment.replay_status,
    expected.lifecycle.replay_status
  );

  assert.equal(
    lifecycle.post_payment.assurance,
    expected.lifecycle.post_payment_assurance
  );

  assert.equal(
    lifecycle.commerce_state.payment_bound,
    expected.lifecycle.payment_bound
  );

  assert.equal(
    lifecycle.commerce_state.outcome_observed,
    expected.lifecycle.outcome_observed
  );

  assert.equal(
    lifecycle.commerce_state.commerce_verified,
    expected.lifecycle.commerce_verified
  );

  /*
   * REPLAY MUST FAIL CLOSED.
   */
  await assert.rejects(
    () =>
      execute402SignalObservedLifecycle(
        {
          prepaymentEvidence:
            boundPrepayment,

          request:
            fixture.commerceRequest,

          paymentProof: {
            synthetic: true
          }
        },
        {
          verifyPayment:
            boundVerifier,

          consumeOnce:
            async ({ consumeKey }) => {
              if (consumed.has(consumeKey)) {
                return false;
              }

              consumed.add(consumeKey);
              return true;
            },

          execute:
            async () => ({
              statusCode: 200,
              body: {
                should_not_execute: true
              }
            }),

          now:
            () =>
              "2026-09-11T20:40:02.000Z"
        }
      ),

    error =>
      error &&
      error.code === "ALREADY_CONSUMED"
  );

  /*
   * SIGNED PORTABLE COMMERCEPROOF V2
   */
  const pair =
    crypto.generateKeyPairSync(
      "ed25519"
    );

  const publicKeyPem =
    pair.publicKey.export({
      type: "spki",
      format: "pem"
    });

  const keyId =
    "SAFEGATE-ROSS-FIXTURE-TEST-001";

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
          fingerprintPublicKey(
            publicKeyPem
          ),

        not_before:
          "2026-09-11T20:00:00.000Z",

        not_after:
          "2026-09-11T22:00:00.000Z",

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

  const proofPayload =
    createProofPayloadV2(
      lifecycle,
      {
        issuedAt:
          "2026-09-11T20:40:03.000Z",

        ttlSeconds:
          120
      }
    );

  const envelope =
    await signProofV2(
      proofPayload,
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
          "2026-09-11T20:40:04.000Z"
      }
    );

  const proofVerification =
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
          "2026-09-11T20:40:05.000Z"
      }
    );

  assert.equal(
    envelope.schema,
    expected
      .signed_commerce_proof
      .envelope_schema
  );

  assert.equal(
    envelope.payload.schema,
    expected
      .signed_commerce_proof
      .payload_schema
  );

  assert.equal(
    proofVerification.ok,
    expected
      .signed_commerce_proof
      .verification_ok
  );

  assert.equal(
    envelope
      .payload
      .evidence_context
      .production_evidence,
    expected
      .signed_commerce_proof
      .production_evidence
  );

  assert.equal(
    envelope
      .payload
      .commerce_state
      .commerce_verified,
    expected
      .signed_commerce_proof
      .commerce_verified
  );

  /*
   * ROSS NEGATIVE MUTATION MATRIX
   */
  for (const mutation of mutations.cases) {
    if (mutation.id === "expiry") {
      const action =
        clone(
          fixture.verifiedAction
        );

      action.expires_at =
        mutation.mutated_value;

      assertCode(
        () =>
          createPaymentExpectation({
            verifiedAction:
              action,

            requestId:
              fixture.requestId,

            nowEpochSeconds:
              fixture.nowEpochSeconds
          }),

        mutation.expected_error
      );
    }
    else {
      const payment =
        clone(
          fixture.paymentVerification
        );

      if (mutation.id === "requestId") {
        payment.request_id =
          mutation.mutated_value;
      }
      else if (mutation.id === "amount") {
        payment.amount_base_units =
          mutation.mutated_value;
      }
      else if (mutation.id === "recipient") {
        payment.recipient =
          mutation.mutated_value;
      }
      else {
        throw new Error(
          "UNKNOWN_MUTATION_CASE_" +
          mutation.id
        );
      }

      assertCode(
        () =>
          verifyPaymentAgainstExpectation(
            expectation,
            payment,
            fixture.nowEpochSeconds + 2
          ),

        mutation.expected_error
      );
    }

    console.log(
      "MUTATION_" +
      mutation.id.toUpperCase() +
      "=REJECTED:" +
      mutation.expected_error
    );
  }

  console.log(
    "PREPAYMENT_EVIDENCE=PASS"
  );

  console.log(
    "PAYMENT_EXPECTATION=PASS"
  );

  console.log(
    "PAYMENT_BINDING=PASS"
  );

  console.log(
    "OBSERVED_LIFECYCLE=PASS"
  );

  console.log(
    "REPLAY_SAFETY=PASS"
  );

  console.log(
    "SIGNED_COMMERCE_PROOF=PASS"
  );

  console.log(
    "CALLER_PRODUCTION_ELEVATION=REJECTED"
  );

  console.log(
    "ROSS_402SIGNAL_FIXTURE_CONTRACT_TEST=PASS"
  );
}

main().catch(error => {
  console.error(
    "ROSS_402SIGNAL_FIXTURE_CONTRACT_TEST=FAIL"
  );

  console.error(
    "ERROR_CODE=" +
    String(
      error &&
      error.code
        ? error.code
        : "NONE"
    )
  );

  console.error(error);

  process.exit(1);
});
