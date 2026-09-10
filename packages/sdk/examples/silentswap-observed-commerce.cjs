"use strict";

const {
  executeSilentSwapObservedCommerce
} = require("..");

const REQUEST_ID =
  "SG-EVM-REQ-SILENTSWAP-PUBLIC-001";

const REQUEST_BINDING =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function consumeStore() {
  const used = new Set();

  return async ({ consumeKey }) => {
    if (used.has(consumeKey)) {
      return false;
    }

    used.add(consumeKey);
    return true;
  };
}

async function main() {
  /*
   * Structurally compatible with values
   * produced by @silentswap/sdk:
   *
   *   placeOrder(...).reference
   *   tracked OrderState
   */
  const order = {
    reference: {
      privacy: true,
      id: "silent-reference-demo",
      kind: "PRIVATE"
    },

    transactionHash:
      "0x" + "2".repeat(64)
  };

  const state = {
    id: "silent-order-demo",
    status: "COMPLETED",

    recipients: [
      {
        address:
          "recipient-demo",

        status:
          "COMPLETED"
      }
    ]
  };

  const result =
    await executeSilentSwapObservedCommerce({
      order,
      state,

      requestBinding:
        REQUEST_BINDING,

      source: {
        chainId: 8453,
        asset: "USDC",
        amount: "10.00"
      },

      destination: {
        chainId: 1,
        asset: "USDC",
        amount: "9.95"
      },

      consumeRouteOnce:
        consumeStore(),

      middlewareInput: {
        request: {
          requestId:
            REQUEST_ID,

          method:
            "POST",

          path:
            "/agent/premium-intel",

          body: {
            query:
              "example request"
          }
        },

        proof: {
          provider:
            "application-payment-proof"
        }
      },

      middlewareOptions: {
        verifyPayment:
          async () => ({
            ok: true,

            verification: {
              payment_status:
                "PAYMENT_VERIFIED",

              request_id:
                REQUEST_ID,

              transaction_hash:
                "0x" +
                "3".repeat(64),

              chain_id:
                8453,

              asset:
                "USDC"
            }
          }),

        consumeOnce:
          consumeStore(),

        execute:
          async () => ({
            statusCode: 200,

            body: {
              ok: true,
              result:
                "PAID_SERVICE_EXECUTED"
            }
          })
      }
    });

  console.log(
    "SILENTSWAP_PUBLIC_SDK_EXAMPLE=PASS"
  );

  console.log(
    "ROUTE_ASSURANCE=" +
    result.route.assurance
  );

  console.log(
    "OUTCOME_ASSURANCE=" +
    result.outcome.assurance
  );

  console.log(
    "COMMERCE_VERIFIED=" +
    result.commerce_verified
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
