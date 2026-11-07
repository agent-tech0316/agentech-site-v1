import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MasterReadinessChecks } from './master-readiness-check.mjs';
import { masterBookingAdmission, masterFirstCommandNotBefore } from './master-booking-admission.mjs';

function booking(t) {
  const runtimeDir=mkdtempSync(join(tmpdir(),'master-admission-'));
  t.after(()=>rmSync(runtimeDir,{recursive:true,force:true}));
  const start=new Date(Date.now()-2000).toISOString(),end=new Date(Date.now()+120000).toISOString();
  const session={id:200,email:'owner@example.test',code_submission_id:'approved',session_status:'scheduled',
    approved_run_type:'custom_code',robot_model:'Master',scheduled_start:start,scheduled_end:end};
  const plan=JSON.stringify({version:2,robot_model:'master',submission_id:'approved',source_sha256:'1'.repeat(64),
    commands:[{name:'turn_head',args:{angle_degrees:20}}]});
  const item={accountEmail:session.email,start,end,executionModel:'master',executionSubmissionId:'approved',
    executionSourceSha256:'1'.repeat(64),executionPlanSha256:createHash('sha256').update(plan).digest('hex'),
    localPlan:join(runtimeDir,'session-200.plan.json')};
  writeFileSync(item.localPlan,plan);
  const deploymentFile=join(runtimeDir,'master-config.json');
  writeFileSync(deploymentFile,JSON.stringify({enabled:true,robot_model:'master',host:'test.invalid',sdk_root:runtimeDir}));
  let finish;
  const ready=new Promise(resolve=>{finish=resolve;});
  const ops={sessions:{200:item},runtimeDir,deploymentFile,claimableStatuses:['scheduled'],
    masterChecks:new MasterReadinessChecks({onReady:finish}), calls:[]};
  ops.runCheck=async ({planPath,deploymentPath,timeoutMs})=>{
    const config=JSON.parse(readFileSync(deploymentPath));
    assert.equal(config.session_id,'200'); assert.equal(config.plan_sha256,item.executionPlanSha256);
    assert.equal(config.attempt_id,item.masterPreparedAttemptId); assert.equal(planPath,item.localPlan);
    assert.ok(timeoutMs>0); ops.calls.push(config.attempt_id);
    return {ready:true,robot_model:'master',robot_commands_sent:false,plan_sha256:item.executionPlanSha256};
  };
  return {session,item,ops,ready,run:()=>masterBookingAdmission(session,item,ops)};
}

test('Master starts a fresh read-only check of each booked plan before admitting it', async t=>{
  const f=booking(t);
  assert.equal(f.run().status,'waiting'); await f.ready;
  assert.equal(f.run().status,'ready'); assert.equal(f.ops.calls.length,1);
});

test('another Master owner blocks the next check, and a different account cannot claim a staged plan',t=>{
  const f=booking(t);
  f.ops.sessions[150]={executionModel:'master',status:'running',executionAttemptId:'other',end:f.item.end};
  assert.match(f.run().reason,/still running/);
  delete f.ops.sessions[150]; f.session.email='different@example.test';
  assert.match(f.run().reason,/booking changed/); assert.deepEqual(f.ops.calls,[]);
});

test('pre-slot preparation is read-only and the same fresh evidence is consumed only after opening', async t=>{
  const f=booking(t);
  const start=Date.now()+15000;
  f.item.start=f.session.scheduled_start=new Date(start).toISOString();
  let now=start-15000;
  let done;
  const ready=new Promise(resolve=>{done=resolve;});
  const options={...f.ops,now:()=>now,masterChecks:new MasterReadinessChecks({now:()=>now,onReady:done})};
  const prepare=()=>masterBookingAdmission(f.session,f.item,{...options,prepareOnly:true});
  const launch=()=>masterBookingAdmission(f.session,f.item,options);
  assert.equal(prepare().status,'waiting');
  assert.equal(options.calls.length,1);
  now=start-2000;
  await ready;
  assert.equal(prepare().status,'waiting');
  now=start;
  assert.equal(launch().status,'ready');
  assert.equal(options.calls.length,1);
  assert.equal(launch().status,'waiting');
  assert.equal(options.calls.length,2);
});

test('Master first command uses booked stream availability and never extends its booking', ()=>{
  const start=Date.parse('2026-11-05T21:50:00Z');
  const item={start:new Date(start).toISOString(),end:new Date(start+60000).toISOString(),
    streamStatus:'publishing',masterViewerStreamStartedAt:new Date(start-60000).toISOString()};
  assert.throws(()=>masterFirstCommandNotBefore(item,start-1),/open booking/);
  assert.equal(Date.parse(masterFirstCommandNotBefore(item,start)),start+20000);
  assert.equal(Date.parse(masterFirstCommandNotBefore(item,start+45000)),start+20000);
  item.masterViewerStreamStartedAt=new Date(start+10000).toISOString();
  assert.equal(Date.parse(masterFirstCommandNotBefore(item,start+18000)),start+30000);
  assert.throws(()=>masterFirstCommandNotBefore(item,start+9999),/publishing stream/);
  item.end=new Date(start+30000).toISOString();
  assert.throws(()=>masterFirstCommandNotBefore(item,start+11000),/booking ends/);
});

test('Master calibrates preflight cost early but yields to an earlier staged Master booking', async t=>{
  const f=booking(t);
  const now=Date.now();
  f.item.start=f.session.scheduled_start=new Date(now+85000).toISOString();
  const prepare=()=>masterBookingAdmission(f.session,f.item,{...f.ops,prepareOnly:true,now:()=>now});
  f.ops.sessions[199]={executionModel:'master',status:'staged',start:new Date(now+20000).toISOString(),
    end:new Date(now+80000).toISOString()};
  assert.equal(prepare().status,'waiting');
  assert.equal(f.ops.calls.length,0);
  // A different physical model has no claim on the Master's read-only channel.
  f.ops.sessions[199].executionModel='navi';
  assert.equal(prepare().status,'waiting');
  assert.equal(f.ops.calls.length,1);
  await f.ready;
});
