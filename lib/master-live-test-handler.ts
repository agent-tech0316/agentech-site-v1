import {
  hasMasterLiveTestAccess,
  MASTER_LIVE_TEST_LABEL,
} from "./master-live-test-access.ts";

type MasterLiveTestPayload = {
  code?: unknown;
  uploadedFileName?: unknown;
};

type MasterLiveTestSubmission = {
  id: string;
  robot_model: string;
  run_mode: string;
  code: string;
  uploaded_file_name: string | null;
  ai_security_status: string;
};

type EnsuredMasterLiveTestSession = {
  session: {
    id: number;
    scheduled_start?: string | null;
    scheduled_end: string | null;
  };
  reused: boolean;
};

type MasterLiveTestDependencies = {
  getAccount: (email: string) => Promise<unknown | null>;
  listSubmissions: (email: string, limit: number) => Promise<MasterLiveTestSubmission[]>;
  createSubmission: (input: {
    id: string;
    email: string;
    developerName: string;
    robotModel: string;
    runMode: string;
    source: "pasted_code" | "uploaded_file";
    uploadedFileName: string | null;
    githubRepoUrl: null;
    githubBranch: null;
    commands: string[];
    code: string;
  }) => Promise<unknown | null>;
  ensureSession: (email: string, now: Date) => Promise<EnsuredMasterLiveTestSession>;
  updateSubmission: (id: string, body: Record<string, unknown>) => Promise<unknown | null>;
  createSubmissionId: () => string;
};

type MasterLiveTestResult = {
  status: number;
  body: Record<string, unknown>;
};

type MasterLiveTestStatusDependencies = {
  listSubmissions: (email: string, limit: number) => Promise<MasterLiveTestSubmission[]>;
  getActiveSession: (email: string) => Promise<{
    id: number;
    robotModel: string;
    status: string;
    scheduledStart: string | null;
    scheduledEnd: string | null;
    approvedRunType?: string | null;
    presetDemo?: string | null;
    codeSubmissionId?: string | null;
  } | null>;
};

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function isSessionSetupError(error: unknown) {
  return error instanceof Error
    && (error.name === "MasterLiveTestConflictError" || error.name === "MasterLiveTestProfileError");
}

async function resetMasterLiveTestAudit(
  dependencies: Pick<MasterLiveTestDependencies, "updateSubmission">,
  submissionId: string,
) {
  await dependencies.updateSubmission(submissionId, {
    ai_security_status: "locked",
    ai_security_model: null,
    ai_security_summary: null,
    ai_security_findings: [],
    ai_security_risk_level: null,
    ai_security_reviewed_at: null,
    credits_charged: 0,
  }).catch(() => null);
}

