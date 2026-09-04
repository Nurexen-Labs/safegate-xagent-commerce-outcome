"use strict";

const DEFAULT_BLOCKY402_BASE_URL = "https://api.testnet.blocky402.com";
const HEDERA_TESTNET = "hedera:testnet";
const HBAR_ASSET = "0.0.0";

function blockyError(code, message, details) {
  const error = new Error(message);
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

async function requestJson(path, options = {}) {
  const baseUrl = String(
    options.baseUrl ||
    process.env.BLOCKY402_BASE_URL ||
    DEFAULT_BLOCKY402_BASE_URL
  ).replace(/\/+$/, "");

  const timeoutMs = Number(options.timeoutMs || 12000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

    let data;
    try {
      data = await response.json();
    } catch {
      throw blockyError(
        "BLOCKY402_INVALID_JSON",
        `Blocky402 returned non-JSON response (${response.status}).`
      );
    }

    if (!response.ok) {
      throw blockyError(
        "BLOCKY402_HTTP_ERROR",
        `Blocky402 request failed (${response.status}).`,
        data
      );
    }

    return data;
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw blockyError(
        "BLOCKY402_TIMEOUT",
        `Blocky402 request timed out after ${timeoutMs}ms.`
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function discoverHedera(options = {}) {
  const supported = await requestJson("/supported", options);

  const kind = Array.isArray(supported.kinds)
    ? supported.kinds.find(
        (item) =>
          item &&
          item.network === HEDERA_TESTNET &&
          item.scheme === "exact" &&
          Number(item.x402Version) === 2
      )
    : null;

  if (!kind) {
    throw blockyError(
      "HEDERA_TESTNET_NOT_SUPPORTED",
      "Blocky402 does not advertise hedera:testnet exact x402 v2."
    );
  }

  const feePayer =
    (kind.extra && kind.extra.feePayer) ||
    (supported.signers &&
      Array.isArray(supported.signers["hedera:*"]) &&
      supported.signers["hedera:*"][0]);

  if (!feePayer) {
    throw blockyError(
      "HEDERA_FEE_PAYER_MISSING",
      "Blocky402 did not advertise a Hedera fee payer."
    );
  }

  return {
    network: HEDERA_TESTNET,
    scheme: "exact",
    x402Version: 2,
    feePayer: String(feePayer),
  };
}

function createPaymentRequirements({
  amount = "100000",
  payTo,
  asset = HBAR_ASSET,
  feePayer,
  maxTimeoutSeconds = 300,
} = {}) {
  if (!/^\d+$/.test(String(amount))) {
    throw blockyError("INVALID_AMOUNT", "amount must be atomic units.");
  }

  if (!/^0\.0\.\d+$/.test(String(payTo || ""))) {
    throw blockyError("INVALID_HEDERA_PAYTO", "payTo must be a Hedera account ID.");
  }

  if (!/^0\.0\.\d+$/.test(String(asset || ""))) {
    throw blockyError("INVALID_HEDERA_ASSET", "asset must be a Hedera asset ID.");
  }

  if (!/^0\.0\.\d+$/.test(String(feePayer || ""))) {
    throw blockyError(
      "INVALID_HEDERA_FEE_PAYER",
      "feePayer must be a Hedera account ID."
    );
  }

  return {
    scheme: "exact",
    network: HEDERA_TESTNET,
    amount: String(amount),
    payTo: String(payTo),
    maxTimeoutSeconds: Number(maxTimeoutSeconds),
    asset: String(asset),
    extra: {
      feePayer: String(feePayer),
    },
  };
}

async function verifyPayment(paymentPayload, paymentRequirements, options = {}) {
  const result = await requestJson("/verify", {
    ...options,
    method: "POST",
    body: {
      x402Version: 2,
      paymentPayload,
      paymentRequirements,
    },
  });

  return result;
}

async function settlePayment(paymentPayload, paymentRequirements, options = {}) {
  const result = await requestJson("/settle", {
    ...options,
    method: "POST",
    body: {
      x402Version: 2,
      paymentPayload,
      paymentRequirements,
    },
  });

  return result;
}

module.exports = {
  DEFAULT_BLOCKY402_BASE_URL,
  HEDERA_TESTNET,
  HBAR_ASSET,
  discoverHedera,
  createPaymentRequirements,
  verifyPayment,
  settlePayment,
};
