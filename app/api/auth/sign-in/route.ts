import { NextResponse } from "next/server";
import { AccountIdentityConflictError, linkAccountIdentity } from "@/lib/account-identity";
import { findAccount, isValidEmail, normalizeEmail, verifyPassword } from "@/lib/prototype-auth";
import { setSignedAccountSessionCookie } from "@/lib/server-account-session";
import {
  authenticateSupabasePassword,
  createSupabaseAuthUser,
  findSupabaseAuthUserByEmail,
  SupabaseAuthUserExistsError
} from "@/lib/supabase-auth-admin";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as { email?: string; password?: string } | null;
  const email = normalizeEmail(payload?.email);
  const password = typeof payload?.password === "string" ? payload.password : "";

  if (!isValidEmail(email) || !password) {
    return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });
  }

  let step = "account lookup";
  try {
    const account = await findAccount(email);
    step = "Supabase password verification";
    const providerSession = await authenticateSupabasePassword(email, password);
    let identity = providerSession
      ? { userId: providerSession.userId, email: providerSession.email }
      : null;

    if (!identity) {
      const legacyPasswordValid = Boolean(account && verifyPassword(password, account));
      if (!legacyPasswordValid) {
        return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
      }

      step = "legacy identity migration";
      const existingProviderUser = await findSupabaseAuthUserByEmail(email);
      if (existingProviderUser) {
        return NextResponse.json({
          error: "This account already uses Supabase authentication. Use Forgot Password to recover it without replacing its existing password."
        }, { status: 409 });
      }

      try {
        identity = await createSupabaseAuthUser(email, password);
      } catch (error) {
        if (error instanceof SupabaseAuthUserExistsError) {
          return NextResponse.json({
            error: "This account already uses Supabase authentication. Use Forgot Password to recover it."
          }, { status: 409 });
        }
        throw error;
      }
    }

    step = "stable identity linking";
    const linkedIdentity = await linkAccountIdentity(identity);

    step = "session creation";
    const response = NextResponse.json({
      ok: true,
      email: linkedIdentity.email,
      userId: linkedIdentity.userId,
      authProvider: "supabase"
    });
    setSignedAccountSessionCookie(response, linkedIdentity);
    return response;
  } catch (error) {
    if (error instanceof AccountIdentityConflictError) {
      return NextResponse.json({ error: "This account is linked to a different authentication identity." }, { status: 409 });
    }
    console.error("[auth/sign-in] Sign-in could not be completed.", {
      step,
      errorType: error instanceof Error ? error.name : "UnknownError"
    });
    return NextResponse.json({
      error: "Sign-in is temporarily unavailable. Please try again shortly."
    }, { status: 503 });
  }
}
