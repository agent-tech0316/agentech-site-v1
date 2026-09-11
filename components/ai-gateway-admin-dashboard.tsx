"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getAccountSession, signOutAccountSession } from "@/lib/account-session";
import {
  AGENTECH_COMPANY_EMAIL_SUFFIX,
  isAgentechCompanyEmail,
  isAgentechGatewayOwnerEmail,
  isAgentechPrimaryOwnerEmail
} from "@/lib/company-accounts";

type AdminAiCap = {
  user_id: string;
  monthly_request_limit: number | string;
  monthly_token_limit: number | string;
  monthly_cost_limit: number | string;
  current_requests: number | string;
  current_tokens: number | string;
  current_cost: number | string;
  usage_period: string;
  updated_at: string;
};

type AdminAiUsage = {
  id: number;
  user_id: string;
  endpoint: string;
  model: string;
  prompt_tokens: number | string;
  completion_tokens: number | string;
  total_tokens: number | string;
  estimated_cost: number | string;
  status_code: number | null;
  latency_ms: number | null;
  created_at: string;
};

type AdminDeveloperProfile = {
  id: number;
  account_email: string;
  username: string;
  display_name: string;
  monthly_credit_limit: number | string;
  monthly_credits_used: number | string;
  monthly_usage_period: string;
  created_at: string;
};

type AdminDeveloperAccount = {
  email: string;
  credit_balance: number | string;
  paid_credit_balance: number | string;
  bonus_credit_balance: number | string;
  developer_latest_code_submission_id: string | null;
  developer_physical_safety_status: string | null;
  developer_ai_security_status: string | null;
  developer_ai_security_passed_at: string | null;
};

type AdminCodeSubmissionSummary = {
  id: string;
  email: string;
  developer_name: string;
  robot_model: string;
  run_mode: string;
  source: "pasted_code" | "uploaded_file" | "github";
  uploaded_file_name: string | null;
  commands: string[] | null;
  physical_safety_status: string | null;
  ai_security_status: string | null;
  ai_security_model: string | null;
  ai_security_summary: string | null;
  ai_security_findings: string[] | null;
  ai_security_risk_level: string | null;
  ai_security_reviewed_at: string | null;
  credits_charged: number | string | null;
  created_at: string;
  updated_at: string;
};

type AdminCodeSubmissionDetail = AdminCodeSubmissionSummary & {
  code: string;
  github_repo_url: string | null;
  github_branch: string | null;
};

type AdminAiUsageData = {
  caps: AdminAiCap[];
  usage: AdminAiUsage[];
  developerProfiles: AdminDeveloperProfile[];
  developerAccounts: AdminDeveloperAccount[];
  codeSubmissions: AdminCodeSubmissionSummary[];
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatTokenCount(value: number | string | undefined | null) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.max(0, Math.floor(amount)).toLocaleString() : "0";
}

function formatGatewayCost(value: number | string | undefined | null) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? `$${amount.toFixed(2)}` : "$0.00";
}

function getDisplayedUsageCost(row: AdminAiUsage) {
  return row.endpoint === "robot_code_security_review" ? 0.5 : Number(row.estimated_cost ?? 0);
}

function getCurrentMonthUsageCost(rows: AdminAiUsage[]) {
  const currentMonth = new Date().toISOString().slice(0, 7);
  return rows.reduce((total, row) => {
    return row.created_at.startsWith(currentMonth) ? total + getDisplayedUsageCost(row) : total;
  }, 0);
}

function formatCreditsWithUsd(value: number | string | undefined | null) {
  const credits = Math.max(0, Math.floor(Number(value ?? 0)));
  return `${credits.toLocaleString()} (${formatGatewayCost(credits / 100)})`;
}

function formatDurationMs(value: number | string | undefined | null) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) return "0 ms";
  if (amount < 1000) return `${Math.round(amount).toLocaleString()} ms`;
  return `${(amount / 1000).toFixed(1)} s`;
}

