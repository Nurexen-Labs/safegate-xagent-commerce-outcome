"use strict";

const {
  verifySilentSwapRouteEvidence
} = require("./silentswap-adapter");

const {
  executeObservedCommerce
} = require("./commerce-middleware");

const SCHEMA =
  "SAFEGATE_SILENTSWAP_OBSERVED_COMMERCE_V1";

const VERSION = "1.0.1";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function isObserved(result) {
  return Boolean(
    result &&
    (
      result.assurance_level === "OBSERVED" ||
      result.assurance === "OBSERVED" ||
      (
        result.evidence &&
        result.evidence.assurance &&
        result.evidence.assurance.level === "OBSERVED"
      )
    )
  );
}

function isObservedFailureEvidence(evidence) {
  return Boolean(
    evidence &&
    evidence.assurance &&
    evidence.assurance.level === "OBSERVED"
  );
}

async function executeSilentSwapObservedCommerce({
  routeEvidence,
  expectedRequestBinding,
  consumeRouteOnce,
  middlewareInput,
  middlewareOptions,
  executeObservedCommerceFn = executeObservedCommerce
}) {
  if (typeof executeObservedCommerceFn !== "function") {
    fail(
      "INVALID_OBSERVED_EXECUTOR",
      "executeObservedCommerceFn must be a function"
    );
  }

  const route =
    await verifySilentSwapRouteEvidence({
      routeEvidence,
      expectedRequestBinding,
      consumeOnce: consumeRouteOnce
    });

  let observed;

  try {
    observed =
      await executeObservedCommerceFn(
        middlewareInput,
        middlewareOptions
      );
  } catch (error) {
    const failureEvidence =
      error && error.safegateEvidence
        ? error.safegateEvidence
        : null;

    const outcomeObserved =
      isObservedFailureEvidence(
        failureEvidence
      );

    error.safegateCompositionEvidence = {
      schema: SCHEMA,
      version: VERSION,

      decision: outcomeObserved
        ? "ROUTE_ACCEPTED_OUTCOME_OBSERVED_FAILED"
        : "ROUTE_ACCEPTED_OUTCOME_NOT_OBSERVED",

      assurance: outcomeObserved
        ? "OBSERVED"
        : "CLAIMED",

      commerce_verified: false,
      independently_validated: false,

      route: {
        assurance: "CLAIMED",
        evidence: route
      },

      outcome: {
        assurance: outcomeObserved
          ? "OBSERVED"
          : null,

        status: outcomeObserved
          ? "EXECUTION_FAILED"
          : "NOT_OBSERVED",

        evidence: failureEvidence
      }
    };

    throw error;
  }

  if (!isObserved(observed)) {
    fail(
      "MIDDLEWARE_NOT_OBSERVED",
      "SafeGate middleware did not emit OBSERVED assurance"
    );
  }

  return {
    ok: true,

    schema: SCHEMA,
    version: VERSION,

    capability:
      "safegate_silentswap_observed_commerce",

    decision:
      "ROUTE_ACCEPTED_OUTCOME_OBSERVED",

    assurance: "OBSERVED",

    commerce_verified: false,
    independently_validated: false,

    route: {
      provider: "SILENTSWAP",
      assurance: "CLAIMED",
      commerce_verified: false,
      evidence: route
    },

    outcome: {
      assurance: "OBSERVED",
      commerce_verified: false,
      independently_validated: false,
      evidence: observed
    }
  };
}

function getSilentSwapObservedCapability() {
  return {
    capability:
      "safegate_silentswap_observed_commerce",

    version: VERSION,
    schema: SCHEMA,

    semantics: {
      route_assurance: "CLAIMED",
      outcome_assurance: "OBSERVED",
      independently_validated: false,
      commerce_verified: false
    },

    security: {
      custody: false,
      routes_funds: false,
      arbitrary_url_proxy: false
    }
  };
}

module.exports = {
  SCHEMA,
  executeSilentSwapObservedCommerce,
  getSilentSwapObservedCapability
};
