"use strict";

const crypto = require("crypto");

const {
  normalizeExecutionAdapterEvent
} = require("./execution-adapter-contract");

const SCHEMA = "SAFEGATE_ASP_XDC_REFERENCE_ADAPTER_V1";
const VERSION = "1.0.0";

const ALLOWED_STATUSES = new Set([
  "CREATED",
  "AUTHORIZED",
  "CAPTURED",
  "CANCELLED",
  "RECLAIMED",
  "REFUNDED"
]);

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  error.statusCode = 400;
  throw error;
}

function isObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function requireString(value, field) {
  const text =
    value === undefined || value === null
      ? ""
      : String(value).trim();

  if (!text) {
    fail(
      "INVALID_ASP_INPUT",
      `${field} is required`
    );
  }

  return text;
}

function optionalString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const text = String(value).trim();
  return text || null;
}

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(value, "utf8")
    .digest("hex");
}

function rejectCallerAssuranceElevation(input) {
  const forbidden = [
    "assurance",
    "assurance_level",
    "commerce_verified",
    "independently_validated",
    "validated",
    "observed",
    "third_party_attested"
  ];

  for (const field of forbidden) {
    if (
      Object.prototype.hasOwnProperty.call(
        input,
        field
      )
    ) {
      fail(
        "CALLER_ASSURANCE_ELEVATION_FORBIDDEN",
        `ASP input cannot set ${field}`
      );
    }
  }
}

function normalizeStatus(value) {
  const status =
    requireString(value, "charge.status")
      .toUpperCase();

  if (!ALLOWED_STATUSES.has(status)) {
    fail(
      "INVALID_ASP_STATUS",
      `unsupported ASP status ${status}`
    );
  }

  return status;
}

function buildAspExecutionId(chargeId) {
  return (
    "ASP_CHARGE:" +
    requireString(chargeId, "charge.chargeId")
  );
}

function normalizeRefundTxHashes(value) {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    fail(
      "INVALID_ASP_REFUND_TXS",
      "settlement.refundTxHashes must be an array"
    );
  }

  return value.map((item, index) =>
    requireString(
      item,
      `settlement.refundTxHashes[${index}]`
    )
  );
}

function normalizeReceipt(receipt, chargeId) {
  if (!isObject(receipt)) {
    fail(
      "INVALID_ASP_RECEIPT",
      "fulfilmentReceipt must be an object"
    );
  }

  const receiptChargeId =
    requireString(
      receipt.chargeId,
      "fulfilmentReceipt.chargeId"
    );

  if (receiptChargeId !== chargeId) {
    fail(
      "ASP_RECEIPT_CHARGE_MISMATCH",
      "fulfilment receipt chargeId does not match charge"
    );
  }

  const normalized = {
    chargeId: receiptChargeId,

    supplierId:
      requireString(
        receipt.supplierId,
        "fulfilmentReceipt.supplierId"
      ),

    orderId:
      requireString(
        receipt.orderId,
        "fulfilmentReceipt.orderId"
      ),

    fulfilmentRef:
      requireString(
        receipt.fulfilmentRef,
        "fulfilmentReceipt.fulfilmentRef"
      ),

    subjectHash:
      requireString(
        receipt.subjectHash,
        "fulfilmentReceipt.subjectHash"
      ),

    issuedAt:
      requireString(
        receipt.issuedAt,
        "fulfilmentReceipt.issuedAt"
      ),

    rung:
      requireString(
        receipt.rung,
        "fulfilmentReceipt.rung"
      )
  };

  return {
    value: normalized,
    safegateHash: sha256(
      JSON.stringify(normalized)
    )
  };
}

