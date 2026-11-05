import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MasterReadinessChecks } from './master-readiness-check.mjs';
import { masterBookingAdmission } from './master-booking-admission.mjs';

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
