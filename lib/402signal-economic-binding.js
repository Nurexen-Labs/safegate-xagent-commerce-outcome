"use strict";

const crypto = require("node:crypto");

const {
  canonicalJson
} = require("./canonical-json");


const SCHEMA =
  "SAFEGATE_402SIGNAL_PAYMENT_EXPECTATION_V1";

const DOMAIN =
  "safegate.402signal.payment-expectation.v1";


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


function clone(value) {
  return JSON.parse(
    JSON.stringify(value)
  );
}


function deepFreeze(value) {
  if (
    value &&
    typeof value === "object" &&
    !Object.isFrozen(value)
  ) {
    Object.freeze(value);

    for (
      const child of
      Object.values(value)
    ) {
      deepFreeze(child);
    }
  }

  return value;
}


function sha256Canonical(value) {
  return crypto
    .createHash("sha256")
    .update(
      canonicalJson(value),
      "utf8"
    )
    .digest("hex");
}


function requireText(
  value,
  code,
  maxLength = 256
) {
  const text =
    String(value ?? "").trim();

  if (
    !text ||
    text.length > maxLength
  ) {
    fail(code);
  }

  return text;
}


function normalizeOpaqueIdentifier(
  value,
  code
) {
  const text =
    requireText(
      value,
      code,
      256
    );

  /*
   * EVM-like identifiers are case-insensitive.
   * Other chain identifiers remain byte-for-byte textual.
   */
  if (
    /^0x[0-9a-fA-F]+$/.test(text)
  ) {
    return text.toLowerCase();
  }

  return text;
}


function normalizeNetwork(
  value
) {
  return requireText(
    value,
    "INVALID_EXPECTED_NETWORK",
    100
  ).toLowerCase();
}


function normalizeAmount(
  value
) {
  const text =
    requireText(
      value,
      "INVALID_EXPECTED_AMOUNT",
      100
    );

  if (
    !/^[1-9][0-9]*$/.test(text)
  ) {
    fail(
      "INVALID_EXPECTED_AMOUNT"
    );
  }

  return text;
}


function normalizeAcceptedTerms(
  accepted
) {
  if (!isObject(accepted)) {
    fail(
      "INVALID_ACCEPTED_TERMS"
    );
  }

  const scheme =
    requireText(
      accepted.scheme,
      "INVALID_PAYMENT_SCHEME",
      50
    ).toLowerCase();

  /*
   * Stage 12 deliberately protects exact-payment profile.
   * Batch/session/native-charge profiles stay separate.
   */
  if (scheme !== "exact") {
    fail(
      "UNSUPPORTED_PAYMENT_SCHEME"
    );
  }

  return {
    scheme,

    network:
      normalizeNetwork(
        accepted.network
      ),

    asset:
      normalizeOpaqueIdentifier(
        accepted.asset,
        "INVALID_EXPECTED_ASSET"
      ),

    amount_base_units:
      normalizeAmount(
        accepted.amount
      ),

    recipient:
      normalizeOpaqueIdentifier(
        accepted.payTo,
        "INVALID_EXPECTED_RECIPIENT"
      )
  };
}


function normalizeNow(
  value
) {
  const number =
    Number(value);

  if (
    !Number.isSafeInteger(number) ||
    number < 0
  ) {
    fail(
      "INVALID_EXPECTATION_TIME"
    );
  }

  return number;
}


function createPaymentExpectation({
  verifiedAction,
  requestId,
  nowEpochSeconds
}) {
  if (
    !isObject(verifiedAction) ||
    verifiedAction.model !==
      "proof_carrying_route_v1"
  ) {
    fail(
      "INVALID_VERIFIED_ROUTE_ACTION"
    );
  }

  const requestIdText =
    requireText(
      requestId,
      "INVALID_REQUEST_ID",
      120
    );

  const quoteSha256 =
    requireText(
      verifiedAction.quote_sha256,
      "INVALID_QUOTE_HASH",
      64
    ).toLowerCase();

  if (
    !/^[a-f0-9]{64}$/.test(
      quoteSha256
    )
  ) {
    fail(
      "INVALID_QUOTE_HASH"
    );
  }

  const expiresAt =
    Number(
      verifiedAction.expires_at
    );

  if (
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= 0
  ) {
    fail(
      "INVALID_ROUTE_EXPIRY"
    );
  }

  const now =
    normalizeNow(
      nowEpochSeconds
    );

  if (now >= expiresAt) {
    fail(
      "ROUTE_EVIDENCE_EXPIRED"
    );
  }

  const terms =
    normalizeAcceptedTerms(
      verifiedAction.accepted
    );

  const base = {
    schema:
      SCHEMA,

    version:
      "1.0.0",

    domain:
      DOMAIN,

    model:
      "proof_carrying_route_v1",

    request_id:
      requestIdText,

    quote_sha256:
      quoteSha256,

    expires_at:
      expiresAt,

    terms
  };

  const bindingSha256 =
    sha256Canonical(
      base
    );

  return deepFreeze({
    ...base,

    binding_sha256:
      bindingSha256
  });
}


