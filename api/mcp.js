"use strict";

const {
  handleMcpRequest
} = require("../lib/mcp-server");

const {
  verifyCommerceProof
} = require("../lib/commerce-proof-verifier");

module.exports = async function handler(
  req,
  res
) {
  if (req.method !== "POST") {
    res.setHeader(
      "Allow",
      "POST"
    );

    return res
      .status(405)
      .json({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32600,
          message:
            "MCP Streamable HTTP accepts POST requests."
        }
      });
  }

  try {
    const result =
      await handleMcpRequest(
        req.body,
        req.headers,
        {
          verifyCommerceProof
        }
      );

    return res
      .status(result.httpStatus)
      .json(result.body);

  } catch (_) {
    return res
      .status(500)
      .json({
        jsonrpc: "2.0",
        id:
          req.body &&
          req.body.id !== undefined
            ? req.body.id
            : null,

        error: {
          code: -32603,
          message:
            "Internal error"
        }
      });
  }
};