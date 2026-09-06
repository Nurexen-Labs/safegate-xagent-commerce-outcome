import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createPublicClient, formatUnits, http, parseAbiItem } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createGraphQuery } from '@graphprotocol/client-x402';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RPC = 'https://sepolia.base.org';
const USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const SUBGRAPH_ID = '3cgiGHLnVZxJC3qJGVGkQfEfbzbuBXzLW5ayBeaTHxEJ';
const ENDPOINT = 'https://gateway.testnet.thegraph.com/api/x402/subgraphs/id/' + SUBGRAPH_ID;

const GRAPHQL = '{ factories(first: 5) { id poolCount txCount totalVolumeUSD } bundles(first: 5) { id ethPriceUSD } }';

const PRIVATE_KEY_PATH = process.env.SAFEGATE_THEGRAPH_PRIVATE_KEY_PATH;
const SIGNER_PATH = process.env.SAFEGATE_THEGRAPH_SIGNER_PATH;

if (!PRIVATE_KEY_PATH || !SIGNER_PATH) {
  throw new Error('Required local secret paths are missing.');
}

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map(function (key) {
    return JSON.stringify(key) + ':' + canonical(value[key]);
  }).join(',') + '}';
}

function sha256(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function ensureSigner() {
  if (fs.existsSync(SIGNER_PATH)) return;
  const pair = crypto.generateKeyPairSync('ed25519');
  fs.writeFileSync(
    SIGNER_PATH,
    pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    { mode: 0o600 }
  );
}

let privateKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8').trim();
if (!privateKey.startsWith('0x')) privateKey = '0x' + privateKey;

if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
  throw new Error('Dedicated testnet private key format invalid.');
}

const account = privateKeyToAccount(privateKey);

process.env.X402_PRIVATE_KEY = privateKey;
process.env.X402_CHAIN = 'base-sepolia';

const client = createPublicClient({ transport: http(RPC) });

const balanceAbi = [{
  type: 'function',
  name: 'balanceOf',
  stateMutability: 'view',
  inputs: [{ name: 'account', type: 'address' }],
  outputs: [{ name: '', type: 'uint256' }]
}];

const transferEvent = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)'
);

async function getBalance() {
  return client.readContract({
    address: USDC,
    abi: balanceAbi,
    functionName: 'balanceOf',
    args: [account.address]
  });
}

const balanceBefore = await getBalance();

console.log('WALLET:', account.address);
console.log('BASE_SEPOLIA_TEST_USDC_BEFORE:', formatUnits(balanceBefore, 6));

if (balanceBefore < 10000n) {
  throw new Error('Need at least 0.01 Base Sepolia TEST USDC. No paid query sent.');
}

const blockBefore = await client.getBlockNumber();

console.log('X402_QUERY_START');

const paidQuery = createGraphQuery({
  endpoint: ENDPOINT,
  chain: 'base-sepolia'
});

const rawResult = await paidQuery(GRAPHQL);

if (rawResult && Array.isArray(rawResult.errors) && rawResult.errors.length > 0) {
  throw new Error('GraphQL error: ' + JSON.stringify(rawResult.errors));
}

const data = rawResult && rawResult.data ? rawResult.data : rawResult;
const factories = Array.isArray(data && data.factories) ? data.factories : [];
const bundles = Array.isArray(data && data.bundles) ? data.bundles : [];

if (factories.length === 0) {
  throw new Error('Paid Graph query returned no factories.');
}

const selectedFactory = factories.slice().sort(function (a, b) {
  const av = BigInt(a.txCount || '0');
  const bv = BigInt(b.txCount || '0');
  if (av === bv) return 0;
  return av > bv ? -1 : 1;
})[0];

const selectedTxCount = BigInt(selectedFactory.txCount || '0');
const selectedPoolCount = BigInt(selectedFactory.poolCount || '0');
const ethPriceUSD = bundles.length > 0 ? String(bundles[0].ethPriceUSD || '0') : '0';

const decision =
  selectedTxCount > 0n && selectedPoolCount > 0n
    ? 'GRAPH_EVIDENCE_ACCEPTED'
    : 'GRAPH_EVIDENCE_REJECTED';

if (decision !== 'GRAPH_EVIDENCE_ACCEPTED') {
  throw new Error('Live Graph data did not satisfy SafeGate evidence policy.');
}

let settlementTx = null;
let settlementValue = 0n;
let balanceAfter = await getBalance();

for (let attempt = 0; attempt < 30; attempt += 1) {
  const latestBlock = await client.getBlockNumber();

  const logs = await client.getLogs({
    address: USDC,
    event: transferEvent,
    args: { from: account.address },
    fromBlock: blockBefore,
    toBlock: latestBlock
  });

  if (logs.length > 0) {
    const paymentLog = logs[logs.length - 1];
    settlementTx = paymentLog.transactionHash;
    settlementValue = paymentLog.args.value || 0n;
  }

  balanceAfter = await getBalance();

  if (settlementTx && balanceAfter < balanceBefore) break;

  await new Promise(function (resolve) { setTimeout(resolve, 1500); });
}

