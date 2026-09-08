"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { canonicalJson } = require("./canonical-json");

function sha256Hex(text) {
  return crypto
    .createHash("sha256")
    .update(text, "utf8")
    .digest("hex");
}

function createArcObservedCommerceProof({
  requestBinding,
  payment,
  consume,
  result,
}) {
  const privateKeyPath =
    process.env.SAFEGATE_ARC_PROOF_PRIVATE_KEY_PATH ||
    path.join(
      process.cwd(),
      ".safegate-runtime",
      "arc-commerce-proof-private.pem"
    );

  const resultCanonical = canonicalJson(result);
  const completedAt = new Date().toISOString();

  const core = {
    request: {
      request_id: consume.requestHash,
      request_hash: consume.requestHash,
      service: requestBinding.service,
      sku: requestBinding.sku,
      quantity: requestBinding.quantity,
    },

    payment: {
      rail: "CIRCLE_GATEWAY_NANOPAYMENTS",
      network: payment.network,
      payer: payment.payer || null,
      pay_to: payment.payTo,
      asset: payment.asset,
      amount: String(payment.amount),

      verification: "VERIFIED",
      gateway_acceptance: "ACCEPTED",

      settlement_mode: "DEFERRED_BATCHED",
      onchain_settlement: "NOT_ASSERTED",

      gateway_reference:
        payment.transaction || null,

      gateway_domain:
        payment.gatewayDomain,

      verifying_contract:
        payment.verifyingContract,
    },

    consume: {
      consume_key: consume.paymentHash,
      consumed_at: consume.record.consumed_at,
      replay_status: "CONSUMED",
    },

    execution: {
      status: "COMPLETED",
      http_status: 200,
      completed_at: completedAt,
      response_hash: sha256Hex(resultCanonical),
      response_size:
        Buffer.byteLength(resultCanonical, "utf8"),
      content_type: "application/json",
    },

    assurance: {
      level: "OBSERVED",
      basis:
        "SafeGate observed the paid request, executed the protected service inline, and hashed the actual response.",
    },
  };

  const payload = {
    schema_version: "0.1",
    proof_id: `SG-CP-ARC-${crypto.randomUUID()}`,
    issued_at: completedAt,
    ...core,

    evidence: {
      evidence_hash:
        sha256Hex(canonicalJson(core)),
      signature_scheme: "Ed25519",
    },
  };

  const privateKey =
    crypto.createPrivateKey(
      fs.readFileSync(privateKeyPath)
    );

  const signature = crypto
    .sign(
      null,
      Buffer.from(canonicalJson(payload), "utf8"),
      privateKey
    )
    .toString("base64url");

  return {
    payload,
    signature,
  };
}

module.exports = {
  createArcObservedCommerceProof,
};
