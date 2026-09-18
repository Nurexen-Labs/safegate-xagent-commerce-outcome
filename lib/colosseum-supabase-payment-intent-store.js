"use strict";

const {
  SCHEMA,
  normalizeStoredIntent
} = require("./colosseum-payment-intent");

const DEFAULT_TIMEOUT_MS = 8000;

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  throw error;
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

function normalizeBaseUrl(value) {
  return requireText(
    value,
    "SUPABASE_URL_REQUIRED",
    /^https:\/\/[A-Za-z0-9.-]+$/
  ).replace(/\/+$/, "");
}

function createSupabasePaymentIntentStore(options = {}) {
  const baseUrl = normalizeBaseUrl(
    options.url ||
    process.env.SUPABASE_URL
  );

  const serviceRoleKey = requireText(
    options.serviceRoleKey ||
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    "SUPABASE_SERVICE_ROLE_KEY_REQUIRED"
  );

  const fetchImpl =
    typeof options.fetchImpl === "function"
      ? options.fetchImpl
      : globalThis.fetch;

  if (typeof fetchImpl !== "function") {
    fail("FETCH_IMPLEMENTATION_REQUIRED");
  }

  const timeoutMs = Number(
    options.timeoutMs ||
    DEFAULT_TIMEOUT_MS
  );

  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 100 ||
    timeoutMs > 30000
  ) {
    fail("INVALID_PAYMENT_INTENT_STORE_TIMEOUT");
  }

  async function rpc(name, body) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      timeoutMs
    );

    try {
      const response = await fetchImpl(
        baseUrl + "/rest/v1/rpc/" + name,
        {
          method: "POST",
          headers: {
            apikey: serviceRoleKey,
            authorization:
              "Bearer " + serviceRoleKey,
            "content-type":
              "application/json"
          },
          body: JSON.stringify(body),
          signal: controller.signal
        }
      );

      if (
        !response ||
        response.ok !== true
      ) {
        fail("PAYMENT_INTENT_STORE_UNAVAILABLE");
      }

      return await response.json();

    } catch (error) {
      if (
        error &&
        error.name === "AbortError"
      ) {
        fail("PAYMENT_INTENT_STORE_TIMEOUT");
      }

      throw error;

    } finally {
      clearTimeout(timer);
    }
  }

  async function createOnce(intent) {
    const normalized =
      normalizeStoredIntent(intent);

    if (normalized.schema !== SCHEMA) {
      fail("INVALID_PAYMENT_INTENT");
    }

    const result = await rpc(
      "safegate_colosseum_create_payment_intent",
      {
        p_intent_id:
          normalized.intent_id,
        p_request_id:
          normalized.request.request_id,
        p_request_hash:
          normalized.request.request_hash,
        p_chain_id:
          normalized.payment.chain_id,
        p_asset:
          normalized.payment.asset,
        p_token_contract:
          normalized.payment.token_contract,
        p_payment_sender:
          normalized.payment.payment_sender,
        p_merchant_receiver:
          normalized.payment.merchant_receiver,
        p_amount_base_units:
          normalized.payment.amount_base_units,
        p_created_at:
          normalized.created_at,
        p_expires_at:
          normalized.expires_at
      }
    );

    if (
      result !== true &&
      result !== false
    ) {
      fail("INVALID_PAYMENT_INTENT_CREATE_RESPONSE");
    }

    return result;
  }

  async function get(intentId) {
    const id = requireText(
      intentId,
      "INVALID_PAYMENT_INTENT_ID",
      /^SG-COL-INTENT-[A-F0-9]{32}$/
    );

    const result = await rpc(
      "safegate_colosseum_get_payment_intent",
      {
        p_intent_id: id
      }
    );

    if (
      result === null ||
      result === undefined
    ) {
      return null;
    }

    if (
      typeof result !== "object" ||
      Array.isArray(result)
    ) {
      fail("INVALID_PAYMENT_INTENT_READ_RESPONSE");
    }

    return normalizeStoredIntent({
      schema: SCHEMA,
      version: "1.0.0",
      intent_id: result.intent_id,
      state: result.state,
      request: {
        request_id: result.request_id,
        request_hash: result.request_hash
      },
      payment: {
        chain_id: result.chain_id,
        asset: result.asset,
        token_contract: result.token_contract,
        payment_sender: result.payment_sender,
        merchant_receiver: result.merchant_receiver,
        amount_base_units: result.amount_base_units
      },
      created_at: result.created_at,
      expires_at: result.expires_at
    });
  }

  return {
    createOnce,
    get
  };
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  createSupabasePaymentIntentStore
};