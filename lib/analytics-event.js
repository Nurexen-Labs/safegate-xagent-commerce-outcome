"use strict";

const SCHEMA = "SAFEGATE_ANALYTICS_EVENT_V1";
const VERSION = "1.0.0";

const ACTOR_TYPES = new Set([
  "AGENT",
  "HUMAN",
  "UNKNOWN"
]);

const ASSURANCE_LEVELS = new Set([
  "CLAIMED",
  "OBSERVED",
  "THIRD_PARTY_ATTESTED",
  "VALIDATED"
]);

const OUTCOMES = new Set([
  "EXECUTION_COMPLETED",
  "EXECUTION_RETURNED_ERROR",
  "EXECUTION_FAILED",
  "AMBIGUOUS",
  "UNKNOWN"
]);

const FORBIDDEN_KEYS = new Set([
  "wallet_address",
  "raw_wallet",
  "raw_request",
  "raw_response",
  "request_body",
  "response_body",
  "request_headers",
  "response_headers",
  "private_route"
]);

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  throw error;
}

function isObject(value) {
  return !!value &&
    typeof value === "object" &&
    !Array.isArray(value);
}

function rejectRawPayload(value, path = "event") {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      rejectRawPayload(item, `${path}[${index}]`)
    );
    return;
  }

  if (!isObject(value)) {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    const normalizedKey =
      String(key).trim().toLowerCase();

    if (FORBIDDEN_KEYS.has(normalizedKey)) {
      fail(
        "ANALYTICS_RAW_PAYLOAD_FORBIDDEN",
        `Forbidden analytics field at ${path}.${key}`
      );
    }

    rejectRawPayload(
      child,
      `${path}.${key}`
    );
  }
}

function requireString(value, code, pattern = null) {
  const text = String(value || "").trim();

  if (!text) {
    fail(code);
  }

  if (pattern && !pattern.test(text)) {
    fail(code);
  }

  return text;
}

function optionalString(value) {
  if (
    value === undefined ||
    value === null ||
    String(value).trim() === ""
  ) {
    return null;
  }

  return String(value).trim();
}

function requireBoolean(value, code) {
  if (typeof value !== "boolean") {
    fail(code);
  }

  return value;
}

function normalizeHashRef(value, code, required = false) {
  if (
    value === undefined ||
    value === null ||
    String(value).trim() === ""
  ) {
    if (required) {
      fail(code);
    }

    return null;
  }

  const text =
    String(value).trim().toLowerCase();

  if (!/^sha256:[a-f0-9]{64}$/.test(text)) {
    fail(code);
  }

  return text;
}

function normalizeTimestamp(value) {
  const text =
    requireString(
      value,
      "ANALYTICS_OCCURRED_AT_REQUIRED"
    );

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) {
    fail("ANALYTICS_OCCURRED_AT_INVALID");
  }

  return date.toISOString();
}

function normalizeEconomic(input) {
  if (!isObject(input)) {
    fail("ANALYTICS_ECONOMIC_REQUIRED");
  }

  const evidencePresent =
    requireBoolean(
      input.evidence_present,
      "ANALYTICS_ECONOMIC_EVIDENCE_FLAG_REQUIRED"
    );

  if (!evidencePresent) {
    if (
      input.amount_base_units !== undefined &&
      input.amount_base_units !== null
    ) {
      fail(
        "ANALYTICS_UNEVIDENCED_AMOUNT_FORBIDDEN"
      );
    }

    return {
      evidence_present: false,
      rail: optionalString(input.rail),
      network: optionalString(input.network),
      asset: optionalString(input.asset),
      amount_base_units: null,
      decimals: null
    };
  }

  const amount =
    requireString(
      input.amount_base_units,
      "ANALYTICS_AMOUNT_REQUIRED",
      /^[0-9]+$/
    );

  const decimals =
    Number(input.decimals);

  if (
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 36
  ) {
    fail("ANALYTICS_DECIMALS_INVALID");
  }

  return {
    evidence_present: true,
    rail:
      requireString(
        input.rail,
        "ANALYTICS_RAIL_REQUIRED"
      ).toUpperCase(),
    network:
      requireString(
        input.network,
        "ANALYTICS_NETWORK_REQUIRED"
      ).toUpperCase(),
    asset:
      requireString(
        input.asset,
        "ANALYTICS_ASSET_REQUIRED"
      ).toUpperCase(),
    amount_base_units: amount,
    decimals
  };
}

