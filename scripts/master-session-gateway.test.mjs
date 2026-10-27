import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { masterLaunchBlocker, masterRecoveryForPlan, masterRecoveryForStagedPlan, masterReceiptNeedsReload, createMasterSessionDeployment, parseMasterExecutionResult, assertMasterExecutableSubmission } from './master-session-gateway.mjs';
import { createHash } from 'node:crypto';
import { endSessionCleanupPolicy } from './robot-stream-session-policy.mjs';

const start = '2026-10-23T01:00:00.000Z';
const end = '2026-10-23T01:05:00.000Z';
const hash = 'a'.repeat(64);
const session = { id: 42, scheduled_start: start, scheduled_end: end };
const item = { executionSubmissionId: 7, executionSourceSha256: hash, executionPlanSha256: hash };

test('only a restore-only plan can recover the exact failed owner without asserting a healthy handoff', () => {
  const owner = {requestId:'fault-owner', publisherPid:123, ownerMode:'current-hold'};
  const previous = {executionModel:'master', executionAttemptId:'failed-attempt', status:'finished', end:'2026-10-22T00:00:00Z',
    masterHandoffReady:false, executionResult:{outcome:'failed', owner_binding:owner}};
  const sessions = {41:previous};
  const plan = {commands:[{name:'restore_stand_hand_guide',args:{}}]};
  const recovery = masterRecoveryForPlan(plan, sessions, 42);
  const bytes = Buffer.from(JSON.stringify(plan));
  assert.deepEqual(masterRecoveryForStagedPlan(bytes,createHash('sha256').update(bytes).digest('hex'),sessions,42),recovery);
  assert.throws(() => masterRecoveryForStagedPlan(bytes,'f'.repeat(64),sessions,42), /hash changed/);
  assert.equal(recovery.previous_session_id,'41');
  assert.equal(masterLaunchBlocker(sessions,42,{start,end,masterRecoveryOwner:recovery},Date.parse(start)),null);
  assert.equal(previous.masterHandoffReady,false);
  assert.match(masterLaunchBlocker(sessions,42,{start,end},Date.parse(start)),/handoff/);
  assert.equal(masterRecoveryForPlan({commands:[...plan.commands,{name:'adjust_right_elbow',args:{degrees:45}}]},sessions,42),null);
  assert.match(masterLaunchBlocker({41:{...previous,status:'running'}},42,{start,end,masterRecoveryOwner:recovery},Date.parse(start)),/running/);
  assert.match(masterLaunchBlocker({41:{...previous,end}},42,{start,end,masterRecoveryOwner:recovery},Date.parse(start)),/window/);
  assert.match(masterLaunchBlocker(sessions,42,{start,end,masterRecoveryOwner:{...recovery,publisherPid:999}},Date.parse(start)),/handoff/);
  const recovered = {...previous, executionAttemptId:'restore-attempt', masterRecoveryOwner:recovery,masterHandoffReady:true,
    executionResult:{outcome:'completed',restore_verified:true}};
  assert.equal(masterLaunchBlocker({...sessions,42:recovered},43,{start,end},Date.parse(start)),null);
  assert.match(masterLaunchBlocker({...sessions,42:{...recovered,executionResult:{outcome:'failed',restore_verified:true}}},43,{start,end},Date.parse(start)),/handoff/);
});

test('camera-only Master audits never authorize execution, even when both review fields pass', () => {
  assert.throws(() => assertMasterExecutableSubmission({ run_mode: 'Master live stream test (view only)', ai_security_model: 'view-only-test-bypass' }), /view-only/);
  assert.throws(() => assertMasterExecutableSubmission({ run_mode: 'Software check', ai_security_model: 'view-only-test-bypass' }), /view-only/);
  assert.doesNotThrow(() => assertMasterExecutableSubmission({ run_mode: 'Software check', ai_security_model: 'review-model' }));
});

