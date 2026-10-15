import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { endSessionCleanupPolicy } from "./robot-stream-session-policy.mjs";
import { naviLaunchBlocker, parseNaviCleanupResult } from "./navi-session-handoff.mjs";
import * as handoff from "./navi-session-handoff.mjs";

const now = Date.parse("2026-09-30T03:00:00Z");
const resetAt = "2026-09-30T02:00:00Z";
const previous = (changes = {}) => ({ executionModel: "navi", status: "finished",
  end: "2026-09-30T02:59:00Z", endCleanupRequired: true, endCleanupStatus: "pending", ...changes });

test("scheduled end always resets Navi even if user returned then moved again", () => {
  for (const commands of [[{name:"forward"}], [{name:"return_to_home"}],
    [{name:"return_to_home"},{name:"forward"}]]) {
    assert.deepEqual(endSessionCleanupPolicy({commands}, "navi"), {required:true, returnHomeRequired:true});
  }
});

// Execute the actual bridge tick with inert collaborators: no network, OBS, or robot.
async function tickFixture(failCloud = false, setup = () => {}) {
  const source = readFileSync(new URL("./robot-stream-bridge.mjs", import.meta.url), "utf8");
  const body = source.split("async function tick() {")[1].split('\nconsole.log(`[robot-stream] Standalone')[0];
  const events = [];
  const state = {sessions:{old:previous({status:"completed",end:"2000-01-01T00:00:00Z"}),
    next:previous({status:"staged",end:"2999-01-01T00:00:00Z"})}};
  const noop = () => {};
  const deps = {state, processRunning:()=>false,saveState:noop, collectExecutionResult:noop,
    publishCaptures:noop,collectDeviceResults:noop,syncDeviceResults:noop,syncExecutionResult:noop,
    syncFinalSessionStatus:noop,keepsStreamActive:()=>false,stopObs:noop,stopObsVirtualCamera:noop,
    stopSession:id=>{state.sessions[id].status="finished";},endCleanupCanRun:item=>item.endCleanupStatus!=="completed",
    finishSessionCleanup:()=>{events.push("reset");state.sessions.old.endCleanupStatus="completed";},
    dueSessions:()=>{events.push("cloud");if(failCloud) throw new Error("cloud unavailable");
      return [{id:"next",scheduled_start:"2000-01-01T00:00:00Z"}];},
    reviewedSubmission:noop,stage:noop,ensureSessionStream:()=>true,launch:()=>events.push("launch")};
  setup(deps, events, state);
  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
  try { await new AsyncFunction(...Object.keys(deps), body.slice(0,body.lastIndexOf("}")))(...Object.values(deps)); }
  catch(error) { if(!failCloud || error.message!=="cloud unavailable") throw error; }
  return events;
}

test("actual bridge completes previous reset before cloud lookup and next launch", async () => {
  assert.deepEqual(await tickFixture(), ["reset","cloud","launch"]);
});
test("cloud outage cannot prevent local session-end reset", async () => {
  assert.deepEqual(await tickFixture(true), ["reset","cloud"]);
});

test("expired Aegis captures publish after local cleanup and remain finished", async () => {
  for (const status of ["running", "finished"]) {
    let captured;
    const events = await tickFixture(false, (deps, events, state) => {
      const item = previous({executionModel:"aegis",status,end:"2000-01-01T00:00:00Z",
        pid:"42",remoteCaptures:["first.jpg","second.jpg"],publishedCaptures:["first.jpg"]});
      state.sessions = {old:item};
      captured = item;
      deps.dueSessions = () => [];
      deps.publishCaptures = (_id, session) => {
        for (const capture of session.remoteCaptures) {
          if (!session.publishedCaptures.includes(capture)) {
            events.push(`capture:${capture}`);
            session.publishedCaptures.push(capture);
          }
        }
      };
      deps.syncFinalSessionStatus = () => events.push("final-status");
    });
    assert.deepEqual(events, ["reset", "capture:second.jpg", "final-status"], status);
    assert.equal(captured.status, "finished");
    assert.deepEqual(captured.publishedCaptures, ["first.jpg", "second.jpg"]);
  }
});

test("expired staged Aegis booking never publishes uncreated captures", async () => {
  const events = await tickFixture(false, (deps, events, state) => {
    state.sessions = {old:previous({executionModel:"aegis",status:"staged",
      end:"2000-01-01T00:00:00Z",remoteCaptures:["never-created.jpg"],publishedCaptures:[]})};
    deps.endCleanupCanRun = item => item.endCleanupRequired === true;
    deps.dueSessions = () => [];
    deps.publishCaptures = () => events.push("capture");
  });
  assert.deepEqual(events, []);
});

