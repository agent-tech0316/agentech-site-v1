import { NextRequest, NextResponse } from "next/server";
import {
  addAccountCredits,
  allocateCreditSpend,
  createRobotSession,
  findRobotSessionConflict,
  getAccessProfiles,
  getAccountRecord,
  getCodeSubmissionRecord,
  getRobotSessionsInWindow,
  spendAccountCredits
} from "@/lib/account-records";
import { getServerAccountEmail } from "@/lib/server-account-session";
import { normalizeAgentechRobotModel } from "@/lib/agentech-robot-model";
import { isAgentechCompanyEmail } from "@/lib/company-accounts";
import { sendEmail } from "@/lib/email";
import { isValidAccountIdentifier, isValidEmail, normalizeEmail } from "@/lib/prototype-auth";
import {
  externalRobotViewingMaximumMinutes,
  externalRobotViewingMinimumMinutes,
  getRobotViewingCreditCost,
  isValidRobotViewingDuration,
  robotViewingCreditsPerMinute
} from "@/lib/robot-slot-pricing";

type RobotSlotPayload = {
  email?: string;
  profileId?: number | string;
  scheduledStart?: string;
  timeZone?: string;
  robotModel?: string;
  requestedRunType?: string;
  durationMinutes?: number | string;
  notes?: string;
};

const slotIntervalMinutes = 5;
const minimumLeadTimeMs = 2 * 60 * 1000;
const defaultTimeZone = "America/Los_Angeles";

const approvedCustomCodeLabel = "Approved custom code live test";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toProfileId(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function getDurationMinutes(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}

function validTimeZone(value: string) {
  if (!value) {
    return defaultTimeZone;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return value;
  } catch {
    return defaultTimeZone;
  }
}

function getTimeParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit"
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);

  return { hour, minute };
}

function isWithinRobotHours(date: Date, timeZone: string) {
  const { hour, minute } = getTimeParts(date, timeZone);
  const minutes = hour * 60 + minute;

  return minutes >= 9 * 60 && minutes < 17 * 60;
}

