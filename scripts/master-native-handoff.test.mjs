import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash,createHmac } from 'node:crypto';
import { mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync,utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { masterUnresolvedSessions,masterTargetDigest,nativeHandoffPath,verifyNativeHandoff } from './master-native-handoff.mjs';
import { parseMasterExecutionResult } from './master-session-gateway.mjs';

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

function bodyAttempt(booked=false) {
  const spec=JSON.parse(readFileSync(new URL('./master-happy-dance.json',import.meta.url)));
  const asset='d927d8cc-c519-4f41-b566-68a90ecf48e9', id='106', owner='mc_ros2_node3097';
  const now=Date.now(), at=delta=>new Date(now+delta).toISOString(), end=at(-12000);
  const args={motion_name:spec.motion,audio_path:''};
  const plan={version:2,robot_model:'master',asset_id:asset,submission_id:'master-body-'+asset,source_sha256:sha(spec.source),
    commands:[{name:'play_body',args,line:1}]};
  let manifest;
  if (booked) {
    const digest='e'.repeat(64);
    manifest={asset_id:asset,asset_sha256:digest,policy:{sha256:digest},audio:null,model:'Master Ultra',
      motion:'linkcraft_resource_onnx_ffeaic'+digest+'_0.0.1'};
    args.motion_name=manifest.motion;
    Object.assign(plan,{submission_id:'master-body-v2-'+asset,native_body_manifest:manifest,source_sha256:sha('fixture')});
  }
  const planBytes=Buffer.from(JSON.stringify(plan));
  const common={session_id:id,attempt_id:'body-attempt',submission_id:plan.submission_id,source_sha256:plan.source_sha256,plan_sha256:sha(planBytes)};
  const error={type:'RuntimeError',message:'Invalid joint feedback: leg'};
  const pkg={asset_id:asset,zip_sha256:spec.zip,policy_sha256:spec.policy,audio_sha256:spec.audio,serial:spec.serial};
  if (booked) {
    delete pkg.zip_sha256;
    Object.assign(pkg,{asset_sha256:manifest.asset_sha256,policy_sha256:manifest.policy.sha256,audio_sha256:null,
      model:'Master Ultra',request_attempted:true});
  }
  const initial={mode:'STAND_DEFAULT',settled:true,player:0,owner};
  const receipt={schema_version:1,robot_model:'master',...common,outcome:'failed',booked_end:end,started_at:at(-85000),finished_at:at(-24000),
    command_count:1,completed_count:0,handoff_ready:false,owner_hold_preserved:false,owner_hold_verified:false,owner_binding:initial,error,
    commands:[{name:'play_body',command_index:1,line:1,args,source_args:args,status:'failed',started_at:at(-85000),sdk_call_started_at:at(-84000),
      duration_ms:61000,error,result:{...pkg,request_attempted:true,play_response:'Play success',bundled_audio:'audio.wav'}}]};
  if (booked) receipt.body_start_authority='signed_booking';
  const config={host:'fixture.invalid',sdk_api_sha256:'3'.repeat(64)};
  const previous={status:'finished',executionStatus:'failed',executionModel:'master',masterHandoffReady:false,end,executionAttemptId:common.attempt_id,
    executionSubmissionId:common.submission_id,executionSourceSha256:common.source_sha256,executionPlanSha256:common.plan_sha256,executionResult:{outcome:'failed'}};
  const sides=(names)=>['left','right'].flatMap(side=>names.map(name=>side+'_'+name+'_joint'));
  const names={arm:sides(['shoulder_pitch','shoulder_roll','shoulder_yaw','elbow','wrist_yaw','wrist_pitch','wrist_roll']),
    leg:sides(['hip_pitch','hip_roll','hip_yaw','knee','ankle_pitch','ankle_roll']),waist:['waist_pitch_joint','waist_roll_joint','waist_yaw_joint'],
    head:['head_yaw_joint','head_pitch_joint']};
  function window(i) {
    const base=i*1000000000;
    return {...initial,receiver_id:'b350bb0a-22c3-4b16-ba1e-1913bb4329e'+i,boot_id:'a256db46-151e-42f3-bbd1-3a3fee0227cf',serial:spec.serial,
      status:100,body:1,motion:'',input_source:'app_proxy',mode_before_ns:String(base),mode_after_ns:String(base+600000000),dwell_ms:500,
      command_owners:{arm:owner,leg:owner,waist:owner,head:owner,hand:owner,mc:owner},hand_types:[0,0],manipulation_publishers:0,competing_body_pose_publishers:0,mc_body_pose_subscriber:true,
      frames:Object.fromEntries(['arm','leg','waist','head','hand','mc','chest','torso'].map(k=>[k,{first_ns:String(base+20000000),last_ns:String(base+520000000),count:12,max_gap_ms:55}])),
      joints:Object.fromEntries(Object.entries(names).map(([k,v])=>[k,{names:v,peak_velocity:.014,frame_state:0,max_error_code:0}])),
      imus:Object.fromEntries(['chest','torso'].map(k=>[k,{min_acc:9.72,max_acc:9.83,peak_gyro:.02}])),observed_at:at(i===1?-5000:-3000)};
  }
  const proof={schema_version:1,kind:'native-control-handoff',robot_model:'master',read_only:true,robot_commands_sent:false,failed_outcome_preserved:true,
    previous_session_id:id,previous_attempt_id:common.attempt_id,submission_id:common.submission_id,source_sha256:common.source_sha256,plan_sha256:common.plan_sha256,
    sdk_api_sha256:config.sdk_api_sha256,target_sha256:masterTargetDigest(config),observed_at:at(-2000),body_package:pkg,native_binding_before:window(1),native_binding:window(2)};
  return {proof,receipt,plan,config,previous,check(){ const receiptBytes=Buffer.from(JSON.stringify(receipt)); proof.failed_result_sha256=sha(receiptBytes);
    return verifyNativeHandoff(proof,{id,previous,config,receiptBytes,planBytes,nowMs:now}); }};
}

test('a failed accepted body request is discharged only by two independently measured terminal windows for its package',()=>{
  const good=bodyAttempt(); assert.equal(good.check().body_package.serial,good.receipt.commands[0].result.serial);
  for(const change of [p=>{p.native_binding.receiver_id=p.native_binding_before.receiver_id;},p=>{p.native_binding.player=2;},
    p=>{p.native_binding.command_owners.leg='another';},p=>{p.native_binding.competing_body_pose_publishers=1;},
    p=>{p.native_binding.joints.leg.names[0]='wrong';},p=>{p.native_binding.joints.leg.max_error_code=3;},
    p=>{p.native_binding.imus.torso.peak_gyro=.4;},p=>{p.native_binding.frames.leg.first_ns=p.native_binding_before.frames.leg.last_ns;},
    p=>{p.native_binding.frames.chest.count=1;},p=>{p.body_package.audio_sha256='0'.repeat(64);},
    (p,r)=>{r.commands[0].result.serial='wrong';},(p,r)=>{delete r.commands[0].result.play_response;}]) {
    const bad=bodyAttempt(); change(bad.proof,bad.receipt); assert.throws(()=>bad.check(),/native handoff/i);
  }
});

test('a proven signed-booking cancellation before viewer countdown closes only that unplayed attempt',t=>{
  const root=mkdtempSync(join(tmpdir(),'cancelled-master-')); t.after(()=>rmSync(root,{recursive:true,force:true}));
  const now=Date.now(),at=n=>new Date(now+n).toISOString(),start=at(-100000),end=at(-30000),finish=at(-84000),gate=at(-80000);
  const {receipt:r,plan,config,previous}=bodyAttempt(); const attempt='ac718d3b-ec82-447a-8c7c-374af7221ee0';
  const path=join(root,'session-107.'+attempt),planPath=join(root,'session-107.plan.json');
  const marker=path+'.cancel',manifest=path+'.master.json',raw=path+'.master-result.json';
  const error={type:'RuntimeError',message:'Master session cancelled; no further command admitted'};
  Object.assign(r,{session_id:'107',attempt_id:attempt,booked_end:end,started_at:at(-99700),finished_at:finish,body_start_authority:'signed_booking',
    first_command_not_before:gate,error,overrun_seconds:0}); delete r.owner_binding;
  Object.assign(r.commands[0],{result:{},error,started_at:at(-99600),duration_ms:15600});delete r.commands[0].sdk_call_started_at;
  Object.assign(previous,{executionAttemptId:attempt,masterPreparedAttemptId:attempt,start,end,bodyAssetId:plan.asset_id,bodyBookingClaimedAt:at(-99800),
    masterViewerStreamStartedAt:at(-120000),masterFirstCommandNotBefore:gate,masterCancelFile:marker,masterSessionDeployment:manifest,
    executionResultPersisted:true,localExecutionResult:raw,localPlan:planPath});
  const origin={...config,enabled:true,schema_version:1,protocol:'master-arm-session-v1',robot_model:'master',session_id:'107',attempt_id:attempt,
    scheduled_start:start,scheduled_end:end,source_sha256:r.source_sha256,plan_sha256:r.plan_sha256,submission_id:r.submission_id,native_body_asset_id:plan.asset_id,
    native_body_start_policy:'signed_booking'};
  const write=(filename,value)=>writeFileSync(filename,JSON.stringify(value));
  const run=(change=()=>{})=>{
    const data=structuredClone({r,plan,previous,origin});data.markTime=at(-84100);
    data.previous.executionResult=parseMasterExecutionResult(JSON.stringify(r),{sessionId:'107',attemptId:attempt,submissionId:r.submission_id,
      sourceSha256:r.source_sha256,planSha256:r.plan_sha256,bookedEnd:end});
    change(data);write(manifest,data.origin);write(raw,data.r);write(planPath,data.plan);writeFileSync(marker,'hold');utimesSync(marker,new Date(data.markTime),new Date(data.markTime));
    return Object.keys(masterUnresolvedSessions({'107':data.previous,'108':{executionModel:'master',status:'staged'}},root,config,now));
  };
  assert.deepEqual(run(),['108']);
  for (const change of [x=>{x.r.commands[0].sdk_call_started_at=x.r.started_at;},x=>{x.r.commands[0].result.request_attempted=true;},
    x=>{x.r.owner_binding={};},x=>{x.previous.masterViewerStreamStartedAt=at(-95000);},x=>{x.r.finished_at=gate;},x=>{x.markTime=at(-70000);},
    x=>{x.previous.executionResult.commands[0].result.play_response='Play success';},x=>{x.previous.claimedWithoutLaunch=true;},
    x=>{x.origin.host='different';},x=>{x.r.error.message='native request timed out';},x=>{x.plan.commands[0].args.audio_path='changed';}]) {
    assert.deepEqual(run(change),['107','108']);
  }
});

test('generic failed motion handoff binds exact attempted package; only explicit pre-dispatch may omit install evidence',()=>{
  const failed=bodyAttempt(true);
  assert.equal(failed.check().body_package.request_attempted,true);
  delete failed.receipt.commands[0].result.play_response;
  assert.throws(()=>failed.check(),/handoff/);
  const idle=bodyAttempt(true), cmd=idle.receipt.commands[0], result=cmd.result;
  delete idle.receipt.owner_binding;
  delete cmd.sdk_call_started_at;
  for(const field of ['serial','play_response','bundled_audio']) delete result[field];
  Object.assign(result,{request_attempted:false,motion_complete:false,music_played:null,audio_output:null});
  idle.proof.body_package.request_attempted=false;
  assert.equal(idle.check().body_package.request_attempted,false);
  result.partial_observation={};
  assert.throws(()=>idle.check(),/handoff/);
});
