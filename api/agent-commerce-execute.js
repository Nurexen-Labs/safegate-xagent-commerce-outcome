"use strict";

const {
  createHostedAgentCommerceRuntime,
  httpStatusForError
} = require(
  "../lib/colosseum-hosted-agent-commerce"
);

function createHandler(
  runtimeFactory =
    () =>
      createHostedAgentCommerceRuntime()
) {
  return async function handler(req, res) {
    if (req.method === "GET") {
      return res.status(200).json({
        ok: true,
        capability:
          "safegate_hosted_agent_commerce_execute",
        version: "1.0.0",
        method: "POST",
        chain_id: 8453,
        asset: "USDC",
        assurance: "OBSERVED",
        independently_validated: false,
        commerce_verified: false
      });
    }

    if (req.method !== "POST") {
      res.setHeader(
        "Allow",
        "GET, POST"
      );

      return res.status(405).json({
        ok: false,
        error: {
          code: "METHOD_NOT_ALLOWED"
        }
      });
    }

    try {
      const runtime =
        runtimeFactory();

      const result =
        await runtime.executeIntent(
          req.body || {}
        );

      return res
        .status(200)
        .json(result);

    } catch (error) {
      return res
        .status(
          httpStatusForError(error)
        )
        .json({
          ok: false,
          error: {
            code:
              String(
                error &&
                error.code
                  ? error.code
                  : "AGENT_COMMERCE_EXECUTION_FAILED"
              ),
            message:
              String(
                error &&
                error.message
                  ? error.message
                  : "Agent commerce execution failed."
              )
          }
        });
    }
  };
}

const handler = createHandler();

module.exports = handler;
module.exports.createHandler =
  createHandler;