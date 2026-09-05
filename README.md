# SafeGate — Agent Commerce Verification & Evidence Infrastructure

Payment proves value moved. SafeGate proves what that payment actually resulted in — and how strong that proof is.

## ETHGlobal ETHOnline 2026

Real Hedera Testnet x402 flow:

Agent -> HTTP 402 -> Blocky402 verify/settle -> request/payment binding -> single consume -> paid service execution -> response hash -> signed CommerceProof (`OBSERVED`) -> HCS evidence anchor.

Replay of the same payment is rejected with `HTTP 409 ALREADY_CONSUMED` before the service executes again.

## Proven E2E

- Network: `hedera:testnet`
- Receiver: `0.0.10289148`
- Demo amount: `0.001 TEST HBAR`
- Settlement: `0.0.7162784@1788559687.385960081`
- CommerceProof: signed Ed25519, `assurance=OBSERVED`
- HCS Topic: `0.0.10369436`
- HCS sequence: `1`
- Consensus timestamp: `1788560049.590818104`

## Run

`npm install`

`node scripts/hedera-agent-paid-request.mjs`

Expected: paid response `200 / SETTLED / COMPLETED / OBSERVED`, then replay `409 / ALREADY_CONSUMED`.

## Core Files

`api/agent-commerce.js`  
`lib/blocky402-hedera.js`  
`lib/premium-product-intel.js`  
`lib/agent-consume-store.js`  
`lib/agent-commerce-proof.js`  
`scripts/hedera-agent-paid-request.mjs`

## Trust Semantics

CLAIMED = provider assertion  
OBSERVED = SafeGate observed the paid execution/result  
VALIDATED = independent stronger validation

SafeGate is a rail-agnostic Agent Commerce Verification & Evidence layer, not a payment rail, wallet, escrow, bank, or marketplace.

---

## Binance Agent OS Mini Hackathon 2026

SafeGate extends Binance Agentic Wallet payments with verifiable commerce outcomes.

**Payment proves value moved. SafeGate proves what the payment actually resulted in.**

### Proven Live Flow

Agent
-> CoinMarketCap x402 MCP `tools/call`
-> HTTP 402 payment requirement
-> Binance Agentic Wallet preview
-> `READY_TO_SIGN`
-> Base Mainnet USDC / EIP-3009 payment
-> paid MCP replay
-> real service response
-> durable single-consume
-> signed SafeGate CommerceProof (`OBSERVED`)

### Live Mainnet Evidence

- Payment rail: `x402-binance-agentic-wallet`
- Network: Base Mainnet (`eip155:8453`)
- Payer: `0xac8Ff2F44c27f916ad81Fd956793ac8eCD5CDfF3`
- Merchant: `0x3C5f3a6cE224BB89D72f5EB4232ecC27F67B3eeA`
- Asset: native Base USDC
- Amount: `0.01 USDC`
- Paid service: CoinMarketCap MCP `get_crypto_quotes_latest`
- Requested asset: Bitcoin (`id=1`)
- Settlement transaction: `0xba0a02d7350a97e618f35736809366a0e6b4c7f7ff69c3e0fc94abbbce5bdb18`
- Settlement status: `confirmed`
- Execution: `COMPLETED`
- Assurance: `OBSERVED`
- CommerceProof ID: `SG-CP-df644197-910f-4986-b6af-8ade7eb05ef1`
- Evidence hash: `3eacd0e70c275532899c96b0986a6f9a8a044e0ce8444835cc3d221266650dd1`
- Ed25519 signature: present

### What SafeGate Adds

Binance Agentic Wallet executes the x402 payment.

SafeGate binds:

`payment <-> request <-> actual paid response`

and adds durable single-consume / replay protection, actual outcome observation, response hashing, explicit assurance semantics, and a signed portable CommerceProof.

SafeGate does not replace the wallet or payment rail. It is the verification and evidence layer after payment.

### Core Binance Files

`scripts/binance-agent-os-x402.mjs`

`scripts/binance-mcp-commerce-proof.mjs`

`lib/agent-consume-store.js`

`lib/agent-commerce-proof.js`

Local runtime evidence and signing keys remain outside Git and are never committed.
