"use strict";

const {
  describeMiddleware
} = require("../lib/commerce-middleware");

module.exports = async function handler(
  req,
  res
) {
  if (req.method === "GET") {
    return res
      .status(200)
      .json(
        describeMiddleware()
      );
  }

  res.setHeader(
    "Allow",
    "GET"
  );

  return res
    .status(405)
    .json({
      ok: false,
      error: {
        code:
          "HOSTED_ARBITRARY_PROXY_DISABLED",
        message:
          "SafeGate v1 middleware is server-side and embedded. Hosted proxy mode will accept registered upstream identifiers only."
      }
    });
};