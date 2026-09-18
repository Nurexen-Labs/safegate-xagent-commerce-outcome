# SafeGate Colosseum 2026 — Base Agent Commerce

## Purpose

This document defines the hackathon-period engineering delta for SafeGate during the 2026 Crypto World's Fair / Colosseum build period.

SafeGate predates this hackathon.

The goal is not to rewrite the existing SafeGate core or present prior work as new work.

The Colosseum delta is a focused, auditable agent-commerce flow that composes existing SafeGate primitives into one end-to-end commerce assurance path on Base.

## North Star

Payment proves value moved.

SafeGate proves what actually happened next — and makes the strength of that proof explicit.

## Existing foundation — pre-hackathon

The following capabilities existed before the Colosseum build period and are treated as frozen dependencies:

- Base Mainnet USDC payment verification
- SafeGate Public Verify API
- payment-to-request binding primitives
- Observed Middleware Core
- durable consume-once integration contract
- replay rejection
- response hashing
- MCP commerce verification tool
- public JavaScript SDK
- signed commerce evidence / attestation primitives
- existing Base Mainnet merchant evidence
- Hedera reference flow
- SilentSwap integration
- 402Signal integration
- third-party evidence adapters

These capabilities are not claimed as Colosseum-period work.

## Colosseum engineering delta

The new build is:

SafeGate Base Agent Commerce Flow

An autonomous agent-oriented orchestration layer that connects:

1. commerce request
2. Base payment evidence
3. exact request binding
4. durable single-consume enforcement
5. downstream execution
6. outcome observation
7. portable CommerceProof
8. deterministic replay rejection

The goal is to expose the full commerce lifecycle as one machine-readable flow rather than forcing an agent to compose separate SafeGate primitives manually.

## Target flow

AI Agent
  ->
Commerce Request
  ->
Base USDC Payment Evidence
  ->
SafeGate Payment Verification
  ->
Exact Request Binding
  ->
Durable Single Consume
  ->
Service Execution
  ->
Outcome Observation
  ->
Response Hash
  ->
CommerceProof
  ->
Agent-readable Result

A second attempt using the same verified payment must fail closed:

ALREADY_CONSUMED

## Core freeze

The Colosseum implementation must not rewrite proven SafeGate core logic.

Existing modules remain authoritative for their current responsibilities.

### Base payment verification

Existing Base Mainnet USDC verification remains the payment-verification source.

Expected properties include:

- chain ID 8453
- USDC contract verification
- exact sender
- exact receiver
- exact amount
- successful transaction receipt

### Observed execution

Existing Observed Middleware semantics remain authoritative for:

- exact request normalization
- request hashing
- payment-to-request binding
- consume-once enforcement
- response hashing
- execution outcome observation

## Assurance invariants

SafeGate must preserve strict assurance semantics.

### CLAIMED

A provider or source asserted an outcome.

### OBSERVED

SafeGate directly observed relevant execution evidence.

### THIRD_PARTY_ATTESTED

An identified external party contributed evidence under its own trust mechanism.

### VALIDATED

An independent validation mechanism verified the outcome.

## Critical rule

Payment verification is not commerce verification.

A successful Base payment does not by itself prove that the requested service executed successfully.

An OBSERVED execution does not automatically become VALIDATED.

The Colosseum flow must not emit:

commerce_verified: true

unless a configured policy threshold that genuinely supports that state has been satisfied.

Caller input must never be able to self-promote assurance.

## Legacy semantic isolation

Some older internal verifier surfaces may contain historical labels such as:

COMMERCE_VERIFIED

The Colosseum flow must not inherit those labels blindly.

The new orchestration layer must derive its public assurance result from current SafeGate policy semantics.

For the initial Colosseum flow, direct in-process outcome observation should normally produce:

assurance: OBSERVED
independently_validated: false
commerce_verified: false

unless stronger independent evidence is explicitly introduced and verified.

## 402Signal isolation

