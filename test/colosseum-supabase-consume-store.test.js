"use strict";

const assert = require("node:assert/strict");

const {
  createSupabaseConsumeOnce
} = require("../lib/colosseum-supabase-consume-store");

const CONSUME_KEY =
  "a".repeat(64);

const REQUEST_HASH =
  "b".repeat(64);

const TX_HASH =
  "0x" + "c".repeat(64);

async function main() {
  let captured = null;

  const consumeOnce =
    createSupabaseConsumeOnce({
      url:
        "https://example.supabase.co",

      serviceRoleKey:
        "TEST_SERVICE_ROLE_KEY_DO_NOT_USE",

      fetchImpl:
        async (url, options) => {
          captured = {
            url,
            options
          };

          return {
            ok: true,

            async json() {
              return true;
            }
          };
        }
    });

  const first =
    await consumeOnce({
      consumeKey:
        CONSUME_KEY,

      requestId:
        "SG-EVM-REQ-COLOSSEUM-DURABLE-0001",

      requestHash:
        REQUEST_HASH,

      chainId:
        8453,

      transactionHash:
        TX_HASH
    });

  assert.equal(first, true);

  assert.equal(
    captured.url,
    "https://example.supabase.co/rest/v1/rpc/safegate_colosseum_consume_once"
  );

  assert.equal(
    captured.options.method,
    "POST"
  );

  const body =
    JSON.parse(
      captured.options.body
    );

  assert.equal(
    body.p_consume_key,
    CONSUME_KEY
  );

  assert.equal(
    body.p_chain_id,
    8453
  );

  assert.equal(
    body.p_transaction_hash,
    TX_HASH
  );

  assert.equal(
    Object.prototype.hasOwnProperty.call(
      body,
      "serviceRoleKey"
    ),
    false
  );

  const replayStore =
    createSupabaseConsumeOnce({
      url:
        "https://example.supabase.co",

      serviceRoleKey:
        "TEST_KEY",

      fetchImpl:
        async () => ({
          ok: true,

          async json() {
            return false;
          }
        })
    });

  const replay =
    await replayStore({
      consumeKey:
        CONSUME_KEY,

      requestId:
        "SG-EVM-REQ-COLOSSEUM-DURABLE-0001",

      requestHash:
        REQUEST_HASH,

      chainId:
        8453,

      transactionHash:
        TX_HASH
    });

  assert.equal(replay, false);

  const unavailableStore =
    createSupabaseConsumeOnce({
      url:
        "https://example.supabase.co",

      serviceRoleKey:
        "TEST_KEY",

      fetchImpl:
        async () => ({
          ok: false
        })
    });

  let unavailableCode = null;

  try {
    await unavailableStore({
      consumeKey:
        CONSUME_KEY,

      requestId:
        "SG-EVM-REQ-COLOSSEUM-DURABLE-0001",

      requestHash:
        REQUEST_HASH,

      chainId:
        8453,

      transactionHash:
        TX_HASH
    });
  } catch (error) {
    unavailableCode =
      error && error.code;
  }

  assert.equal(
    unavailableCode,
    "DURABLE_CONSUME_STORE_UNAVAILABLE"
  );

  console.log(
    "COLOSSEUM_SUPABASE_CONSUME_STORE_TEST=PASS"
  );
}

main().catch(error => {
  console.error(
    error && error.stack
      ? error.stack
      : error
  );

  process.exit(1);
});