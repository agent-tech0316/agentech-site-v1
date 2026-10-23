import { parseExecutionResult } from './robot-session-execution-result.mjs';

export const MASTER_GATEWAY_PROTOCOL = 'master-arm-session-v1';

export function assertMasterExecutableSubmission(submission) {
  if (submission.run_mode === 'Master live stream test (view only)' || submission.ai_security_model === 'view-only-test-bypass') {
    throw new Error('Master view-only submissions cannot authorize robot execution');
  }
}

export function createMasterSessionDeployment(config, session, item, attemptId) {
  if (config?.enabled !== true) throw new Error('Master execution deployment is not enabled');
  const start = Date.parse(session.scheduled_start);
  const end = Date.parse(session.scheduled_end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error('Master booking window is invalid');
  for (const hash of [item.executionSourceSha256, item.executionPlanSha256]) {
    if (!/^[0-9a-f]{64}$/.test(hash ?? '')) throw new Error('Master staged identity is invalid');
  }
  if (!session.id || !item.executionSubmissionId || !attemptId) throw new Error('Master session identity is missing');
  return { ...config, schema_version: 1, protocol: MASTER_GATEWAY_PROTOCOL, robot_model: 'master',
    session_id: String(session.id), submission_id: item.executionSubmissionId,
    source_sha256: item.executionSourceSha256, plan_sha256: item.executionPlanSha256,
    attempt_id: attemptId, scheduled_start: session.scheduled_start, scheduled_end: session.scheduled_end };
}

export function masterLaunchBlocker(sessions, id, item, nowMs = Date.now()) {
  if (!Number.isFinite(Date.parse(item.end)) || nowMs >= Date.parse(item.end)) return 'Master booked session has expired';
  if (!Number.isFinite(Date.parse(item.start)) || nowMs < Date.parse(item.start)) return 'Master booked session has not started';
  for (const [otherId, other] of Object.entries(sessions)) {
    if (String(otherId) === String(id) || other.executionModel !== 'master' || !other.executionAttemptId) continue;
    if (['running', 'publishing'].includes(other.status)) return `Master session ${otherId} is still running`;
    if (Number.isFinite(Date.parse(other.end)) && nowMs < Date.parse(other.end)) return `Master session ${otherId} still owns its booked window`;
    if (other.masterHandoffReady !== true) return `Master session ${otherId} requires a verified upper-body handoff`;
  }
  return null;
}

export function parseMasterExecutionResult(text, expected) {
  const result = parseExecutionResult(text, expected);
  const value = JSON.parse(text);
  if (value.robot_model !== 'master' || value.attempt_id !== expected.attemptId || value.booked_end !== expected.bookedEnd) {
    throw new Error('Master execution receipt identity does not match');
  }
  if (typeof value.handoff_ready !== 'boolean' || typeof value.owner_hold_preserved !== 'boolean') {
    throw new Error('Master execution receipt is missing hold/handoff evidence');
  }
  if (value.outcome === 'completed' && value.owner_hold_preserved && value.owner_hold_verified !== true) {
    throw new Error('Master completion requires final owner hold verification');
  }
  if (value.handoff_ready) {
    const first = value.owner_binding;
    const last = value.final_owner_binding;
    if (value.handoff_mode !== 'retained-hold' || value.owner_hold_verified !== true || value.owner_hold_preserved !== true
      || !first?.requestId || !Number.isInteger(first.publisherPid) || first.publisherPid <= 0
      || first.requestId !== last?.requestId || first.publisherPid !== last?.publisherPid
      || last?.ownerMode !== 'current-hold' || last?.aimdkMcMode !== 'STAND_DEFAULT'
      || last?.nativeOwner !== 'native-mc' || last?.sdk_fresh_ready_verified !== true
      || !['left', 'right'].every(side => last?.guidedSides?.includes(side))) {
      throw new Error('Master handoff requires a verified continuous bilateral raw-mode hold');
    }
  }
  return { ...result, attempt_id: value.attempt_id, booked_end: value.booked_end,
    handoff_ready: value.handoff_ready, owner_hold_preserved: value.owner_hold_preserved,
    owner_hold_verified: value.owner_hold_verified === true,
    handoff_mode: value.handoff_mode ?? null,
    owner_binding: value.owner_binding ?? null,
    final_owner_binding: value.final_owner_binding ?? null,
    hold_observation_error: value.hold_observation_error ?? null,
    handoff_blocker: typeof value.handoff_blocker === 'string' ? value.handoff_blocker.slice(0, 2000) : null,
    overrun_seconds: Number.isFinite(value.overrun_seconds) ? value.overrun_seconds : null,
    restore_verified: value.restore_verified ?? null };
}
