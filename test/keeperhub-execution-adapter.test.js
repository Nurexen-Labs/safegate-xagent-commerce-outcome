"use strict";

const assert =
  require("node:assert/strict");

const crypto =
  require("node:crypto");

const {
  normalizeSimulationResult,
  normalizeExecutionStatus,
  createExecutionBinding,
  buildExecutionConsumeKey,
  verifySignedKeeperHubProof,
  createKeeperHubCommerceProof
} = require(
  "../lib/keeperhub-execution-adapter"
);

const WALLET =
  "0x7a229135cb821b0480d16fcba13b6d10ae7de9df";

const TX =
  "0x" + "a".repeat(64);

const REQUEST = {
  requestId:
    "SG-EVM-REQ-KEEPERHUB-001",

  method:
    "POST",

  path:
    "/v1/keeperhub/demo",

  body: {
    action:
      "deterministic-execution",
    target:
      "keeperhub"
  }
};

const RAW_EXECUTION = {
  executionId:
    "n3364uzl2s6aram5v558c",

  status:
    "completed",

  type:
    "transfer",

  network:
    "84532",

  transactionHash:
    TX,

  receipts: [
    {
      hash:
        TX,

      chainId:
        84532,

      verified:
        true,

      receiptStatus:
        "success",

      blockNumber:
        12345678,

      gasUsed:
        "21000",

      verifiedAt:
        "2026-09-17T03:00:00.000Z"
    }
  ]
};

function expectCode(
  fn,
  expectedCode
) {
  let actual = null;

  try {
    fn();
  } catch (error) {
    actual =
      error &&
      error.code;
  }

  assert.equal(
    actual,
    expectedCode,
    `Expected ${expectedCode}, got ${actual}`
  );
}

async function expectAsyncCode(
  fn,
  expectedCode
) {
  let actual = null;

  try {
    await fn();
  } catch (error) {
    actual =
      error &&
      error.code;
  }

  assert.equal(
    actual,
    expectedCode,
    `Expected ${expectedCode}, got ${actual}`
  );
}

