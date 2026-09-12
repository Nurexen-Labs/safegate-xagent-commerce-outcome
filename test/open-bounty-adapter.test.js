"use strict";

const assert = require("assert");

const {
  buildOpenBountyExecutionId,
  buildCompositePaymentReference,
  mapOpenBountyToExecutionAdapter
} = require("../lib/open-bounty-adapter");

function expectCode(fn, code) {
  let caught = null;

  try {
    fn();
  } catch (error) {
    caught = error;
  }

  assert(caught, `expected ${code}`);
  assert.strictEqual(caught.code, code);
}

const executionId =
  buildOpenBountyExecutionId({
    bountyId: "42",
    submissionId: "91",
    version: 1
  });

assert.strictEqual(
  executionId,
  "OPEN_BOUNTY:42:SUBMISSION:91:V1"
);

console.log(
  "OPEN_BOUNTY_EXECUTION_ID=PASS"
);

const underReview =
  mapOpenBountyToExecutionAdapter({
    bountyId: "42",
    requestBinding:
      "SG-OPEN-BOUNTY-REQUEST-001",

    submission: {
      id: "91",
      version: 1,
      status: "under_review",
      submissionHash:
        "submission-hash-001",
      criteriaHash:
        "criteria-hash-001"
    }
  });

assert.strictEqual(
  underReview.generic_event.provider,
  "OPEN_BOUNTY"
);

assert.strictEqual(
  underReview.generic_event.operation_type,
  "BOUNTY"
);

assert.strictEqual(
  underReview.generic_event.assurance.outcome,
  "CLAIMED"
);

assert.strictEqual(
  underReview.generic_event.assurance
    .commerce_verified,
  false
);

assert.strictEqual(
  underReview.settlement
    .composite_payment_reference,
  null
);

console.log(
  "OPEN_BOUNTY_BASE_MAPPING=PASS"
);

const approved =
  mapOpenBountyToExecutionAdapter({
    bountyId: "42",
    requestBinding:
      "SG-OPEN-BOUNTY-REQUEST-001",

    submission: {
      id: "91",
      version: 2,
      status: "quorum_approved",
      submissionHash:
        "submission-hash-002",
      criteriaHash:
        "criteria-hash-001"
    },

    quorumCertificate: {
      hash:
        "certificate-hash-001",

      signedPayload:
        "signed-quorum-payload-example"
    },

    settlement: {
      workerPaymentReference:
        "worker-x402-settlement-001",

      deliveryPaymentReference:
        "delivery-x402-settlement-001"
    }
  });

assert.strictEqual(
  approved.quorum.certificate_present,
  true
);

assert.strictEqual(
  approved.quorum.safegate_verification,
  "NOT_PERFORMED"
);

assert.strictEqual(
  approved.quorum
    .automatic_assurance_upgrade,
  false
);

assert.strictEqual(
  approved.quorum
    .eligible_after_independent_verification,
  "THIRD_PARTY_ATTESTED"
);

assert.strictEqual(
  approved.generic_event.assurance.outcome,
  "CLAIMED"
);

assert.strictEqual(
  approved.generic_event.assurance
    .independently_validated,
  false
);

assert.strictEqual(
  approved.generic_event.assurance
    .commerce_verified,
  false
);

assert.strictEqual(
  approved.settlement.complete,
  true
);

assert(
  approved.settlement
    .composite_payment_reference
    .startsWith(
      "OPEN_BOUNTY_X402_COMPOSITE_SHA256:"
    )
);

console.log(
  "QUORUM_AUTO_UPGRADE=BLOCKED"
);

console.log(
  "THIRD_PARTY_ATTESTED=VERIFICATION_REQUIRED"
);

console.log(
  "DUAL_X402_SETTLEMENT_MAPPING=PASS"
);

const partialPayment =
  buildCompositePaymentReference({
    workerPaymentReference:
      "worker-only",
    deliveryPaymentReference:
      null
  });

assert.strictEqual(
  partialPayment,
  null
);

console.log(
  "PARTIAL_SETTLEMENT_NOT_COMPLETE=PASS"
);

expectCode(
  () =>
    mapOpenBountyToExecutionAdapter({
      bountyId: "42",
      requestBinding: "binding",
      assurance: "VALIDATED",

      submission: {
        id: "91",
        version: 1,
        status: "quorum_approved",
        submissionHash: "hash-a",
        criteriaHash: "hash-b"
      }
    }),
  "CALLER_ASSURANCE_ELEVATION_FORBIDDEN"
);

console.log(
  "ASSURANCE_ELEVATION=BLOCKED"
);

expectCode(
  () =>
    mapOpenBountyToExecutionAdapter({
      bountyId: "42",
      requestBinding: "binding",

      submission: {
        id: "91",
        version: 1,
        status: "submitted",
        submissionHash: "",
        criteriaHash: "hash-b"
      }
    }),
  "INVALID_OPEN_BOUNTY_INPUT"
);

console.log(
  "SUBMISSION_HASH_REQUIRED=PASS"
);

console.log(
  "OPEN_BOUNTY_ADAPTER_V1_TESTS=PASS"
);