test('restore retries cover failed attempts only when the retained owner is identical', () => {
  const owner={requestId:'retained',publisherPid:123,ownerMode:'current-hold'};
  const failed=id=>({executionModel:'master',executionAttemptId:`attempt-${id}`,status:'finished',
    masterHandoffReady:false,executionResult:{outcome:'failed',owner_binding:{...owner}}});
  const sessions={40:failed(40),41:failed(41)};
  const plan={commands:[{name:'restore_stand_hand_guide'}]};
  const recovery=masterRecoveryForPlan(plan,sessions,42);
  assert.ok(recovery);
  assert.equal(masterLaunchBlocker(sessions,42,{start,end,masterRecoveryOwner:recovery},Date.parse(start)),null);
  const completed={executionModel:'master',masterRecoveryOwner:recovery,masterHandoffReady:true,
    executionResult:{outcome:'completed',restore_verified:true}};
  assert.equal(masterLaunchBlocker({...sessions,42:completed},43,{start,end},Date.parse(start)),null);
  sessions[41].executionResult.owner_binding.publisherPid=456;
  assert.equal(masterRecoveryForPlan(plan,sessions,42),null);
  assert.match(masterLaunchBlocker(sessions,42,{start,end,masterRecoveryOwner:recovery},Date.parse(start)),/handoff/);
});

test('Master binds the trusted deployment to the booking and exact staged plan', () => {
  const result = createMasterSessionDeployment({ enabled: true, host: '192.168.4.152', sdk_root: 'C:/sdk' }, session, item, 'attempt-42');
  assert.equal(result.host, '192.168.4.152');
  assert.equal(result.robot_model, 'master');
  assert.equal(result.session_id, '42');
  assert.equal(result.submission_id, 7);
  assert.equal(result.plan_sha256, hash);
  assert.equal(result.scheduled_end, end);
  assert.equal(result.attempt_id, 'attempt-42');
});

test('Master rejects disabled deployment and malformed or expired booking', () => {
  assert.throws(() => createMasterSessionDeployment({ enabled: false }, session, item, 'a'), /enabled/);
  assert.throws(() => createMasterSessionDeployment({ enabled: true }, { ...session, scheduled_end: start }, item, 'a'), /window/);
  assert.match(masterLaunchBlocker({}, 42, { start, end }, Date.parse(end)), /expired/);
  assert.match(masterLaunchBlocker({}, 42, { start, end }, Date.parse(start) - 1), /started/);
});

test('Master blocks overlap and unresolved handoff, including a runner with no saved PID', () => {
  const previous = { executionModel: 'master', executionAttemptId: 'prior', status: 'finished', masterHandoffReady: false };
  assert.match(masterLaunchBlocker({ 41: previous }, 42, { start, end }, Date.parse(start)), /handoff/);
  assert.equal(masterLaunchBlocker({ 41: { ...previous, masterHandoffReady: true } }, 42, { start, end }, Date.parse(start)), null);
  assert.match(masterLaunchBlocker({ 41: { ...previous, status: 'running', masterHandoffReady: true } }, 42, { start, end }, Date.parse(start)), /running/);
  assert.match(masterLaunchBlocker({ 41: { ...previous, status: 'completed', end, masterHandoffReady: true } }, 42, { start, end }, Date.parse(start)), /booked/);
});

test('Master session cleanup never selects a leg posture or generic stop', () => {
  assert.deepEqual(endSessionCleanupPolicy({ commands: [{ name: 'adjust_waist' }] }, 'master'), {
    required: false, returnHomeRequired: false, persistentOwner: true,
  });
});

function receipt() {
  return { schema_version: 1, outcome: 'completed', session_id: '42', submission_id: 7,
    source_sha256: hash, plan_sha256: hash, robot_model: 'master', attempt_id: 'attempt-42', booked_end: end,
    command_count: 1, completed_count: 1, started_at: start, finished_at: end,
    commands: [{ command_index: 1, name: 'adjust_right_elbow', args: { degrees: 10 }, source_args: { degrees: 10 },
      line: 1, status: 'completed', result: { executed: true }, error: null, duration_ms: 100 }],
    error: null, handoff_ready: false, owner_hold_preserved: true, owner_hold_verified: true };
}
const expected = { sessionId: 42, submissionId: 7, sourceSha256: hash, planSha256: hash, attemptId: 'attempt-42', bookedEnd: end };