async function main() {
  const simulation =
    normalizeSimulationResult({
      success:
        true,

      status:
        "simulated",

      chainId:
        84532,

      from:
        WALLET,

      to:
        WALLET,

      value:
        "0",

      gasEstimate:
        21000,

      wouldRevert:
        false
    });

  assert.equal(
    simulation.schema,
    "SAFEGATE_KEEPERHUB_SIMULATION_EVIDENCE_V1"
  );

  assert.equal(
    simulation.chain_id,
    84532
  );

  assert.equal(
    simulation.would_revert,
    false
  );

  console.log(
    "KEEPERHUB_SIMULATION_NORMALIZATION=PASS"
  );

  assert.equal(
    simulation.execution_proof,
    false
  );

  assert.equal(
    simulation.broadcast,
    false
  );

  console.log(
    "KEEPERHUB_SIMULATION_NOT_EXECUTION_PROOF=PASS"
  );

  const verified =
    normalizeExecutionStatus(
      RAW_EXECUTION
    );

  assert.equal(
    verified.execution_proof,
    true
  );

  assert.equal(
    verified.request_binding_proven,
    false
  );

  assert.equal(
    verified.receipts[0].verified,
    true
  );

  assert.equal(
    verified.receipts[0]
      .receipt_status,
    "success"
  );

  expectCode(
    () =>
      normalizeExecutionStatus({
        executionId:
          "n3364uzl2s6aram5v558c",

        status:
          "completed",

        transactionHash:
          TX,

        receipts:
          []
      }),

    "KEEPERHUB_VERIFIED_RECEIPT_REQUIRED"
  );

  console.log(
    "KEEPERHUB_VERIFIED_RECEIPT_REQUIRED=PASS"
  );

  expectCode(
    () =>
      normalizeExecutionStatus({
        executionId:
          "n3364uzl2s6aram5v558c",

        status:
          "failed",

        transactionHash:
          TX,

        receipts: [
          {
            hash:
              TX,

            chainId:
              84532,

            verified:
              false,

            receiptStatus:
              "reverted",

            blockNumber:
              12345678
          }
        ]
      }),

    "KEEPERHUB_RECEIPT_REVERTED"
  );

  console.log(
    "KEEPERHUB_REVERT_FAIL_CLOSED=PASS"
  );

  expectCode(
    () =>
      normalizeExecutionStatus({
        executionId:
          "n3364uzl2s6aram5v558c",

        status:
          "unconfirmed",

        transactionHash:
          TX,

        receipts: [
          {
            hash:
              TX,

            chainId:
              84532,

            verified:
              false,

            receiptStatus:
              "timeout",

            blockNumber:
              12345678
          }
        ]
      }),

    "KEEPERHUB_EXECUTION_UNCONFIRMED"
  );

  expectCode(
    () =>
      normalizeExecutionStatus({
        executionId:
          "n3364uzl2s6aram5v558c",

        status:
          "failed",

        transactionHash:
          TX,

        receipts: [
          {
            hash:
              TX,

            chainId:
              84532,

            verified:
              false,

            receiptStatus:
              "timeout",

            blockNumber:
              12345678
          }
        ]
      }),

    "KEEPERHUB_RECEIPT_TIMEOUT"
  );

  console.log(
    "KEEPERHUB_TIMEOUT_FAIL_CLOSED=PASS"
  );

  expectCode(
    () =>
      normalizeExecutionStatus({
        authorization:
          "Bearer kh_SHOULD_NEVER_APPEAR",

        executionId:
          "n3364uzl2s6aram5v558c",

        status:
          "completed",

        transactionHash:
          TX,

        receipts: [
          {
            hash:
              TX,

            chainId:
              84532,

            verified:
              true,

            receiptStatus:
              "success",

            blockNumber:
              12345678
          }
        ]
      }),

    "KEEPERHUB_SECRET_FIELD_FORBIDDEN"
  );

  assert.equal(
    JSON.stringify(
      verified
    ).includes("kh_"),
    false
  );

  console.log(
    "KEEPERHUB_SECRET_LEAK_TEST=PASS"
  );

  console.log(
    "KEEPERHUB_ADAPTER_V1=PASS"
  );

  const binding =
    createExecutionBinding(
      REQUEST,
      verified
    );

  assert.equal(
    binding.request_id,
    REQUEST.requestId
  );

  assert.equal(
    binding.request_execution_binding,
    "VALID"
  );

  assert.match(
    binding.request_hash,
    /^[a-f0-9]{64}$/
  );

  assert.match(
    binding.binding_hash,
    /^[a-f0-9]{64}$/
  );

  console.log(
    "KEEPERHUB_REQUEST_BINDING=PASS"
  );

  assert.equal(
    binding.execution_id,
    RAW_EXECUTION.executionId
  );

  assert.deepEqual(
    binding.transaction_hashes,
    [TX]
  );

  console.log(
    "KEEPERHUB_EXECUTION_BINDING=PASS"
  );

  const consumeKeyA =
    buildExecutionConsumeKey(
      verified
    );

  const consumeKeyB =
    buildExecutionConsumeKey(
      verified
    );

  assert.equal(
    consumeKeyA,
    consumeKeyB
  );

  assert.match(
    consumeKeyA,
    /^[a-f0-9]{64}$/
  );

  console.log(
    "KEEPERHUB_CONSUME_KEY_DETERMINISTIC=PASS"
  );

  const {
    publicKey,
    privateKey
  } =
    crypto.generateKeyPairSync(
      "ed25519"
    );

  const publicKeyPem =
    publicKey
      .export({
        type:
          "spki",

        format:
          "pem"
      })
      .toString();

  const signer = {
    id:
      "safegate-keeperhub-test",

    scheme:
      "Ed25519",

    publicKeyPem,

    async sign(bytes) {
      return crypto.sign(
        null,
        Buffer.from(bytes),
        privateKey
      );
    }
  };

  const consumed =
    new Set();

  const consumeOnce =
    async ({
      consumeKey
    }) => {
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
    };

  const result =
    await createKeeperHubCommerceProof(
      {
        request:
          REQUEST,

        execution:
          verified
      },

      {
        consumeOnce,

        signer,

        now:
          () =>
            "2026-09-17T03:10:00.000Z"
      }
    );

  assert.equal(
    result.request_binding,
    "VALID"
  );

  assert.equal(
    result.execution_binding,
    "VALID"
  );

  assert.equal(
    result.replay_status,
    "CONSUMED"
  );

  assert.equal(
    result.assurance_level,
    "THIRD_PARTY_ATTESTED"
  );

  assert.equal(
    result.independently_validated,
    false
  );

  assert.equal(
    result.commerce_verified,
    false
  );

  console.log(
    "KEEPERHUB_SIGNED_PROOF=PASS"
  );

  assert.match(
    result.commerce_proof
      .payload
      .proof_id,
    /^SG-KH-PROOF-[A-F0-9]{32}$/
  );

  assert.equal(
    result.commerce_proof
      .payload
      .assurance
      .execution,
    "THIRD_PARTY_ATTESTED"
  );

  const verification =
    verifySignedKeeperHubProof(
      result.commerce_proof
    );

  assert.equal(
    verification.ok,
    true
  );

  assert.equal(
    verification.signature_status,
    "VERIFIED"
  );

  assert.equal(
    verification.commerce_verified,
    false
  );

  console.log(
    "KEEPERHUB_SIGNATURE_VERIFY=PASS"
  );

  await expectAsyncCode(
    () =>
      createKeeperHubCommerceProof(
        {
          request:
            REQUEST,

          execution:
            verified
        },

        {
          consumeOnce,

          signer,

          now:
            () =>
              "2026-09-17T03:11:00.000Z"
        }
      ),

    "ALREADY_CONSUMED"
  );

  console.log(
    "KEEPERHUB_REPLAY_REJECT=PASS"
  );

  await expectAsyncCode(
    () =>
      createKeeperHubCommerceProof(
        {
          request:
            REQUEST,

          execution:
            verified,

          commerce_verified:
            true
        },

        {
          consumeOnce:
            async () => true,

          signer
        }
      ),

    "KEEPERHUB_CALLER_ASSURANCE_ELEVATION_FORBIDDEN"
  );

  assert.equal(
    result.commerce_proof
      .payload
      .assurance
      .independently_validated,
    false
  );

  assert.equal(
    result.commerce_proof
      .payload
      .commerce_verified,
    false
  );

  console.log(
    "KEEPERHUB_ASSURANCE_NO_ELEVATION=PASS"
  );

  console.log(
    "KEEPERHUB_LIFECYCLE_V1=PASS"
  );
}

main().catch(error => {
  console.error(
    error &&
    error.stack
      ? error.stack
      : error
  );

  process.exit(1);
});