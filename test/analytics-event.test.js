"use strict";

const assert = require("assert");

const {
  SCHEMA,
  VERSION,
  normalizeAnalyticsEvent
} = require("../lib/analytics-event");

const {
  aggregateAnalyticsEvents
} = require("../lib/analytics-aggregate");

function hash(char) {
  return `sha256:${char.repeat(64)}`;
}

function expectCode(fn, expectedCode) {
  let caught = null;

  try {
    fn();
  } catch (error) {
    caught = error;
  }

  assert(
    caught,
    `expected ${expectedCode}`
  );

  assert.strictEqual(
    caught.code,
    expectedCode
  );
}

const baseObserved = {
  event_id:
    "evt_agent_base_001",

  occurred_at:
    "2026-09-13T10:00:00.000Z",

  adapter: {
    id: "base",
    version: "1.0.0"
  },

  actor: {
    type: "AGENT",
    pseudonymous_id: hash("a")
  },

  commerce: {
    request_ref_hash: hash("b"),
    proof_ref_hash: hash("c"),
    outcome:
      "EXECUTION_COMPLETED",
    commerce_verified: false
  },

  economic: {
    evidence_present: true,
    rail: "EVM",
    network: "BASE",
    asset: "USDC",
    amount_base_units: "100000",
    decimals: 6
  },

  assurance: {
    level: "OBSERVED",
    independently_validated: false
  },

  replay: {
    blocked: false,
    reason: null
  },

  execution: {
    status: "200",
    duration_ms: 125
  }
};

const normalized =
  normalizeAnalyticsEvent(
    baseObserved
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
  normalized.adapter.id,
  "BASE"
);

assert.strictEqual(
  normalized.actor.type,
  "AGENT"
);

assert.strictEqual(
  normalized.assurance.level,
  "OBSERVED"
);

assert.strictEqual(
  normalized.privacy.raw_wallet_stored,
  false
);

console.log(
  "ANALYTICS_EVENT_NORMALIZATION=PASS"
);

const validatedHuman = {
  ...baseObserved,

  event_id:
    "evt_human_base_002",

  occurred_at:
    "2026-09-13T10:01:00.000Z",

  actor: {
    type: "HUMAN",
    pseudonymous_id: hash("d")
  },

  commerce: {
    request_ref_hash: hash("e"),
    proof_ref_hash: hash("f"),
    outcome:
      "EXECUTION_COMPLETED",
    commerce_verified: true
  },

  economic: {
    evidence_present: true,
    rail: "EVM",
    network: "BASE",
    asset: "USDC",
    amount_base_units: "250000",
    decimals: 6
  },

  assurance: {
    level: "VALIDATED",
    independently_validated: true
  },

  execution: {
    status: "200",
    duration_ms: 175
  }
};

const replayBlocked = {
  ...baseObserved,

  event_id:
    "evt_unknown_replay_003",

  occurred_at:
    "2026-09-13T10:02:00.000Z",

  actor: {
    type: "UNKNOWN",
    pseudonymous_id: null
  },

  commerce: {
    request_ref_hash: hash("1"),
    proof_ref_hash: null,
    outcome: "AMBIGUOUS",
    commerce_verified: false
  },

  economic: {
    evidence_present: false
  },

  assurance: {
    level: "CLAIMED",
    independently_validated: false
  },

  replay: {
    blocked: true,
    reason: "ALREADY_CONSUMED"
  },

  execution: {
    status: "409",
    duration_ms: 0
  }
};

const hederaObserved = {
  ...baseObserved,

  event_id:
    "evt_agent_hedera_004",

  occurred_at:
    "2026-09-13T10:03:00.000Z",

  adapter: {
    id: "HEDERA_X402",
    version: "1.0.0"
  },

  commerce: {
    request_ref_hash: hash("2"),
    proof_ref_hash: hash("3"),
    outcome:
      "EXECUTION_COMPLETED",
    commerce_verified: false
  },

  economic: {
    evidence_present: true,
    rail: "HEDERA",
    network: "HEDERA_TESTNET",
    asset: "HBAR",
    amount_base_units: "100000",
    decimals: 8
  },

  assurance: {
    level: "OBSERVED",
    independently_validated: false
  }
};

const aggregate =
  aggregateAnalyticsEvents([
    baseObserved,
    validatedHuman,
    replayBlocked,
    hederaObserved
  ]);

assert.strictEqual(
  aggregate.total_events,
  4
);

assert.strictEqual(
  aggregate.commerce_verified_count,
  1
);

assert.strictEqual(
  aggregate.commerceproof_count,
  3
);

assert.strictEqual(
  aggregate.replay_blocked_count,
  1
);

assert.strictEqual(
  aggregate.actor_distribution.AGENT,
  2
);

assert.strictEqual(
  aggregate.actor_distribution.HUMAN,
  1
);

assert.strictEqual(
  aggregate.actor_distribution.UNKNOWN,
  1
);

assert.strictEqual(
  aggregate.assurance_distribution.OBSERVED,
  2
);

assert.strictEqual(
  aggregate.assurance_distribution.VALIDATED,
  1
);

assert.strictEqual(
  aggregate.evidenced_volume.length,
  2
);

const usdc =
  aggregate.evidenced_volume.find(
    (entry) =>
      entry.network === "BASE" &&
      entry.asset === "USDC"
  );

assert(usdc);

assert.strictEqual(
  usdc.amount_base_units,
  "350000"
);

const hbar =
  aggregate.evidenced_volume.find(
    (entry) =>
      entry.network === "HEDERA_TESTNET" &&
      entry.asset === "HBAR"
  );

assert(hbar);

assert.strictEqual(
  hbar.amount_base_units,
  "100000"
);

assert.strictEqual(
  aggregate.volume_policy,
  "NO_CROSS_ASSET_SUM"
);

console.log(
  "NO_CROSS_ASSET_VOLUME_SUM=PASS"
);

expectCode(
  () =>
    normalizeAnalyticsEvent({
      ...baseObserved,
      response_body: {
        secret: "should-not-enter-analytics"
      }
    }),
  "ANALYTICS_RAW_PAYLOAD_FORBIDDEN"
);

console.log(
  "RAW_PAYLOAD_PRIVACY_BOUNDARY=PASS"
);

expectCode(
  () =>
    normalizeAnalyticsEvent({
      ...baseObserved,
      assurance: {
        level: "VALIDATED",
        independently_validated: false
      }
    }),
  "VALIDATED_REQUIRES_INDEPENDENT_VALIDATION"
);

console.log(
  "VALIDATED_ASSURANCE_GUARD=PASS"
);

expectCode(
  () =>
    normalizeAnalyticsEvent({
      ...baseObserved,
      economic: {
        evidence_present: false,
        amount_base_units: "999999"
      }
    }),
  "ANALYTICS_UNEVIDENCED_AMOUNT_FORBIDDEN"
);

console.log(
  "UNEVIDENCED_VOLUME_BLOCKED=PASS"
);

console.log(
  "SAFEGATE_ANALYTICS_CORE_V1=PASS"
);