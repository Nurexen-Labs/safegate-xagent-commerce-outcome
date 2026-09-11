"use strict";

const assert = require("node:assert");

const {
  create402SignalPrePaymentEvidence,
  bind402SignalPrePaymentEvidenceToRequest
} = require("../lib/402signal-prepayment-evidence");

const {
  execute402SignalObservedLifecycle
} = require("../lib/402signal-commerce-lifecycle");

const requestId =
  "SG-EVM-REQ-402SIGNAL-0001";

const verifiedAction = {
  model: "proof_carrying_route_v1",

  request: {
    url: "https://merchant.example/paid-agent-tool",
    method: "GET",
    body_sha256: "a".repeat(64)
  },

  accepted: {
    scheme: "exact",
    network: "eip155:8453",
    amount: "1000",
    asset: "USDC",
    payTo: "0x1111111111111111111111111111111111111111"
  },

  expires_at: 1789160000,
  quote_sha256: "b".repeat(64)
};

const evidence =
  create402SignalPrePaymentEvidence({
    verifiedAction,
    routeRequestJson:
      JSON.stringify({
        url:
          "https://merchant.example/paid-agent-tool",
        networks: ["base"],
        require_route_binding: true
      }),
    routeResponseJson:
      JSON.stringify({
        synthetic: true,
        selected: true
      }),
    sourceMode: "SYNTHETIC"
  });

const boundEvidence =
  bind402SignalPrePaymentEvidenceToRequest({
    evidence,
    requestId
  });

const consumed = new Set();

let verifyCalls = 0;
let executeCalls = 0;

const txHash =
  "0x" + "ab".repeat(32);

const options = {
  verifyPayment: async () => {
    verifyCalls++;

    return {
      ok: true,
      verification: {
        payment_status:
          "PAYMENT_VERIFIED",
        request_id:
          requestId,
        transaction_hash:
          txHash,
        chain_id:
          8453,
        asset:
          "USDC"
      }
    };
  },

  consumeOnce: async ({ consumeKey }) => {
    if (consumed.has(consumeKey)) {
      return false;
    }

    consumed.add(consumeKey);
    return true;
  },

  execute: async input => {
    executeCalls++;

    assert.equal(
      input.requestId,
      requestId
    );

    return {
      statusCode: 200,
      body: {
        ok: true,
        result:
          "synthetic-agent-service-response"
      }
    };
  },

  now: (() => {
    const values = [
      "2026-09-11T16:00:00.000Z",
      "2026-09-11T16:00:01.000Z"
    ];

    return () =>
      values.shift() ||
      "2026-09-11T16:00:01.000Z";
  })()
};

const lifecycle =
  await execute402SignalObservedLifecycle(
    {
      prepaymentEvidence:
        boundEvidence,

      request: {
        requestId,
        method: "GET",
        path: "/paid-agent-tool",
        body: null
      },

      paymentProof: {
        synthetic: true
      }
    },
    options
  );

assert.equal(
  lifecycle.schema,
  "SAFEGATE_402SIGNAL_COMMERCE_LIFECYCLE_V1"
);

assert.equal(
  lifecycle.pre_payment.provider,
  "402Signal"
);

assert.equal(
  lifecycle.pre_payment.assurance,
  "THIRD_PARTY_ATTESTED"
);

assert.equal(
  lifecycle.payment.status,
  "PAYMENT_VERIFIED"
);

assert.equal(
  lifecycle.payment.request_binding,
  "VALID"
);

assert.equal(
  lifecycle.payment.replay_status,
  "CONSUMED"
);

assert.equal(
  lifecycle.post_payment.assurance,
  "OBSERVED"
);

assert.equal(
  lifecycle.post_payment.execution_outcome,
  "EXECUTION_COMPLETED"
);

assert.equal(
  lifecycle.commerce_state.payment_bound,
  true
);

assert.equal(
  lifecycle.commerce_state.outcome_observed,
  true
);

assert.equal(
  lifecycle.commerce_state.commerce_verified,
  false
);

assert.equal(
  lifecycle.commerce_state.commerce_proof_created,
  false
);

assert.equal(verifyCalls, 1);
assert.equal(executeCalls, 1);


/* ------------------------------------------------------
   REPLAY MUST FAIL
------------------------------------------------------ */

await assert.rejects(
  () =>
    execute402SignalObservedLifecycle(
      {
        prepaymentEvidence:
          boundEvidence,

        request: {
          requestId,
          method: "GET",
          path: "/paid-agent-tool",
          body: null
        },

        paymentProof: {
          synthetic: true
        }
      },
      options
    ),

  error =>
    error &&
    error.code === "ALREADY_CONSUMED"
);


/* ------------------------------------------------------
   PREPAYMENT REQUEST ID TAMPER MUST FAIL
------------------------------------------------------ */

const wrongRequestEvidence =
  JSON.parse(
    JSON.stringify(boundEvidence)
  );

wrongRequestEvidence
  .safegate_request_binding
  .request_id =
    "SG-EVM-REQ-402SIGNAL-9999";

await assert.rejects(
  () =>
    execute402SignalObservedLifecycle(
      {
        prepaymentEvidence:
          wrongRequestEvidence,

        request: {
          requestId,
          method: "GET",
          path: "/paid-agent-tool",
          body: null
        },

        paymentProof: {
          synthetic: true
        }
      },
      options
    ),

  error =>
    error &&
    error.code ===
      "PREPAYMENT_REQUEST_BINDING_MISMATCH"
);


/* ------------------------------------------------------
   BINDING HASH TAMPER MUST FAIL
------------------------------------------------------ */

const hashTampered =
  JSON.parse(
    JSON.stringify(boundEvidence)
  );

hashTampered
  .safegate_request_binding
  .binding_sha256 =
    "0".repeat(64);

await assert.rejects(
  () =>
    execute402SignalObservedLifecycle(
      {
        prepaymentEvidence:
          hashTampered,

        request: {
          requestId,
          method: "GET",
          path: "/paid-agent-tool",
          body: null
        },

        paymentProof: {
          synthetic: true
        }
      },
      options
    ),

  error =>
    error &&
    error.code ===
      "PREPAYMENT_BINDING_TAMPERED"
);

console.log(
  "402SIGNAL_PREPAYMENT=THIRD_PARTY_ATTESTED"
);

console.log(
  "PAYMENT_REQUEST_BINDING=PASS"
);

console.log(
  "REPLAY_SAFETY=PASS"
);

console.log(
  "POST_PAYMENT_OUTCOME=OBSERVED"
);

console.log(
  "PREPAYMENT_TAMPER_DETECTION=PASS"
);

console.log(
  "COMMERCE_VERIFIED=NO"
);

console.log(
  "COMMERCE_PROOF_CREATED=NO"
);

console.log(
  "WALLET_USED=NO"
);

console.log(
  "PAYMENT_SENT=NO"
);