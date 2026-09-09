"use strict";

const assert = require("assert");

const {
  hashOrderReference,
  mapSilentSwapSdkOrderState,
  executeSilentSwapSdkObservedCommerce,
  getSilentSwapSdkBridgeCapability
} = require(
  "../lib/silentswap-sdk-bridge"
);

const REQUEST_ID =
  "SG-EVM-REQ-SILENTSWAP-SDK-001";

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

async function expectError(
  fn,
  expectedCode
) {
  let caught;

  try {
    await fn();
  } catch (error) {
    caught = error;
  }

  assert.ok(caught);
  assert.strictEqual(
    caught.code,
    expectedCode
  );
}

async function run() {
  const capability =
    getSilentSwapSdkBridgeCapability();

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

  /*
   * Represents the serializable reference
   * returned by SilentSwap placeOrder().
   *
   * The bridge deliberately treats the
   * reference as opaque provider data.
   */
  const order = {
    reference: {
      privacy: true,
      id:
        "silent-order-reference-001",
      kind:
        "PRIVATE"
    },

    transactionHash:
      "0x" + "2".repeat(64)
  };

  /*
   * Represents a terminal OrderState received
   * from SilentSwap tracking.
   */
  const state = {
    id:
      "silent-order-001",

    status:
      "COMPLETED",

    recipients: [
      {
        address:
          "recipient-001",

        status:
          "COMPLETED"
      }
    ]
  };

  const source = {
    chainId: 8453,
    asset: "USDC",
    amount: "10.00"
  };

  const destination = {
    chainId: 1,
    asset: "USDC",
    amount: "9.95"
  };

  const mapped =
    mapSilentSwapSdkOrderState({
      order,
      state,
      requestBinding:
        REQUEST_BINDING,
      source,
      destination
    });

  assert.strictEqual(
    mapped.route_evidence.schema,
    "SILENTSWAP_ROUTE_EVIDENCE_V1"
  );

  assert.strictEqual(
    mapped.route_evidence.status,
    "COMPLETED"
  );

  assert.strictEqual(
    mapped.route_evidence
      .payment_reference,
    order.transactionHash
  );

  assert.strictEqual(
    mapped.route_evidence
      .recipients[0].status,
    "COMPLETED"
  );

  const hashA =
    hashOrderReference({
      privacy: true,
      id:
        "silent-order-reference-001",
      kind: "PRIVATE"
    });

  const hashB =
    hashOrderReference({
      kind: "PRIVATE",
      id:
        "silent-order-reference-001",
      privacy: true
    });

  assert.strictEqual(
    hashA,
    hashB
  );

  console.log(
    "SILENTSWAP_SDK_MAPPING_TEST=PASS"
  );

  const result =
    await executeSilentSwapSdkObservedCommerce({
      order,
      state,
      requestBinding:
        REQUEST_BINDING,
      source,
      destination,

      consumeRouteOnce:
        consumeStore(),

      middlewareInput: {
        request: {
          requestId:
            REQUEST_ID,

          method:
            "POST",

          path:
            "/silentswap/sdk-demo",

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
                "SILENTSWAP_SDK_REAL_CORE_EXECUTED"
            }
          }),

        now: (() => {
          const values = [
            "2026-09-10T00:00:00.000Z",
            "2026-09-10T00:00:01.000Z"
          ];

          return () =>
            values.shift() ||
            "2026-09-10T00:00:01.000Z";
        })()
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
    result.outcome.evidence
      .evidence.execution.outcome,
    "EXECUTION_COMPLETED"
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
    "SILENTSWAP_SDK_REAL_CORE_TEST=PASS"
  );

  /*
   * Non-terminal SDK state must not reach
   * downstream execution.
   */
  await expectError(
    () =>
      executeSilentSwapSdkObservedCommerce({
        order: {
          reference: {
            privacy: true,
            id: "pending-order"
          }
        },

        state: {
          status:
            "FULFILLING"
        },

        requestBinding:
          REQUEST_BINDING,

        source,
        destination,

        consumeRouteOnce:
          consumeStore(),

        middlewareInput: {},

        middlewareOptions: {}
      }),

    "SILENTSWAP_ROUTE_NOT_COMPLETED"
  );

  console.log(
    "SILENTSWAP_SDK_NONTERMINAL_TEST=PASS"
  );

  console.log(
    "SILENTSWAP_SDK_BRIDGE_V1_TESTS=PASS"
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
