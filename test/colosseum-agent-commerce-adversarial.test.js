"use strict";

const assert =
  require("node:assert/strict");

const crypto =
  require("node:crypto");

const {
  BASE_USDC
} =
  require("../lib/base-usdc");

const {
  executeAgentCommerce
} =
  require("../lib/colosseum-agent-commerce");


const REQUEST_ID =
  "SG-EVM-REQ-COLOSSEUM-0002";

const OTHER_REQUEST_ID =
  "SG-EVM-REQ-COLOSSEUM-OTHER-0002";

const TX_HASH =
  "0x" + "44".repeat(32);

const PAYMENT_SENDER =
  "0x" + "55".repeat(20);

const MERCHANT_RECEIVER =
  "0x" + "66".repeat(20);


function makeSigner() {
  const {
    publicKey,
    privateKey
  } =
    crypto.generateKeyPairSync(
      "ed25519"
    );

  return {
    id:
      "safegate-colosseum-adversarial",

    scheme:
      "Ed25519",

    publicKeyPem:
      publicKey.export({
        type: "spki",
        format: "pem"
      }),

    sign:
      async bytes =>
        crypto.sign(
          null,
          bytes,
          privateKey
        )
  };
}


function makeVerification(
  requestId = REQUEST_ID
) {
  return {
    ok:
      true,

    verification: {
      payment_status:
        "PAYMENT_VERIFIED",

      request_id:
        requestId,

      transaction_hash:
        TX_HASH,

      chain_id:
        8453,

      asset:
        "USDC",

      token_contract:
        BASE_USDC,

      block_number:
        22334455,

      payment_sender:
        PAYMENT_SENDER,

      merchant_receiver:
        MERCHANT_RECEIVER,

      amount_base_units:
        "100000"
    }
  };
}


function makeInput() {
  return {
    request: {
      requestId:
        REQUEST_ID,

      method:
        "POST",

      path:
        "/v1/agent/intelligence",

      body: {
        query:
          "commerce-risk"
      }
    },

    proof: {
      transactionHash:
        TX_HASH,

      amountBaseUnits:
        "100000"
    }
  };
}


function makeBaseDependencies(
  consumed,
  verifyPayment
) {
  return {
    verifyPayment,

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
          result:
            "ok"
        }
      }),

    signer:
      makeSigner(),

    now:
      () =>
        "2026-09-15T00:10:00.000Z"
  };
}


async function expectCode(
  action,
  expectedCode
) {
  let seen = null;

  try {
    await action();
  } catch (error) {
    seen =
      error &&
      error.code;
  }

  assert.equal(
    seen,
    expectedCode
  );
}


async function main() {

  // ----------------------------------------------
  // Request binding mismatch must fail closed.
  // ----------------------------------------------

  await expectCode(
    () =>
      executeAgentCommerce(
        makeInput(),
        makeBaseDependencies(
          new Set(),
          async () =>
            makeVerification(
              OTHER_REQUEST_ID
            )
        )
      ),
    "REQUEST_BINDING_MISMATCH"
  );


  // ----------------------------------------------
  // Caller cannot elevate assurance.
  // ----------------------------------------------

  const elevated =
    makeInput();

  elevated.commerce_verified =
    true;

  await expectCode(
    () =>
      executeAgentCommerce(
        elevated,
        makeBaseDependencies(
          new Set(),
          async () =>
            makeVerification()
        )
      ),
    "CALLER_ASSURANCE_ELEVATION_FORBIDDEN"
  );


  // ----------------------------------------------
  // Payment mutation must be rejected by verifier.
  // ----------------------------------------------

  const mutated =
    makeInput();

  mutated.proof.amountBaseUnits =
    "999999";

  await expectCode(
    () =>
      executeAgentCommerce(
        mutated,
        makeBaseDependencies(
          new Set(),
          async proof => {
            if (
              proof.amountBaseUnits !==
              "100000"
            ) {
              const error =
                new Error(
                  "Payment amount mismatch."
                );

              error.code =
                "PAYMENT_AMOUNT_MISMATCH";

              throw error;
            }

            return makeVerification();
          }
        )
      ),
    "PAYMENT_AMOUNT_MISMATCH"
  );


  // ----------------------------------------------
  // Replay must fail ALREADY_CONSUMED.
  // ----------------------------------------------

  const replayConsumed =
    new Set();

  const replayDeps =
    makeBaseDependencies(
      replayConsumed,
      async () =>
        makeVerification()
    );

  const first =
    await executeAgentCommerce(
      makeInput(),
      replayDeps
    );

  assert.equal(
    first.ok,
    true
  );

  await expectCode(
    () =>
      executeAgentCommerce(
        makeInput(),
        replayDeps
      ),
    "ALREADY_CONSUMED"
  );


  // ----------------------------------------------
  // Execution failure must preserve observed evidence.
  // ----------------------------------------------

  const failureDeps =
    makeBaseDependencies(
      new Set(),
      async () =>
        makeVerification()
    );

  failureDeps.execute =
    async () => {
      const error =
        new Error(
          "Synthetic upstream failure."
        );

      error.code =
        "SYNTHETIC_UPSTREAM_FAILURE";

      throw error;
    };

  let executionFailure = null;

  try {
    await executeAgentCommerce(
      makeInput(),
      failureDeps
    );
  } catch (error) {
    executionFailure =
      error;
  }

  assert.ok(
    executionFailure
  );

  assert.equal(
    executionFailure.code,
    "UPSTREAM_EXECUTION_FAILED"
  );

  assert.equal(
    executionFailure
      .safegateEvidence
      .execution
      .outcome,
    "EXECUTION_FAILED"
  );

  assert.equal(
    executionFailure
      .safegateEvidence
      .assurance
      .level,
    "OBSERVED"
  );


  console.log(
    "COLOSSEUM_AGENT_COMMERCE_ADVERSARIAL_TEST=PASS"
  );
}


main().catch(error => {
  console.error(
    error &&
    error.stack
      ? error.stack
      : error
  );

  process.exit(1);
});