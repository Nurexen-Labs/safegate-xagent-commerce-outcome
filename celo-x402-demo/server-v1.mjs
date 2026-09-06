import fs from "fs";
import { Hono } from "hono";
import { serve } from "@hono/node-server";

const API_KEY = fs
  .readFileSync("C:/Users/lenovo/Desktop/SAFEGATE-ETHONLINE-2026/.safegate-runtime/celo-x402-api-key.txt", "utf8")
  .trim();

const FACILITATOR = "https://api.x402.celo.org";
const RESOURCE = "http://localhost:3000/safegate-agent-result";
const MERCHANT = "0xEd730e2F3671fBF38C81867020521595aB01CD78";
const USDC = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C";

const paymentRequirements = {
  scheme: "exact",
  network: "celo",
  maxAmountRequired: "10000",
  asset: USDC,
  payTo: MERCHANT,
  resource: RESOURCE,
  description: "SafeGate verified agent commerce result",
  mimeType: "application/json",
  outputSchema: null,
  maxTimeoutSeconds: 300,
  extra: {
    name: "USDC",
    version: "2"
  }
};

const challenge = {
  x402Version: 1,
  error: "X-PAYMENT header is required",
  accepts: [paymentRequirements]
};

const app = new Hono();

app.get("/safegate-agent-result", async (c) => {
  const paymentHeader = c.req.header("X-PAYMENT");

  if (!paymentHeader) {
    return c.json(challenge, 402);
  }

  let paymentPayload;

  try {
    paymentPayload = JSON.parse(
      Buffer.from(paymentHeader, "base64").toString("utf8")
    );
  } catch {
    return c.json(
      { ...challenge, error: "Invalid X-PAYMENT header" },
      402
    );
  }

  const facilitatorBody = {
    x402Version: 1,
    paymentPayload,
    paymentRequirements
  };

  const headers = {
    "content-type": "application/json",
    "X-API-Key": API_KEY
  };

  const verifyRes = await fetch(`${FACILITATOR}/verify`, {
    method: "POST",
    headers,
    body: JSON.stringify(facilitatorBody)
  });

  const verifyText = await verifyRes.text();
  let verify = null;

  try {
    verify = JSON.parse(verifyText);
  } catch {}

  if (!verifyRes.ok || !verify?.isValid) {
    console.log("VERIFY_FAILED:", verify?.invalidReason ?? verifyRes.status);
    return c.json(
      {
        ...challenge,
        error: `Payment verification failed: ${
          verify?.invalidReason ?? verifyRes.status
        }`
      },
      402
    );
  }

  console.log("VERIFY_PASS");

  const settleRes = await fetch(`${FACILITATOR}/settle`, {
    method: "POST",
    headers,
    body: JSON.stringify(facilitatorBody)
  });

  const settleText = await settleRes.text();
  let settlement = null;

  try {
    settlement = JSON.parse(settleText);
  } catch {}

  if (!settleRes.ok || !settlement?.success) {
    console.log(
      "SETTLE_FAILED:",
      settlement?.errorReason ?? settleRes.status
    );

    return c.json(
      {
        ok: false,
        error: "SETTLEMENT_FAILED"
      },
      402
    );
  }

  fs.writeFileSync(
    "C:/Users/lenovo/Desktop/SAFEGATE-ETHONLINE-2026/.safegate-runtime/celo-x402-v1-settlement.json",
    JSON.stringify(
      {
        paymentRequirements,
        settlement
      },
      null,
      2
    )
  );

  console.log("SETTLEMENT_PASS:", settlement.transaction);

  c.header(
    "X-PAYMENT-RESPONSE",
    Buffer.from(JSON.stringify(settlement)).toString("base64")
  );

  return c.json({
    ok: true,
    service: "safegate-celo-agent-commerce",
    result: "PAID_AGENT_RESULT",
    assurance_target: "OBSERVED",
    settlementTx: settlement.transaction
  });
});

serve({ fetch: app.fetch, port: 3000 });

console.log("SAFEGATE_CELO_V1_SERVER_READY");
console.log("NETWORK: celo");
console.log("PRICE: 0.01 USDC");
console.log("MERCHANT:", MERCHANT);
console.log("URL:", RESOURCE);