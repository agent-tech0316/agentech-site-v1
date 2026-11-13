// One active venue, one configured robot. The bridge still enforces the
// booking window, review, readiness and single-claim checks after discovery.
export function gatewayAssignment(env = process.env) {
  if (env.AGENTECH_SITE_DISCOVERY !== "single-venue" ||
      !/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/.test(env.AGENTECH_GATEWAY_ID || "")) {
    throw new Error("Run Quick setup before starting single-venue discovery.");
  }
  const models = JSON.parse(env.AGENTECH_GATEWAY_MODELS || "null");
  if (!Array.isArray(models) || models.length !== 1 || !["master","navi","aegis"].includes(models[0])) {
    throw new Error("Select one installed robot model.");
  }
  return {model: models[0]};
}
export function ownsGatewaySession(assignment, session) {
  const model = String(session.robot_model || "").trim().toLowerCase().replace(/^aegies$/, "aegis");
  return /^\d+$/.test(String(session.id)) && model === assignment.model;
}
