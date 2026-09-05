import fs from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { checkPaymentReplay, consumePaymentOnce } = require("../lib/agent-consume-store");
const { createObservedCommerceProof } = require("../lib/agent-commerce-proof");

const live = JSON.parse(
  fs.readFileSync(".safegate-runtime/binance-mcp-live.json", "utf8")
);

const paymentResponse = JSON.parse(
  Buffer.from(live.paymentResponse, "base64").toString("utf8")
);

const dataLine = live.body
  .split(/\r?\n/)
  .find((line) => line.startsWith("data:"));

if (!dataLine) throw new Error("MCP_DATA_NOT_FOUND");

const rpc = JSON.parse(dataLine.slice(5).trim());
if (rpc.result?.isError === true) throw new Error("MCP_RESULT_ERROR");

const textItem = rpc.result.content.find(
  (item) => item.type === "text" && item.text
);

if (!textItem) throw new Error("MCP_RESULT_TEXT_NOT_FOUND");

const result = JSON.parse(textItem.text);

const requestBinding = {
  service: "coinmarketcap-x402-mcp",
  sku: "get_crypto_quotes_latest:1",
  quantity: 1,
};

const paymentPayload = {
  x402Version: paymentResponse.x402Version,
  x402FlowId: paymentResponse.x402FlowId,
  transaction: live.tx,
};

const settlement = {
  rail: "x402-binance-agentic-wallet",
  network: "eip155:8453",
  transaction: live.tx,
  payer: "0xac8Ff2F44c27f916ad81Fd956793ac8eCD5CDfF3",
};

const replay = await checkPaymentReplay({
  paymentPayload,
  request: requestBinding,
});

if (replay.exists) throw new Error("ALREADY_CONSUMED");

const consume = await consumePaymentOnce({
  paymentPayload,
  request: requestBinding,
  settlement,
});

if (!consume.ok) throw new Error("CONSUME_FAILED");

const proof = createObservedCommerceProof({
  requestBinding,
  paymentRequirements: {
    payTo: "0x3C5f3a6cE224BB89D72f5EB4232ecC27F67B3eeA",
    asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    amount: "0.010000",
  },
  settlement,
  consume,
  result,
});

fs.writeFileSync(
  ".safegate-runtime/binance-mcp-commerce-proof.json",
  JSON.stringify(proof, null, 2) + "\n"
);

console.log("SETTLEMENT_TX:", live.tx);
console.log("EXECUTION: COMPLETED");
console.log("ASSURANCE:", proof.payload.assurance.level);
console.log("PROOF_ID:", proof.payload.proof_id);
console.log("EVIDENCE_HASH:", proof.payload.evidence.evidence_hash);
console.log("SIGNATURE_PRESENT:", Boolean(proof.signature));
console.log("BINANCE_SAFEGATE_COMMERCE_PROOF_PASS");