"use strict";

const SCHEMA = "SAFEGATE_EXECUTION_ADAPTER_V1";
const VERSION = "1.0.0";

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
      "INVALID_EXECUTION_ADAPTER_INPUT",
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

function rejectCallerAssuranceElevation(input) {
  const forbidden = [
    "assurance",
    "assurance_level",
    "commerce_verified",
    "independently_validated",
    "validated",
    "observed"
  ];

  for (const field of forbidden) {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      fail(
        "CALLER_ASSURANCE_ELEVATION_FORBIDDEN",
        `adapter input cannot set ${field}`
      );
    }
  }
}

function normalizeEvidence(evidence) {
  if (
    !Array.isArray(evidence) ||
    evidence.length === 0
  ) {
    fail(
      "EXECUTION_EVIDENCE_REQUIRED",
      "at least one evidence reference is required"
    );
  }

  return evidence.map((item, index) => {
    if (!isObject(item)) {
      fail(
        "INVALID_EXECUTION_EVIDENCE",
        `evidence[${index}] must be an object`
      );
    }

    const normalized = {
      type: requireString(
        item.type,
        `evidence[${index}].type`
      ).toUpperCase(),

      reference: requireString(
        item.reference,
        `evidence[${index}].reference`
      )
    };

    const version = optionalString(item.version);

    if (version) {
      normalized.version = version;
    }

    return normalized;
  });
}

function normalizeExecutionAdapterEvent(input) {
  if (!isObject(input)) {
    fail(
      "INVALID_EXECUTION_ADAPTER_INPUT",
      "adapter input must be an object"
    );
  }

  rejectCallerAssuranceElevation(input);

  return {
    schema: SCHEMA,
    version: VERSION,

    provider: requireString(
      input.provider,
      "provider"
    ).toUpperCase(),

    operation_type: requireString(
      input.operation_type,
      "operation_type"
    ).toUpperCase(),

    execution_id: requireString(
      input.execution_id,
      "execution_id"
    ),

    request_binding: requireString(
      input.request_binding,
      "request_binding"
    ),

    status: requireString(
      input.status,
      "status"
    ).toUpperCase(),

    payment_reference:
      optionalString(input.payment_reference),

    evidence:
      normalizeEvidence(input.evidence),

    assurance: {
      provider_claim: "CLAIMED",
      outcome: "CLAIMED",
      independently_validated: false,
      commerce_verified: false
    },

    security: {
      custody: false,
      routes_funds: false,
      wallet_signing: false,
      payment_authorization: false
    }
  };
}

function getExecutionAdapterCapability() {
  return {
    schema: SCHEMA,
    version: VERSION,

    purpose:
      "Normalize external execution evidence before SafeGate observation and assurance processing.",

    assurance_boundary: {
      adapter_input: "CLAIMED",
      can_self_promote_to_observed: false,
      can_self_promote_to_validated: false,
      can_self_promote_to_commerce_verified: false
    },

    security: {
      custody: false,
      routes_funds: false,
      wallet_signing: false,
      payment_authorization: false
    }
  };
}

module.exports = {
  SCHEMA,
  VERSION,
  normalizeExecutionAdapterEvent,
  getExecutionAdapterCapability
};