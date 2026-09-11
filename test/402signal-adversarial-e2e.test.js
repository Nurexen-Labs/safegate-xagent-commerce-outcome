"use strict";

const assert =
  require("node:assert");

const crypto =
  require("node:crypto");

const fs =
  require("node:fs");

const os =
  require("node:os");

const path =
  require("node:path");


const {
  create402SignalPrePaymentEvidence,
  bind402SignalPrePaymentEvidenceToRequest
} =
  require("../lib/402signal-prepayment-evidence");


const {
  execute402SignalObservedLifecycle
} =
  require("../lib/402signal-commerce-lifecycle");


const {
  fingerprintPublicKey
} =
  require("../lib/trusted-commerce-signer");


const {
  createProofPayloadV2,
  signProofV2,
  verifyProofV2
} =
  require("../lib/commerce-proof-profile-v2");


const {
  createPaymentExpectation,
  validatePaymentExpectation,
  verifyPaymentAgainstExpectation,
  createBoundPaymentVerifier
} =
  require("../lib/402signal-economic-binding");


const {
  STATES,
  createCoordinator,
  reconcileReadOnly
} =
  require("../lib/402signal-payment-intent");


const {
  createSqlitePaymentIntentStore
} =
  require("../lib/402signal-payment-intent-sqlite");