test("expired Aegis capture failure records one attempt instead of retrying every tick", async () => {
  const item = previous({executionModel:"aegis",status:"running",pid:"42",
    end:"2000-01-01T00:00:00Z",remoteCaptures:["missing.jpg"],publishedCaptures:[]});
  let attempts = 0;
  const setup = (deps, _events, state) => {
    state.sessions = {old:item};
    deps.dueSessions = () => [];
    deps.console = {error(){}};
    deps.publishCaptures = () => { attempts++; throw Error("capture unavailable"); };
  };
  await tickFixture(false, setup);
  await tickFixture(false, setup);
  assert.equal(attempts, 1);
  assert.equal(item.status, "finished");
  assert.equal(item.capturePublishingError, "capture unavailable");
});

test("actual tick refuses launch when stream readiness crosses booked end", async () => {
  const events = await tickFixture(false, (deps, events, state) => {
    let clock = now + 1000;
    deps.Date = {now: () => clock, parse: Date.parse};
    state.sessions.next.end = new Date(now + 1200).toISOString();
    deps.ensureSessionStream = async () => { clock = now + 1300; return true; };
  });
  assert.deepEqual(events, ["reset", "cloud"]);
});

function bridgeFunction(name, nextName, deps, async = false) {
  const source = readFileSync(new URL("./robot-stream-bridge.mjs", import.meta.url), "utf8");
  const declaration = `${async ? "async " : ""}function ${name}`;
  const section = source.slice(source.indexOf(declaration), source.indexOf(nextName, source.indexOf(declaration)));
  return new Function(...Object.keys(deps), `${section};return ${name};`)(...Object.values(deps));
}

function cleanupStartFixture({other, baselineAt = resetAt} = {}) {
  const item = previous({end:"2026-09-29T00:00:00Z",endCleanupStatus:"failed",
    endCleanupAttempts:1,endCleanupError:"camera unavailable",localPlan:"old-plan"});
  const launches = [];
  const receipt = {version:1,ready_for_next_user:true,operation:"return_to_home",succeeded:true,
    damping_completed:true,terminal_state:"lowered_damped",run_id:"boot",elapsed_s:20,
    position_error_m:.02,final_heading_error_deg:1,
    final_state:{boot_finish:true,robot_ready:true,error:0,warning:0,estop:1,standing:false,action:0}};
  const deps = {state:{sessions:{old:item,...(other ? {other} : {})}},Date:{now:()=>now,parse:Date.parse},
    endCleanupCanRun:bridgeFunction("endCleanupCanRun","function reconcileNaviCleanup",{}),
    refreshNaviResetBaseline:()=>handoff.selectNaviResetBaseline(null,
      baselineAt ? {version:1,verified_at:baselineAt,result:receipt} : null,now),
    saveState:()=>{},localPython:"python",trustedNaviRunner:"runner",naviEnvironment:()=>({}),
    createNaviSessionOwner:()=>({attempt_id:"retry",result_file:"result",owner_file:"owner"}),
    spawn:(_program,args)=>{launches.push(args);return {pid:42,on(){},unref(){}};},
    console:{log(){},error(){}}};
  bridgeFunction("finishSessionCleanup","async function syncFinalSessionStatus",deps)("old",item);
  return {item,launches};
}

test("verified reset supersedes an older failed cleanup without retrying or rewriting failure", () => {
  const {item,launches} = cleanupStartFixture();
  assert.deepEqual(launches, []);
  assert.equal(item.endCleanupStatus, "failed");
  assert.equal(item.endCleanupAttempts, 1);
  assert.equal(item.endCleanupError, "camera unavailable");
});

test("old cleanup waits for another booked or unknown Navi owner", () => {
  for (const other of [
    previous({status:"running",end:"2026-09-30T04:00:00Z",naviSessionGuardian:true}),
    previous({status:"completed",end:"2026-09-30T04:00:00Z"}),
    previous({status:"completed",end:"invalid"}),
    previous({endCleanupStatus:"running"}),
    previous({endCleanupStatus:"failed",naviCleanupOwner:{pid:null,attempt_id:"unknown"}}),
  ]) {
    const {item,launches} = cleanupStartFixture({other,baselineAt:null});
    assert.deepEqual(launches, [], JSON.stringify(other));
    assert.equal(item.endCleanupStatus, "failed");
    assert.equal(item.endCleanupAttempts, 1);
  }
});

