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
  executeAgentCommerce,
  verifySignedAgentCommerceProof
} =
  require("../lib/colosseum-agent-commerce");


const REQUEST_ID =
  "SG-EVM-REQ-COLOSSEUM-0001";

const TX_HASH =
  "0x" + "11".repeat(32);

const PAYMENT_SENDER =
  "0x" + "22".repeat(20);

const MERCHANT_RECEIVER =
  "0x" + "33".repeat(20);


function makeSigner() {
  const {
    publicKey,
    privateKey
  } =
    crypto.generateKeyPairSync(
      "ed25519"
    );

  const publicKeyPem =
    publicKey.export({
      type: "spki",
      format: "pem"
    });

  return {
    id:
      "safegate-colosseum-test",

    scheme:
      "Ed25519",

    publicKeyPem,

    sign:
      async bytes =>
        crypto.sign(
          null,
          bytes,
          privateKey
        )
  };
}


async function main() {
  const consumed =
    new Set();

  const times = [
    "2026-09-15T00:00:00.000Z",
    "2026-09-15T00:00:01.000Z"
  ];

  let timeIndex = 0;

  const result =
    await executeAgentCommerce(
      {
        request: {
          requestId:
            REQUEST_ID,

          method:
            "POST",

          path:
            "/v1/agent/report",

          body: {
            topic:
              "base-commerce"
          }
        },

        proof: {
          transactionHash:
            TX_HASH
        }
      },
      {
        verifyPayment:
          async () => ({
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
                12345678,

              payment_sender:
                PAYMENT_SENDER,

              merchant_receiver:
                MERCHANT_RECEIVER,

              amount_base_units:
                "100000"
            }
          }),

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
          async ({
            requestId,
            body
          }) => ({
            statusCode:
              200,

            body: {
              ok:
                true,

              requestId,

              result:
                "agent-service-completed",

              input:
                body
            }
          }),

        signer:
          makeSigner(),

        now:
          () => {
            const value =
              times[
                Math.min(
                  timeIndex,
                  times.length - 1
                )
              ];

            timeIndex += 1;

            return value;
          }
      }
    );

  assert.equal(
    result.ok,
    true
  );

  assert.equal(
    result.payment_status,
    "PAYMENT_VERIFIED"
  );

  assert.equal(
    result.request_binding,
    "VALID"
  );

  assert.equal(
    result.replay_status,
    "CONSUMED"
  );

  assert.equal(
    result.execution_outcome,
    "EXECUTION_COMPLETED"
  );

  assert.equal(
    result.assurance_level,
    "OBSERVED"
  );

  assert.equal(
    result.independently_validated,
    false
  );

  assert.equal(
    result.commerce_verified,
    false
  );

  assert.equal(
    result.commerce_proof
      .payload
      .payment
      .chain_id,
    8453
  );

  assert.equal(
    result.commerce_proof
      .payload
      .payment
      .token_contract,
    BASE_USDC
  );

  assert.equal(
    result.commerce_proof
      .payload
      .payment
      .amount_base_units,
    "100000"
  );

  const verified =
    verifySignedAgentCommerceProof(
      result.commerce_proof
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
    verified.assurance_level,
    "OBSERVED"
  );

  assert.equal(
    verified.commerce_verified,
    false
  );

  console.log(
    "COLOSSEUM_AGENT_COMMERCE_TEST=PASS"
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