"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { accountSessionEvent, getAccountSession, setAccountSession, signOutAccountSession } from "@/lib/account-session";
import { resolveAuthReturnPath } from "@/lib/auth-return-path";

type AuthMode = "signin" | "signup" | "forgot";
type SignupStep = "email" | "verify";
type ResetStep = "email" | "verify";

type ApiResult = {
  ok?: boolean;
  email?: string;
  userId?: string;
  error?: string;
  devCode?: string;
  message?: string;
};

export function UniversalAuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const explicitNext = resolveAuthReturnPath(searchParams.get("next"), "");
  const [mode, setMode] = useState<AuthMode>("signup");
  const [signupStep, setSignupStep] = useState<SignupStep>("email");
  const [resetStep, setResetStep] = useState<ResetStep>("email");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [devCode, setDevCode] = useState("");
  const [signedInEmail, setSignedInEmail] = useState("");

  function getNewAccountDestination() {
    if (!explicitNext) {
      return "/account";
    }

    const target = new URL(explicitNext, window.location.origin);
    if (target.pathname === "/enroll") {
      const courseCode = target.searchParams.get("course");
      const params = new URLSearchParams();
      if (courseCode) {
        params.set("course", courseCode);
      }
      params.set("campus", "walnut");
      return `/account-setup?${params.toString()}`;
    }

    return explicitNext;
  }

  useEffect(() => {
    function refreshSession() {
      const session = getAccountSession();
      setSignedInEmail(session?.email ?? "");
      if (session?.email) {
        setEmail(session.email);
      }
    }

    refreshSession();
    window.addEventListener(accountSessionEvent, refreshSession);
    window.addEventListener("storage", refreshSession);

    return () => {
      window.removeEventListener(accountSessionEvent, refreshSession);
      window.removeEventListener("storage", refreshSession);
    };
  }, []);

  function getPostAuthDestination(isNewAccount: boolean) {
    if (explicitNext && !isNewAccount) {
      return explicitNext;
    }

    if (isNewAccount) {
      return getNewAccountDestination();
    }

    return "/account";
  }

  async function rememberAndContinue(accountEmail: string, userId: string, isNewAccount: boolean) {
    setAccountSession(accountEmail, userId);
    router.push(getPostAuthDestination(isNewAccount));
  }

  async function signOut() {
    setStatus("loading");
    setMessage("");

    try {
      await signOutAccountSession();
      setSignedInEmail("");
      setPassword("");
      setStatus("idle");
      router.replace("/login?signedOut=1");
      router.refresh();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to sign out.");
    }
  }

  async function sendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setMessage("");
    setDevCode("");

    const response = await fetch("/api/auth/send-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    const result = (await response.json()) as ApiResult;

    if (!response.ok) {
      setStatus("error");
      setMessage(result.error || "Unable to send code.");
      return;
    }

    setStatus("success");
    setSignupStep("verify");
    setMessage(result.message || "Verification code sent.");
    setDevCode(result.devCode || "");
  }

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setMessage("");

    const response = await fetch("/api/auth/create-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code, password, firstName, lastName, phone, addressLine1, addressLine2 })
    });
    const result = (await response.json()) as ApiResult;

    if (!response.ok || !result.email || !result.userId) {
      setStatus("error");
      setMessage(result.error || "Unable to create account.");
      return;
    }

    setStatus("success");
    await rememberAndContinue(result.email, result.userId, true);
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "loading") return;
    setStatus("loading");
    setMessage("");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        signal: controller.signal
      });
      const result = await response.json().catch(() => null) as ApiResult | null;
      if (controller.signal.aborted) throw new Error("Sign-in timed out.");

      if (!response.ok || typeof result?.email !== "string" || !result.email || typeof result.userId !== "string" || !result.userId) {
        setStatus("error");
        setMessage(typeof result?.error === "string" ? result.error : "Sign-in is temporarily unavailable. Please try again shortly.");
        return;
      }

      setStatus("success");
      await rememberAndContinue(result.email, result.userId, false);
    } catch {
      setStatus("error");
      setMessage(controller.signal.aborted
        ? "Sign-in timed out. Please try again."
        : "Unable to complete sign-in. Check your connection and try again.");
    } finally {
      clearTimeout(timeout);
    }
  }

  async function sendPasswordResetCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setMessage("");
    setDevCode("");

    const response = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    const result = (await response.json()) as ApiResult;

    if (!response.ok) {
      setStatus("error");
      setMessage(result.error || "Unable to send password reset code.");
      return;
    }

    setStatus("success");
    setResetStep("verify");
    setMessage(result.message || "Password reset code sent.");
    setDevCode(result.devCode || "");
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setMessage("");

    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code, password })
    });
    const result = (await response.json()) as ApiResult;

    if (!response.ok || !result.email || !result.userId) {
      setStatus("error");
      setMessage(result.error || "Unable to reset password.");
      return;
    }

    setStatus("success");
    setMessage("Password reset. Signing you in...");
    await rememberAndContinue(result.email, result.userId, false);
  }

  return (
    <div data-login-card className="rounded-[28px] border border-[#cbd5e1] bg-white p-7 shadow-xl shadow-slate-300/70 md:p-9">
      <div data-login-card-header className="mb-8">
        <p data-login-card-eyebrow className="text-xs font-semibold uppercase tracking-[0.18em] text-[#334155]">Universal Account</p>
        <h2 data-login-card-title className="mt-3 text-3xl font-semibold tracking-tight text-[#0b1220]">Agentech sign in</h2>
        <p data-login-card-copy className="mt-3 text-sm leading-6 text-[#334155]">
          Access profile tools, EAIC HUB, robot live viewing, billing, and learning programs through one verified Agentech identity.
        </p>
      </div>

      {signedInEmail ? (
        <div data-login-success className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
          <p className="font-semibold">Signed in as {signedInEmail}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => router.push(getPostAuthDestination(false))}
              data-login-primary
              className="rounded-full bg-[#0b1220] px-5 py-2.5 text-white"
            >
              Continue
            </button>
            <button data-login-secondary-outline type="button" onClick={() => void signOut()} disabled={status === "loading"} className="rounded-full border border-emerald-300 px-5 py-2.5 font-semibold text-emerald-950">
              {status === "loading" ? "Signing Out..." : "Sign Out"}
            </button>
          </div>
        </div>
      ) : null}

      {!signedInEmail ? <div data-login-mode-switch className="mb-6 grid grid-cols-2 rounded-2xl bg-[#f1f5f9] p-1">
        {(["signup", "signin"] as const).map((option) => (
          <button
            key={option}
            type="button"
            data-login-mode-option
            data-active={mode === option ? "true" : "false"}
            disabled={mode === "signin" && status === "loading"}
            onClick={() => {
              setMode(option);
              setStatus("idle");
              setMessage("");
              setDevCode("");
              setCode("");
              setPassword("");
            }}
            className={`rounded-xl px-4 py-3 text-sm font-semibold transition ${
              mode === option ? "bg-white text-[#0b1220] shadow-sm" : "text-[#475569]"
            }`}
          >
            {option === "signup" ? "Create Account" : "Sign In"}
          </button>
        ))}
      </div> : null}

      {!signedInEmail && mode === "signup" && signupStep === "email" ? (
        <form onSubmit={sendCode} className="space-y-5">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#1f2937]">Email</span>
            <input
              data-login-input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-xl border border-[#cbd5e1] bg-white px-4 py-3 text-sm text-[#0b1220] outline-none focus:border-[#0b1220] focus:ring-4 focus:ring-[#dbe4ef]"
              required
            />
          </label>
          <button data-login-primary type="submit" className="w-full rounded-full bg-[#0b1220] px-5 py-3 text-sm font-semibold text-white">
            {status === "loading" ? "Sending..." : "Send Verification Code"}
          </button>
        </form>
      ) : null}

      {!signedInEmail && mode === "signup" && signupStep === "verify" ? (
        <form onSubmit={createAccount} className="space-y-5">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#1f2937]">Verification Code</span>
            <input
              data-login-input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              inputMode="numeric"
              className="mt-2 w-full rounded-xl border border-[#cbd5e1] bg-white px-4 py-3 text-sm text-[#0b1220] outline-none focus:border-[#0b1220] focus:ring-4 focus:ring-[#dbe4ef]"
              required
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#1f2937]">First Name</span>
              <input
                data-login-input
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                className="mt-2 w-full rounded-xl border border-[#cbd5e1] bg-white px-4 py-3 text-sm text-[#0b1220] outline-none focus:border-[#0b1220] focus:ring-4 focus:ring-[#dbe4ef]"
                required
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#1f2937]">Last Name</span>
              <input
                data-login-input
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                className="mt-2 w-full rounded-xl border border-[#cbd5e1] bg-white px-4 py-3 text-sm text-[#0b1220] outline-none focus:border-[#0b1220] focus:ring-4 focus:ring-[#dbe4ef]"
                required
              />
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#1f2937]">Phone Number</span>
            <input
              data-login-input
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="mt-2 w-full rounded-xl border border-[#cbd5e1] bg-white px-4 py-3 text-sm text-[#0b1220] outline-none focus:border-[#0b1220] focus:ring-4 focus:ring-[#dbe4ef]"
              required
            />
          </label>
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#1f2937]">Billing Address</p>
            <input
              data-login-input
              value={addressLine1}
              onChange={(event) => setAddressLine1(event.target.value)}
              placeholder="Street address, suite, or unit"
              className="w-full rounded-xl border border-[#cbd5e1] bg-white px-4 py-3 text-sm text-[#0b1220] outline-none focus:border-[#0b1220] focus:ring-4 focus:ring-[#dbe4ef]"
            />
            <input
              data-login-input
              value={addressLine2}
              onChange={(event) => setAddressLine2(event.target.value)}
              placeholder="City, state, ZIP, country"
              className="w-full rounded-xl border border-[#cbd5e1] bg-white px-4 py-3 text-sm text-[#0b1220] outline-none focus:border-[#0b1220] focus:ring-4 focus:ring-[#dbe4ef]"
            />
            <p className="text-xs font-semibold text-[#64748b]">Optional. Used for billing and invoice contact details.</p>
          </div>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#1f2937]">Create Password</span>
            <input
              data-login-input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-xl border border-[#cbd5e1] bg-white px-4 py-3 text-sm text-[#0b1220] outline-none focus:border-[#0b1220] focus:ring-4 focus:ring-[#dbe4ef]"
              minLength={8}
              required
            />
          </label>
          <button data-login-primary type="submit" className="w-full rounded-full bg-[#0b1220] px-5 py-3 text-sm font-semibold text-white">
            {status === "loading" ? "Creating..." : "Create Account"}
          </button>
          <button data-login-secondary-action type="button" onClick={() => setSignupStep("email")} className="w-full text-sm font-semibold text-[#475569]">
            Use a different email
          </button>
        </form>
      ) : null}

      {!signedInEmail && mode === "signin" ? (
        <form onSubmit={signIn} className="space-y-5">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#1f2937]">Email</span>
            <input
              data-login-input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-xl border border-[#cbd5e1] bg-white px-4 py-3 text-sm text-[#0b1220] outline-none focus:border-[#0b1220] focus:ring-4 focus:ring-[#dbe4ef]"
              required
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#1f2937]">Password</span>
            <input
              data-login-input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-xl border border-[#cbd5e1] bg-white px-4 py-3 text-sm text-[#0b1220] outline-none focus:border-[#0b1220] focus:ring-4 focus:ring-[#dbe4ef]"
              required
            />
          </label>
          <button data-login-primary type="submit" disabled={status === "loading"} className="w-full rounded-full bg-[#0b1220] px-5 py-3 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-70">
            {status === "loading" ? "Signing in..." : "Sign In"}
          </button>
          <button
            type="button"
            data-login-secondary-action
            disabled={status === "loading"}
            onClick={() => {
              setMode("forgot");
              setResetStep("email");
              setStatus("idle");
              setMessage("");
              setDevCode("");
              setCode("");
              setPassword("");
            }}
            className="w-full text-sm font-semibold text-[#475569]"
          >
            Forgot password?
          </button>
        </form>
      ) : null}

      {!signedInEmail && mode === "forgot" && resetStep === "email" ? (
        <form onSubmit={sendPasswordResetCode} className="space-y-5">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#1f2937]">Account Email</span>
            <input
              data-login-input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-xl border border-[#cbd5e1] bg-white px-4 py-3 text-sm text-[#0b1220] outline-none focus:border-[#0b1220] focus:ring-4 focus:ring-[#dbe4ef]"
              required
            />
          </label>
          <button data-login-primary type="submit" className="w-full rounded-full bg-[#0b1220] px-5 py-3 text-sm font-semibold text-white">
            {status === "loading" ? "Sending..." : "Send Reset Code"}
          </button>
          <button
            type="button"
            data-login-secondary-action
            onClick={() => {
              setMode("signin");
              setStatus("idle");
              setMessage("");
              setDevCode("");
            }}
            className="w-full text-sm font-semibold text-[#475569]"
          >
            Back to sign in
          </button>
        </form>
      ) : null}

      {!signedInEmail && mode === "forgot" && resetStep === "verify" ? (
        <form onSubmit={resetPassword} className="space-y-5">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#1f2937]">Verification Code</span>
            <input
              data-login-input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              inputMode="numeric"
              className="mt-2 w-full rounded-xl border border-[#cbd5e1] bg-white px-4 py-3 text-sm text-[#0b1220] outline-none focus:border-[#0b1220] focus:ring-4 focus:ring-[#dbe4ef]"
              required
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[#1f2937]">New Password</span>
            <input
              data-login-input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-xl border border-[#cbd5e1] bg-white px-4 py-3 text-sm text-[#0b1220] outline-none focus:border-[#0b1220] focus:ring-4 focus:ring-[#dbe4ef]"
              minLength={8}
              required
            />
          </label>
          <button data-login-primary type="submit" className="w-full rounded-full bg-[#0b1220] px-5 py-3 text-sm font-semibold text-white">
            {status === "loading" ? "Saving..." : "Create New Password"}
          </button>
          <button
            type="button"
            data-login-secondary-action
            onClick={() => {
              setResetStep("email");
              setStatus("idle");
              setMessage("");
              setDevCode("");
              setCode("");
              setPassword("");
            }}
            className="w-full text-sm font-semibold text-[#475569]"
          >
            Use a different email
          </button>
        </form>
      ) : null}

      {message ? (
        <p role={status === "error" ? "alert" : "status"} className={`mt-5 text-sm ${status === "error" ? "text-red-600" : "text-emerald-700"}`}>{message}</p>
      ) : null}
      {devCode ? (
        <div data-login-dev-code className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Temporary testing code: <span className="font-semibold">{devCode}</span>
        </div>
      ) : null}
    </div>
  );
}
