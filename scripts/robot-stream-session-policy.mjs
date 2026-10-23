export function endSessionPostureCommand(robotModel) {
  if (robotModel === "navi") return "lie_down";
  if (robotModel === "aegis") return "sit";
  throw new Error(`unsupported robot model: ${robotModel}`);
}

export function requiresEndLieDown(plan, robotModel) {
  if (!plan || !Array.isArray(plan.commands) || plan.commands.length === 0) {
    throw new Error("compiled plan must contain commands");
  }
  const finalCommand = plan.commands[plan.commands.length - 1];
  if (robotModel === "aegis") {
    return !["sit", "emergency_stop"].includes(finalCommand?.name);
  }
  return finalCommand?.name !== endSessionPostureCommand(robotModel);
}

export function endSessionCleanupPolicy(plan, robotModel) {
  if (!plan || !Array.isArray(plan.commands) || plan.commands.length === 0) {
    throw new Error("compiled plan must contain commands");
  }
  if (robotModel === "master") {
    // The persistent Master owner retains its hold. Never use leg posture,
    // global stop, damping, or owner termination as scheduled-session cleanup.
    return { required: false, returnHomeRequired: false, persistentOwner: true };
  }
  if (robotModel === "navi") {
    return {
      required: true,
      // Earlier user calls do not establish the posture at booked session end.
      returnHomeRequired: true,
    };
  }
  if (robotModel === "aegis") {
    return { required: requiresEndLieDown(plan, robotModel), returnHomeRequired: false };
  }
  throw new Error(`unsupported robot model: ${robotModel}`);
}

export function keepsStreamActive(item, nowMs) {
  if (["staged", "running"].includes(item.status)) return true;
  return item.status === "completed" && nowMs < Date.parse(item.end);
}

export function finalSessionDatabaseStatus(item) {
  if (item?.status !== "finished") return null;
  if (item.executionResultRequired === true) {
    if (item.executionResultPersisted !== true) return null;
    return item.executionStatus === "completed" ? "completed" : "failed";
  }
  if (item.streamAvailableDuringSession === true) return "completed";
  if (item.streamAvailableDuringSession === false) return "failed";
  // Legacy sessions reached `finished` only after startObs() succeeded and the
  // runner launched. Treat those as delivered even if later cleanup failed.
  return "completed";
}
