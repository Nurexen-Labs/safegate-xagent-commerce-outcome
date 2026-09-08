"use strict";

const ARC_CHAIN_NAME = "arcTestnet";

function arcError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function usdcToAtomic(value) {
  const text = String(value).trim();

  if (!/^\d+(\.\d{1,6})?$/.test(text)) {
    throw arcError(
      "INVALID_USDC_PRICE",
      "USDC price must have at most 6 decimals."
    );
  }

  const [whole, fraction = ""] = text.split(".");

  return (
    BigInt(whole) * 1000000n +
    BigInt((fraction + "000000").slice(0, 6))
  ).toString();
}

async function getArcTestnetConfig() {
  const { CHAIN_CONFIGS } =
    await import("@circle-fin/x402-batching/client");

  const config = CHAIN_CONFIGS[ARC_CHAIN_NAME];

  if (!config) {
    throw arcError(
      "ARC_TESTNET_CONFIG_MISSING",
      "Circle SDK does not expose arcTestnet."
    );
  }

  return {
    chainName: ARC_CHAIN_NAME,
    chainId: Number(config.chain.id),
    network: `eip155:${config.chain.id}`,
    domain: Number(config.domain),
    usdc: String(config.usdc),
    gatewayWallet: String(config.gatewayWallet),
    gatewayMinter: String(config.gatewayMinter),
    rpcUrl: String(config.rpcUrl),
  };
}

async function buildArcPaymentRequirements({
  priceUsdc,
  sellerAddress,
}) {
  const config = await getArcTestnetConfig();

  if (!/^0x[a-fA-F0-9]{40}$/.test(String(sellerAddress || ""))) {
    throw arcError(
      "INVALID_ARC_SELLER_ADDRESS",
      "sellerAddress must be a valid EVM address."
    );
  }

  return {
    scheme: "exact",
    network: config.network,
    asset: config.usdc,
    amount: usdcToAtomic(priceUsdc),
    payTo: String(sellerAddress),
    maxTimeoutSeconds: 604900,
    extra: {
      name: "GatewayWalletBatched",
      version: "1",
      verifyingContract: config.gatewayWallet,
    },
  };
}

module.exports = {
  ARC_CHAIN_NAME,
  usdcToAtomic,
  getArcTestnetConfig,
  buildArcPaymentRequirements,
};

