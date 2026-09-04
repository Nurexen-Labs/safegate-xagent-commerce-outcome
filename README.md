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
