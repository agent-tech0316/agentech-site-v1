import { parseExecutionResult } from './robot-session-execution-result.mjs';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const { native_presets: nativePresets, native_preset_arm_gains: armProfiles } =
  JSON.parse(readFileSync(new URL('./master-command-contract.json', import.meta.url), 'utf8'));
const scopedModes = new Set(['native-heart-head', 'native-preset-head']);
const sdkContract=JSON.parse(readFileSync(new URL('./eaic-sdk-contract.json',import.meta.url),'utf8'));
const sdkReadMethods=new Set(sdkContract.entries.filter(e=>e.robot==='master'&&e.policy==='customer'&&['local','observe'].includes(e.effect)).map(e=>e.method));

function bilateralHeart(command) {
  return command.name === 'heart' && [undefined, 'both', 'stand'].includes(command.args?.hand);
}

function presetProfileVerified(binding) {
  if (!['commandPoseReady','standDefaultPoseVerified','armPoseSettled','measuredPoseAtCanonical'].every(k => binding[k] === true)
      || !Number.isInteger(binding.settleSampleCount) || binding.settleSampleCount < 3) return false;
  const profile = binding.nativePresetStartProfile;
  const firmwareFallback = profile === 'v1.0.10-animation';
  if (firmwareFallback) {
    if (binding.nativePresetFirmware !== 'release-lx2501_3_t2d5-soc1-v1.0.10/lx2501_3_t2d5-soc1-v0.5.15_hotfix_v2' ||
        ![binding.nativePresetBootId, binding.nativePresetMcNode].every(x => typeof x === 'string' && x.trim())) return false;
  } else if (!Object.hasOwn(armProfiles,profile) || binding.presetActionsReady !== true || binding.armGainProfile !== profile) return false;
  if (!binding.armGains || Object.keys(binding.armGains).length !== 14) return false;
  const expected = armProfiles[firmwareFallback ? 'native-startup' : profile];
  return ['left','right'].every(side => Object.entries(expected).every(([axis, [stiffness,damping]]) => {
    const gain = binding.armGains[side+'_'+axis+'_joint'];
    return Number.isFinite(gain?.stiffness) && Number.isFinite(gain.damping)
      && Math.abs(gain.stiffness-stiffness) <= .05 && Math.abs(gain.damping-damping) <= .05;
  }));
}

import {verifyBodyReceipt} from './master-native-body.mjs';

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
  if (scopedModes.has(previous.executionResult?.handoff_mode)) {
    const result = previous.executionResult;
    return previous.masterHandoffReady === true && result.session_id === String(id)
      && result.robot_model === 'master' && result.attempt_id === previous.executionAttemptId
      && result.source_sha256 === previous.executionSourceSha256 && result.plan_sha256 === previous.executionPlanSha256
      && result.submission_id === previous.executionSubmissionId && result.booked_end === previous.end
      && scopedNativeHandoffVerified(result);
  }
  if (previous.masterHandoffReady === true) return true;
  return Object.values(sessions).some(recovery => recoveryMatches(recovery.masterRecoveryOwner, id, previous)
    && recovery.masterHandoffReady === true && recovery.executionResult?.outcome === 'completed'
    && recovery.executionResult?.restore_verified === true);
}

export function scopedNativeOwner(binding, needsHeart) {
  const idle = binding?.nativeIdleObservation;
  return typeof binding?.presetActionsReady === 'boolean'
    && binding.ownerMode === (binding.presetActionsReady ? 'native-standing' : 'native-hold')
    && binding.nativeOwner === 'native-mc' && binding.aimdkMcMode === 'STAND_DEFAULT'
    && binding.manipulationPublishers === 0 && binding.rawGuidanceActive === false && !binding.fault
    && binding.requestId == null && binding.publisherPid == null
    && Number.isInteger(idle?.samples) && idle.samples >= 3 && Number.isInteger(idle.firstSequence)
    && idle.firstSequence >= 0 && Number.isInteger(idle.lastSequence) && idle.lastSequence > idle.firstSequence
    && idle.playerState === 0 && Number.isFinite(idle.dwellMs) && idle.dwellMs >= 250
    && ['standingStateVerified', 'nativeStandingControlActive', 'nativeCommandOwnersVerified',
      'nativeBalanceEvidenceVerified', 'completeArmCommandFrameVerified', 'completeArmStateFrameVerified',
      'noActivePublisher', 'sdk_fresh_ready_verified', 'nativeGestureOwnerVerified', 'nativeMotionIdleVerified',
    ].every(key => binding[key] === true)
    && (!needsHeart || (binding.heartStartPoseVerified === true
      && ['zero-native-offset', 'recorded-heart-offset', 'qualified-waist-reference'].includes(idle.waistReference)));
}

