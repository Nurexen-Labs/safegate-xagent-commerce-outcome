"use strict";

const assert = require("assert");

const sdk =
  require("../packages/sdk");

const core =
  require(
    "../lib/silentswap-sdk-bridge"
  );

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

async function run() {
  assert.strictEqual(
    sdk.SDK_VERSION,
    "0.4.0"
  );

  assert.strictEqual(
    typeof sdk
      .executeSilentSwapObservedCommerce,
    "function"
  );

  assert.strictEqual(
    typeof sdk
      .mapSilentSwapOrderState,
    "function"
  );

  const order = {
    reference: {
      privacy: true,
      id:
        "silent-public-reference",
      kind:
        "PRIVATE"
    },

    transactionHash:
      "0x" + "2".repeat(64)
  };

  const state = {
    id:
      "silent-public-order",

    status:
      "COMPLETED",

    recipients: [
      {
        address:
          "recipient-public",

        status:
          "COMPLETED"
      }
    ]
  };

  const mapInput = {
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
    }
  };

  const publicMapped =
    sdk.mapSilentSwapOrderState(
      mapInput
    );

  const coreMapped =
    core.mapSilentSwapSdkOrderState(
      mapInput
    );

  assert.deepStrictEqual(
    publicMapped,
    coreMapped
  );

  console.log(
    "SILENTSWAP_PUBLIC_SDK_PARITY_TEST=PASS"
  );

  const capability =
    sdk.getSilentSwapCapability();

  assert.strictEqual(
    capability.semantics
      .route_assurance,
    "CLAIMED"
  );

  assert.strictEqual(
    capability.semantics
      .observed_outcome,
    "OBSERVED"
  );

  assert.strictEqual(
    capability.security.custody,
    false
  );

  const result =
    await sdk
      .executeSilentSwapObservedCommerce({
        ...mapInput,

        consumeRouteOnce:
          consumeStore(),

        middlewareInput: {
          request: {
            requestId:
              REQUEST_ID,

            method:
              "POST",

            path:
              "/silentswap/public-sdk",

            body: {
              service:
                "premium-intel"
            }
          },

          proof: {
            provider:
              "test"
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
                  "PUBLIC_SDK_EXECUTED"
              }
            })
        }
      });

  assert.strictEqual(
    result.assurance,
    "OBSERVED"
  );

  assert.strictEqual(
    result.route.assurance,
    "CLAIMED"
  );

  assert.strictEqual(
    result.outcome.assurance,
    "OBSERVED"
  );

  assert.strictEqual(
    result.commerce_verified,
    false
  );

  assert.strictEqual(
    result.independently_validated,
    false
  );

  console.log(
    "SILENTSWAP_PUBLIC_SDK_EXECUTION_TEST=PASS"
  );

  console.log(
    "SILENTSWAP_PUBLIC_SDK_ASSURANCE_TEST=PASS"
  );

  console.log(
    "SILENTSWAP_PUBLIC_SDK_NO_CUSTODY_TEST=PASS"
  );
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
