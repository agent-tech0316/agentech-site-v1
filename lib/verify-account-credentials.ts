import { createAccount, createPasswordHash, findAccount, isValidAccountIdentifier, isTestAccountUsername, normalizeEmail, verifyPassword } from '@/lib/prototype-auth';
import { ensureSupabaseAuthUser, verifySupabasePassword } from '@/lib/supabase-auth-admin';

/** Shared by browser and desktop. Upstream errors must never become password failures. */
export async function verifyAccountCredentials(identifier: string, password: string): Promise<{email: string; authProvider: 'account' | 'supabase'} | null> {
  const email = normalizeEmail(identifier);
  if (!isValidAccountIdentifier(email) || typeof password !== 'string' || !password) return null;
  const account = await findAccount(email);
  if (isTestAccountUsername(email)) return account && verifyPassword(password, account) ? {email, authProvider: 'account'} : null;
  const supabaseValid = await verifySupabasePassword(email, password);
  const legacyValid = Boolean(account && verifyPassword(password, account));
  if (!supabaseValid && !legacyValid) return null;
  if (!supabaseValid && legacyValid) await ensureSupabaseAuthUser(email, password);
  if (!account) {
    const {passwordHash, salt} = createPasswordHash(password);
    const now = new Date().toISOString();
    await createAccount({email, password_hash: passwordHash, salt, first_name: '', last_name: '', phone: '', credit_balance: 0, paid_credit_balance: 0, bonus_credit_balance: 0, created_at: now, verified_at: now});
  }
  return {email, authProvider: 'supabase'};
}
