import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
const spec = JSON.parse(readFileSync(new URL('./master-happy-dance.json',import.meta.url)));
const prefix = 'master-body-';
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

const bookedPrefix = 'master-body-v2-';
const bookedMode = 'master-native-asset-v2';
const hash = data => createHash('sha256').update(data).digest('hex');
const sha = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const boundedSize = n => Number.isSafeInteger(n) && n > 0 && n <= 64 * 1024 * 1024;

export function parseBodySubmission(row) {
  if (String(row.id).startsWith(bookedPrefix) || [row.run_mode, row.ai_security_model].includes(bookedMode)) {
    const id = String(row.id).slice(bookedPrefix.length);
    const pin = JSON.parse(row.code);
    if (!row.id.startsWith(bookedPrefix) || !uuid.test(id) || row.robot_model !== 'Master' ||
        row.run_mode !== bookedMode || row.ai_security_model !== bookedMode || pin?.asset_id !== id ||
        !sha(pin.asset_sha256) || Object.keys(pin).length !== 2) throw new Error('Invalid booked native submission');
    return id;
  }
  if (!String(row.id).startsWith(prefix) && row.ai_security_model !== spec.mode && row.run_mode !== spec.mode) return null;
  const id = String(row.id).slice(prefix.length);
  if (!String(row.id).startsWith(prefix) || !uuid.test(id) || row.robot_model !== 'Master'
      || row.run_mode !== spec.mode || row.ai_security_model !== spec.mode || row.code !== spec.source)
    throw new Error('Invalid pinned native package submission');
  return id;
}

function bookedManifest(submission, row, id) {
  const content = row?.content_manifest, policy = content?.movement, audio = content?.audio;
  const contract = policy?.metadata?.masterContract;
  if (row?.id !== id || row.sha256 !== JSON.parse(submission.code).asset_sha256 || !boundedSize(row.byte_size) ||
      !['Package','Motion'].includes(row.asset_kind) || content?.version !== 1 || !contract ||
      !['Master Edu','Master Ultra'].includes(contract.model) || contract.controlHz !== 50 ||
      contract.observationSize !== (contract.model === 'Master Ultra' ? 151 : 131) ||
      contract.actionSize !== (contract.model === 'Master Ultra' ? 29 : 25) || contract.evidence !== 'static-interface' ||
      !Number.isSafeInteger(contract.frameCount) || contract.frameCount <= 0 || policy.format !== 'onnx' ||
      !sha(policy.sha256) || !boundedSize(policy.bytes) || !policy.path ||
      content.playback?.movementPath !== policy.path || content.playback.audioPath !== (audio?.path ?? null) ||
      content.playback.mode !== (audio ? 'movement_with_audio' : 'movement_only') ||
      (row.asset_kind === 'Motion' && (audio !== null || policy.sha256 !== row.sha256 || policy.bytes !== row.byte_size)) ||
      !(audio === null || (audio.format === 'wav' && audio.path && sha(audio.sha256) && boundedSize(audio.bytes) &&
        Number.isFinite(audio.durationSeconds) && audio.durationSeconds > 0 &&
        audio.sampleRateHz === 16000 && audio.channels === 1 && audio.bitsPerSample === 16))) {
    throw new Error('Booked package differs from its validated native manifest');
  }
  return {asset_id:id,asset_sha256:row.sha256,bytes:row.byte_size,kind:row.asset_kind,model:contract.model,
    frames:contract.frameCount,policy:{path:policy.path,sha256:policy.sha256,bytes:policy.bytes},
    audio:audio && {path:audio.path,sha256:audio.sha256,bytes:audio.bytes,seconds:audio.durationSeconds},
    motion:'linkcraft_resource_onnx_ffeaic'+row.sha256+'_0.0.1'};
}

