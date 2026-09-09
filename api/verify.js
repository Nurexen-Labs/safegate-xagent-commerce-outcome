"use strict";

const {
  describePublicVerify,
  verifyPublicRequest
} = require("../lib/public-verify");

const {
  verifyCommerceProof
} = require("../lib/commerce-proof-verifier");

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json(
      describePublicVerify()
    );
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");

    return res.status(405).json({
      ok: false,
      error: {
        code: "METHOD_NOT_ALLOWED"
      }
    });
  }

  try {
    const result = await verifyPublicRequest(
      req.body,
      {
        verifyCommerceProof
      }
    );

    return res.status(200).json(result);
  } catch (error) {
    const code = String(
      error.code || "VERIFICATION_FAILED"
    );

    const upstreamErrors = new Set([
      "BASE_RPC_TIMEOUT",
      "BASE_RPC_HTTP_ERROR",
      "BASE_RPC_ERROR"
    ]);

    const statusCode =
      Number(error.statusCode) ||
      (upstreamErrors.has(code) ? 502 : 400);

    return res.status(statusCode).json({
      ok: false,
      error: {
        code,
        message: String(
          error.message ||
          "SafeGate verification failed."
        )
      }
    });
  }
};