import { promises as fs } from "fs";
import { tmpdir } from "os";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import {
  allocateCreditSpend,
  claimCodeSubmissionSoftwareReview,
  createCodeSubmissionRecord,
  getAccountRecord,
  getCodeSubmissionRecord,
  markDeveloperReviewGateOnAccount,
  spendAccountCredits,
  updateCodeSubmissionRecord
} from "@/lib/account-records";
import { runAgentechAiCodeReview } from "@/lib/agentech-ai-review";
import { evaluateAgentechMovementSafety } from "@/lib/agentech-motion-safety";
import { getAiReviewCreditCost } from "@/lib/agentech-review-pricing";
import { normalizeAgentechRobotModel } from "@/lib/agentech-robot-model";
import { validateAgentechCode } from "@/lib/agentech-validation";
import { getSoftwareCheckCreditPolicy, isAgentechCompanyEmail } from "@/lib/company-accounts";
import { hasMasterLiveTestAccess } from "@/lib/master-live-test-access";
import { hasPaidSoftwareReviewExemption, isValidAccountIdentifier } from "@/lib/prototype-auth";
import { getReturnToHomeAccess, RETURN_TO_HOME_FEATURE_CODE } from "@/lib/premium-features";
import { getServerAccountEmail } from "@/lib/server-account-session";

type SubmissionPayload = {
  developerName?: string;
  robotModel?: string;
  runMode?: string;
  code?: string;
  uploadedFileName?: string;
  commands?: string[];
  reviewStage?: string;
  submissionId?: string;
};

function cleanText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function extractCommands(code: string) {
  const commands: string[] = [];
  const pattern = /(?:Agentech|dog)\.(\w+)\(([^)]*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(code)) !== null) {
    const args = match[2].trim();
    commands.push(`${match[1]}(${args})`);
  }
  return commands;
}

function isAllowedRunMode(value: string) {
  return value === "Physical hardware limit and capability test" || value === "Software check" || value === "AI software security review" || value === "Benchmark review only";
}

