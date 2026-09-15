"use strict";

const assert =
  require("node:assert/strict");

const crypto =
  require("node:crypto");

const {
  createHostedAgentCommerceRuntime
} = require(
  "../lib/colosseum-hosted-agent-commerce"
);

const {
  verifySignedAgentCommerceProof
} = require(
  "../lib/colosseum-agent-commerce"
);

const {
  createHandler:
    createIntentHandler
} = require(
  "../api/agent-commerce-intents"
);

const {
  createHandler:
    createExecuteHandler
} = require(
  "../api/agent-commerce-execute"
);

const {
  BASE_USDC
} = require(
  "../lib/base-usdc"
);

const REQUEST_ID =
  "SG-EVM-REQ-COLOSSEUM-HOSTED-0001";

const SENDER =
  "0x" + "11".repeat(20);

const RECEIVER =
  "0x" + "22".repeat(20);

const TX_HASH =
  "0x" + "33".repeat(32);

function request() {
  return {
    requestId: REQUEST_ID,
    method: "POST",
    path:
      "/v1/demo/premium-intel",
    body: {
      sku: "SAFEGATE-DEMO-001",
      attributes: {
        category:
          "agent-commerce"
      }
    }
  };
}

function makeResponse() {
  return {
    statusCode: null,
    body: null,
    headers: {},

    status(code) {
      this.statusCode = code;
      return this;
    },

    json(body) {
      this.body = body;
      return this;
    },

    setHeader(name, value) {
      this.headers[name] = value;
    }
  };
}

function makeSigner() {
  const {
    privateKey,
    publicKey
  } =
    crypto.generateKeyPairSync(
      "ed25519"
    );

  return {
    id:
      "colosseum-hosted-test",
    scheme:
      "Ed25519",
    publicKeyPem:
      publicKey
        .export({
          type: "spki",
          format: "pem"
        })
        .toString(),

    async sign(bytes) {
      return crypto.sign(
        null,
        Buffer.from(bytes),
        privateKey
      );
    }
  };
}

