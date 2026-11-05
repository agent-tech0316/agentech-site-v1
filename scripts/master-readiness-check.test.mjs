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
  assert.equal(runs.length, 1); // polling never blocks, but the physical Master is shared
  runs[0].resolve(reply);
  await setImmediate();
  assert.equal(checks.poll(base, run).status, "ready");
  assert.equal(checks.poll({ ...base, id: "99", endMs: 25000 }, run).status, "checking");
  assert.equal(runs[1].options.timeoutMs, 4000);
  assert.equal(checks.poll(base, run).status, "checking"); // consumed only once; second client is active
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

test("an early read-only success waits for a fresh replacement close to opening", async () => {
  const { checks, runs, run, tick } = fixture();
  const prep = { ...base, startMs: 20000, prepareOnly: true };
  checks.poll(prep, run);
  tick(2000);
  runs[0].resolve(reply);
  await setImmediate();
  assert.equal(checks.poll(prep, run).status, 'waiting');
  tick(12000);
  assert.equal(checks.poll(prep, run).status, 'waiting');
  tick(16000);
  assert.equal(checks.poll(prep, run).status, 'checking');
  tick(18000);
  runs[1].resolve(reply);
  await setImmediate();
  tick(20000);
  assert.equal(checks.poll({ ...prep, prepareOnly: false }, run).status, 'ready');
  assert.equal(runs.length, 2);
});

test("booking 104 timing: a 13-second probe is measured early, then refreshed for slot opening", async () => {
  const { checks, runs, run, tick } = fixture();
  const startMs = 90000;
  const prep = { ...base, startMs, prepareOnly:true };
  checks.poll(prep, run);
  tick(13000); // measured preflight cost, comparable to #104's final probe-to-launch interval
  runs[0].resolve(reply);
  await setImmediate();
  tick(startMs - 15000);
  assert.equal(checks.poll(prep, run).status, 'checking');
  assert.equal(runs.length, 2);
  tick(startMs - 2000);
  runs[1].resolve(reply);
  await setImmediate();
  tick(startMs + 1000); // the booked stream was observed during its window at T+1.186 in #104
  const atOpening = checks.poll({ ...prep, prepareOnly:false }, run);
  assert.equal(atOpening.status, 'ready');
  assert.equal(atOpening.expiresAt, startMs + 3000);
  assert.equal(runs.length, 2);
});

test("cancellation does not release the Master observation channel until the old client settles", async () => {
  const { checks, runs, run } = fixture();
  checks.poll(base, run);
  checks.discard(base.id);
  const next = {...base, id:"104", identity:"new booking"};
  assert.equal(checks.poll(next, run).status, 'checking');
  assert.equal(runs.length, 1);
  assert.equal(runs[0].options.signal.aborted, true);
  runs[0].resolve(reply);
  await setImmediate();
  assert.equal(checks.poll(next, run).status, 'checking');
  assert.equal(runs.length, 2);
});

test("every phase of a five-second poll wakes at replacement and opening without extra probes", async () => {
  const startMs = 90000, duration = 13000;
  for (let phase=0; phase<5000; phase++) {
    let now=phase, claimed=null;
    const events=new Map(), started=[];
    const add=(callback, delay)=>{const id=Symbol(); events.set(id,{at:now+delay,callback}); return id;};
    const checks=new MasterReadinessChecks({now:()=>now, onReady:tick, setTimer:add, clearTimer:id=>events.delete(id)});
    const params={...base,startMs};
    function probe() {
      started.push(now);
      return new Promise(resolve=>add(()=>resolve(reply), duration));
    }
    function tick() {
      if (claimed!==null) return;
      checks.poll({...params,prepareOnly:true}, probe);
      if (now >= startMs && checks.poll(params,probe).status==='ready') claimed=now;
    }
    for (let t=phase;t<=startMs+5000;t+=5000) add(tick,t-now);
    while (events.size && claimed===null) {
      const [id,event]=[...events].sort((a,b)=>a[1].at-b[1].at)[0];
      events.delete(id); now=event.at;
      event.callback();
      await Promise.resolve();
    }
    assert.equal(claimed,startMs,`poll phase ${phase}`);
    assert.deepEqual(started,[phase,startMs-duration-2000],`poll phase ${phase}`);
  }
});

test("cancellation or replacement removes the timer and invalidates an already queued wake", async () => {
  for (const kind of ['cancel', 'replace']) {
    let now=0, wakes=0, timerId=0;
    const callbacks=new Map(), cleared=[];
    const checks=new MasterReadinessChecks({now:()=>now, onReady:()=>{wakes++;},
      setTimer:callback=>{ callbacks.set(++timerId,callback); return timerId; },
      clearTimer:id=>{ cleared.push(id); callbacks.delete(id); }});
    const prep={...base,startMs:90000,prepareOnly:true};
    let resolve;
    checks.poll(prep,()=>new Promise(done=>{resolve=done;}));
    now=13000; resolve(reply); await setImmediate();
    checks.poll(prep,()=>assert.fail('second probe was too early'));
    const staleWake=callbacks.get(timerId);
    assert.ok(staleWake);
    if (kind==='cancel') checks.retain(new Set());
    else checks.poll({...prep,identity:'new plan'},()=>new Promise(()=>{}));
    assert.equal(callbacks.size,0);
    assert.deepEqual(cleared,[timerId]);
    staleWake();
    assert.equal(wakes,1); // Only the original read-only completion woke the loop.
  }
});