function measuredShakeSequence(result) {
  const {angle_degrees: angle, cycles, steps, endpoints} = result;
  if (result.operation !== 'head_motion_sequence' || result.posture_controller !== 'native-mc-body-pose-head'
    || result.transport !== 'McBodyPose.turn_head' || result.automatic_retry_sent !== false
    || !Number.isFinite(angle) || angle === 0 || Math.abs(angle) > 20
    || !Number.isInteger(cycles) || cycles < 1 || cycles > 10) return false;
  const expected = [];
  for (let cycle = 0; cycle < cycles; cycle++) {
    if (cycle) expected.push(['balance_checkpoint', 0]);
    expected.push(['head_yaw', angle], ['head_yaw', -angle], ['head_yaw', 0]);
  }
  if (!Array.isArray(steps) || !Array.isArray(endpoints)
    || steps.length !== expected.length || endpoints.length !== expected.length) return false;
  return expected.every(([kind, target], index) => {
    const step = steps[index], point = endpoints[index];
    return step?.kind === kind && step.target_degrees === target && point?.target_degrees === target
      && Number.isFinite(point.measured_degrees) && Math.abs(point.measured_degrees - target) <= .75
      && Number.isFinite(point.required_settling_seconds) && point.required_settling_seconds >= 1
      && Number.isFinite(point.settled_seconds) && point.settled_seconds >= point.required_settling_seconds;
  }) && result.measured_final_degrees === endpoints.at(-1).measured_degrees;
}

function scopedNativeCommandVerified(command) {
  if (!command || typeof command !== 'object') return false;
  const r = command.result;
  if (command.status !== 'completed' || command.error != null || !r || r.dry_run !== false
    || r.fault || r.accepted === false) return false;
  if (r.operation !== command.name && !(command.name === 'shake_head' && measuredShakeSequence(r))) return false;
  if (Object.hasOwn(nativePresets, command.name)) {
    const preset = nativePresets[command.name];
    const hand = bilateralHeart(command) ? 'both' : command.args?.hand;
    const area = preset.fixed_area ?? ({left:1, right:2, both:3})[hand];
    if (r.succeeded !== true || r.task_state !== 1 || !Number.isInteger(r.task_id) || r.task_id < 0
      || r.required_posture !== 'STAND_DEFAULT' || r.posture_before !== 'STAND_DEFAULT' || r.posture_after !== 'STAND_DEFAULT'
      || (preset.fixed_area === undefined ? !(['left','right'].includes(hand) || bilateralHeart(command)) : hand !== undefined)
      || r.hand !== hand || r.motion_id !== preset.motion_id || r.control_area !== area) return false;
    if (r.task_id > 0) return true;
    const observation = r.native_observation;
    const states = observation?.player_states;
    return r.completion_basis === 'native-motion-observation' && r.task_identity_verified === false
      && r.observed_motion_id === r.motion_id && Array.isArray(states) && states.at(-1) === 0
      && states.includes(2) && states.slice(0, -1).every(state => state === 1 || state === 2)
      && typeof observation.input_source?.name === 'string' && observation.input_source.name.trim() !== ''
      && Number.isInteger(observation.last_sequence) && observation.last_sequence > 0
      && Number.isInteger(observation.last_stamp_ns) && observation.last_stamp_ns > 0;
  }
  return ['turn_head', 'shake_head'].includes(command.name) && r.phase === 'head-sequence-complete'
    && r.angle_degrees === (command.args?.angle_degrees ?? 5) && r.posture === 'stand'
    && ['live_enabled', 'measured_endpoint_verified',
      'native_ownership_verified_before_and_after', 'native_balance_retained',
      'other_joint_targets_unchanged', 'other_joint_gains_unchanged'].every(key => r[key] === true)
    && ['mode_changes', 'direct_hal_commands', 'head_mapping_qualification_required'].every(key => r[key] === false)
    && (command.name !== 'shake_head' || (r.exact_center_return === true && r.cycles === (command.args?.cycles ?? 1)));
}

