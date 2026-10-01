import { NextResponse } from 'next/server';
import { isValidAccountIdentifier, isTestAccountUsername, normalizeEmail } from '@/lib/prototype-auth';
import { setSignedAccountSessionCookie } from '@/lib/server-account-session';
import { verifyAccountCredentials } from '@/lib/verify-account-credentials';

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const email = normalizeEmail(payload?.email);
  const password = typeof payload?.password === 'string' ? payload.password : '';
  if (!isValidAccountIdentifier(email) || !password) return NextResponse.json({error: 'Enter your email and password.'}, {status: 400});
  try {
    const account = await verifyAccountCredentials(email, password);
    if (!account) return NextResponse.json({error: isTestAccountUsername(email) ? 'Username or password is incorrect.' : 'Email or password is incorrect.'}, {status: 401});
    const response = NextResponse.json({ok: true, ...account});
    setSignedAccountSessionCookie(response, account.email);
    return response;
  } catch {
    console.error('[auth/sign-in] Sign-in could not be completed.');
    return NextResponse.json({error: 'Sign-in is temporarily unavailable. Please try again shortly.'}, {status: 503});
  }
}
