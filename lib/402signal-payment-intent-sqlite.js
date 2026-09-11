"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

let DatabaseSync;

try {
  ({ DatabaseSync } = require("node:sqlite"));
} catch {
  const error =
    new Error(
      "402Signal durable SQLite store requires node:sqlite."
    );

  error.code =
    "NODE_SQLITE_REQUIRED";

  throw error;
}

const {
  canonicalJson
} = require("./canonical-json");

const {
  SCHEMA
} = require("./402signal-payment-intent");


const MAX_RECORD_BYTES =
  256 * 1024;


function fail(code, message, cause) {
  const error =
    new Error(message || code);

  error.code =
    code;

  if (cause) {
    error.cause =
      cause;
  }

  throw error;
}


function isObject(value) {
  return !!value &&
    typeof value === "object" &&
    !Array.isArray(value);
}


function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(
      String(value),
      "utf8"
    )
    .digest("hex");
}


function clone(value) {
  return JSON.parse(
    JSON.stringify(value)
  );
}


function rejectSensitiveMaterial(value) {
  const forbiddenKey =
    /^(private[_-]?key|private[_-]?key[_-]?pem|mnemonic|seed|seed[_-]?phrase|payment[_-]?header|authorization[_-]?header|raw[_-]?signature)$/i;

  function walk(node) {
    if (
      !node ||
      typeof node !== "object"
    ) {
      return;
    }

    if (Array.isArray(node)) {
      for (const child of node) {
        walk(child);
      }

      return;
    }

    for (
      const [key, child] of
      Object.entries(node)
    ) {
      if (
        forbiddenKey.test(key)
      ) {
        fail(
          "SENSITIVE_PAYMENT_MATERIAL_FORBIDDEN"
        );
      }

      walk(child);
    }
  }

  walk(value);

  const text =
    canonicalJson(value);

  if (
    text.includes(
      "BEGIN PRIVATE KEY"
    ) ||
    text.includes(
      "BEGIN OPENSSH PRIVATE KEY"
    )
  ) {
    fail(
      "SENSITIVE_PAYMENT_MATERIAL_FORBIDDEN"
    );
  }
}


function validateIntent(intent) {
  if (
    !isObject(intent) ||
    intent.schema !== SCHEMA
  ) {
    fail(
      "INVALID_PAYMENT_INTENT_RECORD"
    );
  }

  if (
    typeof intent.intent_id !==
      "string" ||
    !/^SG-PAY-INTENT-[A-F0-9]{32}$/
      .test(intent.intent_id)
  ) {
    fail(
      "INVALID_PAYMENT_INTENT_ID"
    );
  }

  if (
    typeof intent.payment_fingerprint !==
      "string" ||
    !/^[a-f0-9]{64}$/
      .test(
        intent.payment_fingerprint
      )
  ) {
    fail(
      "INVALID_PAYMENT_FINGERPRINT"
    );
  }

  if (
    !Number.isSafeInteger(
      intent.revision
    ) ||
    intent.revision < 0
  ) {
    fail(
      "INVALID_PAYMENT_INTENT_REVISION"
    );
  }

  if (
    typeof intent.state !==
      "string" ||
    !intent.state
  ) {
    fail(
      "INVALID_PAYMENT_INTENT_STATE"
    );
  }

  if (
    !Array.isArray(
      intent.history
    ) ||
    intent.history.length < 1
  ) {
    fail(
      "INVALID_PAYMENT_INTENT_HISTORY"
    );
  }

  const latest =
    intent.history[
      intent.history.length - 1
    ];

  if (
    !isObject(latest) ||
    latest.revision !==
      intent.revision ||
    latest.state !==
      intent.state
  ) {
    fail(
      "PAYMENT_INTENT_HISTORY_MISMATCH"
    );
  }

  rejectSensitiveMaterial(
    intent
  );

  const recordJson =
    canonicalJson(
      intent
    );

  const bytes =
    Buffer.byteLength(
      recordJson,
      "utf8"
    );

  if (
    bytes >
    MAX_RECORD_BYTES
  ) {
    fail(
      "PAYMENT_INTENT_RECORD_TOO_LARGE"
    );
  }

  return {
    recordJson,

    recordSha256:
      sha256(
        recordJson
      ),

    latest
  };
}


function validateDatabasePath(
  databasePath
) {
  const raw =
    String(
      databasePath || ""
    ).trim();

  if (
    !raw ||
    raw === ":memory:"
  ) {
    fail(
      "DURABLE_DATABASE_PATH_REQUIRED"
    );
  }

  const resolved =
    path.resolve(raw);

  const parent =
    path.dirname(
      resolved
    );

  if (
    !fs.existsSync(
      parent
    ) ||
    !fs.statSync(
      parent
    ).isDirectory()
  ) {
    fail(
      "DURABLE_DATABASE_PARENT_REQUIRED"
    );
  }

  return resolved;
}


