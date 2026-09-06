import fs from "fs";
import crypto from "crypto";

const ROOT = "C:/Users/lenovo/Desktop/SAFEGATE-ETHONLINE-2026";
const RUNTIME = `${ROOT}/.safegate-runtime`;
const LIVE = `${RUNTIME}/celo-x402-live.json`;
const SETTLE = `${RUNTIME}/celo-x402-v1-settlement.json`;
const KEY = `${RUNTIME}/commerce-proof-private.pem`;
const OUTDIR = `${ROOT}/celo-x402-demo/proofs`;
const OUT = `${OUTDIR}/celo-mainnet-commerce-proof.json`;

const EXPECTED_TX =
  "0xf412dc45db3bfe342e25a84a82427af640f575cf7962626800167ff0577f0aa0";

for (const f of [LIVE, SETTLE, KEY]) {
  if (!fs.existsSync(f)) {
    throw new Error(`REQUIRED_FILE_MISSING: ${f}`);
  }
}

const live = JSON.parse(fs.readFileSync(LIVE, "utf8"));
const serverSettlement = JSON.parse(fs.readFileSync(SETTLE, "utf8"));

const settlement =
  live.settlement ??
  serverSettlement.settlement ??
  serverSettlement;

const tx =
  settlement?.transaction ??
  serverSettlement?.transaction;

if (!tx || tx.toLowerCase() !== EXPECTED_TX.toLowerCase()) {
  throw new Error(`SETTLEMENT_TX_MISMATCH: ${tx ?? "MISSING"}`);
}

let outcome = live.body;
if (typeof outcome === "string") {
  try { outcome = JSON.parse(outcome); } catch {}
}

const req = live.paymentRequirements;

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((o, k) => {
        o[k] = stable(value[k]);
        return o;
      }, {});
  }
  return value;
}

function canonical(value) {
  return JSON.stringify(stable(value));
}

const evidence = {
  rail: "x402-celo",
  protocol: "x402-v1",
  network: {
    name: "Celo Mainnet",
    chainId: 42220,
    caip2: "eip155:42220",
    x402Network: "celo"
  },
  payment: {
    asset: "USDC",
    assetContract: req.asset,
    amount: "0.01",
    amountAtomic: "10000",
    payer: settlement.payer ?? live.payer,
    payTo: req.payTo,
    transaction: tx
  },
  request: {
    resource: req.resource,
    scheme: req.scheme
  },
  settlement: {
    success: settlement.success,
    network: settlement.network,
    payer: settlement.payer,
    transaction: tx
  },
  outcome
};

const evidenceHash = crypto
  .createHash("sha256")
  .update(canonical(evidence))
  .digest("hex");

const privateKey = crypto.createPrivateKey(
  fs.readFileSync(KEY, "utf8")
);

const publicKey = crypto.createPublicKey(privateKey);

const publicDer = publicKey.export({
  type: "spki",
  format: "der"
});

const keyId = crypto
  .createHash("sha256")
  .update(publicDer)
  .digest("hex")
  .slice(0, 32);

const unsignedProof = {
  schema: "safegate-commerce-proof/v1",
  proofId: `SG-CELO-${tx.slice(2, 18).toUpperCase()}`,
  issuedAt: new Date().toISOString(),
  assurance: {
    level: "OBSERVED",
    basis:
      "SafeGate observed the paid request and protected response after x402 facilitator verification and Celo Mainnet settlement."
  },
  evidenceHash: `sha256:${evidenceHash}`,
  evidence
};

const signedBytes = Buffer.from(canonical(unsignedProof));

const signature = crypto
  .sign(null, signedBytes, privateKey)
  .toString("base64");

const verified = crypto.verify(
  null,
  signedBytes,
  publicKey,
  Buffer.from(signature, "base64")
);

if (!verified) {
  throw new Error("SIGNATURE_SELF_VERIFY_FAILED");
}

const proof = {
  ...unsignedProof,
  signature: {
    algorithm: "Ed25519",
    keyId: `sha256:${keyId}`,
    value: signature,
    publicKeyPem: publicKey.export({
      type: "spki",
      format: "pem"
    })
  }
};

fs.mkdirSync(OUTDIR, { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(proof, null, 2));

console.log("CELO_COMMERCE_PROOF_PASS");
console.log("ASSURANCE: OBSERVED");
console.log("TX:", tx);
console.log("SIGNATURE_VERIFY: PASS");
console.log("PROOF:", OUT);