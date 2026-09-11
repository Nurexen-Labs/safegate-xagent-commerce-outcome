"use strict";

const assert = require("assert");

const {
  SCHEMA,
  VERSION,
  normalizeExecutionAdapterEvent,
  getExecutionAdapterCapability
} = require("../lib/execution-adapter-contract");

function expectCode(fn, expectedCode) {
  let caught = null;

  try {
    fn();
  } catch (error) {
    caught = error;
  }

  assert(caught, `expected ${expectedCode}`);
  assert.strictEqual(
    caught.code,
    expectedCode
  );
}

const silentSwapReference = {
  provider: "SilentSwap",
  operation_type: "swap",
  execution_id: "ss-order-001",
  request_binding: "SG-REQUEST-BINDING-001",
  status: "completed",
  payment_reference: "0xabc123",
  evidence: [
    {
      type: "silentswap_order_reference",
      reference: "sha256:example-reference",
      version: "OrderReference+OrderState"
    }
  ]
};

const normalized =
  normalizeExecutionAdapterEvent(
    silentSwapReference
  );

assert.strictEqual(
  normalized.schema,
  SCHEMA
);

assert.strictEqual(
  normalized.version,
  VERSION
);

assert.strictEqual(
  normalized.provider,
  "SILENTSWAP"
);

assert.strictEqual(
  normalized.operation_type,
  "SWAP"
);

assert.strictEqual(
  normalized.execution_id,
  "ss-order-001"
);

assert.strictEqual(
  normalized.request_binding,
  "SG-REQUEST-BINDING-001"
);

assert.strictEqual(
  normalized.status,
  "COMPLETED"
);

assert.strictEqual(
  normalized.assurance.provider_claim,
  "CLAIMED"
);

assert.strictEqual(
  normalized.assurance.outcome,
  "CLAIMED"
);

assert.strictEqual(
  normalized.assurance.independently_validated,
  false
);

assert.strictEqual(
  normalized.assurance.commerce_verified,
  false
);

console.log(
  "SILENTSWAP_REFERENCE_SHAPE=PASS"
);

const withoutPayment =
  normalizeExecutionAdapterEvent({
    provider: "OpenBounty",
    operation_type: "bounty",
    execution_id: "bounty-001",
    request_binding: "SG-REQUEST-BINDING-002",
    status: "evidence_submitted",
    evidence: [
      {
        type: "BOUNTY_EVIDENCE",
        reference: "evidence-version-1"
      }
    ]
  });

assert.strictEqual(
  withoutPayment.payment_reference,
  null
);

console.log(
  "PAYMENT_REFERENCE_OPTIONAL=PASS"
);

expectCode(
  () =>
    normalizeExecutionAdapterEvent({
      ...silentSwapReference,
      assurance: "OBSERVED"
    }),
  "CALLER_ASSURANCE_ELEVATION_FORBIDDEN"
);

expectCode(
  () =>
    normalizeExecutionAdapterEvent({
      ...silentSwapReference,
      commerce_verified: true
    }),
  "CALLER_ASSURANCE_ELEVATION_FORBIDDEN"
);

console.log(
  "ASSURANCE_ELEVATION=BLOCKED"
);

expectCode(
  () =>
    normalizeExecutionAdapterEvent({
      provider: "Example",
      operation_type: "service",
      execution_id: "execution-001",
      request_binding: "binding-001",
      status: "completed",
      evidence: []
    }),
  "EXECUTION_EVIDENCE_REQUIRED"
);

console.log(
  "EVIDENCE_REQUIRED=PASS"
);

const capability =
  getExecutionAdapterCapability();

assert.deepStrictEqual(
  capability.security,
  {
    custody: false,
    routes_funds: false,
    wallet_signing: false,
    payment_authorization: false
  }
);

console.log(
  "SECURITY_BOUNDARY=PASS"
);

console.log(
  "EXECUTION_ADAPTER_STANDARD_V1=PASS"
);