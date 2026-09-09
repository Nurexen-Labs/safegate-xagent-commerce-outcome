"use strict";

const {
  verifySilentSwapRouteEvidence
} = require("./silentswap-adapter");

const {
  executeObservedCommerce
} = require("./commerce-middleware");

const SCHEMA =
  "SAFEGATE_SILENTSWAP_OBSERVED_COMMERCE_V1";

const VERSION = "1.0.0";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function observedAssurance(result) {
  if (
    result &&
    result.evidence &&
    result.evidence.assurance === "OBSERVED"
  ) {
    return true;
  }

  if (
    result &&
    result.assurance === "OBSERVED"
  ) {
    return true;
  }

  return false;
}

async function executeSilentSwapObservedCommerce({
  routeEvidence,
  expectedRequestBinding,
  consumeRouteOnce,
  middlewareInput,
  executeObservedCommerceFn =
    executeObservedCommerce
}) {
  if (
    typeof executeObservedCommerceFn !==
    "function"
  ) {
    fail(
      "INVALID_OBSERVED_EXECUTOR",
      "executeObservedCommerceFn must be a function"
    );
  }

  /*
   * Stage 1:
   * Accept and consume SilentSwap's provider-reported
   * route evidence.
   *
   * This remains CLAIMED evidence.
   */
  const route =
    await verifySilentSwapRouteEvidence({
      routeEvidence,
      expectedRequestBinding,
      consumeOnce: consumeRouteOnce
    });

  /*
   * Stage 2:
   * Execute through SafeGate's existing Observed
   * Middleware Core.
   *
   * We do not rewrite or weaken the middleware.
   */
  let observed;

  try {
    observed =
      await executeObservedCommerceFn(
        middlewareInput
      );
  } catch (error) {
    /*
     * Preserve SafeGate's failure evidence while
     * also retaining the accepted SilentSwap
     * route evidence.
     */
    error.safegateCompositionEvidence = {
      schema: SCHEMA,
      version: VERSION,

      decision:
        "ROUTE_ACCEPTED_OUTCOME_FAILED",

      assurance: "OBSERVED",

      commerce_verified: false,

      independently_validated: false,

      route: {
        assurance: "CLAIMED",
        evidence: route
      },

      outcome: {
        assurance: "OBSERVED",
        status: "EXECUTION_FAILED",

        evidence:
          error.safegateEvidence ||
          null
      }
    };

    throw error;
  }

  /*
   * Hard semantic guard:
   * the composition MUST NOT claim OBSERVED unless
   * the existing middleware actually emitted
   * OBSERVED evidence.
   */
  if (!observedAssurance(observed)) {
    fail(
      "MIDDLEWARE_NOT_OBSERVED",
      "SafeGate middleware did not emit OBSERVED assurance"
    );
  }

  /*
   * Overall assurance is OBSERVED because SafeGate
   * saw the downstream execution.
   *
   * This is NOT independent validation.
   */
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

    flow: [
      "SILENTSWAP_ROUTE_EVIDENCE",
      "REQUEST_BINDING",
      "ROUTE_REPLAY_SAFETY",
      "DOWNSTREAM_EXECUTION",
      "OUTCOME_OBSERVATION",
      "COMMERCE_EVIDENCE"
    ],

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
