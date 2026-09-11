import { isValidEmail, normalizeEmail } from "@/lib/prototype-auth";
import { supabaseRequest } from "@/lib/supabase-server";

export type AccountIdentity = {
  userId: string;
  email: string;
};

export class AccountIdentityConflictError extends Error {
  constructor() {
    super("The account is already linked to a different authentication identity.");
    this.name = "AccountIdentityConflictError";
  }
}
export function isStableUserId(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function normalizeAccountIdentity(value: { userId?: unknown; email?: unknown } | null | undefined) {
  const email = normalizeEmail(value?.email);
  if (!isStableUserId(value?.userId) || !isValidEmail(email)) return null;
  return { userId: value.userId, email } satisfies AccountIdentity;
}

export async function linkAccountIdentity(identity: AccountIdentity) {
  const normalized = normalizeAccountIdentity(identity);
  if (!normalized) throw new Error("A stable Supabase identity is required.");

  try {
    const result = await supabaseRequest<{ user_id?: string; email?: string }>("rpc/agentech_link_auth_identity", {
      method: "POST",
      body: {
        p_email: normalized.email,
        p_auth_user_id: normalized.userId
      }
    });
    const linked = normalizeAccountIdentity({ userId: result?.user_id, email: result?.email });
    if (!linked || linked.userId !== normalized.userId || linked.email !== normalized.email) {
      throw new Error("Account identity linking returned an invalid result.");
    }
    return linked;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    if (/identity_conflict/i.test(message)) throw new AccountIdentityConflictError();
    throw error;
  }
}
