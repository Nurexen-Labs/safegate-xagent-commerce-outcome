"use strict";

const assert = require("node:assert/strict");
const {
  createPaymentIntent
} = require("../lib/colosseum-payment-intent");
const {
  createSupabasePaymentIntentStore
} = require("../lib/colosseum-supabase-payment-intent-store");

const REQUEST_ID =
  "SG-EVM-REQ-COLOSSEUM-STORE-0001";
const SENDER =
  "0x" + "55".repeat(20);
const RECEIVER =
  "0x" + "66".repeat(20);

function makeIntent() {
  return createPaymentIntent(
    {
      request: {
        requestId: REQUEST_ID,
        method: "POST",
        path: "/v1/agent/demo",
        body: {
          task: "store-test"
        }
      },
      payment: {
        paymentSender: SENDER,
        merchantReceiver: RECEIVER,
        amountBaseUnits: "1000"
      }
    },
    {
      createdAt:
        "2026-09-15T00:00:00.000Z",
      ttlSeconds: 900
    }
  );
}

async function main() {
  const intent = makeIntent();
  const calls = [];

  const store =
    createSupabasePaymentIntentStore({
      url:
        "https://example.supabase.co",
      serviceRoleKey:
        "TEST_SERVICE_ROLE_KEY_DO_NOT_USE",
      fetchImpl:
        async (url, options) => {
          const body =
            JSON.parse(options.body);

          calls.push({ url, body });

          if (
            url.endsWith(
              "/safegate_colosseum_create_payment_intent"
            )
          ) {
            return {
              ok: true,
              async json() {
                return true;
              }
            };
          }

          if (
            url.endsWith(
              "/safegate_colosseum_get_payment_intent"
            )
          ) {
            return {
              ok: true,
              async json() {
                return {
                  intent_id: intent.intent_id,
                  request_id:
                    intent.request.request_id,
                  request_hash:
                    intent.request.request_hash,
                  chain_id:
                    intent.payment.chain_id,
                  asset:
                    intent.payment.asset,
                  token_contract:
                    intent.payment.token_contract,
                  payment_sender:
                    intent.payment.payment_sender,
                  merchant_receiver:
                    intent.payment.merchant_receiver,
                  amount_base_units:
                    intent.payment.amount_base_units,
                  state: "OPEN",
                  created_at: intent.created_at,
                  expires_at: intent.expires_at
                };
              }
            };
          }

          throw new Error("UNEXPECTED_RPC");
        }
    });

  const created =
    await store.createOnce(intent);

  assert.equal(created, true);

  const loaded =
    await store.get(intent.intent_id);

  assert.equal(
    loaded.intent_id,
    intent.intent_id
  );

  assert.equal(
    loaded.request.request_hash,
    intent.request.request_hash
  );

  assert.equal(
    loaded.payment.amount_base_units,
    "1000"
  );

  assert.equal(calls.length, 2);

  assert.equal(
    Object.prototype.hasOwnProperty.call(
      calls[0].body,
      "serviceRoleKey"
    ),
    false
  );

  const duplicateStore =
    createSupabasePaymentIntentStore({
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

  const duplicate =
    await duplicateStore.createOnce(intent);

  assert.equal(duplicate, false);

  console.log(
    "COLOSSEUM_PAYMENT_INTENT_STORE_TEST=PASS"
  );
  console.log("CREATE_ONCE=PASS");
  console.log("DURABLE_READ_CONTRACT=PASS");
  console.log("SERVICE_ROLE_SERVER_ONLY=PASS");
}

main().catch(error => {
  console.error(
    error && error.stack
      ? error.stack
      : error
  );
  process.exit(1);
});