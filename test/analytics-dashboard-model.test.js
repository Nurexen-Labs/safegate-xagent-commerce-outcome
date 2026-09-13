"use strict";

const assert=require("assert");
const fs=require("fs");
const path=require("path");

const {
  buildDashboardPayload
}=require("../lib/analytics-dashboard-model");

const events=JSON.parse(
  fs.readFileSync(
    path.join(__dirname,"..","fixtures","analytics-demo-events.json"),
    "utf8"
  )
);

const payload=
  buildDashboardPayload(
    events,
    "SYNTHETIC_DEMO"
  );

assert.strictEqual(payload.data_mode,"SYNTHETIC_DEMO");
assert.strictEqual(payload.kpis.executions,7);
assert.strictEqual(payload.kpis.replay_blocked,1);
assert.strictEqual(payload.kpis.commerce_verified,1);
assert.strictEqual(payload.kpis.commerceproofs,5);
assert.strictEqual(payload.volume_policy,"NO_CROSS_ASSET_SUM");

const usdc=
  payload.evidenced_volume.find(
    x=>x.network==="BASE" && x.asset==="USDC"
  );

assert(usdc);
assert.strictEqual(usdc.display_value,"0.9");

const hbar=
  payload.evidenced_volume.find(
    x=>x.network==="HEDERA_TESTNET" && x.asset==="HBAR"
  );

assert(hbar);
assert.strictEqual(hbar.display_value,"0.001");

assert(
  payload.disclaimer
    .toLowerCase()
    .includes("not production metrics")
);

console.log("SYNTHETIC_DATASET=PASS");
console.log("DASHBOARD_PAYLOAD=PASS");
console.log("USDC_VOLUME=0.9");
console.log("HBAR_VOLUME=0.001");
console.log("NO_CROSS_ASSET_SUM=PASS");
console.log("SAFEGATE_ANALYTICS_FIXTURE_TEST=PASS");