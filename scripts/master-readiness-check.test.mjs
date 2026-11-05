import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { MasterReadinessChecks } from "./master-readiness-check.mjs";

const reply = { ready: true, robot_commands_sent: false, robot_model: "master", plan_sha256: "reviewed" };
const base = { id: "98", identity: "deployment A", planHash: "reviewed", endMs: 120000 };
function fixture() {
  let time = 0;
  const runs = [];
  const checks = new MasterReadinessChecks({ now: () => time });
  const run = options => new Promise((resolve, reject) => runs.push({ options, resolve, reject }));
  return { checks, runs, run, tick: value => { time = value; } };
}

test("readiness progresses independently while another session can poll", async () => {
  const { checks, runs, run, tick } = fixture();
  assert.equal(checks.poll(base, run).status, "checking");
  tick(21000);
  assert.equal(checks.poll(base, run).status, "checking");
  assert.equal(runs.length, 1);
  assert.equal(runs[0].options.timeoutMs, 90000);
  assert.equal(checks.poll({ ...base, id: "99", endMs: 25000 }, run).status, "checking");
  assert.equal(runs[1].options.timeoutMs, 4000);
  runs[0].resolve(reply);
  await setImmediate();
  assert.equal(checks.poll(base, run).status, "ready");
  assert.equal(checks.poll(base, run).status, "checking"); // consumed only once
});

test("a changed deployment, cancellation or expiry cannot consume an earlier success", async () => {
  const { checks, runs, run, tick } = fixture();
  checks.poll(base, run);
  checks.poll({ ...base, identity: "new deployment" }, run);
  assert.equal(runs[0].options.signal.aborted, true);
  runs[0].resolve(reply);
  await setImmediate();
  assert.equal(checks.poll({ ...base, identity: "new deployment" }, run).status, "checking");
  checks.retain(new Set());
  assert.equal(runs[1].options.signal.aborted, true);
  runs[1].resolve(reply);
  await setImmediate();
  assert.equal(checks.poll(base, run).status, "checking");
  tick(base.endMs);
  assert.equal(checks.poll(base, run).status, "expired");
  assert.equal(runs[2].options.signal.aborted, true);
});

test("stale evidence is reread and a mismatched attestation is refused", async () => {
  const { checks, runs, run, tick } = fixture();
  checks.poll(base, run);
  runs[0].resolve(reply);
  await setImmediate();
  tick(6000);
  assert.equal(checks.poll(base, run).status, "checking");
  runs[1].resolve({ ...reply, plan_sha256: "wrong" });
  await setImmediate();
  assert.equal(checks.poll(base, run).status, "failed");
});
