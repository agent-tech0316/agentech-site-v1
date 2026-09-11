import { NextResponse } from "next/server";
import { getAccountSummary, getProfileForIdentity, updateAccountRecord } from "@/lib/account-records";
import { getServerAccountIdentity } from "@/lib/server-account-session";

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

export async function GET(request: Request) {
  const identity = await getServerAccountIdentity(request, { allowLegacyCookie: false });
  if (!identity) return NextResponse.json({ error: "Sign in to view this account." }, { status: 401 });

  const summary = await getAccountSummary(identity.email);
  return NextResponse.json({ ok: true, ...summary });
}

export async function POST(request: Request) {
  const identity = await getServerAccountIdentity(request, { allowLegacyCookie: false });
  if (!identity) return NextResponse.json({ error: "Sign in to view this account." }, { status: 401 });

  const profile = await getProfileForIdentity(identity);
  return NextResponse.json({ ok: true, profile });
}

export async function PATCH(request: Request) {
  const identity = await getServerAccountIdentity(request, { allowLegacyCookie: false });
  if (!identity) return NextResponse.json({ error: "Sign in to update this account." }, { status: 401 });
  const payload = (await request.json().catch(() => null)) as AccountPatchPayload | null;
  const firstName = formatName(payload?.firstName);
  const lastName = formatName(payload?.lastName);
  const phone = clean(payload?.phone);
  const addressLine1 = clean(payload?.addressLine1);
  const addressLine2 = clean(payload?.addressLine2);
  const address = [addressLine1, addressLine2].filter(Boolean).join("\n") || clean(payload?.address);

  if (!firstName || !lastName || !phone) {
    return NextResponse.json({ error: "First name, last name, and phone number are required." }, { status: 400 });
  }

  const account = await updateAccountRecord({
    identity,
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
