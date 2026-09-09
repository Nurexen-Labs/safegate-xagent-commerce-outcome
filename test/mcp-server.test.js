"use strict";

const assert = require("assert");

const {
  PROTOCOL_VERSION,
  TOOL_NAME,
  handleMcpRequest
} = require("../lib/mcp-server");

function headers(
  method,
  name
) {
  const value = {
    "mcp-protocol-version":
      PROTOCOL_VERSION,

    "mcp-method":
      method
  };

  if (name) {
    value["mcp-name"] =
      name;
  }

  return value;
}

const meta = {
  "io.modelcontextprotocol/protocolVersion":
    PROTOCOL_VERSION,

  "io.modelcontextprotocol/clientInfo": {
    name: "safegate-test-client",
    version: "1.0.0"
  },

  "io.modelcontextprotocol/clientCapabilities":
    {}
};

async function fakeVerifyCommerceProof(
  attestation
) {
  assert.ok(
    attestation
  );

  return {
    ok: true,

    payment_status:
      "PAYMENT_VERIFIED",

    attestation_status:
      "VALID",

    fulfillment_status:
      "FULFILLMENT_COMPLETED",

    evidence_status:
      "EVIDENCE_CREATED",

    request_id:
      "SG-EVM-REQ-MCP123456789ABC",

    order_reference:
      "SG-ORDER-1234567890ABCDEF",

    safegate_transaction:
      "SG-TX-1234567890ABCDEF12345678",

    transaction_hash:
      "0x" + "a".repeat(64),

    chain_id:
      8453,

    asset:
      "USDC",

    amount_base_units:
      "100000",

    payment_sender:
      "0x" + "1".repeat(40),

    merchant_receiver:
      "0x" + "2".repeat(40),

    receipt_reference:
      "SG-TX-TEST-RCPT",

    evidence_reference:
      "SG-TX-TEST-EVID",

    proof_reference:
      "SG-TX-TEST-PROOF"
  };
}

(async () => {

  // DISCOVER
  const discover =
    await handleMcpRequest(
      {
        jsonrpc: "2.0",
        id: 1,
        method:
          "server/discover",
        params: {
          _meta: meta
        }
      },
      headers(
        "server/discover"
      )
    );

  assert.strictEqual(
    discover.httpStatus,
    200
  );

  assert.strictEqual(
    discover.body.result.resultType,
    "complete"
  );

  assert.ok(
    discover.body.result
      .supportedVersions
      .includes(
        PROTOCOL_VERSION
      )
  );

  assert.strictEqual(
    discover.body.result.ttlMs,
    60000
  );

  assert.strictEqual(
    discover.body.result.cacheScope,
    "public"
  );

  assert.strictEqual(
    discover.body.result
      ._meta[
        "io.modelcontextprotocol/serverInfo"
      ].name,
    "safegate-assurance"
  );

  // TOOLS LIST
  const list =
    await handleMcpRequest(
      {
        jsonrpc: "2.0",
        id: 2,
        method:
          "tools/list",
        params: {
          _meta: meta
        }
      },
      headers(
        "tools/list"
      )
    );

  assert.strictEqual(
    list.httpStatus,
    200
  );

  assert.strictEqual(
    list.body.result.tools.length,
    1
  );

  assert.strictEqual(
    list.body.result.tools[0].name,
    TOOL_NAME
  );

  assert.strictEqual(
    list.body.result.ttlMs,
    60000
  );

  assert.strictEqual(
    list.body.result.cacheScope,
    "public"
  );

  // TOOL CALL
  const call =
    await handleMcpRequest(
      {
        jsonrpc: "2.0",
        id: 3,
        method:
          "tools/call",

        params: {
          name:
            TOOL_NAME,

          arguments: {
            attestation: {
              payload: {
                chainId:
                  8453,

                asset:
                  "USDC"
              },

              signature:
                "TEST"
            }
          },

          _meta:
            meta
        }
      },

      headers(
        "tools/call",
        TOOL_NAME
      ),

      {
        verifyCommerceProof:
          fakeVerifyCommerceProof
      }
    );

  assert.strictEqual(
    call.httpStatus,
    200
  );

  assert.strictEqual(
    call.body.result.isError,
    false
  );

  assert.strictEqual(
    call.body.result.resultType,
    "complete"
  );

  assert.strictEqual(
    call.body.result
      .structuredContent
      .capability,
    "safegate_verify"
  );

  assert.strictEqual(
    call.body.result
      .structuredContent
      .assurance
      .level,
    "CLAIMED"
  );

  assert.strictEqual(
    call.body.result
      .structuredContent
      .commerce_verified,
    false
  );

  // HEADER MISMATCH
  const mismatch =
    await handleMcpRequest(
      {
        jsonrpc: "2.0",
        id: 4,
        method:
          "tools/list",
        params: {
          _meta: meta
        }
      },
      headers(
        "tools/call"
      )
    );

  assert.strictEqual(
    mismatch.httpStatus,
    400
  );

  assert.strictEqual(
    mismatch.body.error.code,
    -32020
  );

  // MCP 2026 SHOULD NOT USE INITIALIZE
  const legacyInitialize =
    await handleMcpRequest(
      {
        jsonrpc: "2.0",
        id: 5,
        method:
          "initialize",
        params: {
          _meta: meta
        }
      },
      headers(
        "initialize"
      )
    );

  assert.strictEqual(
    legacyInitialize.body.error.code,
    -32601
  );

  console.log(
    "MCP_DISCOVER_TEST=PASS"
  );

  console.log(
    "MCP_TOOLS_LIST_TEST=PASS"
  );

  console.log(
    "MCP_VERIFY_TOOL_TEST=PASS"
  );

  console.log(
    "MCP_HEADER_SECURITY_TEST=PASS"
  );

  console.log(
    "MCP_STATELESS_2026_TEST=PASS"
  );

})().catch(error => {
  console.error(error);
  process.exit(1);
});