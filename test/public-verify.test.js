"use strict";

const assert = require("assert");

const {
  REQUEST_SCHEMA,
  RESPONSE_SCHEMA,
  describePublicVerify,
  verifyPublicRequest
} = require("../lib/public-verify");

const attestation = {
  payload: {
    schema: "SAFEGATE_COMMERCE_ATTESTATION_V1",
    chainId: 8453,
    asset: "USDC"
  },
  signature: "TEST_SIGNATURE"
};

const request = {
  schema: REQUEST_SCHEMA,
  verificationType: "COMMERCE_OUTCOME",
  proof: {
    format: "SAFEGATE_COMMERCE_ATTESTATION_V1",
    attestation
  }
};

async function fakeVerifyCommerceProof(received) {
  assert.strictEqual(received, attestation);

  return {
    ok: true,
    payment_status: "PAYMENT_VERIFIED",
    attestation_status: "VALID",
    fulfillment_status: "FULFILLMENT_COMPLETED",
    evidence_status: "EVIDENCE_CREATED",

    request_id: "SG-EVM-REQ-TEST123456789ABC",
    order_reference: "SG-ORDER-1234567890ABCDEF",
    safegate_transaction: "SG-TX-1234567890ABCDEF12345678",

    transaction_hash: "0x" + "a".repeat(64),

    chain_id: 8453,
    asset: "USDC",
    amount_base_units: "100000",

    payment_sender: "0x" + "1".repeat(40),
    merchant_receiver: "0x" + "2".repeat(40),

    receipt_reference: "SG-TX-TEST-RCPT",
    evidence_reference: "SG-TX-TEST-EVID",
    proof_reference: "SG-TX-TEST-PROOF"
  };
}

(async () => {
  const description = describePublicVerify();

  assert.strictEqual(
    description.capability,
    "safegate_verify"
  );

  assert.strictEqual(
    description.adapters[0].fulfillment_assurance_ceiling,
    "CLAIMED"
  );

  const result = await verifyPublicRequest(
    request,
    {
      verifyCommerceProof: fakeVerifyCommerceProof
    }
  );

  assert.strictEqual(result.ok, true);

  assert.strictEqual(
    result.schema,
    RESPONSE_SCHEMA
  );

  assert.strictEqual(
    result.decision,
    "PAYMENT_AND_ATTESTATION_VERIFIED"
  );

  assert.strictEqual(
    result.assurance.level,
    "CLAIMED"
  );

  assert.strictEqual(
    result.assurance.independently_validated,
    false
  );

  assert.strictEqual(
    result.commerce_verified,
    false
  );

  assert.strictEqual(
    result.adapter.id,
    "BASE_MAINNET_USDC_ATTESTATION_V1"
  );

  assert.strictEqual(
    result.verification.payment_binding,
    "VALID"
  );

  await assert.rejects(
    () =>
      verifyPublicRequest(
        {
          ...request,
          schema: "BAD_SCHEMA"
        },
        {
          verifyCommerceProof: fakeVerifyCommerceProof
        }
      ),
    error =>
      error &&
      error.code === "UNSUPPORTED_VERIFY_SCHEMA"
  );

  await assert.rejects(
    () =>
      verifyPublicRequest(
        {
          ...request,
          proof: {
            ...request.proof,
            attestation: {
              ...attestation,
              payload: {
                ...attestation.payload,
                chainId: 999999
              }
            }
          }
        },
        {
          verifyCommerceProof: fakeVerifyCommerceProof
        }
      ),
    error =>
      error &&
      error.code ===
        "UNSUPPORTED_VERIFICATION_ADAPTER"
  );

  console.log(
    "PUBLIC_VERIFY_API_CONTRACT_TEST=PASS"
  );
})().catch(error => {
  console.error(error);
  process.exit(1);
});