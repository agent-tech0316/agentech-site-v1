/** Customer access is read-only and uses the existing signed account session. */
export type RecordingSession = {
  id: number; email: string; robot_model: string; access_profile_id: number;
};
export type RecordingFile = { path: string; bytes: number; sha256: string };
export type MasterRecording = {
  session_id: number; recording_id: string; account_email: string;
  profile_id: number; profile_username: string; capture_status: string; storage_status: string;
  manifest: {
    session?: { session_id: number; recording_id: string; profile_id: number };
    files?: RecordingFile[];
    [key: string]: unknown;
  };
};
type Dependencies = {
  session: (id: number) => Promise<RecordingSession | null>;
  recording: (id: number) => Promise<MasterRecording | null>;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const segment = /^[0-9a-f]{32}-[0-9]{5,}\.jsonl\.gz$/;

export async function getMasterRecording(email: string, sessionId: number, deps: Dependencies) {
  if (!email || !Number.isSafeInteger(sessionId) || sessionId <= 0) return null;
  const owner = email.trim().toLowerCase();
  const parent = await deps.session(sessionId);
  if (!parent || parent.id !== sessionId || parent.robot_model !== 'Master'
      || parent.email.toLowerCase() !== owner) return null;
  const row = await deps.recording(sessionId);
  if (!row || row.session_id !== sessionId || row.account_email.toLowerCase() !== owner
      || row.profile_id !== parent.access_profile_id || row.storage_status === 'deleted') return null;
  if (!uuid.test(row.recording_id)) throw new Error('Invalid recording identity');
  const binding = row.manifest.session;
  // A claimed recording can legitimately have no uploaded manifest yet.
  if (binding && (binding.session_id !== row.session_id || binding.recording_id !== row.recording_id
      || binding.profile_id !== row.profile_id)) throw new Error('Recording manifest identity mismatch');
  if (row.storage_status === 'available' && !binding) throw new Error('Recording manifest is missing');
  return row;
}

export function recordingDownloadPath(row: MasterRecording, filename: string) {
  const file = row.manifest.files?.find(entry => entry.path === filename);
  if (row.storage_status !== 'available' || !uuid.test(row.recording_id)
      || !Number.isSafeInteger(row.session_id) || row.session_id <= 0 || !segment.test(filename)
      || !file || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || file.bytes > 50 * 1024 * 1024
      || !/^[0-9a-f]{64}$/.test(file.sha256)) throw new Error('Recording file is unavailable');
  return `master/session-${row.session_id}/${row.recording_id}/${filename}`;
}
