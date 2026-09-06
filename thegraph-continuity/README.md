# SafeGate x The Graph â€” ETHOnline 2026 Continuity

SafeGate now uses The Graph as a live, load-bearing agent discovery and trust-evidence source.

The integration uses the Agent0 SDK, whose documented default Subgraph endpoints are backed by The Graph. No Subgraph Studio browser login or user-supplied API key is required for this SDK path.

## Flow

SafeGate -> Agent0 SDK -> The Graph-backed ERC-8004 Subgraphs -> live active agent records -> SafeGate deterministic ranking/route decision -> response hash -> signed OBSERVED CommerceProof.

## Why The Graph is load-bearing

SafeGate ranks live ERC-8004 agents using MCP endpoint, x402 support, supported trust models, MCP tool inventory, and registration metadata. Without qualifying live indexed agent evidence, the flow does not emit `AGENT_EVIDENCE_ACCEPTED` or a successful CommerceProof.

## Networks queried

- Base Mainnet
- Ethereum Mainnet
- Base Sepolia

## Outputs

- `evidence/thegraph-agent0-sdk-live-evidence.json`
- `proofs/thegraph-commerce-proof.json`

## Continuity

SafeGate's existing payment/request binding, replay safety, outcome evidence, and CommerceProof concepts pre-date ETHOnline 2026. This Continuity feature adds The Graph-backed Agent0 discovery data as a new load-bearing evidence source.

`OBSERVED` means SafeGate executed the live indexed search itself, observed and hashed the returned data, used that data in its routing decision, and signed the resulting proof.

Payment proves value moved. SafeGate proves what that payment or execution actually resulted in â€” and tells you exactly how strong that proof is.