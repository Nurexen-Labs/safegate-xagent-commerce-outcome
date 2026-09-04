import { createRequire } from "module";
import {
  createClientHederaSigner,
  PrivateKey,
} from "@x402/hedera";
import { ExactHederaScheme } from "@x402/hedera/exact/client";

const require = createRequire(import.meta.url);
const agentCommerce = require("../api/agent-commerce");

const PAYER_ACCOUNT =
  process.env.HEDERA_AGENT_ACCOUNT_ID || "0.0.10289801";

const PRIVATE_KEY = String(
  process.env.HEDERA_AGENT_PRIVATE_KEY || ""
).trim();

if (!PRIVATE_KEY) {
  console.error("HEDERA_AGENT_PRIVATE_KEY is not set.");
  process.exit(1);
}

function makeResponse() {
  const out = {
    statusCode: null,
    headers: {},
    body: null,
  };

  const res = {
    status(code) {
      out.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      out.headers[name] = value;
      return this;
    },
    json(value) {
      out.body = value;
      return out;
    },
  };

  return { out, res };
}

async function invoke(headers = {}) {
  const { out, res } = makeResponse();

  await agentCommerce(
    {
      method: "POST",
      headers: {
        host: "localhost:3000",
        "x-forwarded-proto": "http",
        ...headers,
      },
      body: {
        sku: "SG-API-001",
        quantity: 2,
      },
    },
    res
  );

  return out;
}

async function main() {
  console.log("=== SAFEGATE HEDERA x402 AGENT ===");

  // 1. Agent requests service without payment.
  const challenge = await invoke();

  if (
    challenge.statusCode !== 402 ||
    !Array.isArray(challenge.body?.accepts) ||
    !challenge.body.accepts[0]
  ) {
    throw new Error("Expected x402 PAYMENT REQUIRED challenge.");
  }

  const paymentRequirements = challenge.body.accepts[0];

  console.log("402 challenge received");
  console.log("network:", paymentRequirements.network);
  console.log("payTo:", paymentRequirements.payTo);
  console.log("amount:", paymentRequirements.amount);
  console.log(
    "feePayer:",
    paymentRequirements.extra?.feePayer || "missing"
  );

  // 2. Agent signs the exact advertised requirement.
  const rawKey = PRIVATE_KEY.replace(/^0x/i, "");

  if (!/^[0-9a-fA-F]{64}$/.test(rawKey)) {
    throw new Error(
      "HEDERA_AGENT_PRIVATE_KEY must be a 32-byte raw ECDSA private key."
    );
  }

  const signer = createClientHederaSigner(
    PAYER_ACCOUNT,
    PrivateKey.fromStringECDSA(rawKey),
    { network: "hedera:testnet" }
  );

  const scheme = new ExactHederaScheme(signer);

  const signed = await scheme.createPaymentPayload(
    2,
    paymentRequirements
  );

  const paymentPayload = {
    x402Version: signed.x402Version,
    scheme: "exact",
    network: "hedera:testnet",
    accepted: paymentRequirements,
    payload: signed.payload,
  };

  const xPayment = Buffer.from(
    JSON.stringify(paymentPayload),
    "utf8"
  ).toString("base64");

  // 3. Agent retries the same paid service with x402 proof.
  const paid = await invoke({
    "x-payment": xPayment,
  });

  console.log("\n=== PAID RESPONSE ===");
  console.log("HTTP:", paid.statusCode);
  console.log(
    JSON.stringify(
      {
        ok: paid.body?.ok,
        payment: paid.body?.payment,
        execution: paid.body?.execution,
        result: paid.body?.result,
        error: paid.body?.error,
      },
      null,
      2
    )
  );

  if (paid.statusCode !== 200 || paid.body?.ok !== true) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    "AGENT_FAILED:",
    error.code || error.message
  );
  process.exit(1);
});









