import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { accountSessionCookieName } from "@/lib/account-session";
import {
  normalizeAccountIdentity,
  type AccountIdentity
} from "@/lib/account-identity";
import { isValidEmail, normalizeEmail } from "@/lib/prototype-auth";
import { verifySupabaseAccessToken } from "@/lib/supabase-auth-admin";

export type { AccountIdentity } from "@/lib/account-identity";

export const signedAccountSessionCookieName = "agentech_account_session";

const sessionVersion = 2;
const sessionMaxAgeSeconds = 60 * 60 * 24 * 30;

function getSessionSecret() {
  const secret = process.env.AGENTECH_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("Server session signing is not configured. Set AGENTECH_SESSION_SECRET.");
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

export function createSignedAccountSession(identity: AccountIdentity, maxAgeSeconds = sessionMaxAgeSeconds) {
  const normalized = normalizeAccountIdentity(identity);
  if (!normalized) throw new Error("Cannot create a session without a stable Supabase user id and valid email.");

  const expiresAt = Date.now() + maxAgeSeconds * 1000;
  const payload = base64UrlEncode(JSON.stringify({
    version: sessionVersion,
    userId: normalized.userId,
    email: normalized.email,
    expiresAt
  }));
  return `${payload}.${signPayload(payload)}`;
}

export function verifySignedAccountSession(value: unknown): AccountIdentity | null {
  if (typeof value !== "string" || !value.includes(".")) return null;

  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;

  const expected = signPayload(payload);
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) return null;

  try {
    const parsed = JSON.parse(base64UrlDecode(payload)) as {
      version?: unknown;
      userId?: unknown;
      email?: unknown;
      expiresAt?: unknown;
    };
    const identity = normalizeAccountIdentity(parsed);
    if (parsed.version !== sessionVersion || !identity
      || typeof parsed.expiresAt !== "number" || Date.now() > parsed.expiresAt) return null;
    return identity;
  } catch {
    return null;
  }
}

export function setSignedAccountSessionCookie(response: NextResponse, identity: AccountIdentity) {
  response.cookies.set({
    name: signedAccountSessionCookieName,
    value: createSignedAccountSession(identity),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionMaxAgeSeconds
  });
}

export function clearSignedAccountSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: signedAccountSessionCookieName,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
}

async function getSignedCookieIdentity() {
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

export async function getServerAccountIdentity(
  request?: Pick<Request, "headers">,
  _options: { allowLegacyCookie?: false } = {}
) {
  const signedIdentity = await getSignedCookieIdentity();
  if (signedIdentity) return signedIdentity;

  const authorization = request?.headers.get("authorization") ?? "";
  if (authorization.toLowerCase().startsWith("bearer ")) {
    const token = authorization.slice(7).trim();
    return verifySignedAccountSession(token) || await verifySupabaseAccessToken(token);
  }

  return null;
}

export async function getServerAccountEmail(
  request?: Pick<Request, "headers">,
  options: { allowLegacyCookie?: boolean } = {}
) {
  const identity = await getServerAccountIdentity(request, { allowLegacyCookie: false });
  if (identity) return identity.email;

  const allowLegacyCookie = options.allowLegacyCookie ?? process.env.NODE_ENV !== "production";
  if (allowLegacyCookie) {
    const legacyEmail = await getLegacyCookieEmail();
    return isValidEmail(legacyEmail) ? legacyEmail : "";
  }

  return "";
}
