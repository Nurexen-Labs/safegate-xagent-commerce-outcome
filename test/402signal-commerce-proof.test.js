"use strict";

async function main() {


const assert = require("node:assert");
const crypto = require("node:crypto");

const {
  create402SignalPrePaymentEvidence,
  bind402SignalPrePaymentEvidenceToRequest
} = require("../lib/402signal-prepayment-evidence");

const {
  execute402SignalObservedLifecycle
} = require("../lib/402signal-commerce-lifecycle");

const {
  createCommerceProofPayload,
  signCommerceProof,
  verifyCommerceProofEnvelope
} = require("../lib/402signal-commerce-proof");


const requestId =
  "SG-EVM-REQ-402SIGNAL-0002";

const verifiedAction = {
  model:
    "proof_carrying_route_v1",

  request: {
    url:
      "https://merchant.example/paid-agent-tool",

    method:
      "GET",

    body_sha256:
      "a".repeat(64)
  },

  accepted: {
    scheme:
      "exact",

    network:
      "eip155:8453",

    amount:
      "1000",

    asset:
      "USDC",

    payTo:
      "0x1111111111111111111111111111111111111111"
  },

  expires_at:
    1789160000,

  quote_sha256:
    "b".repeat(64)
};


const prepayment =
  create402SignalPrePaymentEvidence({
    verifiedAction,

    routeRequestJson:
      JSON.stringify({
        url:
          "https://merchant.example/paid-agent-tool",

        networks: [
          "base"
        ],

        require_route_binding:
          true
      }),

    routeResponseJson:
      JSON.stringify({
        synthetic: true,
        selected: true
      }),

    sourceMode:
      "SYNTHETIC"
  });


const boundPrepayment =
  bind402SignalPrePaymentEvidenceToRequest({
    evidence:
      prepayment,

    requestId
  });


const consumed =
  new Set();

const txHash =
  "0x" + "cd".repeat(32);


const lifecycle =
  await execute402SignalObservedLifecycle(
    {
      prepaymentEvidence:
        boundPrepayment,

      request: {
        requestId,

        method:
          "GET",

        path:
          "/paid-agent-tool",

        body:
          null
      },

      paymentProof: {
        synthetic:
          true
      }
    },

    {
      verifyPayment:
        async () => ({
          ok: true,

          verification: {
            payment_status:
              "PAYMENT_VERIFIED",

            request_id:
              requestId,

            transaction_hash:
              txHash,

            chain_id:
              8453,

            asset:
              "USDC"
          }
        }),

      consumeOnce:
        async ({ consumeKey }) => {
          if (
            consumed.has(
              consumeKey
            )
          ) {
            return false;
          }

          consumed.add(
            consumeKey
          );

          return true;
        },

      execute:
        async () => ({
          statusCode:
            200,

          body: {
            ok: true,

            result:
              "synthetic-agent-service-response"
          }
        }),

      now:
        (() => {
          const values = [
            "2026-09-11T17:00:00.000Z",
            "2026-09-11T17:00:01.000Z"
          ];

          return () =>
            values.shift() ||
            "2026-09-11T17:00:01.000Z";
        })()
    }
  );


const payload =
  createCommerceProofPayload(
    lifecycle,
    {
      issuedAt:
        "2026-09-11T17:00:02.000Z"
    }
  );


/*
 * Ephemeral test key only.
 * Private key remains in process memory.
 * Never written to disk or printed.
 */
const {
  publicKey,
  privateKey
} =
  crypto.generateKeyPairSync(
    "ed25519"
  );


const publicKeyPem =
  publicKey.export({
    type:
      "spki",

    format:
      "pem"
  });


const envelope =
  signCommerceProof(
    payload,
    {
      signerId:
        "SAFEGATE-STAGE5-EPHEMERAL",

      publicKeyPem,

      sign:
        bytes =>
          crypto.sign(
            null,
            bytes,
            privateKey
          )
    }
  );


const verified =
  verifyCommerceProofEnvelope(
    envelope
  );


assert.equal(
  verified.ok,
  true
);

assert.equal(
  verified.signature_status,
  "VERIFIED"
);

assert.equal(
  verified.signer_scheme,
  "Ed25519"
);

assert.equal(
  verified.signer_trust,
  "UNPINNED_TEST_KEY"
);

assert.equal(
  verified.production_evidence,
  false
);

assert.equal(
  verified.commerce_verified,
  false
);

assert.match(
  verified.proof_id,
  /^SG-402-PROOF-[A-F0-9]{32}$/
);


/* ----------------------------------------------
   TAMPER TEST
---------------------------------------------- */

const tampered =
  JSON.parse(
    JSON.stringify(
      envelope
    )
  );

tampered
  .payload
  .post_payment
  .response_hash =
    "0".repeat(64);


assert.throws(
  () =>
    verifyCommerceProofEnvelope(
      tampered
    ),

  error =>
    error &&
    error.code ===
      "SIGNATURE_MISMATCH"
);


console.log(
  "PORTABLE_COMMERCE_PROOF=PASS"
);

console.log(
  "PROOF_SIGNATURE=VERIFIED"
);

console.log(
  "SIGNATURE_SCHEME=Ed25519"
);

console.log(
  "SIGNER_TRUST=UNPINNED_TEST_KEY"
);

console.log(
  "TAMPER_DETECTION=PASS"
);

console.log(
  "PREPAYMENT=THIRD_PARTY_ATTESTED"
);

console.log(
  "POST_PAYMENT=OBSERVED"
);

console.log(
  "PRODUCTION_EVIDENCE=NO"
);

console.log(
  "COMMERCE_VERIFIED=NO"
);

console.log(
  "PRIVATE_KEY_WRITTEN_TO_DISK=NO"
);

console.log(
  "WALLET_USED=NO"
);

console.log(
  "PAYMENT_SENT=NO"
);
}

main().catch(error => {
  console.error(
    "TEST_FAILURE_CODE=" +
    String(error && error.code ? error.code : "UNHANDLED_ERROR")
  );

  console.error(
    error && error.stack
      ? error.stack
      : String(error)
  );

  process.exitCode = 1;
});