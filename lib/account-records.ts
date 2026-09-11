import { supabaseRequest } from "@/lib/supabase-server";
import type { AccountIdentity } from "@/lib/account-identity";
import { getUnpaidBalanceLines } from "@/lib/invoices";
import { getBillingInvoicesForEmail, type BillingInvoice } from "@/lib/billing";
import { normalizeEmail } from "@/lib/prototype-auth";
import { normalizeDeviceResults, type DeviceResult } from "@/lib/device-results";
import {
  isExclusiveRobotSessionReservation,
  selectRobotSessionReservationWinner,
} from "@/lib/robot-session-reservation";

export type AccountRecord = {
  email: string;
  auth_user_id?: string | null;
  first_name: string;
  last_name: string;
  phone: string;
  credit_balance: number;
  paid_credit_balance: number;
  bonus_credit_balance: number;
  developer_latest_code_submission_id: string | null;
  developer_physical_safety_status: string | null;
  developer_physical_safety_passed_at: string | null;
  developer_ai_security_status: string | null;
  developer_ai_security_passed_at: string | null;
  created_at: string;
  verified_at: string;
};

export type AccessProfileType = "developer" | "student" | "teacher" | "talent";

export type AccessProfile = {
  id: number;
  account_email: string;
  owner_user_id?: string | null;
  profile_type: AccessProfileType;
  username: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  dob: string | null;
  grade: string | null;
  sex: string | null;
  school_info: string | null;
  preferred_location: string | null;
  credit_limit: number;
  credits_used: number;
  monthly_credit_limit: number;
  monthly_credits_used: number;
  monthly_usage_period: string;
  created_at: string;
  updated_at: string;
};

export const profileRequiredFeatures = [
  "Book robot viewing time slots",
  "Sign in to Navi and other profile-based apps",
  "Submit profile-based robot sessions",
  "Access feature-specific profile tools"
];

export type AccountProfile = {
  email: string;
  auth_user_id?: string | null;
  first_name: string;
  last_name: string;
  phone: string;
  company: string | null;
  address: string | null;
  dob: string | null;
  account_type: "individual" | "group" | null;
  department?: string | null;
  discount_percent?: number | null;
  updated_at?: string;
};

export type AccountChild = {
  id?: number;
  parent_email: string;
  first_name: string;
  last_name: string;
  dob: string;
  grade: string;
  sex: string;
  school_info?: string | null;
  preferred_location?: string | null;
  selected_course_code?: string | null;
  selected_course_title?: string | null;
  created_at?: string;
};

export type PreorderRequest = {
  invoice_number: string;
  product: string;
  email: string;
  name: string;
  phone: string;
  company: string | null;
  notes: string | null;
  status: string;
  created_at: string;
};

type RobotInvoiceReference = {
  source_id: string | null;
};

export type EnrollmentRecord = {
  id: number;
  parent_email: string;
  child_id: number;
  site_name: string | null;
  class_id: string | null;
  price: number | null;
  paid: boolean;
  created_at: string;
  agentech_classes?: {
    class_name: string;
    class_time: string;
    starting_date: string;
    age_range: string;
  } | null;
};

export type InternshipApplicationRecord = {
  id: number;
  name: string;
  email: string;
  role_interests: string[] | null;
  resume_filename: string | null;
  created_at: string;
};

export type AiRoboticsClubApplicationRecord = {
  id: number;
  name: string;
  email: string;
  grade: string | null;
  interests: string[] | null;
  resume_filename: string | null;
  created_at: string;
};