The 402Signal CommerceProof profile is provider-specific and must not be reused as the generic Colosseum agent-commerce proof format.

No 402Signal-specific provider identity, synthetic evidence mode, schema, or lifecycle assumption may leak into the Colosseum contract.

## SilentSwap isolation

SilentSwap integration remains a separate partner adapter.

The Colosseum Base Agent Commerce flow must not depend on SilentSwap activation, routing, quote policy, or swap execution.

## Proposed Colosseum modules

The implementation should remain small and auditable.

Expected new surfaces:

- lib/colosseum-agent-commerce.js
- api/colosseum-agent-commerce.js
- test/colosseum-agent-commerce.test.js
- test/colosseum-agent-commerce-adversarial.test.js
- verification/colosseum-2026/

Exact filenames may evolve only when required by implementation constraints.

## Required acceptance tests

The final Colosseum flow must prove at minimum:

### Happy path

- Base payment evidence accepted
- exact request binding accepted
- consume-once succeeds
- service executes
- outcome is observed
- response hash is deterministic
- CommerceProof is produced
- assurance semantics are explicit

### Request mismatch

A verified payment bound to another request must fail closed.

Expected class:

REQUEST_BINDING_MISMATCH

### Replay

The exact same verified payment cannot be consumed twice.

Expected class:

ALREADY_CONSUMED

### Payment mutation

Wrong payment evidence must fail verification.

Examples:

- wrong sender
- wrong receiver
- wrong amount
- wrong transaction hash
- wrong chain

### Assurance elevation attack

Caller-supplied fields must not elevate:

CLAIMED -> OBSERVED
OBSERVED -> VALIDATED
commerce_verified false -> true

### Execution failure

If downstream execution fails, SafeGate must preserve failure evidence rather than reporting success.

## Demo contract

The final live demo should show two calls.

### Call 1

Agent initiates commerce request.

SafeGate shows:

PAYMENT VERIFIED
REQUEST BOUND
PAYMENT CONSUMED
SERVICE EXECUTED
OUTCOME OBSERVED
COMMERCEPROOF CREATED

### Call 2

The agent repeats the same payment evidence.

SafeGate rejects:

ALREADY_CONSUMED

The demo must show the live product flow, not a slide deck or source-code walkthrough.

## Security boundaries

SafeGate remains:

- non-custodial
- non-escrow
- payment-rail agnostic
- wallet-authority free
- replay-safe by contract
- explicit about assurance limitations

The Colosseum build must not require:

- private keys in browser code
- seed phrases
- custody of user funds
- arbitrary wallet authority
- automatic mainnet transaction signing

## Mainnet boundary

Existing Base Mainnet evidence may be reused for verification and demonstration where appropriate.

No new real-money payment, wallet signature, token approval, gas spend, or state-changing mainnet transaction is required by this architecture contract.

Any such action requires separate explicit approval.

## GitHub engineering ledger

All Colosseum-period engineering work must remain reconstructable from GitHub.

Each meaningful milestone should leave an auditable trail through:

- scoped commits
- explicit tests
- verification artifacts
- pull request history
- documentation updates
- clear separation between pre-existing and hackathon-period work

## Judge-facing differentiation

SafeGate is not another payment rail.

It is the assurance layer above payment rails.

The system answers questions payment infrastructure alone cannot answer:

- Which exact request did this payment belong to?
- Was the same payment consumed twice?
- Did the requested execution actually run?
- What response was produced?
- What evidence exists?
- Who produced that evidence?
- How strong is the assurance?

This distinction is the core Colosseum thesis.

## Definition of done

The Colosseum Base Agent Commerce delta is DONE only when:

- the orchestrated flow works end to end
- replay fails closed
- request-binding mutation fails closed
- execution failure is evidenced correctly
- assurance cannot be caller-elevated
- full existing regression remains green
- verification artifacts are committed
- README clearly separates pre-existing work from hackathon work
- the public demo exposes the new flow
- GitHub history makes the hackathon delta independently reviewable