test("older or unavailable reset evidence still permits an unowned cleanup retry", () => {
  for (const baselineAt of [null, "2026-09-28T00:00:00Z", "2999-01-01T00:00:00Z"]) {
    const {item,launches} = cleanupStartFixture({baselineAt});
    assert.equal(launches.length, 1);
    assert.equal(launches[0][1], "--cleanup-supervisor");
    assert.equal(item.endCleanupStatus, "running");
    assert.equal(item.endCleanupAttempts, 2);
  }
});

test("actual launch rechecks expiration after readiness and after claim", async () => {
  for (const crossAt of ["readiness", "claim"]) {
    let clock = 1000;
    const item = previous({status:"staged", end:new Date(1200).toISOString()});
    const state = {sessions:{next:item}, naviResetVerifiedAt:resetAt,
      naviResetResult:{run_id:"verified-boot"}};
    let spawned = 0;
    const deps = {state,Date:{now:()=>clock,parse:Date.parse},
      naviLaunchBlocker:()=>null,refreshNaviResetBaseline:()=>({verified_at:resetAt,result:{run_id:"verified-boot"}}),
      run:()=>{if(crossAt==="readiness") clock=1300;},
      claimSession:async()=>{if(crossAt==="claim") clock=1300;return true;},
      localPython:"python",trustedNaviRunner:"runner",naviEnvironment:()=>({}),
      join:(...parts)=>parts.join("/"),runtimeDir:"runtime",openSync:()=>1,closeSync:()=>{},
      saveState:()=>{},spawn:()=>{spawned++;return {pid:42,unref(){},on(){}};},console:{log(){},error(){}},
      createNaviSessionOwner:()=>({attempt_id:"attempt",result_file:"result",owner_file:"owner"})};
    await bridgeFunction("launch", "async function stopSession", deps, true)({id:"next"});
    assert.equal(spawned, 0, crossAt);
  }
});

test("a launched Navi supervisor receives booked deadline rather than an unbounded plan", async () => {
  const item = previous({status:"staged",end:"2999-01-01T00:00:00Z",localPlan:"plan.json"});
  let args;
  const deps = {state:{sessions:{next:item},naviResetVerifiedAt:resetAt,naviResetResult:{run_id:"boot"}},
    naviLaunchBlocker:()=>null,refreshNaviResetBaseline:()=>({verified_at:resetAt,result:{run_id:"boot"}}),
    run:()=>{},claimSession:async()=>true,localPython:"python",trustedNaviRunner:"runner",naviEnvironment:()=>({}),
    join:(...parts)=>parts.join("/"),runtimeDir:"runtime",openSync:()=>1,closeSync:()=>{},saveState:()=>{},
    spawn:(_program,command)=>{args=command;return {pid:42,unref(){},on(){}};},console:{log(){},error(){}},
    createNaviSessionOwner:()=>({attempt_id:"attempt",result_file:"result",owner_file:"owner"})};
  await bridgeFunction("launch", "async function stopSession", deps, true)({id:"next"});
  assert.equal(args[1], "--booked-session");
  assert.ok(args.includes(item.end));
});

test("cleanup restart never repeats a live or unknown cleanup owner", () => {
  for (const live of [true, null]) {
    const item = previous({endCleanupStatus:"running",endCleanupAttempts:1,
      naviCleanupOwner:{pid:live===null?null:42,attempt_id:"attempt",result_file:"result"}});
    let resets = 0;
    const deps = {state:{sessions:{old:item}},endCleanupCanRun:()=>true,saveState:()=>{},
      processRunning:()=>live===true,reconcileNaviCleanup:()=>({status:live===true?"running":"unknown"}),
      run:()=>{resets++;throw Error("must not reset");},localPython:"python",trustedNaviRunner:"runner",
      naviEnvironment:()=>({}),parseNaviCleanupResult,console:{log(){},error(){}}};
    bridgeFunction("finishSessionCleanup", "async function syncFinalSessionStatus", deps)("old",item);
    assert.equal(resets,0);
    assert.equal(item.endCleanupAttempts,1);
  }
});

