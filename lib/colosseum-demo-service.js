"use strict";

const crypto = require("node:crypto");
const { canonicalJson } = require("./canonical-json");

const SERVICE_PATH =
  "/v1/demo/premium-intel";

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

async function executeRegisteredDemoService(input = {}) {
  const requestId = requireText(
    input.requestId,
    "DEMO_REQUEST_ID_REQUIRED",
    /^SG-EVM-REQ-[A-Z0-9-]{12,80}$/
  );

  const method = requireText(
    input.method,
    "DEMO_METHOD_REQUIRED"
  ).toUpperCase();

  const path = requireText(
    input.path,
    "DEMO_PATH_REQUIRED"
  );

  if (
    method !== "POST" ||
    path !== SERVICE_PATH
  ) {
    fail(
      "UNREGISTERED_DEMO_SERVICE",
      "Only the registered Colosseum demo service is executable."
    );
  }

  if (!isObject(input.body)) {
    fail("DEMO_BODY_REQUIRED");
  }

  const sku = requireText(
    input.body.sku,
    "DEMO_SKU_REQUIRED",
    /^[A-Za-z0-9._:-]{1,80}$/
  );

  const descriptor = {
    sku,
    request_id: requestId,
    attributes:
      isObject(input.body.attributes)
        ? input.body.attributes
        : {}
  };

  const digest = crypto
    .createHash("sha256")
    .update(canonicalJson(descriptor), "utf8")
    .digest("hex");

  const score =
    parseInt(digest.slice(0, 6), 16) % 1000;

  return {
    statusCode: 200,
    body: {
      ok: true,
      service:
        "safegate_colosseum_registered_demo",
      service_mode:
        "DETERMINISTIC_LOCAL_EXECUTION",
      request_id: requestId,
      result: {
        sku,
        confidence_bps:
          8000 + (score % 1500),
        signal:
          score % 3 === 0
            ? "REVIEW"
            : "PASS",
        result_hash:
          digest
      }
    }
  };
}

module.exports = {
  SERVICE_PATH,
  executeRegisteredDemoService
};