import { NextRequest, NextResponse } from 'next/server';
import { getServerAccountEmail } from '@/lib/server-account-session';
import { supabaseRequest } from '@/lib/supabase-server';
import { getMasterRecording, recordingDownloadPath } from '@/lib/master-session-recordings';
import type { MasterRecording, RecordingSession } from '@/lib/master-session-recordings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization' };

/** No customer mutation endpoints: only the operator controls retention. */
export async function GET(request: NextRequest) {
  try {
    const email = await getServerAccountEmail(request, { requireSignedSession: true });
    if (!email) return NextResponse.json({ error: 'Sign in to access your recording.' }, { status: 401, headers });
    const input = request.nextUrl.searchParams.get('sessionId') ?? '';
    if (!/^[1-9]\d*$/.test(input) || !Number.isSafeInteger(Number(input))) {
      return NextResponse.json({ error: 'A valid sessionId is required.' }, { status: 400, headers });
    }
    const row = await getMasterRecording(email, Number(input), {
      session: async id => (await supabaseRequest<RecordingSession[]>('agentech_robot_sessions', {
        query: new URLSearchParams({ id: `eq.${id}`, select: 'id,email,robot_model,access_profile_id', limit: '1' }).toString()
      }))[0] ?? null,
      recording: async id => (await supabaseRequest<MasterRecording[]>('agentech_master_session_recordings', {
        query: new URLSearchParams({ session_id: `eq.${id}`, select: 'session_id,recording_id,account_email,profile_id,profile_username,capture_status,storage_status,manifest', limit: '1' }).toString()
      }))[0] ?? null
    });
    if (!row) return NextResponse.json({ error: 'Recording unavailable.' }, { status: 404, headers });
    const download = request.nextUrl.searchParams.get('download');
    if (download === 'manifest.json') {
      return NextResponse.json(row.manifest, { headers: { ...headers, 'Content-Disposition': `attachment; filename="master-session-${row.session_id}-manifest.json"` } });
    }
    if (download) {
      let path: string;
      try { path = recordingDownloadPath(row, download); }
      catch { return NextResponse.json({ error: 'Recording file unavailable.' }, { status: 404, headers }); }
      const base = process.env.SUPABASE_URL?.replace(/\/$/, '').replace(/\/rest\/v1$/, '');
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!base || !key) throw new Error('Recording storage is not configured');
      const response = await fetch(`${base}/storage/v1/object/sign/master-session-recordings/${path}`, {
        method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresIn: 60 }), cache: 'no-store', redirect: 'error'
      });
      if (!response.ok) throw new Error('Recording storage signing failed');
      const result = await response.json() as { signedURL?: string };
      if (!result.signedURL?.startsWith('/object/sign/master-session-recordings/')) throw new Error('Invalid signed storage path');
      return NextResponse.json({ url: `${base}/storage/v1${result.signedURL}`, expiresIn: 60 }, { headers });
    }
    return NextResponse.json({ sessionId: row.session_id, recordingId: row.recording_id,
      profileId: row.profile_id, username: row.profile_username, captureStatus: row.capture_status,
      storageStatus: row.storage_status, manifest: row.manifest }, { headers });
  } catch {
    // Avoid exposing database diagnostics, account details or signed URLs in errors.
    return NextResponse.json({ error: 'Recording temporarily unavailable.' }, { status: 503, headers });
  }
}
