"use strict";

const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const pin = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "..", "verification", "402signal-route-guard-sandbox-pin.json"),
    "utf8"
  )
);

assert.equal(pin.schema, "SAFEGATE_402SIGNAL_SANDBOX_PIN_V1");
assert.equal(pin.package, "@402signal/route-guard");
assert.equal(pin.version, "0.7.3");
assert.match(pin.source_revision, /^[0-9a-f]{40}$/);
assert.equal(pin.simulation_only, true);
assert.equal(pin.production_release, false);
assert.equal(pin.replaces_stable_release_lock, false);
assert.equal(pin.stable_release_lock_version, "0.7.2");

console.log("402SIGNAL_0.7.3_PUBLIC_MAIN_PIN=PASS");
console.log("STABLE_0.7.2_RELEASE_LOCK=PRESERVED");
console.log("PRODUCTION_RELEASE_CLAIM=NO");