export type RobotSessionRecord = {
  id: number;
  email: string;
  access_profile_id: number | null;
  profile_username: string | null;
  profile_type: AccessProfileType | null;
  session_title: string;
  robot_model: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  session_status: string;
  requested_run_type: string | null;
  approved_run_type: string | null;
  preset_demo: string | null;
  benchmark_status: string | null;
  code_submission_id: string | null;
  price: number | null;
  invoice_number: string | null;
  notes: string | null;
  device_results: DeviceResult[];
  device_results_requested: boolean;
  device_results_error: string | null;
  device_results_updated_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AccountCreditPaymentRecord = {
  id: number;
  email: string;
  credits: number;
  amount_cents: number;
  currency: string;
  status: "pending" | "paid" | "failed" | "refunded";
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  created_at: string;
  updated_at: string;
};

export type CodeSubmissionRecord = {
  id: string;
  email: string;
  developer_name: string;
  robot_model: string;
  run_mode: string;
  source: "pasted_code" | "uploaded_file" | "github";
  uploaded_file_name: string | null;
  github_repo_url: string | null;
  github_branch: string | null;
  commands: string[];
  code: string;
  physical_safety_status: "pending" | "passed" | "failed";
  ai_security_status: "locked" | "pending" | "passed" | "failed" | "error";
  ai_security_model: string | null;
  ai_security_summary: string | null;
  ai_security_findings: string[];
  ai_security_risk_level: string | null;
  ai_security_reviewed_at: string | null;
  credits_charged: number;
  created_at: string;
  updated_at: string;
};

export async function getAccountRecord(email: string) {
  const baseSelect = "email,first_name,last_name,phone,credit_balance,paid_credit_balance,bonus_credit_balance,created_at,verified_at";
  const reviewSelect = "developer_latest_code_submission_id,developer_physical_safety_status,developer_physical_safety_passed_at,developer_ai_security_status,developer_ai_security_passed_at";

  let rows: AccountRecord[];
  try {
    rows = await supabaseRequest<AccountRecord[]>("agentech_accounts", {
      query: `email=eq.${encodeURIComponent(email)}&select=${baseSelect},${reviewSelect}&limit=1`
    });
  } catch {
    rows = await supabaseRequest<Array<Omit<AccountRecord, "developer_latest_code_submission_id" | "developer_physical_safety_status" | "developer_physical_safety_passed_at" | "developer_ai_security_status" | "developer_ai_security_passed_at">>>("agentech_accounts", {
      query: `email=eq.${encodeURIComponent(email)}&select=${baseSelect}&limit=1`
    }).then((fallbackRows) => fallbackRows.map((row) => ({
      ...row,
      developer_latest_code_submission_id: null,
      developer_physical_safety_status: null,
      developer_physical_safety_passed_at: null,
      developer_ai_security_status: null,
      developer_ai_security_passed_at: null
    })));
  }

  return rows[0] ?? null;
}

export async function updateAccountRecord(input: {
  identity: AccountIdentity;
  firstName: string;
  lastName: string;
  phone: string;
  address?: string | null;
}) {
  const rows = await supabaseRequest<AccountRecord[]>("agentech_accounts", {
    method: "PATCH",
    query: `auth_user_id=eq.${encodeURIComponent(input.identity.userId)}&email=eq.${encodeURIComponent(input.identity.email)}`,
    body: {
      first_name: input.firstName,
      last_name: input.lastName,
      phone: input.phone
    }
  });

  const account = rows[0] ?? null;
  if (!account) {
    return null;
  }

  const existingProfile = await getProfileForIdentity(input.identity);
  await upsertProfileForIdentity(input.identity, {
    first_name: input.firstName,
    last_name: input.lastName,
    phone: input.phone,
    company: existingProfile?.company ?? null,
    address: input.address || null,
    dob: existingProfile?.dob ?? null,
    account_type: existingProfile?.account_type ?? null
  });

  return account;
}

export async function createCodeSubmissionRecord(input: {
  id: string;
  email: string;
  developerName: string;
  robotModel: string;
  runMode: string;
  source: "pasted_code" | "uploaded_file" | "github";
  uploadedFileName?: string | null;
  githubRepoUrl: string | null;
  githubBranch: string | null;
  commands: string[];
  code: string;
}) {
  const rows = await supabaseRequest<CodeSubmissionRecord[]>("agentech_code_submissions", {
    method: "POST",
    body: {
      id: input.id,
      email: input.email,
      developer_name: input.developerName,
      robot_model: input.robotModel,
      run_mode: input.runMode,
      source: input.source,
      uploaded_file_name: input.uploadedFileName || null,
      github_repo_url: input.githubRepoUrl,
      github_branch: input.githubBranch,
      commands: input.commands,
      code: input.code,
      physical_safety_status: "passed",
      ai_security_status: "locked",
      updated_at: new Date().toISOString()
    }
  });

  return rows[0] ?? null;
}

export async function getCodeSubmissionRecord(id: string, email: string) {
  const rows = await supabaseRequest<CodeSubmissionRecord[]>("agentech_code_submissions", {
    query: `id=eq.${encodeURIComponent(id)}&email=eq.${encodeURIComponent(email)}&select=*&limit=1`
  });

  return rows[0] ?? null;
}

export async function getCodeSubmissionRecords(email: string, requestedLimit = 20) {
  const limit = Math.min(50, Math.max(1, Math.floor(requestedLimit)));
  return supabaseRequest<CodeSubmissionRecord[]>("agentech_code_submissions", {
    query: `email=eq.${encodeURIComponent(email)}&select=id,email,developer_name,robot_model,run_mode,source,uploaded_file_name,github_repo_url,github_branch,commands,code,physical_safety_status,ai_security_status,ai_security_model,ai_security_summary,ai_security_findings,ai_security_risk_level,ai_security_reviewed_at,credits_charged,created_at,updated_at&order=created_at.desc&limit=${limit}`
  });
}

export async function deleteCodeSubmissionRecord(id: string, email: string) {
  const rows = await supabaseRequest<CodeSubmissionRecord[]>("agentech_code_submissions", {
    method: "DELETE",
    query: `id=eq.${encodeURIComponent(id)}&email=eq.${encodeURIComponent(email)}`
  });

  return rows[0] ?? null;
}

export async function updateCodeSubmissionRecord(
  id: string,
  body: Partial<Pick<
    CodeSubmissionRecord,
    "physical_safety_status" | "ai_security_status" | "ai_security_model" | "ai_security_summary" | "ai_security_findings" | "ai_security_risk_level" | "ai_security_reviewed_at" | "credits_charged"
  >>
) {
  const rows = await supabaseRequest<CodeSubmissionRecord[]>("agentech_code_submissions", {
    method: "PATCH",
    query: `id=eq.${encodeURIComponent(id)}`,
    body: {
      ...body,
      updated_at: new Date().toISOString()
    }
  });

  return rows[0] ?? null;
}

export async function claimCodeSubmissionSoftwareReview(id: string, email: string) {
  const rows = await supabaseRequest<CodeSubmissionRecord[]>("agentech_code_submissions", {
    method: "PATCH",
    query: `id=eq.${encodeURIComponent(id)}&email=eq.${encodeURIComponent(email)}&ai_security_status=eq.locked&ai_security_reviewed_at=is.null`,
    body: {
      ai_security_status: "pending",
      credits_charged: 0,
      updated_at: new Date().toISOString()
    }
  });

  return rows[0] ?? null;
}

export async function markDeveloperReviewGateOnAccount(input: {
  email: string;
  submissionId: string;
  physicalSafetyStatus?: "passed" | "failed";
  aiSecurityStatus?: "locked" | "pending" | "passed" | "failed" | "error";
}) {
  const now = new Date().toISOString();
  const body: Record<string, string | null> = {
    developer_latest_code_submission_id: input.submissionId
  };

  if (input.physicalSafetyStatus) {
    body.developer_physical_safety_status = input.physicalSafetyStatus;
    body.developer_physical_safety_passed_at = input.physicalSafetyStatus === "passed" ? now : null;
  }

  if (input.aiSecurityStatus) {
    body.developer_ai_security_status = input.aiSecurityStatus;
    body.developer_ai_security_passed_at = input.aiSecurityStatus === "passed" ? now : null;
  }

  await supabaseRequest<null>("agentech_accounts", {
    method: "PATCH",
    query: `email=eq.${encodeURIComponent(input.email)}`,
    prefer: "return=minimal",
    body
  });
}

export async function syncDeveloperReviewGateOnAccount(email: string, submission: CodeSubmissionRecord | null) {
  const physicalPassed = submission?.physical_safety_status === "passed";
  const softwarePassed = submission?.ai_security_status === "passed";

  await supabaseRequest<null>("agentech_accounts", {
    method: "PATCH",
    query: `email=eq.${encodeURIComponent(email)}`,
    prefer: "return=minimal",
    body: {
      developer_latest_code_submission_id: submission?.id ?? null,
      developer_physical_safety_status: submission?.physical_safety_status ?? null,
      developer_physical_safety_passed_at: physicalPassed ? submission?.updated_at ?? submission?.created_at ?? null : null,
      developer_ai_security_status: submission?.ai_security_status ?? null,
      developer_ai_security_passed_at: softwarePassed ? submission?.ai_security_reviewed_at ?? submission?.updated_at ?? null : null
    }
  });
}

export async function hasPassedDeveloperCodeReview(email: string) {
  const account = await getAccountRecord(email);
  return account?.developer_physical_safety_status === "passed" && account.developer_ai_security_status === "passed";
}

export async function getAccessProfiles(email: string) {
  return supabaseRequest<AccessProfile[]>("agentech_account_profiles", {
    query: `account_email=eq.${encodeURIComponent(email)}&select=id,account_email,owner_user_id,profile_type,username,display_name,first_name,last_name,dob,grade,sex,school_info,preferred_location,credit_limit,credits_used,monthly_credit_limit,monthly_credits_used,monthly_usage_period,created_at,updated_at&order=created_at.desc`
  }).catch(() => []);
}

export async function getAccessProfileByUsername(username: string) {
  const normalizedUsername = normalizeProfileUsername(username);
  if (!normalizedUsername) {
    return null;
  }

  const rows = await supabaseRequest<AccessProfile[]>("agentech_account_profiles", {
    query: `username=eq.${encodeURIComponent(normalizedUsername)}&select=id,account_email,owner_user_id,profile_type,username,display_name,first_name,last_name,dob,grade,sex,school_info,preferred_location,credit_limit,credits_used,monthly_credit_limit,monthly_credits_used,monthly_usage_period,created_at,updated_at&limit=1`
  });

  return rows[0] ?? null;
}

export async function getAccessProfileById(id: number) {
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  const rows = await supabaseRequest<AccessProfile[]>("agentech_account_profiles", {
    query: `id=eq.${id}&select=id,account_email,owner_user_id,profile_type,username,display_name,first_name,last_name,dob,grade,sex,school_info,preferred_location,credit_limit,credits_used,monthly_credit_limit,monthly_credits_used,monthly_usage_period,created_at,updated_at&limit=1`
  });

  return rows[0] ?? null;
}

export function isAccessProfileType(value: unknown): value is AccessProfileType {
  return value === "developer" || value === "student" || value === "teacher" || value === "talent";
}

export function normalizeProfileUsername(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isValidProfileUsername(username: string) {
  return /^[a-z0-9][a-z0-9._-]{2,31}$/.test(username);
}

function getCurrentUsagePeriod() {
  return new Date().toISOString().slice(0, 7);
}

function getProfileMonthlyCreditsUsed(profile: Pick<AccessProfile, "monthly_credits_used" | "monthly_usage_period">) {
  return profile.monthly_usage_period === getCurrentUsagePeriod() ? Number(profile.monthly_credits_used ?? 0) : 0;
}

export function buildCreditSummary(account: AccountRecord | null, accessProfiles: AccessProfile[]) {
  const legacyPaidCredits = Number(account?.credit_balance ?? 0);
  const storedPaidCredits = Number(account?.paid_credit_balance ?? 0);
  const bonus = Number(account?.bonus_credit_balance ?? 0);
  const paid = storedPaidCredits > 0 || bonus > 0 ? storedPaidCredits : legacyPaidCredits;
  const balance = paid + bonus;
  const monthlyLimitTotal = accessProfiles.reduce((total, profile) => total + Number(profile.monthly_credit_limit ?? profile.credit_limit ?? 0), 0);
  const used = accessProfiles.reduce((total, profile) => total + Number(profile.credits_used ?? 0), 0);
  const monthlyUsed = accessProfiles.reduce((total, profile) => total + getProfileMonthlyCreditsUsed(profile), 0);

  return {
    balance,
    paid,
    bonus,
    assigned: monthlyLimitTotal,
    monthlyLimitTotal,
    used,
    monthlyUsed,
    unassigned: balance,
    rechargeRequired: balance <= 0
  };
}

export function buildFeatureAccess(accessProfiles: AccessProfile[]) {
  const hasProfiles = accessProfiles.length > 0;

  return {
    hasProfiles,
    accountOnly: !hasProfiles,
    lockedFeatures: hasProfiles ? [] : profileRequiredFeatures
  };
}

export function allocateCreditSpend(account: Pick<AccountRecord, "credit_balance" | "paid_credit_balance" | "bonus_credit_balance">, requestedCredits: number) {
  const requested = Math.max(0, Math.floor(requestedCredits));
  const credits = buildCreditSummary(account as AccountRecord, []);
  const paidCreditsUsed = Math.min(credits.paid, requested);
  const remainingAfterPaid = requested - paidCreditsUsed;
  const bonusCreditsUsed = Math.min(credits.bonus, remainingAfterPaid);
  const shortfall = remainingAfterPaid - bonusCreditsUsed;

  return {
    requested,
    paidCreditsUsed,
    bonusCreditsUsed,
    shortfall,
    paidCreditBalanceAfter: credits.paid - paidCreditsUsed,
    bonusCreditBalanceAfter: credits.bonus - bonusCreditsUsed,
    rechargeRequired: shortfall > 0
  };
}

export async function addAccountCredits(email: string, creditType: "paid" | "bonus", creditsToAdd: number) {
  const normalizedEmail = normalizeEmail(email);
  const account = await getAccountRecord(normalizedEmail);
  if (!account) {
    return null;
  }

  const amount = Math.max(0, Math.floor(creditsToAdd));
  const current = buildCreditSummary(account, []);
  const paidCreditBalance = creditType === "paid" ? current.paid + amount : current.paid;
  const bonusCreditBalance = creditType === "bonus" ? current.bonus + amount : current.bonus;

  const updatedRows = await supabaseRequest<AccountRecord[]>("agentech_accounts", {
    method: "PATCH",
    query: `email=eq.${encodeURIComponent(normalizedEmail)}`,
    body: {
      credit_balance: paidCreditBalance,
      paid_credit_balance: paidCreditBalance,
      bonus_credit_balance: bonusCreditBalance
    }
  });

  const updatedAccount = updatedRows[0] ?? null;
  if (!updatedAccount) {
    return null;
  }

  return {
    email: normalizedEmail,
    paid: Number(updatedAccount.paid_credit_balance ?? paidCreditBalance),
    bonus: Number(updatedAccount.bonus_credit_balance ?? bonusCreditBalance),
    balance: Number(updatedAccount.paid_credit_balance ?? paidCreditBalance) + Number(updatedAccount.bonus_credit_balance ?? bonusCreditBalance)
  };
}

export async function createAccountCreditPayment(input: {
  email: string;
  credits: number;
  amountCents: number;
  stripeSessionId: string;
}) {
  const rows = await supabaseRequest<AccountCreditPaymentRecord[]>("agentech_account_credit_payments", {
    method: "POST",
    body: {
      email: input.email,
      credits: input.credits,
      amount_cents: input.amountCents,
      currency: "usd",
      status: "pending",
      stripe_checkout_session_id: input.stripeSessionId,
      stripe_payment_intent_id: null,
      updated_at: new Date().toISOString()
    }
  });

  return rows[0] ?? null;
}

export async function fulfillAccountCreditPayment(input: {
  stripeSessionId: string;
  paymentIntentId?: string | null;
}) {
  const rows = await supabaseRequest<AccountCreditPaymentRecord[]>("agentech_account_credit_payments", {
    query: `stripe_checkout_session_id=eq.${encodeURIComponent(input.stripeSessionId)}&select=*&limit=1`
  });
  const payment = rows[0] ?? null;

  if (!payment) {
    return null;
  }

  if (payment.status === "paid") {
    return payment;
  }

  await addAccountCredits(payment.email, "paid", payment.credits);

  const updatedRows = await supabaseRequest<AccountCreditPaymentRecord[]>("agentech_account_credit_payments", {
    method: "PATCH",
    query: `stripe_checkout_session_id=eq.${encodeURIComponent(input.stripeSessionId)}`,
    body: {
      status: "paid",
      stripe_payment_intent_id: input.paymentIntentId || null,
      updated_at: new Date().toISOString()
    }
  });

  return updatedRows[0] ?? payment;
}

export async function spendAccountCredits(email: string, requestedCredits: number) {
  const account = await getAccountRecord(email);
  if (!account) {
    return null;
  }

  const spend = allocateCreditSpend(account, requestedCredits);
  if (spend.rechargeRequired) {
    return spend;
  }

  await supabaseRequest<null>("agentech_accounts", {
    method: "PATCH",
    query: `email=eq.${encodeURIComponent(email)}`,
    prefer: "return=minimal",
    body: {
      credit_balance: spend.paidCreditBalanceAfter,
      paid_credit_balance: spend.paidCreditBalanceAfter,
      bonus_credit_balance: spend.bonusCreditBalanceAfter
    }
  });

  return spend;
}

export async function spendProfileCredits(username: string, requestedCredits: number) {
  const profile = await getAccessProfileByUsername(username);
  if (!profile) {
    return null;
  }

  const requested = Math.max(0, Math.floor(requestedCredits));
  const monthlyCreditsUsed = getProfileMonthlyCreditsUsed(profile);
  const monthlyCreditLimit = Number(profile.monthly_credit_limit ?? profile.credit_limit ?? 0);
  const monthlyCreditsRemaining = Math.max(0, monthlyCreditLimit - monthlyCreditsUsed);

  if (requested > monthlyCreditsRemaining) {
    return {
      requested,
      profile,
      monthlyCreditLimit,
      monthlyCreditsUsed,
      monthlyCreditsRemaining,
      monthlyLimitExceeded: true,
      rechargeRequired: false,
      shortfall: requested - monthlyCreditsRemaining
    };
  }

  const spend = await spendAccountCredits(profile.account_email, requested);
  if (!spend || spend.rechargeRequired) {
    return {
      requested,
      profile,
      monthlyCreditLimit,
      monthlyCreditsUsed,
      monthlyCreditsRemaining,
      monthlyLimitExceeded: false,
      rechargeRequired: true,
      shortfall: spend?.shortfall ?? requested
    };
  }

  const nextMonthlyCreditsUsed = monthlyCreditsUsed + requested;
  const nextCreditsUsed = Number(profile.credits_used ?? 0) + requested;

  await supabaseRequest<null>("agentech_account_profiles", {
    method: "PATCH",
    query: `id=eq.${profile.id}`,
    prefer: "return=minimal",
    body: {
      credits_used: nextCreditsUsed,
      monthly_credits_used: nextMonthlyCreditsUsed,
      monthly_usage_period: getCurrentUsagePeriod(),
      updated_at: new Date().toISOString()
    }
  });

  return {
    ...spend,
    profile,
    monthlyCreditLimit,
    monthlyCreditsUsed: nextMonthlyCreditsUsed,
    monthlyCreditsRemaining: Math.max(0, monthlyCreditLimit - nextMonthlyCreditsUsed),
    monthlyLimitExceeded: false
  };
}

export async function createAccessProfile(input: {
  accountEmail: string;
  ownerUserId: string;
  profileType: AccessProfileType;
  username: string;
  displayName: string;
  monthlyCreditLimit: number;
  firstName?: string | null;
  lastName?: string | null;
  dob?: string | null;
  grade?: string | null;
  sex?: string | null;
  schoolInfo?: string | null;
  preferredLocation?: string | null;
}) {
  const monthlyCreditLimit = Math.max(0, Math.floor(input.monthlyCreditLimit));
  const rows = await supabaseRequest<AccessProfile[]>("agentech_account_profiles", {
    method: "POST",
    body: {
      account_email: input.accountEmail,
      owner_user_id: input.ownerUserId,
      profile_type: input.profileType,
      username: input.username,
      display_name: input.displayName,
      first_name: input.firstName || null,
      last_name: input.lastName || null,
      dob: input.dob || null,
      grade: input.grade || null,
      sex: input.sex || null,
      school_info: input.schoolInfo || null,
      preferred_location: input.preferredLocation || null,
      credit_limit: monthlyCreditLimit,
      credits_used: 0,
      monthly_credit_limit: monthlyCreditLimit,
      monthly_credits_used: 0,
      monthly_usage_period: getCurrentUsagePeriod(),
      updated_at: new Date().toISOString()
    }
  });

  return rows[0] ?? null;
}

export async function updateAccessProfile(input: {
  id: number;
  accountEmail: string;
  ownerUserId: string;
  profileType: AccessProfileType;
  username: string;
  displayName: string;
  monthlyCreditLimit: number;
  firstName?: string | null;
  lastName?: string | null;
  dob?: string | null;
  grade?: string | null;
  sex?: string | null;
  schoolInfo?: string | null;
  preferredLocation?: string | null;
}) {
  const monthlyCreditLimit = Math.max(0, Math.floor(input.monthlyCreditLimit));
  const rows = await supabaseRequest<AccessProfile[]>("agentech_account_profiles", {
    method: "PATCH",
    query: `id=eq.${input.id}&account_email=eq.${encodeURIComponent(input.accountEmail)}&owner_user_id=eq.${encodeURIComponent(input.ownerUserId)}`,
    body: {
      profile_type: input.profileType,
      username: input.username,
      display_name: input.displayName,
      first_name: input.firstName || null,
      last_name: input.lastName || null,
      dob: input.dob || null,
      grade: input.grade || null,
      sex: input.sex || null,
      school_info: input.schoolInfo || null,
      preferred_location: input.preferredLocation || null,
      credit_limit: monthlyCreditLimit,
      monthly_credit_limit: monthlyCreditLimit,
      updated_at: new Date().toISOString()
    }
  });

  const profile = rows[0] ?? null;
  if (profile) {
    await supabaseRequest<null>("agentech_robot_sessions", {
      method: "PATCH",
      query: `access_profile_id=eq.${input.id}`,
      prefer: "return=minimal",
      body: {
        profile_username: input.username,
        profile_type: input.profileType,
        updated_at: new Date().toISOString()
      }
    }).catch(() => null);
  }

  return profile;
}

export async function getProfile(email: string) {
  const rows = await supabaseRequest<AccountProfile[]>("agentech_profiles", {
    query: `email=eq.${encodeURIComponent(email)}&select=*&limit=1`
  });

  return rows[0] ?? null;
}

export async function getProfileForIdentity(identity: AccountIdentity) {
  const rows = await supabaseRequest<AccountProfile[]>("agentech_profiles", {
    query: `auth_user_id=eq.${encodeURIComponent(identity.userId)}&email=eq.${encodeURIComponent(identity.email)}&select=*&limit=1`
  });

  return rows[0] ?? null;
}

export async function upsertProfile(profile: AccountProfile) {
  const rows = await supabaseRequest<AccountProfile[]>("agentech_profiles", {
    method: "POST",
    query: "on_conflict=email",
    prefer: "resolution=merge-duplicates,return=representation",
    body: {
      ...profile,
      updated_at: new Date().toISOString()
    }
  });

  return rows[0] ?? null;
}

export async function upsertProfileForIdentity(
  identity: AccountIdentity,
  profile: Omit<AccountProfile, "email" | "auth_user_id">
) {
  const body = {
    ...profile,
    email: identity.email,
    auth_user_id: identity.userId,
    updated_at: new Date().toISOString()
  };
  const updated = await supabaseRequest<AccountProfile[]>("agentech_profiles", {
    method: "PATCH",
    query: `auth_user_id=eq.${encodeURIComponent(identity.userId)}&email=eq.${encodeURIComponent(identity.email)}`,
    body
  });
  if (updated[0]) return updated[0];

  const rows = await supabaseRequest<AccountProfile[]>("agentech_profiles", {
    method: "POST",
    query: "on_conflict=auth_user_id",
    prefer: "resolution=merge-duplicates,return=representation",
    body
  });
  return rows[0] ?? null;
}

export async function replaceChildren(parentEmail: string, children: Omit<AccountChild, "parent_email">[]) {
  await supabaseRequest<null>("agentech_children", {
    method: "DELETE",
    query: `parent_email=eq.${encodeURIComponent(parentEmail)}`,
    prefer: "return=minimal"
  });

  if (!children.length) {
    return [];
  }

  const childrenBody = children.map((child) => ({
      parent_email: parentEmail,
      first_name: child.first_name,
      last_name: child.last_name,
      dob: child.dob,
      grade: child.grade,
      sex: child.sex,
      school_info: child.school_info || null,
      preferred_location: child.preferred_location || null,
      selected_course_code: child.selected_course_code || null,
      selected_course_title: child.selected_course_title || null
    }));

  try {
    return await supabaseRequest<AccountChild[]>("agentech_children", {
      method: "POST",
      body: childrenBody
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";

    if (!message.includes("selected_course_code") && !message.includes("selected_course_title")) {
      throw error;
    }

    return supabaseRequest<AccountChild[]>("agentech_children", {
      method: "POST",
      body: childrenBody.map(({ selected_course_code, selected_course_title, ...child }) => child)
    });
  }
}

export async function getChildren(parentEmail: string) {
  return supabaseRequest<AccountChild[]>("agentech_children", {
    query: `parent_email=eq.${encodeURIComponent(parentEmail)}&select=*&order=created_at.asc`
  });
}

export async function getPreorderRequests(email: string) {
  return supabaseRequest<PreorderRequest[]>("agentech_preorder_invoices", {
    query: `email=eq.${encodeURIComponent(email)}&select=invoice_number,product,email,name,phone,company,notes,status,created_at&order=created_at.desc`
  });
}

async function getRobotInvoiceReferences(email: string) {
  return supabaseRequest<RobotInvoiceReference[]>("agentech_invoice_items", {
    query: `email=eq.${encodeURIComponent(email)}&source_type=eq.robot&select=source_id`
  }).catch(() => []);
}

export async function getEnrollments(parentEmail: string) {
  try {
    return await supabaseRequest<EnrollmentRecord[]>("agentech_enrollments", {
      query: `parent_email=eq.${encodeURIComponent(parentEmail)}&select=id,parent_email,child_id,site_name,class_id,price,paid,created_at,agentech_classes(class_name,class_time,starting_date,age_range)&order=created_at.desc`
    });
  } catch {
    return [];
  }
}

export async function getInternshipApplications(accountEmail: string) {
  try {
    return await supabaseRequest<InternshipApplicationRecord[]>("agentech_internship_applications", {
      query: `account_email=eq.${encodeURIComponent(accountEmail)}&select=id,name,email,role_interests,resume_filename,created_at&order=created_at.desc`
    });
  } catch {
    return [];
  }
}

export async function getAiRoboticsClubApplications(accountEmail: string) {
  try {
    return await supabaseRequest<AiRoboticsClubApplicationRecord[]>("agentech_ai_robotics_club_applications", {
      query: `account_email=eq.${encodeURIComponent(accountEmail)}&select=id,name,email,grade,interests,resume_filename,created_at&order=created_at.desc`
    });
  } catch {
    return [];
  }
}

export async function getRobotSessions(accountEmail: string) {
  try {
    const rows = await supabaseRequest<RobotSessionRecord[]>("agentech_robot_sessions", {
      query: `email=eq.${encodeURIComponent(accountEmail)}&select=id,email,access_profile_id,profile_username,profile_type,session_title,robot_model,scheduled_start,scheduled_end,session_status,requested_run_type,approved_run_type,preset_demo,benchmark_status,code_submission_id,price,invoice_number,notes,device_results,device_results_requested,device_results_error,device_results_updated_at,created_at,updated_at&order=scheduled_start.desc.nullslast,created_at.desc`
    });
    return rows.map(normalizeRobotSessionDeviceResults);
  } catch {
    try {
      const rows = await supabaseRequest<Array<Omit<RobotSessionRecord, "access_profile_id" | "profile_username" | "profile_type" | "requested_run_type" | "approved_run_type" | "preset_demo" | "benchmark_status" | "code_submission_id" | "device_results" | "device_results_requested" | "device_results_error" | "device_results_updated_at">>>("agentech_robot_sessions", {
        query: `email=eq.${encodeURIComponent(accountEmail)}&select=id,email,session_title,robot_model,scheduled_start,scheduled_end,session_status,price,invoice_number,notes,created_at,updated_at&order=scheduled_start.desc.nullslast,created_at.desc`
      });

      return rows.map((row) => ({
        ...row,
        access_profile_id: null,
        profile_username: null,
        profile_type: null,
        requested_run_type: null,
        approved_run_type: null,
        preset_demo: null,
        benchmark_status: null,
        code_submission_id: null,
        device_results: [],
        device_results_requested: false,
        device_results_error: null,
        device_results_updated_at: null
      }));
    } catch {
      return [];
    }
  }
}

function normalizeRobotSessionDeviceResults(row: RobotSessionRecord): RobotSessionRecord {
  return { ...row, device_results: normalizeDeviceResults(row.device_results) };
}

export async function getRobotSessionsStrict(accountEmail: string) {
  const rows = await supabaseRequest<Array<Omit<RobotSessionRecord, "device_results" | "device_results_requested" | "device_results_error" | "device_results_updated_at">>>("agentech_robot_sessions", {
    query: `email=eq.${encodeURIComponent(accountEmail)}&select=id,email,access_profile_id,profile_username,profile_type,session_title,robot_model,scheduled_start,scheduled_end,session_status,requested_run_type,approved_run_type,preset_demo,benchmark_status,code_submission_id,price,invoice_number,notes,created_at,updated_at&order=scheduled_start.desc.nullslast,created_at.desc`
  });
  return rows.map((row) => ({
    ...row,
    device_results: [],
    device_results_requested: false,
    device_results_error: null,
    device_results_updated_at: null
  }));
}

export async function getRobotSessionsInWindow(startIso: string, endIso: string) {
  try {
    const rows = await supabaseRequest<RobotSessionRecord[]>("agentech_robot_sessions", {
      query: `scheduled_start=gte.${encodeURIComponent(startIso)}&scheduled_start=lt.${encodeURIComponent(endIso)}&select=id,email,access_profile_id,profile_username,profile_type,session_title,robot_model,scheduled_start,scheduled_end,session_status,requested_run_type,approved_run_type,preset_demo,benchmark_status,code_submission_id,price,invoice_number,notes,device_results,device_results_requested,device_results_error,device_results_updated_at,created_at,updated_at&order=scheduled_start.asc`
    });
    return rows.map(normalizeRobotSessionDeviceResults);
  } catch {
    return [];
  }
}

function isActiveRobotSession(session: Pick<RobotSessionRecord, "session_status">) {
  const status = session.session_status.replace(/_/g, " ").toLowerCase();
  return !["cancelled", "canceled", "voided", "rejected", "deleted"].includes(status);
}

export async function findRobotSessionConflict(startIso: string, endIso: string) {
  let sessions: RobotSessionRecord[] = [];
  try {
    sessions = await supabaseRequest<RobotSessionRecord[]>("agentech_robot_sessions", {
      query: `scheduled_start=lt.${encodeURIComponent(endIso)}&select=id,email,access_profile_id,profile_username,profile_type,session_title,robot_model,scheduled_start,scheduled_end,session_status,requested_run_type,approved_run_type,preset_demo,benchmark_status,code_submission_id,price,invoice_number,notes,device_results,device_results_requested,device_results_error,device_results_updated_at,created_at,updated_at&order=scheduled_start.asc`
    });
    sessions = sessions.map(normalizeRobotSessionDeviceResults);
  } catch {
    sessions = [];
  }
  const requestedStart = new Date(startIso).getTime();
  const requestedEnd = new Date(endIso).getTime();

  return sessions.find((session) => {
    if (!isActiveRobotSession(session)) {
      return false;
    }

    const sessionStart = new Date(session.scheduled_start || "").getTime();
    const sessionEnd = new Date(session.scheduled_end || session.scheduled_start || "").getTime();

    if (!Number.isFinite(sessionStart) || !Number.isFinite(sessionEnd)) {
      return false;
    }

    return requestedStart < sessionEnd && requestedEnd > sessionStart;
  }) ?? null;
}

export async function getRobotSessionConflictsStrict(startIso: string, endIso: string) {
  const sessions = await supabaseRequest<RobotSessionRecord[]>("agentech_robot_sessions", {
    query: `scheduled_start=lt.${encodeURIComponent(endIso)}&select=id,email,access_profile_id,profile_username,profile_type,session_title,robot_model,scheduled_start,scheduled_end,session_status,requested_run_type,approved_run_type,preset_demo,benchmark_status,code_submission_id,price,invoice_number,notes,created_at,updated_at&order=scheduled_start.asc,created_at.asc`
  });
  const requestedStart = new Date(startIso).getTime();
  const requestedEnd = new Date(endIso).getTime();

  return sessions.filter((session) => {
    if (!isActiveRobotSession(session)) return false;
    const sessionStart = new Date(session.scheduled_start || "").getTime();
    const sessionEnd = new Date(session.scheduled_end || session.scheduled_start || "").getTime();
    return Number.isFinite(sessionStart)
      && Number.isFinite(sessionEnd)
      && requestedStart < sessionEnd
      && requestedEnd > sessionStart;
  });
}

export type RobotSessionInput = {
  email: string;
  accessProfileId: number;
  profileUsername: string;
  profileType: AccessProfileType;
  sessionTitle: string;
  robotModel: string;
  scheduledStart: string;
  scheduledEnd: string;
  requestedRunType: "preset_demo" | "custom_code";
  approvedRunType: "preset_demo" | "custom_code";
  presetDemo: string;
  benchmarkStatus: "not_started" | "pending" | "passed" | "failed";
  codeSubmissionId?: string | null;
  price?: number | null;
  notes?: string | null;
};

const robotSessionReservationLockId = -4_175_000_002;
const robotSessionReservationLockMaxAgeMs = 5 * 60 * 1000;

async function acquireRobotSessionReservationLock(input: RobotSessionInput) {
  const staleBefore = new Date(Date.now() - robotSessionReservationLockMaxAgeMs).toISOString();
  await supabaseRequest<RobotSessionRecord[]>("agentech_robot_sessions", {
    method: "DELETE",
    query: `id=eq.${robotSessionReservationLockId}&created_at=lt.${encodeURIComponent(staleBefore)}`
  });

  const token = `robot-session-reservation:${crypto.randomUUID()}`;
  const rows = await supabaseRequest<RobotSessionRecord[]>("agentech_robot_sessions", {
    method: "POST",
    query: "on_conflict=id",
    prefer: "resolution=ignore-duplicates,return=representation",
    body: {
      id: robotSessionReservationLockId,
      email: input.email,
      access_profile_id: input.accessProfileId,
      profile_username: input.profileUsername,
      profile_type: input.profileType,
      session_title: "Internal robot-session reservation lock",
      robot_model: input.robotModel,
      scheduled_start: "1970-01-01T00:00:00.000Z",
      scheduled_end: "1970-01-01T00:00:00.001Z",
      session_status: "cancelled",
      requested_run_type: "preset_demo",
      approved_run_type: "preset_demo",
      preset_demo: "Internal reservation lock",
      benchmark_status: "not_started",
      price: 0,
      notes: token
    }
  });

  return rows[0]?.notes === token ? token : null;
}

async function releaseRobotSessionReservationLock(token: string) {
  await supabaseRequest<RobotSessionRecord[]>("agentech_robot_sessions", {
    method: "DELETE",
    query: `id=eq.${robotSessionReservationLockId}&notes=eq.${encodeURIComponent(token)}`
  });
}

async function deleteExactRobotSession(id: number, email: string) {
  const rows = await supabaseRequest<RobotSessionRecord[]>("agentech_robot_sessions", {
    method: "DELETE",
    query: `id=eq.${id}&email=eq.${encodeURIComponent(email)}`
  });
  return rows[0] ?? null;
}

async function verifyRobotSessionReservation(session: RobotSessionRecord) {
  if (!session.scheduled_start || !session.scheduled_end) {
    await deleteExactRobotSession(session.id, session.email);
    return null;
  }

  let conflicts: RobotSessionRecord[];
  try {
    conflicts = await getRobotSessionConflictsStrict(session.scheduled_start, session.scheduled_end);
  } catch (error) {
    await deleteExactRobotSession(session.id, session.email);
    throw error;
  }

  const winner = selectRobotSessionReservationWinner(
    conflicts.some((candidate) => candidate.id === session.id)
      ? conflicts
      : [...conflicts, session]
  );
  if (winner?.id !== session.id) {
    await deleteExactRobotSession(session.id, session.email);
    return null;
  }

  return session;
}

export async function createRobotSession(input: RobotSessionInput) {
  const lockToken = await acquireRobotSessionReservationLock(input);
  if (!lockToken) return null;

  try {
    const conflicts = await getRobotSessionConflictsStrict(input.scheduledStart, input.scheduledEnd);
    if (conflicts.length) return null;

    const marker = input.codeSubmissionId ? `[[agentech_code_submission:${input.codeSubmissionId}]]` : "";
    const notes = [input.notes?.trim(), marker].filter(Boolean).join("\n") || null;
    const baseBody = {
      email: input.email,
      access_profile_id: input.accessProfileId,
      profile_username: input.profileUsername,
      profile_type: input.profileType,
      session_title: input.sessionTitle,
      robot_model: input.robotModel,
      scheduled_start: input.scheduledStart,
      scheduled_end: input.scheduledEnd,
      session_status: "requested",
      requested_run_type: input.requestedRunType,
      approved_run_type: input.approvedRunType,
      preset_demo: input.presetDemo,
      benchmark_status: input.benchmarkStatus,
      price: input.price ?? null,
      notes
    };
    let rows: RobotSessionRecord[];

    try {
      rows = await supabaseRequest<RobotSessionRecord[]>("agentech_robot_sessions", {
        method: "POST",
        body: {
          ...baseBody,
          code_submission_id: input.codeSubmissionId ?? null
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!/could not find.*code_submission_id.*column|column.*code_submission_id.*does not exist/i.test(message)) {
        throw error;
      }

      // Keep bookings working while the additive schema migration is rolling out.
      // The private marker pins the same immutable submission for the local bridge.
      rows = await supabaseRequest<RobotSessionRecord[]>("agentech_robot_sessions", {
        method: "POST",
        body: baseBody
      }).catch(() => {
        throw error;
      });
    }

    const session = rows[0] ?? null;
    return session ? await verifyRobotSessionReservation(session) : null;
  } finally {
    await releaseRobotSessionReservationLock(lockToken).catch(() => null);
  }
}

const masterLiveTestReservationId = -4_175_000_001;

export async function reserveMasterLiveTestSession(input: RobotSessionInput) {
  if (
    input.robotModel !== "Master"
    || input.requestedRunType !== "preset_demo"
    || input.approvedRunType !== "preset_demo"
    || input.codeSubmissionId !== null
  ) {
    throw new Error("Master live-test reservations must be view-only preset-demo sessions.");
  }

  const lockToken = await acquireRobotSessionReservationLock(input);
  if (!lockToken) {
    const error = new Error("Another robot session reservation is currently being saved. Try the Master live test again.");
    error.name = "MasterLiveTestConflictError";
    throw error;
  }

  try {
    const staleQueryPrefix = `id=eq.${masterLiveTestReservationId}`;
    await supabaseRequest<RobotSessionRecord[]>("agentech_robot_sessions", {
      method: "DELETE",
      query: `${staleQueryPrefix}&scheduled_end=lte.${encodeURIComponent(input.scheduledStart)}`
    });

    const conflicts = await getRobotSessionConflictsStrict(input.scheduledStart, input.scheduledEnd);
    const reusable = conflicts.find((session) => (
      session.id === masterLiveTestReservationId
      && session.email.trim().toLowerCase() === input.email.trim().toLowerCase()
      && session.robot_model === "Master"
      && session.approved_run_type === "preset_demo"
    ));
    if (reusable && isExclusiveRobotSessionReservation(conflicts, reusable.id)) {
      return { session: reusable, created: false };
    }
    if (conflicts.length) {
      const error = new Error("Another active robot session overlaps this 3-minute Master test.");
      error.name = "MasterLiveTestConflictError";
      throw error;
    }
    await supabaseRequest<RobotSessionRecord[]>("agentech_robot_sessions", {
      method: "DELETE",
      query: `${staleQueryPrefix}&session_status=in.(cancelled,canceled,voided,rejected,deleted)`
    });

    const notes = input.notes?.trim() || null;
    const body = {
      id: masterLiveTestReservationId,
      email: input.email,
      access_profile_id: input.accessProfileId,
      profile_username: input.profileUsername,
      profile_type: input.profileType,
      session_title: input.sessionTitle,
      robot_model: input.robotModel,
      scheduled_start: input.scheduledStart,
      scheduled_end: input.scheduledEnd,
      session_status: "requested",
      requested_run_type: input.requestedRunType,
      approved_run_type: input.approvedRunType,
      preset_demo: input.presetDemo,
      benchmark_status: input.benchmarkStatus,
      code_submission_id: null,
      price: input.price ?? null,
      notes
    };

  let inserted: RobotSessionRecord[];
  try {
    inserted = await supabaseRequest<RobotSessionRecord[]>("agentech_robot_sessions", {
      method: "POST",
      query: "on_conflict=id",
      prefer: "resolution=ignore-duplicates,return=representation",
      body
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!/could not find.*code_submission_id.*column|column.*code_submission_id.*does not exist/i.test(message)) throw error;
    const { code_submission_id: _codeSubmissionId, ...legacyBody } = body;
    void _codeSubmissionId;
    inserted = await supabaseRequest<RobotSessionRecord[]>("agentech_robot_sessions", {
      method: "POST",
      query: "on_conflict=id",
      prefer: "resolution=ignore-duplicates,return=representation",
      body: legacyBody
    });
  }

  if (inserted[0]) {
    const verified = await verifyRobotSessionReservation(inserted[0]);
    if (!verified) {
      const error = new Error("Another active robot session overlaps this 3-minute Master test.");
      error.name = "MasterLiveTestConflictError";
      throw error;
    }
    return { session: verified, created: true };
  }

  const existing = await supabaseRequest<RobotSessionRecord[]>("agentech_robot_sessions", {
    query: `${staleQueryPrefix}&select=id,email,access_profile_id,profile_username,profile_type,session_title,robot_model,scheduled_start,scheduled_end,session_status,requested_run_type,approved_run_type,preset_demo,benchmark_status,code_submission_id,price,invoice_number,notes,created_at,updated_at&limit=1`
  });
  const session = existing[0];
  if (
    !session
    || session.email.trim().toLowerCase() !== input.email.trim().toLowerCase()
    || session.robot_model !== "Master"
    || session.approved_run_type !== "preset_demo"
  ) {
    throw new Error("Unable to acquire the atomic Master live-test reservation.");
  }
  return { session, created: false };
  } finally {
    await releaseRobotSessionReservationLock(lockToken).catch(() => null);
  }
}

export async function deleteRobotSessionRecord(id: number, email: string) {
  const rows = await supabaseRequest<RobotSessionRecord[]>("agentech_robot_sessions", {
    method: "DELETE",
    query: `id=eq.${id}&email=eq.${encodeURIComponent(email)}&approved_run_type=eq.preset_demo`
  });

  return rows[0] ?? null;
}

function requestLooksActive(status: string) {
  const normalized = status.replace(/_/g, " ").toLowerCase();

  return normalized.includes("pending") || normalized.includes("sent");
}

export async function getAccountSummary(email: string) {
  const [account, accessProfiles, profile, children, requests, robotInvoiceReferences, robotSessions, enrollments, internshipApplications, aiRoboticsClubApplications, unpaidBalance, invoices] = await Promise.all([
    getAccountRecord(email),
    getAccessProfiles(email),
    getProfile(email),
    getChildren(email),
    getPreorderRequests(email),
    getRobotInvoiceReferences(email),
    getRobotSessions(email),
    getEnrollments(email),
    getInternshipApplications(email),
    getAiRoboticsClubApplications(email),
    getUnpaidBalanceLines(email),
    getBillingInvoicesForEmail(email)
  ]);
  const robotInvoiceIds = new Set(robotInvoiceReferences.map((reference) => reference.source_id).filter(Boolean));
  const normalizedRequests = requests.map((request) => ({
    ...request,
    status: requestLooksActive(request.status) && !robotInvoiceIds.has(request.invoice_number)
      ? "removed_from_cart"
      : request.status
  }));

  return {
    account,
    accessProfiles,
    creditSummary: buildCreditSummary(account, accessProfiles),
    featureAccess: buildFeatureAccess(accessProfiles),
    profile,
    children,
    requests: normalizedRequests,
    robotSessions,
    enrollments,
    applications: {
      internships: internshipApplications,
      aiRoboticsClub: aiRoboticsClubApplications
    },
    unpaidBalance,
    invoices: invoices satisfies BillingInvoice[]
  };
}
