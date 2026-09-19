# SafeGate / nsgoods Evidence Adapter V1

## Purpose

Attach an independently signed nsgoods sanctions-screening result
as attributed pre-payment evidence alongside an existing SafeGate
commerce proof.

nsgoods screens the intended payTo address.
SafeGate verifies the evidence and preserves its provenance.
SafeGate independently handles payment/request binding, replay safety
and post-payment outcome observation.

## Implemented

- EIP-191 signature recovery and verification.
- Service-scoped signer verification against the nsgoods manifest.
- Exact screened-address / expected-payTo binding.
- Raw response preservation and SHA-256 fingerprint.
- Preview evidence explicitly marked TEST_ONLY.
- Manifest failure and unauthorized signer rejection.
- Feed availability checks and timestamp chronology guards.
- Separate pre-payment evidence record.
- Unsigned association with an existing signed SafeGate CommerceProof.
- Negative tests for wrong request, receiver, signature and chronology.

## Assurance boundaries

A signed screening verdict is not payment authorization.

A clean verdict does not guarantee that an address is safe or that
payment is legally permissible. The verdict is scoped to the
provider's stated screening data and limitations.

The free preview is a fixed sample and ignores supplied inputs.
It is never production evidence.

No paid x402 call or live nsgoods-to-SafeGate commerce lifecycle
has been completed in this integration.

Freshness policy and paid-response provenance are not finalized.
No automatic production assurance elevation is permitted.

The evidence association is not itself a signed CommerceProof.
The original signed SafeGate CommerceProof remains unchanged.

## Validation

Local nsgoods adapter, evidence mapping and commerce-link tests: PASS.
Existing SafeGate full regression: PASS.

The nsgoods preview tests currently require access to the provider's
public endpoints. They are not part of the default npm test command.

## Next external validation

Agree on a joint demo with nsgoods, verify a real paid response,
confirm the intended payTo and payment chronology, and assess
freshness before any production assurance classification.

Real payment requires separate explicit approval.
