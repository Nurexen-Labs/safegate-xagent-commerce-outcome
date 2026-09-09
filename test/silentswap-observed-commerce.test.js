"use strict";

const assert = require("assert");

const {
  executeSilentSwapObservedCommerce,
  getSilentSwapObservedCapability
} = require(
  "../lib/silentswap-observed-commerce"
);

const REQUEST_BINDING =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function routeEvidence(
  overrides = {}
) {
  return {
    schema:
      "SILENTSWAP_ROUTE_EVIDENCE_V1",

    provider:
      "SILENTSWAP",

    order_id:
      "ss-observed-001",

    status:
      "COMPLETED",

    request_binding:
      REQUEST_BINDING,

    payment_reference:
      "ss-payment-observed-001",

    source: {
      chain: "BASE",
      asset: "USDC",
      amount: "10.00"
    },

    destination: {
      chain: "ETHEREUM",
      asset: "USDC",
      amount: "9.95"
    },

    ...overrides
  };
}

function createConsumeStore() {
  const consumed = new Set();

  return async ({ consumeKey }) => {
    if (consumed.has(consumeKey)) {
      return false;
    }

    consumed.add(consumeKey);
    return true;
  };
}

async function expectError(
  fn,
  expectedCode
) {
  let error = null;

  try {
    await fn();
  } catch (caught) {
    error = caught;
  }

  assert.ok(
    error,
    `expected ${expectedCode}`
  );

  assert.strictEqual(
    error.code,
    expectedCode
  );

  return error;
}

async function run() {
  /*
   * Capability semantics.
   */
  const capability =
    getSilentSwapObservedCapability();

  assert.strictEqual(
    capability.semantics
      .route_assurance,
    "CLAIMED"
  );

  assert.strictEqual(
    capability.semantics
      .outcome_assurance,
    "OBSERVED"
  );

  assert.strictEqual(
    capability.semantics
      .commerce_verified,
    false
  );

  /*
   * Happy path.
   */
  const consumeRouteOnce =
    createConsumeStore();

  let middlewareCalls = 0;

  const fakeObservedMiddleware =
    async (input) => {
      middlewareCalls += 1;

      assert.strictEqual(
        input.marker,
        "REAL_CORE_BOUNDARY"
      );

      return {
        ok: true,

        evidence: {
          schema:
            "SAFEGATE_OBSERVED_COMMERCE_V1",

          assurance:
            "OBSERVED",

          commerce_verified:
            false,

          replay_safety: {
            consume_status:
              "CONSUMED"
          },

          execution: {
            outcome:
              "EXECUTION_COMPLETED",

            response_hash:
              "observed-response-hash"
          }
        }
      };
    };

  const result =
    await executeSilentSwapObservedCommerce({
      routeEvidence:
        routeEvidence(),

      expectedRequestBinding:
        REQUEST_BINDING,

      consumeRouteOnce,

      middlewareInput: {
        marker:
          "REAL_CORE_BOUNDARY"
      },

      executeObservedCommerceFn:
        fakeObservedMiddleware
    });

  assert.strictEqual(
    middlewareCalls,
    1
  );

  assert.strictEqual(
    result.ok,
    true
  );

  assert.strictEqual(
    result.decision,
    "ROUTE_ACCEPTED_OUTCOME_OBSERVED"
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
    result.commerce_verified,
    false
  );

  assert.strictEqual(
    result.independently_validated,
    false
  );

  console.log(
    "SILENTSWAP_OBSERVED_COMPOSITION_TEST=PASS"
  );

  /*
   * Replay must stop before second downstream
   * execution.
   */
  await expectError(
    () =>
      executeSilentSwapObservedCommerce({
        routeEvidence:
          routeEvidence(),

        expectedRequestBinding:
          REQUEST_BINDING,

        consumeRouteOnce,

        middlewareInput: {
          marker:
            "REAL_CORE_BOUNDARY"
        },

        executeObservedCommerceFn:
          fakeObservedMiddleware
      }),

    "ALREADY_CONSUMED"
  );

  assert.strictEqual(
    middlewareCalls,
    1
  );

  console.log(
    "SILENTSWAP_COMPOSITION_REPLAY_TEST=PASS"
  );

  /*
   * Downstream execution failure must retain
   * both route and SafeGate failure evidence.
   */
  const failureConsume =
    createConsumeStore();

  const downstreamError =
    await expectError(
      () =>
        executeSilentSwapObservedCommerce({
          routeEvidence:
            routeEvidence({
              order_id:
                "ss-observed-failure-001",

              payment_reference:
                "ss-payment-failure-001"
            }),

          expectedRequestBinding:
            REQUEST_BINDING,

          consumeRouteOnce:
            failureConsume,

          middlewareInput: {
            marker:
              "FAILURE"
          },

          executeObservedCommerceFn:
            async () => {
              const error =
                new Error(
                  "downstream failed"
                );

              error.code =
                "UPSTREAM_EXECUTION_FAILED";

              error.safegateEvidence = {
                schema:
                  "SAFEGATE_OBSERVED_COMMERCE_V1",

                assurance:
                  "OBSERVED",

                execution: {
                  outcome:
                    "EXECUTION_FAILED"
                }
              };

              throw error;
            }
        }),

      "UPSTREAM_EXECUTION_FAILED"
    );

  assert.ok(
    downstreamError
      .safegateCompositionEvidence
  );

  assert.strictEqual(
    downstreamError
      .safegateCompositionEvidence
      .route.assurance,
    "CLAIMED"
  );

  assert.strictEqual(
    downstreamError
      .safegateCompositionEvidence
      .outcome.assurance,
    "OBSERVED"
  );

  assert.strictEqual(
    downstreamError
      .safegateCompositionEvidence
      .commerce_verified,
    false
  );

  console.log(
    "SILENTSWAP_DOWNSTREAM_FAILURE_TEST=PASS"
  );

  /*
   * Semantic guard:
   * provider route completion must never
   * manufacture OBSERVED assurance.
   */
  const weakConsume =
    createConsumeStore();

  await expectError(
    () =>
      executeSilentSwapObservedCommerce({
        routeEvidence:
          routeEvidence({
            order_id:
              "ss-weak-001",

            payment_reference:
              "ss-weak-payment-001"
          }),

        expectedRequestBinding:
          REQUEST_BINDING,

        consumeRouteOnce:
          weakConsume,

        middlewareInput: {},

        executeObservedCommerceFn:
          async () => ({
            ok: true,

            evidence: {
              assurance:
                "CLAIMED"
            }
          })
      }),

    "MIDDLEWARE_NOT_OBSERVED"
  );

  console.log(
    "SILENTSWAP_ASSURANCE_UPGRADE_TEST=PASS"
  );

  console.log(
    "SILENTSWAP_OBSERVED_COMPOSITION_V1_TESTS=PASS"
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
