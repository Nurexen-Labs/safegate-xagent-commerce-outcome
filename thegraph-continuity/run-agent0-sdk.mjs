import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { SDK } from "agent0-sdk";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SIGNER_PATH = String(process.env.SAFEGATE_THEGRAPH_SIGNER_PATH || "").trim();
if (!SIGNER_PATH) throw new Error("Signer path missing.");

const SUBGRAPH_IDS = {
  1: "FV6RR6y13rsnCxBAicKuQEwDp8ioEGiNaWaZUmvr1F8k",
  8453: "43s9hQRurMGjuYnC1r2ZwS6xSQktbFyXMPMqGKUFJojb",
  84532: "4yYAvQLFjBhBtdRCY7eUWo181VNoTSLLFd5M7FXQAi6u"
};

function canonical(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  return "{" + Object.keys(v).sort().map(k => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}";
}
function sha256(v) { return crypto.createHash("sha256").update(v, "utf8").digest("hex"); }
function ensureSigner() {
  if (fs.existsSync(SIGNER_PATH)) return;
  fs.mkdirSync(path.dirname(SIGNER_PATH), { recursive: true });
  const { privateKey } = crypto.generateKeyPairSync("ed25519");
  fs.writeFileSync(SIGNER_PATH, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
}
function get(a, paths) {
  for (const p of paths) {
    let cur = a;
    let ok = true;
    for (const part of p.split(".")) {
      if (cur == null || !(part in Object(cur))) { ok = false; break; }
      cur = cur[part];
    }
    if (ok && cur !== undefined && cur !== null) return cur;
  }
  return null;
}
function normalizeAgent(a) {
  const agentId = get(a, ["agentId","id","agent_id"]);
  const chainIdRaw = get(a, ["chainId","chain_id"]);
  const chainId = chainIdRaw != null ? Number(chainIdRaw) : null;
  const name = get(a, ["name","registrationFile.name"]);
  const description = get(a, ["description","registrationFile.description"]);
  const mcpEndpoint = get(a, ["mcpEndpoint","registrationFile.mcpEndpoint"]);
  const trustsRaw = get(a, ["supportedTrusts","registrationFile.supportedTrusts"]);
  const toolsRaw = get(a, ["mcpTools","registrationFile.mcpTools"]);
  const x402Raw = get(a, ["x402Support","x402support","registrationFile.x402Support","registrationFile.x402support"]);
  const supportedTrusts = Array.isArray(trustsRaw) ? trustsRaw : [];
  const mcpTools = Array.isArray(toolsRaw) ? toolsRaw : [];
  const x402Support = x402Raw === true;
  let score = 0;
  if (mcpEndpoint && String(mcpEndpoint).trim()) score += 50;
  if (x402Support) score += 20;
  score += Math.min(supportedTrusts.length * 10, 20);
  score += Math.min(mcpTools.length * 5, 20);
  if (name && String(name).trim()) score += 5;
  if (description && String(description).trim()) score += 5;
  return {
    agentId, chainId, name: name || null, description: description || null,
    mcpEndpoint: mcpEndpoint || null, supportedTrusts,
    mcpToolCount: mcpTools.length, x402Support, safeGateScore: score
  };
}

const sdk = new SDK({ chainId: 8453 });
const targetChains = [8453, 1, 84532];
console.log("AGENT0_SDK_SEARCH_START");
const rawAgents = await sdk.searchAgents({ active: true, chains: targetChains });

if (!Array.isArray(rawAgents) || rawAgents.length === 0) {
  throw new Error("Agent0 SDK returned zero active agents.");
}

const normalized = rawAgents
  .map(normalizeAgent)
  .filter(a => a.agentId != null)
  .sort((a,b) => b.safeGateScore - a.safeGateScore);

if (normalized.length === 0) throw new Error("No normalizable live agents returned.");

const selected = normalized.find(a => a.safeGateScore >= 50) || normalized[0];
if (!selected || selected.safeGateScore < 25) {
  throw new Error("Live The Graph agent data did not satisfy SafeGate policy.");
}

const selectedChain = selected.chainId || 8453;
const observedData = {
  activeAgentsReturned: normalized.length,
  topAgents: normalized.slice(0, 10)
};

const evidence = {
  schema: "safegate-thegraph-agent-evidence/v1",
  observedAt: new Date().toISOString(),
  graph: {
    provider: "The Graph",
    product: "Agent0 / ERC-8004 Subgraphs",
    accessMode: "AGENT0_SDK_DEFAULT_SUBGRAPH_URLS",
    sdkPackage: "agent0-sdk",
    sdkVersion: "1.7.0",
    queriedChains: targetChains,
    selectedChainId: selectedChain,
    selectedSubgraphId: SUBGRAPH_IDS[selectedChain] || null,
    liveData: true,
    loadBearing: true
  },
  query: {
    operation: "sdk.searchAgents",
    filters: { active: true, chains: targetChains },
    responseSha256: sha256(canonical(observedData)),
    activeAgentsReturned: normalized.length
  },
  decision: {
    policy:
      "Rank live ERC-8004 agents returned through Agent0 SDK's The Graph-backed default Subgraphs. " +
      "MCP endpoint, x402 support, trust models, MCP tools, and registration metadata contribute to the score. " +
      "Without qualifying live Graph evidence no successful proof is emitted.",
    status: "AGENT_EVIDENCE_ACCEPTED",
    selectedAgent: selected
  }
};

ensureSigner();

const payload = {
  schema: "safegate-commerce-proof/thegraph-continuity-v1",
  proofId: "SG-GRAPH-" + crypto.randomUUID(),
  issuedAt: new Date().toISOString(),
  assurance: {
    level: "OBSERVED",
    basis:
      "SafeGate executed a live Agent0 SDK search backed by The Graph's default Agent0 Subgraphs, " +
      "observed and hashed the returned agent data, used it as a load-bearing routing input, " +
      "and signed the resulting decision."
  },
  evidenceHash: "sha256:" + sha256(canonical(evidence)),
  evidence
};

const priv = crypto.createPrivateKey(fs.readFileSync(SIGNER_PATH));
const pub = crypto.createPublicKey(priv);
const bytes = Buffer.from(canonical(payload), "utf8");
const sig = crypto.sign(null, bytes, priv);
const verified = crypto.verify(null, bytes, pub, sig);
if (!verified) throw new Error("Ed25519 verification failed.");

const proof = {
  payload,
  signature: {
    algorithm: "Ed25519",
    value: sig.toString("base64url"),
    publicKeyPem: pub.export({ type: "spki", format: "pem" }),
    verified: true
  }
};

fs.mkdirSync(path.join(__dirname, "evidence"), { recursive: true });
fs.mkdirSync(path.join(__dirname, "proofs"), { recursive: true });
fs.writeFileSync(path.join(__dirname, "evidence", "thegraph-agent0-sdk-live-evidence.json"), JSON.stringify(evidence, null, 2) + "\n");
fs.writeFileSync(path.join(__dirname, "proofs", "thegraph-commerce-proof.json"), JSON.stringify(proof, null, 2) + "\n");

console.log("");
console.log("================================================");
console.log(" SAFEGATE x THE GRAPH CONTINUITY - PASS");
console.log("================================================");
console.log("ACCESS_MODE: Agent0 SDK default The Graph Subgraphs");
console.log("LIVE_GRAPH_DATA: PASS");
console.log("ACTIVE_AGENTS:", normalized.length);
console.log("SELECTED_CHAIN_ID:", selectedChain);
console.log("SELECTED_SUBGRAPH_ID:", SUBGRAPH_IDS[selectedChain] || "(sdk-default)");
console.log("SELECTED_AGENT_ID:", selected.agentId);
console.log("SELECTED_AGENT:", selected.name || "(unnamed)");
console.log("MCP_ENDPOINT:", selected.mcpEndpoint || "(none)");
console.log("X402_SUPPORT:", selected.x402Support);
console.log("SAFEGATE_SCORE:", selected.safeGateScore);
console.log("DECISION: AGENT_EVIDENCE_ACCEPTED");
console.log("ASSURANCE: OBSERVED");
console.log("SIGNATURE_VERIFY: PASS");
console.log("THEGRAPH_CONTINUITY_PASS");
console.log("================================================");