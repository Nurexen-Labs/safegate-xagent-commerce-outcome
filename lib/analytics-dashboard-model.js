"use strict";

const VERSION = "1.1.0";
const SCHEMA = "SAFEGATE_ANALYTICS_DASHBOARD_V1";

const WINDOWS = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000
};

const LABELS = {
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "all": "All time"
};

function object(value) {
  return !!value &&
    typeof value === "object" &&
    !Array.isArray(value);
}

function rangeKey(value) {
  const key = String(value || "all").toLowerCase();

  if (!Object.prototype.hasOwnProperty.call(LABELS, key)) {
    const error = new Error("Invalid analytics range.");
    error.code = "INVALID_ANALYTICS_RANGE";
    error.statusCode = 400;
    throw error;
  }

  return key;
}

function timeMs(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function increment(target, key) {
  const name = String(key || "UNKNOWN").toUpperCase();
  target[name] = (target[name] || 0) + 1;
}

function breakdown(source) {
  return Object.entries(source)
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) =>
      b.count - a.count ||
      a.id.localeCompare(b.id)
    );
}

function percentile(values, ratio) {
  const sorted = values
    .filter(Number.isFinite)
    .slice()
    .sort((a, b) => a - b);

  if (!sorted.length) {
    return null;
  }

  const index = Math.max(
    0,
    Math.ceil(sorted.length * ratio) - 1
  );

  return sorted[index];
}

function units(baseUnits, decimals) {
  let value = BigInt(String(baseUnits));
  const places = Number(decimals);

  if (
    !Number.isInteger(places) ||
    places < 0 ||
    places > 30
  ) {
    throw new Error("Invalid economic decimals.");
  }

  const negative = value < 0n;

  if (negative) {
    value = -value;
  }

  let raw = value.toString();

  if (places === 0) {
    return `${negative ? "-" : ""}${raw}`;
  }

  raw = raw.padStart(places + 1, "0");

  const whole = raw.slice(0, -places);
  const fraction =
    raw.slice(-places).replace(/0+$/, "");

  return (
    `${negative ? "-" : ""}${whole}` +
    (fraction ? `.${fraction}` : "")
  );
}

function economicOf(event) {
  const economic = event.economic;

  if (
    !object(economic) ||
    economic.evidence_present !== true ||
    economic.amount_base_units === undefined ||
    economic.amount_base_units === null ||
    !Number.isInteger(Number(economic.decimals))
  ) {
    return null;
  }

  try {
    return {
      network: String(
        economic.network || "UNKNOWN"
      ).toUpperCase(),

      asset: String(
        economic.asset || "UNKNOWN"
      ).toUpperCase(),

      decimals: Number(economic.decimals),

      baseUnits: BigInt(
        String(economic.amount_base_units)
      )
    };
  } catch {
    return null;
  }
}