function normalizeAttestation(
  attestation,
  chargeId,
  receipt
) {
  if (!isObject(attestation)) {
    fail(
      "INVALID_ASP_ATTESTATION",
      "attestation must be an object"
    );
  }

  if (!receipt) {
    fail(
      "ASP_ATTESTATION_REQUIRES_RECEIPT",
      "attestation requires fulfilmentReceipt"
    );
  }

  const attestationChargeId =
    requireString(
      attestation.chargeId,
      "attestation.chargeId"
    );

  if (attestationChargeId !== chargeId) {
    fail(
      "ASP_ATTESTATION_CHARGE_MISMATCH",
      "attestation chargeId does not match charge"
    );
  }

  const issuedAt =
    requireString(
      attestation.issuedAt,
      "attestation.issuedAt"
    );

  if (issuedAt !== receipt.value.issuedAt) {
    fail(
      "ASP_ATTESTATION_TIME_MISMATCH",
      "attestation issuedAt does not match receipt"
    );
  }

  const attestorSig =
    requireString(
      attestation.attestorSig,
      "attestation.attestorSig"
    );

  return {
    chargeId:
      attestationChargeId,

    receiptHash:
      requireString(
        attestation.receiptHash,
        "attestation.receiptHash"
      ),

    issuedAt,

    attestor:
      requireString(
        attestation.attestor,
        "attestation.attestor"
      ),

    attestorSig,

    attestorSigSha256:
      sha256(attestorSig)
  };
}

