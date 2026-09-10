"use strict";

const SDK_VERSION = "0.4.0";
const MCP_PROTOCOL_VERSION = "2026-07-28";
const DEFAULT_TIMEOUT_MS = 15000;

const {
  SILENTSWAP_SDK_BRIDGE_SCHEMA,
  hashSilentSwapOrderReference,
  mapSilentSwapOrderState,
  executeSilentSwapObservedCommerce,
  getSilentSwapCapability
} = require("./silentswap");


class SafeGateError extends Error {
  constructor(code, message, options = {}) {
    super(message || code);
    this.name = "SafeGateError";
    this.code = code;
    this.status = Number(options.status || 0);
    this.details = options.details || null;
  }
}

function fail(code, message, options = {}) {
  throw new SafeGateError(code, message, options);
}

function requireObject(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(code, "An object is required.");
  }
  return value;
}

function normalizeBaseUrl(value) {
  const text = String(value || "").trim();

  if (!text) {
    fail("BASE_URL_REQUIRED", "SafeGate baseUrl is required.");
  }

  let url;

  try {
    url = new URL(text);
  } catch (_) {
    fail("INVALID_BASE_URL", "SafeGate baseUrl is invalid.");
  }

  const local =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "::1";

  if (url.protocol !== "https:" && !local) {
    fail(
      "HTTPS_REQUIRED",
      "SafeGate SDK requires HTTPS except for localhost development."
    );
  }

  url.search = "";
  url.hash = "";

  return url.toString().replace(/\/+$/, "");
}

class SafeGateClient {
  constructor(options = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.fetch = options.fetch || globalThis.fetch;
    this.timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);

    if (typeof this.fetch !== "function") {
      fail("FETCH_UNAVAILABLE", "A fetch implementation is required.");
    }

    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      fail("INVALID_TIMEOUT", "timeoutMs must be positive.");
    }
  }

  async _request(path, options = {}) {
    const controller = new AbortController();

    const timer = setTimeout(
      () => controller.abort(),
      this.timeoutMs
    );

    try {
      let response;

      try {
        response = await this.fetch(
          this.baseUrl + path,
          {
            method: options.method || "GET",
            headers: {
              accept: "application/json",
              ...(options.body !== undefined
                ? { "content-type": "application/json" }
                : {}),
              ...(options.headers || {})
            },
            body:
              options.body === undefined
                ? undefined
                : JSON.stringify(options.body),
            signal: controller.signal
          }
        );
      } catch (error) {
        if (error && error.name === "AbortError") {
          fail("SAFEGATE_TIMEOUT", "SafeGate request timed out.");
        }

        fail(
          "SAFEGATE_NETWORK_ERROR",
          "SafeGate network request failed.",
          {
            details: {
              cause: String(
                error && error.message
                  ? error.message
                  : error
              )
            }
          }
        );
      }

      const text = await response.text();
      let payload = null;

      if (text) {
        try {
          payload = JSON.parse(text);
        } catch (_) {
          fail(
            "SAFEGATE_INVALID_RESPONSE",
            "SafeGate returned invalid JSON.",
            { status: response.status }
          );
        }
      }

      if (!response.ok) {
        const apiError =
          payload &&
          payload.error &&
          typeof payload.error === "object"
            ? payload.error
            : {};

        fail(
          String(apiError.code || "HTTP_" + response.status),
          String(
            apiError.message ||
            "SafeGate request failed with HTTP " + response.status + "."
          ),
          {
            status: response.status,
            details: payload
          }
        );
      }

      return payload;
    } finally {
      clearTimeout(timer);
    }
  }

  getVerifyCapability() {
    return this._request("/v1/verify");
  }

  verifyCommerce(attestation) {
    requireObject(attestation, "INVALID_ATTESTATION");

    return this._request(
      "/v1/verify",
      {
        method: "POST",
        body: {
          schema: "SAFEGATE_VERIFY_REQUEST_V1",
          verificationType: "COMMERCE_OUTCOME",
          proof: {
            format: "SAFEGATE_COMMERCE_ATTESTATION_V1",
            attestation
          }
        }
      }
    );
  }

  getMiddlewareCapability() {
    return this._request("/v1/middleware");
  }

  async _mcp(method, params = {}, toolName = "") {
    const body = {
      jsonrpc: "2.0",
      id: Date.now() + "-" + Math.random().toString(16).slice(2),
      method,
      params: {
        ...params,
        _meta: {
          ...(params._meta || {}),
          "io.modelcontextprotocol/protocolVersion":
            MCP_PROTOCOL_VERSION,
          "io.modelcontextprotocol/clientInfo": {
            name: "@nurexenlabs/safegate-sdk",
            version: SDK_VERSION
          },
          "io.modelcontextprotocol/clientCapabilities": {}
        }
      }
    };

    const headers = {
      "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
      "Mcp-Method": method
    };

    if (toolName) {
      headers["Mcp-Name"] = toolName;
    }

    const response = await this._request(
      "/mcp",
      {
        method: "POST",
        headers,
        body
      }
    );

    if (response && response.error) {
      fail(
        "MCP_JSONRPC_ERROR",
        String(response.error.message || "MCP JSON-RPC error."),
        { details: response.error }
      );
    }

    return response ? response.result : null;
  }

  mcpDiscover() {
    return this._mcp("server/discover");
  }

  mcpListTools() {
    return this._mcp("tools/list");
  }

  async mcpVerifyCommerce(attestation) {
    requireObject(attestation, "INVALID_ATTESTATION");

    const result = await this._mcp(
      "tools/call",
      {
        name: "safegate_verify_commerce",
        arguments: {
          attestation
        }
      },
      "safegate_verify_commerce"
    );

    if (result && result.isError === true) {
      const toolError =
        result.structuredContent &&
        result.structuredContent.error
          ? result.structuredContent.error
          : {};

      fail(
        String(toolError.code || "SAFEGATE_TOOL_ERROR"),
        String(toolError.message || "SafeGate MCP tool failed."),
        { details: result }
      );
    }

    return result ? result.structuredContent : null;
  }
}

function createSafeGateClient(options) {
  return new SafeGateClient(options);
}

module.exports = {
  SDK_VERSION,
  MCP_PROTOCOL_VERSION,
  SafeGateError,
  SafeGateClient,
  createSafeGateClient,
  SILENTSWAP_SDK_BRIDGE_SCHEMA,
  hashSilentSwapOrderReference,
  mapSilentSwapOrderState,
  executeSilentSwapObservedCommerce,
  getSilentSwapCapability
};