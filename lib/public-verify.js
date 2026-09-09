"use strict";

const API_VERSION = "1.0.0";
const REQUEST_SCHEMA = "SAFEGATE_VERIFY_REQUEST_V1";
const RESPONSE_SCHEMA = "SAFEGATE_VERIFY_RESPONSE_V1";
const VERIFICATION_TYPE = "COMMERCE_OUTCOME";
const PROOF_FORMAT = "SAFEGATE_COMMERCE_ATTESTATION_V1";

function fail(code, message, statusCode = 400) {
  const error = new Error(message || code);
  error.code = code;
  error.statusCode = statusCode;
  throw error;
}

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function requireObject(value, code) {
  if (!isObject(value)) {
    fail(code, "A JSON object is required.");
  }
  return value;
}

function normalizeVerifyRequest(body) {
  const input = requireObject(body, "INVALID_VERIFY_REQUEST");

  const schema = String(input.schema || "").trim().toUpperCase();
  if (schema !== REQUEST_SCHEMA) {
    fail(
      "UNSUPPORTED_VERIFY_SCHEMA",
      `schema must be ${REQUEST_SCHEMA}.`
    );
  }

  const verificationType = String(
    input.verificationType || ""
  ).trim().toUpperCase();

  if (verificationType !== VERIFICATION_TYPE) {
    fail(
      "UNSUPPORTED_VERIFICATION_TYPE",
      `verificationType must be ${VERIFICATION_TYPE}.`,
      422
    );
  }

  const proof = requireObject(
    input.proof,
    "INVALID_PROOF_ENVELOPE"
  );

  const format = String(
    proof.format || ""
  ).trim().toUpperCase();

  if (format !== PROOF_FORMAT) {
    fail(
      "UNSUPPORTED_PROOF_FORMAT",
      `proof.format must be ${PROOF_FORMAT}.`,
      422
    );
  }

  const attestation = requireObject(
    proof.attestation,
    "INVALID_ATTESTATION"
  );

  return {
    schema,
    verificationType,
    format,
    attestation
  };
}

function describePublicVerify() {
  return {
    ok: true,
    capability: "safegate_verify",
    version: API_VERSION,
    method: "POST",
    side_effects: "none",
    request_schema: REQUEST_SCHEMA,
    response_schema: RESPONSE_SCHEMA,
    verification_types: [
      VERIFICATION_TYPE
    ],
    adapters: [
      {
        id: "BASE_MAINNET_USDC_ATTESTATION_V1",
        proof_format: PROOF_FORMAT,
        chain_id: 8453,
        asset: "USDC",
        payment_verification: "ONCHAIN",
        fulfillment_assurance_ceiling: "CLAIMED"
      }
    ],
    assurance_semantics: {
      CLAIMED: "Provider or source assertion.",
      OBSERVED: "SafeGate observed execution evidence.",
      VALIDATED: "Independent validation mechanism verified the outcome.",
      THIRD_PARTY_ATTESTED: "External trusted party contributed an attestation."
    }
  };
}

function mapAdapterResult(result) {
  if (!isObject(result) || result.ok !== true) {
    fail(
      "INVALID_ADAPTER_RESULT",
      "Verification adapter returned an invalid result.",
      502
    );
  }

  return {
    payment_status: String(
      result.payment_status || ""
    ).toUpperCase(),

    attestation_status: String(
      result.attestation_status || ""
    ).toUpperCase(),

    payment_binding: "VALID",

    reported_fulfillment_status: String(
      result.fulfillment_status || ""
    ).toUpperCase(),

    reported_evidence_status: String(
      result.evidence_status || ""
    ).toUpperCase(),

    request_id: result.request_id,
    order_reference: result.order_reference,
    safegate_transaction: result.safegate_transaction,
    transaction_hash: result.transaction_hash,

    chain_id: result.chain_id,
    asset: result.asset,
    amount_base_units: result.amount_base_units,

    payment_sender: result.payment_sender,
    merchant_receiver: result.merchant_receiver,

    receipt_reference: result.receipt_reference,
    evidence_reference: result.evidence_reference,
    proof_reference: result.proof_reference
  };
}

async function verifyPublicRequest(
  body,
  options = {}
) {
  const normalized = normalizeVerifyRequest(body);

  const attestationPayload = requireObject(
    normalized.attestation.payload,
    "INVALID_ATTESTATION_PAYLOAD"
  );

  const chainId = Number(attestationPayload.chainId);
  const asset = String(
    attestationPayload.asset || ""
  ).trim().toUpperCase();

  let adapterId = null;

  if (chainId === 8453 && asset === "USDC") {
    adapterId = "BASE_MAINNET_USDC_ATTESTATION_V1";
  }

  if (!adapterId) {
    fail(
      "UNSUPPORTED_VERIFICATION_ADAPTER",
      "No SafeGate verification adapter is available for this proof.",
      422
    );
  }

  const verifier = options.verifyCommerceProof;

  if (typeof verifier !== "function") {
    fail(
      "VERIFY_ADAPTER_UNAVAILABLE",
      "Verification adapter is unavailable.",
      500
    );
  }

  const adapterResult = await verifier(
    normalized.attestation
  );

  const verification = mapAdapterResult(
    adapterResult
  );

  return {
    ok: true,
    schema: RESPONSE_SCHEMA,
    capability: "safegate_verify",
    version: API_VERSION,
    verification_type: VERIFICATION_TYPE,
    side_effects: "none",

    decision: "PAYMENT_AND_ATTESTATION_VERIFIED",

    commerce_verified: false,

    assurance: {
      level: "CLAIMED",
      payment: "VERIFIED",
      payment_binding: "VALID",
      fulfillment: "PROVIDER_ATTESTED",
      independently_validated: false,
      limitation:
        "This adapter verifies the SafeGate signature and Base Mainnet USDC payment binding. It does not independently observe or re-execute fulfillment."
    },

    adapter: {
      id: adapterId,
      contract: "RAIL_AGNOSTIC",
      chain_id: verification.chain_id,
      asset: verification.asset
    },

    verification
  };
}

module.exports = {
  API_VERSION,
  REQUEST_SCHEMA,
  RESPONSE_SCHEMA,
  VERIFICATION_TYPE,
  PROOF_FORMAT,
  normalizeVerifyRequest,
  describePublicVerify,
  verifyPublicRequest
};