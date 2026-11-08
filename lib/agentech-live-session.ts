import { normalizeLiveRobotModel, type LiveRobotModel } from "@/lib/master-live-camera";
import { supabaseRequest } from "@/lib/supabase-server";

const activeSessionStatuses = new Set(["requested", "confirmed", "approved", "scheduled", "pending", "running"]);

type ActiveSessionRow = {
  id: number;
  robot_model: string | null;
  session_status: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  approved_run_type: string | null;
  preset_demo: string | null;
  code_submission_id: string | null;
  receipt_session: string | null;
  receipt_submission: string | null;
  receipt_outcome: string | null;
};

export type ActiveRobotViewingSession = {
  id: number;
  robotModel: LiveRobotModel;
  status: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  approvedRunType?: string | null;
  presetDemo?: string | null;
  codeSubmissionId?: string | null;
  danceOutcome?: "completed" | "failed" | null;
};

function normalizeStatus(status: string) {
  return status.replace(/ /g, "_").toLowerCase();
}

export async function getActiveRobotViewingSession(email: string, now = new Date()) {
  const nowIso = now.toISOString();
  const sessions = await supabaseRequest<ActiveSessionRow[]>("agentech_robot_sessions", {
    query: [
      `email=eq.${encodeURIComponent(email)}`,
      `scheduled_start=lte.${encodeURIComponent(nowIso)}`,
      `scheduled_end=gte.${encodeURIComponent(nowIso)}`,
      "select=id,robot_model,session_status,scheduled_start,scheduled_end,approved_run_type,preset_demo,code_submission_id," +
        "receipt_session:execution_result->>session_id,receipt_submission:execution_result->>submission_id,receipt_outcome:execution_result->>outcome",
      "order=scheduled_start.asc",
      "limit=5"
    ].join("&")
  }).catch(() => []);

  const session = sessions.find((item) => activeSessionStatuses.has(normalizeStatus(item.session_status)));
  if (!session) return null;

  const isCurrentDance = session.robot_model === "Master" && session.code_submission_id?.startsWith("master-body-")
    && session.receipt_session === String(session.id) && session.receipt_submission === session.code_submission_id;
  return {
    id: session.id,
    robotModel: normalizeLiveRobotModel(session.robot_model) ?? "Aegies",
    status: session.session_status,
    scheduledStart: session.scheduled_start,
    scheduledEnd: session.scheduled_end,
    approvedRunType: session.approved_run_type,
    presetDemo: session.preset_demo,
    codeSubmissionId: session.code_submission_id,
    danceOutcome: isCurrentDance && (session.receipt_outcome === "completed" || session.receipt_outcome === "failed")
      ? session.receipt_outcome : null,
  } satisfies ActiveRobotViewingSession;
}