async function main() {

  const NOW =
    1789159000;

  const EXPIRES =
    NOW + 120;

  const requestId =
    "SG-EVM-REQ-402SIGNAL-0120";

  const recipient =
    "0x1111111111111111111111111111111111111111";

  const verifiedAction = {
    model:
      "proof_carrying_route_v1",

    request: {
      url:
        "https://merchant.example/paid-agent-tool",

      method:
        "POST",

      body_sha256:
        "a".repeat(64)
    },

    accepted: {
      scheme:
        "exact",

      network:
        "eip155:8453",

      amount:
        "1000",

      asset:
        "USDC",

      payTo:
        recipient
    },

    expires_at:
      EXPIRES,

    quote_sha256:
      "b".repeat(64)
  };


  /*
   * AUTHENTICATED ROUTE -> SAFEGATE PREPAYMENT EVIDENCE
   */
  const prepayment =
    create402SignalPrePaymentEvidence({
      verifiedAction,

      routeRequestJson:
        JSON.stringify({
          need:
            "paid-agent-tool",

          require_route_binding:
            true
        }),

      routeResponseJson:
        JSON.stringify({
          synthetic:
            true,

          selected:
            true
        }),

      sourceMode:
        "SYNTHETIC"
    });


  const boundPrepayment =
    bind402SignalPrePaymentEvidenceToRequest({
      evidence:
        prepayment,

      requestId
    });


  /*
   * AUTHENTICATED ECONOMIC EXPECTATION
   */
  const expectation =
    createPaymentExpectation({
      verifiedAction,

      requestId,

      nowEpochSeconds:
        NOW
    });


  assert.equal(
    validatePaymentExpectation(
      expectation,
      NOW + 1
    ),
    true
  );


  /*
   * STALE ROUTE MUST NEVER BECOME PAYMENT AUTHORITY.
   */
  assert.throws(
    () =>
      createPaymentExpectation({
        verifiedAction,

        requestId,

        nowEpochSeconds:
          EXPIRES
      }),

    error =>
      error &&
      error.code ===
        "ROUTE_EVIDENCE_EXPIRED"
  );


  /*
   * ROUTE EXPECTATION MUTATION
   */
  const mutatedExpectation =
    JSON.parse(
      JSON.stringify(
        expectation
      )
    );

  mutatedExpectation
    .terms
    .amount_base_units =
      "2000";


  assert.throws(
    () =>
      validatePaymentExpectation(
        mutatedExpectation,
        NOW + 1
      ),

    error =>
      error &&
      error.code ===
        "PAYMENT_EXPECTATION_BINDING_MISMATCH"
  );


  const goodVerification = {
    payment_status:
      "PAYMENT_VERIFIED",

    request_id:
      requestId,

    transaction_hash:
      "0x" +
      "ab".repeat(32),

    chain_id:
      8453,

    network:
      "eip155:8453",

    asset:
      "USDC",

    amount_base_units:
      "1000",

    recipient
  };


  const matched =
    verifyPaymentAgainstExpectation(
      expectation,
      goodVerification,
      NOW + 2
    );


  assert.equal(
    matched.binding_status,
    "MATCHED"
  );


  /*
   * REQUEST ID MISMATCH
   */
  assert.throws(
    () =>
      verifyPaymentAgainstExpectation(
        expectation,
        {
          ...goodVerification,

          request_id:
            "SG-EVM-REQ-402SIGNAL-WRONG"
        },
        NOW + 2
      ),

    error =>
      error &&
      error.code ===
        "PAYMENT_REQUEST_ID_MISMATCH"
  );


  /*
   * NETWORK MISMATCH
   */
  assert.throws(
    () =>
      verifyPaymentAgainstExpectation(
        expectation,
        {
          ...goodVerification,

          network:
            "eip155:1"
        },
        NOW + 2
      ),

    error =>
      error &&
      error.code ===
        "PAYMENT_NETWORK_MISMATCH"
  );


  /*
   * ASSET MISMATCH
   */
  assert.throws(
    () =>
      verifyPaymentAgainstExpectation(
        expectation,
        {
          ...goodVerification,

          asset:
            "DAI"
        },
        NOW + 2
      ),

    error =>
      error &&
      error.code ===
        "PAYMENT_ASSET_MISMATCH"
  );


  /*
   * AMOUNT MISMATCH
   */
  assert.throws(
    () =>
      verifyPaymentAgainstExpectation(
        expectation,
        {
          ...goodVerification,

          amount_base_units:
            "999"
        },
        NOW + 2
      ),

    error =>
      error &&
      error.code ===
        "PAYMENT_AMOUNT_MISMATCH"
  );


  /*
   * RECIPIENT MISMATCH
   */
  assert.throws(
    () =>
      verifyPaymentAgainstExpectation(
        expectation,
        {
          ...goodVerification,

          recipient:
            "0x2222222222222222222222222222222222222222"
        },
        NOW + 2
      ),

    error =>
      error &&
      error.code ===
        "PAYMENT_RECIPIENT_MISMATCH"
  );


  /*
   * WRAPPED PAYMENT VERIFIER:
   * economic matching happens before SafeGate accepts it.
   */
  let verifierCalls =
    0;

  const boundVerifier =
    createBoundPaymentVerifier({
      expectation,

      nowEpochSeconds:
        () =>
          NOW + 3,

      verifyPayment:
        async () => {
          verifierCalls++;

          return {
            ok:
              true,

            verification:
              goodVerification
          };
        }
    });


  const consumed =
    new Set();


  const lifecycle =
    await execute402SignalObservedLifecycle(
      {
        prepaymentEvidence:
          boundPrepayment,

        request: {
          requestId,

          method:
            "POST",

          path:
            "/paid-agent-tool",

          body: {
            query:
              "synthetic"
          }
        },

        paymentProof: {
          synthetic:
            true
        }
      },

      {
        verifyPayment:
          boundVerifier,

        consumeOnce:
          async ({
            consumeKey
          }) => {

            if (
              consumed.has(
                consumeKey
              )
            ) {
              return false;
            }

            consumed.add(
              consumeKey
            );

            return true;
          },

        execute:
          async () => ({
            statusCode:
              200,

            body: {
              ok:
                true,

              result:
                "synthetic-result"
            }
          }),

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
    verifierCalls,
    1
  );


  assert.equal(
    lifecycle.pre_payment.assurance,
    "THIRD_PARTY_ATTESTED"
  );


  assert.equal(
    lifecycle.post_payment.assurance,
    "OBSERVED"
  );


  assert.equal(
    lifecycle.commerce_state.payment_bound,
    true
  );


  assert.equal(
    lifecycle.commerce_state.outcome_observed,
    true
  );


  assert.equal(
    lifecycle.commerce_state.commerce_verified,
    false
  );


  /*
   * SAME PAYMENT PROOF / TX CANNOT BE CONSUMED TWICE.
   */
  await assert.rejects(
    () =>
      execute402SignalObservedLifecycle(
        {
          prepaymentEvidence:
            boundPrepayment,

          request: {
            requestId,

            method:
              "POST",

            path:
              "/paid-agent-tool",

            body: {
              query:
                "synthetic"
            }
          },

          paymentProof: {
            synthetic:
              true
          }
        },

        {
          verifyPayment:
            boundVerifier,

          consumeOnce:
            async ({
              consumeKey
            }) => {

              if (
                consumed.has(
                  consumeKey
                )
              ) {
                return false;
              }

              consumed.add(
                consumeKey
              );

              return true;
            },

          execute:
            async () => ({
              statusCode:
                200,

              body: {
                should_not_execute:
                  true
              }
            }),

          now:
            () =>
              "2026-09-11T20:40:02.000Z"
        }
      ),

    error =>
      error &&
      error.code ===
        "ALREADY_CONSUMED"
  );


  /*
   * PORTABLE PROOF V2
   */
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


  const keyId =
    "SAFEGATE-STAGE12-TEST-001";


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


  const proofVerification1 =
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


  /*
   * Evidence verification itself is intentionally repeatable.
   * A portable proof is not a spend authorization token.
   */
  const proofVerification2 =
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
          "2026-09-11T20:40:06.000Z"
      }
    );


  assert.equal(
    proofVerification1.ok,
    true
  );


  assert.equal(
    proofVerification2.ok,
    true
  );


  /*
   * PROOF CANNOT BE REINTERPRETED AS WALLET AUTHORIZATION.
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
            "wallet-authorization",

          now:
            "2026-09-11T20:40:06.000Z"
        }
      ),

    error =>
      error &&
      error.code ===
        "UNEXPECTED_PURPOSE"
  );


  /*
   * DURABLE ECONOMIC REPLAY PROTECTION
   */
  const tempRoot =
    fs.mkdtempSync(
      path.join(
        os.tmpdir(),
        "safegate-stage12-"
      )
    );


  const dbPath =
    path.join(
      tempRoot,
      "intents.db"
    );


  let store;


  try {

    store =
      createSqlitePaymentIntentStore(
        dbPath
      );


    const coordinator =
      createCoordinator(
        store
      );


    let intent =
      await coordinator.initialize(
        {
          requestId,

          routeEvidenceId:
            prepayment.evidence_id,

          quoteSha256:
            verifiedAction.quote_sha256,

          network:
            expectation.terms.network,

          asset:
            expectation.terms.asset,

          amountBaseUnits:
            expectation
              .terms
              .amount_base_units,

          recipient:
            expectation
              .terms
              .recipient
        },

        {
          createdAt:
            "2026-09-11T20:41:00.000Z"
        }
      );


    /*
     * Changing an irrelevant local job identifier
     * cannot manufacture a second economic payment.
     */
    await assert.rejects(
      () =>
        coordinator.initialize(
          {
            requestId,

            routeEvidenceId:
              prepayment.evidence_id,

            quoteSha256:
              verifiedAction.quote_sha256,

            network:
              expectation.terms.network,

            asset:
              expectation.terms.asset,

            amountBaseUnits:
              expectation
                .terms
                .amount_base_units,

            recipient:
              expectation
                .terms
                .recipient,

            clientJobId:
              "ATTEMPT-TO-BYPASS-REPLAY"
          },

          {
            createdAt:
              "2026-09-11T20:41:01.000Z"
          }
        ),

      error =>
        error &&
        error.code ===
          "DUPLICATE_PAYMENT_FINGERPRINT"
    );


    intent =
      await coordinator.advance(
        intent.intent_id,
        intent.revision,
        STATES.ROUTE_VERIFIED,
        {
          at:
            "2026-09-11T20:41:02.000Z"
        }
      );


    intent =
      await coordinator.advance(
        intent.intent_id,
        intent.revision,
        STATES.BUDGET_RESERVED,
        {
          at:
            "2026-09-11T20:41:03.000Z"
        }
      );


    intent =
      await coordinator.advance(
        intent.intent_id,
        intent.revision,
        STATES.SUBMISSION_CLAIMED,
        {
          at:
            "2026-09-11T20:41:04.000Z"
        }
      );


    intent =
      await coordinator.advance(
        intent.intent_id,
        intent.revision,
        STATES.AMBIGUOUS,
        {
          at:
            "2026-09-11T20:41:05.000Z"
        }
      );


    /*
     * RECOVERY MAY OBSERVE, NEVER PAY.
     */
    await assert.rejects(
      () =>
        reconcileReadOnly(
          coordinator,
          intent.intent_id,
          {
            startedAt:
              "2026-09-11T20:41:06.000Z",

            completedAt:
              "2026-09-11T20:41:07.000Z",

            wallet: {
              prohibited:
                true
            },

            observe:
              async () => ({
                status:
                  "UNKNOWN"
              })
          }
        ),

      error =>
        error &&
        error.code ===
          "PAYMENT_CAPABILITY_FORBIDDEN_DURING_RECONCILIATION"
    );


    assert.equal(
      store.integrityCheck(),
      true
    );

  } finally {

    try {
      if (store) {
        store.close();
      }
    } catch {
      // Cleanup only.
    }


    try {
      fs.rmSync(
        tempRoot,
        {
          recursive:
            true,

          force:
            true
        }
      );
    } catch {
      // Cleanup only.
    }
  }


  console.log(
    "402SIGNAL_ADVERSARIAL_E2E=PASS"
  );

  console.log(
    "AUTHENTICATED_ECONOMIC_EXPECTATION=PASS"
  );

  console.log(
    "STALE_ROUTE=BLOCKED"
  );

  console.log(
    "ROUTE_EVIDENCE_MUTATION=BLOCKED"
  );

  console.log(
    "PAYMENT_REQUEST_MISMATCH=BLOCKED"
  );

  console.log(
    "WRONG_NETWORK=BLOCKED"
  );

  console.log(
    "WRONG_ASSET=BLOCKED"
  );

  console.log(
    "WRONG_AMOUNT=BLOCKED"
  );

  console.log(
    "WRONG_RECIPIENT=BLOCKED"
  );

  console.log(
    "PAYMENT_ECONOMIC_BINDING=PASS"
  );

  console.log(
    "PAYMENT_PROOF_REUSE=BLOCKED"
  );

  console.log(
    "ECONOMIC_REPLAY=BLOCKED"
  );

  console.log(
    "PROOF_REVERIFICATION=PASS"
  );

  console.log(
    "PROOF_AS_PAYMENT_AUTHORIZATION=BLOCKED"
  );

  console.log(
    "RECOVERY_WALLET_CAPABILITY=BLOCKED"
  );

  console.log(
    "PREPAYMENT=THIRD_PARTY_ATTESTED"
  );

  console.log(
    "POST_PAYMENT=OBSERVED"
  );

  console.log(
    "COMMERCE_VERIFIED=NO"
  );

  console.log(
    "PRODUCTION_EVIDENCE=NO"
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