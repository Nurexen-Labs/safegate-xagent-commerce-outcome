# SafeGate

**The assurance layer for programmable commerce.**

Payment proves value moved. SafeGate verifies the evidence describing what happened next â€” and makes the strength of that evidence explicit.

SafeGate is designed for agent commerce, paid APIs, MCP tools, digital services, merchants, and platforms that need portable evidence after payment.

## Install the public SDK

    npm install @nurexenlabs/safegate-sdk

Current public release:

    @nurexenlabs/safegate-sdk@0.3.0

Release tag:

    sdk-v0.3.0

## Why SafeGate

Payment infrastructure can prove that money moved.

That alone does not prove:

- which request the payment belonged to
- whether the payment was consumed more than once
- whether the expected execution actually occurred
- what response or fulfillment evidence exists
- how independently that outcome was verified

SafeGate adds an assurance layer after or around the payment rail.

Core flow:

    payment evidence
          |
          v
    request binding
          |
          v
    durable single-consume / replay safety
          |
          v
    outcome observation or attestation
          |
          v
    evidence
          |
          v
    assurance level
          |
          v
    portable CommerceProof

SafeGate is payment-rail agnostic and chain agnostic by design.

## Current product surfaces

### Public Verify API

The public verification contract accepts SafeGate commerce evidence and returns explicit verification and assurance semantics.

Current Base Mainnet adapter:

- Base Mainnet
- chain ID `8453`
- USDC
- SafeGate Ed25519 commerce attestation
- onchain payment verification
- payment-to-proof binding

Current result semantics:

    decision: PAYMENT_AND_ATTESTATION_VERIFIED
    assurance: CLAIMED
    commerce_verified: false

`CLAIMED` means fulfillment or outcome evidence is provider-attested. It is not presented as independently observed or independently validated.

### Observed Middleware Core

The server-side middleware core can bind verified payment evidence to a request, require a durable single-consume callback, execute the integrator-provided handler, and hash the observed response.

Current middleware assurance:

    OBSERVED

Important boundary:

The public v1 implementation does **not** expose an arbitrary internet-open URL proxy.

Future hosted proxy work is intentionally limited to registered upstream identifiers.

### MCP / Agent Tool

SafeGate exposes an MCP-oriented agent verification capability.

Current tool:

    safegate_verify_commerce

Current protocol target:

    2026-07-28

The tool preserves the same assurance semantics as the Public Verify API.

### JavaScript SDK

Example:

    const {
      SafeGateClient
    } = require("@nurexenlabs/safegate-sdk");

    const safegate = new SafeGateClient({
      baseUrl: process.env.SAFEGATE_BASE_URL
    });

    const result =
      await safegate.verifyCommerce(attestation);

    console.log(result.decision);
    console.log(result.assurance.level);
    console.log(result.commerce_verified);

The SDK also supports:

- Public Verify capability discovery
- commerce verification
- Middleware capability discovery
- MCP server discovery
- MCP tool discovery
- MCP commerce verification

## Assurance model

SafeGate deliberately separates evidence strength from payment verification.

### CLAIMED

The provider or source supplied the outcome assertion.

The evidence may be authenticated, but SafeGate has not independently observed or validated the underlying fulfillment.

### OBSERVED

SafeGate observed execution evidence such as the paid request, handler execution, response, or equivalent runtime evidence.

Observation is stronger than a provider claim, but it is not independent validation.

### VALIDATED

An independent validation mechanism verified the outcome.

Examples may include:

- independent re-execution
- trusted execution environment evidence
- zero-knowledge evidence
- independent validators

### THIRD_PARTY_ATTESTED

A separately identified third party contributed an attestation under its own trust mechanism.

## Important semantic rule

Payment verification alone does not prove fulfillment.

SafeGate must not silently promote a provider claim into independent validation.

`commerce_verified` should only become `true` when the configured assurance policy threshold has actually been satisfied.

## What SafeGate is not

SafeGate is not:

- a wallet
- a payment processor
- a custodian
- an escrow service
- a replacement for stablecoin, x402, card, bank, or blockchain payment rails

SafeGate is designed to verify and preserve evidence about commerce outcomes independently of the payment rail underneath.

## Repository layout

    api/
      verify.js
      middleware.js
      mcp.js

    lib/
      public-verify.js
      commerce-middleware.js
      mcp-server.js
      commerce-proof-verifier.js
      base-usdc.js
      attestation-verifier.js

    packages/
      sdk/

    test/
      public-verify.test.js
      commerce-middleware.test.js
      mcp-server.test.js
      sdk.test.js
      quickstart.test.js

    verification/
      public verification artifacts

## Validation completed for v0.3.0

The public SDK release has passed:

- contract tests
- middleware replay-protection tests
- failure-observation tests
- MCP discovery and tool tests
- MCP header-security tests
- SDK safety and error-mapping tests
- Developer Quickstart tests
- clean external npm installation
- external package require
- real Base Mainnet commerce-proof verification

Public npm package:

    npm install @nurexenlabs/safegate-sdk

## Security boundaries

Public verification does not require:

- wallet private keys
- seed phrases
- signing secrets
- privileged merchant credentials

Non-local SDK endpoints require HTTPS.

Privileged credentials belong on trusted server infrastructure, not in browser code.

## Current roadmap

Current productization foundation:

    Public Verify API
          ->
    Observed Middleware Core
          ->
    MCP / Agent Tool
          ->
    Public SDK
          ->
    Developer Quickstart

Next:

- external developers and design partners
- registered-upstream hosted proxy
- partner integrations
- broader payment and evidence adapters

SafeGate's partner strategy is to sit above payment rails, not replace them.

## Links

Website:

    https://safegatelabs.xyz

Public npm package:

    https://www.npmjs.com/package/@nurexenlabs/safegate-sdk

SDK v0.3.0 GitHub Release:

    https://github.com/Nurexen-Labs/safegate-xagent-commerce-outcome/releases/tag/sdk-v0.3.0

## License

The public SDK package is distributed under the Apache License 2.0.

See:

    packages/sdk/LICENSE

---

**SafeGate â€” assurance infrastructure for programmable commerce.**
## SilentSwap integration

SafeGate can compose SilentSwap route evidence with SafeGate's existing Observed Middleware Core.

**Positioning**

> SilentSwap protects the route. SafeGate proves the outcome.

The v1 flow is:

SilentSwap route/payment evidence
-> deterministic normalization
-> SafeGate request binding
-> durable replay-safe consume
-> downstream execution
-> outcome observation
-> commerce evidence

### Assurance semantics

SilentSwap reporting a route as completed remains provider evidence:

- Route assurance: `CLAIMED`
- Commerce verified: `false`
- Independently validated: `false`

When SafeGate directly observes downstream execution through its middleware:

- Outcome assurance: `OBSERVED`

`OBSERVED` is not independent validation. SafeGate does not emit `COMMERCE_VERIFIED` unless the configured policy threshold is actually satisfied.

### Security boundary

SafeGate does not take custody, does not route swap funds, and does not expose an arbitrary internet-open proxy.

The v1 integration remains server-side with explicit replay-safety and execution hooks.
