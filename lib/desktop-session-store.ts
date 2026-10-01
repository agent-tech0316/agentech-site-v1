import { supabaseRequest } from '@/lib/supabase-server';
export type DesktopAccount = {email: string; expiresAt: string};
export async function createSession(tokenHash: string, email: string, expiresAt: string) {
  await supabaseRequest('rpc/desktop_session_create', {method:'POST',body:{p_hash:tokenHash,p_email:email,p_expires:expiresAt}});
}
export async function findActiveSession(tokenHash: string): Promise<DesktopAccount | null> {
  const rows = await supabaseRequest<{email:string;expires_at:string}[]>('rpc/desktop_session_find',{method:'POST',body:{p_hash:tokenHash}});
  const row=rows?.[0];
  return row ? {email:row.email,expiresAt:row.expires_at} : null;
}
export async function revokeSession(tokenHash: string) {
  await supabaseRequest('rpc/desktop_session_revoke',{method:'POST',body:{p_hash:tokenHash}});
}
export async function consumeLoginAttempt(bucketHash: string, limit: 5 | 30 = 5) {
  const rows=await supabaseRequest<{allowed:boolean;retry_after:number}[]>('rpc/desktop_login_attempt',{method:'POST',body:{p_hash:bucketHash,p_limit:limit}});
  if (!rows?.[0]) throw new Error('Login limit unavailable');
  return {allowed:rows[0].allowed,retryAfter:rows[0].retry_after};
}
