# ETHOnline 2026 — Event Window Checkpoint

Event: ETHGlobal ETHOnline 2026
Event-window work started: 2026-09-04 after official hacking start
Branch: ethonline-2026-hedera-x402

## Pre-event baseline

Baseline commit:

b460b88ce800839e69839a5d31aac949dfe2543c

Existing before ETHOnline:

- Base Mainnet USDC verification
- SafeGate Ed25519 commerce-attestation verification
- payment/reference binding
- signed commerce-state fields
- evidence/proof references
- agent-callable Commerce Outcome API

## ETHOnline-new work

The following capabilities are event-window work and were not present in this public baseline repo before ETHOnline:

- Hedera integration
- Blocky402 / x402 payment flow
- paid digital service
- agent consumer
- request-to-payment binding for the Hedera/x402 flow
- durable single-consume / replay rejection
- actual service-response observation
- response hash and execution metadata
- CLAIMED / OBSERVED / VALIDATED assurance model
- CommerceProof v0.1
- Hedera Consensus Service anchor

Target demo assurance level:

OBSERVED

Target flow:

Agent
→ Hedera / Blocky402 / x402 payment
→ paid service
→ SafeGate observes actual response
→ CommerceProof
→ HCS anchor

Replay test:

Reuse the same payment
→ ALREADY_CONSUMED / REPLAY
→ service must not execute twice
