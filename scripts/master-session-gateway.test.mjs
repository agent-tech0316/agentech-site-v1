import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { masterLaunchBlocker, createMasterSessionDeployment, parseMasterExecutionResult, assertMasterExecutableSubmission } from './master-session-gateway.mjs';
import { endSessionCleanupPolicy } from './robot-stream-session-policy.mjs';

const start = '2026-10-23T01:00:00.000Z';
const end = '2026-10-23T01:05:00.000Z';
const hash = 'a'.repeat(64);
const session = { id: 42, scheduled_start: start, scheduled_end: end };
const item = { executionSubmissionId: 7, executionSourceSha256: hash, executionPlanSha256: hash };

test('camera-only Master audits never authorize execution, even when both review fields pass', () => {
  assert.throws(() => assertMasterExecutableSubmission({ run_mode: 'Master live stream test (view only)', ai_security_model: 'view-only-test-bypass' }), /view-only/);
  assert.throws(() => assertMasterExecutableSubmission({ run_mode: 'Software check', ai_security_model: 'view-only-test-bypass' }), /view-only/);
  assert.doesNotThrow(() => assertMasterExecutableSubmission({ run_mode: 'Software check', ai_security_model: 'review-model' }));
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

test('Master receipt cannot claim retained-hold handoff without verified owner continuity', () => {
  assert.throws(() => parseMasterExecutionResult(JSON.stringify({ ...receipt(), handoff_ready: true }), expected), /hold/);
  const owner = {requestId: 'owner-42', publisherPid: 4242, ownerMode: 'current-hold', aimdkMcMode: 'STAND_DEFAULT', nativeOwner: 'native-mc', sdk_fresh_ready_verified: true, guidedSides: ['left', 'right']};
  const value = { ...receipt(), handoff_ready: true, handoff_mode: 'retained-hold', owner_binding: owner, final_owner_binding: owner };
  assert.equal(parseMasterExecutionResult(JSON.stringify(value), expected).handoff_ready, true);
  assert.throws(() => parseMasterExecutionResult(JSON.stringify({ ...value, final_owner_binding: { ...owner, publisherPid: 99 } }), expected), /hold/);
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