function buildDashboardPayload(
  events,
  dataMode = "SYNTHETIC_DEMO",
  options = {}
) {
  if (!Array.isArray(events)) {
    throw new Error("Analytics events must be an array.");
  }

  const range = rangeKey(options.range);

  const normalized = events
    .filter(object)
    .map(event => ({
      event,
      timestamp: timeMs(event.occurred_at)
    }))
    .filter(entry => entry.timestamp !== null)
    .sort((a, b) => a.timestamp - b.timestamp);

  const latestEvent =
    normalized.length
      ? normalized[normalized.length - 1].timestamp
      : Date.now();

  /*
   * Synthetic fixtures use their latest event as the clock anchor,
   * so demo windows remain deterministic.
   */
  const anchor =
    dataMode === "SYNTHETIC_DEMO"
      ? latestEvent
      : (
          Number.isFinite(options.nowMs)
            ? options.nowMs
            : Date.now()
        );

  const start =
    range === "all"
      ? null
      : anchor - WINDOWS[range];

  const scoped = normalized
    .filter(entry =>
      start === null ||
      entry.timestamp >= start
    )
    .map(entry => entry.event);

  const assurance = {};
  const outcomes = {};
  const actors = {};
  const adapters = {};

  let proofs = 0;
  let replayBlocked = 0;
  let commerceVerified = 0;

  const latencies = [];
  const volumes = new Map();

  for (const event of scoped) {
    const adapter =
      object(event.adapter)
        ? event.adapter.id
        : "UNKNOWN";

    const actor =
      object(event.actor)
        ? event.actor.type
        : "UNKNOWN";

    const outcome =
      object(event.commerce)
        ? event.commerce.outcome
        : "UNKNOWN";

    const level =
      object(event.assurance)
        ? event.assurance.level
        : "UNKNOWN";

    increment(adapters, adapter);
    increment(actors, actor);
    increment(outcomes, outcome);
    increment(assurance, level);

    if (
      object(event.commerce) &&
      event.commerce.proof_ref_hash
    ) {
      proofs++;
    }

    if (
      object(event.replay) &&
      event.replay.blocked === true
    ) {
      replayBlocked++;
    }

    if (
      object(event.commerce) &&
      event.commerce.commerce_verified === true
    ) {
      commerceVerified++;
    }

    const duration =
      object(event.execution)
        ? Number(event.execution.duration_ms)
        : NaN;

    if (
      Number.isFinite(duration) &&
      duration > 0
    ) {
      latencies.push(duration);
    }

    const economic = economicOf(event);

    if (economic) {
      const key =
        `${economic.network}|` +
        `${economic.asset}|` +
        `${economic.decimals}`;

      if (!volumes.has(key)) {
        volumes.set(key, {
          network: economic.network,
          asset: economic.asset,
          decimals: economic.decimals,
          baseUnits: 0n,
          eventCount: 0
        });
      }

      const bucket = volumes.get(key);

      bucket.baseUnits += economic.baseUnits;
      bucket.eventCount++;
    }
  }

  const volume = Array
    .from(volumes.values())
    .map(bucket => ({
      network: bucket.network,
      asset: bucket.asset,
      decimals: bucket.decimals,
      value: units(
        bucket.baseUnits,
        bucket.decimals
      ),
      event_count: bucket.eventCount
    }))
    .sort((a, b) =>
      a.network.localeCompare(b.network) ||
      a.asset.localeCompare(b.asset)
    );

  const recent = scoped
    .slice()
    .sort(
      (a, b) =>
        Date.parse(b.occurred_at) -
        Date.parse(a.occurred_at)
    )
    .slice(0, 25)
    .map(event => {
      const economic = economicOf(event);

      return {
        occurred_at: event.occurred_at,

        adapter:
          object(event.adapter)
            ? String(
                event.adapter.id || "UNKNOWN"
              ).toUpperCase()
            : "UNKNOWN",

        actor:
          object(event.actor)
            ? String(
                event.actor.type || "UNKNOWN"
              ).toUpperCase()
            : "UNKNOWN",

        outcome:
          object(event.commerce)
            ? String(
                event.commerce.outcome || "UNKNOWN"
              ).toUpperCase()
            : "UNKNOWN",

        assurance:
          object(event.assurance)
            ? String(
                event.assurance.level || "UNKNOWN"
              ).toUpperCase()
            : "UNKNOWN",

        commerce_verified:
          !!(
            object(event.commerce) &&
            event.commerce.commerce_verified === true
          ),

        replay_blocked:
          !!(
            object(event.replay) &&
            event.replay.blocked === true
          ),

        economic:
          economic
            ? {
                network: economic.network,
                asset: economic.asset,
                value: units(
                  economic.baseUnits,
                  economic.decimals
                )
              }
            : null
      };
    });

  const legacyKpis = {
    executions: scoped.length,
    replay_blocked: replayBlocked,
    commerce_verified: commerceVerified,
    commerceproofs: proofs
  };

  const legacyEvidencedVolume =
    volume.map(item => ({
      network: item.network,
      asset: item.asset,
      display_value: item.value,
      event_count: item.event_count
    }));

  const legacyDisclaimer =
    dataMode === "SYNTHETIC_DEMO"
      ? "Synthetic demo data — not production metrics."
      : "Production analytics data.";

  return {
    schema: SCHEMA,
    version: VERSION,

    data_mode: dataMode,

    kpis: legacyKpis,

    volume_policy: "NO_CROSS_ASSET_SUM",

    evidenced_volume:
      legacyEvidencedVolume,

    disclaimer:
      legacyDisclaimer,

    generated_at:
      new Date().toISOString(),

    range: {
      key: range,
      label: LABELS[range],
      anchor_at:
        new Date(anchor).toISOString(),
      start_at:
        start === null
          ? null
          : new Date(start).toISOString()
    },

    summary: {
      executions: scoped.length,
      commerce_proofs: proofs,
      replay_blocked: replayBlocked,
      commerce_verified: commerceVerified,

      evidenced_economic_volume:
        volume,

      latency_ms: {
        p50: percentile(latencies, 0.50),
        p95: percentile(latencies, 0.95),
        samples: latencies.length
      }
    },

    breakdowns: {
      assurance: breakdown(assurance),
      outcomes: breakdown(outcomes),
      actors: breakdown(actors),
      adapters: breakdown(adapters)
    },

    recent,

    methodology: {
      volume:
        "Only events carrying economic evidence contribute to volume. Different assets and networks are never silently combined.",

      assurance:
        "CLAIMED, OBSERVED, THIRD_PARTY_ATTESTED and VALIDATED remain distinct assurance classes.",

      commerce_verified:
        "Commerce Verified counts only events whose configured SafeGate policy explicitly emitted commerce_verified=true.",

      replay:
        "Replay Blocked counts economic evidence rejected because it had already been consumed.",

      latency:
        "Observation latency reports p50 and p95 from positive execution-duration samples in the selected window.",

      privacy:
        "Analytics output excludes raw wallet addresses, raw request bodies, raw responses and actor pseudonymous identifiers."
    }
  };
}

module.exports = {
  VERSION,
  SCHEMA,
  buildDashboardPayload
};