export async function handleMasterLiveTest(
  input: { email: string; payload: MasterLiveTestPayload; now?: Date },
  dependencies: MasterLiveTestDependencies,
): Promise<MasterLiveTestResult> {
  const email = input.email.trim().toLowerCase();
  if (!validEmail(email)) {
    return { status: 401, body: { error: "Sign in before starting the Master live test." } };
  }
  if (!hasMasterLiveTestAccess(email)) {
    return { status: 403, body: { error: "Master live-test access is not enabled for this account." } };
  }

  try {
    if (!(await dependencies.getAccount(email))) {
      return { status: 404, body: { error: "Account not found." } };
    }

    const code = typeof input.payload.code === "string" ? input.payload.code : "";
    const uploadedFileName = typeof input.payload.uploadedFileName === "string"
      ? input.payload.uploadedFileName.trim()
      : "";
    const now = input.now ?? new Date();
    const existingAudit = (await dependencies.listSubmissions(email, 20)).find((record) => (
      record.robot_model === "Master"
      && record.run_mode === MASTER_LIVE_TEST_LABEL
      && record.ai_security_status === "locked"
      && record.code === code
      && record.uploaded_file_name === (uploadedFileName || null)
    ));
    const submissionId = existingAudit?.id ?? dependencies.createSubmissionId();

    if (!existingAudit) {
      const createdAudit = await dependencies.createSubmission({
        id: submissionId,
        email,
        developerName: "Victoria Master live test",
        robotModel: "Master",
        runMode: MASTER_LIVE_TEST_LABEL,
        source: uploadedFileName ? "uploaded_file" : "pasted_code",
        uploadedFileName: uploadedFileName || null,
        githubRepoUrl: null,
        githubBranch: null,
        commands: [],
        code,
      });
      if (!createdAudit) {
        throw new Error("Unable to create the Master live-test audit record.");
      }
    }

    try {
      const approvedAudit = await dependencies.updateSubmission(submissionId, {
        physical_safety_status: "passed",
        ai_security_status: "passed",
        ai_security_model: "view-only-test-bypass",
        ai_security_summary: "View-only, not executable. This approval unlocks only the Master livestream test.",
        ai_security_findings: [],
        ai_security_risk_level: "none",
        ai_security_reviewed_at: now.toISOString(),
        credits_charged: 0,
      });
      if (!approvedAudit) {
        throw new Error("Unable to approve the Master live-test audit record.");
      }
    } catch (error) {
      await resetMasterLiveTestAudit(dependencies, submissionId);
      throw error;
    }

    let ensured: EnsuredMasterLiveTestSession;
    try {
      // Reserve last: no database write after this point can roll back or delete a
      // session that a concurrent request has already reused successfully.
      ensured = await dependencies.ensureSession(email, now);
    } catch (error) {
      await resetMasterLiveTestAudit(dependencies, submissionId);
      if (isSessionSetupError(error)) {
        return { status: 409, body: { error: errorMessage(error, "Unable to reserve the Master live-test session.") } };
      }
      throw error;
    }

    return {
      status: 200,
      body: {
        ok: true,
        submissionId,
        physicalSafetyStatus: "passed",
        aiSecurityStatus: "passed",
        viewOnly: true,
        robotModel: "Master",
        sessionId: ensured.session.id,
        reusedSession: ensured.reused,
        startsAt: ensured.session.scheduled_start ?? null,
        expiresAt: ensured.session.scheduled_end,
      },
    };
  } catch (error) {
    return {
      status: 500,
      body: { error: errorMessage(error, "Unable to start the Master live test.") },
    };
  }
}

export async function handleMasterLiveTestStatus(
  input: { email: string },
  dependencies: MasterLiveTestStatusDependencies,
): Promise<MasterLiveTestResult> {
  const email = input.email.trim().toLowerCase();
  if (!validEmail(email)) {
    return { status: 401, body: { error: "Sign in before checking the Master live test." } };
  }
  if (!hasMasterLiveTestAccess(email)) {
    return { status: 403, body: { error: "Master live-test access is not enabled for this account." } };
  }

  try {
    const [submissions, activeSession] = await Promise.all([
      dependencies.listSubmissions(email, 50),
      dependencies.getActiveSession(email),
    ]);
    const latestAudit = submissions.find((record) => (
      record.robot_model === "Master" && record.run_mode === MASTER_LIVE_TEST_LABEL
    )) ?? null;

    return {
      status: 200,
      body: {
        ok: true,
        latestAudit: latestAudit ? {
          id: latestAudit.id,
          code: latestAudit.code,
          uploadedFileName: latestAudit.uploaded_file_name,
          physicalSafetyStatus: "passed",
          aiSecurityStatus: latestAudit.ai_security_status,
        } : null,
        activeSession: activeSession?.robotModel === "Master"
          && activeSession.approvedRunType === "preset_demo"
          && activeSession.presetDemo === MASTER_LIVE_TEST_LABEL
          && activeSession.codeSubmissionId === null ? activeSession : null,
      },
    };
  } catch (error) {
    return {
      status: 500,
      body: { error: errorMessage(error, "Unable to load the Master live-test status.") },
    };
  }
}
