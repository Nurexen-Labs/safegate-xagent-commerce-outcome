"use strict";

const assert =
  require("node:assert");

const {
  STATES,
  buildPaymentFingerprint,
  policyForIntent,
  createCoordinator,
  reconcileReadOnly
} =
  require("../lib/402signal-payment-intent");


function createAtomicTestStore() {
  const records =
    new Map();

  const fingerprints =
    new Map();

  function clone(value) {
    return JSON.parse(
      JSON.stringify(value)
    );
  }

  return {
    async createOnce(intent) {
      if (
        records.has(
          intent.intent_id
        ) ||
        fingerprints.has(
          intent.payment_fingerprint
        )
      ) {
        return false;
      }

      records.set(
        intent.intent_id,
        clone(intent)
      );

      fingerprints.set(
        intent.payment_fingerprint,
        intent.intent_id
      );

      return true;
    },

    async get(intentId) {
      const value =
        records.get(intentId);

      return value
        ? clone(value)
        : null;
    },

    async compareAndSwap({
      intentId,
      expectedRevision,
      next
    }) {
      const current =
        records.get(
          intentId
        );

      if (
        !current ||
        current.revision !==
          expectedRevision
      ) {
        return false;
      }

      if (
        next.payment_fingerprint !==
        current.payment_fingerprint
      ) {
        throw new Error(
          "FINGERPRINT_MUTATION"
        );
      }

      records.set(
        intentId,
        clone(next)
      );

      return true;
    }
  };
}


