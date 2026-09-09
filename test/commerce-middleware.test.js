"use strict";

const assert = require("assert");

const {
  EVIDENCE_SCHEMA,
  describeMiddleware,
  executeObservedCommerce
} = require("../lib/commerce-middleware");

const requestId =
  "SG-EVM-REQ-MIDDLEWARE123456789";

const transactionHash =
  "0x" + "a".repeat(64);

const proof = {
  demo: true
};

function makeVerify(
  override = {}
) {
  return async () => ({
    ok: true,
    capability: "safegate_verify",
    verification: {
      payment_status:
        "PAYMENT_VERIFIED",
      request_id:
        requestId,
      transaction_hash:
        transactionHash,
      chain_id:
        8453,
      asset:
        "USDC",
      ...override
    }
  });
}

function makeClock() {
  const values = [
    "2026-09-09T12:00:00.000Z",
    "2026-09-09T12:00:01.000Z",
    "2026-09-09T12:00:02.000Z",
    "2026-09-09T12:00:03.000Z"
  ];

  return () => values.shift();
}

(async () => {
  const description =
    describeMiddleware();

  assert.strictEqual(
    description.assurance,
    "OBSERVED"
  );

  assert.strictEqual(
    description.boundaries
      .arbitrary_url_proxy,
    false
  );

  const consumed =
    new Set();

  let executions = 0;

  const consumeOnce =
    async ({ consumeKey }) => {
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
    };

  const input = {
    proof,
    request: {
      requestId,
      method: "POST",
      path: "/premium-data",
      body: {
        sku: "REPORT-001",
        query: "safe commerce"
      }
    }
  };

  const result =
    await executeObservedCommerce(
      input,
      {
        verifyPayment:
          makeVerify(),

        consumeOnce,

        execute:
          async request => {
            executions += 1;

            assert.strictEqual(
              request.requestId,
              requestId
            );

            return {
              statusCode: 200,
              body: {
                ok: true,
                result:
                  "premium-data"
              }
            };
          },

        now:
          makeClock()
      }
    );

  assert.strictEqual(
    result.ok,
    true
  );

  assert.strictEqual(
    result.assurance_level,
    "OBSERVED"
  );

  assert.strictEqual(
    result.commerce_verified,
    false
  );

  assert.strictEqual(
    result.evidence.schema,
    EVIDENCE_SCHEMA
  );

  assert.strictEqual(
    result.evidence
      .binding
      .payment_request_binding,
    "VALID"
  );

  assert.strictEqual(
    result.evidence
      .replay_safety
      .consume_status,
    "CONSUMED"
  );

  assert.strictEqual(
    result.evidence
      .execution
      .outcome,
    "EXECUTION_COMPLETED"
  );

  assert.match(
    result.evidence
      .binding
      .request_hash,
    /^[a-f0-9]{64}$/
  );

  assert.match(
    result.evidence
      .execution
      .response_hash,
    /^[a-f0-9]{64}$/
  );

  assert.strictEqual(
    executions,
    1
  );

  await assert.rejects(
    () =>
      executeObservedCommerce(
        input,
        {
          verifyPayment:
            makeVerify(),

          consumeOnce,

          execute:
            async () => {
              executions += 1;

              return {
                statusCode: 200,
                body: {
                  ok: true
                }
              };
            }
        }
      ),
    error =>
      error &&
      error.code ===
        "ALREADY_CONSUMED"
  );

  assert.strictEqual(
    executions,
    1
  );

  await assert.rejects(
    () =>
      executeObservedCommerce(
        {
          ...input,
          request: {
            ...input.request,
            requestId:
              "SG-EVM-REQ-DIFFERENT123456"
          }
        },
        {
          verifyPayment:
            makeVerify(),

          consumeOnce:
            async () => true,

          execute:
            async () => ({
              statusCode: 200,
              body: {}
            })
        }
      ),
    error =>
      error &&
      error.code ===
        "REQUEST_BINDING_MISMATCH"
  );

  let failureEvidence = null;

  try {
    await executeObservedCommerce(
      input,
      {
        verifyPayment:
          makeVerify(),

        consumeOnce:
          async () => true,

        execute:
          async () => {
            const error =
              new Error(
                "Provider failed"
              );

            error.code =
              "PROVIDER_FAILURE";

            throw error;
          },

        now:
          makeClock()
      }
    );
  } catch (error) {
    assert.strictEqual(
      error.code,
      "UPSTREAM_EXECUTION_FAILED"
    );

    failureEvidence =
      error.safegateEvidence;
  }

  assert.ok(
    failureEvidence
  );

  assert.strictEqual(
    failureEvidence
      .assurance
      .level,
    "OBSERVED"
  );

  assert.strictEqual(
    failureEvidence
      .execution
      .outcome,
    "EXECUTION_FAILED"
  );

  console.log(
    "OBSERVED_MIDDLEWARE_CONTRACT_TEST=PASS"
  );

  console.log(
    "MIDDLEWARE_REPLAY_PROTECTION_TEST=PASS"
  );

  console.log(
    "MIDDLEWARE_FAILURE_OBSERVATION_TEST=PASS"
  );
})().catch(error => {
  console.error(error);
  process.exit(1);
});