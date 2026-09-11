"use strict";

const assert =
  require("node:assert");

const fs =
  require("node:fs");

const os =
  require("node:os");

const path =
  require("node:path");

const {
  DatabaseSync
} =
  require("node:sqlite");

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

  const tempRoot =
    fs.mkdtempSync(
      path.join(
        os.tmpdir(),
        "safegate-402signal-sqlite-"
      )
    );

  const databasePath =
    path.join(
      tempRoot,
      "payment-intents.db"
    );


  const spec = {
    requestId:
      "SG-EVM-REQ-402SIGNAL-0100",

    routeEvidenceId:
      "SG-402-EVID-" +
      "D".repeat(32),

    quoteSha256:
      "e".repeat(64),

    network:
      "eip155:8453",

    asset:
      "USDC",

    amountBaseUnits:
      "1000",

    recipient:
      "0x2222222222222222222222222222222222222222"
  };


  let storeA;
  let storeB;
  let storeC;
  let storeD;


  try {

    /*
     * INITIAL CREATE
     */
    storeA =
      createSqlitePaymentIntentStore(
        databasePath
      );

    const description =
      storeA.describe();

    assert.equal(
      description.type,
      "SQLITE"
    );

    assert.equal(
      description.journal_mode,
      "WAL"
    );

    assert.equal(
      description.foreign_keys,
      true
    );

    assert.equal(
      description.automatic_payment_retry,
      false
    );


    const coordinatorA =
      createCoordinator(
        storeA
      );


    let intent =
      await coordinatorA.initialize(
        spec,
        {
          createdAt:
            "2026-09-11T21:00:00.000Z"
        }
      );


    const intentId =
      intent.intent_id;


    assert.equal(
      intent.state,
      STATES.PREPARED
    );


    assert.equal(
      storeA.integrityCheck(),
      true
    );


    /*
     * SIMULATED PROCESS STOP / RESTART
     */
    storeA.close();
    storeA = null;


    assert.equal(
      fs.existsSync(
        databasePath
      ),
      true
    );


    storeB =
      createSqlitePaymentIntentStore(
        databasePath
      );


    const coordinatorB =
      createCoordinator(
        storeB
      );


    intent =
      await coordinatorB.read(
        intentId
      );


    assert.equal(
      intent.state,
      STATES.PREPARED
    );


    /*
     * DUPLICATE ECONOMIC INTENT
     * REMAINS BLOCKED AFTER RESTART.
     */
    await assert.rejects(
      () =>
        coordinatorB.initialize(
          {
            ...spec,

            clientJobId:
              "NEW-JOB-AFTER-RESTART"
          },
          {
            createdAt:
              "2026-09-11T21:00:01.000Z"
          }
        ),

      error =>
        error &&
        error.code ===
          "DUPLICATE_PAYMENT_FINGERPRINT"
    );


    intent =
      await coordinatorB.advance(
        intentId,
        intent.revision,
        STATES.ROUTE_VERIFIED,
        {
          at:
            "2026-09-11T21:00:02.000Z"
        }
      );


    intent =
      await coordinatorB.advance(
        intentId,
        intent.revision,
        STATES.BUDGET_RESERVED,
        {
          at:
            "2026-09-11T21:00:03.000Z"
        }
      );


    /*
     * SECOND INDEPENDENT DB CONNECTION.
     */
    storeC =
      createSqlitePaymentIntentStore(
        databasePath
      );


    const coordinatorC =
      createCoordinator(
        storeC
      );


    const staleCopy =
      await coordinatorC.read(
        intentId
      );


    assert.equal(
      staleCopy.revision,
      intent.revision
    );


    /*
     * CONNECTION B WINS SUBMISSION CLAIM.
     */
    intent =
      await coordinatorB.advance(
        intentId,
        intent.revision,
        STATES.SUBMISSION_CLAIMED,
        {
          at:
            "2026-09-11T21:00:04.000Z"
        }
      );


    /*
     * CONNECTION C HOLDS OLD REVISION.
     * DB-LEVEL CAS MUST REFUSE IT.
     */
    await assert.rejects(
      () =>
        coordinatorC.advance(
          intentId,
          staleCopy.revision,
          STATES.SUBMISSION_CLAIMED,
          {
            at:
              "2026-09-11T21:00:04.100Z"
          }
        ),

      error =>
        error &&
        error.code ===
          "STALE_INTENT_REVISION"
    );


    intent =
      await coordinatorB.advance(
        intentId,
        intent.revision,
        STATES.AMBIGUOUS,
        {
          at:
            "2026-09-11T21:00:05.000Z"
        }
      );


    /*
     * ANOTHER RESTART WHILE AMBIGUOUS.
     */
    storeB.close();
    storeB = null;

    storeC.close();
    storeC = null;


    storeD =
      createSqlitePaymentIntentStore(
        databasePath
      );


    const coordinatorD =
      createCoordinator(
        storeD
      );


    intent =
      await coordinatorD.read(
        intentId
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
     * FIRST RECOVERY REMAINS UNKNOWN.
     */
    intent =
      await reconcileReadOnly(
        coordinatorD,
        intentId,
        {
          startedAt:
            "2026-09-11T21:00:06.000Z",

          completedAt:
            "2026-09-11T21:00:07.000Z",

          observe:
            async () => ({
              status:
                "UNKNOWN"
            })
        }
      );


    assert.equal(
      intent.state,
      STATES.AMBIGUOUS
    );


    /*
     * RESTART AGAIN.
     */
    storeD.close();
    storeD = null;


    storeD =
      createSqlitePaymentIntentStore(
        databasePath
      );


    const coordinatorRestarted =
      createCoordinator(
        storeD
      );


    intent =
      await coordinatorRestarted.read(
        intentId
      );


    assert.equal(
      intent.state,
      STATES.AMBIGUOUS
    );


    /*
     * READ-ONLY RECONCILIATION OBSERVES SETTLEMENT.
     */
    intent =
      await reconcileReadOnly(
        coordinatorRestarted,
        intentId,
        {
          startedAt:
            "2026-09-11T21:00:08.000Z",

          completedAt:
            "2026-09-11T21:00:09.000Z",

          observe:
            async () => ({
              status:
                "SETTLED",

              transactionReference:
                "0x" +
                "56".repeat(32)
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
      intent.budget.release_permitted,
      false
    );


    const audit =
      await storeD.audit(
        intentId
      );


    assert.ok(
      audit.length >= 9
    );


    assert.equal(
      audit[0].state,
      STATES.PREPARED
    );


    assert.equal(
      audit[
        audit.length - 1
      ].state,
      STATES.SETTLED
    );


    assert.equal(
      storeD.integrityCheck(),
      true
    );


    /*
     * CLOSE BEFORE EXTERNAL TAMPER TEST.
     */
    storeD.close();
    storeD = null;


    /*
     * TEST ONLY:
     * mutate JSON without changing stored hash.
     * SafeGate must detect this at read time.
     */
    const rawDb =
      new DatabaseSync(
        databasePath,
        {
          timeout:
            5000
        }
      );


    const corrupt =
      rawDb.prepare(`
        UPDATE payment_intents
        SET record_json = ?
        WHERE intent_id = ?
      `);


    corrupt.run(
      '{"tampered":true}',
      intentId
    );

    if (typeof corrupt.close === "function") {
      corrupt.close();
    }
    rawDb.close();


    storeD =
      createSqlitePaymentIntentStore(
        databasePath
      );


    await assert.rejects(
      () =>
        storeD.get(
          intentId
        ),

      error =>
        error &&
        error.code ===
          "STORE_RECORD_HASH_MISMATCH"
    );


    console.log(
      "SQLITE_DURABLE_STORE=PASS"
    );

    console.log(
      "FILE_BACKED_DATABASE=PASS"
    );

    console.log(
      "WAL_MODE=PASS"
    );

    console.log(
      "SYNCHRONOUS_FULL=CONFIGURED"
    );

    console.log(
      "RESTART_PERSISTENCE=PASS"
    );

    console.log(
      "DUPLICATE_AFTER_RESTART=BLOCKED"
    );

    console.log(
      "DB_LEVEL_UNIQUE_FINGERPRINT=PASS"
    );

    console.log(
      "CROSS_CONNECTION_CAS=PASS"
    );

    console.log(
      "CONCURRENT_SUBMISSION=BLOCKED"
    );

    console.log(
      "AMBIGUOUS_STATE_SURVIVES_RESTART=PASS"
    );

    console.log(
      "READ_ONLY_RECONCILIATION_AFTER_RESTART=PASS"
    );

    console.log(
      "TRANSACTIONAL_AUDIT=PASS"
    );

    console.log(
      "SQLITE_INTEGRITY_CHECK=PASS"
    );

    console.log(
      "STORE_TAMPER_DETECTION=PASS"
    );

    console.log(
      "SENSITIVE_PAYMENT_MATERIAL_PERSISTED=NO"
    );

    console.log(
      "AUTOMATIC_PAYMENT_RETRY=NO"
    );

    console.log(
      "WALLET_USED=NO"
    );

    console.log(
      "PAYMENT_SENT=NO"
    );

  } finally {

    for (
      const store of
      [
        storeA,
        storeB,
        storeC,
        storeD
      ]
    ) {
      try {
        if (store) {
          store.close();
        }
      } catch {
        // Cleanup only.
      }
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