function scopedNativeHandoffVerified(value) {
  if(!Array.isArray(value.commands)||value.command_count!==value.commands.length||value.completed_count!==value.command_count)return false;
  // Read calls may accompany a gesture but cannot count as its motion proof.
  value={...value,commands:value.commands?.filter(c=>!(sdkReadMethods.has(c.name)&&c.result?.read_only===true)).map(c=>{
    if(!c.name.startsWith('standing_actions.'))return c;
    const name=c.name.slice('standing_actions.'.length),args={...c.args};
    if(['turn_head','shake_head'].includes(name)){args.angle_degrees=args.degrees;delete args.degrees;}
    return {...c,name,args};
  })};
  value.command_count=value.commands?.length;
  value.completed_count=value.commands?.filter(c=>c.status==='completed').length;
  if (value.handoff_ready !== true || value.outcome !== 'completed' || value.error != null
    || value.owner_hold_preserved !== false || value.owner_hold_verified !== false
    || (value.owner_release_verified != null && value.owner_release_verified !== false)
    || (value.restore_verified != null && value.restore_verified !== false) || value.hold_observation_error != null
    || !Array.isArray(value.commands) || value.commands.length === 0 || value.command_count !== value.commands.length
    || value.completed_count !== value.command_count || !value.commands.every(scopedNativeCommandVerified)) return false;
  const general = value.handoff_mode === 'native-preset-head';
  if (!general && value.commands.some(c => !['heart','turn_head','shake_head'].includes(c.name))) return false;
  const needsHeart = value.commands.some(general ? bilateralHeart : c => c.name === 'heart');
  const first = value.owner_binding;
  const last = value.final_owner_binding;
  if (!scopedNativeOwner(first, needsHeart) || !scopedNativeOwner(last, needsHeart)) return false;
  if (general && (!value.commands.some(c => Object.hasOwn(nativePresets,c.name) && !bilateralHeart(c))
      || !presetProfileVerified(first) || !presetProfileVerified(last)
      || first.nativePresetStartProfile !== last.nativePresetStartProfile
      || first.nativePresetBootId !== last.nativePresetBootId || first.nativePresetMcNode !== last.nativePresetMcNode)) return false;
  const identityFields = needsHeart ? ['inputSource', 'bootId', 'mcNode', 'installedBuild', 'waistReference'] : ['inputSource'];
  if (!identityFields.every(key => {
    const identity = first.nativeIdleObservation[key];
    return typeof identity === 'string' && identity.trim() !== '' && identity === last.nativeIdleObservation[key];
  })) return false;
  const start = Date.parse(value.started_at), finish = Date.parse(value.finished_at);
  const before = Date.parse(first.observed_at), after = Date.parse(last.observed_at);
  const bookedEnd = Date.parse(value.booked_end);
  return start <= before && before < after && after <= finish
    && value.commands.every(command => {
      const dispatched = Date.parse(command.started_at);
      return before <= dispatched && dispatched < bookedEnd && dispatched <= after;
    });
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
    ...(item.bodyAssetId ? {native_body_asset_id:item.bodyAssetId,
      native_body_start_policy:'signed_booking'} : {}),
    ...(item.bodyFile ? {native_body_files:{motion:item.bodyFile}, native_body_manifest:item.bodyManifest} : {}),
    ...(item.masterRecoveryOwner ? { recovery_owner_binding: item.masterRecoveryOwner } : {}) };
}

