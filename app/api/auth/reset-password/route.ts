import { NextResponse } from "next/server";
import { AccountIdentityConflictError, isStableUserId, linkAccountIdentity } from "@/lib/account-identity";
import {
  clearVerificationCode,
  findAccount,
  isValidEmail,
  isValidPassword,
  normalizeEmail,
  verifyCode
} from "@/lib/prototype-auth";
import { setSignedAccountSessionCookie } from "@/lib/server-account-session";
import {
  createSupabaseAuthUser,
  findSupabaseAuthUserByEmail,
  SupabaseAuthUserExistsError,
  updateSupabaseAuthPassword
} from "@/lib/supabase-auth-admin";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as {
    email?: string;
    code?: string;
    password?: string;
  } | null;
  const email = normalizeEmail(payload?.email);
  const code = typeof payload?.code === "string" ? payload.code.trim() : "";
  const password = typeof payload?.password === "string" ? payload.password : "";

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (!code) {
    return NextResponse.json({ error: "Enter your verification code." }, { status: 400 });
  }
  if (!isValidPassword(password)) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const existing = await findAccount(email);
  if (!existing) {
    return NextResponse.json({ error: "No Agentech account exists for that email." }, { status: 404 });
  }
  const codeValid = await verifyCode(email, code);
  if (!codeValid) {
    return NextResponse.json({ error: "Verification code is incorrect or expired." }, { status: 400 });
  }

  let step = "Supabase identity lookup";
  try {
    let identity = await findSupabaseAuthUserByEmail(email);
    if (isStableUserId(existing.auth_user_id)
      && (!identity || identity.userId !== existing.auth_user_id)) {
      throw new AccountIdentityConflictError();
    }

    if (!identity) {
      step = "Supabase user migration";
      try {
        identity = await createSupabaseAuthUser(email, password);
      } catch (error) {
        if (error instanceof SupabaseAuthUserExistsError && error.user) identity = error.user;
        else throw error;
      }
    }

    step = "Supabase password reset";
    identity = await updateSupabaseAuthPassword(identity.userId, password);

    step = "stable identity linking";
    const linkedIdentity = await linkAccountIdentity(identity);
    await clearVerificationCode(email);

    const response = NextResponse.json({
      ok: true,
      email: linkedIdentity.email,
      userId: linkedIdentity.userId
    });
    setSignedAccountSessionCookie(response, linkedIdentity);
    return response;
  } catch (error) {
    if (error instanceof AccountIdentityConflictError) {
      return NextResponse.json({ error: "This account is linked to a different authentication identity." }, { status: 409 });
    }
    console.error("[auth/reset-password] Password reset could not be completed.", {
      step,
      errorType: error instanceof Error ? error.name : "UnknownError"
    });
    return NextResponse.json({ error: "Password reset is temporarily unavailable. Please try again." }, { status: 503 });
  }
}
