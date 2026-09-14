import { promises as fs } from "fs";
import { tmpdir } from "os";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import {
  deleteCodeSubmissionRecord,
  getAccountRecord,
  getCodeSubmissionRecord,
  getCodeSubmissionRecords,
  syncDeveloperReviewGateOnAccount
} from "@/lib/account-records";
import { isValidAccountIdentifier } from "@/lib/prototype-auth";
import { getServerAccountEmail } from "@/lib/server-account-session";

export async function GET(request: NextRequest) {
  try {
    const email = await getServerAccountEmail(request);
    if (!isValidAccountIdentifier(email)) {
      return NextResponse.json(
        { error: "Sign in again to view your reviewed code files." },
        { status: 401 }
      );
    }

    const submissions = (await getCodeSubmissionRecords(email)).filter(
      (submission) => submission.physical_safety_status === "passed"
    );
    return NextResponse.json({ ok: true, submissions });
  } catch {
    return NextResponse.json(
      { error: "Reviewed code files could not be loaded. Refresh the account and try again." },
      { status: 500 }
    );
  }
}

async function deleteLocalSubmissionMirror(id: string) {
  const configuredDir = process.env.AGENTECH_SUBMISSION_DIR?.trim();
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  const outputDir = configuredDir
    ? path.resolve(configuredDir)
    : isServerless
      ? path.join(tmpdir(), "agentech_submissions")
      : path.join(process.cwd(), "review_submissions");
  await fs.rm(path.join(outputDir, `${id}.json`), { force: true }).catch(() => undefined);
}

export async function DELETE(request: NextRequest) {
  try {
    const email = await getServerAccountEmail(request);
    if (!isValidAccountIdentifier(email)) {
      return NextResponse.json({ error: "Sign in again before deleting a reviewed code file." }, { status: 401 });
    }

    const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
    if (!id) {
      return NextResponse.json({ error: "Choose a reviewed code file to delete." }, { status: 400 });
    }

    const submission = await getCodeSubmissionRecord(id, email);
    if (!submission) {
      return NextResponse.json({ error: "That reviewed code file was not found on this account." }, { status: 404 });
    }
    if (submission.ai_security_status === "pending") {
      return NextResponse.json({ error: "Wait for the running Software Check to finish before deleting this submission." }, { status: 409 });
    }

    const account = await getAccountRecord(email);
    await deleteCodeSubmissionRecord(id, email);
    await deleteLocalSubmissionMirror(id);

    if (account?.developer_latest_code_submission_id === id) {
      const [nextLatestSubmission] = await getCodeSubmissionRecords(email, 1);
      await syncDeveloperReviewGateOnAccount(email, nextLatestSubmission ?? null);
    }

    return NextResponse.json({ ok: true, deletedId: id });
  } catch {
    return NextResponse.json(
      { error: "The reviewed code file could not be deleted. Refresh the account and try again." },
      { status: 500 }
    );
  }
}
