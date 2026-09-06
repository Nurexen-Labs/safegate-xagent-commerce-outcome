# SafeGate x The Graph — ETHOnline 2026 Continuity

## What SafeGate added

SafeGate now uses The Graph as a load-bearing blockchain evidence source.

An agent pays for a live Subgraph query through The Graph x402 Gateway using Base Sepolia test USDC.
The returned indexed blockchain data is evaluated by a deterministic SafeGate policy.
Only qualifying live Graph evidence can produce a successful OBSERVED CommerceProof.

## Flow

SafeGate agent
-> The Graph x402 Gateway
-> USDC pay-per-query on Base Sepolia
-> Uniswap-Sepolia live Subgraph data
-> SafeGate deterministic evidence policy
-> signed OBSERVED CommerceProof

## Why The Graph is load-bearing

SafeGate requires live factory evidence with poolCount > 0 and txCount > 0.
If the paid The Graph query fails or qualifying Graph evidence is absent, SafeGate does not produce a successful proof.

## Evidence bound into CommerceProof

- The Graph Subgraph ID
- GraphQL query hash
- live response hash
- selected factory metrics
- x402 Base Sepolia settlement transaction
- SafeGate policy decision
- Ed25519 signature

## Verified integration

Subgraph: Uniswap-Sepolia
Subgraph ID: 3cgiGHLnVZxJC3qJGVGkQfEfbzbuBXzLW5ayBeaTHxEJ
x402 payment network: Base Sepolia
Payment asset: test USDC
Assurance: OBSERVED

## Outputs

- evidence/thegraph-x402-market-evidence.json
- proofs/thegraph-x402-commerce-proof.json

Payment proves value moved.
SafeGate proves what that paid execution actually resulted in — and tells you exactly how strong that proof is.
