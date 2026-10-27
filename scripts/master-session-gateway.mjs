import { parseExecutionResult } from './robot-session-execution-result.mjs';
import { createHash } from 'node:crypto';

export const MASTER_GATEWAY_PROTOCOL = 'master-arm-session-v1';

export function masterReceiptNeedsReload(item) {
  return item.executionModel === 'master' && item.executionResultCollectionAttempted === true
    && item.executionResult == null && item.masterReceiptSizeVersion !== 2
    && item.executionResultError === 'MissingOrInvalidExecutionResult: execution result size exceeds the allowed bytes';
}

export function masterRecoveryForStagedPlan(bytes, expectedHash, sessions, id) {
  if (createHash('sha256').update(bytes).digest('hex') !== expectedHash) throw new Error('Master staged plan hash changed');
  return masterRecoveryForPlan(JSON.parse(bytes.toString('utf8')), sessions, id);
}

export function masterRecoveryForPlan(plan, sessions, id) {
  if (plan?.commands?.length !== 1 || plan.commands[0].name !== 'restore_stand_hand_guide') return null;
  const unresolved = Object.entries(sessions).filter(([otherId, other]) => String(otherId) !== String(id)
    && other.executionModel === 'master' && other.executionAttemptId && !masterHandoffResolved(sessions, otherId, other));
  if (!unresolved.length) return null;
  const [previousId, previous] = unresolved[unresolved.length - 1];
  const owner = previous.executionResult?.owner_binding;
  if (!['completed', 'finished'].includes(previous.status) || previous.executionResult?.outcome !== 'failed'
    || owner?.ownerMode !== 'current-hold' || !owner.requestId || !Number.isInteger(owner.publisherPid) || owner.publisherPid <= 0) return null;
  if (!unresolved.every(([, other]) => ['completed', 'finished'].includes(other.status)
    && other.executionResult?.outcome === 'failed'
    && ['requestId', 'publisherPid', 'ownerMode'].every(key => other.executionResult?.owner_binding?.[key] === owner[key]))) return null;
  return { previous_session_id: String(previousId), previous_attempt_id: previous.executionAttemptId,
    requestId: owner.requestId, publisherPid: owner.publisherPid, ownerMode: owner.ownerMode,
    previous_attempts: unresolved.map(([sessionId, other]) => ({session_id: String(sessionId), attempt_id: other.executionAttemptId})) };
}

function recoveryMatches(recovery, id, previous) {
  const owner = previous.executionResult?.owner_binding;
  const attemptMatches = (recovery?.previous_session_id === String(id) && recovery.previous_attempt_id === previous.executionAttemptId)
    || recovery?.previous_attempts?.some(attempt => attempt.session_id === String(id) && attempt.attempt_id === previous.executionAttemptId);
  return attemptMatches && recovery.requestId === owner?.requestId && recovery.publisherPid === owner?.publisherPid
    && owner?.ownerMode === 'current-hold';
}

function masterHandoffResolved(sessions, id, previous) {
  if (previous.masterHandoffReady === true) return true;
  return Object.values(sessions).some(recovery => recoveryMatches(recovery.masterRecoveryOwner, id, previous)
    && recovery.masterHandoffReady === true && recovery.executionResult?.outcome === 'completed'
    && recovery.executionResult?.restore_verified === true);
}

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
    attempt_id: attemptId, scheduled_start: session.scheduled_start, scheduled_end: session.scheduled_end,
    ...(item.masterRecoveryOwner ? { recovery_owner_binding: item.masterRecoveryOwner } : {}) };
}

export function masterLaunchBlocker(sessions, id, item, nowMs = Date.now()) {
  if (!Number.isFinite(Date.parse(item.end)) || nowMs >= Date.parse(item.end)) return 'Master booked session has expired';
  if (!Number.isFinite(Date.parse(item.start)) || nowMs < Date.parse(item.start)) return 'Master booked session has not started';
  for (const [otherId, other] of Object.entries(sessions)) {
    if (String(otherId) === String(id) || other.executionModel !== 'master' || !other.executionAttemptId) continue;
    if (['running', 'publishing'].includes(other.status)) return `Master session ${otherId} is still running`;
    if (Number.isFinite(Date.parse(other.end)) && nowMs < Date.parse(other.end)) return `Master session ${otherId} still owns its booked window`;
    if (!masterHandoffResolved(sessions, otherId, other) && !recoveryMatches(item.masterRecoveryOwner, otherId, other)) return `Master session ${otherId} requires a verified upper-body handoff`;
  }
  return null;
}

