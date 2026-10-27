import { readFileSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { parseExecutionResult } from "./robot-session-execution-result.mjs";

export function parseNaviProgramResult(text, expected) {
  const result = parseExecutionResult(text, expected);
  const value = JSON.parse(text);
  const owner = value.navi_supervision;
  if (value.robot_model !== 'navi' || typeof expected.attemptId !== 'string' || !expected.attemptId
    || value.attempt_id !== expected.attemptId || owner?.version !== 1
    || !Number.isInteger(expected.guardianPid) || expected.guardianPid <= 0
    || owner.guardian_pid !== expected.guardianPid || owner.booked_end !== expected.bookedEnd
    || !Number.isFinite(Date.parse(expected.bookedEnd))
    || typeof owner.child_exited !== 'boolean' || typeof owner.deadline_expired !== 'boolean') {
    throw new Error('Navi program outcome owner/deadline identity is missing or invalid');
  }
  if (owner.program_pid !== null && (!Number.isInteger(owner.program_pid) || owner.program_pid <= 0)) {
    throw new Error('Navi program child identity is invalid');
  }
  if (owner.program_return_code !== null && !Number.isInteger(owner.program_return_code)) {
    throw new Error('Navi program child exit code is invalid');
  }
  if (result.outcome === 'completed' && (owner.child_exited !== true || owner.program_pid === null
    || owner.program_return_code !== 0 || owner.deadline_expired !== false
    || Date.parse(result.finished_at) > Date.parse(expected.bookedEnd))) {
    throw new Error('Navi program completion is contradicted by child exit/deadline evidence');
  }
  return {...result, attempt_id:value.attempt_id, navi_supervision:owner,
    resting_stand:value.resting_stand ?? null, cleanup_error:value.cleanup_error ?? null,
    persistence_error:value.persistence_error ?? null};
}

// Session delivery and physical readiness are deliberately separate records.
export function naviLaunchBlocker(sessions, currentId, nowMs) {
  // Ownership remains exclusive. Position/heading receipts are not movement
  // prerequisites; the runner checks fresh healthy damped posture at admission.
  for (const [id, item] of Object.entries(sessions)) {
    if (String(id) === String(currentId) || item.executionModel !== "navi") continue;
    const end = Date.parse(item.end);
    if (item.naviCleanupOwner || ["running", "publishing"].includes(item.status)
      || item.endCleanupStatus === "running"
      || (item.status === "completed" && (!Number.isFinite(end) || nowMs < end))) {
      return `Navi session ${id} still owns the robot`;
    }
  }
  return null;
}

export function loadGatewayState(path, io = {readFileSync}) {
  try {
    const state = JSON.parse(io.readFileSync(path, "utf8"));
    if (!state || typeof state !== "object" || !state.sessions
      || typeof state.sessions !== "object" || Array.isArray(state.sessions)) throw new Error("invalid sessions");
    return state;
  } catch (error) {
    throw new Error(`Gateway state is missing or invalid; ownership recovery required: ${error.message}`);
  }
}

export function saveGatewayState(path, state, io = {writeFileSync, renameSync, unlinkSync}) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    io.writeFileSync(temporary, JSON.stringify(state, null, 2), {encoding:"utf8", flag:"wx"});
    io.renameSync(temporary, path);
  } finally {
    try { io.unlinkSync(temporary); } catch {}
  }
}

function verifiedBaseline(value, nowMs, requireHome = true) {
  const timestamp = Date.parse(value?.verified_at);
  if (!Number.isFinite(timestamp) || timestamp > nowMs) throw new Error("Navi reset baseline has invalid timestamp");
  const result = parseNaviCleanupResult(`[navi-runner] cleanup-result ${JSON.stringify(value.result)}`, {requireHome});
  return {verified_at: value.verified_at, result};
}

export function selectNaviResetBaseline(automatic, supervised, nowMs) {
  let baseline;
  if (automatic?.verified_at) baseline = verifiedBaseline(automatic, nowMs, false);
  if (supervised != null) {
    if (supervised.version !== 1) throw new Error("Unsupported supervised Navi baseline");
    const imported = verifiedBaseline(supervised, nowMs);
    if (!baseline || Date.parse(imported.verified_at) >= Date.parse(baseline.verified_at)) baseline = imported;
  }
  if (!baseline) throw new Error("Navi has no verified reset baseline");
  return baseline;
}

export function reconcileNaviCleanupOutcome(owner, ownerRunning, outcome) {
  if (ownerRunning === true) return {status:"running"};
  if (ownerRunning !== false) return {status:"unknown", error:"Navi cleanup owner identity is unverified"};
  try {
    if (outcome?.version !== 1 || outcome.attempt_id !== owner.attempt_id || outcome.outcome !== "verified") {
      throw new Error(outcome?.error || "Cleanup owner exited without a matching verified result");
    }
    const baseline = verifiedBaseline(outcome, Date.now(), false);
    return {status:"completed", ...baseline};
  } catch (error) { return {status:"failed", error:error.message}; }
}

export function parseNaviCleanupResult(output, {requireHome = true} = {}) {
  const prefix = "[navi-runner] cleanup-result ";
  const lines = String(output).split(/\r?\n/).filter(line => line.startsWith(prefix));
  if (lines.length !== 1) throw new Error("Navi cleanup did not provide exactly one verified result");
  const result = JSON.parse(lines[0].slice(prefix.length));
  const final = result.final_state;
  const bounded = (value, max) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max;
  if (!requireHome && result.version === 1 && result.ready_for_next_user === true
    && result.operation === "damping" && result.home_verified === false && result.succeeded === true
    && result.damping_completed === true && result.terminal_state === "lowered_damped"
    && bounded(result.elapsed_s,120) && final?.boot_finish === true && final.robot_ready === true
    && final.error === 0 && final.warning === 0 && final.standing === false && final.action === 0 && final.estop === 1
    && !('position_error_m' in result) && !('final_heading_error_deg' in result)) return result;
  if (result.version !== 1 || result.ready_for_next_user !== true || result.operation !== "return_to_home"
    || result.succeeded !== true || result.damping_completed !== true || result.terminal_state !== "lowered_damped"
    || typeof result.run_id !== "string" || !result.run_id.trim()
    || !bounded(result.elapsed_s, 120) || !bounded(result.position_error_m, .06)
    || !bounded(Math.abs(result.final_heading_error_deg), 4) || typeof result.final_heading_error_deg !== "number"
    || !final || final.boot_finish !== true || final.robot_ready !== true || final.error !== 0
    || final.warning !== 0 || final.standing !== false || final.action !== 0 || final.estop !== 1) {
    throw new Error("Navi cleanup result did not verify center, heading, and healthy damping");
  }
  return result;
}
