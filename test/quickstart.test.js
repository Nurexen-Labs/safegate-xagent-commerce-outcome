"use strict";

const assert = require("assert");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const example =
  path.resolve(
    __dirname,
    "../packages/sdk/examples/verify-commerce.cjs"
  );

const tempDir =
  fs.mkdtempSync(
    path.join(
      os.tmpdir(),
      "safegate-quickstart-"
    )
  );

const proofPath =
  path.join(
    tempDir,
    "commerce-attestation.json"
  );

fs.writeFileSync(
  proofPath,
  JSON.stringify(
    {
      payload: {
        schema:
          "SAFEGATE_COMMERCE_ATTESTATION_V1",
        chainId:
          8453
      },
      signature:
        "QUICKSTART_TEST"
    }
  )
);

const server =
  http.createServer(
    (req, res) => {
      if (
        req.method !== "POST" ||
        req.url !== "/v1/verify"
      ) {
        res.statusCode = 404;
        res.end(
          JSON.stringify({
            error: {
              code:
                "NOT_FOUND"
            }
          })
        );
        return;
      }

      let raw = "";

      req.on(
        "data",
        chunk => {
          raw += chunk;
        }
      );

      req.on(
        "end",
        () => {
          const body =
            JSON.parse(raw);

          assert.strictEqual(
            body.schema,
            "SAFEGATE_VERIFY_REQUEST_V1"
          );

          assert.strictEqual(
            body.verificationType,
            "COMMERCE_OUTCOME"
          );

          assert.strictEqual(
            body.proof.format,
            "SAFEGATE_COMMERCE_ATTESTATION_V1"
          );

          res.statusCode = 200;

          res.setHeader(
            "content-type",
            "application/json"
          );

          res.end(
            JSON.stringify({
              ok: true,
              capability:
                "safegate_verify",
              version:
                "1.0.0",
              decision:
                "PAYMENT_AND_ATTESTATION_VERIFIED",
              commerce_verified:
                false,
              assurance: {
                level:
                  "CLAIMED"
              },
              adapter: {
                id:
                  "BASE_MAINNET_USDC_ATTESTATION_V1",
                chain_id:
                  8453,
                asset:
                  "USDC"
              },
              verification: {
                chain_id:
                  8453,
                asset:
                  "USDC"
              }
            })
          );
        }
      );
    }
  );

server.listen(
  0,
  "127.0.0.1",
  () => {
    const port =
      server.address().port;

    const child =
      spawn(
        process.execPath,
        [
          example,
          proofPath
        ],
        {
          cwd:
            tempDir,

          env: {
            ...process.env,
            SAFEGATE_BASE_URL:
              `http://127.0.0.1:${port}`
          },

          stdio: [
            "ignore",
            "pipe",
            "pipe"
          ]
        }
      );

    let stdout = "";
    let stderr = "";

    child.stdout.on(
      "data",
      data => {
        stdout += data;
      }
    );

    child.stderr.on(
      "data",
      data => {
        stderr += data;
      }
    );

    child.on(
      "close",
      code => {
        try {
          assert.strictEqual(
            code,
            0,
            stderr
          );

          assert.match(
            stdout,
            /SafeGate verification PASS/
          );

          assert.match(
            stdout,
            /decision:\s+PAYMENT_AND_ATTESTATION_VERIFIED/
          );

          assert.match(
            stdout,
            /assurance:\s+CLAIMED/
          );

          assert.match(
            stdout,
            /commerce_verified:\s+false/
          );

          assert.match(
            stdout,
            /chain_id:\s+8453/
          );

          assert.match(
            stdout,
            /asset:\s+USDC/
          );

          console.log(
            "QUICKSTART_REAL_SDK_FLOW_TEST=PASS"
          );

          console.log(
            "QUICKSTART_ASSURANCE_SEMANTICS_TEST=PASS"
          );

          console.log(
            "QUICKSTART_NO_SECRET_REQUIRED_TEST=PASS"
          );

          process.exitCode = 0;

        } catch (error) {
          console.error(error);
          process.exitCode = 1;

        } finally {
          server.close();

          fs.rmSync(
            tempDir,
            {
              recursive: true,
              force: true
            }
          );
        }
      }
    );
  }
);