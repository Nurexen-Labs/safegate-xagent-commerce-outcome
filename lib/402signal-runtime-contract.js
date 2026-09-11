"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const {
  canonicalJson
} = require("./canonical-json");


const LOCK_PATH =
  path.join(
    __dirname,
    "..",
    "verification",
    "402signal-route-guard-lock.json"
  );


const EXPECTED =
  Object.freeze({
    schema:
      "SAFEGATE_402SIGNAL_SUPPLY_CHAIN_LOCK_V1",

    package:
      "@402signal/route-guard",

    version:
      "0.7.2",

    release_tag:
      "route-guard-v0.7.2",

    release_commit:
      "fdbcff3bc9b31826567b8cb456d4a883009eb9ff",

    artifact:
      "402signal-route-guard-0.7.2.tgz",

    sha256:
      "f23d534537a847d592770aea2bbdbbce493f668645d6dcf95985b21d2a70195a",

    source:
      "GITHUB_RELEASE",

    node_min_major:
      22,

    runtime_dependencies:
      0
  });


const MAX_RAW_ROUTE_BYTES =
  256 * 1024;

const MAX_CHALLENGE_BYTES =
  128 * 1024;


function fail(code, message) {
  const error =
    new Error(message || code);

  error.code =
    code;

  throw error;
}


function isObject(value) {
  return !!value &&
    typeof value === "object" &&
    !Array.isArray(value);
}


function sha256Buffer(value) {
  return crypto
    .createHash("sha256")
    .update(value)
    .digest("hex");
}


function sha256Text(value) {
  return sha256Buffer(
    Buffer.from(
      String(value),
      "utf8"
    )
  );
}


function sha256Canonical(value) {
  return sha256Text(
    canonicalJson(value)
  );
}


function validateSupplyChainLock(
  lock
) {
  if (!isObject(lock)) {
    fail(
      "INVALID_402SIGNAL_SUPPLY_CHAIN_LOCK"
    );
  }

  for (
    const [key, expected] of
    Object.entries(EXPECTED)
  ) {
    if (
      lock[key] !==
      expected
    ) {
      fail(
        "402SIGNAL_SUPPLY_CHAIN_LOCK_MISMATCH_" +
        String(key).toUpperCase()
      );
    }
  }

  return true;
}


function loadSupplyChainLock(
  lockPath = LOCK_PATH
) {
  let text;

  try {
    text =
      fs.readFileSync(
        lockPath,
        "utf8"
      );
  } catch {
    fail(
      "402SIGNAL_SUPPLY_CHAIN_LOCK_MISSING"
    );
  }

  let lock;

  try {
    lock =
      JSON.parse(text);
  } catch {
    fail(
      "402SIGNAL_SUPPLY_CHAIN_LOCK_INVALID_JSON"
    );
  }

  validateSupplyChainLock(
    lock
  );

  return lock;
}


function assert402SignalRuntime(
  version =
    process.versions.node,
  lock =
    loadSupplyChainLock()
) {
  validateSupplyChainLock(
    lock
  );

  const match =
    /^(\d+)\.(\d+)\.(\d+)/
      .exec(
        String(version || "")
      );

  if (!match) {
    fail(
      "INVALID_NODE_VERSION"
    );
  }

  const major =
    Number(
      match[1]
    );

  if (
    major <
    lock.node_min_major
  ) {
    fail(
      "402SIGNAL_NODE_RUNTIME_TOO_OLD"
    );
  }

  return {
    ok:
      true,

    node_version:
      version,

    minimum_major:
      lock.node_min_major
  };
}


function verifyArtifactSha256(
  filePath,
  lock =
    loadSupplyChainLock()
) {
  validateSupplyChainLock(
    lock
  );

  if (
    !fs.existsSync(
      filePath
    )
  ) {
    fail(
      "402SIGNAL_ARTIFACT_MISSING"
    );
  }

  const bytes =
    fs.readFileSync(
      filePath
    );

  const digest =
    sha256Buffer(
      bytes
    );

  if (
    digest !==
    lock.sha256
  ) {
    fail(
      "402SIGNAL_ARTIFACT_DIGEST_MISMATCH"
    );
  }

  return {
    ok:
      true,

    artifact:
      lock.artifact,

    sha256:
      digest
  };
}


function requireRawText(
  value,
  code,
  maxBytes
) {
  if (
    typeof value !==
      "string"
  ) {
    fail(code);
  }

  const bytes =
    Buffer.byteLength(
      value,
      "utf8"
    );

  if (
    bytes < 1 ||
    bytes >
      maxBytes
  ) {
    fail(
      code + "_SIZE"
    );
  }

  return value;
}


