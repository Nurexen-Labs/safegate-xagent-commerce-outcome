"use strict";

const assert =
  require("node:assert");

const {
  EXPECTED,
  loadSupplyChainLock,
  validateSupplyChainLock,
  assert402SignalRuntime,
  trustedLogKeyHash,
  createRouteGuardBoundary
} =
  require("../lib/402signal-runtime-contract");


function main() {

  const lock =
    loadSupplyChainLock();


  assert.equal(
    validateSupplyChainLock(
      lock
    ),
    true
  );


  assert.equal(
    lock.package,
    "@402signal/route-guard"
  );


  assert.equal(
    lock.version,
    "0.7.2"
  );


  assert.equal(
    lock.release_commit,
    "fdbcff3bc9b31826567b8cb456d4a883009eb9ff"
  );


  assert.equal(
    lock.sha256,
    "f23d534537a847d592770aea2bbdbbce493f668645d6dcf95985b21d2a70195a"
  );


  /*
   * SUPPLY CHAIN MANIFEST TAMPER
   */
  assert.throws(
    () =>
      validateSupplyChainLock({
        ...lock,
        version:
          "999.0.0"
      }),

    error =>
      error &&
      error.code ===
        "402SIGNAL_SUPPLY_CHAIN_LOCK_MISMATCH_VERSION"
  );


  assert.throws(
    () =>
      validateSupplyChainLock({
        ...lock,
        sha256:
          "0".repeat(64)
      }),

    error =>
      error &&
      error.code ===
        "402SIGNAL_SUPPLY_CHAIN_LOCK_MISMATCH_SHA256"
  );


  /*
   * RUNTIME GATE
   */
  assert.equal(
    assert402SignalRuntime(
      "22.0.0",
      lock
    ).ok,
    true
  );


  assert.equal(
    assert402SignalRuntime(
      "24.16.0",
      lock
    ).ok,
    true
  );


  assert.throws(
    () =>
      assert402SignalRuntime(
        "21.99.99",
        lock
      ),

    error =>
      error &&
      error.code ===
        "402SIGNAL_NODE_RUNTIME_TOO_OLD"
  );


  /*
   * Intentionally includes duplicate JSON keys.
   * SafeGate must preserve raw bytes and leave
   * parsing/rejection to official 402Signal guard.
   */
  const rawRequest =
    '{"need":"test","require_route_binding":true,"x":1,"x":2}';

  const rawResponse =
    '{"synthetic":true,"winner":"seller-a","winner":"seller-b"}';

  const rawChallenge =
    '{"x402Version":2,"accepts":[{"scheme":"exact"}]}';


  const trustedLogVkey = {
    kty:
      "OKP",

    crv:
      "Ed25519",

    x:
      "PUBLIC-SYNTHETIC-TEST-KEY"
  };


  const trustedHash =
    trustedLogKeyHash(
      trustedLogVkey
    );


  const body =
    Buffer.from(
      '{"query":"hello"}',
      "utf8"
    );


  const boundary =
    createRouteGuardBoundary({
      routeRequestJson:
        rawRequest,

      routeResponseJson:
        rawResponse,

      requireRouteBinding:
        true,

      transportPolicy: {
        redirect:
          "error",

        automaticRetry:
          false,

        paymentAwareFetch:
          false,

        cookieJar:
          false,

        autoPay:
          false
      },

      trustedLogKeySource:
        "PINNED_CONFIGURATION",

      trustedLogVkey,

      trustedLogVkeySha256:
        trustedHash,

      request: {
        url:
          "https://seller.example/api",

        method:
          "POST",

        body
      },

      challenge: {
        status:
          402,

        bodyText:
          rawChallenge,

        paymentRequiredHeader:
          "synthetic-header",

        xPaymentRequiredHeader:
          null
      }
    });


  const options =
    boundary
      .toRouteGuardOptions();


  /*
   * Raw text identity must survive exactly.
   */
  assert.equal(
    options.routeRequestJson,
    rawRequest
  );


  assert.equal(
    options.routeResponseJson,
    rawResponse
  );


  assert.equal(
    options.challenge.bodyText,
    rawChallenge
  );


  assert.equal(
    options.request.body.equals(
      body
    ),
    true
  );


  assert.equal(
    boundary.invariants
      .automatic_retry,
    false
  );


  assert.equal(
    boundary.invariants
      .redirects_disabled,
    true
  );


  /*
   * PARSED OBJECT IN PLACE OF RAW JSON
   */
  assert.throws(
    () =>
      createRouteGuardBoundary({
        routeRequestJson: {
          parsed:
            true
        },

        routeResponseJson:
          rawResponse
      }),

    error =>
      error &&
      error.code ===
        "RAW_ROUTE_REQUEST_JSON_REQUIRED"
  );


  /*
   * ROUTE BINDING CANNOT BE OPTIONAL
   */
  assert.throws(
    () =>
      createRouteGuardBoundary({
        routeRequestJson:
          rawRequest,

        routeResponseJson:
          rawResponse,

        requireRouteBinding:
          false
      }),

    error =>
      error &&
      error.code ===
        "ROUTE_BINDING_REQUIRED"
  );


  const baseInput = {
    routeRequestJson:
      rawRequest,

    routeResponseJson:
      rawResponse,

    requireRouteBinding:
      true,

    trustedLogKeySource:
      "PINNED_CONFIGURATION",

    trustedLogVkey,

    trustedLogVkeySha256:
      trustedHash,

    request: {
      url:
        "https://seller.example/api",

      method:
        "POST",

      body
    },

    challenge: {
      status:
        402,

      bodyText:
        rawChallenge
    }
  };


  /*
   * REDIRECT FOLLOWING BLOCKED
   */
  assert.throws(
    () =>
      createRouteGuardBoundary({
        ...baseInput,

        transportPolicy: {
          redirect:
            "follow",

          automaticRetry:
            false,

          paymentAwareFetch:
            false,

          cookieJar:
            false,

          autoPay:
            false
        }
      }),

    error =>
      error &&
      error.code ===
        "REDIRECTS_MUST_BE_DISABLED"
  );


  /*
   * AUTO RETRY BLOCKED
   */
  assert.throws(
    () =>
      createRouteGuardBoundary({
        ...baseInput,

        transportPolicy: {
          redirect:
            "error",

          automaticRetry:
            true,

          paymentAwareFetch:
            false,

          cookieJar:
            false,

          autoPay:
            false
        }
      }),

    error =>
      error &&
      error.code ===
        "AUTOMATIC_RETRY_FORBIDDEN"
  );


  /*
   * PAYMENT-AWARE FETCH BLOCKED
   */
  assert.throws(
    () =>
      createRouteGuardBoundary({
        ...baseInput,

        transportPolicy: {
          redirect:
            "error",

          automaticRetry:
            false,

          paymentAwareFetch:
            true,

          cookieJar:
            false,

          autoPay:
            false
        }
      }),

    error =>
      error &&
      error.code ===
        "PAYMENT_AWARE_FETCH_FORBIDDEN"
  );


  /*
   * AUTO PAY BLOCKED
   */
  assert.throws(
    () =>
      createRouteGuardBoundary({
        ...baseInput,

        transportPolicy: {
          redirect:
            "error",

          automaticRetry:
            false,

          paymentAwareFetch:
            false,

          cookieJar:
            false,

          autoPay:
            true
        }
      }),

    error =>
      error &&
      error.code ===
        "AUTO_PAY_FORBIDDEN"
  );


  /*
   * LOG KEY MAY NOT BE ADOPTED FROM RESPONSE.
   */
  assert.throws(
    () =>
      createRouteGuardBoundary({
        ...baseInput,

        trustedLogKeySource:
          "ROUTE_RESPONSE",

        transportPolicy: {
          redirect:
            "error",

          automaticRetry:
            false,

          paymentAwareFetch:
            false,

          cookieJar:
            false,

          autoPay:
            false
        }
      }),

    error =>
      error &&
      error.code ===
        "TRUSTED_LOG_KEY_MUST_BE_EXTERNALLY_PINNED"
  );


  /*
   * PIN MISMATCH
   */
  assert.throws(
    () =>
      createRouteGuardBoundary({
        ...baseInput,

        trustedLogVkeySha256:
          "0".repeat(64),

        transportPolicy: {
          redirect:
            "error",

          automaticRetry:
            false,

          paymentAwareFetch:
            false,

          cookieJar:
            false,

          autoPay:
            false
        }
      }),

    error =>
      error &&
      error.code ===
        "TRUSTED_LOG_KEY_PIN_MISMATCH"
  );


  /*
   * HTTP ONLY SELLER BLOCKED
   */
  assert.throws(
    () =>
      createRouteGuardBoundary({
        ...baseInput,

        transportPolicy: {
          redirect:
            "error",

          automaticRetry:
            false,

          paymentAwareFetch:
            false,

          cookieJar:
            false,

          autoPay:
            false
        },

        request: {
          url:
            "http://seller.example/api",

          method:
            "POST",

          body
        }
      }),

    error =>
      error &&
      error.code ===
        "HTTPS_SELLER_URL_REQUIRED"
  );


  /*
   * NON-402 CHALLENGE BLOCKED
   */
  assert.throws(
    () =>
      createRouteGuardBoundary({
        ...baseInput,

        transportPolicy: {
          redirect:
            "error",

          automaticRetry:
            false,

          paymentAwareFetch:
            false,

          cookieJar:
            false,

          autoPay:
            false
        },

        challenge: {
          status:
            200,

          bodyText:
            rawChallenge
        }
      }),

    error =>
      error &&
      error.code ===
        "HTTP_402_REQUIRED"
  );


  assert.equal(
    EXPECTED.runtime_dependencies,
    0
  );


  console.log(
    "402SIGNAL_SUPPLY_CHAIN_LOCK=PASS"
  );

  console.log(
    "OFFICIAL_RELEASE_VERSION=0.7.2"
  );

  console.log(
    "OFFICIAL_RELEASE_COMMIT=PINNED"
  );

  console.log(
    "OFFICIAL_ARTIFACT_DIGEST=PINNED"
  );

  console.log(
    "NODE22_RUNTIME_GATE=PASS"
  );

  console.log(
    "RAW_JSON_PRESERVATION=PASS"
  );

  console.log(
    "DUPLICATE_KEY_EVIDENCE_PRESERVED=PASS"
  );

  console.log(
    "ROUTE_BINDING_REQUIRED=PASS"
  );

  console.log(
    "REDIRECTS=BLOCKED"
  );

  console.log(
    "AUTOMATIC_RETRY=BLOCKED"
  );

  console.log(
    "PAYMENT_AWARE_FETCH=BLOCKED"
  );

  console.log(
    "AUTO_PAY=BLOCKED"
  );

  console.log(
    "TRUSTED_LOG_KEY_EXTERNAL_PIN=PASS"
  );

  console.log(
    "LOG_KEY_SUBSTITUTION=BLOCKED"
  );

  console.log(
    "HTTP_SELLER=BLOCKED"
  );

  console.log(
    "REAL_NETWORK_PAYMENT=NONE"
  );

  console.log(
    "WALLET_USED=NO"
  );
}


try {
  main();
} catch (error) {

  console.error(
    "TEST_FAILURE_CODE=" +
    String(
      error && error.code
        ? error.code
        : "UNHANDLED_ERROR"
    )
  );

  console.error(
    error && error.stack
      ? error.stack
      : String(error)
  );

  process.exitCode = 1;
}