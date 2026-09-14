"use strict";

const DEFAULT_TIMEOUT_MS = 8000;

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  throw error;
}

function requireText(value, code, pattern = null) {
  const text = String(value || "").trim();

  if (!text || (pattern && !pattern.test(text))) {
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

function createSupabaseConsumeOnce(options = {}) {
  const baseUrl = normalizeBaseUrl(
    options.url || process.env.SUPABASE_URL
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
    options.timeoutMs || DEFAULT_TIMEOUT_MS
  );

  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 100 ||
    timeoutMs > 30000
  ) {
    fail("INVALID_CONSUME_STORE_TIMEOUT");
  }

  return async function consumeOnce(input = {}) {
    const consumeKey = requireText(
      input.consumeKey,
      "CONSUME_KEY_REQUIRED",
      /^[a-f0-9]{64}$/
    );

    const requestId = requireText(
      input.requestId,
      "REQUEST_ID_REQUIRED"
    );

    const requestHash = requireText(
      input.requestHash,
      "REQUEST_HASH_REQUIRED",
      /^[a-f0-9]{64}$/
    );

    const chainId = Number(input.chainId);

    if (!Number.isInteger(chainId) || chainId <= 0) {
      fail("CHAIN_ID_REQUIRED");
    }

    const transactionHash = requireText(
      input.transactionHash,
      "TRANSACTION_HASH_REQUIRED",
      /^0x[a-fA-F0-9]{64}$/
    ).toLowerCase();

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      timeoutMs
    );

    try {
      const response = await fetchImpl(
        baseUrl +
          "/rest/v1/rpc/safegate_colosseum_consume_once",
        {
          method: "POST",

          headers: {
            apikey: serviceRoleKey,
            authorization:
              "Bearer " + serviceRoleKey,
            "content-type": "application/json"
          },

          body: JSON.stringify({
            p_consume_key: consumeKey,
            p_request_id: requestId,
            p_request_hash: requestHash,
            p_chain_id: chainId,
            p_transaction_hash: transactionHash
          }),

          signal: controller.signal
        }
      );

      if (!response || response.ok !== true) {
        fail(
          "DURABLE_CONSUME_STORE_UNAVAILABLE",
          "Durable consume store rejected the request."
        );
      }

      const result = await response.json();

      if (result !== true && result !== false) {
        fail(
          "INVALID_DURABLE_CONSUME_RESPONSE"
        );
      }

      return result;
    } catch (error) {
      if (
        error &&
        error.name === "AbortError"
      ) {
        fail(
          "DURABLE_CONSUME_STORE_TIMEOUT"
        );
      }

      throw error;
    } finally {
      clearTimeout(timer);
    }
  };
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  createSupabaseConsumeOnce
};