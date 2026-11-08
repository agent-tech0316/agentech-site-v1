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

const missingSpeakerEnd = 'Missing full speaker HAL playback evidence for the bundled WAV';
const sourceHash = createHash('sha256').update(spec.source).digest('hex');

function musicStartedWithDance(result, opened, started, pcm) {
  const frames = result.native_transitions;
  if (!Array.isArray(frames) || ![2,3].includes(frames.length) ||
      frames.some(f=>!f || typeof f.stamp_ns !== 'string' || !/^\d{16,20}$/.test(f.stamp_ns))) return false;
  const first = frames[0], last = frames.at(-1);
  if (first.mode !== 'BMIMIC' || first.motion !== spec.motion || first.player !== 2 || last.mode !== 'STAND_DEFAULT' ||
      (frames.length === 3 && frames[1].mode !== 'BMIMIC_STEP') || frames.slice(1).some(f=>f.player !== 0 || f.motion !== '')) return false;
  // Compare only native robot clocks here. Do not treat the gateway and the robot as synchronized.
  const times = frames.map(f=>Number(f.stamp_ns)/1e6);
  const lastFrameGap = (times[1]-times[0])/1000 - result.playing_seconds;
  return times.every((t,i)=>i===0 || t>times[i-1]) && opened <= started &&
    started <= pcm && Math.floor(times[0]) <= pcm && times.at(-1)-pcm >= 55000 && lastFrameGap >= 0 && lastFrameGap <= .501;
}

function verifyDanceAudio(audio, result, dispatchSeconds) {
  if (!audio || audio.board !== 'soc2' || audio.file !== 'audio.wav' || audio.sha256 !== spec.audio ||
      audio.pcm_bytes !== 2080000 || audio.sample_rate_hz !== 16000 || audio.channels !== 1 ||
      audio.bits_per_sample !== 16 || audio.muted !== false || !Number.isInteger(audio.volume) ||
      audio.volume < 1 || audio.volume > 100 || audio.error) return false;
  const opened = Date.parse(audio.opened_at_robot), started = Date.parse(audio.started_at_robot);
  if (audio.completed === false) {
    return audio.transport_status === 'end_not_observed' && audio.diagnostic === missingSpeakerEnd &&
      !Object.hasOwn(audio,'finished_at_robot') && !Object.hasOwn(audio,'playing_seconds') && dispatchSeconds >= 74.99 &&
      musicStartedWithDance(result,opened,started,Date.parse(audio.pcm_device_started_at_robot));
  }
  const finished = Date.parse(audio.finished_at_robot);
  return audio.completed === true && [undefined,'confirmed'].includes(audio.transport_status) && !audio.diagnostic &&
    opened <= started && started < finished && Number.isFinite(audio.playing_seconds) &&
    audio.playing_seconds >= 63 && audio.playing_seconds <= 68 &&
    Math.abs((finished - started) / 1000 - audio.playing_seconds) < 0.02;
}

