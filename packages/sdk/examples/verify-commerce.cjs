"use strict";

const fs = require("fs");
const path = require("path");

const {
  SafeGateClient
} = require("../index.js");

const baseUrl =
  String(
    process.env.SAFEGATE_BASE_URL || ""
  ).trim();

const proofArgument =
  process.argv[2];

if (!baseUrl) {
  console.error(
    "SAFEGATE_BASE_URL is required."
  );

  process.exit(2);
}

if (!proofArgument) {
  console.error(
    "Usage: node verify-commerce.cjs <commerce-attestation.json>"
  );

  process.exit(2);
}

const proofPath =
  path.resolve(
    process.cwd(),
    proofArgument
  );

if (!fs.existsSync(proofPath)) {
  console.error(
    "Attestation file not found."
  );

  process.exit(2);
}

let attestation;

try {
  attestation =
    JSON.parse(
      fs.readFileSync(
        proofPath,
        "utf8"
      )
    );
} catch (_) {
  console.error(
    "Attestation file is not valid JSON."
  );

  process.exit(2);
}

(async () => {
  const safegate =
    new SafeGateClient({
      baseUrl,
      timeoutMs: 30000
    });

  const result =
    await safegate.verifyCommerce(
      attestation
    );

  console.log(
    "SafeGate verification PASS"
  );

  console.log(
    "decision:",
    result.decision
  );

  console.log(
    "assurance:",
    result.assurance.level
  );

  console.log(
    "commerce_verified:",
    result.commerce_verified
  );

  console.log(
    "chain_id:",
    result.verification.chain_id
  );

  console.log(
    "asset:",
    result.verification.asset
  );

})().catch(error => {
  console.error(
    "SafeGate verification FAILED"
  );

  console.error(
    "code:",
    String(
      error.code ||
      "UNKNOWN_ERROR"
    )
  );

  process.exit(1);
});