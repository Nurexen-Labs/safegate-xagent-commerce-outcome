"use strict";

const {
  discoverHedera,
  createPaymentRequirements,
  verifyPayment,
  settlePayment,
} = require("../lib/blocky402-hedera");

const {
  runPremiumProductIntel,
} = require("../lib/premium-product-intel");

const DEFAULT_SERVICE_ACCOUNT = "0.0.10289148";
const DEFAULT_PRICE_ATOMIC = "100000";

function encodeBase64Json(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function decodeBase64Json(value) {
  try {
    return JSON.parse(Buffer.from(String(value), "base64").toString("utf8"));
  } catch {
    const error = new Error("Invalid PAYMENT-SIGNATURE header.");
    error.code = "INVALID_PAYMENT_SIGNATURE";
    throw error;
  }
}

function resourceUrl(req) {
  const proto = String(req.headers["x-forwarded-proto"] || "https")
    .split(",")[0]
    .trim();

  const host = String(req.headers.host || "localhost");

  return `${proto}://${host}/api/agent-commerce`;
}

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      capability: "safegate_agent_commerce",
      version: "0.1.0-ethonline",
      method: "POST",
      network: "hedera:testnet",
      payment_protocol: "x402-v2",
      facilitator: "Blocky402",
      service: "premium-product-intel",
      assurance_target: "OBSERVED",
    });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({
      ok: false,
      error: { code: "METHOD_NOT_ALLOWED" },
    });
  }

  try {
    const discovered = await discoverHedera();

    const paymentRequirements = createPaymentRequirements({
      amount: process.env.X402_PRICE_ATOMIC || DEFAULT_PRICE_ATOMIC,
      payTo:
        process.env.HEDERA_SERVICE_ACCOUNT_ID ||
        DEFAULT_SERVICE_ACCOUNT,
      feePayer: discovered.feePayer,
    });

    const paymentRequired = {
      x402Version: 2,
      error: "PAYMENT-SIGNATURE header is required",
      resource: {
        url: resourceUrl(req),
        description:
          "SafeGate premium product intelligence with observed commerce evidence",
        mimeType: "application/json",
        serviceName: "SafeGate",
        tags: ["agent-commerce", "x402", "hedera"],
      },
      accepts: [paymentRequirements],
      extensions: {},
    };

    const paymentHeader =
      req.headers["payment-signature"] ||
      req.headers["x-payment"];

    if (!paymentHeader) {
      res.setHeader(
        "PAYMENT-REQUIRED",
        encodeBase64Json(paymentRequired)
      );

      return res.status(402).json(paymentRequired);
    }

    const paymentPayload = decodeBase64Json(paymentHeader);

    const verification = await verifyPayment(
      paymentPayload,
      paymentRequirements
    );

    if (!verification || verification.isValid !== true) {
      res.setHeader(
        "PAYMENT-REQUIRED",
        encodeBase64Json(paymentRequired)
      );

      return res.status(402).json({
        ok: false,
        error: {
          code: "PAYMENT_VERIFICATION_FAILED",
          reason:
            verification?.invalidReason ||
            verification?.invalidMessage ||
            "INVALID_PAYMENT",
        },
      });
    }

    const consumeStore = require("../lib/agent-consume-store");

    const requestBinding = {
      service: "premium-product-intel",
      sku: req.body?.sku ?? null,
      quantity: req.body?.quantity ?? null,
    };

    const replay = await consumeStore.checkPaymentReplay({
      paymentPayload,
      request: requestBinding,
    });

    if (replay.exists) {
      return res.status(409).json({
        ok: false,
        error: {
          code: replay.sameRequest
            ? "ALREADY_CONSUMED"
            : "PAYMENT_BINDING_MISMATCH",
          message: replay.sameRequest
            ? "This payment has already been consumed."
            : "This payment is already bound to another request.",
        },
        consume: replay.record,
      });
    }

    const settlement = await settlePayment(
      paymentPayload,
      paymentRequirements
    );

    res.setHeader(
      "PAYMENT-RESPONSE",
      encodeBase64Json(settlement)
    );

    if (!settlement || settlement.success !== true) {
      return res.status(402).json({
        ok: false,
        error: {
          code: "PAYMENT_SETTLEMENT_FAILED",
          reason:
            settlement?.errorReason ||
            settlement?.errorMessage ||
            "SETTLEMENT_FAILED",
        },
      });
    }

    const consume = await consumeStore.consumePaymentOnce({
      paymentPayload,
      request: requestBinding,
      settlement: {
        network: settlement.network,
        transaction: settlement.transaction,
        payer: settlement.payer || verification.payer || null,
      },
    });

    if (!consume.ok) {
      return res.status(409).json({
        ok: false,
        error: {
          code: consume.sameRequest
            ? "ALREADY_CONSUMED"
            : "PAYMENT_BINDING_MISMATCH",
          message: consume.sameRequest
            ? "This payment has already been consumed."
            : "This payment is already bound to another request.",
        },
        consume: consume.record,
      });
    }

    const result = runPremiumProductIntel({
      sku: req.body?.sku,
      quantity: req.body?.quantity,
    });

    const { createObservedCommerceProof } =
      require("../lib/agent-commerce-proof");

    const commerceProof = createObservedCommerceProof({
      requestBinding,
      paymentRequirements,
      settlement: {
        network: settlement.network,
        transaction: settlement.transaction,
        payer: settlement.payer || verification.payer || null,
      },
      consume,
      result,
    });

    return res.status(200).json({
      ok: true,
      payment: {
        status: "SETTLED",
        network: settlement.network,
        transaction: settlement.transaction,
        payer: settlement.payer || verification.payer || null,
      },
      execution: {
        status: "COMPLETED",
      },
      result,
      commerce_proof: commerceProof,
    });
  } catch (error) {
    const code = String(error.code || "AGENT_COMMERCE_FAILED");

    return res.status(
      code.startsWith("BLOCKY402_") ? 502 : 400
    ).json({
      ok: false,
      error: {
        code,
        message: String(
          error.message || "Agent commerce request failed."
        ),
      },
    });
  }
};
