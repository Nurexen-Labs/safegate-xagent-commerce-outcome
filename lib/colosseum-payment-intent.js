"use strict";

const crypto = require("node:crypto");
const { canonicalJson } = require("./canonical-json");
const { normalizeRequest } = require("./commerce-middleware");
const {
  BASE_CHAIN_ID,
  BASE_USDC,
  verifyBaseUsdcTransfer
} = require("./base-usdc");

const SCHEMA = "SAFEGATE_COLOSSEUM_PAYMENT_INTENT_V1";
const VERSION = "1.0.0";
const DOMAIN = "safegate.colosseum.payment-intent.v1";
const DEFAULT_TTL_SECONDS = 900;
const MIN_TTL_SECONDS = 60;
const MAX_TTL_SECONDS = 1800;

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

function sha256Canonical(value) {
  return crypto
    .createHash("sha256")
    .update(canonicalJson(value), "utf8")
    .digest("hex");
}

function requireText(value, code, pattern = null) {
  const text = String(value || "").trim();

  if (
    !text ||
    (pattern && !pattern.test(text))
  ) {
    fail(code);
  }

  return text;
}

function normalizeAddress(value, code) {
  return requireText(
    value,
    code,
    /^0x[a-fA-F0-9]{40}$/
  ).toLowerCase();
}

function normalizePositiveIntegerString(value, code) {
  return requireText(
    value,
    code,
    /^[1-9][0-9]*$/
  );
}

function normalizeIso(value, code) {
  const text = requireText(value, code);
  const ms = Date.parse(text);

  if (!Number.isFinite(ms)) {
    fail(code);
  }

  return new Date(ms).toISOString();
}

function normalizeTtl(value) {
  const ttl = Number(
    value === undefined
      ? DEFAULT_TTL_SECONDS
      : value
  );

  if (
    !Number.isInteger(ttl) ||
    ttl < MIN_TTL_SECONDS ||
    ttl > MAX_TTL_SECONDS
  ) {
    fail("INVALID_PAYMENT_INTENT_TTL");
  }

  return ttl;
}

function buildIdentity({
  requestId,
  requestHash,
  paymentSender,
  merchantReceiver,
  amountBaseUnits,
  createdAt,
  expiresAt
}) {
  return {
    domain: DOMAIN,
    request_id: requestId,
    request_hash: requestHash,
    chain_id: BASE_CHAIN_ID,
    asset: "USDC",
    token_contract: BASE_USDC,
    payment_sender: paymentSender,
    merchant_receiver: merchantReceiver,
    amount_base_units: amountBaseUnits,
    created_at: createdAt,
    expires_at: expiresAt
  };
}

function createPaymentIntent(spec, options = {}) {
  if (!isObject(spec)) {
    fail("INVALID_PAYMENT_INTENT_SPEC");
  }

  const request = normalizeRequest(spec.request);

  if (!isObject(spec.payment)) {
    fail("INVALID_PAYMENT_INTENT_PAYMENT");
  }

  const paymentSender = normalizeAddress(
    spec.payment.paymentSender,
    "INVALID_PAYMENT_SENDER"
  );

  const merchantReceiver = normalizeAddress(
    spec.payment.merchantReceiver,
    "INVALID_MERCHANT_RECEIVER"
  );

  const amountBaseUnits = normalizePositiveIntegerString(
    spec.payment.amountBaseUnits,
    "INVALID_PAYMENT_AMOUNT"
  );

  const createdAt = normalizeIso(
    options.createdAt || new Date().toISOString(),
    "INVALID_PAYMENT_INTENT_CREATED_AT"
  );

  const ttlSeconds = normalizeTtl(options.ttlSeconds);
  const expiresAt = new Date(
    Date.parse(createdAt) + ttlSeconds * 1000
  ).toISOString();

  const identity = buildIdentity({
    requestId: request.requestId,
    requestHash: request.requestHash,
    paymentSender,
    merchantReceiver,
    amountBaseUnits,
    createdAt,
    expiresAt
  });

  const fingerprint = sha256Canonical(identity);

  return Object.freeze({
    schema: SCHEMA,
    version: VERSION,
    intent_id:
      "SG-COL-INTENT-" +
      fingerprint.slice(0, 32).toUpperCase(),
    fingerprint_sha256: fingerprint,
    state: "OPEN",
    request: {
      request_id: request.requestId,
      request_hash: request.requestHash
    },
    payment: {
      chain_id: BASE_CHAIN_ID,
      asset: "USDC",
      token_contract: BASE_USDC,
      payment_sender: paymentSender,
      merchant_receiver: merchantReceiver,
      amount_base_units: amountBaseUnits
    },
    created_at: createdAt,
    expires_at: expiresAt
  });
}

