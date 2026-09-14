import { NextResponse } from "next/server";
import { createAccount, createPasswordHash, findAccount, isValidAccountIdentifier, isTestAccountUsername, normalizeEmail, verifyPassword } from "@/lib/prototype-auth";
import { setSignedAccountSessionCookie } from "@/lib/server-account-session";
import { ensureSupabaseAuthUser, verifySupabasePassword } from "@/lib/supabase-auth-admin";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as { email?: string; password?: string } | null;
  const email = normalizeEmail(payload?.email);
  const password = typeof payload?.password === "string" ? payload.password : "";

  if (!isValidAccountIdentifier(email) || !password) {
    return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });
  }

  let step = "account lookup";
  try {
    const account = await findAccount(email);
    if (isTestAccountUsername(email)) {
      if (!account || !verifyPassword(password, account)) {
        return NextResponse.json({ error: "Username or password is incorrect." }, { status: 401 });
      }
      const response = NextResponse.json({ ok: true, email, authProvider: "account" });
      setSignedAccountSessionCookie(response, email);
      return response;
    }
    step = "password verification";
    const supabasePasswordValid = await verifySupabasePassword(email, password);
    const legacyPasswordValid = Boolean(account && verifyPassword(password, account));
    if (!supabasePasswordValid && !legacyPasswordValid) {
      return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
    }

    if (!supabasePasswordValid && legacyPasswordValid) {
      step = "account synchronization";
      await ensureSupabaseAuthUser(email, password);
    }

    if (!account) {
      step = "account creation";
      const { passwordHash, salt } = createPasswordHash(password);
      const now = new Date().toISOString();
      await createAccount({
        email,
        password_hash: passwordHash,
        salt,
        first_name: "",
        last_name: "",
        phone: "",
        credit_balance: 0,
        paid_credit_balance: 0,
        bonus_credit_balance: 0,
        created_at: now,
        verified_at: now
      });
    }

    step = "session creation";
    const response = NextResponse.json({ ok: true, email, authProvider: "supabase" });
    setSignedAccountSessionCookie(response, email);
    return response;
  } catch (error) {
    // Record the failing stage, never credentials or raw upstream response bodies.
    console.error("[auth/sign-in] Sign-in could not be completed.", {
      step,
      errorType: error instanceof Error ? error.name : "UnknownError"
    });
    return NextResponse.json({
      error: "Sign-in is temporarily unavailable. Please try again shortly."
    }, { status: 503 });
  }
}
