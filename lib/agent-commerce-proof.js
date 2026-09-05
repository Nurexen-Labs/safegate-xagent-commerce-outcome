"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { canonicalJson } = require("./canonical-json");

function sha256Hex(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function createObservedCommerceProof({
  requestBinding,
  paymentRequirements,
  settlement,
  consume,
  result,
}) {
  const privateKeyPath =
    process.env.SAFEGATE_COMMERCE_PROOF_PRIVATE_KEY_PATH ||
    path.join(
      process.cwd(),
      ".safegate-runtime",
      "commerce-proof-private.pem"
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
      rail: settlement.rail || "x402-hedera",
      network: settlement.network,
      payment_ref: settlement.transaction,
      payer: settlement.payer || null,
      pay_to: paymentRequirements.payTo,
      asset: paymentRequirements.asset,
      amount: String(paymentRequirements.amount),
      status: "SETTLED",
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
      response_size: Buffer.byteLength(resultCanonical, "utf8"),
      content_type: "application/json",
    },

    assurance: {
      level: "OBSERVED",
      basis:
        "SafeGate executed the paid service inline and hashed the actual result.",
    },
  };

  const payload = {
    schema_version: "0.1",
    proof_id: `SG-CP-${crypto.randomUUID()}`,
    issued_at: completedAt,
    ...core,
    evidence: {
      evidence_hash: sha256Hex(canonicalJson(core)),
      signature_scheme: "Ed25519",
    },
  };

  const privateKeyPemB64 = String(
    process.env.SAFEGATE_COMMERCE_PROOF_PRIVATE_KEY_PEM_B64 || ""
  ).trim();

  const privateKey = crypto.createPrivateKey(
    privateKeyPemB64
      ? Buffer.from(privateKeyPemB64, "base64")
      : fs.readFileSync(privateKeyPath)
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

module.exports = { createObservedCommerceProof };

