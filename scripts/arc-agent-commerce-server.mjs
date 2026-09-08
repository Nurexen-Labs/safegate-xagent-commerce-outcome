import express from "express";
import { BatchFacilitatorClient }
  from "@circle-fin/x402-batching/server";

import circleArcModule
  from "../lib/circle-arc.js";

import consumeStoreModule
  from "../lib/agent-consume-store.js";

import productIntelModule
  from "../lib/premium-product-intel.js";

import arcProofModule
  from "../lib/arc-commerce-proof.js";

const {
  getArcTestnetConfig,
  buildArcPaymentRequirements,
} = circleArcModule;

const {
  checkPaymentReplay,
  consumePaymentOnce,
} = consumeStoreModule;

const {
  runPremiumProductIntel,
} = productIntelModule;

const {
  createArcObservedCommerceProof,
} = arcProofModule;

const PORT = 3402;

const PRICE_USDC =
  String(process.env.ARC_PRICE_USDC || "0.001");

const SELLER_ADDRESS =
  String(process.env.ARC_SELLER_ADDRESS || "").trim();

if (!/^0x[a-fA-F0-9]{40}$/.test(SELLER_ADDRESS)) {
  throw new Error("ARC_SELLER_ADDRESS missing or invalid.");
}

const config =
  await getArcTestnetConfig();

const requirements =
  await buildArcPaymentRequirements({
    priceUsdc: PRICE_USDC,
    sellerAddress: SELLER_ADDRESS,
  });

const facilitator =
  new BatchFacilitatorClient({
    url: "https://gateway-api-testnet.circle.com",
  });

const app = express();

app.use(express.json());

function encode(value) {
  return Buffer
    .from(JSON.stringify(value), "utf8")
    .toString("base64");
}

function decode(value) {
  return JSON.parse(
    Buffer.from(String(value), "base64")
      .toString("utf8")
  );
}

function resourceUrl(req) {
  return `http://127.0.0.1:${PORT}${req.path}`;
}

function binding(req) {
  return {
    service: "premium-product-intel",
    sku: req.body?.sku ?? "SG-API-001",
    quantity: req.body?.quantity ?? 1,
  };
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "safegate-circle-arc-adapter",
    network: config.network,
    chain_id: config.chainId,
    domain: config.domain,
    usdc: config.usdc,
    gateway_wallet: config.gatewayWallet,
    price_usdc: PRICE_USDC,
  });
});

app.post("/arc-agent-commerce", async (req, res) => {
  try {
    const paymentHeader =
      req.headers["payment-signature"] ||
      req.headers["x-payment"];

    const paymentRequired = {
      x402Version: 2,

      resource: {
        url: resourceUrl(req),
        description:
          "SafeGate Arc paid API with observed commerce evidence",
        mimeType: "application/json",
      },

      accepts: [requirements],
    };

    // -----------------------------------------
    // No payment -> deterministic 402
    // -----------------------------------------

    if (!paymentHeader) {
      res.setHeader(
        "PAYMENT-REQUIRED",
        encode(paymentRequired)
      );

      return res
        .status(402)
        .json({});
    }

    const paymentPayload =
      decode(paymentHeader);

    const requestBinding =
      binding(req);

    // Validate and prepare the protected result BEFORE payment settlement.
    // Invalid requests must never be charged.
    const result =
      runPremiumProductIntel({
        sku: requestBinding.sku,
        quantity: requestBinding.quantity,
      });

    // -----------------------------------------
    // SafeGate replay precheck
    // -----------------------------------------

    const replay =
      await checkPaymentReplay({
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
        },

        consume: replay.record,
      });
    }

    // -----------------------------------------
    // Circle Gateway settle/accept
    //
    // Circle recommends settle() directly.
    // Successful settle is the Gateway acceptance
    // evidence for this nanopayment.
    // -----------------------------------------

    const settlement =
      await facilitator.settle(
        paymentPayload,
        requirements
      );

    if (!settlement?.success) {
      return res.status(402).json({
        ok: false,

        error: {
          code:
            "PAYMENT_SETTLEMENT_FAILED",

          reason:
            settlement?.errorReason ||
            "SETTLEMENT_FAILED",
        },
      });
    }

    const payer =
      settlement.payer ||
      null;

    // -----------------------------------------
    // SafeGate single consume
    // -----------------------------------------

    const consume =
      await consumePaymentOnce({
        paymentPayload,
        request: requestBinding,

        settlement: {
          network: requirements.network,

          // Circle batched Gateway reference;
          // NOT asserted as an onchain tx hash.
          transaction:
            settlement.transaction || null,

          payer,
        },
      });

    if (!consume.ok) {
      return res.status(409).json({
        ok: false,

        error: {
          code: consume.sameRequest
            ? "ALREADY_CONSUMED"
            : "PAYMENT_BINDING_MISMATCH",
        },

        consume: consume.record,
      });
    }

    // -----------------------------------------
    // Actual protected service execution
    // -----------------------------------------
// -----------------------------------------
    // SafeGate OBSERVED CommerceProof
    // -----------------------------------------

    const commerceProof =
      createArcObservedCommerceProof({
        requestBinding,

        payment: {
          network: requirements.network,
          payer,
          payTo: requirements.payTo,
          asset: requirements.asset,
          amount: requirements.amount,

          transaction:
            settlement.transaction || null,

          gatewayDomain: config.domain,

          verifyingContract:
            config.gatewayWallet,
        },

        consume,
        result,
      });

    res.setHeader(
      "PAYMENT-RESPONSE",
      encode({
        success: true,
        transaction:
          settlement.transaction || null,
        network: requirements.network,
        payer,
      })
    );

    return res.status(200).json({
      ok: true,

      capability:
        "safegate_circle_arc_commerce",

      payment: {
        rail:
          "CIRCLE_GATEWAY_NANOPAYMENTS",

        verification: "VERIFIED",

        gateway_status: "ACCEPTED",

        settlement_mode:
          "DEFERRED_BATCHED",

        onchain_settlement:
          "NOT_ASSERTED",

        payer,

        amount_usdc:
          PRICE_USDC,

        gateway_reference:
          settlement.transaction || null,
      },

      execution: {
        status: "COMPLETED",
        assurance: "OBSERVED",
      },

      result,

      commerce_proof:
        commerceProof,
    });

  } catch (error) {
    console.error(
      "ARC_SERVER_ERROR:",
      error
    );

    return res.status(500).json({
      ok: false,
      error: {
        code:
          error?.code ||
          "ARC_AGENT_COMMERCE_FAILED",

        message:
          error?.message ||
          String(error),
      },
    });
  }
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(
    `SAFEGATE_ARC_SERVER_READY http://127.0.0.1:${PORT}`
  );
});




