import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
const spec = JSON.parse(readFileSync(new URL('./master-happy-dance.json',import.meta.url)));
const prefix = 'master-body-';
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

export function parseBodySubmission(row) {
  if (!String(row.id).startsWith(prefix) && row.ai_security_model !== spec.mode && row.run_mode !== spec.mode) return null;
  const id = String(row.id).slice(prefix.length);
  if (!String(row.id).startsWith(prefix) || !uuid.test(id) || row.robot_model !== 'Master'
      || row.run_mode !== spec.mode || row.ai_security_model !== spec.mode || row.code !== spec.source)
    throw new Error('Invalid pinned native package submission');
  return id;
}

export function createBodyPlan(submission) {
  const id = parseBodySubmission(submission);
  if (!id) throw new Error('A pinned Master package is required');
  return {version:2,robot_model:'master',asset_id:id,submission_id:submission.id,
    source_sha256:createHash('sha256').update(spec.source).digest('hex'),
    commands:[{name:'play_body',args:{motion_name:spec.motion,audio_path:''},line:1}]};
}

function verifyDanceAudio(audio) {
  if (!audio || audio.board !== 'soc2' || audio.file !== 'audio.wav' || audio.sha256 !== spec.audio ||
      audio.pcm_bytes !== 2080000 || audio.sample_rate_hz !== 16000 || audio.channels !== 1 ||
      audio.bits_per_sample !== 16 || audio.muted !== false || !Number.isInteger(audio.volume) ||
      audio.volume < 1 || audio.volume > 100 || audio.completed !== true) return false;
  const opened = Date.parse(audio.opened_at_robot), started = Date.parse(audio.started_at_robot);
  const finished = Date.parse(audio.finished_at_robot);
  return opened <= started && started < finished && Number.isFinite(audio.playing_seconds) &&
    audio.playing_seconds >= 63 && audio.playing_seconds <= 68 &&
    Math.abs((finished - started) / 1000 - audio.playing_seconds) < 0.02;
}

export function verifyBodyReceipt(value) {
  const cmd = value.commands?.[0], r = cmd?.result;
  const before = value.owner_binding, after = value.final_owner_binding;
  const started = Date.parse(cmd?.sdk_call_started_at), finish = Date.parse(value.finished_at);
  return Boolean(value.handoff_mode === 'native-body-playback' && value.handoff_ready === true
    && value.owner_hold_preserved === false && value.owner_hold_verified === false && !value.error
    && value.outcome === 'completed' && value.command_count === 1 && value.completed_count === 1 && value.commands.length === 1
    && cmd.status === 'completed' && cmd.name === 'play_body' && cmd.args?.motion_name === spec.motion && cmd.args?.audio_path === ''
    && r?.serial === spec.serial && r?.asset_id && uuid.test(r.asset_id) && value.submission_id === prefix+r.asset_id
    && r.policy_sha256 === spec.policy && r.audio_sha256 === spec.audio && r.zip_sha256 === spec.zip
    && r.play_response === 'Play success' && r.native_motion === spec.motion && r.bundled_audio === 'audio.wav'
    && verifyDanceAudio(r.audio_output)
    && Number.isFinite(r.playing_seconds) && r.playing_seconds >= 55 && r.playing_seconds <= 75
    && Number.isFinite(r.peak_travel_rad) && r.peak_travel_rad > 0.1 && r.joints_fault_free === true
    && before?.mode === 'STAND_DEFAULT' && after?.mode === 'STAND_DEFAULT' && before?.settled === true && after?.settled === true
    && before?.player === 0 && after?.player === 0 && /^mc_ros2_node/.test(before?.owner ?? '') && before.owner === after.owner
    && Date.parse(value.started_at) <= started && started < Date.parse(value.booked_end)
    && finish - started >= r.playing_seconds*1000 && finish <= Date.parse(value.booked_end));
}

export async function bodyOperatorConfirmation(request, session, assetId, notBefore) {
  const query = new URLSearchParams({session_id:'eq.'+session.id,email:'eq.'+session.email,asset_id:'eq.'+assetId,
    booked_start:'eq.'+session.scheduled_start,booked_end:'eq.'+session.scheduled_end,select:'confirmed_at'});
  const [row] = await request('agentech_body_operator_ready',query.toString());
  const target = Math.max(Date.now(),Date.parse(notBefore)), confirmed = Date.parse(row?.confirmed_at);
  return Number.isFinite(confirmed) && confirmed <= Date.now() && target-confirmed < 90000 ? row.confirmed_at : null;
}
