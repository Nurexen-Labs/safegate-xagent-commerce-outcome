"use strict";

const assert = require("assert");

const {
  normalizeSilentSwapRouteEvidence,
  buildSilentSwapEvidenceHash
} = require("../lib/silentswap-adapter");

const {
  normalizeExecutionAdapterEvent
} = require("../lib/execution-adapter-contract");

const routeEvidence = {
  schema: "SILENTSWAP_ROUTE_EVIDENCE_V1",
  provider: "SILENTSWAP",
  order_id: "ss-order-compat-001",
  status: "COMPLETED",
  request_binding: "sg-request-compat-001",
  payment_reference: "tx-or-provider-reference-001",
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
  recipients: [
    {
      id: "recipient-001",
      status: "COMPLETED"
    }
  ]
};

const silentSwap =
  normalizeSilentSwapRouteEvidence(
    routeEvidence
  );

const evidenceHash =
  buildSilentSwapEvidenceHash(
    silentSwap
  );

const generic =
  normalizeExecutionAdapterEvent({
    provider:
      silentSwap.provider,

    operation_type:
      "SWAP",

    execution_id:
      silentSwap.order_id,

    request_binding:
      silentSwap.request_binding,

    status:
      silentSwap.status,

    payment_reference:
      silentSwap.payment_reference,

    evidence: [
      {
        type:
          "SILENTSWAP_ROUTE_EVIDENCE",

        reference:
          `sha256:${evidenceHash}`,

        version:
          "SILENTSWAP_ROUTE_EVIDENCE_V1"
      }
    ]
  });

assert.strictEqual(
  generic.provider,
  "SILENTSWAP"
);

assert.strictEqual(
  generic.operation_type,
  "SWAP"
);

assert.strictEqual(
  generic.execution_id,
  silentSwap.order_id
);

assert.strictEqual(
  generic.request_binding,
  silentSwap.request_binding
);

assert.strictEqual(
  generic.payment_reference,
  silentSwap.payment_reference
);

assert.strictEqual(
  generic.status,
  "COMPLETED"
);

assert.strictEqual(
  generic.assurance.provider_claim,
  "CLAIMED"
);

assert.strictEqual(
  generic.assurance.outcome,
  "CLAIMED"
);

assert.strictEqual(
  generic.assurance.independently_validated,
  false
);

assert.strictEqual(
  generic.assurance.commerce_verified,
  false
);

assert.strictEqual(
  generic.evidence[0].reference,
  `sha256:${evidenceHash}`
);

console.log(
  "SILENTSWAP_EXISTING_ADAPTER=UNCHANGED"
);

console.log(
  "SILENTSWAP_TO_GENERIC_MAPPING=PASS"
);

console.log(
  "REQUEST_BINDING_PRESERVED=PASS"
);

console.log(
  "PAYMENT_REFERENCE_PRESERVED=PASS"
);

console.log(
  "EVIDENCE_HASH_BOUND=PASS"
);

console.log(
  "ASSURANCE_CEILING=CLAIMED"
);

console.log(
  "EXECUTION_ADAPTER_SILENTSWAP_COMPAT=PASS"
);