export function parseMasterExecutionResult(text, expected) {
  // Master retains measured SDK telemetry per command. Keep a bounded budget
  // for up to 256 commands without dropping warnings or endpoint evidence.
  const result = parseExecutionResult(text, expected, { maxBytes: 16 * 1024 * 1024 });
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
    if (value.handoff_mode === 'retained-hold') {
      if (value.owner_hold_verified !== true || value.owner_hold_preserved !== true
        || !first?.requestId || !Number.isInteger(first.publisherPid) || first.publisherPid <= 0
        || first.requestId !== last?.requestId || first.publisherPid !== last?.publisherPid
        || last?.ownerMode !== 'current-hold' || last?.aimdkMcMode !== 'STAND_DEFAULT'
        || last?.nativeOwner !== 'native-mc' || last?.sdk_fresh_ready_verified !== true
        || !['left', 'right'].every(side => last?.guidedSides?.includes(side))) {
        throw new Error('Master handoff requires a verified continuous bilateral raw-mode hold');
      }
    } else if (value.handoff_mode === 'retained-movement-a') {
      if (value.owner_hold_verified !== true || value.owner_hold_preserved !== true
        || typeof first?.requestId !== 'string' || !first.requestId
        || !Number.isInteger(first.publisherPid) || first.publisherPid <= 0
        || first.requestId !== last?.requestId || first.publisherPid !== last?.publisherPid
        || last?.ownerMode !== 'movement-a' || last?.aimdkMcMode !== 'MANIPULATE_DEFAULT'
        || last?.nativeOwner !== 'native-mc' || last?.sdk_fresh_ready_verified !== true
        || !Array.isArray(last?.guidedSides) || !last.guidedSides.includes('right')) {
        throw new Error('Master handoff requires a verified continuous Movement A owner');
      }
    } else if (value.handoff_mode === 'native-hold') {
      const restored = value.commands.some(command => command.name === 'restore_stand_hand_guide'
        && command.status === 'completed' && command.result?.upperBodyPoseVerified === true
        && command.result?.absoluteReturnVerified === true && command.result?.ownerReleasedAfterBothReturnsVerified === true);
      if (!restored || value.restore_verified !== true || value.owner_release_verified !== true
        || value.owner_hold_preserved !== false || value.owner_hold_verified !== true
        || ![first, last].every(binding => binding?.ownerMode === 'native-hold' && binding.nativeOwner === 'native-mc'
          && binding.aimdkMcMode === 'STAND_DEFAULT' && binding.noActivePublisher === true && binding.sdk_fresh_ready_verified === true
          && binding.requestId == null && binding.publisherPid == null)) {
        throw new Error('Master native hold handoff requires verified full restoration and released ownership');
      }
    } else if (value.handoff_mode === 'native-standing') {
      const verifiedNativeStanding = (binding) => binding?.ownerMode === 'native-standing'
        && binding.nativeOwner === 'native-mc' && binding.aimdkMcMode === 'STAND_DEFAULT'
        && binding.presetActionsReady === true && binding.standingStateVerified === true
        && binding.noActivePublisher === true && binding.sdk_fresh_ready_verified === true
        && binding.requestId == null && binding.publisherPid == null;
      if (value.owner_hold_verified !== true || !verifiedNativeStanding(first) || !verifiedNativeStanding(last)) {
        throw new Error('Master handoff requires verified initial and final native standing without a publisher');
      }
    } else {
      throw new Error('Master handoff requires a recognized verified hold or native-standing mode');
    }
  }
  return { ...result, attempt_id: value.attempt_id, booked_end: value.booked_end,
    handoff_ready: value.handoff_ready, owner_hold_preserved: value.owner_hold_preserved,
    owner_hold_verified: value.owner_hold_verified === true,
    owner_release_verified: value.owner_release_verified === true,
    handoff_mode: value.handoff_mode ?? null,
    owner_binding: value.owner_binding ?? null,
    final_owner_binding: value.final_owner_binding ?? null,
    hold_observation_error: value.hold_observation_error ?? null,
    handoff_blocker: typeof value.handoff_blocker === 'string' ? value.handoff_blocker.slice(0, 2000) : null,
    overrun_seconds: Number.isFinite(value.overrun_seconds) ? value.overrun_seconds : null,
    restore_verified: value.restore_verified ?? null };
}
