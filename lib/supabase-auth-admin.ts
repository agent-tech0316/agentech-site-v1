import { isValidEmail, normalizeEmail } from "@/lib/prototype-auth";

const defaultPublishableKey = "sb_publishable_3PtM-SBX5-B86fvpjBaFmw_pNVwqUQe";
const authRequestTimeoutMs = 10_000;
const authUsersPerPage = 1_000;
const maxAuthUserPages = 1_000;

export type SupabaseAuthIdentity = {
  userId: string;
  email: string;
};

export type SupabasePasswordSession = SupabaseAuthIdentity & {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

type AuthUserPayload = {
  id?: unknown;
  email?: unknown;
};

type PasswordPayload = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  user?: AuthUserPayload;
};

export class SupabaseAuthUserExistsError extends Error {
  readonly user: SupabaseAuthIdentity | null;

  constructor(user: SupabaseAuthIdentity | null) {
    super("A Supabase Auth user already exists for this email.");
    this.name = "SupabaseAuthUserExistsError";
    this.user = user;
  }
}

function normalizedRootUrl() {
  return process.env.SUPABASE_URL?.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "") ?? "";
}

function publicConfig() {
  const url = normalizedRootUrl();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.SUPABASE_ANON_KEY
    || defaultPublishableKey;
  if (!url || !publishableKey) throw new Error("Supabase Auth configuration is missing.");
  return { url, publishableKey };
}

function adminConfig() {
  const { url, publishableKey } = publicConfig();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) throw new Error("Supabase Auth admin configuration is missing.");
  return { url, publishableKey, serviceRoleKey };
}

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseIdentity(payload: AuthUserPayload | null | undefined): SupabaseAuthIdentity | null {
  const email = normalizeEmail(payload?.email);
  if (!isUuid(payload?.id) || !isValidEmail(email)) return null;
  return { userId: payload.id, email };
}

function adminHeaders(serviceRoleKey: string) {
  return {
    "Content-Type": "application/json",
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`
  };
}

export async function authenticateSupabasePassword(email: string, password: string) {
  const { url, publishableKey } = publicConfig();
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: publishableKey },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
    signal: AbortSignal.timeout(authRequestTimeoutMs)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null) as { error_code?: string } | null;
    if (response.status === 400 && error?.error_code === "invalid_credentials") return null;
    throw new Error(`Supabase password verification failed (HTTP ${response.status}).`);
  }

  const payload = await response.json() as PasswordPayload;
  const identity = parseIdentity(payload.user);
  if (!identity || identity.email !== normalizeEmail(email)
    || typeof payload.access_token !== "string"
    || typeof payload.refresh_token !== "string") {
    throw new Error("Supabase password verification returned an invalid identity.");
  }

  return {
    ...identity,
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresIn: typeof payload.expires_in === "number" ? payload.expires_in : 0
  } satisfies SupabasePasswordSession;
}

export async function findSupabaseAuthUserByEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);
  const { url, serviceRoleKey } = adminConfig();
  const headers = adminHeaders(serviceRoleKey);

  for (let page = 1; page <= maxAuthUserPages; page += 1) {
    const response = await fetch(`${url}/auth/v1/admin/users?page=${page}&per_page=${authUsersPerPage}`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(authRequestTimeoutMs)
    });
    if (!response.ok) throw new Error("Unable to inspect Supabase Auth identity metadata.");

    const payload = await response.json() as { users?: AuthUserPayload[] };
    const users = Array.isArray(payload.users) ? payload.users : [];
    for (const candidate of users) {
      const identity = parseIdentity(candidate);
      if (identity?.email === normalizedEmail) return identity;
    }
    if (users.length < authUsersPerPage) return null;
  }

  throw new Error("Supabase Auth identity lookup exceeded the safe pagination limit.");
}

export async function createSupabaseAuthUser(email: string, password: string) {
  const { url, serviceRoleKey } = adminConfig();
  const normalizedEmail = normalizeEmail(email);
  const response = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: adminHeaders(serviceRoleKey),
    body: JSON.stringify({ email: normalizedEmail, password, email_confirm: true }),
    cache: "no-store",
    signal: AbortSignal.timeout(authRequestTimeoutMs)
  });

  if (!response.ok) {
    if (response.status === 409 || response.status === 422) {
      throw new SupabaseAuthUserExistsError(await findSupabaseAuthUserByEmail(normalizedEmail));
    }
    throw new Error(`Unable to create the Supabase Auth user (HTTP ${response.status}).`);
  }

  const identity = parseIdentity(await response.json() as AuthUserPayload);
  if (!identity || identity.email !== normalizedEmail) {
    throw new Error("Supabase Auth user creation returned an invalid identity.");
  }
  return identity;
}

export async function updateSupabaseAuthPassword(userId: string, password: string) {
  if (!isUuid(userId)) throw new Error("Cannot update a password without a stable Supabase user id.");
  const { url, serviceRoleKey } = adminConfig();
  const response = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "PUT",
    headers: adminHeaders(serviceRoleKey),
    body: JSON.stringify({ password }),
    cache: "no-store",
    signal: AbortSignal.timeout(authRequestTimeoutMs)
  });
  if (!response.ok) throw new Error(`Unable to update the Supabase Auth password (HTTP ${response.status}).`);
  const identity = parseIdentity(await response.json() as AuthUserPayload);
  if (!identity || identity.userId !== userId) {
    throw new Error("Supabase Auth password update returned an invalid identity.");
  }
  return identity;
}

export async function verifySupabaseAccessToken(token: string) {
  const { url, publishableKey } = publicConfig();
  const response = await fetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${token}`
    },
    cache: "no-store",
    signal: AbortSignal.timeout(authRequestTimeoutMs)
  }).catch(() => null);
  if (!response?.ok) return null;
  return parseIdentity(await response.json().catch(() => null) as AuthUserPayload | null);
}
