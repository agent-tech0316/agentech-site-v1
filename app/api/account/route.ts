import { getServerAccountEmail } from "@/lib/server-account-session";
import { type NextRequest, NextResponse } from "next/server";
import { getAccountSummary, getProfile, updateAccountRecord } from "@/lib/account-records";
import { isValidAccountIdentifier, normalizeEmail } from "@/lib/prototype-auth";

type AccountPatchPayload = {
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  address?: string;
  addressLine1?: string;
  addressLine2?: string;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function formatName(value: unknown) {
  return clean(value)
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

async function requireOwner(request: NextRequest, email: string) {
  const owner = await getServerAccountEmail(request, { requireSignedSession: true });
  if (!owner) return NextResponse.json({ error: "Sign in to access your account." }, { status: 401 });
  if (owner !== email) return NextResponse.json({ error: "This account belongs to another user." }, { status: 403 });
  return null;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const email = normalizeEmail(url.searchParams.get("email"));

  if (!isValidAccountIdentifier(email)) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }

  const denied = await requireOwner(request, email);
  if (denied) return denied;

  const summary = await getAccountSummary(email);
  return NextResponse.json({ ok: true, ...summary });
}

export async function POST(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as { email?: string } | null;
  const email = normalizeEmail(payload?.email);

  if (!isValidAccountIdentifier(email)) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }

  const denied = await requireOwner(request, email);
  if (denied) return denied;

  const profile = await getProfile(email);
  return NextResponse.json({ ok: true, profile });
}

export async function PATCH(request: NextRequest) {
  const payload = (await request.json().catch(() => null)) as AccountPatchPayload | null;
  const email = normalizeEmail(payload?.email);
  const firstName = formatName(payload?.firstName);
  const lastName = formatName(payload?.lastName);
  const phone = clean(payload?.phone);
  const addressLine1 = clean(payload?.addressLine1);
  const addressLine2 = clean(payload?.addressLine2);
  const address = [addressLine1, addressLine2].filter(Boolean).join("\n") || clean(payload?.address);

  if (!isValidAccountIdentifier(email)) {
    return NextResponse.json({ error: "A valid account email is required." }, { status: 400 });
  }

  const denied = await requireOwner(request, email);
  if (denied) return denied;

  if (!firstName || !lastName || !phone) {
    return NextResponse.json({ error: "First name, last name, and phone number are required." }, { status: 400 });
  }

  const account = await updateAccountRecord({
    email,
    firstName,
    lastName,
    phone,
    address: address || null
  });

  if (!account) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, account });
}
