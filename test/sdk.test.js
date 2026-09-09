"use strict";

const assert = require("assert");

const {
  SDK_VERSION,
  MCP_PROTOCOL_VERSION,
  SafeGateError,
  SafeGateClient
} = require("../packages/sdk");

function makeResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(payload);
    }
  };
}

(async () => {
  const calls = [];

  const fakeFetch = async (url, options = {}) => {
    calls.push({ url, options });

    if (url.endsWith("/v1/verify") && options.method === "GET") {
      return makeResponse(200, {
        ok: true,
        capability: "safegate_verify"
      });
    }

    if (url.endsWith("/v1/verify") && options.method === "POST") {
      const body = JSON.parse(options.body);

      assert.strictEqual(
        body.schema,
        "SAFEGATE_VERIFY_REQUEST_V1"
      );

      assert.strictEqual(
        body.proof.format,
        "SAFEGATE_COMMERCE_ATTESTATION_V1"
      );

      return makeResponse(200, {
        ok: true,
        capability: "safegate_verify",
        version: "1.0.0",
        decision: "PAYMENT_AND_ATTESTATION_VERIFIED",
        commerce_verified: false,
        assurance: {
          level: "CLAIMED"
        },
        adapter: {
          id: "BASE_MAINNET_USDC_ATTESTATION_V1",
          chain_id: 8453,
          asset: "USDC"
        },
        verification: {
          chain_id: 8453,
          asset: "USDC"
        }
      });
    }

    if (url.endsWith("/v1/middleware")) {
      return makeResponse(200, {
        ok: true,
        capability: "safegate_observed_middleware",
        assurance: "OBSERVED"
      });
    }

    if (url.endsWith("/mcp")) {
      const body = JSON.parse(options.body);

      assert.strictEqual(
        options.headers["MCP-Protocol-Version"],
        MCP_PROTOCOL_VERSION
      );

      assert.strictEqual(
        options.headers["Mcp-Method"],
        body.method
      );

      if (body.method === "server/discover") {
        return makeResponse(200, {
          jsonrpc: "2.0",
          id: body.id,
          result: {
            resultType: "complete",
            supportedVersions: [
              MCP_PROTOCOL_VERSION
            ]
          }
        });
      }

      if (body.method === "tools/list") {
        return makeResponse(200, {
          jsonrpc: "2.0",
          id: body.id,
          result: {
            resultType: "complete",
            tools: [
              {
                name: "safegate_verify_commerce"
              }
            ]
          }
        });
      }

      if (body.method === "tools/call") {
        assert.strictEqual(
          options.headers["Mcp-Name"],
          "safegate_verify_commerce"
        );

        return makeResponse(200, {
          jsonrpc: "2.0",
          id: body.id,
          result: {
            resultType: "complete",
            isError: false,
            structuredContent: {
              ok: true,
              capability: "safegate_verify",
              decision: "PAYMENT_AND_ATTESTATION_VERIFIED",
              assurance: {
                level: "CLAIMED"
              },
              commerce_verified: false,
              verification: {
                chain_id: 8453,
                asset: "USDC"
              }
            }
          }
        });
      }
    }

    return makeResponse(404, {
      error: {
        code: "NOT_FOUND",
        message: "Not found."
      }
    });
  };

  const client = new SafeGateClient({
    baseUrl: "https://example.safegate.test",
    fetch: fakeFetch,
    timeoutMs: 5000
  });

  assert.strictEqual(SDK_VERSION, "0.3.0");

  const verifyCapability =
    await client.getVerifyCapability();

  assert.strictEqual(
    verifyCapability.capability,
    "safegate_verify"
  );

  const attestation = {
    payload: {
      schema: "SAFEGATE_COMMERCE_ATTESTATION_V1"
    },
    signature: "TEST"
  };

  const verified =
    await client.verifyCommerce(attestation);

  assert.strictEqual(
    verified.decision,
    "PAYMENT_AND_ATTESTATION_VERIFIED"
  );

  assert.strictEqual(
    verified.assurance.level,
    "CLAIMED"
  );

  assert.strictEqual(
    verified.commerce_verified,
    false
  );

  const middleware =
    await client.getMiddlewareCapability();

  assert.strictEqual(
    middleware.assurance,
    "OBSERVED"
  );

  const discovery =
    await client.mcpDiscover();

  assert.ok(
    discovery.supportedVersions.includes(
      MCP_PROTOCOL_VERSION
    )
  );

  const tools =
    await client.mcpListTools();

  assert.strictEqual(
    tools.tools[0].name,
    "safegate_verify_commerce"
  );

  const mcpVerified =
    await client.mcpVerifyCommerce(attestation);

  assert.strictEqual(
    mcpVerified.decision,
    "PAYMENT_AND_ATTESTATION_VERIFIED"
  );

  assert.strictEqual(
    mcpVerified.assurance.level,
    "CLAIMED"
  );

  assert.strictEqual(
    mcpVerified.commerce_verified,
    false
  );

  assert.ok(calls.length >= 6);

  assert.throws(
    () => new SafeGateClient({
      baseUrl: "http://unsafe.example"
    }),
    error =>
      error instanceof SafeGateError &&
      error.code === "HTTPS_REQUIRED"
  );

  const failingClient = new SafeGateClient({
    baseUrl: "https://example.safegate.test",
    fetch: async () =>
      makeResponse(422, {
        error: {
          code: "UNSUPPORTED_VERIFICATION_ADAPTER",
          message: "Unsupported."
        }
      })
  });

  await assert.rejects(
    () => failingClient.verifyCommerce(attestation),
    error =>
      error instanceof SafeGateError &&
      error.code === "UNSUPPORTED_VERIFICATION_ADAPTER" &&
      error.status === 422
  );

  console.log("SDK_VERIFY_API_TEST=PASS");
  console.log("SDK_MIDDLEWARE_DISCOVERY_TEST=PASS");
  console.log("SDK_MCP_DISCOVERY_TEST=PASS");
  console.log("SDK_MCP_VERIFY_TOOL_TEST=PASS");
  console.log("SDK_HTTPS_SAFETY_TEST=PASS");
  console.log("SDK_ERROR_MAPPING_TEST=PASS");
})().catch(error => {
  console.error(error);
  process.exit(1);
});