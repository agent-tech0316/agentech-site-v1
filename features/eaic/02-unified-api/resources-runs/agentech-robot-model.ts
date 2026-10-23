export const robotModelOptions = ["Aegies", "Navi", "Master"] as const;

export type AgentechRobotModel = (typeof robotModelOptions)[number];

export function normalizeAgentechRobotModel(value: unknown): AgentechRobotModel | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "aegies" || normalized === "aegis") return "Aegies";
  if (normalized === "navi") return "Navi";
  if (normalized === "master") return "Master";
  return null;
}

export function isNaviRobotModel(value: unknown) {
  return normalizeAgentechRobotModel(value) === "Navi";
}
