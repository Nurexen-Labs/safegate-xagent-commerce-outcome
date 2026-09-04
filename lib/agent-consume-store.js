"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const STORE_DIR =
  process.env.SAFEGATE_CONSUME_STORE_DIR ||
  (process.env.VERCEL
    ? path.join("/tmp", ".safegate-runtime")
    : path.join(process.cwd(), ".safegate-runtime"));

const STORE_FILE = path.join(STORE_DIR, "agent-consume.json");
const LOCK_FILE = path.join(STORE_DIR, "agent-consume.lock");

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((out, key) => {
        out[key] = canonicalize(value[key]);
        return out;
      }, {});
  }

  return value;
}

function fingerprint(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

async function ensureStoreDir() {
  await fs.promises.mkdir(STORE_DIR, { recursive: true });
}

async function readStore() {
  await ensureStoreDir();

  try {
    const raw = await fs.promises.readFile(STORE_FILE, "utf8");
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

async function acquireLock() {
  await ensureStoreDir();

  for (let i = 0; i < 100; i += 1) {
    try {
      return await fs.promises.open(LOCK_FILE, "wx");
    } catch (error) {
      if (error.code !== "EEXIST") {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  const error = new Error("Could not acquire consume-store lock.");
  error.code = "CONSUME_STORE_LOCK_TIMEOUT";
  throw error;
}

async function checkPaymentReplay({ paymentPayload, request }) {
  const paymentHash = fingerprint(paymentPayload);
  const requestHash = fingerprint(request);
  const store = await readStore();
  const record = store[paymentHash] || null;

  return {
    exists: Boolean(record),
    sameRequest: Boolean(record && record.request_hash === requestHash),
    paymentHash,
    requestHash,
    record,
  };
}

async function consumePaymentOnce({
  paymentPayload,
  request,
  settlement,
}) {
  const lock = await acquireLock();

  try {
    const paymentHash = fingerprint(paymentPayload);
    const requestHash = fingerprint(request);
    const store = await readStore();
    const existing = store[paymentHash] || null;

    if (existing) {
      return {
        ok: false,
        sameRequest: existing.request_hash === requestHash,
        paymentHash,
        requestHash,
        record: existing,
      };
    }

    const record = {
      payment_hash: paymentHash,
      request_hash: requestHash,
      consumed_at: new Date().toISOString(),
      settlement_transaction: settlement?.transaction || null,
      network: settlement?.network || null,
      payer: settlement?.payer || null,
    };

    store[paymentHash] = record;

    await fs.promises.writeFile(
      STORE_FILE,
      JSON.stringify(store, null, 2) + "\n",
      "utf8"
    );

    return {
      ok: true,
      paymentHash,
      requestHash,
      record,
    };
  } finally {
    await lock.close().catch(() => {});
    await fs.promises.unlink(LOCK_FILE).catch(() => {});
  }
}

module.exports = {
  checkPaymentReplay,
  consumePaymentOnce,
};