function verifiedPerformance(value) {
  const cmd = value.commands?.[0], r = cmd?.result;
  const before = value.owner_binding, after = value.final_owner_binding;
  const started = Date.parse(cmd?.sdk_call_started_at), finish = Date.parse(value.finished_at);
  if (!r || !Array.isArray(value.commands)) return false;
  const classified = Object.hasOwn(r,'motion_complete') || Object.hasOwn(r,'music_played');
  if (classified) {
    if (r.motion_complete !== true || r.music_played !== true || r.request_attempted !== true ||
        r.partial_observation || r.terminal_standing_observed !== true || r.joint_fault_count !== 0 ||
        !Array.isArray(r.joint_faults) || r.joint_faults.length !== 0) return false;
  } else if (r.audio_output?.completed !== true || r.terminal_standing_observed === false || r.joint_fault_count > 0 ||
             r.partial_observation || r.joint_faults?.length) return false;
  return Boolean(value.owner_hold_preserved === false && value.owner_hold_verified === false && !value.error && !cmd.error
    && value.outcome === 'completed' && value.command_count === 1 && value.completed_count === 1 && value.commands.length === 1
    && cmd.status === 'completed' && cmd.name === 'play_body' && cmd.args?.motion_name === spec.motion && cmd.args?.audio_path === ''
    && r?.serial === spec.serial && r?.asset_id && uuid.test(r.asset_id) && value.submission_id === prefix+r.asset_id
    && r.policy_sha256 === spec.policy && r.audio_sha256 === spec.audio && r.zip_sha256 === spec.zip
    && r.play_response === 'Play success' && r.native_motion === spec.motion && r.bundled_audio === 'audio.wav'
    && verifyDanceAudio(r.audio_output,r,(finish-started)/1000)
    && Number.isFinite(r.playing_seconds) && r.playing_seconds >= 55 && r.playing_seconds <= 75
    && Number.isFinite(r.peak_travel_rad) && r.peak_travel_rad > 0.1 && r.joints_fault_free === true
    && before?.mode === 'STAND_DEFAULT' && after?.mode === 'STAND_DEFAULT' && before?.settled === true && after?.settled === true
    && before?.player === 0 && after?.player === 0 && /^mc_ros2_node\d+$/.test(before?.owner ?? '') && before.owner === after.owner
    && Date.parse(value.started_at) <= started && started < Date.parse(value.booked_end)
    && finish - started >= r.playing_seconds*1000 && finish <= Date.parse(value.booked_end));
}

export function verifyBodyReceipt(value) {
  return Boolean(value && value.handoff_mode === 'native-body-playback' && value.handoff_ready === true && verifiedPerformance(value));
}

export function reconcileMissingSpeakerEnd(value) {
  const cmd=value?.commands?.[0], r=cmd?.result, audio=r?.audio_output;
  const missing = error=>error?.type === 'RuntimeError' && error.message === missingSpeakerEnd &&
    (error.command === undefined || error.command === 'play_body');
  const argsMatch = args=>args && Object.keys(args).length === 2 && args.motion_name === spec.motion && args.audio_path === '';
  if (!value || value.schema_version !== 1 || value.robot_model !== 'master' || value.source_sha256 !== sourceHash ||
      !/^[0-9a-f]{64}$/.test(value.plan_sha256) || !value.attempt_id || !value.session_id ||
      value.outcome !== 'failed' || value.completed_count !== 0 || value.handoff_ready !== false ||
      value.overrun_seconds !== 0 || !missing(value.error) || !missing(cmd?.error) || cmd.status !== 'failed' ||
      cmd.command_index !== 1 || cmd.line !== 1 || !argsMatch(cmd.args) || !argsMatch(cmd.source_args) ||
      !Number.isFinite(cmd.duration_ms) || cmd.duration_ms < 74990 ||
      !(Date.parse(value.started_at) <= Date.parse(cmd.started_at) && Date.parse(cmd.started_at) <= Date.parse(cmd.sdk_call_started_at)) ||
      audio?.completed !== false || audio.error !== missingSpeakerEnd || audio.transport_status !== undefined ||
      Object.hasOwn(audio,'diagnostic') || Object.hasOwn(r,'motion_complete') || Object.hasOwn(r,'music_played')) return null;
  const report=structuredClone(value), command=report.commands[0], speaker=command.result.audio_output;
  delete speaker.error;
  Object.assign(speaker,{transport_status:'end_not_observed',diagnostic:missingSpeakerEnd});
  Object.assign(command.result,{motion_complete:true,music_played:true});
  Object.assign(command,{status:'completed',error:null});
  Object.assign(report,{outcome:'completed',completed_count:1,error:null});
  return verifiedPerformance(report) ? report : null;
}

export async function bodyOperatorConfirmation(request, session, assetId, notBefore) {
  const query = new URLSearchParams({session_id:'eq.'+session.id,email:'eq.'+session.email,asset_id:'eq.'+assetId,
    booked_start:'eq.'+session.scheduled_start,booked_end:'eq.'+session.scheduled_end,select:'confirmed_at'});
  const [row] = await request('agentech_body_operator_ready',query.toString());
  const target = Math.max(Date.now(),Date.parse(notBefore)), confirmed = Date.parse(row?.confirmed_at);
  return Number.isFinite(confirmed) && confirmed <= Date.now() && target-confirmed < 90000 ? row.confirmed_at : null;
}