export function createBodyPlan(submission, assetRow) {
  const id = parseBodySubmission(submission);
  if (!id) throw new Error('A pinned Master package is required');
  if (submission.run_mode === bookedMode) {
    const manifest = bookedManifest(submission, assetRow, id);
    return {version:2,robot_model:'master',asset_id:id,submission_id:submission.id,
      source_sha256:hash(submission.code),native_body_manifest:manifest,
      native_body_required_seconds:Math.ceil(Math.max(manifest.frames/50,manifest.audio?.seconds ?? 0))+10,
      commands:[{name:'play_body',args:{motion_name:manifest.motion,audio_path:''},line:1}]};
  }
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

function bookedPerformance(v, plan) {
  const m = plan?.native_body_manifest, c = v.commands?.[0], r = c?.result;
  if (!m || !r || v.submission_id !== plan.submission_id || v.source_sha256 !== plan.source_sha256 ||
      v.submission_id !== bookedPrefix+m.asset_id || v.body_start_authority !== 'signed_booking' ||
      v.handoff_mode !== 'native-body-playback' || !v.handoff_ready || v.owner_hold_preserved !== false ||
      v.owner_hold_verified !== false || v.error || v.outcome !== 'completed' || v.command_count !== 1 ||
      v.completed_count !== 1 || v.commands.length !== 1 || c.error || c.status !== 'completed' ||
      c.name !== 'play_body' || c.args?.motion_name !== m.motion || c.args?.audio_path !== '' ||
      r.request_attempted !== true || r.asset_id !== m.asset_id || r.asset_sha256 !== m.asset_sha256 ||
      r.model !== m.model || m.model !== 'Master Ultra' || r.serial !== spec.serial ||
      r.policy_probe?.policy_sha256 !== m.policy.sha256 || r.policy_probe?.model !== m.model ||
      r.policy_probe?.frames !== m.frames || r.policy_probe?.check !== (m.policy.sha256 === spec.policy
        ? 'exact-physically-recorded-policy' : 'ultra-closed-loop-simulation') ||
      r.policy_sha256 !== m.policy.sha256 || r.audio_sha256 !== (m.audio?.sha256 ?? null) ||
      r.play_response !== 'Play success' || r.native_motion !== m.motion || r.motion_complete !== true ||
      r.terminal_standing_observed !== true || r.joints_fault_free !== true || r.joint_fault_count !== 0 ||
      !Array.isArray(r.joint_faults) || r.joint_faults.length || r.partial_observation) return false;
  const before = v.owner_binding, after = v.final_owner_binding, transitions = r.native_transitions;
  const seconds = m.frames/50, tolerance = Math.min(.5,seconds*.1);
  if (![before,after].every(b => b?.settled === true && b.mode === 'STAND_DEFAULT' && b.player === 0 &&
      /^mc_ros2_node\d+$/.test(b.owner)) || before.owner !== after.owner ||
      !Number.isFinite(r.playing_seconds) || Math.abs(r.playing_seconds-seconds) > tolerance ||
      !(Number.isFinite(r.peak_travel_rad) && r.peak_travel_rad > 0) ||
      !Array.isArray(transitions) || ![2,3].includes(transitions.length) ||
      transitions[0]?.mode !== 'BMIMIC' || transitions[0]?.motion !== m.motion || transitions[0]?.player !== 2 ||
      transitions.at(-1)?.mode !== 'STAND_DEFAULT' || (transitions.length === 3 && transitions[1]?.mode !== 'BMIMIC_STEP') ||
      transitions.slice(1).some(t=>t?.motion !== '' || t?.player !== 0) ||
      transitions.some(t=>!/^\d{16,20}$/.test(t.stamp_ns)) ||
      ![before,after].every(b=>/^\d{16,20}$/.test(b.mc_stamp_ns)) ||
      BigInt(before.mc_stamp_ns)>BigInt(transitions[0].stamp_ns) ||
      BigInt(after.mc_stamp_ns)<BigInt(transitions.at(-1).stamp_ns) ||
      transitions.slice(1).some((t,i)=>BigInt(t.stamp_ns)<=BigInt(transitions[i].stamp_ns))) return false;
  const firstGap = Number(BigInt(transitions[1].stamp_ns)-BigInt(transitions[0].stamp_ns))/1e9-r.playing_seconds;
  const start = Date.parse(c.sdk_call_started_at), finish = Date.parse(v.finished_at);
  if (firstGap < -1e-6 || firstGap > .501 || !(Date.parse(v.started_at) <= start && finish-start >= r.playing_seconds*1000 &&
      finish <= Date.parse(v.booked_end))) return false;
  if (!m.audio) return r.music_played === null && r.audio_output === null;
  const a = r.audio_output, duration = m.audio.seconds;
  return r.music_played === true && a?.completed === true && a.transport_status === 'confirmed' && !a.error &&
    a.sha256 === m.audio.sha256 && a.file === 'audio.wav' && a.board === 'soc2' && a.muted === false &&
    Number.isInteger(a.volume) && a.volume > 0 && a.volume <= 100 &&
    a.sample_rate_hz === 16000 && a.channels === 1 && a.bits_per_sample === 16 && a.pcm_bytes === Math.round(duration*32000) &&
    Date.parse(a.opened_at_robot) <= Date.parse(a.started_at_robot) && a.playing_seconds > 0 &&
    Math.abs(a.playing_seconds-duration) <= Math.min(2,duration*.1) &&
    Math.abs((Date.parse(a.finished_at_robot)-Date.parse(a.started_at_robot))/1000-a.playing_seconds) < .02;
}

export function verifyBodyReceipt(value, plan) {
  if (String(value?.submission_id).startsWith(bookedPrefix)) return Boolean(bookedPerformance(value, plan));
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