test("durable cleanup reconciliation requires matching verified result, not dead PID", () => {
  assert.equal(typeof handoff.reconcileNaviCleanupOutcome, "function");
  const owner={attempt_id:"attempt"};
  const receipt={version:1,ready_for_next_user:true,operation:"return_to_home",succeeded:true,
    damping_completed:true,terminal_state:"lowered_damped",run_id:"boot",elapsed_s:20,position_error_m:.02,
    final_heading_error_deg:1,final_state:{boot_finish:true,robot_ready:true,error:0,warning:0,estop:1,standing:false,action:0}};
  assert.equal(handoff.reconcileNaviCleanupOutcome(owner,false,null).status,"failed");
  assert.equal(handoff.reconcileNaviCleanupOutcome(owner,true,null).status,"running");
  assert.equal(handoff.reconcileNaviCleanupOutcome(owner,null,null).status,"unknown");
  assert.equal(handoff.reconcileNaviCleanupOutcome(owner,false,{attempt_id:"other",outcome:"verified",result:receipt}).status,"failed");
  const accepted=handoff.reconcileNaviCleanupOutcome(owner,false,{version:1,attempt_id:"attempt",outcome:"verified",verified_at:resetAt,result:receipt});
  assert.equal(accepted.status,"completed");
  assert.equal(accepted.result.run_id,"boot");
});

test("dedicated supervised baseline is validated and wins without changing failed session history", () => {
  assert.equal(typeof handoff.selectNaviResetBaseline,"function");
  const receipt={version:1,ready_for_next_user:true,operation:"return_to_home",succeeded:true,
    damping_completed:true,terminal_state:"lowered_damped",run_id:"boot",elapsed_s:20,position_error_m:.02,
    final_heading_error_deg:1,final_state:{boot_finish:true,robot_ready:true,error:0,warning:0,estop:1,standing:false,action:0}};
  const automatic={verified_at:"2026-09-29T00:00:00Z",result:receipt};
  const supervised={version:1,verified_at:resetAt,result:{...receipt,run_id:"new-boot"}};
  assert.equal(handoff.selectNaviResetBaseline(automatic,supervised,now).result.run_id,"new-boot");
  assert.throws(()=>handoff.selectNaviResetBaseline(automatic,{...supervised,result:{...receipt,succeeded:false}},now));
  assert.throws(()=>handoff.selectNaviResetBaseline(automatic,{...supervised,verified_at:"2999-01-01T00:00:00Z"},now));
});

test("missing or broken gateway state fails closed instead of forgetting ownership", () => {
  assert.equal(typeof handoff.loadGatewayState,"function");
  const missing=Object.assign(new Error("missing"),{code:"ENOENT"});
  assert.throws(()=>handoff.loadGatewayState("state",{readFileSync:()=>{throw missing;}}), /state/);
  for(const text of ["{", "null", '{"sessions":[]}', '{}']) {
    assert.throws(()=>handoff.loadGatewayState("state",{readFileSync:()=>text}), /state/);
  }
  assert.deepEqual(handoff.loadGatewayState("state",{readFileSync:()=>'{"sessions":{}}'}),{sessions:{}});
});

test("atomic state save never truncates existing state before replacement", () => {
  assert.equal(typeof handoff.saveGatewayState,"function");
  const files=new Map([["state",'{"sessions":{"old":{"status":"running"}}}']]);
  const io={writeFileSync:(path,text)=>files.set(path,text),renameSync:(from,to)=>{files.set(to,files.get(from));files.delete(from);},
    unlinkSync:path=>files.delete(path)};
  const replacement={sessions:{old:{status:"finished"}}};
  handoff.saveGatewayState("state",replacement,io);
  assert.deepEqual(JSON.parse(files.get("state")),replacement);
  const original=files.get("state");
  assert.throws(()=>handoff.saveGatewayState("state",{sessions:{}},{...io,renameSync:()=>{throw Error("interrupted");}}));
  assert.equal(files.get("state"),original);
});

test("a supervised reset cannot supersede a cleanup still owning the robot",()=>{
  assert.ok(naviLaunchBlocker({old:previous({end:"2026-09-29T00:00:00Z",endCleanupStatus:"running"})},"next",now,resetAt));
});

