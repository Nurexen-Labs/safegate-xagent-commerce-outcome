"use strict";

const assert = require("node:assert/strict");
const {
  BASE_USDC,
  TRANSFER_TOPIC,
  verifyBaseUsdcTransfer
} = require("../lib/base-usdc");

function topic(address) {
  return "0x" + "0".repeat(24) + address.toLowerCase().replace(/^0x/, "");
}

const sender = "0x" + "1".repeat(40);
const receiver = "0x" + "2".repeat(40);
const txHash = "0x" + "a".repeat(64);
const blockNumber = "0x1234";
const blockTimestamp = 1789430700;
const calls = [];

const receipt = {
  status: "0x1",
  transactionHash: txHash,
  blockNumber,
  logs: [{
    address: BASE_USDC,
    topics: [TRANSFER_TOPIC, topic(sender), topic(receiver)],
    data: "0x3e8"
  }]
};

const originalFetch = globalThis.fetch;

globalThis.fetch = async (_url, options) => {
  const request = JSON.parse(options.body);
  calls.push(request.method);

  let result;
  if (request.method === "eth_chainId") {
    result = "0x2105";
  } else if (request.method === "eth_getTransactionReceipt") {
    result = receipt;
  } else if (request.method === "eth_getBlockByNumber") {
    assert.deepEqual(request.params, [blockNumber, false]);
    result = {
      number: blockNumber,
      timestamp: "0x" + blockTimestamp.toString(16)
    };
  } else {
    throw new Error("UNEXPECTED_RPC_METHOD=" + request.method);
  }

  return {
    ok: true,
    async json() {
      return { jsonrpc: "2.0", id: 1, result };
    }
  };
};

(async () => {
  try {
    const verified = await verifyBaseUsdcTransfer(
      {
        transactionHash: txHash,
        paymentSender: sender,
        merchantReceiver: receiver,
        amountBaseUnits: "1000"
      },
      { rpcUrl: "https://rpc.test.invalid" }
    );

    assert.deepEqual(
      calls,
      ["eth_chainId", "eth_getTransactionReceipt", "eth_getBlockByNumber"]
    );

    assert.equal(
      verified.block_timestamp,
      new Date(blockTimestamp * 1000).toISOString()
    );

    console.log("BASE_USDC_BLOCK_TIMESTAMP_TEST=PASS");
  } finally {
    globalThis.fetch = originalFetch;
  }
})().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
