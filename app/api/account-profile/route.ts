import { NextResponse } from "next/server";
import {
  createAccessProfile,
  getAccessProfileById,
  getAccessProfileByUsername,
  getAccountRecord,
  isAccessProfileType,
  isValidProfileUsername,
  normalizeProfileUsername,
  updateAccessProfile
} from "@/lib/account-records";
import { getServerAccountIdentity } from "@/lib/server-account-session";

type ProfilePayload = {
  id?: number | string;
  email?: string;
  profileType?: string;
  username?: string;
  displayName?: string;
  monthlyCreditLimit?: number | string;
  firstName?: string;
  lastName?: string;
  dob?: string;
  grade?: string;
  sex?: string;
  schoolInfo?: string;
  preferredLocation?: string;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toProfileId(value: unknown) {
  const id = typeof value === "number" ? value : Number(clean(value));
  return Number.isInteger(id) && id > 0 ? id : null;
}

function toCreditAmount(value: unknown) {
  const amount = typeof value === "number" ? value : Number(clean(value));
  if (!Number.isFinite(amount)) {
    return 0;
  }

  return Math.max(0, Math.floor(amount));
}

function formatProfileLabel(profileType: string) {
  return profileType.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatName(value: unknown) {
  return clean(value)
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

export async function POST(request: Request) {
  const identity = await getServerAccountIdentity(request, { allowLegacyCookie: false });
  if (!identity) return NextResponse.json({ error: "Sign in to create a profile." }, { status: 401 });
  const payload = (await request.json().catch(() => null)) as ProfilePayload | null;
  const email = identity.email;
  const profileType = clean(payload?.profileType).toLowerCase();
  const username = normalizeProfileUsername(payload?.username);
  const displayName = clean(payload?.displayName);
  const monthlyCreditLimit = toCreditAmount(payload?.monthlyCreditLimit);
  const firstName = formatName(payload?.firstName);
  const lastName = formatName(payload?.lastName);
  const dob = clean(payload?.dob);
  const grade = clean(payload?.grade);
  const sex = clean(payload?.sex);
  const schoolInfo = clean(payload?.schoolInfo);
  const preferredLocation = clean(payload?.preferredLocation);

  if (!isAccessProfileType(profileType)) {
    return NextResponse.json({ error: "Choose developer, student, teacher, or talent." }, { status: 400 });
  }

  if (!isValidProfileUsername(username)) {
    return NextResponse.json({ error: "Choose a username with 3-32 lowercase letters, numbers, dots, dashes, or underscores." }, { status: 400 });
  }

  if (profileType === "student" && (!firstName || !lastName || !dob || !grade || !sex)) {
    return NextResponse.json({ error: "Student profiles require first name, last name, date of birth, grade, and sex." }, { status: 400 });
  }

  const account = await getAccountRecord(email);
  if (!account) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  const usernameMatch = await getAccessProfileByUsername(username);
  if (usernameMatch) {
    return NextResponse.json({ error: "That profile username is already taken." }, { status: 409 });
  }

  const profile = await createAccessProfile({
    accountEmail: email,
    ownerUserId: identity.userId,
    profileType,
    username,
    displayName: displayName || [firstName, lastName].filter(Boolean).join(" ") || `${formatProfileLabel(profileType)} Profile`,
    monthlyCreditLimit,
    firstName: profileType === "student" ? firstName : null,
    lastName: profileType === "student" ? lastName : null,
    dob: profileType === "student" ? dob : null,
    grade: profileType === "student" ? grade : null,
    sex: profileType === "student" ? sex : null,
    schoolInfo: profileType === "student" ? schoolInfo : null,
    preferredLocation: profileType === "student" ? preferredLocation : null
  });

  return NextResponse.json({ ok: true, profile });
}
export async function PATCH(request: Request) {
  const identity = await getServerAccountIdentity(request, { allowLegacyCookie: false });
  if (!identity) return NextResponse.json({ error: "Sign in to update a profile." }, { status: 401 });
  const payload = (await request.json().catch(() => null)) as ProfilePayload | null;
  const id = toProfileId(payload?.id);
  const email = identity.email;
  const profileType = clean(payload?.profileType).toLowerCase();
  const username = normalizeProfileUsername(payload?.username);
  const displayName = clean(payload?.displayName);
  const monthlyCreditLimit = toCreditAmount(payload?.monthlyCreditLimit);
  const firstName = formatName(payload?.firstName);
  const lastName = formatName(payload?.lastName);
  const dob = clean(payload?.dob);
  const grade = clean(payload?.grade);
  const sex = clean(payload?.sex);
  const schoolInfo = clean(payload?.schoolInfo);
  const preferredLocation = clean(payload?.preferredLocation);

  if (!id) {
    return NextResponse.json({ error: "Choose a profile to update." }, { status: 400 });
  }

  if (!isAccessProfileType(profileType)) {
    return NextResponse.json({ error: "Choose developer, student, teacher, or talent." }, { status: 400 });
  }

  if (!isValidProfileUsername(username)) {
    return NextResponse.json({ error: "Choose a username with 3-32 lowercase letters, numbers, dots, dashes, or underscores." }, { status: 400 });
  }

  if (profileType === "student" && (!firstName || !lastName || !dob || !grade || !sex)) {
    return NextResponse.json({ error: "Student profiles require first name, last name, date of birth, grade, and sex." }, { status: 400 });
  }

  const account = await getAccountRecord(email);
  if (!account) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  const existingProfile = await getAccessProfileById(id);
  if (!existingProfile || existingProfile.account_email !== email || existingProfile.owner_user_id !== identity.userId) {
    return NextResponse.json({ error: "Profile not found for this account." }, { status: 404 });
  }

  const usernameMatch = await getAccessProfileByUsername(username);
  if (usernameMatch && usernameMatch.id !== id) {
    return NextResponse.json({ error: "That profile username is already taken." }, { status: 409 });
  }

  const profile = await updateAccessProfile({
    id,
    accountEmail: email,
    ownerUserId: identity.userId,
    profileType,
    username,
    displayName: displayName || [firstName, lastName].filter(Boolean).join(" ") || `${formatProfileLabel(profileType)} Profile`,
    monthlyCreditLimit,
    firstName: profileType === "student" ? firstName : null,
    lastName: profileType === "student" ? lastName : null,
    dob: profileType === "student" ? dob : null,
    grade: profileType === "student" ? grade : null,
    sex: profileType === "student" ? sex : null,
    schoolInfo: profileType === "student" ? schoolInfo : null,
    preferredLocation: profileType === "student" ? preferredLocation : null
  });

  return NextResponse.json({ ok: true, profile });
}
