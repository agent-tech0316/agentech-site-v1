import { NextResponse } from "next/server";
import { updateAccountRecord } from "@/lib/account-records";
import { AccountIdentityConflictError, linkAccountIdentity } from "@/lib/account-identity";
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
  authenticateSupabasePassword,
  createSupabaseAuthUser,
  SupabaseAuthUserExistsError
} from "@/lib/supabase-auth-admin";

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as {
    email?: string;
    code?: string;
    password?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    addressLine1?: string;
    addressLine2?: string;
  } | null;
  const email = normalizeEmail(payload?.email);
  const code = typeof payload?.code === "string" ? payload.code.trim() : "";
  const password = typeof payload?.password === "string" ? payload.password : "";
  const firstName = cleanName(payload?.firstName);
  const lastName = cleanName(payload?.lastName);
  const phone = clean(payload?.phone);
  const addressLine1 = clean(payload?.addressLine1);
  const addressLine2 = clean(payload?.addressLine2);
  const address = [addressLine1, addressLine2].filter(Boolean).join("\n");

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (!code) {
    return NextResponse.json({ error: "Enter your verification code." }, { status: 400 });
  }
  if (!isValidPassword(password)) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }
  if (!firstName || !lastName || !phone) {
    return NextResponse.json({ error: "First name, last name, and phone number are required." }, { status: 400 });
  }

  const existing = await findAccount(email);
  if (existing) {
    return NextResponse.json({ error: "This email already has an account. Please sign in." }, { status: 409 });
  }

  const codeValid = await verifyCode(email, code);
  if (!codeValid) {
    return NextResponse.json({ error: "Verification code is incorrect or expired." }, { status: 400 });
  }

  let step = "Supabase user creation";
  try {
    const existingProviderSession = await authenticateSupabasePassword(email, password);
    let identity = existingProviderSession
      ? { userId: existingProviderSession.userId, email: existingProviderSession.email }
      : null;

    if (!identity) {
      try {
        identity = await createSupabaseAuthUser(email, password);
      } catch (error) {
        if (error instanceof SupabaseAuthUserExistsError) {
          return NextResponse.json({
            error: "A Supabase account already exists for this email. Sign in or use Forgot Password instead."
          }, { status: 409 });
        }
        throw error;
      }
    }

    step = "stable identity linking";
    const linkedIdentity = await linkAccountIdentity(identity);

    step = "profile upsert";
    const account = await updateAccountRecord({
      identity: linkedIdentity,
      firstName,
      lastName,
      phone,
      address: address || null
    });
    if (!account) throw new Error("Linked account record was not found.");

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
    console.error("[auth/create-account] Account creation could not be completed.", {
      step,
      errorType: error instanceof Error ? error.name : "UnknownError"
    });
    return NextResponse.json({ error: "Account creation is temporarily unavailable. Please try again." }, { status: 503 });
  }
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanName(value: unknown) {
  return clean(value)
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}
