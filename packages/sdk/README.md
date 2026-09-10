# @nurexenlabs/safegate-sdk

SafeGate is the assurance layer for programmable commerce.

Payment proves value moved. SafeGate verifies the evidence describing what happened next and exposes the assurance level of that evidence.

SafeGate does not:

- hold funds
- process payments
- provide custody
- act as escrow
- silently treat provider claims as independent validation

## 3-minute Quickstart

Requirements:

- Node.js 18.17 or newer
- a SafeGate endpoint
- a SafeGate commerce attestation

Install after the public npm release:

    npm install @nurexenlabs/safegate-sdk

During preview or pre-release testing, install the supplied SafeGate SDK tarball instead:

    npm install ./safegate-sdk-0.4.0.tgz

Set your SafeGate endpoint.

PowerShell:

    $env:SAFEGATE_BASE_URL="https://YOUR-SAFEGATE-ENDPOINT"

Run the included example:

    node node_modules/@nurexenlabs/safegate-sdk/examples/verify-commerce.cjs .\commerce-attestation.json

Expected successful result:

    SafeGate verification PASS
    decision: PAYMENT_AND_ATTESTATION_VERIFIED
    assurance: CLAIMED
    commerce_verified: false
    chain_id: 8453
    asset: USDC

## JavaScript

    const {
      SafeGateClient
    } = require("@nurexenlabs/safegate-sdk");

    const fs = require("fs");

    const safegate = new SafeGateClient({
      baseUrl: process.env.SAFEGATE_BASE_URL
    });

    const attestation = JSON.parse(
      fs.readFileSync(
        "./commerce-attestation.json",
        "utf8"
      )
    );

    const result = await safegate.verifyCommerce(
      attestation
    );

    console.log(result.decision);
    console.log(result.assurance.level);
    console.log(result.commerce_verified);

## Agent / MCP

The same SDK can discover SafeGate's MCP server:

    const discovery =
      await safegate.mcpDiscover();

    const tools =
      await safegate.mcpListTools();

And call the SafeGate verification tool:

    const result =
      await safegate.mcpVerifyCommerce(
        attestation
      );

Current MCP protocol target:

    2026-07-28

Current tool:

    safegate_verify_commerce

## Assurance semantics

CLAIMED

Provider-supplied fulfillment or outcome evidence has been authenticated, but SafeGate has not independently observed or validated the underlying fulfillment.

OBSERVED

SafeGate observed the paid request, execution, response, or equivalent execution evidence.

VALIDATED

An independent validation mechanism was used, such as independent re-execution, TEE evidence, zk evidence, or another configured validator.

THIRD_PARTY_ATTESTED

An external attestor supplied evidence under a separately identified trust mechanism.

Important:

Payment verification alone does not prove fulfillment.

A CLAIMED result must never be presented as independently VALIDATED.

`commerce_verified` is only true when the configured assurance policy threshold has actually been satisfied.

## Current Base Mainnet adapter

The current Base adapter can verify:

- SafeGate Ed25519 commerce attestation
- Base Mainnet chain ID 8453
- USDC payment evidence
- payment-to-proof binding

Current fulfillment assurance ceiling:

    CLAIMED

## Safety

The SDK requires HTTPS for non-local endpoints.

No wallet private key, API secret, seed phrase, or signing secret is required for public verification calls.

Do not place privileged merchant or server credentials in browser code.

## SilentSwap developer surface

SafeGate exposes a server-side integration surface
for the current SilentSwap SDK OrderReference +
OrderState flow.

    const {
      executeSilentSwapObservedCommerce
    } = require("@nurexenlabs/safegate-sdk");

    const result =
      await executeSilentSwapObservedCommerce({
        order,
        state,
        requestBinding,
        source,
        destination,
        consumeRouteOnce,
        middlewareInput,
        middlewareOptions
      });

    console.log(result.route.assurance);
    // CLAIMED

    console.log(result.outcome.assurance);
    // OBSERVED

SilentSwap protects the route.
SafeGate proves the outcome.

Trust boundary:

- SilentSwap route evidence remains CLAIMED.
- SafeGate emits OBSERVED only for execution it observed.
- OBSERVED does not mean independent validation.
- SafeGate does not custody or route funds.
- SafeGate does not sign SilentSwap wallet transactions.

See:

    examples/silentswap-observed-commerce.cjs
