"use strict";

const assert = require("node:assert/strict");
const { BASE_USDC } = require("../lib/base-usdc");
const {
  createPaymentIntent,
  verifyIntentBoundBasePayment
} = require("../lib/colosseum-payment-intent");

const REQUEST_ID =
  "SG-EVM-REQ-COLOSSEUM-INTENT-0001";
const SENDER =
  "0x" + "11".repeat(20);
const RECEIVER =
  "0x" + "22".repeat(20);
const TX_HASH =
  "0x" + "33".repeat(32);
const CREATED_AT =
  "2026-09-15T00:00:00.000Z";

function request() {
  return {
    requestId: REQUEST_ID,
    method: "POST",
    path: "/v1/agent/colosseum-demo",
    body: {
      task: "premium-result",
      sku: "SG-DEMO-001"
    }
  };
}

function makeIntent() {
  return createPaymentIntent(
    {
      request: request(),
      payment: {
        paymentSender: SENDER,
        merchantReceiver: RECEIVER,
        amountBaseUnits: "100000"
      }
    },
    {
      createdAt: CREATED_AT,
      ttlSeconds: 900
    }
  );
}

async function main() {
  const intent = makeIntent();

  assert.match(
    intent.intent_id,
    /^SG-COL-INTENT-[A-F0-9]{32}$/
  );

  assert.equal(
    intent.payment.chain_id,
    8453
  );

  assert.equal(
    intent.payment.token_contract,
    BASE_USDC
  );

  let expectedEconomics = null;

  const verified =
    await verifyIntentBoundBasePayment(
      {
        intent,
        request: request(),
        transactionHash: TX_HASH
      },
      {
        now:
          () => "2026-09-15T00:05:00.000Z",
        verifyTransfer:
          async expected => {
            expectedEconomics = expected;

            return {
              payment_status: "PAYMENT_VERIFIED",
              chain_id: 8453,
              asset: "USDC",
              token_contract: BASE_USDC,
              transaction_hash: TX_HASH,
              block_number: 12345678,
              payment_sender: SENDER,
              merchant_receiver: RECEIVER,
              amount_base_units: "100000"
            };
          }
      }
    );

  assert.deepEqual(
    expectedEconomics,
    {
      transactionHash: TX_HASH,
      paymentSender: SENDER,
      merchantReceiver: RECEIVER,
      amountBaseUnits: "100000"
    }
  );

  assert.equal(verified.ok, true);

  assert.equal(
    verified.verification.request_id,
    REQUEST_ID
  );

  assert.equal(
    verified.verification.request_hash,
    intent.request.request_hash
  );

  let requestMismatch = null;

  try {
    await verifyIntentBoundBasePayment(
      {
        intent,
        request: {
          ...request(),
          body: {
            task: "tampered-result"
          }
        },
        transactionHash: TX_HASH
      },
      {
        now:
          () => "2026-09-15T00:05:00.000Z",
        verifyTransfer:
          async () => {
            throw new Error("SHOULD_NOT_RUN");
          }
      }
    );
  } catch (error) {
    requestMismatch =
      error && error.code;
  }

  assert.equal(
    requestMismatch,
    "PAYMENT_INTENT_REQUEST_MISMATCH"
  );

  let expired = null;

  try {
    await verifyIntentBoundBasePayment(
      {
        intent,
        request: request(),
        transactionHash: TX_HASH
      },
      {
        now:
          () => "2026-09-15T00:16:00.000Z",
        verifyTransfer:
          async () => {
            throw new Error("SHOULD_NOT_RUN");
          }
      }
    );
  } catch (error) {
    expired =
      error && error.code;
  }

  assert.equal(
    expired,
    "PAYMENT_INTENT_EXPIRED"
  );

  let amountMismatch = null;

  try {
    await verifyIntentBoundBasePayment(
      {
        intent,
        request: request(),
        transactionHash: TX_HASH
      },
      {
        now:
          () => "2026-09-15T00:05:00.000Z",
        verifyTransfer:
          async () => ({
            payment_status: "PAYMENT_VERIFIED",
            chain_id: 8453,
            asset: "USDC",
            token_contract: BASE_USDC,
            transaction_hash: TX_HASH,
            block_number: 123,
            payment_sender: SENDER,
            merchant_receiver: RECEIVER,
            amount_base_units: "99999"
          })
      }
    );
  } catch (error) {
    amountMismatch =
      error && error.code;
  }

  assert.equal(
    amountMismatch,
    "PAYMENT_INTENT_AMOUNT_MISMATCH"
  );

  let receiverMismatch = null;

  try {
    await verifyIntentBoundBasePayment(
      {
        intent,
        request: request(),
        transactionHash: TX_HASH
      },
      {
        now:
          () => "2026-09-15T00:05:00.000Z",
        verifyTransfer:
          async () => ({
            payment_status: "PAYMENT_VERIFIED",
            chain_id: 8453,
            asset: "USDC",
            token_contract: BASE_USDC,
            transaction_hash: TX_HASH,
            block_number: 123,
            payment_sender: SENDER,
            merchant_receiver:
              "0x" + "44".repeat(20),
            amount_base_units: "100000"
          })
      }
    );
  } catch (error) {
    receiverMismatch =
      error && error.code;
  }

  assert.equal(
    receiverMismatch,
    "PAYMENT_INTENT_RECEIVER_MISMATCH"
  );

  console.log("COLOSSEUM_PAYMENT_INTENT_TEST=PASS");
  console.log("REQUEST_HASH_BINDING=PASS");
  console.log("EXACT_PAYMENT_ECONOMICS=PASS");
  console.log("INTENT_EXPIRY=PASS");
}

main().catch(error => {
  console.error(
    error && error.stack
      ? error.stack
      : error
  );
  process.exit(1);
});