function validatePaymentExpectation(
  expectation,
  nowEpochSeconds
) {
  if (
    !isObject(expectation) ||
    expectation.schema !== SCHEMA ||
    expectation.domain !== DOMAIN ||
    expectation.model !==
      "proof_carrying_route_v1"
  ) {
    fail(
      "INVALID_PAYMENT_EXPECTATION"
    );
  }

  const now =
    normalizeNow(
      nowEpochSeconds
    );

  if (
    now >=
    Number(
      expectation.expires_at
    )
  ) {
    fail(
      "ROUTE_EVIDENCE_EXPIRED"
    );
  }

  const canonicalBase = {
    schema:
      expectation.schema,

    version:
      expectation.version,

    domain:
      expectation.domain,

    model:
      expectation.model,

    request_id:
      expectation.request_id,

    quote_sha256:
      expectation.quote_sha256,

    expires_at:
      expectation.expires_at,

    terms:
      normalizeAcceptedTerms({
        scheme:
          expectation.terms?.scheme,

        network:
          expectation.terms?.network,

        asset:
          expectation.terms?.asset,

        amount:
          expectation.terms
            ?.amount_base_units,

        payTo:
          expectation.terms
            ?.recipient
      })
  };

  const actualBinding =
    sha256Canonical(
      canonicalBase
    );

  if (
    actualBinding !==
    expectation.binding_sha256
  ) {
    fail(
      "PAYMENT_EXPECTATION_BINDING_MISMATCH"
    );
  }

  return true;
}


function verifyPaymentAgainstExpectation(
  expectation,
  verification,
  nowEpochSeconds
) {
  validatePaymentExpectation(
    expectation,
    nowEpochSeconds
  );

  if (!isObject(verification)) {
    fail(
      "INVALID_PAYMENT_VERIFICATION"
    );
  }

  if (
    verification.payment_status !==
      "PAYMENT_VERIFIED"
  ) {
    fail(
      "PAYMENT_NOT_VERIFIED"
    );
  }

  if (
    String(
      verification.request_id || ""
    ) !==
    expectation.request_id
  ) {
    fail(
      "PAYMENT_REQUEST_ID_MISMATCH"
    );
  }

  const network =
    normalizeNetwork(
      verification.network
    );

  if (
    network !==
    expectation.terms.network
  ) {
    fail(
      "PAYMENT_NETWORK_MISMATCH"
    );
  }

  const asset =
    normalizeOpaqueIdentifier(
      verification.asset,
      "INVALID_PAYMENT_ASSET"
    );

  if (
    asset !==
    expectation.terms.asset
  ) {
    fail(
      "PAYMENT_ASSET_MISMATCH"
    );
  }

  const amount =
    normalizeAmount(
      verification.amount_base_units
    );

  if (
    amount !==
    expectation
      .terms
      .amount_base_units
  ) {
    fail(
      "PAYMENT_AMOUNT_MISMATCH"
    );
  }

  const recipient =
    normalizeOpaqueIdentifier(
      verification.recipient,
      "INVALID_PAYMENT_RECIPIENT"
    );

  if (
    recipient !==
    expectation.terms.recipient
  ) {
    fail(
      "PAYMENT_RECIPIENT_MISMATCH"
    );
  }

  const transactionReference =
    requireText(
      verification.transaction_hash ||
      verification.transaction_reference,
      "PAYMENT_TRANSACTION_REFERENCE_REQUIRED",
      256
    );

  return deepFreeze({
    ok:
      true,

    binding_status:
      "MATCHED",

    request_id:
      expectation.request_id,

    quote_sha256:
      expectation.quote_sha256,

    network,

    asset,

    amount_base_units:
      amount,

    recipient,

    transaction_reference:
      transactionReference,

    expectation_binding_sha256:
      expectation.binding_sha256
  });
}


function createBoundPaymentVerifier({
  expectation,
  verifyPayment,
  nowEpochSeconds
}) {
  if (
    typeof verifyPayment !==
      "function"
  ) {
    fail(
      "PAYMENT_VERIFIER_REQUIRED"
    );
  }

  const resolveNow =
    typeof nowEpochSeconds ===
      "function"
      ? nowEpochSeconds
      : () =>
          nowEpochSeconds;

  return async function boundVerifyPayment(
    paymentProof
  ) {
    /*
     * Fail before touching downstream payment verifier
     * if authenticated route expectation has expired/tampered.
     */
    const before =
      normalizeNow(
        resolveNow()
      );

    validatePaymentExpectation(
      expectation,
      before
    );

    const result =
      await verifyPayment(
        paymentProof
      );

    if (
      !isObject(result) ||
      !isObject(result.verification)
    ) {
      fail(
        "INVALID_PAYMENT_VERIFIER_RESULT"
      );
    }

    const after =
      normalizeNow(
        resolveNow()
      );

    verifyPaymentAgainstExpectation(
      expectation,
      result.verification,
      after
    );

    return result;
  };
}


module.exports = {
  SCHEMA,
  DOMAIN,
  normalizeAcceptedTerms,
  createPaymentExpectation,
  validatePaymentExpectation,
  verifyPaymentAgainstExpectation,
  createBoundPaymentVerifier
};