function normalizeStoredIntent(intent) {
  if (
    !isObject(intent) ||
    intent.schema !== SCHEMA
  ) {
    fail("INVALID_STORED_PAYMENT_INTENT");
  }

  const intentId = requireText(
    intent.intent_id,
    "INVALID_PAYMENT_INTENT_ID",
    /^SG-COL-INTENT-[A-F0-9]{32}$/
  );

  const requestId = requireText(
    intent.request?.request_id,
    "INVALID_PAYMENT_INTENT_REQUEST_ID",
    /^SG-EVM-REQ-[A-Z0-9-]{12,80}$/
  );

  const requestHash = requireText(
    intent.request?.request_hash,
    "INVALID_PAYMENT_INTENT_REQUEST_HASH",
    /^[a-f0-9]{64}$/
  );

  if (Number(intent.payment?.chain_id) !== BASE_CHAIN_ID) {
    fail("INVALID_PAYMENT_INTENT_CHAIN");
  }

  if (
    String(intent.payment?.asset || "").toUpperCase() !== "USDC"
  ) {
    fail("INVALID_PAYMENT_INTENT_ASSET");
  }

  const tokenContract = normalizeAddress(
    intent.payment?.token_contract,
    "INVALID_PAYMENT_INTENT_TOKEN"
  );

  if (tokenContract !== BASE_USDC) {
    fail("INVALID_PAYMENT_INTENT_TOKEN");
  }

  const paymentSender = normalizeAddress(
    intent.payment?.payment_sender,
    "INVALID_PAYMENT_INTENT_SENDER"
  );

  const merchantReceiver = normalizeAddress(
    intent.payment?.merchant_receiver,
    "INVALID_PAYMENT_INTENT_RECEIVER"
  );

  const amountBaseUnits = normalizePositiveIntegerString(
    intent.payment?.amount_base_units,
    "INVALID_PAYMENT_INTENT_AMOUNT"
  );

  const createdAt = normalizeIso(
    intent.created_at,
    "INVALID_PAYMENT_INTENT_CREATED_AT"
  );

  const expiresAt = normalizeIso(
    intent.expires_at,
    "INVALID_PAYMENT_INTENT_EXPIRES_AT"
  );

  const lifetime =
    Date.parse(expiresAt) -
    Date.parse(createdAt);

  if (
    lifetime < MIN_TTL_SECONDS * 1000 ||
    lifetime > MAX_TTL_SECONDS * 1000
  ) {
    fail("INVALID_PAYMENT_INTENT_LIFETIME");
  }

  if (String(intent.state) !== "OPEN") {
    fail("PAYMENT_INTENT_NOT_OPEN");
  }

  const identity = buildIdentity({
    requestId,
    requestHash,
    paymentSender,
    merchantReceiver,
    amountBaseUnits,
    createdAt,
    expiresAt
  });

  const fingerprint = sha256Canonical(identity);
  const expectedIntentId =
    "SG-COL-INTENT-" +
    fingerprint.slice(0, 32).toUpperCase();

  if (intentId !== expectedIntentId) {
    fail("PAYMENT_INTENT_INTEGRITY_MISMATCH");
  }

  return {
    schema: SCHEMA,
    version: VERSION,
    intent_id: intentId,
    fingerprint_sha256: fingerprint,
    state: "OPEN",
    request: {
      request_id: requestId,
      request_hash: requestHash
    },
    payment: {
      chain_id: BASE_CHAIN_ID,
      asset: "USDC",
      token_contract: BASE_USDC,
      payment_sender: paymentSender,
      merchant_receiver: merchantReceiver,
      amount_base_units: amountBaseUnits
    },
    created_at: createdAt,
    expires_at: expiresAt
  };
}

function validateRequestBinding(intent, request) {
  const normalizedRequest = normalizeRequest(request);

  if (
    normalizedRequest.requestId !== intent.request.request_id ||
    normalizedRequest.requestHash !== intent.request.request_hash
  ) {
    fail("PAYMENT_INTENT_REQUEST_MISMATCH");
  }

  return normalizedRequest;
}

