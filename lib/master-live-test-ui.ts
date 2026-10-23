export const masterLiveTestPresentation = (expiresAt = "") => ({
  actionLabel: "Start 3-Minute Master Live Test",
  artifactLabel: "View-only test artifact",
  liveLinkLabel: "Open Master Live Stream",
  livePath: "/agentech-products/eaic-hub/watch-live-run",
  expiresAt,
  viewOnlyNotice: "View-only test. Submitted text will not execute on Master.",
});

export function getCodeCheckingRobotOptions<const Model extends string>(
  normalModels: readonly Model[],
  masterLiveTestAccess: boolean,
) {
  return masterLiveTestAccess ? [...normalModels, "Master Live Test" as const] : [...normalModels];
}

export function selectCodeCheckingRobotModel<Model extends string>(
  value: string,
  masterLiveTestAccess: boolean,
  currentNormalRobotModel: Model,
) {
  if (value === "Master Live Test") {
    return {
      normalRobotModel: currentNormalRobotModel,
      masterLiveTestSelected: masterLiveTestAccess,
    };
  }

  return {
    normalRobotModel: value as Model,
    masterLiveTestSelected: false,
  };
}

export function buildMasterLiveTestPayload(code: string, uploadedFileName: string) {
  return { code, uploadedFileName };
}

type LiveSessionStatus = {
  active?: boolean;
  session?: {
    robotModel?: string | null;
    scheduledStart?: string | null;
    scheduledEnd?: string | null;
  } | null;
};

export function isMasterLiveSessionActive(status: LiveSessionStatus, now = new Date()) {
  if (!status.active || status.session?.robotModel !== "Master") return false;
  const start = Date.parse(status.session.scheduledStart ?? "");
  const end = Date.parse(status.session.scheduledEnd ?? "");
  const nowMs = now.getTime();
  return Number.isFinite(start) && Number.isFinite(end) && start <= nowMs && end > nowMs;
}

export function millisecondsUntilMasterLiveTestExpiry(expiresAt: string, now = new Date()) {
  const end = Date.parse(expiresAt);
  return Number.isFinite(end) ? Math.max(0, end - now.getTime()) : 0;
}