function localSoftwareSecurityFindings(code: string) {
  const findings: string[] = [];
  const checks: Array<[RegExp, string]> = [
    [/^\s*(?:from|import)\s+(?:requests|urllib|http|ftplib|smtplib|paramiko|socket)\b/m, "External network access is not allowed in submitted robot code."],
    [/\b(?:requests\.(?:get|post|put|patch|delete)|urlopen|socket\.)\s*\(/, "The code attempts an outbound network request or connection."],
    [/\b(?:os\.environ|getenv)\b|\.env\b|API[_ -]?KEY|SECRET|TOKEN/i, "The code attempts to access or reference credentials or environment secrets."],
    [/\b(?:subprocess\.|os\.system|popen\s*\(|shell\s*=\s*True)/, "Shell or process execution is not allowed."],
    [/\b(?:base64|marshal|pickle|exec\s*\(|eval\s*\()/, "Dynamic or encoded execution is not allowed."],
    [/\bwhile\s+(?:True|1)\s*:/, "An unbounded loop could exhaust resources or hang the robot session."]
  ];
  checks.forEach(([pattern, message]) => {
    if (pattern.test(code) && !findings.includes(message)) findings.push(message);
  });
  return findings;
}

function getGatewayErrorStatus(error: unknown) {
  const status = typeof error === "object" && error !== null && "status" in error
    ? Number((error as { status?: unknown }).status)
    : 502;
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 502;
}

async function writeLocalSubmission(id: string, record: unknown) {
  const configuredDir = process.env.AGENTECH_SUBMISSION_DIR?.trim();
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  const outputDir = configuredDir
    ? path.resolve(configuredDir)
    : isServerless
      ? path.join(tmpdir(), "agentech_submissions")
      : path.join(process.cwd(), "review_submissions");
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, `${id}.json`), JSON.stringify(record, null, 2), "utf8");
}

export async function GET(request: NextRequest) {
  try {
    const submittedEmail = await getServerAccountEmail(request);
    const isLocalPreview = process.env.NODE_ENV !== "production";
    const email = isValidAccountIdentifier(submittedEmail) ? submittedEmail : isLocalPreview ? "developer.preview@agentech.local" : submittedEmail;

    if (!isValidAccountIdentifier(email)) {
      return NextResponse.json(
        { error: "Your account session could not be verified. Sign in again, then retry the check.", errorCode: "AUTH_REQUIRED" },
        { status: 401 }
      );
    }

    const requestedSubmissionId = request.nextUrl.searchParams.get("submissionId")?.trim() ?? "";

    if (isLocalPreview) {
      const previewSubmission = requestedSubmissionId === "agentech-preview-approved"
        ? {
            id: requestedSubmissionId,
            developerName: "Wesley Fan",
            robotModel: "Aegies",
            runMode: "Software check",
            code: "from agentech import Agentech\n\nAgentech.stand()\nAgentech.forward(speed_mps=0.3, duration_s=1)\nAgentech.stop()",
            uploadedFileName: "aegis_forward.py",
            commands: ["stand()", "forward(speed_mps=0.3, duration_s=1)", "stop()"],
            physicalSafetyStatus: "passed",
            aiSecurityStatus: "passed",
            creditsCharged: 50,
            createdAt: new Date().toISOString()
          }
        : requestedSubmissionId === "agentech-preview-hardware"
          ? {
              id: requestedSubmissionId,
              developerName: "Wesley Fan",
              robotModel: "Aegies",
              runMode: "Physical hardware limit and capability test",
              code: "from agentech import Agentech\n\nAgentech.stand()\nAgentech.turn(angle_deg=-45, turn_rate_deg_s=-22.5)",
              uploadedFileName: null,
              commands: ["stand()", "turn(angle_deg=-45, turn_rate_deg_s=-22.5)"],
              physicalSafetyStatus: "passed",
              aiSecurityStatus: "locked",
              creditsCharged: 0,
              createdAt: new Date().toISOString()
            }
          : null;
      return NextResponse.json({
        ok: true,
        internalAccount: isAgentechCompanyEmail(email),
        creditsRequired: 0,
        creditCost: getAiReviewCreditCost(),
        masterLiveTestAccess: hasMasterLiveTestAccess(email),
        latestSubmission: previewSubmission,
        localPreview: true
      });
    }

    const account = await getAccountRecord(email);
    if (!account) {
      return NextResponse.json(
        { error: "The signed-in account could not be found. Refresh your account page, then retry.", errorCode: "ACCOUNT_NOT_FOUND" },
        { status: 404 }
      );
    }

    const { internalCompanyAccount: internalAccount } = getSoftwareCheckCreditPolicy(email);
    const submissionId = requestedSubmissionId || account.developer_latest_code_submission_id;
    const submission = submissionId ? await getCodeSubmissionRecord(submissionId, email) : null;

    if (requestedSubmissionId && !submission) {
      return NextResponse.json({ error: "That saved submission was not found on this account." }, { status: 404 });
    }

    if (requestedSubmissionId && submission?.physical_safety_status !== "passed") {
      return NextResponse.json({ error: "Only hardware-passed submissions can be viewed here." }, { status: 403 });
    }

    return NextResponse.json({
      ok: true,
      internalAccount,
      creditsRequired: internalAccount || hasPaidSoftwareReviewExemption(email) ? 0 : getAiReviewCreditCost(),
      softwareReviewExempt: hasPaidSoftwareReviewExemption(email),
      creditCost: getAiReviewCreditCost(),
      masterLiveTestAccess: hasMasterLiveTestAccess(email),
      latestSubmission: submission
        ? {
            id: submission.id,
            developerName: submission.developer_name,
            robotModel: submission.robot_model,
            runMode: submission.run_mode,
            code: submission.code,
            uploadedFileName: submission.uploaded_file_name,
            commands: submission.commands,
            physicalSafetyStatus: submission.physical_safety_status,
            aiSecurityStatus: submission.ai_security_status,
            creditsCharged: submission.credits_charged,
            createdAt: submission.created_at
          }
        : null
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load the latest code-review gate." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as SubmissionPayload;
    const submittedEmail = await getServerAccountEmail(request);
    const isLocalPreview = process.env.NODE_ENV !== "production";
    const email = isValidAccountIdentifier(submittedEmail) ? submittedEmail : isLocalPreview ? "developer.preview@agentech.local" : submittedEmail;
    const developerName = cleanText(payload.developerName, isLocalPreview ? "Local preview" : "Agentech developer") || "Agentech developer";
    const robotModel = normalizeAgentechRobotModel(payload.robotModel ?? "Aegies");
    const runMode = cleanText(payload.runMode, "Software check");
    const code = cleanText(payload.code);
    const uploadedFileName = cleanText(payload.uploadedFileName);
    const reviewStage = cleanText(payload.reviewStage, "physical");
    const submissionId = cleanText(payload.submissionId);
    const commands = extractCommands(code);
    const usesReturnToHome = commands.some((command) => command.startsWith("return_to_home("));
    const { internalCompanyAccount: internalAccount } = getSoftwareCheckCreditPolicy(email);

    if (!robotModel) {
      return NextResponse.json({ error: "Choose Aegies or Navi before running the hardware check.", errorCode: "INVALID_ROBOT_MODEL" }, { status: 400 });
    }

    if (!isAllowedRunMode(runMode)) {
      return NextResponse.json({ error: "Choose a valid review mode.", errorCode: "INVALID_RUN_MODE" }, { status: 400 });
    }

    if (!code || !commands.length) {
      return NextResponse.json(
        {
          error: "Upload a .py file or paste code containing at least one Agentech command before running the check.",
          errorCode: "CODE_REQUIRED"
        },
        { status: 400 }
      );
    }

    if (!isValidAccountIdentifier(email)) {
      return NextResponse.json(
        { error: "Your account session could not be verified. Sign in again, then retry the check.", errorCode: "AUTH_REQUIRED" },
        { status: 401 }
      );
    }

    const validationErrors = validateAgentechCode(code, robotModel);
    if (validationErrors.length) {
      return NextResponse.json(
        { error: validationErrors.join(" "), errorCode: "CODE_VALIDATION_FAILED" },
        { status: 400 }
      );
    }

    if (usesReturnToHome && !isLocalPreview) {
      const premiumAccess = await getReturnToHomeAccess(email);
      if (!premiumAccess.allowed) {
        return NextResponse.json(
          {
            error: "Agentech.return_to_home() requires an active monthly subscription or a one-time feature unlock.",
            errorCode: "PREMIUM_FEATURE_REQUIRED",
            featureCode: RETURN_TO_HOME_FEATURE_CODE,
            purchasePath: "/agentech-products/eaic-hub/agentech-library"
          },
          { status: 402 }
        );
      }
    }
    const movementSafety = evaluateAgentechMovementSafety(code, robotModel);

    if (isLocalPreview) {
      if (reviewStage === "physical") {
        if (!movementSafety.submitReady) {
          return NextResponse.json(
            {
              error: movementSafety.detail,
              movementSafety,
              physicalSafetyStatus: movementSafety.level === "WARNING" ? "warning" : "failed",
              status: "physical_hardware_blocked"
            },
            { status: 400 }
          );
        }
        const submittedAt = new Date().toISOString();
        const id = `local-hardware-${submittedAt.replace(/[-:.TZ]/g, "").slice(0, 14)}-${Math.random()
          .toString(36)
          .slice(2, 8)}`;
        const source = uploadedFileName ? "uploaded_file" : "pasted_code";
        await writeLocalSubmission(id, {
          id,
          email,
          submittedAt,
          developerName,
          robotModel,
          runMode,
          source,
          uploadedFileName: uploadedFileName || null,
          commands,
          code,
          physicalSafetyStatus: "passed",
          movementSafety,
          aiSecurityStatus: "locked",
          creditsCharged: 0,
          localPreview: true
        });

        return NextResponse.json({
          id,
          submittedAt,
          commandCount: commands.length,
          source,
          uploadedFileName: uploadedFileName || null,
          physicalSafetyStatus: "passed",
          movementSafety,
          aiSecurityStatus: "locked",
          status: "physical_hardware_passed",
          internalAccount,
          localPreview: true
        });
      }

      if (reviewStage === "software") {
        const id = submissionId || `local-software-${Date.now()}`;
        const findings = localSoftwareSecurityFindings(code);
        if (findings.length) {
          return NextResponse.json({
            error: "Software Security failed.",
            id,
            aiSecurityStatus: "failed",
            riskLevel: "high",
            summary: "Local preview detected software or platform security risk.",
            findings,
            creditsCharged: 0,
            creditsBypassed: true,
            internalAccount,
            status: "software_security_failed",
            localPreview: true
          }, { status: 400 });
        }
        return NextResponse.json({
          id,
          submittedAt: new Date().toISOString(),
          commandCount: commands.length,
          source: uploadedFileName ? "uploaded_file" : "pasted_code",
          uploadedFileName: uploadedFileName || null,
          physicalSafetyStatus: "passed",
          aiSecurityStatus: "passed",
          riskLevel: "low",
          summary: "Local preview Software Check passed without account credits.",
          findings: [],
          creditsCharged: 0,
          creditsBypassed: true,
          internalAccount,
          status: "approved_for_live_test",
          localPreview: true
        });
      }
    }

    const account = await getAccountRecord(email);
    if (!account) {
      return NextResponse.json(
        { error: "The signed-in account could not be found. Refresh your account page, then retry.", errorCode: "ACCOUNT_NOT_FOUND" },
        { status: 404 }
      );
    }

    if (reviewStage === "physical") {
      if (!movementSafety.submitReady) {
        return NextResponse.json(
          {
            error: movementSafety.detail,
            movementSafety,
            physicalSafetyStatus: movementSafety.level === "WARNING" ? "warning" : "failed",
            status: "physical_hardware_blocked"
          },
          { status: 400 }
        );
      }
      const submittedAt = new Date().toISOString();
      const id = `agentech-${submittedAt.replace(/[-:.TZ]/g, "").slice(0, 14)}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      const source = uploadedFileName ? "uploaded_file" : "pasted_code";
      const record = {
        id,
        email,
        submittedAt,
        developerName,
        robotModel,
        runMode,
        source,
        uploadedFileName: uploadedFileName || null,
        githubRepoUrl: null,
        githubBranch: null,
        commands,
        code,
        physicalSafetyStatus: "passed",
        movementSafety,
        aiSecurityStatus: "locked",
        creditsCharged: 0
      };

      await createCodeSubmissionRecord({
        id,
        email,
        developerName,
        robotModel,
        runMode,
        source,
        uploadedFileName: uploadedFileName || null,
        githubRepoUrl: null,
        githubBranch: null,
        commands,
        code
      });
      await markDeveloperReviewGateOnAccount({
        email,
        submissionId: id,
        physicalSafetyStatus: "passed",
        aiSecurityStatus: "locked"
      });
      await writeLocalSubmission(id, record);

      return NextResponse.json({
        id,
        submittedAt,
        commandCount: commands.length,
        source,
        uploadedFileName: uploadedFileName || null,
        physicalSafetyStatus: "passed",
        movementSafety,
        aiSecurityStatus: "locked",
        status: "physical_hardware_passed",
        internalAccount
      });
    }

    if (reviewStage !== "software") {
      return NextResponse.json({ error: "Choose physical or software review stage." }, { status: 400 });
    }

    if (!submissionId) {
      return NextResponse.json({ error: "Run Step 3 Physical Hardware Check before starting Step 4 Software Check." }, { status: 400 });
    }

    const submission = await getCodeSubmissionRecord(submissionId, email);
    if (!submission) {
      return NextResponse.json({ error: "Physical safety submission not found for this account." }, { status: 404 });
    }

    if (submission.physical_safety_status !== "passed") {
      return NextResponse.json({ error: "Software Check unlocks only after Step 3 Physical Hardware Check passes." }, { status: 403 });
    }

    if (normalizeAgentechRobotModel(submission.robot_model) !== robotModel) {
      return NextResponse.json({ error: "The selected robot model changed after the hardware check. Run the hardware check again for this robot." }, { status: 409 });
    }

    if (submission.ai_security_status !== "locked" || submission.ai_security_reviewed_at) {
      const error = submission.ai_security_status === "pending"
        ? "Software Check is already running for this submission."
        : "Software Check can only run once for each submission. Save a new hardware-passed submission to run another check.";
      return NextResponse.json(
        { error, aiSecurityStatus: submission.ai_security_status },
        { status: 409 }
      );
    }

    if (submission.code !== code) {
      return NextResponse.json({ error: "Code changed after Step 3 Physical Hardware Check passed. Run the hardware check again." }, { status: 409 });
    }

    const record = {
      id: submission.id,
      email,
      submittedAt: submission.created_at,
      developerName: submission.developer_name,
      robotModel: submission.robot_model,
      runMode: submission.run_mode,
      source: submission.source,
      uploadedFileName: submission.uploaded_file_name,
      githubRepoUrl: null,
      githubBranch: null,
      commands,
      code,
      physicalSafetyStatus: "passed",
      aiSecurityStatus: "pending",
      creditsCharged: 0
    };

    const bypassPaidSoftwareReview = hasPaidSoftwareReviewExemption(email);
    const creditCost = getAiReviewCreditCost();
    if (!bypassPaidSoftwareReview) {
      const spendPreview = allocateCreditSpend(account, creditCost);
      if (spendPreview.rechargeRequired && !internalAccount) {
        await writeLocalSubmission(submission.id, record);
        return NextResponse.json(
          {
            error: `Step 3 Physical Hardware Check passed, but Step 4 Software Check needs ${creditCost} account credit${creditCost === 1 ? "" : "s"}.`,
            id: submission.id,
            physicalSafetyStatus: "passed",
            aiSecurityStatus: "locked",
            creditsRequired: creditCost,
            shortfall: spendPreview.shortfall
          },
          { status: 402 }
        );
      }
    }

    const claimedSubmission = await claimCodeSubmissionSoftwareReview(submission.id, email);
    if (!claimedSubmission) {
      return NextResponse.json(
        { error: "Software Check has already been used or started for this submission.", aiSecurityStatus: "pending" },
        { status: 409 }
      );
    }
    await markDeveloperReviewGateOnAccount({
      email,
      submissionId: submission.id,
      aiSecurityStatus: "pending"
    });

    if (bypassPaidSoftwareReview) {
      const reviewedAt = new Date().toISOString();
      const summary = "Test-account exemption: live-test approval granted after hardware validation. Paid AI software review was not performed; AI risk was not assessed.";
      await updateCodeSubmissionRecord(submission.id, {
        ai_security_status: "passed",
        ai_security_model: "internal-test-bypass",
        ai_security_summary: summary,
        ai_security_findings: [],
        ai_security_risk_level: null,
        ai_security_reviewed_at: null,
        credits_charged: 0
      });
      await markDeveloperReviewGateOnAccount({
        email,
        submissionId: submission.id,
        aiSecurityStatus: "passed"
      });
      await writeLocalSubmission(submission.id, {
        ...record,
        aiSecurityStatus: "passed",
        aiSecurityModel: "internal-test-bypass",
        aiSecuritySummary: summary,
        aiSecurityFindings: [],
        aiSecurityRiskLevel: null,
        aiSecurityReviewedAt: null,
        softwareReviewExemptedAt: reviewedAt,
        creditsCharged: 0,
        softwareReviewBypassed: true
      });

      return NextResponse.json({
        id: submission.id,
        submittedAt: submission.created_at,
        commandCount: commands.length,
        source: record.source,
        uploadedFileName: record.uploadedFileName,
        physicalSafetyStatus: "passed",
        aiSecurityStatus: "passed",
        riskLevel: null,
        summary,
        findings: [],
        creditsCharged: 0,
        creditsBypassed: true,
        softwareReviewBypassed: true,
        internalAccount,
        status: "approved_for_live_test"
      });
    }

    let aiResult: Awaited<ReturnType<typeof runAgentechAiCodeReview>>;
    try {
      aiResult = await runAgentechAiCodeReview({
        userId: email,
        developerName,
        robotModel,
        runMode,
        githubRepoUrl: null,
        githubBranch: null,
        commands,
        code
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI gateway code scan failed.";
      const status = getGatewayErrorStatus(error);
      await updateCodeSubmissionRecord(submission.id, {
        ai_security_status: "error",
        ai_security_summary: message,
        ai_security_findings: [message],
        ai_security_reviewed_at: new Date().toISOString(),
        credits_charged: 0
      });
      await markDeveloperReviewGateOnAccount({
        email,
        submissionId: submission.id,
        aiSecurityStatus: "error"
      });
      await writeLocalSubmission(submission.id, {
        ...record,
        aiSecurityStatus: "error",
        aiSecuritySummary: message,
        creditsCharged: 0
      });

      return NextResponse.json(
        {
          error: `Step 3 Physical Hardware Check passed, but Step 4 Software Check could not complete: ${message}`,
          id: submission.id,
          physicalSafetyStatus: "passed",
          aiSecurityStatus: "error",
          creditsCharged: 0
        },
        { status }
      );
    }

    let creditsCharged = 0;
    let spend: Awaited<ReturnType<typeof spendAccountCredits>> = null;
    try {
      spend = await spendAccountCredits(email, creditCost);
    } catch (error) {
      if (!internalAccount) {
        throw error;
      }
    }
    if (spend && !spend.rechargeRequired) {
      creditsCharged = creditCost;
    } else if (!internalAccount) {
      const message = "AI security scan completed, but account credits could not be charged. Recharge and run Software Check again.";
      await updateCodeSubmissionRecord(submission.id, {
        ai_security_status: "error",
        ai_security_summary: message,
        ai_security_findings: [message],
        ai_security_reviewed_at: new Date().toISOString(),
        credits_charged: 0
      });
      await markDeveloperReviewGateOnAccount({
        email,
        submissionId: submission.id,
        aiSecurityStatus: "error"
      });
      return NextResponse.json({ error: message, id: submission.id, physicalSafetyStatus: "passed", aiSecurityStatus: "error" }, { status: 402 });
    }

    const aiSecurityStatus = aiResult.review.passed ? "passed" : "failed";
    await updateCodeSubmissionRecord(submission.id, {
      ai_security_status: aiSecurityStatus,
      ai_security_model: aiResult.model,
      ai_security_summary: aiResult.review.summary,
      ai_security_findings: aiResult.review.findings,
      ai_security_risk_level: aiResult.review.riskLevel,
      ai_security_reviewed_at: new Date().toISOString(),
      credits_charged: creditsCharged
    });
    await markDeveloperReviewGateOnAccount({
      email,
      submissionId: submission.id,
      aiSecurityStatus
    });

    await writeLocalSubmission(submission.id, {
      ...record,
      aiSecurityStatus,
      aiSecurityModel: aiResult.model,
      aiSecuritySummary: aiResult.review.summary,
      aiSecurityFindings: aiResult.review.findings,
      aiSecurityRiskLevel: aiResult.review.riskLevel,
      creditsCharged
    });

    if (!aiResult.review.passed) {
      return NextResponse.json(
        {
          error: `AI security scan failed: ${aiResult.review.summary}`,
          id: submission.id,
          physicalSafetyStatus: "passed",
          aiSecurityStatus,
          riskLevel: aiResult.review.riskLevel,
          findings: aiResult.review.findings,
          creditsCharged,
          creditsBypassed: internalAccount && creditsCharged === 0,
          internalAccount
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      id: submission.id,
      submittedAt: submission.created_at,
      commandCount: commands.length,
      source: record.source,
      uploadedFileName: record.uploadedFileName,
      physicalSafetyStatus: "passed",
      aiSecurityStatus,
      riskLevel: aiResult.review.riskLevel,
      summary: aiResult.review.summary,
      findings: aiResult.review.findings,
      creditsCharged,
      creditsBypassed: internalAccount && creditsCharged === 0,
      internalAccount,
      status: "approved_for_live_test"
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Submission failed." },
      { status: 500 }
    );
  }
}
