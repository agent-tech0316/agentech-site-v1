import { readFileSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";

// Session delivery and physical readiness are deliberately separate records.
export function naviLaunchBlocker(sessions, currentId, nowMs, verifiedResetAt) {
  const resetMs = Date.parse(verifiedResetAt);
  if (!Number.isFinite(resetMs) || resetMs > nowMs) return "Navi has no verified reset baseline";
  for (const [id, item] of Object.entries(sessions)) {
    if (String(id) === String(currentId) || item.executionModel !== "navi") continue;
    if (["staged", "skipped"].includes(item.status)) continue;
    const end = Date.parse(item.end);
    if (["running", "publishing"].includes(item.status)
      || item.endCleanupStatus === "running"
      || (item.status === "completed" && (!Number.isFinite(end) || nowMs < end))) {
      return `Navi session ${id} still owns the robot`;
    }
    if ((item.endCleanupRequired ?? item.endLieDownRequired) === true
      && item.endCleanupStatus !== "completed"
      && (!Number.isFinite(end) || end > resetMs)) {
      return `Navi session ${id} reset is ${item.endCleanupStatus || "unverified"}`;
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

function verifiedBaseline(value, nowMs) {
  const timestamp = Date.parse(value?.verified_at);
  if (!Number.isFinite(timestamp) || timestamp > nowMs) throw new Error("Navi reset baseline has invalid timestamp");
  const result = parseNaviCleanupResult(`[navi-runner] cleanup-result ${JSON.stringify(value.result)}`);
  return {verified_at: value.verified_at, result};
}

export function selectNaviResetBaseline(automatic, supervised, nowMs) {
  let baseline;
  if (automatic?.verified_at) baseline = verifiedBaseline(automatic, nowMs);
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
    const baseline = verifiedBaseline(outcome, Date.now());
    return {status:"completed", ...baseline};
  } catch (error) { return {status:"failed", error:error.message}; }
}

export function parseNaviCleanupResult(output) {
  const prefix = "[navi-runner] cleanup-result ";
  const lines = String(output).split(/\r?\n/).filter(line => line.startsWith(prefix));
  if (lines.length !== 1) throw new Error("Navi cleanup did not provide exactly one verified result");
  const result = JSON.parse(lines[0].slice(prefix.length));
  const final = result.final_state;
  const bounded = (value, max) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max;
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