function formatStatus(value: string | null | undefined) {
  const status = value || "not started";
  return status.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isGatewayPaused(cap: AdminAiCap | undefined) {
  return Number(cap?.monthly_request_limit ?? 20) <= 0;
}

function getUsageWindowStats(rows: AdminAiUsage[]) {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  let callsLastHour = 0;
  let callsLast24h = 0;
  let latencyTotal = 0;
  let latencyCount = 0;
  let latest: AdminAiUsage | null = null;
  let latestTime = 0;

  for (const row of rows) {
    const createdAt = new Date(row.created_at).getTime();
    if (Number.isFinite(createdAt)) {
      if (createdAt >= oneHourAgo) callsLastHour += 1;
      if (createdAt >= oneDayAgo) callsLast24h += 1;
      if (createdAt > latestTime) {
        latestTime = createdAt;
        latest = row;
      }
    }

    const latency = Number(row.latency_ms ?? 0);
    if (Number.isFinite(latency) && latency > 0) {
      latencyTotal += latency;
      latencyCount += 1;
    }
  }

  return {
    callsLastHour,
    callsLast24h,
    latest,
    averageLatencyMs: latencyCount ? latencyTotal / latencyCount : 0
  };
}

export function AiGatewayAdminDashboard({ adminEmail = "" }: { adminEmail?: string }) {
  const [email, setEmail] = useState(adminEmail);
  const [data, setData] = useState<AdminAiUsageData>({ caps: [], usage: [], developerProfiles: [], developerAccounts: [], codeSubmissions: [] });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [actingEmail, setActingEmail] = useState("");
  const [lastRefreshedAt, setLastRefreshedAt] = useState("");
  const [selectedSubmission, setSelectedSubmission] = useState<AdminCodeSubmissionDetail | null>(null);
  const [loadingSubmissionId, setLoadingSubmissionId] = useState("");
  const [submissionMessage, setSubmissionMessage] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  async function loadUsage(options: { announce?: boolean } = {}) {
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch(`/api/admin/ai-usage?limit=250&_=${Date.now()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" }
      });
      const result = (await response.json().catch(() => null)) as (AdminAiUsageData & { error?: string }) | null;

      if (!response.ok || !result) {
        setMessage(result?.error || "Unable to load AI gateway usage. Sign out and sign back in as info@agent-tech.ai.");
        return;
      }

      setData({
        caps: result.caps ?? [],
        usage: result.usage ?? [],
        developerProfiles: result.developerProfiles ?? [],
        developerAccounts: result.developerAccounts ?? [],
        codeSubmissions: result.codeSubmissions ?? []
      });
      setLastRefreshedAt(new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" }));
      if (options.announce) {
        setMessage("AI gateway usage refreshed.");
      }
    } catch {
      setMessage("Refresh failed. Check the admin session and network, then try again.");
    } finally {
      setLoading(false);
    }
  }

  async function controlGatewayAccess(userId: string, action: "pause" | "resume") {
    setActingEmail(userId);
    setMessage("");

    const response = await fetch("/api/admin/ai-usage/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, action })
    });
    const result = await response.json().catch(() => null) as { error?: string } | null;

    if (!response.ok) {
      setMessage(result?.error || `Unable to ${action} AI gateway access.`);
      setActingEmail("");
      return;
    }

    setMessage(action === "pause" ? `${userId} is paused. AI gateway calls are blocked.` : `${userId} is resumed. AI gateway calls are allowed.`);
    await loadUsage();
    setActingEmail("");
  }

  async function loadSubmissionCode(submissionId: string) {
    setLoadingSubmissionId(submissionId);
    setSubmissionMessage("");

    try {
      const response = await fetch(`/api/admin/code-submissions?id=${encodeURIComponent(submissionId)}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" }
      });
      const result = await response.json().catch(() => null) as { submission?: AdminCodeSubmissionDetail; error?: string } | null;

      if (!response.ok || !result?.submission) {
        setSubmissionMessage(result?.error || "Unable to load the selected code submission.");
        return;
      }

      setSelectedSubmission(result.submission);
    } catch {
      setSubmissionMessage("Unable to load the selected code submission.");
    } finally {
      setLoadingSubmissionId("");
    }
  }

  async function signOut() {
    setSigningOut(true);
    setMessage("");

    try {
      await signOutAccountSession();
      window.location.href = "/login?next=/admin/ai-gateway";
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to sign out.");
      setSigningOut(false);
    }
  }

  useEffect(() => {
    if (adminEmail) {
      setEmail(adminEmail);
      return;
    }

    const session = getAccountSession();
    setEmail(session?.email ?? "");
  }, [adminEmail]);

  useEffect(() => {
    if (!email || !isAgentechGatewayOwnerEmail(email)) {
      setLoading(false);
      return;
    }

    void loadUsage();
  }, [email]);

  const summary = useMemo(() => {
    const totalRequests = data.caps.reduce((total, cap) => total + Number(cap.current_requests ?? 0), 0);
    const totalTokens = data.caps.reduce((total, cap) => total + Number(cap.current_tokens ?? 0), 0);
    const totalCost = getCurrentMonthUsageCost(data.usage);
    const activeGatewayUsers = data.caps.filter((cap) => Number(cap.current_requests ?? 0) > 0).length;
    const pausedGatewayUsers = data.caps.filter((cap) => isGatewayPaused(cap)).length;
    const internalDeveloperProfiles = data.developerProfiles.filter((profile) => isAgentechCompanyEmail(profile.account_email)).length;
    const internalCodeSubmissions = data.codeSubmissions.filter((submission) => isAgentechCompanyEmail(submission.email)).length;

    return { totalRequests, totalTokens, totalCost, activeGatewayUsers, pausedGatewayUsers, internalDeveloperProfiles, internalCodeSubmissions };
  }, [data.caps, data.codeSubmissions, data.developerProfiles, data.usage]);

  const capByEmail = useMemo(() => new Map(data.caps.map((cap) => [cap.user_id, cap])), [data.caps]);
  const accountByEmail = useMemo(() => new Map(data.developerAccounts.map((account) => [account.email, account])), [data.developerAccounts]);
  const usageByEmail = useMemo(() => {
    const map = new Map<string, AdminAiUsage[]>();
    for (const row of data.usage) {
      const rows = map.get(row.user_id) ?? [];
      rows.push(row);
      map.set(row.user_id, rows);
    }
    return map;
  }, [data.usage]);
  const gatewayHistory = useMemo(() => getUsageWindowStats(data.usage), [data.usage]);
  const sortedDeveloperProfiles = useMemo(() => {
    return [...data.developerProfiles].sort((left, right) => {
      const leftCap = capByEmail.get(left.account_email);
      const rightCap = capByEmail.get(right.account_email);
      const leftHistory = getUsageWindowStats(usageByEmail.get(left.account_email) ?? []);
      const rightHistory = getUsageWindowStats(usageByEmail.get(right.account_email) ?? []);
      const leftScore =
        Number(leftCap?.current_cost ?? 0) * 1_000_000 +
        Number(leftCap?.current_tokens ?? 0) +
        Number(leftCap?.current_requests ?? 0) * 10_000 +
        leftHistory.callsLastHour * 100_000;
      const rightScore =
        Number(rightCap?.current_cost ?? 0) * 1_000_000 +
        Number(rightCap?.current_tokens ?? 0) +
        Number(rightCap?.current_requests ?? 0) * 10_000 +
        rightHistory.callsLastHour * 100_000;

      if (rightScore !== leftScore) return rightScore - leftScore;
      return (left.display_name || left.username).localeCompare(right.display_name || right.username);
    });
  }, [capByEmail, data.developerProfiles, usageByEmail]);

  if (!email) {
    return (
      <div className="rounded-[24px] border border-slate-200 bg-white p-8 shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
        <h1 className="text-3xl font-bold text-slate-950">Admin Sign In Required</h1>
        <p className="mt-3 text-slate-600">Sign in as info@agent-tech.ai to monitor AI gateway usage.</p>
        <Link href="/login?next=/admin/ai-gateway" className="mt-6 inline-flex rounded-full bg-slate-950 px-6 py-3 text-sm font-bold text-white">
          Sign In
        </Link>
      </div>
    );
  }

  if (!isAgentechGatewayOwnerEmail(email)) {
    return (
      <div className="rounded-[24px] border border-red-200 bg-red-50 p-8">
        <h1 className="text-3xl font-bold text-red-950">Admin Access Required</h1>
        <p className="mt-3 text-red-800">This console is only for info@agent-tech.ai.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[18px] border border-slate-200 bg-[#f8fbff] shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
      <div className="relative overflow-hidden border-b border-slate-200 bg-white px-5 pb-6 pt-5 sm:px-7 md:px-8 md:pt-7">
        <div className="absolute inset-x-0 top-0 h-2 bg-red-600" />
        <div className="relative space-y-5">
          <div className="min-w-0">
            <p className="inline-flex rounded-full bg-red-600 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-white shadow-[0_10px_24px_rgba(220,38,38,0.25)]">
              Owner Admin Privilege Active
            </p>
            <h1 className="mt-4 text-[38px] font-black leading-none text-slate-950 sm:text-6xl">AI Gateway Command Center</h1>
            <p className="mt-3 max-w-3xl text-base font-bold leading-7 text-slate-700">
              You are signed in as the gateway owner. Monitor every developer, inspect OpenAI-reported token usage, and stop AI access immediately if an account abuses the system.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-white">Admin Mode Active</span>
              <span className="rounded-full bg-red-500 px-3 py-1 text-xs font-black uppercase tracking-[0.12em] text-white">Pause Controls Enabled</span>
              <span className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-700">{email}</span>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-300 bg-white px-4 py-3 shadow-[0_12px_28px_rgba(15,23,42,0.08)] md:flex md:items-center md:justify-between md:gap-5">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-950">Admin Actions</p>
              <p className="mt-1 text-sm font-black leading-5 text-slate-800">
                Refresh live usage or leave the owner console.
              </p>
              <p className="mt-1 text-xs font-bold text-slate-600">
                Last refresh: {lastRefreshedAt || "not loaded yet"}
              </p>
            </div>
            <div
              className={`mt-4 grid gap-3 sm:grid-cols-2 md:mt-0 ${
                isAgentechPrimaryOwnerEmail(email) ? "md:w-[650px] md:grid-cols-3" : "md:w-[430px]"
              }`}
            >
              <button
                type="button"
                onClick={() => void loadUsage({ announce: true })}
                disabled={loading}
                className="h-12 w-full rounded-xl border-2 border-slate-950 bg-white px-5 text-[15px] font-black text-slate-950 shadow-[0_8px_18px_rgba(15,23,42,0.08)] transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Refreshing..." : "Refresh Usage"}
              </button>
              {isAgentechPrimaryOwnerEmail(email) ? (
                <Link
                  href="/admin/master-robot"
                  className="flex h-12 w-full items-center justify-center rounded-xl border-2 border-slate-950 bg-slate-950 px-5 text-center text-[15px] font-black text-white shadow-[0_8px_18px_rgba(15,23,42,0.15)] transition hover:bg-slate-800"
                >
                  Master Reference
                </Link>
              ) : null}
              <button
                type="button"
                onClick={() => void signOut()}
                disabled={signingOut}
                className="h-12 w-full rounded-xl border-2 border-red-800 bg-red-600 px-5 text-[15px] font-black text-white shadow-[0_8px_18px_rgba(220,38,38,0.22)] transition hover:bg-red-700"
              >
                {signingOut ? "Signing Out..." : "Sign Out"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6 p-5 sm:p-7 md:p-8">
        <section className="rounded-[18px] border border-red-200 bg-white shadow-[0_16px_45px_rgba(185,28,28,0.10)]">
          <div className="flex flex-col gap-4 border-b border-red-100 px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-red-600">Admin Control Layer</p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">You can pause or restore AI gateway access per account.</h2>
            </div>
            <div className="rounded-full bg-red-50 px-4 py-2 text-sm font-black text-red-700">
              {summary.pausedGatewayUsers.toLocaleString()} accounts paused
            </div>
          </div>
          <p className="px-5 py-4 text-sm font-semibold leading-6 text-slate-600">
            Pause sets the account AI monthly request limit to zero. The gateway rejects that user before OpenAI is called, so no model tokens are spent while paused.
          </p>
        </section>

        <section className="rounded-[18px] border border-[#2f70c8]/25 bg-[#eff6ff] px-5 py-4 shadow-[0_10px_30px_rgba(47,112,200,0.08)]">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#245da7]">Company Software Check Policy</p>
              <h2 className="mt-1 text-xl font-black text-slate-950">{AGENTECH_COMPANY_EMAIL_SUFFIX} accounts are internal company accounts.</h2>
              <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-slate-700">
                A passed Physical Hardware Check unlocks Software Check. Charge company credits when they are available, but an insufficient company balance must never block internal testing. External accounts still require enough credits.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2 md:max-w-[260px] md:justify-end">
              <span className="rounded-full bg-[#2f70c8] px-3 py-1 text-xs font-black text-white">{summary.internalDeveloperProfiles} internal profiles</span>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-[#245da7]">{summary.internalCodeSubmissions} internal submissions</span>
            </div>
          </div>
        </section>

        {message ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">{message}</p>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[
            { label: "Developer Profiles", value: data.developerProfiles.length.toLocaleString(), helper: `${summary.internalDeveloperProfiles.toLocaleString()} internal company profiles` },
            { label: "Gateway Users", value: summary.activeGatewayUsers.toLocaleString(), helper: "Used AI this month" },
            { label: "Monthly Requests", value: summary.totalRequests.toLocaleString(), helper: "Across all users" },
            { label: "Recent Velocity", value: `${gatewayHistory.callsLastHour.toLocaleString()} / ${gatewayHistory.callsLast24h.toLocaleString()}`, helper: "Calls in 1h / 24h" },
            { label: "Paused", value: summary.pausedGatewayUsers.toLocaleString(), helper: "Blocked accounts" },
            { label: "Run Cost", value: formatGatewayCost(summary.totalCost), helper: "1 credit = $0.01" }
          ].map((card) => (
            <div key={card.label} className={`rounded-2xl border p-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)] ${
              card.label === "Paused" ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"
            }`}>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{card.label}</p>
              <p className="mt-3 text-3xl font-black text-slate-950">{card.value}</p>
              <p className="mt-2 text-sm text-slate-500">{card.helper}</p>
            </div>
          ))}
        </div>

        <section className="rounded-[18px] border border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#2f70c8]">Developer Profiles</p>
              <h2 className="mt-1 text-xl font-bold text-slate-950">AI Usage By Developer Account</h2>
            </div>
            <p className="rounded-full bg-[#eff6ff] px-3 py-1 text-xs font-bold text-[#245da7]">
              {formatTokenCount(summary.totalTokens)} tokens this month
            </p>
          </div>

          <div className="space-y-3 p-4 sm:p-5">
            {sortedDeveloperProfiles.length ? sortedDeveloperProfiles.map((profile) => {
              const cap = capByEmail.get(profile.account_email);
              const account = accountByEmail.get(profile.account_email);
              const requests = Number(cap?.current_requests ?? 0);
              const requestLimit = Number(cap?.monthly_request_limit ?? 20);
              const tokens = Number(cap?.current_tokens ?? 0);
              const cost = getCurrentMonthUsageCost(usageByEmail.get(profile.account_email) ?? []);
              const costLimit = Number(cap?.monthly_cost_limit ?? 5);
              const gateStatus = account?.developer_ai_security_status || "not started";
              const history = getUsageWindowStats(usageByEmail.get(profile.account_email) ?? []);
              const highRecentUse = history.callsLastHour >= 5;
              const paused = isGatewayPaused(cap);
              const isActing = actingEmail === profile.account_email;
              const internalCompanyAccount = isAgentechCompanyEmail(profile.account_email);
              const creditBalance = Number(account?.credit_balance ?? 0);

              return (
                <article
                  key={profile.id}
                  className={`rounded-2xl border p-4 transition ${
                    paused ? "border-red-200 bg-red-50 shadow-[0_12px_28px_rgba(220,38,38,0.08)]" : "border-slate-200 bg-white hover:border-[#2f70c8]/35"
                  }`}
                >
                  <div className="grid gap-4 xl:grid-cols-[minmax(210px,0.9fr)_minmax(420px,1.7fr)_minmax(190px,0.7fr)] xl:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-lg font-black text-slate-950">{profile.display_name || profile.username}</p>
                        {internalCompanyAccount ? (
                          <span className="inline-flex rounded-full bg-[#2f70c8] px-2 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-white">
                            Company / Internal
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">
                            External
                          </span>
                        )}
                        {paused ? (
                          <span className="inline-flex rounded-full bg-red-600 px-2 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-white">
                            AI Paused
                          </span>
                        ) : null}
                        {highRecentUse ? (
                          <span className="inline-flex rounded-full bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-700">
                            High recent use
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 font-mono text-xs text-slate-500">@{profile.username}</p>
                      <p className="mt-2 break-all text-sm font-semibold text-slate-700">{profile.account_email}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                          gateStatus === "passed"
                            ? "bg-emerald-50 text-emerald-700"
                            : gateStatus === "failed" || gateStatus === "error"
                              ? "bg-red-50 text-red-700"
                              : "bg-slate-100 text-slate-600"
                        }`}>
                          Software: {formatStatus(gateStatus)}
                        </span>
                        <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                          Updated: {cap?.updated_at ? formatDateTime(cap.updated_at) : "No AI usage yet"}
                        </span>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                      {[
                        { label: "Requests", value: `${requests.toLocaleString()} / ${requestLimit.toLocaleString()}`, helper: "monthly calls" },
                        { label: "Tokens", value: formatTokenCount(tokens), helper: "OpenAI-reported input + output" },
                        { label: "Cost", value: formatGatewayCost(cost), helper: `limit ${formatGatewayCost(costLimit)}; Software Check $0.50/run` },
                        {
                          label: "Software Credits",
                          value: Math.max(0, Math.floor(creditBalance)).toLocaleString(),
                          helper: internalCompanyAccount ? "charge if available; never blocks" : "required for Software Check"
                        },
                        {
                          label: "History",
                          value: history.latest ? formatDateTime(history.latest.created_at) : "Never used",
                          helper: `${history.callsLastHour.toLocaleString()} in 1h / ${history.callsLast24h.toLocaleString()} in 24h / avg ${formatDurationMs(history.averageLatencyMs)}`
                        }
                      ].map((metric) => (
                        <div key={metric.label} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                          <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">{metric.label}</p>
                          <p className="font-technical mt-2 break-words text-base font-black text-slate-950">{metric.value}</p>
                          <p className="font-technical mt-1 break-words text-xs font-semibold text-slate-500">{metric.helper}</p>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        disabled={isActing}
                        onClick={() => void controlGatewayAccess(profile.account_email, paused ? "resume" : "pause")}
                        className={`w-full rounded-xl px-4 py-3 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-60 ${
                          paused
                            ? "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                            : "border border-red-700 bg-red-600 text-white shadow-[0_10px_24px_rgba(220,38,38,0.25)] hover:bg-red-700"
                        }`}
                      >
                        {isActing ? "Working..." : paused ? "Resume AI" : "Pause AI Now"}
                      </button>
                      <p className="text-xs font-semibold text-slate-500">
                        {paused ? "Restores monthly caps." : "Stops OpenAI calls immediately."}
                      </p>
                    </div>
                  </div>
                </article>
              );
            }) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm font-semibold text-slate-500">
                No developer profiles found yet.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-[18px] border border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#2f70c8]">Code Submissions</p>
              <h2 className="mt-1 text-xl font-bold text-slate-950">Uploaded Files And Review Gates</h2>
              <p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-slate-500">
                Supabase stores the uploaded filename, command list, review status, and code. This page lists recent submissions first; full code loads only when you open one row.
              </p>
            </div>
            <p className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
              <span className="font-technical">{data.codeSubmissions.length.toLocaleString()}</span> recent submissions
            </p>
          </div>

          {submissionMessage ? (
            <p className="mx-5 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">{submissionMessage}</p>
          ) : null}

          <div className="space-y-3 p-4 sm:p-5">
            {data.codeSubmissions.length ? data.codeSubmissions.slice(0, 40).map((submission) => {
              const commands = Array.isArray(submission.commands) ? submission.commands : [];
              const fileLabel = submission.uploaded_file_name || (submission.source === "pasted_code" ? "Pasted code" : "No filename");
              const isSelected = selectedSubmission?.id === submission.id;
              const loadingCode = loadingSubmissionId === submission.id;
              const internalCompanyAccount = isAgentechCompanyEmail(submission.email);

              return (
                <article
                  key={submission.id}
                  className={`rounded-2xl border p-4 transition ${
                    isSelected ? "border-[#2f70c8] bg-[#f8fbff]" : "border-slate-200 bg-white hover:border-[#2f70c8]/35"
                  }`}
                >
                  <div className="grid gap-4 xl:grid-cols-[minmax(240px,1fr)_minmax(360px,1.2fr)_170px] xl:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="break-all text-sm font-black text-slate-950">{submission.email}</p>
                        <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${
                          internalCompanyAccount ? "bg-[#2f70c8] text-white" : "bg-slate-100 text-slate-600"
                        }`}>
                          {internalCompanyAccount ? "Company / Internal" : "External"}
                        </span>
                      </div>
                      <p className="mt-2 min-w-0 break-words font-mono text-xs font-semibold text-slate-600 [overflow-wrap:anywhere]">{fileLabel}</p>
                      <p className="mt-2 text-xs font-semibold text-slate-500">{formatDateTime(submission.created_at)}</p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                        <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Physical</p>
                        <p className="mt-2 text-sm font-black text-slate-950">{formatStatus(submission.physical_safety_status)}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                        <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Software</p>
                        <p className="mt-2 text-sm font-black text-slate-950">{formatStatus(submission.ai_security_status)}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                        <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Commands</p>
                        <p className="font-technical mt-2 text-sm font-black text-slate-950">{commands.length.toLocaleString()}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                        <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">Credits Charged</p>
                        <p className="font-technical mt-2 text-sm font-black text-slate-950">{formatCreditsWithUsd(submission.credits_charged)}</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => void loadSubmissionCode(submission.id)}
                      disabled={loadingCode}
                      className="w-full rounded-xl border border-slate-950 bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loadingCode ? "Loading..." : isSelected ? "Refresh Code" : "View Code"}
                    </button>
                  </div>

                  {commands.length ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {commands.slice(0, 6).map((command, index) => (
                        <span key={`${submission.id}-${command}-${index}`} className="max-w-full break-words rounded-full bg-slate-100 px-3 py-1 font-mono text-[11px] font-semibold text-slate-600 [overflow-wrap:anywhere]">
                          {command}
                        </span>
                      ))}
                      {commands.length > 6 ? (
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-500">
                          +{commands.length - 6} more
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            }) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-sm font-semibold text-slate-500">
                No code submissions found yet.
              </div>
            )}
          </div>

          {selectedSubmission ? (
            <div className="border-t border-slate-200 bg-slate-50 p-4 sm:p-5">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2f70c8]">Selected Submission</p>
                    <h3 className="mt-1 break-all text-lg font-black text-slate-950">{selectedSubmission.email}</h3>
                    <p className="mt-1 min-w-0 break-words font-mono text-xs font-semibold text-slate-500 [overflow-wrap:anywhere]">
                      {selectedSubmission.uploaded_file_name || (selectedSubmission.source === "pasted_code" ? "Pasted code" : selectedSubmission.id)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedSubmission(null)}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-black text-slate-700 transition hover:border-slate-950 hover:text-slate-950"
                  >
                    Close
                  </button>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                  {[
                    { label: "Account", value: isAgentechCompanyEmail(selectedSubmission.email) ? "Company / Internal" : "External" },
                    { label: "Physical", value: formatStatus(selectedSubmission.physical_safety_status) },
                    { label: "Software", value: formatStatus(selectedSubmission.ai_security_status) },
                    { label: "Credits Charged", value: formatCreditsWithUsd(selectedSubmission.credits_charged) },
                    { label: "Robot", value: selectedSubmission.robot_model || "Not set" },
                    { label: "Submitted", value: formatDateTime(selectedSubmission.created_at) }
                  ].map((item) => (
                    <div key={item.label} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                      <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">{item.label}</p>
                      <p className="mt-2 break-words text-sm font-black text-slate-950">{item.value}</p>
                    </div>
                  ))}
                </div>

                <pre className="mt-4 max-h-[520px] overflow-auto rounded-xl border border-slate-200 bg-slate-950 p-4 font-mono text-xs leading-6 text-slate-50">
                  {selectedSubmission.code || "# No code stored for this submission."}
                </pre>
              </div>
            </div>
          ) : null}
        </section>

        <section className="rounded-[18px] border border-slate-200 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
          <div className="border-b border-slate-200 px-5 py-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#2f70c8]">Recent Calls</p>
            <h2 className="mt-1 text-xl font-bold text-slate-950">AI Gateway Log</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {data.usage.length ? data.usage.slice(0, 20).map((row) => (
              <div key={row.id} className="grid gap-3 px-5 py-4 text-sm md:grid-cols-[minmax(220px,1fr)_140px_120px_120px_120px_150px] md:items-center">
                <div>
                  <p className="font-technical break-all font-bold text-slate-950">{row.user_id}</p>
                  <p className="font-technical mt-1 text-xs text-slate-500">{row.endpoint} - {row.model}</p>
                </div>
                <div>
                  <p className="font-technical font-semibold text-slate-700">{formatTokenCount(row.total_tokens)} tokens</p>
                  <p className="font-technical mt-1 text-xs font-semibold text-slate-500">
                    {formatTokenCount(row.prompt_tokens)} input + {formatTokenCount(row.completion_tokens)} output
                  </p>
                </div>
                <div>
                  <p className="font-technical font-semibold text-slate-700">{formatGatewayCost(getDisplayedUsageCost(row))}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">Standard run cost</p>
                </div>
                <p className="font-technical font-semibold text-slate-700">{formatDurationMs(row.latency_ms)}</p>
                <p className="font-technical font-semibold text-slate-700">HTTP {row.status_code ?? "n/a"}</p>
                <p className="font-technical text-slate-500">{formatDateTime(row.created_at)}</p>
              </div>
            )) : (
              <p className="px-5 py-8 text-center text-sm font-semibold text-slate-500">No AI gateway calls logged yet.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
