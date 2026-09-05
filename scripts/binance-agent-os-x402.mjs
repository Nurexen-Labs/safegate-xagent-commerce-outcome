import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const consumeStore = require("../lib/agent-consume-store");
const { createObservedCommerceProof } =
  require("../lib/agent-commerce-proof");

const RESOURCE =
  "https://pro-api.coinmarketcap.com/x402/v3/cryptocurrency/quotes/latest?id=1";

function b64decode(value) {
  const s = String(value).replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(
    Buffer.from(s + "=".repeat((4 - s.length % 4) % 4), "base64")
      .toString("utf8")
  );
}

function b64encode(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

function runBaw(args) {
  const r = spawnSync(
    "cmd.exe",
    ["/d", "/s", "/c", "baw.cmd", ...args],
    { encoding: "utf8", windowsHide: true }
  );

  const out = String(r.stdout || "").trim();
  if (!out) throw new Error(String(r.stderr || "BAW failed"));

  const parsed = JSON.parse(out);
  if (!parsed.success)
    throw new Error(JSON.stringify(parsed.error));

  return parsed.data;
}

console.log("=== SAFEGATE BINANCE AGENT OS x402 ===");

const challenge = await fetch(RESOURCE);

console.log("CHALLENGE_HTTP:", challenge.status);

if (challenge.status !== 402)
  throw new Error(`Expected 402, got ${challenge.status}`);

const fullHeader = challenge.headers.get("payment-required");
if (!fullHeader)
  throw new Error("PAYMENT-REQUIRED header missing");

const fullRequirement = b64decode(fullHeader);

const baseAccept = fullRequirement.accepts.find(
  (x) =>
    x.network === "eip155:8453" &&
    x.asset.toLowerCase() ===
      "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"
);

if (!baseAccept)
  throw new Error("Base USDC option missing");

const filteredHeader = b64encode({
  ...fullRequirement,
  accepts: [baseAccept],
});

const preview = runBaw([
  "x402-payment",
  "preview",
  "--paymentRequirements",
  filteredHeader,
  "--json",
]);

const option = preview.options[0];

console.log("PREVIEW_STATUS:", option.status);
console.log("NETWORK:", option.originalAccept.network);
console.log("TOKEN:", option.tokenSymbol);
console.log("AMOUNT:", option.amount);
console.log("PAY_TO:", option.payTo);
console.log("WALLET:", option.userWalletAddress);
console.log("BALANCE:", option.currentBalance);

if (option.status !== "READY_TO_SIGN") {
  console.log("BINANCE_X402_PREFLIGHT_PASS");
  console.log("PAYMENT_NOT_EXECUTED");
  process.exit(0);
}

if (process.env.SAFEGATE_BINANCE_EXECUTE !== "YES") {
  console.log("READY_TO_SIGN");
  console.log("PAYMENT_NOT_EXECUTED");
  process.exit(0);
}

const signed = runBaw([
  "x402-payment",
  "sign",
  "--paymentId",
  preview.paymentId,
  "--selectedIndex",
  String(option.index),
  "--json",
]);

const paymentPayload = b64decode(signed.paymentHeaderValue);

const requestBinding = {
  service: "coinmarketcap-x402-quotes",
  sku: "BTC",
  quantity: 1,
};

const replay = await consumeStore.checkPaymentReplay({
  paymentPayload,
  request: requestBinding,
});

if (replay.exists)
  throw new Error(
    replay.sameRequest
      ? "ALREADY_CONSUMED"
      : "PAYMENT_BINDING_MISMATCH"
  );

const paid = await fetch(RESOURCE, {
  headers: {
    [signed.paymentHeaderName || "PAYMENT-SIGNATURE"]:
      signed.paymentHeaderValue,
  },
});

const bodyText = await paid.text();

console.log("PAID_HTTP:", paid.status);

if (!paid.ok) {
  console.log("PAID_ERROR_BODY:", bodyText);
  console.log("PAID_ERROR_PAYMENT_REQUIRED:", paid.headers.get("payment-required"));
  throw new Error(`Paid request failed HTTP ${paid.status}`);
}

let result;
try {
  result = JSON.parse(bodyText);
} catch {
  result = { raw: bodyText };
}

const responseHeader = paid.headers.get("payment-response");
if (!responseHeader)
  throw new Error("PAYMENT-RESPONSE missing");

const settlement = b64decode(responseHeader);

const txHash =
  settlement.txHash ||
  settlement.transaction ||
  settlement.transactionHash;

if (!txHash)
  throw new Error("Settlement transaction hash missing");

const consume = await consumeStore.consumePaymentOnce({
  paymentPayload,
  request: requestBinding,
  settlement: {
    network: "eip155:8453",
    transaction: txHash,
    payer: option.userWalletAddress,
  },
});

if (!consume.ok)
  throw new Error("CONSUME_FAILED");

const proof = createObservedCommerceProof({
  requestBinding,
  paymentRequirements: option.originalAccept,
  settlement: {
    rail: "x402-binance-agentic-wallet",
    network: "eip155:8453",
    transaction: txHash,
    payer: option.userWalletAddress,
  },
  consume,
  result,
});

console.log("SETTLEMENT_TX:", txHash);
console.log("EXECUTION: COMPLETED");
console.log("ASSURANCE:", proof.payload.assurance.level);
console.log("PROOF_ID:", proof.payload.proof_id);
console.log("EVIDENCE_HASH:", proof.payload.evidence.evidence_hash);
console.log("SIGNATURE_PRESENT:", Boolean(proof.signature));
console.log("BINANCE_SAFEGATE_LIVE_PASS");