if (!settlementTx) {
  throw new Error('Graph result returned but Base Sepolia USDC settlement TX was not observed.');
}

const graphResultHash = sha256(canonical(data));
const queryHash = sha256(GRAPHQL);

const evidence = {
  schema: 'safegate-thegraph-evidence/v1',
  observedAt: new Date().toISOString(),
  graph: {
    provider: 'The Graph',
    product: 'Uniswap-Sepolia Subgraph',
    indexedNetwork: 'Ethereum Sepolia',
    subgraphId: SUBGRAPH_ID,
    endpoint: ENDPOINT,
    liveData: true,
    loadBearing: true
  },
  x402: {
    protocol: 'x402',
    paymentNetwork: 'Base Sepolia',
    paymentChainId: 84532,
    asset: 'USDC',
    assetContract: USDC,
    payer: account.address,
    amountAtomic: settlementValue.toString(),
    amount: formatUnits(settlementValue, 6),
    settlementTx: settlementTx
  },
  query: {
    querySha256: queryHash,
    responseSha256: graphResultHash,
    factoriesReturned: factories.length,
    bundlesReturned: bundles.length
  },
  marketEvidence: {
    selectedFactory: selectedFactory.id,
    poolCount: String(selectedFactory.poolCount),
    txCount: String(selectedFactory.txCount),
    totalVolumeUSD: String(selectedFactory.totalVolumeUSD),
    ethPriceUSD: ethPriceUSD
  },
  decision: {
    policy: 'Require live The Graph factory evidence with poolCount > 0 and txCount > 0. Without qualifying Graph evidence SafeGate does not emit a successful proof.',
    status: decision
  }
};

ensureSigner();

const evidenceHash = sha256(canonical(evidence));

const payload = {
  schema: 'safegate-commerce-proof/thegraph-continuity-v1',
  proofId: 'SG-GRAPH-' + crypto.randomUUID(),
  issuedAt: new Date().toISOString(),
  assurance: {
    level: 'OBSERVED',
    basis: 'SafeGate executed a paid The Graph x402 query, observed the returned live indexed data, used that data as a load-bearing policy input, and bound the query result and settlement into this proof.'
  },
  evidenceHash: 'sha256:' + evidenceHash,
  evidence: evidence
};

const signingKey = crypto.createPrivateKey(fs.readFileSync(SIGNER_PATH));
const publicKey = crypto.createPublicKey(signingKey);
const payloadBytes = Buffer.from(canonical(payload), 'utf8');

const signatureBytes = crypto.sign(null, payloadBytes, signingKey);
const signatureVerified = crypto.verify(null, payloadBytes, publicKey, signatureBytes);

if (!signatureVerified) {
  throw new Error('Ed25519 signature verification failed.');
}

const proof = {
  payload: payload,
  signature: {
    algorithm: 'Ed25519',
    value: signatureBytes.toString('base64url'),
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
    verified: true
  }
};

fs.mkdirSync(path.join(__dirname, 'evidence'), { recursive: true });
fs.mkdirSync(path.join(__dirname, 'proofs'), { recursive: true });

fs.writeFileSync(
  path.join(__dirname, 'evidence', 'thegraph-x402-market-evidence.json'),
  JSON.stringify(evidence, null, 2) + '\n',
  'utf8'
);

fs.writeFileSync(
  path.join(__dirname, 'proofs', 'thegraph-x402-commerce-proof.json'),
  JSON.stringify(proof, null, 2) + '\n',
  'utf8'
);

console.log('');
console.log('===============================================');
console.log(' SAFEGATE / THE GRAPH CONTINUITY — PASS');
console.log('===============================================');
console.log('SUBGRAPH: Uniswap-Sepolia');
console.log('SUBGRAPH_ID:', SUBGRAPH_ID);
console.log('LIVE_GRAPH_DATA: PASS');
console.log('FACTORY:', selectedFactory.id);
console.log('POOL_COUNT:', String(selectedFactory.poolCount));
console.log('TX_COUNT:', String(selectedFactory.txCount));
console.log('ETH_PRICE_USD:', ethPriceUSD);
console.log('X402_PAYMENT_NETWORK: Base Sepolia');
console.log('X402_ASSET: TEST USDC');
console.log('PAID_AMOUNT:', formatUnits(settlementValue, 6), 'USDC');
console.log('SETTLEMENT_TX:', settlementTx);
console.log('DECISION:', decision);
console.log('ASSURANCE: OBSERVED');
console.log('SIGNATURE_VERIFY: PASS');
console.log('BALANCE_BEFORE:', formatUnits(balanceBefore, 6));
console.log('BALANCE_AFTER:', formatUnits(balanceAfter, 6));
console.log('THEGRAPH_CONTINUITY_PASS');
console.log('===============================================');