test("actual cleanup reconciliation completes once and failed retries stop after three",()=>{
  const receipt={version:1,ready_for_next_user:true,operation:"return_to_home",succeeded:true,
    damping_completed:true,terminal_state:"lowered_damped",run_id:"boot",elapsed_s:20,position_error_m:.02,
    final_heading_error_deg:1,final_state:{boot_finish:true,robot_ready:true,error:0,warning:0,estop:1,standing:false,action:0}};
  for(const succeeds of [true,false]) {
    const item=previous({endCleanupStatus:"running",endCleanupAttempts:1,localPlan:"plan",
      naviCleanupOwner:{pid:42,attempt_id:"attempt1",owner_file:"owner1",result_file:"result1"}});
    let launched=0;
    const files=new Map();
    const record=()=>{
      const owner=item.naviCleanupOwner;
      files.set(owner.owner_file,{version:1,attempt_id:owner.attempt_id,guardian_pid:owner.pid,phase:"finished"});
      files.set(owner.result_file,succeeds
        ? {version:1,attempt_id:owner.attempt_id,outcome:"verified",verified_at:resetAt,result:receipt}
        : {version:1,attempt_id:owner.attempt_id,outcome:"failed",error:"camera unavailable"});
    };
    record();
    const deps={state:{sessions:{old:item}},readFileSync:path=>JSON.stringify(files.get(path)),
      processRunning:()=>false,reconcileNaviCleanupOutcome:handoff.reconcileNaviCleanupOutcome,
      refreshNaviResetBaseline:()=>{throw Error("no verified reset baseline");},
      saveState:()=>{},localPython:"python",trustedNaviRunner:"runner",naviEnvironment:()=>({}),
      createNaviSessionOwner:()=>{const number=item.endCleanupAttempts;return {pid:null,attempt_id:`attempt${number}`,
        owner_file:`owner${number}`,result_file:`result${number}`};},
      spawn:()=>{launched++;return {pid:42+launched,on(){},unref(){}};},console:{log(){},error(){}}};
    deps.endCleanupCanRun=bridgeFunction("endCleanupCanRun","function reconcileNaviCleanup",{});
    deps.reconcileNaviCleanup=bridgeFunction("reconcileNaviCleanup","function finishSessionCleanup",deps);
    const finish=bridgeFunction("finishSessionCleanup","async function syncFinalSessionStatus",deps);
    finish("old",item);
    if(succeeds) {
      finish("old",item);
      assert.equal(item.endCleanupStatus,"completed");
      assert.equal(launched,0);
      assert.equal(deps.state.naviResetResult.run_id,"boot");
    } else {
      for(let index=0;index<6;index++) { finish("old",item); if(item.naviCleanupOwner) record(); }
      assert.equal(item.endCleanupStatus,"failed");
      assert.equal(item.endCleanupAttempts,3);
      assert.equal(launched,2);
      assert.ok(naviLaunchBlocker(deps.state.sessions,"next",now,resetAt));
    }
  }
});

test("live supervised baseline import survives cached state saves",()=>{
  const receipt={version:1,ready_for_next_user:true,operation:"return_to_home",succeeded:true,
    damping_completed:true,terminal_state:"lowered_damped",run_id:"old-boot",elapsed_s:20,position_error_m:.02,
    final_heading_error_deg:1,final_state:{boot_finish:true,robot_ready:true,error:0,warning:0,estop:1,standing:false,action:0}};
  const files=new Map([["supervised",JSON.stringify({version:1,verified_at:resetAt,result:{...receipt,run_id:"new-boot"}})]]);
  const state={sessions:{},naviResetVerifiedAt:"2026-09-29T00:00:00Z",naviResetResult:receipt};
  const deps={state,stateFile:"state",supervisedNaviBaselineFile:"supervised",Date:{now:()=>now},
    selectNaviResetBaseline:handoff.selectNaviResetBaseline,readFileSync:path=>files.get(path),
    saveGatewayState:(path,value)=>files.set(path,JSON.stringify(value))};
  const save=bridgeFunction("saveState","function refreshNaviResetBaseline",deps);
  const refresh=bridgeFunction("refreshNaviResetBaseline","function createNaviSessionOwner",deps);
  assert.equal(refresh().result.run_id,"new-boot");
  save();
  assert.equal(refresh().result.run_id,"new-boot");
  assert.equal(JSON.parse(files.get("supervised")).result.run_id,"new-boot");
});