test('Master receipts preserve execution versus handoff and reject foreign attempts', () => {
  const result = parseMasterExecutionResult(JSON.stringify(receipt()), expected);
  assert.equal(result.outcome, 'completed');
  assert.equal(result.handoff_ready, false);
  for (const patch of [{ robot_model: 'navi' }, { attempt_id: 'old' }, { booked_end: start }]) {
    assert.throws(() => parseMasterExecutionResult(JSON.stringify({ ...receipt(), ...patch }), expected));
  }
});

test('Master preserves bounded detailed SDK evidence beyond the generic Aegis receipt size', () => {
  const value = receipt();
  value.commands[0].result.sdkEvidence = 'x'.repeat(600 * 1024);
  assert.equal(parseMasterExecutionResult(JSON.stringify(value),expected).commands[0].result.sdkEvidence.length,600*1024);
  value.commands[0].result.sdkEvidence = 'x'.repeat(16 * 1024 * 1024);
  assert.throws(() => parseMasterExecutionResult(JSON.stringify(value),expected), /size/);
});

test('receipt size migration reads the existing Master artifact once and does not replay execution', () => {
  const item = {executionModel:'master', executionResultCollectionAttempted:true, executionResult:null,
    executionResultError:'MissingOrInvalidExecutionResult: execution result size exceeds the allowed bytes'};
  assert.equal(masterReceiptNeedsReload(item),true);
  for (const patch of [{masterReceiptSizeVersion:2},{executionModel:'aegis'},{executionResult:{}},
    {executionResultError:'MissingOrInvalidExecutionResult: identity mismatch'}]) {
    assert.equal(masterReceiptNeedsReload({...item,...patch}),false);
  }
});

test('Master receipt cannot claim retained-hold handoff without verified owner continuity', () => {
  assert.throws(() => parseMasterExecutionResult(JSON.stringify({ ...receipt(), handoff_ready: true }), expected), /hold/);
  const owner = {requestId: 'owner-42', publisherPid: 4242, ownerMode: 'current-hold', aimdkMcMode: 'STAND_DEFAULT', nativeOwner: 'native-mc', sdk_fresh_ready_verified: true, guidedSides: ['left', 'right']};
  const value = { ...receipt(), handoff_ready: true, handoff_mode: 'retained-hold', owner_binding: owner, final_owner_binding: owner };
  assert.equal(parseMasterExecutionResult(JSON.stringify(value), expected).handoff_ready, true);
  assert.throws(() => parseMasterExecutionResult(JSON.stringify({ ...value, final_owner_binding: { ...owner, publisherPid: 99 } }), expected), /hold/);
});

test('Movement A handoff requires a continuous verified native manipulation owner', () => {
  const owner = { requestId: 'movement-a-42', publisherPid: 4242, ownerMode: 'movement-a',
    aimdkMcMode: 'MANIPULATE_DEFAULT', nativeOwner: 'native-mc', sdk_fresh_ready_verified: true, guidedSides: ['right'] };
  const value = { ...receipt(), handoff_ready: true, handoff_mode: 'retained-movement-a',
    owner_binding: owner, final_owner_binding: owner };
  const result = parseMasterExecutionResult(JSON.stringify(value), expected);
  assert.equal(result.handoff_mode, 'retained-movement-a');
  assert.equal(result.handoff_ready, true);
  for (const patch of [{ requestId: 'other' }, { publisherPid: 99 }, { ownerMode: 'current-hold' },
    { aimdkMcMode: 'STAND_DEFAULT' }, { nativeOwner: 'other' }, { sdk_fresh_ready_verified: false }, { guidedSides: ['left'] }]) {
    assert.throws(() => parseMasterExecutionResult(JSON.stringify({ ...value, final_owner_binding: { ...owner, ...patch } }), expected), /handoff/);
  }
  for (const patch of [{ requestId: '' }, { publisherPid: 0 }]) {
    assert.throws(() => parseMasterExecutionResult(JSON.stringify({ ...value, owner_binding: { ...owner, ...patch } }), expected), /handoff/);
  }
  assert.throws(() => parseMasterExecutionResult(JSON.stringify({ ...value, owner_hold_preserved: false }), expected), /handoff/);
});

