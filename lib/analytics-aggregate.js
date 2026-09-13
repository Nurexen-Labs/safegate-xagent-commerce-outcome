"use strict";

const {
  normalizeAnalyticsEvent
} = require("./analytics-event");

function increment(target, key) {
  target[key] =
    (target[key] || 0) + 1;
}

function aggregateAnalyticsEvents(events) {
  if (!Array.isArray(events)) {
    const error =
      new Error(
        "Analytics events must be an array."
      );

    error.code =
      "ANALYTICS_EVENTS_ARRAY_REQUIRED";

    throw error;
  }

  const result = {
    schema:
      "SAFEGATE_ANALYTICS_AGGREGATE_V1",

    version: "1.0.0",

    total_events: 0,
    commerce_verified_count: 0,
    commerceproof_count: 0,
    replay_blocked_count: 0,

    actor_distribution: {
      AGENT: 0,
      HUMAN: 0,
      UNKNOWN: 0
    },

    assurance_distribution: {
      CLAIMED: 0,
      OBSERVED: 0,
      THIRD_PARTY_ATTESTED: 0,
      VALIDATED: 0
    },

    outcome_distribution: {},

    adapter_distribution: {},

    evidenced_volume: [],

    execution_latency: {
      measured_count: 0,
      total_ms: 0,
      average_ms: null
    },

    volume_policy:
      "NO_CROSS_ASSET_SUM"
  };

  const volumes =
    new Map();

  for (const rawEvent of events) {
    const event =
      normalizeAnalyticsEvent(
        rawEvent
      );

    result.total_events += 1;

    increment(
      result.actor_distribution,
      event.actor.type
    );

    increment(
      result.assurance_distribution,
      event.assurance.level
    );

    increment(
      result.outcome_distribution,
      event.commerce.outcome
    );

    increment(
      result.adapter_distribution,
      event.adapter.id
    );

    if (
      event.commerce.commerce_verified
    ) {
      result.commerce_verified_count += 1;
    }

    if (
      event.commerce.proof_ref_hash
    ) {
      result.commerceproof_count += 1;
    }

    if (event.replay.blocked) {
      result.replay_blocked_count += 1;
    }

    if (
      event.execution.duration_ms !== null
    ) {
      result.execution_latency.measured_count += 1;

      result.execution_latency.total_ms +=
        event.execution.duration_ms;
    }

    if (
      event.economic.evidence_present
    ) {
      const key = [
        event.economic.rail,
        event.economic.network,
        event.economic.asset,
        event.economic.decimals
      ].join("|");

      const current =
        volumes.get(key) || {
          rail:
            event.economic.rail,
          network:
            event.economic.network,
          asset:
            event.economic.asset,
          decimals:
            event.economic.decimals,
          amount:
            0n
        };

      current.amount +=
        BigInt(
          event.economic.amount_base_units
        );

      volumes.set(
        key,
        current
      );
    }
  }

  if (
    result.execution_latency.measured_count > 0
  ) {
    result.execution_latency.average_ms =
      Math.round(
        result.execution_latency.total_ms /
        result.execution_latency.measured_count
      );
  }

  result.evidenced_volume =
    Array.from(
      volumes.values()
    )
      .map((entry) => ({
        rail: entry.rail,
        network: entry.network,
        asset: entry.asset,
        decimals: entry.decimals,
        amount_base_units:
          entry.amount.toString()
      }))
      .sort((a, b) =>
        [
          a.network,
          a.asset,
          a.rail
        ]
          .join("|")
          .localeCompare(
            [
              b.network,
              b.asset,
              b.rail
            ].join("|")
          )
      );

  return result;
}

module.exports = {
  aggregateAnalyticsEvents
};