function isBookableSlotInterval(date: Date, timeZone: string) {
  const { minute } = getTimeParts(date, timeZone);
  return minute % slotIntervalMinutes === 0;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function roundUpToSlot(date: Date) {
  const rounded = new Date(date);
  rounded.setSeconds(0, 0);
  const minutes = rounded.getMinutes();
  const remainder = minutes % slotIntervalMinutes;
  if (remainder !== 0) {
    rounded.setMinutes(minutes + slotIntervalMinutes - remainder, 0, 0);
  }
  return rounded;
}

function normalizeRobotSlotStart(requestedStart: Date, timeZone: string, unlimitedHours = false) {
  const minimumStart = roundUpToSlot(new Date(Date.now() + minimumLeadTimeMs));
  const normalized = roundUpToSlot(requestedStart.getTime() < minimumStart.getTime() ? minimumStart : requestedStart);

  if (unlimitedHours || isWithinRobotHours(normalized, timeZone)) {
    return normalized;
  }

  while (!isWithinRobotHours(normalized, timeZone)) {
    normalized.setMinutes(normalized.getMinutes() + slotIntervalMinutes, 0, 0);
  }

  return normalized;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDateTime(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(date);
}

async function sendRobotSlotConfirmation(input: {
  email: string;
  accountName: string;
  profileUsername: string;
  profileType: string;
  robotModel: string;
  presetDemo: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  timeZone: string;
}) {
  const scheduledWindow = `${formatDateTime(input.scheduledStart, input.timeZone)} - ${formatDateTime(input.scheduledEnd, input.timeZone)}`;
  const subject = "Agentech robot slot request received";
  const text = [
    `Hi ${input.accountName || "there"},`,
    "",
    "We received your robot viewing slot request.",
    "",
    `Profile: @${input.profileUsername} (${input.profileType})`,
    `Robot: ${input.robotModel}`,
    `Time: ${scheduledWindow}`,
    `Demo: ${input.presetDemo}`,
    "",
    "This slot is for a supervised live test of code that passed Agentech physical safety and AI software security review.",
    "",
    "Agentech"
  ].join("\n");
  const html = `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5; max-width: 640px;">
      <h1 style="font-size: 24px; margin: 0 0 16px;">Robot slot request received</h1>
      <p>Hi ${escapeHtml(input.accountName || "there")},</p>
      <p>We received your robot viewing slot request.</p>
      <table style="border-collapse: collapse; width: 100%; margin: 20px 0;">
        <tr><td style="padding: 8px 0; color: #6b7280;">Profile</td><td style="padding: 8px 0; font-weight: 700;">@${escapeHtml(input.profileUsername)} (${escapeHtml(input.profileType)})</td></tr>
        <tr><td style="padding: 8px 0; color: #6b7280;">Robot</td><td style="padding: 8px 0; font-weight: 700;">${escapeHtml(input.robotModel)}</td></tr>
        <tr><td style="padding: 8px 0; color: #6b7280;">Time</td><td style="padding: 8px 0; font-weight: 700;">${escapeHtml(scheduledWindow)}</td></tr>
        <tr><td style="padding: 8px 0; color: #6b7280;">Demo</td><td style="padding: 8px 0; font-weight: 700;">${escapeHtml(input.presetDemo)}</td></tr>
      </table>
      <p>This slot is for a supervised live test of code that passed Agentech physical safety and AI software security review.</p>
      <p style="margin-top: 24px;">Agentech</p>
    </div>
  `;

  return sendEmail({
    to: input.email,
    subject,
    text,
    html
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const start = new Date(clean(url.searchParams.get("start")));
  const end = new Date(clean(url.searchParams.get("end")));

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return NextResponse.json({ error: "Choose a valid availability window." }, { status: 400 });
  }

  const sessions = await getRobotSessionsInWindow(start.toISOString(), end.toISOString());
  const activeStatuses = new Set(["requested", "confirmed", "approved", "scheduled", "pending", "running"]);
  const bookedSlots = sessions
    .filter((session) => activeStatuses.has(session.session_status.replace(/ /g, "_").toLowerCase()))
    .map((session) => ({
      id: session.id,
      scheduledStart: session.scheduled_start,
      scheduledEnd: session.scheduled_end,
      status: session.session_status
    }));

  return NextResponse.json({ ok: true, bookedSlots });
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as RobotSlotPayload | null;
  const email = normalizeEmail(payload?.email);
  const signedInEmail = await getServerAccountEmail(request);
  const profileId = toProfileId(payload?.profileId);
  const scheduledStartRaw = clean(payload?.scheduledStart);
  const requestedScheduledStart = new Date(scheduledStartRaw);
  const timeZone = validTimeZone(clean(payload?.timeZone));
  const requestedRunType = clean(payload?.requestedRunType) || "custom_code";
  const durationMinutes = getDurationMinutes(payload?.durationMinutes);
  const robotModel = normalizeAgentechRobotModel(payload?.robotModel ?? "Aegies");

  if (!isValidAccountIdentifier(signedInEmail)) {
    return NextResponse.json({ error: "Sign in before scheduling a robot viewing session." }, { status: 401 });
  }

  if (!isValidAccountIdentifier(email)) {
    return NextResponse.json({ error: "A valid account email is required." }, { status: 400 });
  }

  if (email !== signedInEmail) {
    return NextResponse.json({ error: "Robot slots can only be scheduled from the signed-in account." }, { status: 403 });
  }

  if (!profileId) {
    return NextResponse.json({ error: "Choose the profile that will use this robot slot." }, { status: 400 });
  }

  if (!robotModel) {
    return NextResponse.json({ error: "Choose Aegies or Navi for this robot slot." }, { status: 400 });
  }

  if (Number.isNaN(requestedScheduledStart.getTime())) {
    return NextResponse.json({ error: "Choose a valid robot slot time." }, { status: 400 });
  }

  const internalCompanyAccount = isAgentechCompanyEmail(email);
  const scheduledStart = normalizeRobotSlotStart(requestedScheduledStart, timeZone, internalCompanyAccount);

  if (!internalCompanyAccount && !isWithinRobotHours(scheduledStart, timeZone)) {
    return NextResponse.json({ error: "Robot slots must start between 9:00 AM and 5:00 PM." }, { status: 400 });
  }

  if (!isBookableSlotInterval(scheduledStart, timeZone)) {
    return NextResponse.json({ error: "Robot slots must start on a 5-minute boundary." }, { status: 400 });
  }

  if (requestedRunType !== "custom_code") {
    return NextResponse.json(
      { error: "Only customer-approved custom code can be scheduled for a robot session." },
      { status: 400 }
    );
  }

  const account = await getAccountRecord(email);
  if (!account) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  if (!isValidRobotViewingDuration(durationMinutes, internalCompanyAccount)) {
    return NextResponse.json(
      {
        error: internalCompanyAccount
          ? "Choose a viewing duration of at least 1 whole minute."
          : `Choose a viewing duration between ${externalRobotViewingMinimumMinutes} and ${externalRobotViewingMaximumMinutes} minutes.`
      },
      { status: 400 }
    );
  }

  const creditsRequired = internalCompanyAccount ? 0 : getRobotViewingCreditCost(durationMinutes);
  const creditPreview = allocateCreditSpend(account, creditsRequired);
  if (!internalCompanyAccount && creditPreview.rechargeRequired) {
    return NextResponse.json(
      {
        error: `This ${durationMinutes}-minute session costs ${creditsRequired.toLocaleString()} credits (${robotViewingCreditsPerMinute} per minute). Add ${creditPreview.shortfall.toLocaleString()} more credits to continue.`
      },
      { status: 402 }
    );
  }

  const profiles = await getAccessProfiles(email);
  const selectedProfile = profiles.find((profile) => profile.id === profileId);
  if (!selectedProfile) {
    return NextResponse.json({ error: "That profile does not belong to this account." }, { status: 403 });
  }

  const codeSubmission = account.developer_latest_code_submission_id
    ? await getCodeSubmissionRecord(account.developer_latest_code_submission_id, email)
    : null;

  if (
    !codeSubmission
    || codeSubmission.physical_safety_status !== "passed"
    || codeSubmission.ai_security_status !== "passed"
  ) {
    return NextResponse.json(
      { error: "Custom live-code testing requires a saved code file whose physical safety gate and AI security scan both passed." },
      { status: 403 }
    );
  }
  if (normalizeAgentechRobotModel(codeSubmission.robot_model) !== robotModel) {
    return NextResponse.json(
      { error: `Your latest approved code was checked for ${normalizeAgentechRobotModel(codeSubmission.robot_model) ?? "a different robot"}. Select that model or submit and approve new ${robotModel} code.` },
      { status: 409 }
    );
  }

  const presetDemo = approvedCustomCodeLabel;
  const scheduledEnd = addMinutes(scheduledStart, durationMinutes);
  const scheduledEndParts = getTimeParts(scheduledEnd, timeZone);
  if (!internalCompanyAccount && scheduledEndParts.hour * 60 + scheduledEndParts.minute > 17 * 60) {
    return NextResponse.json({ error: "Choose a start time that keeps the full viewing session within robot hours." }, { status: 400 });
  }

  const conflictingSession = await findRobotSessionConflict(scheduledStart.toISOString(), scheduledEnd.toISOString());
  if (conflictingSession) {
    return NextResponse.json({ error: "That robot slot is already requested. Choose another available time." }, { status: 409 });
  }

  let creditSpend: Awaited<ReturnType<typeof spendAccountCredits>> = null;
  if (!internalCompanyAccount) {
    creditSpend = await spendAccountCredits(email, creditsRequired);
    if (!creditSpend || creditSpend.rechargeRequired) {
      return NextResponse.json({ error: "Your credit balance changed. Add credits and request the slot again." }, { status: 402 });
    }
  }

  let session = null;
  try {
    session = await createRobotSession({
      email,
      accessProfileId: selectedProfile.id,
      profileUsername: selectedProfile.username,
      profileType: selectedProfile.profile_type,
      sessionTitle: `${presetDemo} for @${selectedProfile.username}`,
      robotModel,
      scheduledStart: scheduledStart.toISOString(),
      scheduledEnd: scheduledEnd.toISOString(),
      requestedRunType: "custom_code",
      approvedRunType: "custom_code",
      presetDemo,
      benchmarkStatus: "passed",
      codeSubmissionId: codeSubmission.id,
      price: creditsRequired / 100,
      notes: clean(payload?.notes) || null
    });
  } catch {
    if (creditSpend && !creditSpend.rechargeRequired) {
      await addAccountCredits(email, "paid", creditSpend.paidCreditsUsed);
      await addAccountCredits(email, "bonus", creditSpend.bonusCreditsUsed);
    }

    return NextResponse.json({ error: "Unable to save that robot slot. No credits were charged." }, { status: 500 });
  }

  if (!session) {
    if (creditSpend && !creditSpend.rechargeRequired) {
      await addAccountCredits(email, "paid", creditSpend.paidCreditsUsed);
      await addAccountCredits(email, "bonus", creditSpend.bonusCreditsUsed);
    }

    return NextResponse.json({ error: "Unable to save that robot slot. No credits were charged." }, { status: 500 });
  }

  const accountName = [account.first_name, account.last_name].filter(Boolean).join(" ");
  const emailResult = isValidEmail(email) ? await sendRobotSlotConfirmation({
    email,
    accountName,
    profileUsername: selectedProfile.username,
    profileType: selectedProfile.profile_type,
    robotModel,
    presetDemo,
    scheduledStart,
    scheduledEnd,
    timeZone
  }).catch(() => ({ sent: false })) : { sent: false };

  return NextResponse.json({ ok: true, session, emailSent: emailResult.sent, creditsCharged: creditsRequired });
}
