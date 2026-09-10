# SilentSwap + SafeGate Public SDK

Status: COMPLETE

Public release:

    @nurexenlabs/safegate-sdk@0.4.0

Install:

    npm install @nurexenlabs/safegate-sdk@0.4.0

## Purpose

SilentSwap protects the route.
SafeGate proves the outcome.

SafeGate consumes the current SilentSwap SDK
OrderReference + OrderState flow and adds:

- deterministic route evidence normalization
- SafeGate request binding
- durable replay-safe consumption
- downstream execution observation
- explicit assurance semantics

## Public API

    const {
      executeSilentSwapObservedCommerce,
      mapSilentSwapOrderState
    } = require("@nurexenlabs/safegate-sdk");

Execution:

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

## Assurance semantics

SilentSwap route:

    CLAIMED

SafeGate-observed downstream outcome:

    OBSERVED

Independent validation:

    false

Commerce verified:

    false

OBSERVED means SafeGate directly observed execution evidence.
It does not mean an independent validator validated the outcome.

## Security boundary

SafeGate:

- does not custody funds
- does not route swap funds
- does not sign wallet transactions
- does not expose an arbitrary internet-open URL proxy

The integration remains server-side and requires explicit
replay-safety, payment-verification and execution hooks.

## Public verification

The 0.4.0 release passed:

- full SafeGate regression
- SilentSwap SDK/core mapping parity
- replay-safety tests
- observed-commerce execution tests
- npm package generation
- clean external package installation
- public npm registry installation
- packaged SilentSwap example execution

Public package:

    npm install @nurexenlabs/safegate-sdk@0.4.0
