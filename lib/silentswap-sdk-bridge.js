"use strict";

const crypto = require("crypto");

const {
  canonicalJson
} = require("./canonical-json");

const {
  executeSilentSwapObservedCommerce
} = require("./silentswap-observed-commerce");

const VERSION = "1.0.0";

const SCHEMA =
  "SAFEGATE_SILENTSWAP_SDK_BRIDGE_V1";

function fail(code, message) {
  const error = new Error(message);
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
    value === undefined ||
    value === null
      ? ""
      : String(value).trim();

  if (!text) {
    fail(
      "INVALID_SILENTSWAP_SDK_STATE",
      `${field} is required`
    );
  }

  return text;
}

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(
      Buffer.from(
        String(value),
        "utf8"
      )
    )
    .digest("hex");
}

function hashOrderReference(reference) {
  if (!isObject(reference)) {
    fail(
      "SILENTSWAP_ORDER_REFERENCE_REQUIRED",
      "SilentSwap order.reference is required"
    );
  }

  return sha256(
    canonicalJson(reference)
  );
}

function normalizeLeg(leg, field) {
  if (!isObject(leg)) {
    fail(
      "SILENTSWAP_ROUTE_LEG_REQUIRED",
      `${field} is required`
    );
  }

  const chain =
    leg.chain !== undefined
      ? leg.chain
      : leg.chainId;

  return {
    chain:
      requireString(
        chain,
        `${field}.chain`
      ),

    asset:
      requireString(
        leg.asset,
        `${field}.asset`
      ),

    amount:
      requireString(
        leg.amount,
        `${field}.amount`
      )
  };
}

function normalizeRecipients(recipients) {
  if (
    !Array.isArray(recipients) ||
    recipients.length === 0
  ) {
    return undefined;
  }

  return recipients.map(
    (recipient, index) => {
      if (!isObject(recipient)) {
        fail(
          "INVALID_SILENTSWAP_RECIPIENT",
          "recipient must be an object"
        );
      }

      const id =
        recipient.id ||
        recipient.address ||
        recipient.recipient ||
        recipient.destination ||
        `recipient-${index + 1}`;

      return {
        id: requireString(
          id,
          "recipient.id"
        ),

        status: requireString(
          recipient.status,
          "recipient.status"
        ).toUpperCase()
      };
    }
  );
}

function findTransactionReference(
  order,
  state,
  referenceHash
) {
  const candidates = [
    order.transactionHash,
    order.txHash,

    order.transaction &&
      order.transaction.hash,

    state.transactionHash,
    state.txHash,

    state.transaction &&
      state.transaction.hash
  ];

  for (const candidate of candidates) {
    if (
      typeof candidate === "string" &&
      candidate.trim()
    ) {
      return candidate.trim();
    }
  }

  /*
   * SilentSwap OrderReference itself is the
   * durable provider-side order locator.
   *
   * This is NOT represented as independently
   * verified payment evidence.
   */
  return (
    "SILENTSWAP_REFERENCE_SHA256:" +
    referenceHash
  );
}

function mapSilentSwapSdkOrderState({
  order,
  state,
  requestBinding,
  source,
  destination
}) {
  if (!isObject(order)) {
    fail(
      "SILENTSWAP_ORDER_REQUIRED",
      "SilentSwap placeOrder result is required"
    );
  }

  if (!isObject(state)) {
    fail(
      "SILENTSWAP_ORDER_STATE_REQUIRED",
      "SilentSwap OrderState is required"
    );
  }

  const referenceHash =
    hashOrderReference(
      order.reference
    );

  const status =
    requireString(
      state.status,
      "state.status"
    ).toUpperCase();

  const orderId =
    state.id ||
    state.orderId ||
    state.order_id ||
    order.id ||
    `ssref-${referenceHash.slice(0, 24)}`;

  const routeEvidence = {
    schema:
      "SILENTSWAP_ROUTE_EVIDENCE_V1",

    provider:
      "SILENTSWAP",

    order_id:
      String(orderId),

    status,

    request_binding:
      requireString(
        requestBinding,
        "requestBinding"
      ),

    payment_reference:
      findTransactionReference(
        order,
        state,
        referenceHash
      ),

    source:
      normalizeLeg(
        source,
        "source"
      ),

    destination:
      normalizeLeg(
        destination,
        "destination"
      )
  };

  const recipients =
    normalizeRecipients(
      state.recipients
    );

  if (recipients) {
    routeEvidence.recipients =
      recipients;
  }

  return {
    schema: SCHEMA,
    version: VERSION,

    sdk_contract: {
      package:
        "@silentswap/sdk",

      source:
        "placeOrder.reference + OrderState",

      reference_hash:
        referenceHash
    },

    route_evidence:
      routeEvidence,

    assurance: {
      provider_route:
        "CLAIMED",

      independently_validated:
        false,

      commerce_verified:
        false
    }
  };
}

async function executeSilentSwapSdkObservedCommerce(
  input
) {
  const mapped =
    mapSilentSwapSdkOrderState({
      order: input.order,
      state: input.state,
      requestBinding:
        input.requestBinding,
      source: input.source,
      destination:
        input.destination
    });

  const result =
    await executeSilentSwapObservedCommerce({
      routeEvidence:
        mapped.route_evidence,

      expectedRequestBinding:
        input.requestBinding,

      consumeRouteOnce:
        input.consumeRouteOnce,

      middlewareInput:
        input.middlewareInput,

      middlewareOptions:
        input.middlewareOptions
    });

  return {
    ...result,

    sdk_bridge: {
      schema: SCHEMA,
      version: VERSION,

      reference_hash:
        mapped.sdk_contract
          .reference_hash
    }
  };
}

function getSilentSwapSdkBridgeCapability() {
  return {
    capability:
      "safegate_silentswap_sdk_bridge",

    version: VERSION,
    schema: SCHEMA,

    provider_contract:
      "@silentswap/sdk OrderReference + OrderState",

    semantics: {
      route_assurance:
        "CLAIMED",

      observed_outcome:
        "OBSERVED",

      independently_validated:
        false,

      commerce_verified:
        false
    },

    security: {
      custody: false,
      routes_funds: false,
      wallet_signing: false,
      arbitrary_url_proxy: false
    }
  };
}

module.exports = {
  SCHEMA,
  hashOrderReference,
  mapSilentSwapSdkOrderState,
  executeSilentSwapSdkObservedCommerce,
  getSilentSwapSdkBridgeCapability
};
