import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash,createHmac } from 'node:crypto';
import { mkdtempSync,mkdirSync,writeFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { masterUnresolvedSessions,masterTargetDigest,nativeHandoffPath } from './master-native-handoff.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const domain='EAIC/Master/native-control-handoff/v1';
const secret='test-only-signing-key-for-offline-handoff';
function caseFixture(t,change=()=>{}) {
  const runtime=mkdtempSync(join(tmpdir(),'master-native-handoff-'));
  t.after(()=>rmSync(runtime,{recursive:true,force:true}));
  const old=process.env.AGENTECH_MASTER_HANDOFF_EVIDENCE_KEY;
  process.env.AGENTECH_MASTER_HANDOFF_EVIDENCE_KEY=secret;
  t.after(()=>{if(old===undefined) delete process.env.AGENTECH_MASTER_HANDOFF_EVIDENCE_KEY; else process.env.AGENTECH_MASTER_HANDOFF_EVIDENCE_KEY=old;});
  const id='101', attempt='attempt-101', now=Date.now(), at=offset=>new Date(now+offset).toISOString();
  const cfg={sdk_api_sha256:'3'.repeat(64),host:'test.invalid',ssh_username:'robot',lease_file:'master.lease'};
  const plan={version:2,robot_model:'master',submission_id:'sub',source_sha256:'1'.repeat(64),commands:[{name:'heart',args:{hand:'both'}}]};
  const common={session_id:id,attempt_id:attempt,plan_sha256:sha(JSON.stringify(plan)),source_sha256:plan.source_sha256,submission_id:'sub'};
  const binding={ownerMode:'native-hold',presetActionsReady:false,nativeOwner:'native-mc',aimdkMcMode:'STAND_DEFAULT',manipulationPublishers:0,
    rawGuidanceActive:false,noActivePublisher:true,sdk_fresh_ready_verified:true,standingStateVerified:true,
    nativeStandingControlActive:true,nativeCommandOwnersVerified:true,nativeBalanceEvidenceVerified:true,
    completeArmCommandFrameVerified:true,completeArmStateFrameVerified:true,nativeGestureOwnerVerified:true,
    nativeMotionIdleVerified:true,heartStartPoseVerified:true};
  const idle={samples:4,firstSequence:1,lastSequence:4,dwellMs:300,playerState:0,inputSource:'native',bootId:'boot',
    mcNode:'native',installedBuild:'approved',waistReference:'recorded-heart-offset'};
  const before={...binding,nativeIdleObservation:idle,observed_at:at(-5000)};
  const after={...binding,nativeIdleObservation:{...idle,firstSequence:7,lastSequence:10},observed_at:at(-3000)};
  const error={type:'RuntimeError',message:'SetMcPresetMotion returned invalid task id 0',command_index:1,command:'heart'};
  const end=at(-8000);
  const receipt={schema_version:1,...common,robot_model:'master',outcome:'failed',booked_end:end,started_at:at(-20000),finished_at:at(-11000),
    owner_binding:binding,handoff_ready:false,owner_hold_preserved:false,owner_hold_verified:false,command_count:1,completed_count:0,error,commands:[{name:'heart',command_index:1,
    source_args:{hand:'both'},args:{hand:'both'},duration_ms:500,result:null,error,status:'failed',line:1}]};
  const proof={schema_version:1,kind:'native-control-handoff',robot_model:'master',previous_session_id:id,previous_attempt_id:attempt,
    plan_sha256:common.plan_sha256,source_sha256:common.source_sha256,submission_id:'sub',sdk_api_sha256:cfg.sdk_api_sha256,
    target_sha256:masterTargetDigest(cfg),failed_result_sha256:sha(JSON.stringify(receipt)),read_only:true,robot_commands_sent:false,
    failed_outcome_preserved:true,native_binding_before:before,native_binding:after,observed_at:at(-2000),
    unkeyed_terminal:{task:0,state:1,before_ns:'1000000000',terminal_ns:'1000000040',after_ns:'1000000100'}};
  const prev={executionModel:'master',executionAttemptId:attempt,executionStatus:'failed',status:'finished',masterHandoffReady:false,
    executionSubmissionId:'sub',executionSourceSha256:plan.source_sha256,executionPlanSha256:common.plan_sha256,end,executionResult:{outcome:'failed'}};
  const origin={...common,...cfg,scheduled_end:end},options={signature:true};
  change({proof,origin,options});
  const write=(name,obj)=>writeFileSync(join(runtime,name),JSON.stringify(obj));
  write('session-101.plan.json',plan);write('session-101.attempt-101.master-result.json',receipt);write('session-101.attempt-101.master.json',origin);
  mkdirSync(join(runtime,'master-native-handoffs'));
  const payload=JSON.stringify(proof),key=createHmac('sha256',secret).update(domain).digest();
  const signature=options.signature ? createHmac('sha256',key).update(payload).digest('hex') : '0'.repeat(64);
  writeFileSync(nativeHandoffPath(runtime,id,attempt,cfg.sdk_api_sha256),JSON.stringify({format:domain,payload,signature}));
  const sessions={101:prev,102:{executionModel:'master',status:'running'}};
  return ()=>masterUnresolvedSessions(sessions,runtime,cfg,now);
}

test('signed terminal observation resolves only its own expired failed native attempt',t=>{
  assert.deepEqual(Object.keys(caseFixture(t)()),['102']);
});
test('changed lease, invalid signature, stale native timestamp or unfinished owner cannot clear an attempt',t=>{
  for(const change of [({origin})=>{origin.lease_file='different';},({options})=>{options.signature=false;},
    ({proof})=>{proof.unkeyed_terminal.terminal_ns='999999999';},
    ({proof})=>{proof.native_binding.nativeIdleObservation.bootId='different';}]){
    assert.throws(caseFixture(t,change),/native handoff/i);
  }
});
