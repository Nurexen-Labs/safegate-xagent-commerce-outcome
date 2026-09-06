import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  createPublicClient,
  formatUnits,
  http,
  parseAbiItem
} from "viem";

import {
  generatePrivateKey,
  privateKeyToAccount
} from "viem/accounts";

import { createGraphQuery } from "@graphprotocol/client-x402";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RPC = "https://sepolia.base.org";
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

const PRIVATE_KEY_PATH = process.env.SAFEGATE_THEGRAPH_PRIVATE_KEY_PATH;
const SIGNER_PATH = process.env.SAFEGATE_THEGRAPH_SIGNER_PATH;
const RUNTIME_DIR = process.env.SAFEGATE_THEGRAPH_RUNTIME_DIR;

if (!PRIVATE_KEY_PATH || !SIGNER_PATH || !RUNTIME_DIR) {
  throw new Error("Required local runtime paths are missing.");
}

fs.mkdirSync(path.dirname(PRIVATE_KEY_PATH), { recursive: true });
fs.mkdirSync(path.dirname(SIGNER_PATH), { recursive: true });
fs.mkdirSync(RUNTIME_DIR, { recursive: true });

function sha256(value) {
  return crypto.createHash("sha256")
    .update(value, "utf8")
    .digest("hex");
}

function canonical(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return "[" + value.map(canonical).join(",") + "]";
  }

  return "{" +
    Object.keys(value)
      .sort()
      .map((k) => JSON.stringify(k) + ":" + canonical(value[k]))
      .join(",") +
    "}";
}

function ensureBurner() {
  if (!fs.existsSync(PRIVATE_KEY_PATH)) {
    const key = generatePrivateKey();
    fs.writeFileSync(PRIVATE_KEY_PATH, key + "\n", {
      encoding: "utf8",
      mode: 0o600
    });
  }
}

function ensureSigner() {
  if (!fs.existsSync(SIGNER_PATH)) {
    const { privateKey } = crypto.generateKeyPairSync("ed25519");

    fs.writeFileSync(
      SIGNER_PATH,
      privateKey.export({
        type: "pkcs8",
        format: "pem"
      }),
      {
        mode: 0o600
      }
    );
  }
}

ensureBurner();
ensureSigner();

let rawPrivateKey = fs.readFileSync(PRIVATE_KEY_PATH, "utf8").trim();

if (!rawPrivateKey.startsWith("0x")) {
  rawPrivateKey = "0x" + rawPrivateKey;
}

if (!/^0x[0-9a-fA-F]{64}$/.test(rawPrivateKey)) {
  throw new Error("Local burner private key format invalid.");
}

const account = privateKeyToAccount(rawPrivateKey);

fs.writeFileSync(
  path.join(RUNTIME_DIR, "thegraph-wallet-address.txt"),
  account.address + "\n",
  "utf8"
);

// The official client reads the signing key from environment.
// It is never printed.
process.env.X402_PRIVATE_KEY = rawPrivateKey;
process.env.X402_CHAIN = "base-sepolia";

const client = createPublicClient({
  transport: http(RPC)
});

const balanceAbi = [{
  type: "function",
  name: "balanceOf",
  stateMutability: "view",
  inputs: [{ name: "account", type: "address" }],
  outputs: [{ name: "", type: "uint256" }]
}];

const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)"
);

async function getBalance() {
  return client.readContract({
    address: USDC,
    abi: balanceAbi,
    functionName: "balanceOf",
    args: [account.address]
  });
}

const balance = await getBalance();

if (process.argv.includes("--init")) {
  console.log("THEGRAPH_BURNER_READY");
  console.log("WALLET:", account.address);
  process.exit(0);
}

if (process.argv.includes("--check")) {
  console.log("WALLET:", account.address);
  console.log("BASE_SEPOLIA_USDC:", formatUnits(balance, 6));

  // Keep a comfortable buffer for several testnet x402 queries.
  if (balance < 10000n) {
    console.log("TEST_USDC_REQUIRED");
    process.exit(42);
  }

  console.log("TEST_USDC_READY");
  process.exit(0);
}

if (balance < 10000n) {
  console.log("TEST_USDC_REQUIRED");
  process.exit(42);
}

// Official Agent0/ERC-8004 deployments documented by The Graph.
// We try Base Mainnet data first, then Base Sepolia.
// The x402 payment itself is on Base Sepolia testnet.
const candidates = [
  {
    sourceNetwork: "Base Mainnet",
    sourceChainId: 8453,
    subgraphId: "43s9hQRurMGjuYnC1r2ZwS6xSQktbFyXMPMqGKUFJojb"
  },
  {
    sourceNetwork: "Base Sepolia",
    sourceChainId: 84532,
    subgraphId: "4yYAvQLFjBhBtdRCY7eUWo181VNoTSLLFd5M7FXQAi6u"
  },
  {
    sourceNetwork: "Ethereum Mainnet",
    sourceChainId: 1,
    subgraphId: "FV6RR6y13rsnCxBAicKuQEwDp8ioEGiNaWaZUmvr1F8k"
  }
];