async function main() {
  const intents =
    new Map();

  const consumed =
    new Set();

  const intentStore = {
    async createOnce(intent) {
      if (
        intents.has(
          intent.request.request_id
        )
      ) {
        return false;
      }

      intents.set(
        intent.request.request_id,
        intent
      );

      intents.set(
        intent.intent_id,
        intent
      );

      return true;
    },

    async get(intentId) {
      return (
        intents.get(intentId) ||
        null
      );
    }
  };

  async function consumeOnce(input) {
    const key =
      String(input.chainId) +
      ":" +
      String(
        input.transactionHash
      ).toLowerCase();

    if (consumed.has(key)) {
      return false;
    }

    consumed.add(key);
    return true;
  }

  const runtime =
    createHostedAgentCommerceRuntime({
      intentStore,
      consumeOnce,
      signer:
        makeSigner(),

      now:
        () =>
          "2026-09-15T00:05:00.000Z",

      verifyTransfer:
        async expected => ({
          payment_status:
            "PAYMENT_VERIFIED",
          chain_id:
            8453,
          asset:
            "USDC",
          token_contract:
            BASE_USDC,
          transaction_hash:
            expected.transactionHash,
          block_number:
            24681012,
          payment_sender:
            expected.paymentSender,
          merchant_receiver:
            expected.merchantReceiver,
          amount_base_units:
            expected.amountBaseUnits
        })
    });

  const create =
    await runtime.createIntent({
      request:
        request(),
      payment: {
        paymentSender:
          SENDER,
        merchantReceiver:
          RECEIVER,
        amountBaseUnits:
          "100000"
      },
      ttl_seconds:
        900
    });

  assert.equal(
    create.ok,
    true
  );

  assert.equal(
    create.intent.payment.chain_id,
    8453
  );

  let duplicateCode = null;

  try {
    await runtime.createIntent({
      request:
        request(),
      payment: {
        paymentSender:
          SENDER,
        merchantReceiver:
          RECEIVER,
        amountBaseUnits:
          "100000"
      },
      ttl_seconds:
        900
    });
  } catch (error) {
    duplicateCode =
      error && error.code;
  }

  assert.equal(
    duplicateCode,
    "PAYMENT_INTENT_ALREADY_EXISTS"
  );

  const executed =
    await runtime.executeIntent({
      intent_id:
        create.intent.intent_id,
      request:
        request(),
      transaction_hash:
        TX_HASH
    });

  assert.equal(
    executed.ok,
    true
  );

  assert.equal(
    executed.payment_status,
    "PAYMENT_VERIFIED"
  );

  assert.equal(
    executed.request_binding,
    "VALID"
  );

  assert.equal(
    executed.replay_status,
    "CONSUMED"
  );

  assert.equal(
    executed.assurance_level,
    "OBSERVED"
  );

  assert.equal(
    executed.independently_validated,
    false
  );

  assert.equal(
    executed.commerce_verified,
    false
  );

  assert.equal(
    executed.response.statusCode,
    200
  );

  assert.equal(
    executed.response.body.service,
    "safegate_colosseum_registered_demo"
  );

  const proofCheck =
    verifySignedAgentCommerceProof(
      executed.commerce_proof
    );

  assert.equal(
    proofCheck.signature_status,
    "VERIFIED"
  );

  let replayCode = null;

  try {
    await runtime.executeIntent({
      intent_id:
        create.intent.intent_id,
      request:
        request(),
      transaction_hash:
        TX_HASH
    });
  } catch (error) {
    replayCode =
      error && error.code;
  }

  assert.equal(
    replayCode,
    "ALREADY_CONSUMED"
  );

  let escalationCode = null;

  try {
    await runtime.executeIntent({
      intent_id:
        create.intent.intent_id,
      request:
        request(),
      transaction_hash:
        TX_HASH,
      assurance:
        "VALIDATED"
    });
  } catch (error) {
    escalationCode =
      error && error.code;
  }

  assert.equal(
    escalationCode,
    "CALLER_ASSURANCE_ELEVATION_FORBIDDEN"
  );

  const apiRuntime =
    createHostedAgentCommerceRuntime({
      intentStore: {
        async createOnce() {
          return true;
        },
        async get() {
          return null;
        }
      },
      consumeOnce,
      signer:
        makeSigner(),
      now:
        () =>
          "2026-09-15T00:05:00.000Z"
    });

  const getIntentRes =
    makeResponse();

  await createIntentHandler(
    () => apiRuntime
  )(
    {
      method: "GET"
    },
    getIntentRes
  );

  assert.equal(
    getIntentRes.statusCode,
    200
  );

  const getExecuteRes =
    makeResponse();

  await createExecuteHandler(
    () => apiRuntime
  )(
    {
      method: "GET"
    },
    getExecuteRes
  );

  assert.equal(
    getExecuteRes.statusCode,
    200
  );

  assert.equal(
    getExecuteRes.body.assurance,
    "OBSERVED"
  );

  assert.equal(
    getExecuteRes.body.commerce_verified,
    false
  );

  console.log(
    "COLOSSEUM_HOSTED_AGENT_COMMERCE_TEST=PASS"
  );
  console.log(
    "INTENT_CREATE_ONCE=PASS"
  );
  console.log(
    "EXACT_REQUEST_PAYMENT_BINDING=PASS"
  );
  console.log(
    "REGISTERED_SERVICE_EXECUTION=PASS"
  );
  console.log(
    "SIGNED_COMMERCE_PROOF=PASS"
  );
  console.log(
    "REPLAY_REJECT=PASS"
  );
  console.log(
    "ASSURANCE_ELEVATION_REJECT=PASS"
  );
  console.log(
    "API_GET_SURFACE=PASS"
  );
}

main().catch(error => {
  console.error(
    error && error.stack
      ? error.stack
      : error
  );
  process.exit(1);
});