function normalizeAnalyticsEvent(input) {
  if (!isObject(input)) {
    fail("ANALYTICS_EVENT_REQUIRED");
  }

  rejectRawPayload(input);

  if (
    isObject(input.privacy) &&
    (
      input.privacy.raw_wallet_stored === true ||
      input.privacy.raw_request_body_stored === true ||
      input.privacy.raw_response_stored === true
    )
  ) {
    fail(
      "ANALYTICS_RAW_PAYLOAD_STORAGE_FORBIDDEN"
    );
  }

  if (!isObject(input.adapter)) {
    fail("ANALYTICS_ADAPTER_REQUIRED");
  }

  if (!isObject(input.actor)) {
    fail("ANALYTICS_ACTOR_REQUIRED");
  }

  if (!isObject(input.commerce)) {
    fail("ANALYTICS_COMMERCE_REQUIRED");
  }

  if (!isObject(input.assurance)) {
    fail("ANALYTICS_ASSURANCE_REQUIRED");
  }

  if (!isObject(input.replay)) {
    fail("ANALYTICS_REPLAY_REQUIRED");
  }

  if (!isObject(input.execution)) {
    fail("ANALYTICS_EXECUTION_REQUIRED");
  }

  const actorType =
    requireString(
      input.actor.type,
      "ANALYTICS_ACTOR_TYPE_REQUIRED"
    ).toUpperCase();

  if (!ACTOR_TYPES.has(actorType)) {
    fail("ANALYTICS_ACTOR_TYPE_INVALID");
  }

  const outcome =
    requireString(
      input.commerce.outcome,
      "ANALYTICS_OUTCOME_REQUIRED"
    ).toUpperCase();

  if (!OUTCOMES.has(outcome)) {
    fail("ANALYTICS_OUTCOME_INVALID");
  }

  const assuranceLevel =
    requireString(
      input.assurance.level,
      "ANALYTICS_ASSURANCE_REQUIRED"
    ).toUpperCase();

  if (!ASSURANCE_LEVELS.has(assuranceLevel)) {
    fail("ANALYTICS_ASSURANCE_INVALID");
  }

  const independentlyValidated =
    requireBoolean(
      input.assurance.independently_validated,
      "ANALYTICS_INDEPENDENT_VALIDATION_FLAG_REQUIRED"
    );

  if (
    assuranceLevel === "VALIDATED" &&
    independentlyValidated !== true
  ) {
    fail(
      "VALIDATED_REQUIRES_INDEPENDENT_VALIDATION"
    );
  }

  const replayBlocked =
    requireBoolean(
      input.replay.blocked,
      "ANALYTICS_REPLAY_FLAG_REQUIRED"
    );

  const replayReason =
    optionalString(
      input.replay.reason
    );

  if (
    replayBlocked &&
    !replayReason
  ) {
    fail(
      "ANALYTICS_REPLAY_REASON_REQUIRED"
    );
  }

  const duration =
    input.execution.duration_ms === null ||
    input.execution.duration_ms === undefined
      ? null
      : Number(input.execution.duration_ms);

  if (
    duration !== null &&
    (
      !Number.isInteger(duration) ||
      duration < 0
    )
  ) {
    fail("ANALYTICS_DURATION_INVALID");
  }

  return {
    schema: SCHEMA,
    version: VERSION,

    event_id:
      requireString(
        input.event_id,
        "ANALYTICS_EVENT_ID_REQUIRED",
        /^[A-Za-z0-9:_-]{8,160}$/
      ),

    occurred_at:
      normalizeTimestamp(
        input.occurred_at
      ),

    adapter: {
      id:
        requireString(
          input.adapter.id,
          "ANALYTICS_ADAPTER_ID_REQUIRED",
          /^[A-Za-z0-9._-]{2,80}$/
        ).toUpperCase(),

      version:
        requireString(
          input.adapter.version,
          "ANALYTICS_ADAPTER_VERSION_REQUIRED"
        )
    },

    actor: {
      type: actorType,

      pseudonymous_id:
        normalizeHashRef(
          input.actor.pseudonymous_id,
          "ANALYTICS_ACTOR_PSEUDONYM_INVALID"
        )
    },

    commerce: {
      request_ref_hash:
        normalizeHashRef(
          input.commerce.request_ref_hash,
          "ANALYTICS_REQUEST_REF_INVALID",
          true
        ),

      proof_ref_hash:
        normalizeHashRef(
          input.commerce.proof_ref_hash,
          "ANALYTICS_PROOF_REF_INVALID"
        ),

      outcome,

      commerce_verified:
        requireBoolean(
          input.commerce.commerce_verified,
          "ANALYTICS_COMMERCE_VERIFIED_FLAG_REQUIRED"
        )
    },

    economic:
      normalizeEconomic(
        input.economic
      ),

    assurance: {
      level: assuranceLevel,
      independently_validated:
        independentlyValidated
    },

    replay: {
      blocked: replayBlocked,
      reason: replayReason
    },

    execution: {
      status:
        requireString(
          input.execution.status,
          "ANALYTICS_EXECUTION_STATUS_REQUIRED"
        ).toUpperCase(),

      duration_ms: duration
    },

    privacy: {
      raw_wallet_stored: false,
      raw_request_body_stored: false,
      raw_response_stored: false
    }
  };
}

module.exports = {
  SCHEMA,
  VERSION,
  normalizeAnalyticsEvent
};