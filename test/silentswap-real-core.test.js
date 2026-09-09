"use strict";

const assert = require("assert");

const {
  executeSilentSwapObservedCommerce
} = require(
  "../lib/silentswap-observed-commerce"
);

const REQUEST_ID =
  "SG-EVM-REQ-SILENTSWAP-001";

const REQUEST_BINDING =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function routeEvidence() {
  return {
    schema:
      "SILENTSWAP_ROUTE_EVIDENCE_V1",

    provider:
      "SILENTSWAP",

    order_id:
      "ss-real-core-001",

    status:
      "COMPLETED",

    request_binding:
      REQUEST_BINDING,

    payment_reference:
      "ss-real-payment-001",

    source: {
      chain: "BASE",
      asset: "USDC",
      amount: "10.00"
    },

    destination: {
      chain: "ETHEREUM",
      asset: "USDC",
      amount: "9.95"
    }
  };
}

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
  const routeConsumeOnce =
    consumeStore();

  const paymentConsumeOnce =
    consumeStore();

  const result =
    await executeSilentSwapObservedCommerce({
      routeEvidence:
        routeEvidence(),

      expectedRequestBinding:
        REQUEST_BINDING,

      consumeRouteOnce:
        routeConsumeOnce,

      middlewareInput: {
        request: {
          requestId:
            REQUEST_ID,

          method:
            "POST",

          path:
            "/silent-swap/demo",

          body: {
            product:
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
                "1".repeat(64),

              chain_id:
                8453,

              asset:
                "USDC"
            }
          }),

        consumeOnce:
          paymentConsumeOnce,

        execute:
          async () => ({
            statusCode:
              200,

            body: {
              ok: true,
              result:
                "REAL_CORE_EXECUTED"
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
    result.ok,
    true
  );

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
      .assurance_level,
    "OBSERVED"
  );

  assert.strictEqual(
    result.outcome.evidence
      .evidence.assurance.level,
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
    "SILENTSWAP_REAL_CORE_INTEGRATION_TEST=PASS"
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