export function masterLaunchBlocker(sessions, id, item, nowMs = Date.now()) {
  if (!Number.isFinite(Date.parse(item.end)) || nowMs >= Date.parse(item.end)) return 'Master booked session has expired';
  if (!Number.isFinite(Date.parse(item.start)) || nowMs < Date.parse(item.start)) return 'Master booked session has not started';
  return masterPreviousSessionBlocker(sessions, id, item, nowMs);
}

export function masterPreviousSessionBlocker(sessions, id, item, nowMs) {
  return masterPreviousSessionIssue(sessions, id, item, nowMs)?.reason ?? null;
}

export function masterPreviousSessionIssue(sessions, id, item, nowMs) {
  for (const [otherId, other] of Object.entries(sessions)) {
    if (String(otherId) === String(id) || other.executionModel !== 'master' || !other.executionAttemptId) continue;
    if (['running', 'publishing'].includes(other.status)) return {reason:`Master session ${otherId} is still running`};
    if (Number.isFinite(Date.parse(other.end)) && nowMs < Date.parse(other.end)) return {reason:`Master session ${otherId} still owns its booked window`};
    if (!masterHandoffResolved(sessions, otherId, other) && !recoveryMatches(item.masterRecoveryOwner, otherId, other)) return {
      priorId:otherId, reason:`Master session ${otherId} requires a verified upper-body handoff`};
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
  const nativeBody = String(expected.submissionId).startsWith('master-body-');
  if ((value.handoff_mode === 'native-body-playback' || (nativeBody && (value.outcome === 'completed' || value.handoff_ready)))
      && (!nativeBody || !verifyBodyReceipt(value, expected.bodyPlan))) throw new Error('Missing measured booked motion playback and native standing evidence');
  if (value.handoff_ready && !nativeBody) {
    const first = value.owner_binding;
    const last = value.final_owner_binding;
    if (value.handoff_mode === 'sdk-read-only') {
      if(value.sdk_contract!==sdkContract.hash||value.sdk_read_only_verified!==true||value.robot_commands_sent!==false
          ||value.owner_hold_preserved!==false||value.owner_hold_verified!==false||value.outcome!=='completed'
          ||!value.commands.every(c=>sdkReadMethods.has(c.name)&&c.result?.read_only===true)){
        throw new Error('SDK read-only receipt contains a motion command or lacks its reviewed contract');
      }
    } else if (value.handoff_mode === 'retained-seated') {
      const healthy=b=>b?.phase==='holding'&&b.active===true&&b.upper_body_powered===true&&Number.isInteger(b.pid)&&b.pid>0;
      if(value.sdk_contract!==sdkContract.hash||value.owner_hold_verified!==true||value.owner_hold_preserved!==true
          ||!healthy(first)||!healthy(last)||JSON.stringify(first)!==JSON.stringify(last)
          ||!value.commands.every(c=>c.result?.read_only===true?sdkReadMethods.has(c.name):
            sdkContract.entries.some(e=>e.robot==='master'&&e.method===c.name&&e.policy==='customer')
            &&(c.name.startsWith('seated_actions.')||c.args?.posture==='sit'||c.name==='center')
            &&c.result?.dry_run===false&&(c.result.measured_endpoint_verified===true||c.result.succeeded===true)
            &&c.result.gateway_seated_owner_before?.pid===first.pid&&c.result.gateway_seated_owner_after?.pid===first.pid)) {
        throw new Error('Seated handoff lacks the unchanged healthy persistent owner');
      }
    } else if (value.handoff_mode === 'retained-hold') {
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
    } else if (scopedModes.has(value.handoff_mode)) {
      if (!scopedNativeHandoffVerified(value)) {
        throw new Error('Master scoped native handoff lacks verified Heart/head completion and native ownership');
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
  // The adapter start includes pre-dispatch checks. Keep the actual SDK call
  // timestamp too, so a slow check is distinguishable from a slow movement.
  const commands = result.commands.map((command, index) => {
    const sdkStart = value.commands[index].sdk_call_started_at;
    return typeof sdkStart === 'string' && Number.isFinite(Date.parse(sdkStart))
      ? {...command, sdk_call_started_at:sdkStart} : command;
  });
  return { ...result, commands, attempt_id: value.attempt_id, booked_end: value.booked_end,
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