async function main() {

  const store =
    createAtomicTestStore();

  const coordinator =
    createCoordinator(
      store
    );


  const spec = {
    requestId:
      "SG-EVM-REQ-402SIGNAL-0099",

    routeEvidenceId:
      "SG-402-EVID-" +
      "A".repeat(32),

    quoteSha256:
      "b".repeat(64),

    network:
      "eip155:8453",

    asset:
      "USDC",

    amountBaseUnits:
      "1000",

    recipient:
      "0x1111111111111111111111111111111111111111"
  };


  const fingerprintA =
    buildPaymentFingerprint(
      spec
    );

  const fingerprintB =
    buildPaymentFingerprint({
      ...spec,

      /*
       * unrelated caller metadata does not
       * create a fresh economic intent.
       */
      clientJobId:
        "DIFFERENT-JOB-ID"
    });

  assert.equal(
    fingerprintA,
    fingerprintB
  );


  let intent =
    await coordinator.initialize(
      spec,
      {
        createdAt:
          "2026-09-11T20:30:00.000Z"
      }
    );


  assert.equal(
    intent.state,
    STATES.PREPARED
  );


  /*
   * SAME ECONOMIC INTENT CANNOT BE RECREATED.
   */
  await assert.rejects(
    () =>
      coordinator.initialize(
        {
          ...spec,

          clientJobId:
            "NEW-ID-ATTEMPT"
        },
        {
          createdAt:
            "2026-09-11T20:30:01.000Z"
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
          "2026-09-11T20:30:02.000Z"
      }
    );


  intent =
    await coordinator.advance(
      intent.intent_id,
      intent.revision,
      STATES.BUDGET_RESERVED,
      {
        at:
          "2026-09-11T20:30:03.000Z"
      }
    );


  const beforeSubmission =
    await coordinator.read(
      intent.intent_id
    );


  const paymentPolicy =
    policyForIntent(
      beforeSubmission
    );

  assert.equal(
    paymentPolicy.allow_payment_submission,
    true
  );

  assert.equal(
    paymentPolicy.automatic_payment_retry,
    false
  );


  /*
   * FIRST WORKER WINS ATOMIC SUBMISSION CLAIM.
   */
  intent =
    await coordinator.advance(
      intent.intent_id,
      beforeSubmission.revision,
      STATES.SUBMISSION_CLAIMED,
      {
        at:
          "2026-09-11T20:30:04.000Z"
      }
    );


  /*
   * SECOND WORKER HELD SAME OLD REVISION.
   * MUST FAIL BEFORE PAYMENT SUBMISSION.
   */
  await assert.rejects(
    () =>
      coordinator.advance(
        intent.intent_id,
        beforeSubmission.revision,
        STATES.SUBMISSION_CLAIMED,
        {
          at:
            "2026-09-11T20:30:04.100Z"
        }
      ),

    error =>
      error &&
      error.code ===
        "STALE_INTENT_REVISION"
  );


  assert.equal(
    intent.payment.attempted,
    true
  );

  assert.equal(
    intent.payment.submission_claimed,
    true
  );


  /*
   * TRANSPORT RESULT UNKNOWN.
   */
  intent =
    await coordinator.advance(
      intent.intent_id,
      intent.revision,
      STATES.AMBIGUOUS,
      {
        at:
          "2026-09-11T20:30:05.000Z"
      }
    );


  const ambiguousPolicy =
    policyForIntent(
      intent
    );

  assert.equal(
    ambiguousPolicy.allow_payment_submission,
    false
  );

  assert.equal(
    ambiguousPolicy.reconcile_only,
    true
  );

  assert.equal(
    ambiguousPolicy.automatic_payment_retry,
    false
  );


  /*
   * DIRECT PAYMENT RETRY MUST FAIL.
   */
  assert.throws(
    () => {
      const {
        transitionIntent
      } =
        require(
          "../lib/402signal-payment-intent"
        );

      transitionIntent(
        intent,
        STATES.SUBMISSION_CLAIMED,
        {
          at:
            "2026-09-11T20:30:06.000Z"
        }
      );
    },

    error =>
      error &&
      error.code ===
        "INVALID_PAYMENT_STATE_TRANSITION"
  );


  /*
   * FIRST READ-ONLY RECONCILIATION:
   * observer cannot determine outcome.
   */
  let observerCalls =
    0;

  intent =
    await reconcileReadOnly(
      coordinator,
      intent.intent_id,
      {
        startedAt:
          "2026-09-11T20:30:07.000Z",

        completedAt:
          "2026-09-11T20:30:08.000Z",

        observe:
          async snapshot => {
            observerCalls++;

            assert.equal(
              snapshot.state,
              STATES.RECONCILING
            );

            assert.equal(
              snapshot.payment.attempted,
              true
            );

            return {
              status:
                "UNKNOWN"
            };
          }
      }
    );


  assert.equal(
    observerCalls,
    1
  );

  assert.equal(
    intent.state,
    STATES.AMBIGUOUS
  );

  assert.equal(
    intent.budget.reservation_status,
    "RESERVED"
  );

  assert.equal(
    intent.budget.release_permitted,
    false
  );


  /*
   * RECONCILIATION BOUNDARY CANNOT RECEIVE SIGNER/WALLET.
   */
  await assert.rejects(
    () =>
      reconcileReadOnly(
        coordinator,
        intent.intent_id,
        {
          startedAt:
            "2026-09-11T20:30:09.000Z",

          completedAt:
            "2026-09-11T20:30:10.000Z",

          wallet: {
            dangerous:
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


  /*
   * SECOND READ-ONLY RECONCILIATION:
   * independently observed settlement.
   */
  intent =
    await reconcileReadOnly(
      coordinator,
      intent.intent_id,
      {
        startedAt:
          "2026-09-11T20:30:11.000Z",

        completedAt:
          "2026-09-11T20:30:12.000Z",

        observe:
          async () => ({
            status:
              "SETTLED",

            transactionReference:
              "0x" +
              "ab".repeat(32)
          })
      }
    );


  assert.equal(
    intent.state,
    STATES.SETTLED
  );

  assert.equal(
    intent.payment.settlement_status,
    "SETTLED"
  );

  assert.equal(
    intent.budget.reservation_status,
    "RESERVED"
  );

  assert.equal(
    intent.budget.release_permitted,
    false
  );


  const settledPolicy =
    policyForIntent(
      intent
    );

  assert.equal(
    settledPolicy.terminal,
    true
  );

  assert.equal(
    settledPolicy.allow_payment_submission,
    false
  );

  assert.equal(
    settledPolicy.automatic_payment_retry,
    false
  );


  console.log(
    "PAYMENT_INTENT_STATE_MACHINE=PASS"
  );

  console.log(
    "ECONOMIC_INTENT_FINGERPRINT=PASS"
  );

  console.log(
    "DUPLICATE_INTENT=BLOCKED"
  );

  console.log(
    "ATOMIC_SUBMISSION_CLAIM=PASS"
  );

  console.log(
    "CONCURRENT_SUBMISSION=BLOCKED"
  );

  console.log(
    "AMBIGUOUS_AUTO_RETRY=BLOCKED"
  );

  console.log(
    "READ_ONLY_RECONCILIATION=PASS"
  );

  console.log(
    "RECONCILIATION_PAYMENT_CAPABILITY=BLOCKED"
  );

  console.log(
    "UNKNOWN_RESULT_PRESERVES_RESERVATION=PASS"
  );

  console.log(
    "SETTLEMENT_RECONCILIATION=PASS"
  );

  console.log(
    "AUTOMATIC_PAYMENT_RETRY=NO"
  );

  console.log(
    "BUDGET_AUTO_RELEASE=NO"
  );

  console.log(
    "PERSISTENT_STORE_ADAPTER=NOT_YET"
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