const graphql = `
query SafeGateDiscoverX402Agents {
  agentRegistrationFiles(
    where: {
      x402Support: true,
      active: true
    }
    first: 25
  ) {
    agentId
    name
    description
    mcpEndpoint
    supportedTrusts
    x402Support
  }
}
`;

const beforeAll = await getBalance();

let successful = null;
const attempts = [];

for (const candidate of candidates) {
  const endpoint =
    "https://testnet.gateway.thegraph.com/api/x402/subgraphs/id/" +
    candidate.subgraphId;

  try {
    const blockBefore = await client.getBlockNumber();
    const balanceBefore = await getBalance();

    const paidQuery = createGraphQuery({
      endpoint,
      chain: "base-sepolia"
    });

    const result = await paidQuery(graphql);

    if (result?.errors?.length) {
      throw new Error(JSON.stringify(result.errors));
    }

    const data = result?.data ?? result;
    const agents = data?.agentRegistrationFiles ?? [];

    attempts.push({
      sourceNetwork: candidate.sourceNetwork,
      subgraphId: candidate.subgraphId,
      agentCount: agents.length,
      ok: true
    });

    if (!Array.isArray(agents) || agents.length === 0) {
      continue;
    }

    let balanceAfter = await getBalance();
    let settlementTx = null;
    let settlementValue = 0n;

    // Give the facilitator settlement a little time to appear.
    for (let i = 0; i < 15; i++) {
      const latest = await client.getBlockNumber();

      const logs = await client.getLogs({
        address: USDC,
        event: transferEvent,
        args: {
          from: account.address
        },
        fromBlock: blockBefore,
        toBlock: latest
      });

      if (logs.length > 0) {
        const log = logs[logs.length - 1];
        settlementTx = log.transactionHash;
        settlementValue = log.args.value ?? 0n;
      }

      balanceAfter = await getBalance();

      if (settlementTx && balanceAfter < balanceBefore) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    if (!settlementTx) {
      throw new Error(
        "Paid query returned data but settlement Transfer log was not found."
      );
    }

    // --------------------------------------------------------
    // LOAD-BEARING DECISION
    //
    // The Graph response is not merely printed.
    // SafeGate scores the discovered live agent data and selects
    // whether an x402-capable agent is route-eligible.
    // Without eligible live Graph data, the decision cannot PASS.
    // --------------------------------------------------------

    const scored = agents.map((agent) => {
      const trusts = Array.isArray(agent.supportedTrusts)
        ? agent.supportedTrusts
        : [];

      let score = 0;

      if (agent.x402Support === true) score += 40;
      if (agent.name && String(agent.name).trim()) score += 10;
      if (agent.description && String(agent.description).trim()) score += 10;
      if (agent.mcpEndpoint && String(agent.mcpEndpoint).trim()) score += 20;
      score += Math.min(trusts.length * 10, 20);

      return {
        ...agent,
        supportedTrusts: trusts,
        safeGateScore: score
      };
    });

    scored.sort((a, b) => {
      if (b.safeGateScore !== a.safeGateScore) {
        return b.safeGateScore - a.safeGateScore;
      }

      return String(a.agentId).localeCompare(String(b.agentId));
    });

    const selected = scored[0];

    const decision = selected && selected.safeGateScore >= 50
      ? "ROUTE_ELIGIBLE"
      : "ROUTE_REJECTED";

    if (decision !== "ROUTE_ELIGIBLE") {
      throw new Error(
        "Live Graph data returned agents, but SafeGate policy rejected them."
      );
    }

    successful = {
      candidate,
      endpoint,
      graphql,
      result: data,
      agents: scored,
      selected,
      decision,
      blockBefore,
      balanceBefore,
      balanceAfter,
      settlementTx,
      settlementValue
    };

    break;
  }
  catch (error) {
    attempts.push({
      sourceNetwork: candidate.sourceNetwork,
      subgraphId: candidate.subgraphId,
      ok: false,
      error: String(error?.message ?? error).slice(0, 500)
    });
  }
}

if (!successful) {
  console.error("THEGRAPH_LIVE_QUERY_FAILED");
  console.error(JSON.stringify(attempts, null, 2));
  process.exit(10);
}

const {
  candidate,
  endpoint,
  result,
  agents,
  selected,
  decision,
  balanceBefore,
  balanceAfter,
  settlementTx,
  settlementValue
} = successful;

const evidence = {
  schema: "safegate-thegraph-evidence/v1",
  observedAt: new Date().toISOString(),

  graph: {
    provider: "The Graph",
    product: "Agent0 ERC-8004 Subgraph",
    sourceNetwork: candidate.sourceNetwork,
    sourceChainId: candidate.sourceChainId,
    subgraphId: candidate.subgraphId,
    endpoint,
    liveData: true,
    loadBearing: true
  },

  x402: {
    paymentNetwork: "Base Sepolia",
    paymentChainId: 84532,
    asset: "USDC",
    assetContract: USDC,
    payer: account.address,
    amountAtomic: settlementValue.toString(),
    amount: formatUnits(settlementValue, 6),
    settlementTx
  },

  query: {
    sha256: sha256(graphql),
    responseSha256: sha256(canonical(result)),
    returnedAgentCount: agents.length
  },

  decision: {
    policy:
      "Select an active x402-capable ERC-8004 agent from live The Graph data. " +
      "Require SafeGate score >= 50. No eligible Graph result means no PASS.",
    status: decision,
    selectedAgent: {
      agentId: selected.agentId,
      name: selected.name ?? null,
      mcpEndpoint: selected.mcpEndpoint ?? null,
      x402Support: selected.x402Support,
      supportedTrusts: selected.supportedTrusts,
      safeGateScore: selected.safeGateScore
    }
  }
};

const evidenceCanonical = canonical(evidence);

const payload = {
  schema: "safegate-commerce-proof/thegraph-continuity-v1",
  proofId: "SG-GRAPH-" + crypto.randomUUID(),
  issuedAt: new Date().toISOString(),

  assurance: {
    level: "OBSERVED",
    basis:
      "SafeGate executed a paid The Graph x402 query, observed the live Agent0 " +
      "response, used that response as a load-bearing routing decision, and " +
      "bound the payment settlement, response hash, and decision into this proof."
  },

  evidenceHash: "sha256:" + sha256(evidenceCanonical),
  evidence
};

ensureSigner();

const privateSigner = crypto.createPrivateKey(
  fs.readFileSync(SIGNER_PATH)
);

const publicSigner = crypto.createPublicKey(privateSigner);

const payloadCanonical = canonical(payload);

const signature = crypto.sign(
  null,
  Buffer.from(payloadCanonical, "utf8"),
  privateSigner
);

const signatureVerify = crypto.verify(
  null,
  Buffer.from(payloadCanonical, "utf8"),
  publicSigner,
  signature
);

if (!signatureVerify) {
  throw new Error("Ed25519 signature verification failed.");
}

const proof = {
  payload,
  signature: {
    algorithm: "Ed25519",
    value: signature.toString("base64url"),
    publicKeyPem: publicSigner.export({
      type: "spki",
      format: "pem"
    }),
    verified: true
  }
};

fs.mkdirSync(path.join(__dirname, "evidence"), { recursive: true });
fs.mkdirSync(path.join(__dirname, "proofs"), { recursive: true });

fs.writeFileSync(
  path.join(__dirname, "evidence", "thegraph-paid-agent-discovery.json"),
  JSON.stringify(evidence, null, 2) + "\n",
  "utf8"
);

fs.writeFileSync(
  path.join(__dirname, "proofs", "thegraph-x402-commerce-proof.json"),
  JSON.stringify(proof, null, 2) + "\n",
  "utf8"
);

const afterAll = await getBalance();

console.log("");
console.log("===============================================");
console.log(" SAFEGATE / THE GRAPH CONTINUITY - PASS");
console.log("===============================================");
console.log("GRAPH_PROVIDER: The Graph");
console.log("GRAPH_PRODUCT: Agent0 ERC-8004 Subgraph");
console.log("SOURCE_NETWORK:", candidate.sourceNetwork);
console.log("SOURCE_CHAIN_ID:", candidate.sourceChainId);
console.log("SUBGRAPH_ID:", candidate.subgraphId);
console.log("LIVE_GRAPH_DATA: PASS");
console.log("X402_PAYMENT_NETWORK: Base Sepolia");
console.log("X402_ASSET: USDC");
console.log("PAYER:", account.address);
console.log("PAID_AMOUNT:", formatUnits(settlementValue, 6), "USDC");
console.log("SETTLEMENT_TX:", settlementTx);
console.log("AGENTS_RETURNED:", agents.length);
console.log("SELECTED_AGENT_ID:", selected.agentId);
console.log("SELECTED_AGENT:", selected.name ?? "(unnamed)");
console.log("SAFEGATE_SCORE:", selected.safeGateScore);
console.log("DECISION:", decision);
console.log("ASSURANCE: OBSERVED");
console.log("SIGNATURE_VERIFY: PASS");
console.log("BALANCE_BEFORE:", formatUnits(beforeAll, 6));
console.log("BALANCE_AFTER:", formatUnits(afterAll, 6));
console.log("THEGRAPH_CONTINUITY_PASS");
console.log("===============================================");