function cloneJsonCompatible(
  value
) {
  try {
    return JSON.parse(
      JSON.stringify(
        value
      )
    );
  } catch {
    fail(
      "TRUSTED_LOG_KEY_NOT_JSON_COMPATIBLE"
    );
  }
}


function trustedLogKeyHash(
  trustedLogVkey
) {
  if (
    trustedLogVkey === null ||
    trustedLogVkey === undefined
  ) {
    fail(
      "TRUSTED_LOG_KEY_REQUIRED"
    );
  }

  if (
    typeof trustedLogVkey ===
      "string"
  ) {
    return sha256Text(
      trustedLogVkey
    );
  }

  return sha256Canonical(
    trustedLogVkey
  );
}


function createRouteGuardBoundary(
  input
) {
  assert402SignalRuntime();

  if (!isObject(input)) {
    fail(
      "INVALID_402SIGNAL_ROUTE_BOUNDARY"
    );
  }

  /*
   * IMPORTANT:
   * Do not JSON.parse + JSON.stringify these.
   * The official guard must receive exact raw text.
   */
  const routeRequestJson =
    requireRawText(
      input.routeRequestJson,
      "RAW_ROUTE_REQUEST_JSON_REQUIRED",
      MAX_RAW_ROUTE_BYTES
    );

  const routeResponseJson =
    requireRawText(
      input.routeResponseJson,
      "RAW_ROUTE_RESPONSE_JSON_REQUIRED",
      MAX_RAW_ROUTE_BYTES
    );


  if (
    input.requireRouteBinding !==
      true
  ) {
    fail(
      "ROUTE_BINDING_REQUIRED"
    );
  }


  if (
    !isObject(
      input.transportPolicy
    )
  ) {
    fail(
      "TRANSPORT_POLICY_REQUIRED"
    );
  }


  const policy =
    input.transportPolicy;


  if (
    policy.redirect !==
      "error"
  ) {
    fail(
      "REDIRECTS_MUST_BE_DISABLED"
    );
  }


  if (
    policy.automaticRetry !==
      false
  ) {
    fail(
      "AUTOMATIC_RETRY_FORBIDDEN"
    );
  }


  if (
    policy.paymentAwareFetch !==
      false
  ) {
    fail(
      "PAYMENT_AWARE_FETCH_FORBIDDEN"
    );
  }


  if (
    policy.cookieJar !==
      false
  ) {
    fail(
      "COOKIE_JAR_FORBIDDEN"
    );
  }


  if (
    policy.autoPay !==
      false
  ) {
    fail(
      "AUTO_PAY_FORBIDDEN"
    );
  }


  if (
    !isObject(
      input.request
    )
  ) {
    fail(
      "ROUTE_REQUEST_DESCRIPTOR_REQUIRED"
    );
  }


  const urlText =
    String(
      input.request.url || ""
    );


  let url;

  try {
    url =
      new URL(
        urlText
      );
  } catch {
    fail(
      "INVALID_SELLER_URL"
    );
  }


  if (
    url.protocol !==
      "https:"
  ) {
    fail(
      "HTTPS_SELLER_URL_REQUIRED"
    );
  }


  const method =
    String(
      input.request.method || ""
    ).toUpperCase();


  if (
    ![
      "GET",
      "POST"
    ].includes(
      method
    )
  ) {
    fail(
      "UNSUPPORTED_SELLER_METHOD"
    );
  }


  if (
    !Buffer.isBuffer(
      input.request.body
    ) &&
    !(
      input.request.body instanceof
      Uint8Array
    )
  ) {
    fail(
      "REQUEST_BODY_BYTES_REQUIRED"
    );
  }


  const body =
    Buffer.from(
      input.request.body
    );


  if (
    !isObject(
      input.challenge
    )
  ) {
    fail(
      "RAW_402_CHALLENGE_REQUIRED"
    );
  }


  if (
    Number(
      input.challenge.status
    ) !== 402
  ) {
    fail(
      "HTTP_402_REQUIRED"
    );
  }


  const challengeBody =
    requireRawText(
      input.challenge.bodyText,
      "RAW_CHALLENGE_BODY_REQUIRED",
      MAX_CHALLENGE_BYTES
    );


  const paymentRequiredHeader =
    input.challenge
      .paymentRequiredHeader ===
        null ||
    input.challenge
      .paymentRequiredHeader ===
        undefined
      ? null
      : String(
          input.challenge
            .paymentRequiredHeader
        );


  const xPaymentRequiredHeader =
    input.challenge
      .xPaymentRequiredHeader ===
        null ||
    input.challenge
      .xPaymentRequiredHeader ===
        undefined
      ? null
      : String(
          input.challenge
            .xPaymentRequiredHeader
        );


  if (
    input.trustedLogKeySource !==
      "PINNED_CONFIGURATION"
  ) {
    fail(
      "TRUSTED_LOG_KEY_MUST_BE_EXTERNALLY_PINNED"
    );
  }


  const expectedLogKeyHash =
    String(
      input.trustedLogVkeySha256 || ""
    ).toLowerCase();


  if (
    !/^[a-f0-9]{64}$/
      .test(
        expectedLogKeyHash
      )
  ) {
    fail(
      "TRUSTED_LOG_KEY_HASH_REQUIRED"
    );
  }


  const actualLogKeyHash =
    trustedLogKeyHash(
      input.trustedLogVkey
    );


  if (
    actualLogKeyHash !==
      expectedLogKeyHash
  ) {
    fail(
      "TRUSTED_LOG_KEY_PIN_MISMATCH"
    );
  }


  const trustedLogVkey =
    typeof input.trustedLogVkey ===
      "string"
      ? input.trustedLogVkey
      : cloneJsonCompatible(
          input.trustedLogVkey
        );


  const routeRequestHash =
    sha256Text(
      routeRequestJson
    );

  const routeResponseHash =
    sha256Text(
      routeResponseJson
    );

  const challengeHash =
    sha256Text(
      challengeBody
    );

  const requestBodyHash =
    sha256Buffer(
      body
    );


  /*
   * Return a factory, not a mutable shared options object.
   * Each call produces fresh request body bytes.
   */
  return Object.freeze({

    profile:
      "SAFEGATE_402SIGNAL_ROUTE_BOUNDARY_V1",

    supply_chain:
      Object.freeze({
        package:
          EXPECTED.package,

        version:
          EXPECTED.version,

        release_tag:
          EXPECTED.release_tag,

        release_commit:
          EXPECTED.release_commit,

        artifact_sha256:
          EXPECTED.sha256
      }),

    invariants:
      Object.freeze({
        raw_route_json_preserved:
          true,

        route_binding_required:
          true,

        redirects_disabled:
          true,

        automatic_retry:
          false,

        payment_aware_fetch:
          false,

        auto_pay:
          false,

        trusted_log_key:
          "PINNED_CONFIGURATION"
      }),

    fingerprints:
      Object.freeze({
        route_request_sha256:
          routeRequestHash,

        route_response_sha256:
          routeResponseHash,

        challenge_body_sha256:
          challengeHash,

        request_body_sha256:
          requestBodyHash,

        trusted_log_key_sha256:
          actualLogKeyHash
      }),

    toRouteGuardOptions() {

      /*
       * Re-hash closed-over immutable strings and
       * original copied bytes before every handoff.
       */
      if (
        sha256Text(
          routeRequestJson
        ) !==
          routeRequestHash ||
        sha256Text(
          routeResponseJson
        ) !==
          routeResponseHash ||
        sha256Text(
          challengeBody
        ) !==
          challengeHash ||
        sha256Buffer(
          body
        ) !==
          requestBodyHash ||
        trustedLogKeyHash(
          trustedLogVkey
        ) !==
          actualLogKeyHash
      ) {
        fail(
          "ROUTE_BOUNDARY_MUTATION_DETECTED"
        );
      }

      return {
        routeRequestJson,

        routeResponseJson,

        trustedLogVkey:
          typeof trustedLogVkey ===
            "string"
            ? trustedLogVkey
            : cloneJsonCompatible(
                trustedLogVkey
              ),

        request: {
          url:
            urlText,

          method,

          body:
            Buffer.from(
              body
            )
        },

        challenge: {
          status:
            402,

          bodyText:
            challengeBody,

          paymentRequiredHeader,

          xPaymentRequiredHeader
        }
      };
    }
  });
}


module.exports = {
  EXPECTED,
  LOCK_PATH,
  MAX_RAW_ROUTE_BYTES,
  loadSupplyChainLock,
  validateSupplyChainLock,
  assert402SignalRuntime,
  verifyArtifactSha256,
  trustedLogKeyHash,
  createRouteGuardBoundary
};