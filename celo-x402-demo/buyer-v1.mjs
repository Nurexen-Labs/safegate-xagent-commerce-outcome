import fs from "fs";
import { randomBytes } from "crypto";
import { privateKeyToAccount } from "viem/accounts";

const URL = "http://localhost:3000/safegate-agent-result";
const EXPECTED_NETWORK = "celo";
const EXPECTED_AMOUNT = "10000";
const EXPECTED_USDC = "0xcebA9300f2b948710d2653dD7B07f33A8B32118C";
const EXPECTED_MERCHANT = "0xEd730e2F3671fBF38C81867020521595aB01CD78";
const CHAIN_ID = 42220;

const key = fs
  .readFileSync(
    "C:/Users/lenovo/Desktop/SAFEGATE-ETHONLINE-2026/.safegate-runtime/celo-buyer-private-key.txt",
    "utf8"
  )
  .trim();

const account = privateKeyToAccount(key);

const first = await fetch(URL);
const challenge = await first.json();
const req = challenge?.accepts?.[0];

if (
  first.status !== 402 ||
  challenge?.x402Version !== 1 ||
  req?.scheme !== "exact" ||
  req?.network !== EXPECTED_NETWORK ||
  String(req?.maxAmountRequired) !== EXPECTED_AMOUNT ||
  req?.asset?.toLowerCase() !== EXPECTED_USDC.toLowerCase() ||
  req?.payTo?.toLowerCase() !== EXPECTED_MERCHANT.toLowerCase()
) {
  console.error("CHALLENGE_MISMATCH");
  process.exitCode = 1;
} else {
  console.log("=== SAFEGATE CELO x402 V1 ===");
  console.log("NETWORK:", req.network);
  console.log("CHAIN_ID:", CHAIN_ID);
  console.log("PAYER:", account.address);
  console.log("PAY_TO:", req.payTo);
  console.log("AMOUNT: 0.01 USDC");

  if (process.env.SAFEGATE_CELO_EXECUTE !== "YES") {
    console.log("READY_TO_PAY");
    console.log("PAYMENT_NOT_EXECUTED");
  } else {
    const now = Math.floor(Date.now() / 1000);

    const authorization = {
      from: account.address,
      to: req.payTo,
      value: BigInt(req.maxAmountRequired),
      validAfter: BigInt(now - 60),
      validBefore: BigInt(now + req.maxTimeoutSeconds),
      nonce: `0x${randomBytes(32).toString("hex")}`
    };

    const signature = await account.signTypedData({
      domain: {
        name: req.extra?.name ?? "USDC",
        version: req.extra?.version ?? "2",
        chainId: CHAIN_ID,
        verifyingContract: req.asset
      },
      types: {
        TransferWithAuthorization: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" }
        ]
      },
      primaryType: "TransferWithAuthorization",
      message: authorization
    });

    const paymentPayload = {
      x402Version: 1,
      scheme: "exact",
      network: req.network,
      payload: {
        signature,
        authorization: {
          from: authorization.from,
          to: authorization.to,
          value: authorization.value.toString(),
          validAfter: authorization.validAfter.toString(),
          validBefore: authorization.validBefore.toString(),
          nonce: authorization.nonce
        }
      }
    };

    const paymentHeader = Buffer
      .from(JSON.stringify(paymentPayload))
      .toString("base64");

    const paid = await fetch(URL, {
      headers: {
        "X-PAYMENT": paymentHeader
      }
    });

    const body = await paid.text();
    const responseHeader = paid.headers.get("X-PAYMENT-RESPONSE");

    console.log("PAID_HTTP:", paid.status);

    if (!paid.ok) {
      console.log("BODY:", body);
      console.log("PAYMENT_FLOW_FAILED");
      process.exitCode = 1;
    } else {
      let settlement = null;

      if (responseHeader) {
        try {
          settlement = JSON.parse(
            Buffer.from(responseHeader, "base64").toString("utf8")
          );
        } catch {}
      }

      fs.writeFileSync(
        "C:/Users/lenovo/Desktop/SAFEGATE-ETHONLINE-2026/.safegate-runtime/celo-x402-live.json",
        JSON.stringify(
          {
            payer: account.address,
            paymentRequirements: req,
            paymentPayload,
            settlement,
            body
          },
          null,
          2
        )
      );

      console.log(
        "SETTLEMENT_TX:",
        settlement?.transaction ?? "UNKNOWN"
      );
      console.log("EXECUTION: COMPLETED");
      console.log("CELO_X402_V1_LIVE_PASS");
    }
  }
}