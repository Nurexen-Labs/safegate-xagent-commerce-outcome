"use strict";

const {
  verifyPublicRequest
} = require("./public-verify");

const PROTOCOL_VERSION = "2026-07-28";
const SERVER_NAME = "safegate-assurance";
const SERVER_VERSION = "0.1.0";

const TOOL_NAME =
  "safegate_verify_commerce";

function serverMeta() {
  return {
    "io.modelcontextprotocol/serverInfo": {
      name: SERVER_NAME,
      version: SERVER_VERSION
    }
  };
}

function completeResult(payload) {
  return {
    ...payload,
    resultType: "complete",
    _meta: serverMeta()
  };
}

function rpcResult(id, result) {
  return {
    jsonrpc: "2.0",
    id,
    result
  };
}

function rpcError(
  id,
  code,
  message,
  data
) {
  const error = {
    code,
    message
  };

  if (data !== undefined) {
    error.data = data;
  }

  return {
    jsonrpc: "2.0",
    id: id === undefined ? null : id,
    error
  };
}

function getHeader(headers, name) {
  if (!headers || typeof headers !== "object") {
    return "";
  }

  const wanted = String(name).toLowerCase();

  for (const key of Object.keys(headers)) {
    if (
      String(key).toLowerCase() === wanted
    ) {
      return String(headers[key] || "");
    }
  }

  return "";
}

function validateEnvelope(body) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    body.jsonrpc !== "2.0" ||
    typeof body.method !== "string" ||
    body.id === undefined ||
    body.id === null
  ) {
    return {
      ok: false,
      response: {
        httpStatus: 400,
        body: rpcError(
          null,
          -32600,
          "Invalid Request"
        )
      }
    };
  }

  return {
    ok: true
  };
}

function validateModernHeaders(
  body,
  headers
) {
  const protocol =
    getHeader(
      headers,
      "MCP-Protocol-Version"
    );

  const method =
    getHeader(
      headers,
      "Mcp-Method"
    );

  if (
    protocol !== PROTOCOL_VERSION ||
    method !== body.method
  ) {
    return {
      ok: false,
      response: {
        httpStatus: 400,
        body: rpcError(
          body.id,
          -32020,
          "HeaderMismatch",
          {
            expectedProtocol:
              PROTOCOL_VERSION,
            expectedMethod:
              body.method
          }
        )
      }
    };
  }

  if (body.method === "tools/call") {
    const name =
      getHeader(
        headers,
        "Mcp-Name"
      );

    const bodyName =
      String(
        body.params &&
        body.params.name
          ? body.params.name
          : ""
      );

    if (
      !name ||
      name !== bodyName
    ) {
      return {
        ok: false,
        response: {
          httpStatus: 400,
          body: rpcError(
            body.id,
            -32020,
            "HeaderMismatch",
            {
              expectedName:
                bodyName
            }
          )
        }
      };
    }
  }

  return {
    ok: true
  };
}

function toolDefinition() {
  return {
    name: TOOL_NAME,

    title:
      "SafeGate Commerce Verification",

    description:
      "Verify a SafeGate commerce attestation and its bound payment evidence. The current public adapter verifies SafeGate Ed25519 evidence plus Base Mainnet USDC payment binding. Fulfillment remains CLAIMED unless stronger independent evidence is available.",

    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: [
        "attestation"
      ],
      properties: {
        attestation: {
          type: "object",
          description:
            "SAFEGATE_COMMERCE_ATTESTATION_V1 signed attestation."
        }
      }
    }
  };
}

function discoverResult() {
  return completeResult({
    supportedVersions: [
      PROTOCOL_VERSION
    ],

    capabilities: {
      tools: {}
    },

    instructions:
      "Use safegate_verify_commerce to verify payment-bound SafeGate commerce evidence. Do not interpret CLAIMED as independently validated.",

    ttlMs: 60000,
    cacheScope: "public"
  });
}

function toolsListResult() {
  return completeResult({
    tools: [
      toolDefinition()
    ],

    ttlMs: 60000,
    cacheScope: "public"
  });
}

