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

const {
  createSupabaseConsumeOnce
} =
  require("../lib/colosseum-supabase-consume-store");


const REQUEST_ID =
  "SG-EVM-REQ-COLOSSEUM-DURABLE-9001";

const TX_HASH =
  "0x" + "91".repeat(32);

const PAYMENT_SENDER =
  "0x" + "92".repeat(20);

const MERCHANT_RECEIVER =
  "0x" + "93".repeat(20);


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
      "safegate-colosseum-durable-test",

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


function makeVerification() {
  return {
    ok:
      true,

    verification: {
      payment_status:
        "PAYMENT_VERIFIED",

      request_id:
        REQUEST_ID,

      transaction_hash:
        TX_HASH,

      chain_id:
        8453,

      asset:
        "USDC",

      token_contract:
        BASE_USDC,

      block_number:
        33344455,

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
        "/v1/agent/colosseum-demo",

      body: {
        task:
          "generate-commerce-result"
      }
    },

    proof: {
      transactionHash:
        TX_HASH
    }
  };
}


async function main() {
  /*
   * Simulates Supabase RPC semantics:
   * first unique chain+tx -> true
   * replay -> false
   *
   * No production DB is contacted.
   */
  const durableRows =
    new Map();

  let rpcCalls = 0;

  const consumeOnce =
    createSupabaseConsumeOnce({
      url:
        "https://example.supabase.co",

      serviceRoleKey:
        "TEST_SERVICE_ROLE_KEY_DO_NOT_USE",

      fetchImpl:
        async (_url, options) => {
          rpcCalls += 1;

          const body =
            JSON.parse(
              options.body
            );

          assert.equal(
            body.p_chain_id,
            8453
          );

          assert.equal(
            body.p_request_id,
            REQUEST_ID
          );

          assert.match(
            body.p_request_hash,
            /^[a-f0-9]{64}$/
          );

          assert.match(
            body.p_consume_key,
            /^[a-f0-9]{64}$/
          );

          assert.equal(
            body.p_transaction_hash,
            TX_HASH
          );

          const uniqueKey =
            body.p_chain_id +
            ":" +
            body.p_transaction_hash;

          const first =
            !durableRows.has(
              uniqueKey
            );

          if (first) {
            durableRows.set(
              uniqueKey,
              body
            );
          }

          return {
            ok:
              true,

            async json() {
              return first;
            }
          };
        }
    });

  const dependencies = {
    verifyPayment:
      async () =>
        makeVerification(),

    consumeOnce,

    execute:
      async ({
        requestId,
        method,
        path
      }) => ({
        statusCode:
          200,

        body: {
          requestId,
          method,
          path,
          result:
            "service-completed"
        }
      }),

    signer:
      makeSigner(),

    now:
      () =>
        "2026-09-15T01:00:00.000Z"
  };

  /*
   * First commerce execution.
   */
  const first =
    await executeAgentCommerce(
      makeInput(),
      dependencies
    );

  assert.equal(
    first.ok,
    true
  );

  assert.equal(
    first.payment_status,
    "PAYMENT_VERIFIED"
  );

  assert.equal(
    first.request_binding,
    "VALID"
  );

  assert.equal(
    first.replay_status,
    "CONSUMED"
  );

  assert.equal(
    first.execution_outcome,
    "EXECUTION_COMPLETED"
  );

  assert.equal(
    first.assurance_level,
    "OBSERVED"
  );

  assert.equal(
    first.independently_validated,
    false
  );

  assert.equal(
    first.commerce_verified,
    false
  );

  assert.equal(
    first.proof_verification
      .signature_status,
    "VERIFIED"
  );

  assert.equal(
    durableRows.size,
    1
  );

  /*
   * Exact same verified payment must not execute again.
   */
  let replayCode = null;

  try {
    await executeAgentCommerce(
      makeInput(),
      dependencies
    );
  } catch (error) {
    replayCode =
      error &&
      error.code;
  }

  assert.equal(
    replayCode,
    "ALREADY_CONSUMED"
  );

  assert.equal(
    durableRows.size,
    1
  );

  assert.equal(
    rpcCalls,
    2
  );

  console.log(
    "COLOSSEUM_DURABLE_AGENT_COMMERCE=PASS"
  );

  console.log(
    "FIRST_EXECUTION=PASS"
  );

  console.log(
    "SECOND_SAME_PAYMENT=ALREADY_CONSUMED"
  );

  console.log(
    "SIGNED_COMMERCE_PROOF=PASS"
  );

  console.log(
    "ASSURANCE=OBSERVED"
  );

  console.log(
    "COMMERCE_VERIFIED=NO"
  );

  console.log(
    "PROD_DB_USED=NO"
  );

  console.log(
    "PAYMENT_SENT=NO"
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