test("actual stopSession blocks reset when kill fails or the runner stays alive", async () => {
  const source = readFileSync(new URL("./robot-stream-bridge.mjs", import.meta.url), "utf8");
  const body = source.split("async function stopSession(id) {")[1].split("\nfunction processRunning(item)")[0];
  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
  for (const killFails of [true, false]) {
    const item = previous({status:"running",pid:"123"});
    const events = [];
    let clock = 0;
    const deps = {state:{sessions:{old:item}},processRunning:()=>true,
      process:{kill:()=>{events.push("kill");if(killFails) throw new Error("kill denied");}},
      Date:{now:()=>clock},delay:async ms=>{clock+=ms;},
      run:()=>events.push("sdk-stop"),saveState:()=>events.push("saved"),
      localPython:"fake-python",trustedNaviRunner:"fake-runner",naviEnvironment:()=>({}),
      sshArgs:()=>[],robot:"fake"};
    const stop = new AsyncFunction("id", ...Object.keys(deps), body.slice(0,body.lastIndexOf("}")));
    await assert.rejects(stop("old", ...Object.values(deps)), killFails ? /kill denied/ : /reset blocked/);
    assert.equal(item.status,"running");
    assert.deepEqual(events,["kill"]);
    assert.ok(naviLaunchBlocker({old:item},"next",now,resetAt));
  }
});

for (const dependency of ["OBS", "capture publication"]) {
  test(`local ending reset precedes hung ${dependency} from another session`, {timeout:1000}, async () => {
    let release, reached;
    const stalled = new Promise(resolve=>{release=resolve;});
    const entered = new Promise(resolve=>{reached=resolve;});
    let recorded;
    const pending = tickFixture(false,(deps,events,state)=>{
      recorded=events;
      if(dependency === "OBS") {
        deps.stopObs=()=>{events.push("hung-OBS");reached();return stalled;};
      } else {
        // Insertion first reproduces a different completed runner whose
        // publication must not defer the expired Navi owner's local reset.
        state.sessions={other:previous({executionModel:"aegis",status:"running",end:"2999-01-01T00:00:00Z"}),...state.sessions};
        deps.publishCaptures=()=>{events.push("hung-capture");reached();return stalled;};
      }
    });
    try {
      await entered;
      assert.equal(recorded[0],"reset");
      assert.equal(recorded[1],dependency === "OBS" ? "hung-OBS" : "hung-capture");
    } finally {
      release();
    }
    await pending;
  });
}

test("next user waits for pending, running, or failed reset even after retry exhaustion", () => {
  for (const status of ["pending","running","failed"]) {
    assert.ok(naviLaunchBlocker({old:previous({endCleanupStatus:status,endCleanupAttempts:3})}, "next", now, resetAt));
  }
  assert.equal(naviLaunchBlocker({old:previous({endCleanupStatus:"completed"})}, "next", now, resetAt), null);
});

test("a still-active booked session blocks even if its commands completed early", () => {
  for (const status of ["running","publishing","completed"]) {
    assert.ok(naviLaunchBlocker({old:previous({status,end:"2026-09-30T03:01:00Z",endCleanupStatus:"completed"})}, "next", now, resetAt));
  }
});

test("verified supervised reset can supersede old failures without rewriting history", () => {
  const sessions = {old:previous({end:"2026-09-29T20:00:00Z",endCleanupStatus:"failed"})};
  assert.equal(naviLaunchBlocker(sessions, "next", now, resetAt), null);
  assert.equal(sessions.old.endCleanupStatus, "failed");
  assert.ok(naviLaunchBlocker(sessions, "next", now, null));
});

test("new future staged bookings and other robot models do not block reset-complete Navi", () => {
  assert.equal(naviLaunchBlocker({next:previous({status:"staged"}),later:previous({status:"staged"}),
    other:previous({executionModel:"aegis",status:"running"})}, "next", now, resetAt), null);
});

test("cleanup needs a verified bounded result, not merely process exit zero", () => {
  const receipt = {version:1, ready_for_next_user:true, operation:"return_to_home", succeeded:true,
    damping_completed:true, terminal_state:"lowered_damped",run_id:"verified-boot",elapsed_s:25,
    position_error_m:.025,final_heading_error_deg:2,
    final_state:{boot_finish:true,robot_ready:true,error:0,warning:0,estop:1,standing:false,action:0}};
  const encoded = value => `[navi-runner] cleanup-result ${JSON.stringify(value)}\n`;
  assert.deepEqual(parseNaviCleanupResult(encoded(receipt)), receipt);
  for (const bad of ["", "completed", encoded({...receipt,succeeded:false}),
    encoded({...receipt,position_error_m:.2}), encoded({...receipt,final_heading_error_deg:20}),
    encoded({...receipt,final_state:{...receipt.final_state,warning:1}}),
    encoded({...receipt,run_id:""}), encoded({...receipt,elapsed_s:null})]) {
    assert.throws(() => parseNaviCleanupResult(bad));
  }
});