function createSqlitePaymentIntentStore(
  databasePath,
  options = {}
) {
  const resolvedPath =
    validateDatabasePath(
      databasePath
    );

  const timeout =
    Number.isInteger(
      options.timeoutMs
    )
      ? options.timeoutMs
      : 5000;

  if (
    timeout < 1 ||
    timeout > 30000
  ) {
    fail(
      "INVALID_SQLITE_TIMEOUT"
    );
  }

  const db =
    new DatabaseSync(
      resolvedPath,
      {
        open:
          true,

        readOnly:
          false,

        enableForeignKeyConstraints:
          true,

        enableDoubleQuotedStringLiterals:
          false,

        allowExtension:
          false,

        timeout,

        defensive:
          true
      }
    );


  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    PRAGMA foreign_keys = ON;
    PRAGMA trusted_schema = OFF;

    CREATE TABLE IF NOT EXISTS payment_intents (
      intent_id TEXT PRIMARY KEY NOT NULL,
      payment_fingerprint TEXT NOT NULL UNIQUE,
      revision INTEGER NOT NULL,
      state TEXT NOT NULL,
      record_json TEXT NOT NULL,
      record_sha256 TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS payment_intent_events (
      intent_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      state TEXT NOT NULL,
      event_json TEXT NOT NULL,
      event_sha256 TEXT NOT NULL,
      recorded_at TEXT NOT NULL,

      PRIMARY KEY (
        intent_id,
        revision
      ),

      FOREIGN KEY (
        intent_id
      )
      REFERENCES payment_intents(
        intent_id
      )
      ON DELETE RESTRICT
    ) STRICT;
  `);


  let closed =
    false;


  function ensureOpen() {
    if (closed) {
      fail(
        "PAYMENT_INTENT_STORE_CLOSED"
      );
    }
  }


  function runTransaction(fn) {
    ensureOpen();

    db.exec(
      "BEGIN IMMEDIATE"
    );

    try {
      const result =
        fn();

      db.exec(
        "COMMIT"
      );

      return result;
    } catch (cause) {
      try {
        db.exec(
          "ROLLBACK"
        );
      } catch {
        // Preserve original failure.
      }

      throw cause;
    }
  }


  function decodeRow(row) {
    if (!row) {
      return null;
    }

    const recordJson =
      String(
        row.record_json
      );

    const expectedHash =
      String(
        row.record_sha256
      );

    const actualHash =
      sha256(
        recordJson
      );

    if (
      actualHash !==
      expectedHash
    ) {
      fail(
        "STORE_RECORD_HASH_MISMATCH"
      );
    }

    let parsed;

    try {
      parsed =
        JSON.parse(
          recordJson
        );
    } catch (cause) {
      fail(
        "STORE_RECORD_JSON_CORRUPT",
        null,
        cause
      );
    }

    const checked =
      validateIntent(
        parsed
      );

    if (
      checked.recordJson !==
      recordJson
    ) {
      fail(
        "STORE_RECORD_NOT_CANONICAL"
      );
    }

    if (
      parsed.intent_id !==
        row.intent_id ||
      parsed.payment_fingerprint !==
        row.payment_fingerprint ||
      parsed.revision !==
        row.revision ||
      parsed.state !==
        row.state
    ) {
      fail(
        "STORE_INDEX_RECORD_MISMATCH"
      );
    }

    return clone(
      parsed
    );
  }


  function insertEvent(
    intent,
    latest
  ) {
    const eventJson =
      canonicalJson(
        latest
      );

    const stmt =
      db.prepare(`
        INSERT INTO payment_intent_events (
          intent_id,
          revision,
          state,
          event_json,
          event_sha256,
          recorded_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
      `);

    try {
      stmt.run(
        intent.intent_id,
        intent.revision,
        intent.state,
        eventJson,
        sha256(
          eventJson
        ),
        String(
          latest.at
        )
      );
    } finally {
      stmt.close();
    }
  }


  async function createOnce(
    intent
  ) {
    const checked =
      validateIntent(
        intent
      );

    return runTransaction(
      () => {
        const stmt =
          db.prepare(`
            INSERT INTO payment_intents (
              intent_id,
              payment_fingerprint,
              revision,
              state,
              record_json,
              record_sha256,
              created_at,
              updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT DO NOTHING
          `);

        let result;

        try {
          result =
            stmt.run(
              intent.intent_id,
              intent.payment_fingerprint,
              intent.revision,
              intent.state,
              checked.recordJson,
              checked.recordSha256,
              String(
                intent.created_at
              ),
              String(
                intent.updated_at
              )
            );
        } finally {
          stmt.close();
        }

        if (
          Number(
            result.changes
          ) !== 1
        ) {
          return false;
        }

        insertEvent(
          intent,
          checked.latest
        );

        return true;
      }
    );
  }


  async function get(
    intentId
  ) {
    ensureOpen();

    const stmt =
      db.prepare(`
        SELECT
          intent_id,
          payment_fingerprint,
          revision,
          state,
          record_json,
          record_sha256
        FROM payment_intents
        WHERE intent_id = ?
      `);

    let row;

    try {
      row =
        stmt.get(
          String(
            intentId
          )
        );
    } finally {
      stmt.close();
    }

    return decodeRow(
      row
    );
  }


  async function compareAndSwap({
    intentId,
    expectedRevision,
    next
  }) {
    const checked =
      validateIntent(
        next
      );

    if (
      next.intent_id !==
        intentId
    ) {
      fail(
        "INTENT_ID_MUTATION_BLOCKED"
      );
    }

    if (
      next.revision !==
        expectedRevision + 1
    ) {
      fail(
        "INVALID_NEXT_REVISION"
      );
    }

    return runTransaction(
      () => {
        const stmt =
          db.prepare(`
            UPDATE payment_intents
            SET
              revision = ?,
              state = ?,
              record_json = ?,
              record_sha256 = ?,
              updated_at = ?
            WHERE
              intent_id = ?
              AND revision = ?
              AND payment_fingerprint = ?
          `);

        let result;

        try {
          result =
            stmt.run(
              next.revision,
              next.state,
              checked.recordJson,
              checked.recordSha256,
              String(
                next.updated_at
              ),
              intentId,
              expectedRevision,
              next.payment_fingerprint
            );
        } finally {
          stmt.close();
        }

        if (
          Number(
            result.changes
          ) !== 1
        ) {
          return false;
        }

        insertEvent(
          next,
          checked.latest
        );

        return true;
      }
    );
  }


  async function audit(
    intentId
  ) {
    ensureOpen();

    const stmt =
      db.prepare(`
        SELECT
          revision,
          state,
          event_json,
          event_sha256,
          recorded_at
        FROM payment_intent_events
        WHERE intent_id = ?
        ORDER BY revision ASC
      `);

    let rows;

    try {
      rows =
        stmt.all(
          String(
            intentId
          )
        );
    } finally {
      stmt.close();
    }

    return rows.map(
      row => {
        const eventJson =
          String(
            row.event_json
          );

        if (
          sha256(
            eventJson
          ) !==
          String(
            row.event_sha256
          )
        ) {
          fail(
            "STORE_EVENT_HASH_MISMATCH"
          );
        }

        let event;

        try {
          event =
            JSON.parse(
              eventJson
            );
        } catch (cause) {
          fail(
            "STORE_EVENT_JSON_CORRUPT",
            null,
            cause
          );
        }

        return {
          revision:
            row.revision,

          state:
            row.state,

          event,

          recorded_at:
            row.recorded_at
        };
      }
    );
  }


  function integrityCheck() {
    ensureOpen();

    const stmt =
      db.prepare(
        "PRAGMA integrity_check"
      );

    let row;

    try {
      row =
        stmt.get();
    } finally {
      stmt.close();
    }

    const value =
      String(
        Object.values(
          row || {}
        )[0] || ""
      ).toLowerCase();

    if (
      value !== "ok"
    ) {
      fail(
        "SQLITE_INTEGRITY_CHECK_FAILED"
      );
    }

    return true;
  }


  function describe() {
    ensureOpen();

    function pragmaValue(
      sql
    ) {
      const stmt =
        db.prepare(sql);

      try {
        const row =
          stmt.get();

        return Object.values(
          row || {}
        )[0];
      } finally {
        stmt.close();
      }
    }

    return {
      type:
        "SQLITE",

      path:
        resolvedPath,

      journal_mode:
        String(
          pragmaValue(
            "PRAGMA journal_mode"
          )
        ).toUpperCase(),

      synchronous:
        Number(
          pragmaValue(
            "PRAGMA synchronous"
          )
        ),

      foreign_keys:
        Number(
          pragmaValue(
            "PRAGMA foreign_keys"
          )
        ) === 1,

      automatic_payment_retry:
        false
    };
  }


  function close() {
    if (
      closed
    ) {
      return;
    }

    db.close();

    closed =
      true;
  }


  return {
    createOnce,
    get,
    compareAndSwap,
    audit,
    integrityCheck,
    describe,
    close
  };
}


module.exports = {
  MAX_RECORD_BYTES,
  createSqlitePaymentIntentStore
};