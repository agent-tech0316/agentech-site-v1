import { scryptSync, timingSafeEqual } from "crypto";
import { isAgentechCompanyEmail } from "@/lib/company-accounts";
import { supabaseRequest } from "@/lib/supabase-server";

export type StoredAccount = {
  email: string;
  auth_user_id?: string | null;
  password_hash: string | null;
  salt: string | null;
  first_name: string;
  last_name: string;
  phone: string;
  credit_balance?: number;
  paid_credit_balance?: number;
  bonus_credit_balance?: number;
  created_at: string;
  verified_at: string;
};

export type VerificationCode = {
  email: string;
  code: string;
  expires_at: string;
  created_at: string;
};

export function normalizeEmail(email: unknown) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isInternalAccountEmail(email: unknown) {
  return isAgentechCompanyEmail(typeof email === "string" ? email : "");
}

export function isValidPassword(password: unknown) {
  return typeof password === "string" && password.length >= 8;
}

export async function readAccounts() {
  return supabaseRequest<StoredAccount[]>("agentech_accounts", {
    query: "select=email,auth_user_id,password_hash,salt,first_name,last_name,phone,credit_balance,paid_credit_balance,bonus_credit_balance,created_at,verified_at"
  });
}
export async function createAccount(account: StoredAccount) {
  await supabaseRequest<StoredAccount[]>("agentech_accounts", {
    method: "POST",
    body: account
  });
}

export async function findAccount(email: string) {
  const accounts = await supabaseRequest<StoredAccount[]>("agentech_accounts", {
    query: `email=eq.${encodeURIComponent(email)}&select=email,auth_user_id,password_hash,salt,first_name,last_name,phone,credit_balance,paid_credit_balance,bonus_credit_balance,created_at,verified_at&limit=1`
  });
  return accounts[0] ?? null;
}

export function verifyPassword(password: string, account: StoredAccount) {
  if (!account.password_hash || !account.salt) return false;
  const candidate = scryptSync(password, account.salt, 64);
  const stored = Buffer.from(account.password_hash, "hex");

  return stored.length === candidate.length && timingSafeEqual(stored, candidate);
}

export async function createVerificationCode(email: string) {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const now = new Date();

  await supabaseRequest<VerificationCode[]>("agentech_verification_codes", {
    method: "POST",
    query: "on_conflict=email",
    prefer: "resolution=merge-duplicates,return=representation",
    body: {
      email,
      code,
      created_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 10 * 60 * 1000).toISOString()
    }
  });
  return code;
}

export async function verifyCode(email: string, code: string) {
  const codes = await supabaseRequest<VerificationCode[]>("agentech_verification_codes", {
    query: `email=eq.${encodeURIComponent(email)}&select=email,code,expires_at,created_at&limit=1`
  });
  const match = codes[0];

  if (!match) {
    return false;
  }

  if (Date.now() > new Date(match.expires_at).getTime()) {
    return false;
  }

  return match.code === code.trim();
}

export async function clearVerificationCode(email: string) {
  await supabaseRequest<null>("agentech_verification_codes", {
    method: "DELETE",
    query: `email=eq.${encodeURIComponent(email)}`,
    prefer: "return=minimal"
  });
}
