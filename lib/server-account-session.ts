import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { accountSessionCookieName } from "@/lib/account-session";
import { isValidAccountIdentifier, isValidEmail, normalizeEmail } from "@/lib/prototype-auth";

export const signedAccountSessionCookieName = "agentech_account_session";

const sessionMaxAgeSeconds = 60 * 60 * 24 * 30;

function getSessionSecret() {
  const secret = process.env.AGENTECH_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("Server session signing is not configured. Set AGENTECH_SESSION_SECRET.");
  }
  return secret;
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(payload: string) {
  return createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
}

export function createSignedAccountSession(email: string, maxAgeSeconds = sessionMaxAgeSeconds) {
  const normalizedEmail = normalizeEmail(email);
  if (!isValidAccountIdentifier(normalizedEmail)) {
    throw new Error("Cannot create a signed session for an invalid email.");
  }

  const expiresAt = Date.now() + maxAgeSeconds * 1000;
  const payload = base64UrlEncode(JSON.stringify({ email: normalizedEmail, expiresAt }));
  return `${payload}.${signPayload(payload)}`;
}

export function verifySignedAccountSession(value: unknown) {
  if (typeof value !== "string" || !value.includes(".")) {
    return "";
  }

  const [payload, signature] = value.split(".");
  if (!payload || !signature) {
    return "";
  }

  const expected = signPayload(payload);
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) {
    return "";
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(payload)) as { email?: unknown; expiresAt?: unknown };
    const email = normalizeEmail(parsed.email);
    if (!isValidAccountIdentifier(email) || typeof parsed.expiresAt !== "number" || Date.now() > parsed.expiresAt) {
      return "";
    }
    return email;
  } catch {
    return "";
  }
}

export function setSignedAccountSessionCookie(response: NextResponse, email: string) {
  response.cookies.set({
    name: signedAccountSessionCookieName,
    value: createSignedAccountSession(email),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionMaxAgeSeconds
  });
}

async function getSupabaseJwtEmail(token: string) {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey) {
    return "";
  }

  const normalizedUrl = url.replace(/\/$/, "").replace(/\/rest\/v1$/, "");
  const response = await fetch(`${normalizedUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`
    },
    cache: "no-store"
  }).catch(() => null);

  if (!response?.ok) {
    return "";
  }

  const payload = await response.json().catch(() => null) as { email?: unknown } | null;
  const email = normalizeEmail(payload?.email);
  return isValidEmail(email) ? email : "";
}

async function getSignedCookieEmail() {
  const cookieStore = await cookies();
  return verifySignedAccountSession(cookieStore.get(signedAccountSessionCookieName)?.value);
}

async function getLegacyCookieEmail() {
  const cookieStore = await cookies();
  const value = cookieStore.get(accountSessionCookieName)?.value ?? "";
  try {
    return normalizeEmail(decodeURIComponent(value));
  } catch {
    return normalizeEmail(value);
  }
}

export async function getServerAccountEmail(
  request?: NextRequest,
  options: { allowLegacyCookie?: boolean } = {}
) {
  const signedEmail = await getSignedCookieEmail();
  if (signedEmail) {
    return signedEmail;
  }

  const authorization = request?.headers.get("authorization") ?? "";
  if (authorization.toLowerCase().startsWith("bearer ")) {
    const token = authorization.slice(7).trim();
    return verifySignedAccountSession(token) || await getSupabaseJwtEmail(token);
  }

  if (options.allowLegacyCookie || process.env.NODE_ENV !== "production") {
    return getLegacyCookieEmail();
  }

  return "";
}
