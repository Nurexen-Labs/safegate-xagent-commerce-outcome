"use strict";

const assert = require("assert");

const {
  buildAspExecutionId,
  mapAspXdcToExecutionAdapter
} = require("../lib/asp-xdc-adapter");

function expectCode(fn, code) {
  let caught = null;

  try {
    fn();
  } catch (error) {
    caught = error;
  }

  assert(caught, `expected ${code}`);
  assert.strictEqual(caught.code, code);
}

assert.strictEqual(
  buildAspExecutionId("0xcharge001"),
  "ASP_CHARGE:0xcharge001"
);

console.log("ASP_EXECUTION_ID=PASS");

const authorized =
  mapAspXdcToExecutionAdapter({
    network: "XDC",

    requestBinding:
      "SG-ASP-REQUEST-001",

    charge: {
      chargeId: "0xcharge001",
      offerId: "0xoffer001",
      amount: "1000000",
      currency: "USDC",
      status: "authorized",
      idempotencyKey: "0xcharge001"
    },

    settlement: {
      authorizationTxHash:
        "0xauthorize001"
    }
  });

assert.strictEqual(
  authorized.generic_event.provider,
  "ASP"
);

assert.strictEqual(
  authorized.generic_event.status,
  "AUTHORIZED"
);

assert.strictEqual(
  authorized.generic_event.payment_reference,
  null
);

assert.strictEqual(
  authorized.settlement
    .authorization_is_payment_settlement,
  false
);

assert.strictEqual(
  authorized.generic_event.assurance.outcome,
  "CLAIMED"
);

assert.strictEqual(
  authorized.generic_event.assurance
    .commerce_verified,
  false
);

console.log(
  "ASP_AUTHORIZATION_NOT_SETTLEMENT=PASS"
);

const captured =
  mapAspXdcToExecutionAdapter({
    network: "XDC",

    requestBinding:
      "SG-ASP-REQUEST-001",

    charge: {
      chargeId: "0xcharge001",
      offerId: "0xoffer001",
      amount: "1000000",
      currency: "USDC",
      status: "captured",
      idempotencyKey: "0xcharge001"
    },

    fulfilmentReceipt: {
      chargeId: "0xcharge001",
      supplierId: "supplier-001",
      orderId: "order-001",
      fulfilmentRef: "completion-001",
      subjectHash: "0xsubject001",
      issuedAt: "1790000000",
      rung: "ATTESTED"
    },

    attestation: {
      chargeId: "0xcharge001",
      receiptHash: "0xreceipt001",
      issuedAt: "1790000000",
      attestor: "0xattestor001",
      attestorSig: "0xsig001"
    },

    settlement: {
      authorizationTxHash:
        "0xauthorize001",

      captureTxHash:
        "0xcapture001"
    }
  });

assert.strictEqual(
  captured.generic_event.status,
  "CAPTURED"
);

assert.strictEqual(
  captured.generic_event.payment_reference,
  "ASP_CAPTURE_TX:0xcapture001"
);

assert.strictEqual(
  captured.asp.declared_rung,
  "ATTESTED"
);

assert.strictEqual(
  captured.assurance_mapping
    .asp_rung_is_safegate_assurance,
  false
);

assert.strictEqual(
  captured.assurance_mapping
    .automatic_upgrade,
  false
);

assert.strictEqual(
  captured.fulfilment.signature_verified,
  false
);

assert.strictEqual(
  captured.fulfilment
    .attestor_independence_verified,
  false
);

assert.strictEqual(
  captured.generic_event.assurance
    .independently_validated,
  false
);

assert.strictEqual(
  captured.generic_event.assurance
    .commerce_verified,
  false
);

console.log(
  "ASP_RUNG_AUTO_UPGRADE=BLOCKED"
);

console.log(
  "ASP_CAPTURE_MAPPING=PASS"
);

const evidenceTypes =
  captured.generic_event.evidence.map(
    (item) => item.type
  );

assert(
  evidenceTypes.includes(
    "ASP_RECEIPT_HASH"
  )
);

assert(
  evidenceTypes.includes(
    "ASP_ATTESTOR_SIG_SHA256"
  )
);

assert(
  evidenceTypes.includes(
    "ASP_CAPTURE_TX"
  )
);

console.log(
  "ASP_CAPTURE_EVIDENCE=PASS"
);

expectCode(
  () =>
    mapAspXdcToExecutionAdapter({
      requestBinding: "binding",

      charge: {
        chargeId: "0xcharge001",
        offerId: "0xoffer001",
        amount: "1",
        currency: "USDC",
        status: "authorized",
        idempotencyKey: "WRONG"
      }
    }),
  "ASP_IDEMPOTENCY_MISMATCH"
);

console.log(
  "ASP_IDEMPOTENCY_BINDING=PASS"
);

expectCode(
  () =>
    mapAspXdcToExecutionAdapter({
      requestBinding: "binding",

      charge: {
        chargeId: "0xcharge001",
        offerId: "0xoffer001",
        amount: "1",
        currency: "USDC",
        status: "authorized"
      },

      fulfilmentReceipt: {
        chargeId: "0xOTHER",
        supplierId: "supplier",
        orderId: "order",
        fulfilmentRef: "ref",
        subjectHash: "subject",
        issuedAt: "1",
        rung: "A"
      }
    }),
  "ASP_RECEIPT_CHARGE_MISMATCH"
);

console.log(
  "ASP_RECEIPT_BINDING=PASS"
);

expectCode(
  () =>
    mapAspXdcToExecutionAdapter({
      requestBinding: "binding",

      charge: {
        chargeId: "0xcharge001",
        offerId: "0xoffer001",
        amount: "1",
        currency: "USDC",
        status: "authorized"
      },

      settlement: {
        captureTxHash: "0xBAD"
      }
    }),
  "ASP_CAPTURE_TX_STATUS_MISMATCH"
);

console.log(
  "ASP_PREMATURE_CAPTURE_REFERENCE=BLOCKED"
);

expectCode(
  () =>
    mapAspXdcToExecutionAdapter({
      requestBinding: "binding",

      assurance: "VALIDATED",

      charge: {
        chargeId: "0xcharge001",
        offerId: "0xoffer001",
        amount: "1",
        currency: "USDC",
        status: "authorized"
      }
    }),
  "CALLER_ASSURANCE_ELEVATION_FORBIDDEN"
);

console.log(
  "ASP_ASSURANCE_ELEVATION=BLOCKED"
);

expectCode(
  () =>
    mapAspXdcToExecutionAdapter({
      requestBinding: "binding",

      charge: {
        chargeId: "0xcharge001",
        offerId: "0xoffer001",
        amount: "1",
        currency: "USDC",
        status: "captured"
      }
    }),
  "ASP_CAPTURE_EVIDENCE_REQUIRED"
);

console.log(
  "ASP_CAPTURE_WITHOUT_EVIDENCE=BLOCKED"
);

console.log(
  "ASP_XDC_REFERENCE_ADAPTER_V1_TESTS=PASS"
);