function normalizeVerifiedPayment(result, transactionHash) {
  if (
    !isObject(result) ||
    String(result.payment_status || "").toUpperCase() !==
      "PAYMENT_VERIFIED"
  ) {
    fail("PAYMENT_INTENT_PAYMENT_NOT_VERIFIED");
  }

  const txHash = requireText(
    result.transaction_hash,
    "PAYMENT_INTENT_TX_REQUIRED",
    /^0x[a-fA-F0-9]{64}$/
  ).toLowerCase();

  if (txHash !== transactionHash) {
    fail("PAYMENT_INTENT_TX_MISMATCH");
  }

  if (Number(result.chain_id) !== BASE_CHAIN_ID) {
    fail("PAYMENT_INTENT_CHAIN_MISMATCH");
  }

  if (
    String(result.asset || "").toUpperCase() !== "USDC"
  ) {
    fail("PAYMENT_INTENT_ASSET_MISMATCH");
  }

  const tokenContract = normalizeAddress(
    result.token_contract,
    "PAYMENT_INTENT_TOKEN_MISMATCH"
  );

  if (tokenContract !== BASE_USDC) {
    fail("PAYMENT_INTENT_TOKEN_MISMATCH");
  }

  const blockTimestamp = normalizeIso(
    result.block_timestamp,
    "PAYMENT_INTENT_BLOCK_TIMESTAMP_REQUIRED"
  );

  return {
    payment_status: "PAYMENT_VERIFIED",
    chain_id: BASE_CHAIN_ID,
    asset: "USDC",
    token_contract: BASE_USDC,
    transaction_hash: txHash,
    block_number: Number(result.block_number),
    block_timestamp: blockTimestamp,
    payment_sender: normalizeAddress(
      result.payment_sender,
      "PAYMENT_INTENT_SENDER_MISMATCH"
    ),
    merchant_receiver: normalizeAddress(
      result.merchant_receiver,
      "PAYMENT_INTENT_RECEIVER_MISMATCH"
    ),
    amount_base_units: normalizePositiveIntegerString(
      result.amount_base_units,
      "PAYMENT_INTENT_AMOUNT_MISMATCH"
    )
  };
}

async function verifyIntentBoundBasePayment(
  input,
  dependencies = {}
) {
  if (!isObject(input)) {
    fail("INVALID_INTENT_BOUND_PAYMENT_INPUT");
  }

  const intent = normalizeStoredIntent(input.intent);

  validateRequestBinding(
    intent,
    input.request
  );

  const now = normalizeIso(
    typeof dependencies.now === "function"
      ? dependencies.now()
      : new Date().toISOString(),
    "INVALID_VERIFICATION_TIME"
  );

  if (
    Date.parse(now) >=
    Date.parse(intent.expires_at)
  ) {
    fail("PAYMENT_INTENT_EXPIRED");
  }

  const transactionHash = requireText(
    input.transactionHash,
    "INVALID_TRANSACTION_HASH",
    /^0x[a-fA-F0-9]{64}$/
  ).toLowerCase();

  const verifyTransfer =
    typeof dependencies.verifyTransfer === "function"
      ? dependencies.verifyTransfer
      : verifyBaseUsdcTransfer;

  const raw = await verifyTransfer(
    {
      transactionHash,
      paymentSender:
        intent.payment.payment_sender,
      merchantReceiver:
        intent.payment.merchant_receiver,
      amountBaseUnits:
        intent.payment.amount_base_units
    },
    dependencies.verifyOptions || {}
  );

  const payment = normalizeVerifiedPayment(
    raw,
    transactionHash
  );

  if (
    payment.payment_sender !==
    intent.payment.payment_sender
  ) {
    fail("PAYMENT_INTENT_SENDER_MISMATCH");
  }

  if (
    payment.merchant_receiver !==
    intent.payment.merchant_receiver
  ) {
    fail("PAYMENT_INTENT_RECEIVER_MISMATCH");
  }

  if (
    payment.amount_base_units !==
    intent.payment.amount_base_units
  ) {
    fail("PAYMENT_INTENT_AMOUNT_MISMATCH");
  }

  const intentCreatedSecond =
    Math.floor(Date.parse(intent.created_at) / 1000);

  const paymentBlockSecond =
    Math.floor(Date.parse(payment.block_timestamp) / 1000);

  if (paymentBlockSecond < intentCreatedSecond) {
    fail("PAYMENT_INTENT_PAYMENT_PREDATES_INTENT");
  }

  return {
    ok: true,
    verification: {
      ...payment,
      request_id:
        intent.request.request_id,
      request_hash:
        intent.request.request_hash,
      payment_intent_id:
        intent.intent_id
    }
  };
}

module.exports = {
  SCHEMA,
  VERSION,
  DOMAIN,
  DEFAULT_TTL_SECONDS,
  MIN_TTL_SECONDS,
  MAX_TTL_SECONDS,
  createPaymentIntent,
  normalizeStoredIntent,
  validateRequestBinding,
  verifyIntentBoundBasePayment
};