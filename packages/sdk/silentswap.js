"use strict";

const {
  SCHEMA,
  hashOrderReference,
  mapSilentSwapSdkOrderState,
  executeSilentSwapSdkObservedCommerce,
  getSilentSwapSdkBridgeCapability
} = require(
  "./runtime/silentswap-sdk-bridge"
);

function hashSilentSwapOrderReference(
  reference
) {
  return hashOrderReference(reference);
}

function mapSilentSwapOrderState(
  input
) {
  return mapSilentSwapSdkOrderState(
    input
  );
}

function executeSilentSwapObservedCommerce(
  input
) {
  return executeSilentSwapSdkObservedCommerce(
    input
  );
}

function getSilentSwapCapability() {
  return getSilentSwapSdkBridgeCapability();
}

module.exports = {
  SILENTSWAP_SDK_BRIDGE_SCHEMA:
    SCHEMA,

  hashSilentSwapOrderReference,
  mapSilentSwapOrderState,
  executeSilentSwapObservedCommerce,
  getSilentSwapCapability
};
