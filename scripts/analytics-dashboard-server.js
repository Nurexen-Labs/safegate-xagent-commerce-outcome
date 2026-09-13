"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const {
  buildDashboardPayload
} = require("../lib/analytics-dashboard-model");

const ROOT = path.resolve(__dirname, "..");
const WEB = path.join(ROOT, "dashboard");
const FIXTURE = path.join(
  ROOT,
  "fixtures",
  "analytics-demo-events.json"
);

const DATA_MODE = "SYNTHETIC_DEMO";

function readEvents() {
  return JSON.parse(
    fs.readFileSync(
      FIXTURE,
      "utf8"
    )
  );
}

function buildPayload(range) {
  return buildDashboardPayload(
    readEvents(),
    DATA_MODE,
    { range }
  );
}

function contentType(file) {
  switch (
    path.extname(file).toLowerCase()
  ) {
    case ".html":
      return "text/html; charset=utf-8";

    case ".css":
      return "text/css; charset=utf-8";

    case ".js":
      return "application/javascript; charset=utf-8";

    case ".json":
      return "application/json; charset=utf-8";

    case ".svg":
      return "image/svg+xml";

    default:
      return "application/octet-stream";
  }
}

function sendJson(
  response,
  status,
  body
) {
  response.writeHead(
    status,
    {
      "Content-Type":
        "application/json; charset=utf-8",

      "Cache-Control":
        "no-store",

      "X-Content-Type-Options":
        "nosniff",

      "Referrer-Policy":
        "no-referrer"
    }
  );

  response.end(
    JSON.stringify(body)
  );
}

const server = http.createServer(
  (request, response) => {
    let url;

    try {
      url = new URL(
        request.url,
        "http://127.0.0.1"
      );
    } catch {
      return sendJson(
        response,
        400,
        {
          ok: false,
          error: "INVALID_URL"
        }
      );
    }

    if (
      url.pathname ===
      "/api/analytics"
    ) {
      const range =
        String(
          url.searchParams.get(
            "range"
          ) || "all"
        ).toLowerCase();

      try {
        return sendJson(
          response,
          200,
          buildPayload(range)
        );
      } catch (error) {
        return sendJson(
          response,
          Number(
            error.statusCode
          ) || 500,
          {
            ok: false,

            error:
              error.code ||
              "ANALYTICS_PAYLOAD_ERROR"
          }
        );
      }
    }

    let relative;

    try {
      relative =
        url.pathname === "/"
          ? "index.html"
          : decodeURIComponent(
              url.pathname.slice(1)
            );
    } catch {
      return sendJson(
        response,
        400,
        {
          ok: false,
          error: "INVALID_PATH"
        }
      );
    }

    const file =
      path.resolve(
        WEB,
        relative
      );

    const allowedRoot =
      `${WEB}${path.sep}`;

    if (
      file !==
        path.join(
          WEB,
          "index.html"
        ) &&
      !file.startsWith(
        allowedRoot
      )
    ) {
      return sendJson(
        response,
        403,
        {
          ok: false,
          error: "PATH_FORBIDDEN"
        }
      );
    }

    if (
      !fs.existsSync(file) ||
      !fs.statSync(file).isFile()
    ) {
      return sendJson(
        response,
        404,
        {
          ok: false,
          error: "NOT_FOUND"
        }
      );
    }

    response.writeHead(
      200,
      {
        "Content-Type":
          contentType(file),

        "Cache-Control":
          "no-store",

        "X-Content-Type-Options":
          "nosniff",

        "Referrer-Policy":
          "no-referrer"
      }
    );

    fs
      .createReadStream(file)
      .pipe(response);
  }
);

const PORT =
  Number(
    process.env.PORT ||
    4173
  );

server.listen(
  PORT,
  "127.0.0.1",
  () => {
    console.log(
      `SAFEGATE_COMMERCE_INTELLIGENCE=http://127.0.0.1:${PORT}`
    );

    console.log(
      `DATA_MODE=${DATA_MODE}`
    );
  }
);