function toolErrorResult(
  code,
  message
) {
  return completeResult({
    isError: true,

    content: [
      {
        type: "text",
        text:
          `SafeGate verification failed: ${code}`
      }
    ],

    structuredContent: {
      ok: false,
      error: {
        code,
        message
      }
    }
  });
}

async function callVerifyTool(
  body,
  dependencies
) {
  const params =
    body.params &&
    typeof body.params === "object"
      ? body.params
      : {};

  if (params.name !== TOOL_NAME) {
    return {
      httpStatus: 200,
      body: rpcError(
        body.id,
        -32602,
        "Invalid params",
        {
          reason:
            "Unknown SafeGate tool."
        }
      )
    };
  }

  const args =
    params.arguments &&
    typeof params.arguments === "object" &&
    !Array.isArray(params.arguments)
      ? params.arguments
      : {};

  if (
    !args.attestation ||
    typeof args.attestation !== "object" ||
    Array.isArray(args.attestation)
  ) {
    return {
      httpStatus: 200,
      body: rpcError(
        body.id,
        -32602,
        "Invalid params",
        {
          reason:
            "attestation is required."
        }
      )
    };
  }

  const verifier =
    dependencies &&
    dependencies.verifyCommerceProof;

  if (typeof verifier !== "function") {
    return {
      httpStatus: 500,
      body: rpcError(
        body.id,
        -32603,
        "Internal error"
      )
    };
  }

  try {
    const verification =
      await verifyPublicRequest(
        {
          schema:
            "SAFEGATE_VERIFY_REQUEST_V1",

          verificationType:
            "COMMERCE_OUTCOME",

          proof: {
            format:
              "SAFEGATE_COMMERCE_ATTESTATION_V1",

            attestation:
              args.attestation
          }
        },
        {
          verifyCommerceProof:
            verifier
        }
      );

    const summary = {
      decision:
        verification.decision,

      assurance:
        verification.assurance.level,

      commerce_verified:
        verification.commerce_verified,

      chain_id:
        verification.verification.chain_id,

      asset:
        verification.verification.asset,

      transaction_hash:
        verification.verification.transaction_hash
    };

    return {
      httpStatus: 200,

      body: rpcResult(
        body.id,
        completeResult({
          isError: false,

          content: [
            {
              type: "text",
              text:
                JSON.stringify(summary)
            }
          ],

          structuredContent:
            verification
        })
      )
    };

  } catch (error) {
    const code =
      String(
        error &&
        error.code
          ? error.code
          : "VERIFICATION_FAILED"
      );

    const message =
      String(
        error &&
        error.message
          ? error.message
          : "SafeGate verification failed."
      );

    return {
      httpStatus: 200,

      body: rpcResult(
        body.id,
        toolErrorResult(
          code,
          message
        )
      )
    };
  }
}

async function handleMcpRequest(
  body,
  headers,
  dependencies = {}
) {
  const envelope =
    validateEnvelope(body);

  if (!envelope.ok) {
    return envelope.response;
  }

  const headerCheck =
    validateModernHeaders(
      body,
      headers
    );

  if (!headerCheck.ok) {
    return headerCheck.response;
  }

  if (
    body.method ===
    "server/discover"
  ) {
    return {
      httpStatus: 200,

      body: rpcResult(
        body.id,
        discoverResult()
      )
    };
  }

  if (
    body.method ===
    "tools/list"
  ) {
    return {
      httpStatus: 200,

      body: rpcResult(
        body.id,
        toolsListResult()
      )
    };
  }

  if (
    body.method ===
    "tools/call"
  ) {
    return callVerifyTool(
      body,
      dependencies
    );
  }

  return {
    httpStatus: 200,

    body: rpcError(
      body.id,
      -32601,
      "Method not found"
    )
  };
}

module.exports = {
  PROTOCOL_VERSION,
  SERVER_NAME,
  SERVER_VERSION,
  TOOL_NAME,
  toolDefinition,
  handleMcpRequest
};