test('native-standing handoff requires initial and final native evidence without a publisher identity', () => {
  const owner = { ownerMode: 'native-standing', nativeOwner: 'native-mc', aimdkMcMode: 'STAND_DEFAULT',
    presetActionsReady: true, standingStateVerified: true, noActivePublisher: true, sdk_fresh_ready_verified: true };
  const value = { ...receipt(), handoff_ready: true, handoff_mode: 'native-standing', owner_hold_preserved: false,
    owner_binding: owner, final_owner_binding: owner };
  const result = parseMasterExecutionResult(JSON.stringify(value), expected);
  assert.equal(result.handoff_ready, true);
  assert.equal(result.handoff_mode, 'native-standing');
  assert.equal(result.owner_binding.requestId, undefined);
  assert.equal(result.final_owner_binding.publisherPid, undefined);
  for (const binding of ['owner_binding', 'final_owner_binding']) {
    for (const patch of [{ ownerMode: 'current-hold' }, { nativeOwner: 'other' }, { aimdkMcMode: 'MANIPULATE_DEFAULT' },
      { presetActionsReady: false }, { standingStateVerified: false }, { noActivePublisher: false }, { sdk_fresh_ready_verified: false },
      { requestId: 'invented-owner', publisherPid: 4242 }]) {
      assert.throws(() => parseMasterExecutionResult(JSON.stringify({ ...value, [binding]: { ...owner, ...patch } }), expected), /handoff/);
    }
  }
  assert.throws(() => parseMasterExecutionResult(JSON.stringify({ ...value, owner_hold_verified: false }), expected), /handoff/);
});

test('full restore handoff requires completed bilateral and waist evidence plus fresh released ownership', () => {
  const owner = { ownerMode:'native-hold', nativeOwner:'native-mc', aimdkMcMode:'STAND_DEFAULT',
    noActivePublisher:true, sdk_fresh_ready_verified:true };
  const command = { ...receipt().commands[0], name:'restore_stand_hand_guide', args:{}, source_args:{},
    result:{upperBodyPoseVerified:true, absoluteReturnVerified:true, ownerReleasedAfterBothReturnsVerified:true} };
  const value = {...receipt(), commands:[command], restore_verified:true, owner_release_verified:true,
    owner_hold_preserved:false, handoff_ready:true, handoff_mode:'native-hold', owner_binding:owner, final_owner_binding:owner};
  assert.equal(parseMasterExecutionResult(JSON.stringify(value), expected).handoff_ready,true);
  for (const patch of [{restore_verified:false}, {owner_release_verified:false}, {owner_hold_verified:false},
    {commands:receipt().commands}, {commands:[{...command,result:{...command.result,upperBodyPoseVerified:false}}]},
    {final_owner_binding:{...owner,requestId:'stale',publisherPid:42}}, {final_owner_binding:{...owner,noActivePublisher:false}}]) {
    assert.throws(() => parseMasterExecutionResult(JSON.stringify({...value,...patch}),expected), /handoff/);
  }
});

test('failed final Master hold verification is retained as execution failure', () => {
  const failure = { type: 'RuntimeError', message: 'owner faulted', command: 'verify_master_hold' };
  const value = { ...receipt(), outcome: 'failed', owner_hold_verified: false, error: failure, hold_observation_error: failure };
  const result = parseMasterExecutionResult(JSON.stringify(value), expected);
  assert.equal(result.outcome, 'failed');
  assert.equal(result.owner_hold_verified, false);
  assert.equal(result.hold_observation_error.message, 'owner faulted');
});

test('bridge routes Master locally with cancellation and never enters generic process termination', () => {
  const source = readFileSync(new URL('./robot-stream-bridge.mjs', import.meta.url), 'utf8');
  assert.match(source, /trusted-master-runner\.py/);
  assert.match(source, /parseMasterExecutionResult/);
  const stop = source.slice(source.indexOf('async function stopSession'), source.indexOf('function processRunning'));
  assert.ok(stop.indexOf('executionModel === "master"') >= 0);
  assert.ok(stop.indexOf('executionModel === "master"') < stop.indexOf('process.kill'));
  assert.match(stop, /masterCancelFile/);
});
