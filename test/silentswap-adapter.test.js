"use strict";

const assert = require("assert");

const {
  INPUT_SCHEMA,
  normalizeSilentSwapRouteEvidence,
  buildSilentSwapConsumeKey,
  buildSilentSwapEvidenceHash,
  verifySilentSwapRouteEvidence,
  getSilentSwapAdapterCapability
} = require("../lib/silentswap-adapter");

const REQUEST_BINDING =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function makeEvidence(overrides = {}) {
  return {
    schema: INPUT_SCHEMA,
    provider: "SilentSwap",
    order_id: "ss-order-001",
    status: "COMPLETED",

    request_binding:
      REQUEST_BINDING,

    payment_reference:
      "ss-payment-ref-001",

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

async function expectError(
  fn,
  expectedCode
) {
  let caught = null;

  try {
    await fn();
  } catch (error) {
    caught = error;
  }

  assert.ok(
    caught,
    `expected ${expectedCode}`
  );

  assert.strictEqual(
    caught.code,
    expectedCode
  );

  return caught;
}

async function run() {
  const capability =
    getSilentSwapAdapterCapability();

  assert.strictEqual(
    capability.capability,
    "safegate_silentswap_route_adapter"
  );

  assert.strictEqual(
    capability.semantics
      .assurance_ceiling,
    "CLAIMED"
  );

  assert.strictEqual(
    capability.semantics
      .commerce_verified,
    false
  );

  /*
   * Deterministic normalization.
   * Unknown/raw provider fields must not leak
   * into SafeGate evidence.
   */
  const a =
    normalizeSilentSwapRouteEvidence(
      makeEvidence({
        ignored_secret:
          "MUST_NOT_APPEAR"
      })
    );

  const b =
    normalizeSilentSwapRouteEvidence({
      destination: {
        amount: "9.95",
        asset: "USDC",
        chain: "ETHEREUM"
      },

      payment_reference:
        "ss-payment-ref-001",

      provider:
        "SILENTSWAP",

      status:
        "COMPLETED",

      request_binding:
        REQUEST_BINDING,

      order_id:
        "ss-order-001",

      source: {
        amount: "10.00",
        chain: "BASE",
        asset: "USDC"
      },

      schema:
        INPUT_SCHEMA
    });

  assert.deepStrictEqual(a, b);

  assert.strictEqual(
    JSON.stringify(a).includes(
      "MUST_NOT_APPEAR"
    ),
    false
  );

  assert.strictEqual(
    buildSilentSwapConsumeKey(a),
    buildSilentSwapConsumeKey(b)
  );

  assert.strictEqual(
    buildSilentSwapEvidenceHash(a),
    buildSilentSwapEvidenceHash(b)
  );

  /*
   * Happy path.
   */
  const consumed = new Set();

  const consumeOnce =
    async ({ consumeKey }) => {
      if (consumed.has(consumeKey)) {
        return false;
      }

      consumed.add(consumeKey);
      return true;
    };

  const result =
    await verifySilentSwapRouteEvidence({
      routeEvidence:
        makeEvidence(),

      expectedRequestBinding:
        REQUEST_BINDING,

      consumeOnce
    });

  assert.strictEqual(
    result.ok,
    true
  );

  assert.strictEqual(
    result.decision,
    "ROUTE_EVIDENCE_ACCEPTED"
  );

  assert.strictEqual(
    result.binding.status,
    "VALID"
  );

  assert.strictEqual(
    result.replay_safety
      .consume_status,
    "CONSUMED"
  );

  assert.strictEqual(
    result.route.status,
    "PROVIDER_REPORTED_COMPLETED"
  );

  console.log(
    "SILENTSWAP_ADAPTER_CONTRACT_TEST=PASS"
  );

  /*
   * Replay.
   */
  const replayError =
    await expectError(
      () =>
        verifySilentSwapRouteEvidence({
          routeEvidence:
            makeEvidence(),

          expectedRequestBinding:
            REQUEST_BINDING,

          consumeOnce
        }),
      "ALREADY_CONSUMED"
    );

  assert.strictEqual(
    replayError.statusCode,
    409
  );

  console.log(
    "SILENTSWAP_REPLAY_TEST=PASS"
  );

  /*
   * Request binding mismatch must fail
   * before consume.
   */
  let mismatchConsumed = false;

  await expectError(
    () =>
      verifySilentSwapRouteEvidence({
        routeEvidence:
          makeEvidence({
            request_binding:
              "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
          }),

        expectedRequestBinding:
          REQUEST_BINDING,

        consumeOnce: async () => {
          mismatchConsumed = true;
          return true;
        }
      }),

    "REQUEST_BINDING_MISMATCH"
  );

  assert.strictEqual(
    mismatchConsumed,
    false
  );

  console.log(
    "SILENTSWAP_NEGATIVE_BINDING_TEST=PASS"
  );

  /*
   * Non-terminal route must not be
   * represented as completed evidence.
   */
  await expectError(
    () =>
      verifySilentSwapRouteEvidence({
        routeEvidence:
          makeEvidence({
            status:
              "FULFILLING",
            order_id:
              "ss-order-002"
          }),

        expectedRequestBinding:
          REQUEST_BINDING,

        consumeOnce:
          async () => true
      }),

    "SILENTSWAP_ROUTE_NOT_COMPLETED"
  );

  /*
   * Split recipient safety.
   */
  await expectError(
    () =>
      verifySilentSwapRouteEvidence({
        routeEvidence:
          makeEvidence({
            order_id:
              "ss-order-003",

            recipients: [
              {
                id: "recipient-1",
                status: "COMPLETED"
              },
              {
                id: "recipient-2",
                status: "FULFILLING"
              }
            ]
          }),

        expectedRequestBinding:
          REQUEST_BINDING,

        consumeOnce:
          async () => true
      }),

    "SILENTSWAP_RECIPIENT_NOT_COMPLETED"
  );

  /*
   * Assurance invariant.
   *
   * SilentSwap route completion alone
   * MUST NOT become OBSERVED/VALIDATED
   * commerce.
   */
  assert.strictEqual(
    result.assurance,
    "CLAIMED"
  );

  assert.strictEqual(
    result.commerce_verified,
    false
  );

  assert.strictEqual(
    result.independently_validated,
    false
  );

  assert.strictEqual(
    result.evidence
      .evidence_class,
    "PROVIDER_ROUTE_EVIDENCE"
  );

  console.log(
    "SILENTSWAP_ASSURANCE_SEMANTICS_TEST=PASS"
  );

  console.log(
    "SILENTSWAP_ADAPTER_V1_TESTS=PASS"
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
