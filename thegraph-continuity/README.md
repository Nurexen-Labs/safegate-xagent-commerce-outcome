# SafeGate x The Graph - ETHOnline 2026 Continuity

SafeGate extends its existing agent-commerce verification layer with a load-bearing The Graph evidence adapter.

## Flow

SafeGate agent
-> The Graph x402 Gateway
-> Base Sepolia test USDC pay-per-query
-> live Agent0 / ERC-8004 Subgraph data
-> deterministic SafeGate routing decision
-> signed OBSERVED CommerceProof

## Why The Graph is load-bearing

The Graph response is used as an input to the SafeGate routing policy.
If no eligible live x402-capable agent is returned, SafeGate does not emit a successful ROUTE_ELIGIBLE proof.

Evidence binds:
- The Graph Subgraph ID
- live GraphQL response hash
- x402 settlement transaction
- selected ERC-8004 agent
- SafeGate policy decision
- Ed25519 signature

## Network

- x402 payment network: Base Sepolia
- payment asset: testnet USDC
- data source: The Graph Agent0 / ERC-8004 Subgraph
- assurance: OBSERVED

## Outputs

- evidence/thegraph-paid-agent-discovery.json
- proofs/thegraph-x402-commerce-proof.json

Successful execution prints:

THEGRAPH_CONTINUITY_PASS
LIVE_GRAPH_DATA: PASS
DECISION: ROUTE_ELIGIBLE
ASSURANCE: OBSERVED
SIGNATURE_VERIFY: PASS

Payment proves value moved.
SafeGate proves what that paid execution actually resulted in.