function mapAspXdcToExecutionAdapter(input) {
  if (!isObject(input)) {
    fail(
      "INVALID_ASP_INPUT",
      "input must be an object"
    );
  }

  rejectCallerAssuranceElevation(input);

  if (!isObject(input.charge)) {
    fail(
      "INVALID_ASP_INPUT",
      "charge must be an object"
    );
  }

  const charge = input.charge;

  const chargeId =
    requireString(
      charge.chargeId,
      "charge.chargeId"
    );

  const offerId =
    requireString(
      charge.offerId,
      "charge.offerId"
    );

  const amount =
    requireString(
      charge.amount,
      "charge.amount"
    );

  const currency =
    requireString(
      charge.currency,
      "charge.currency"
    );

  const status =
    normalizeStatus(charge.status);

  const requestBinding =
    requireString(
      input.requestBinding,
      "requestBinding"
    );

  const idempotencyKey =
    optionalString(charge.idempotencyKey) ||
    chargeId;

  if (idempotencyKey !== chargeId) {
    fail(
      "ASP_IDEMPOTENCY_MISMATCH",
      "ASP idempotencyKey must equal chargeId"
    );
  }

  const settlement =
    isObject(input.settlement)
      ? input.settlement
      : {};

  const authorizationTxHash =
    optionalString(
      settlement.authorizationTxHash
    );

  const captureTxHash =
    optionalString(
      settlement.captureTxHash
    );

  const refundTxHashes =
    normalizeRefundTxHashes(
      settlement.refundTxHashes
    );

  const settledStatuses =
    status === "CAPTURED" ||
    status === "REFUNDED";

  if (captureTxHash && !settledStatuses) {
    fail(
      "ASP_CAPTURE_TX_STATUS_MISMATCH",
      "capture transaction requires CAPTURED or REFUNDED status"
    );
  }

  if (
    refundTxHashes.length > 0 &&
    !settledStatuses
  ) {
    fail(
      "ASP_REFUND_TX_STATUS_MISMATCH",
      "refund transactions require CAPTURED or REFUNDED status"
    );
  }

  let receipt = null;

  if (input.fulfilmentReceipt !== undefined) {
    receipt =
      normalizeReceipt(
        input.fulfilmentReceipt,
        chargeId
      );
  }

  let attestation = null;

  if (input.attestation !== undefined) {
    attestation =
      normalizeAttestation(
        input.attestation,
        chargeId,
        receipt
      );
  }

  if (
    settledStatuses &&
    (!receipt || !attestation)
  ) {
    fail(
      "ASP_CAPTURE_EVIDENCE_REQUIRED",
      "CAPTURED/REFUNDED status requires receipt and attestation"
    );
  }

  const economicBinding = {
    chargeId,
    offerId,
    amount,
    currency,
    idempotencyKey
  };

  const evidence = [
    {
      type: "ASP_OFFER_ID",
      reference: offerId
    },
    {
      type: "ASP_CHARGE_BINDING_SHA256",
      reference: sha256(
        JSON.stringify(economicBinding)
      )
    }
  ];

  if (authorizationTxHash) {
    evidence.push({
      type: "ASP_AUTHORIZATION_TX",
      reference: authorizationTxHash
    });
  }

  if (receipt) {
    evidence.push(
      {
        type:
          "ASP_FULFILMENT_RECEIPT_SAFEGATE_SHA256",
        reference:
          receipt.safegateHash
      },
      {
        type: "ASP_ORDER_ID",
        reference: receipt.value.orderId
      },
      {
        type: "ASP_FULFILMENT_REF",
        reference: receipt.value.fulfilmentRef
      },
      {
        type: "ASP_SUBJECT_HASH",
        reference: receipt.value.subjectHash
      }
    );
  }

  if (attestation) {
    evidence.push(
      {
        type: "ASP_RECEIPT_HASH",
        reference: attestation.receiptHash
      },
      {
        type: "ASP_ATTESTOR",
        reference: attestation.attestor
      },
      {
        type: "ASP_ATTESTOR_SIG_SHA256",
        reference:
          attestation.attestorSigSha256
      }
    );
  }

  if (captureTxHash) {
    evidence.push({
      type: "ASP_CAPTURE_TX",
      reference: captureTxHash
    });
  }

  refundTxHashes.forEach((txHash, index) => {
    evidence.push({
      type: "ASP_REFUND_TX",
      reference: txHash,
      version: String(index + 1)
    });
  });

  const paymentReference =
    captureTxHash
      ? `ASP_CAPTURE_TX:${captureTxHash}`
      : null;

  const genericEvent =
    normalizeExecutionAdapterEvent({
      provider: "ASP",

      operation_type:
        "DELAYED_FULFILMENT_COMMERCE",

      execution_id:
        buildAspExecutionId(chargeId),

      request_binding:
        requestBinding,

      status,

      payment_reference:
        paymentReference,

      evidence
    });

  return {
    schema: SCHEMA,
    version: VERSION,

    generic_event:
      genericEvent,

    asp: {
      reference_network:
        optionalString(input.network) ||
        "XDC",

      production_deployment_verified:
        false,

      charge_id:
        chargeId,

      offer_id:
        offerId,

      idempotency_key:
        idempotencyKey,

      amount,
      currency,

      status,

      declared_rung:
        receipt
          ? receipt.value.rung
          : null
    },

    fulfilment: {
      receipt_present:
        Boolean(receipt),

      attestation_present:
        Boolean(attestation),

      safegate_receipt_hash:
        receipt
          ? receipt.safegateHash
          : null,

      asp_receipt_hash:
        attestation
          ? attestation.receiptHash
          : null,

      signature_verified:
        false,

      attestor_independence_verified:
        false
    },

    settlement: {
      authorization_tx_present:
        Boolean(authorizationTxHash),

      capture_tx_present:
        Boolean(captureTxHash),

      refund_tx_count:
        refundTxHashes.length,

      payment_reference:
        paymentReference,

      authorization_is_payment_settlement:
        false
    },

    assurance_mapping: {
      asp_rung_is_safegate_assurance:
        false,

      automatic_upgrade:
        false,

      adapter_input:
        "CLAIMED",

      third_party_attested_requires:
        "INDEPENDENT_ATTESTOR_AND_SIGNATURE_VERIFICATION",

      validated_requires:
        "STRONG_INDEPENDENT_VALIDATION",

      commerce_verified:
        false
    },

    security: {
      safegate_custody: false,
      safegate_routes_funds: false,
      safegate_wallet_signing: false,
      safegate_payment_authorization: false,
      asp_settlement_external_to_safegate: true
    }
  };
}

module.exports = {
  SCHEMA,
  VERSION,
  buildAspExecutionId,
  mapAspXdcToExecutionAdapter
};