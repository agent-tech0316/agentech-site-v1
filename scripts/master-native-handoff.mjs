import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { closeSync, existsSync, fstatSync, openSync, readFileSync, readSync, realpathSync, statSync } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { parseMasterExecutionResult, scopedNativeOwner } from './master-session-gateway.mjs';

const commands = JSON.parse(readFileSync(new URL('./master-command-contract.json', import.meta.url), 'utf8')).commands;
const dance = JSON.parse(readFileSync(new URL('./master-happy-dance.json',import.meta.url), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const deployed98 = { id:'98', attempt:'a3cb275d-c62c-43dc-98c0-a63389ec6f5a',
  sdk:'a9ed186b2977fce0eab98932299dc31cd7dea15150c0e2d0c2dd4f4982160de4',
  sha256:'0e03aa8262656253c3b4b62915b1916ab54b025943859e403298207d089cae0b' };
const signingDomain = 'EAIC/Master/native-control-handoff/v1';
const flags = ['noActivePublisher','sdk_fresh_ready_verified','standingStateVerified',
  'nativeCommandOwnersVerified','nativeBalanceEvidenceVerified','completeArmCommandFrameVerified','completeArmStateFrameVerified'];
const nativeControl = binding =>
  ((binding?.ownerMode === 'native-standing' && binding.presetActionsReady === true)
    || (binding?.ownerMode === 'native-hold' && binding.presetActionsReady === false))
  && binding.nativeOwner === 'native-mc'
  && binding.aimdkMcMode === 'STAND_DEFAULT' && flags.every(key => binding[key] === true)
  && binding.manipulationPublishers === 0 && !binding.fault && binding.requestId == null && binding.publisherPid == null;

export function masterTargetDigest(config) {
  return hash(JSON.stringify([config.host, config.port ?? 21274, config.ssh_port ?? 22, config.ssh_username ?? 'run']));
}

export function nativeHandoffPath(runtimeDir, id, attempt, sdkHash) {
  if (!/^\d+$/.test(String(id)) || !/^[A-Za-z0-9-]{1,128}$/.test(attempt ?? '') || !/^[a-f0-9]{64}$/.test(sdkHash ?? '')) {
    throw new Error('Invalid native handoff identity');
  }
  return join(runtimeDir, 'master-native-handoffs', `session-${id}.${attempt}.${sdkHash.slice(0,12)}.json`);
}

function boundedFile(root, path, maximum) {
  const actual = realpathSync(path);
  if (!actual.startsWith(realpathSync(root)+sep)) throw new Error('Native handoff artifact is outside its bounded runtime');
  const fd=openSync(actual,'r');
  try {
    const stat=fstatSync(fd);
    if (!stat.isFile() || stat.size <= 0 || stat.size > maximum) throw new Error('Invalid native handoff artifact size');
    const bytes=Buffer.alloc(stat.size);
    let offset=0;
    while (offset<bytes.length) {
      const n=readSync(fd,bytes,offset,bytes.length-offset,offset);
      if (!n) throw new Error('Truncated native handoff artifact');
      offset+=n;
    }
    if (fstatSync(fd).size !== stat.size) throw new Error('Native handoff artifact changed');
    return bytes;
  } finally { closeSync(fd); }
}

function signedNativeMeasurements(proof, heart, unkeyed) {
  const first=proof.native_binding_before,last=proof.native_binding;
  if (!scopedNativeOwner(first,heart) || !scopedNativeOwner(last,heart)) return false;
  const left=first.nativeIdleObservation,right=last.nativeIdleObservation;
  const keys=heart ? ['inputSource','bootId','mcNode','installedBuild','waistReference'] : ['inputSource'];
  if (!keys.every(k=>typeof left[k]==='string' && left[k].trim() && left[k] === right[k]) ||
      right.firstSequence <= left.lastSequence || left.dwellMs > 6000 || right.dwellMs > 6000) return false;
  const start=Date.parse(first.observed_at), finish=Date.parse(last.observed_at), issued=Date.parse(proof.observed_at);
  if (!(start < finish && finish <= issued && issued-start <= 90_000)) return false;
  if (!unkeyed) return true;
  const terminal=proof.unkeyed_terminal;
  if (terminal?.task !== 0 || terminal.state !== 1 ||
      !['before_ns','terminal_ns','after_ns'].every(k=>typeof terminal[k]==='string' && /^[1-9]\d{0,19}$/.test(terminal[k]))) return false;
  const [before,stamp,after]=['before_ns','terminal_ns','after_ns'].map(k=>BigInt(terminal[k]));
  return before <= stamp && stamp <= after && after > before && after-before <= 1000000000n;
}

const bilateral = names => ['left','right'].flatMap(side=>names.map(name=>`${side}_${name}_joint`));
const bodyJoints = {arm:bilateral(['shoulder_pitch','shoulder_roll','shoulder_yaw','elbow','wrist_yaw','wrist_pitch','wrist_roll']),
  leg:bilateral(['hip_pitch','hip_roll','hip_yaw','knee','ankle_pitch','ankle_roll']),
  waist:['waist_yaw_joint','waist_pitch_joint','waist_roll_joint'],head:['head_yaw_joint','head_pitch_joint']};
const bodyStreams = [...Object.keys(bodyJoints),'hand','mc','chest','torso'];
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const nativeNs = value=>typeof value === 'string' && /^[1-9]\d{0,19}$/.test(value) ? BigInt(value) : -1n;
const finiteRange = (v,min,max)=>Number.isFinite(v) && min <= v && v <= max;

function bodyWindow(binding) {
  if (!binding || !/^mc_ros2_node\d+$/.test(binding.owner) || binding.serial !== dance.serial || !uuid.test(binding.boot_id) || !uuid.test(binding.receiver_id)
      || binding.mode !== 'STAND_DEFAULT' || binding.status !== 100 || binding.body !== 1 || binding.player !== 0 || binding.motion !== '' || binding.settled !== true
      || typeof binding.input_source !== 'string' || !binding.input_source.trim() || binding.manipulation_publishers !== 0
      || binding.competing_body_pose_publishers !== 0 || binding.mc_body_pose_subscriber !== true
      || !['arm','leg','waist','head','hand','mc'].every(k=>binding.command_owners?.[k] === binding.owner)
      || !Array.isArray(binding.hand_types) || binding.hand_types.length !== 2 || !binding.hand_types.every(v=>v === 0)
      || !finiteRange(binding.dwell_ms,400,6000)) return false;
  const before=nativeNs(binding.mode_before_ns),after=nativeNs(binding.mode_after_ns);
  if (!(before>0n && before<after && after-before<=6000000000n)) return false;
  for (const key of bodyStreams) {
    const f=binding.frames?.[key],a=nativeNs(f?.first_ns),b=nativeNs(f?.last_ns);
    if (!(before<a && a<b && b<=after && b-a>=400000000n && after-b<=150000000n && Number.isInteger(f?.count) && f.count>=3
        && Number.isFinite(f.max_gap_ms) && f.max_gap_ms>0 && f.max_gap_ms<=150)) return false;
  }
  for (const [group,names] of Object.entries(bodyJoints)) {
    const s=binding.joints?.[group];
    if (!Array.isArray(s?.names) || s.names.length!==names.length || !names.every(n=>s.names.includes(n)) || s.frame_state!==0 || s.max_error_code!==0
        || !Number.isFinite(s.peak_velocity) || s.peak_velocity<0 || s.peak_velocity>=.12) return false;
  }
  return ['torso','chest'].every(k=>{
    const s=binding.imus?.[k];
    return s && [s.min_acc,s.max_acc,s.peak_gyro].every(Number.isFinite) && 8<s.min_acc && s.min_acc<=s.max_acc && s.max_acc<11.5 && 0<=s.peak_gyro && s.peak_gyro<.15;
  });
}

function bodyHandoff(proof,plan,receipt,nowMs,previous) {
  const cmd=receipt.commands[0],r=cmd?.result, p=proof.body_package;
  const argsOk = a => a && Object.keys(a).length===2 && a.motion_name===dance.motion && a.audio_path==='';
  const pkg={asset_id:plan.asset_id,zip_sha256:dance.zip,policy_sha256:dance.policy,audio_sha256:dance.audio,serial:dance.serial};
  if (!uuid.test(plan.asset_id) || plan.version!==2 || plan.submission_id!=='master-body-'+plan.asset_id || plan.source_sha256!==hash(dance.source)
      || plan.commands.length!==1 || plan.commands[0].name!=='play_body' || plan.commands[0].line!==1 || !argsOk(plan.commands[0].args)
      || receipt.outcome!=='failed' || receipt.handoff_ready!==false || receipt.owner_hold_preserved!==false || receipt.owner_hold_verified!==false
      || receipt.command_count!==1 || receipt.completed_count!==0 || receipt.commands.length!==1 || cmd.command_index!==1 || cmd.line!==1 || cmd.name!=='play_body'
      || cmd.status!=='failed' || !argsOk(cmd.args) || !argsOk(cmd.source_args) || !cmd.error || !receipt.error?.message
      || receipt.error.type!==cmd.error.type || receipt.error.message!==cmd.error.message || (receipt.error.command ?? 'play_body')!=='play_body'
      || (receipt.error.command_index ?? 1)!==1 || r?.request_attempted!==true || r.play_response!=='Play success' || r.bundled_audio!=='audio.wav'
      || !Object.entries(pkg).every(([k,v])=>r[k]===v && p?.[k]===v)) return false;
  const initial=receipt.owner_binding;
  if (!/^mc_ros2_node\d+$/.test(initial?.owner) || initial?.mode!=='STAND_DEFAULT' || initial.player!==0 || initial.settled!==true) return false;
  const start=Date.parse(receipt.started_at),call=Date.parse(cmd.sdk_call_started_at),finish=Date.parse(receipt.finished_at),end=Date.parse(previous.end);
  const first=proof.native_binding_before,last=proof.native_binding;
  const a=Date.parse(first?.observed_at),b=Date.parse(last?.observed_at),issued=Date.parse(proof.observed_at);
  return start<=call && call<=finish && call<end && finish<=a && end<=a && a<b && b<=issued && issued<=nowMs && issued-a<=90000
    && bodyWindow(first) && bodyWindow(last) && first.receiver_id!==last.receiver_id
    && nativeNs(first.mode_after_ns)<nativeNs(last.mode_before_ns) && ['owner','boot_id','input_source'].every(k=>first[k]===last[k]);
}

export function verifyNativeHandoff(proof, {id, previous, config, receiptBytes, planBytes, nowMs = Date.now(), signed = true}) {
  const require = (condition, reason) => { if (!condition) throw new Error(`Master native handoff refused: ${reason}`); };
  require(previous?.executionModel === 'master' && previous.status === 'finished'
    && previous.executionStatus === 'failed' && previous.executionResult?.outcome === 'failed', 'previous attempt is not a finished failure');
  require(proof?.schema_version === 1 && proof.kind === 'native-control-handoff' && proof.robot_model === 'master'
    && proof.read_only === true && proof.robot_commands_sent === false && proof.failed_outcome_preserved === true, 'missing read-only evidence');
  require(proof.previous_session_id === String(id) && proof.previous_attempt_id === previous.executionAttemptId
    && proof.submission_id === previous.executionSubmissionId && proof.source_sha256 === previous.executionSourceSha256
    && proof.plan_sha256 === previous.executionPlanSha256 && proof.failed_result_sha256 === hash(receiptBytes), 'failed attempt identity changed');
  require(proof.sdk_api_sha256 === config.sdk_api_sha256 && proof.target_sha256 === masterTargetDigest(config), 'selected SDK or robot changed');
  require(hash(planBytes) === proof.plan_sha256, 'authorized plan changed');
  const plan = JSON.parse(planBytes.toString('utf8'));
  require(plan.robot_model === 'master' && plan.submission_id === proof.submission_id && plan.source_sha256 === proof.source_sha256
    && Array.isArray(plan.commands) && plan.commands.length > 0, 'invalid native program');
  const receipt = parseMasterExecutionResult(receiptBytes.toString('utf8'), {sessionId:String(id),
    submissionId:previous.executionSubmissionId, attemptId:previous.executionAttemptId,
    sourceSha256:proof.source_sha256, planSha256:proof.plan_sha256, bookedEnd:previous.end});
  if (String(plan.submission_id).startsWith('master-body-')) {
    require(signed && bodyHandoff(proof,plan,receipt,nowMs,previous),'failed body attempt, installed package or two terminal native windows were not verified');
    return proof;
  }
  require(plan.commands.every(c=>['native_preset','native_head','passive'].includes(commands[c.name]?.backend)), 'program can own raw or retained control');
  require(receipt.outcome === 'failed' && nativeControl(receipt.owner_binding), 'initial native ownership was not qualified');
  const attempted = receipt.commands;
  require(receipt.command_count === plan.commands.length && attempted.length > 0 && attempted.length <= plan.commands.length
    && attempted.every((c,i) => c.name === plan.commands[i].name)
    && [attempted.at(-1).name,'verify_master_hold'].includes(receipt.error?.command), 'receipt does not describe this failed program');
  const observed = Date.parse(proof.observed_at), bindingTime = Date.parse(proof.native_binding?.observed_at);
  require(Number.isFinite(observed) && Number.isFinite(bindingTime) && observed <= nowMs
    && observed >= Date.parse(previous.end) && observed >= Date.parse(receipt.finished_at)
    && bindingTime <= observed && observed-bindingTime <= 120000 && nativeControl(proof.native_binding), 'current native ownership was not freshly verified');
  if (signed) require(signedNativeMeasurements(proof,plan.commands.some(c=>c.name==='heart'),
    receipt.error?.command === 'heart' && receipt.error?.message === 'SetMcPresetMotion returned invalid task id 0'),
    'two current idle owner observations or native terminal identity were not verified');
  return proof;
}

export function loadMasterNativeHandoffs(sessions, runtimeDir, config, nowMs = Date.now()) {
  const proofs = {};
  if (!existsSync(join(runtimeDir, 'master-native-handoffs'))) return proofs;
  for (const [id, previous] of Object.entries(sessions)) {
    if (previous.executionModel !== 'master' || !previous.executionAttemptId || previous.masterHandoffReady === true) continue;
    const legacy = id === deployed98.id && previous.executionAttemptId === deployed98.attempt;
    const currentPath = nativeHandoffPath(runtimeDir,id,previous.executionAttemptId,config.sdk_api_sha256);
    const deployedPath = legacy ? nativeHandoffPath(runtimeDir,id,previous.executionAttemptId,deployed98.sdk) : null;
    // A historical release stays closed across PC upgrades. Select only the
    // verified deployment's exact original filename, never an arbitrary glob.
    const path = deployedPath && existsSync(deployedPath) ? deployedPath : currentPath;
    if (!existsSync(path)) continue;
    const basename = `session-${id}.${previous.executionAttemptId}`;
    const origin = JSON.parse(boundedFile(runtimeDir,join(runtimeDir,basename+'.master.json'),1024*1024));
    if (origin.session_id !== id || origin.attempt_id !== previous.executionAttemptId ||
        origin.source_sha256 !== previous.executionSourceSha256 || origin.plan_sha256 !== previous.executionPlanSha256 ||
        origin.submission_id !== previous.executionSubmissionId || origin.scheduled_end !== previous.end ||
        masterTargetDigest(origin) !== masterTargetDigest(config) ||
        ['relay_url','lease_file','standing_deployment'].some(k => (origin[k] ?? null) !== (config[k] ?? null))) {
      throw new Error('Master native handoff attempt, robot deployment or lease changed');
    }
    const bytes = boundedFile(runtimeDir,path,1024*1024);
    const file = JSON.parse(bytes);
    let proof = file;
    const pinned = legacy && path === deployedPath && hash(bytes) === deployed98.sha256;
    if (!pinned) {
      const secret = process.env.AGENTECH_MASTER_HANDOFF_EVIDENCE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!secret || Buffer.byteLength(secret) < 32 || file?.format !== signingDomain ||
          typeof file.payload !== 'string' || !/^[a-f0-9]{64}$/.test(file.signature ?? '')) {
        throw new Error('Master native handoff has no verified producer signature');
      }
      const key = createHmac('sha256',secret).update(signingDomain).digest();
      const expected = createHmac('sha256',key).update(file.payload).digest();
      if (!timingSafeEqual(expected,Buffer.from(file.signature,'hex'))) throw new Error('Master native handoff signature differs');
      proof = JSON.parse(file.payload);
    }
    const issuanceConfig = pinned ? {...config,sdk_api_sha256:deployed98.sdk} : config;
    if (proof.body_package && origin.native_body_asset_id !== proof.body_package.asset_id) throw new Error('Master native handoff historical body asset differs');
    proofs[id] = verifyNativeHandoff(proof,{id,previous,config:issuanceConfig,nowMs,signed:!pinned,
      receiptBytes:boundedFile(runtimeDir,join(runtimeDir,basename+'.master-result.json'),16*1024*1024),
      planBytes:boundedFile(runtimeDir,join(runtimeDir,`session-${id}.plan.json`),1024*1024)});
  }
  return proofs;
}

const cancelledMessage = 'Master session cancelled; no further command admitted';
const cancelError = {type:'RuntimeError',message:cancelledMessage};

function cancelledBeforeBodyDispatch(id,previous,root,config,now) {
  const result=previous.executionResult, attempt=previous.executionAttemptId;
  if (previous.executionModel!=='master' || previous.status!=='finished' || previous.executionStatus!=='failed'
      || previous.masterHandoffReady!==false || previous.executionResultPersisted!==true || previous.claimedWithoutLaunch || previous.masterRecoveryOwner
      || previous.endCleanupStatus==='running' || !/^\d+$/.test(id) || !uuid.test(attempt) || previous.masterPreparedAttemptId!==attempt
      || !uuid.test(previous.bodyAssetId) || previous.executionSubmissionId!=='master-body-'+previous.bodyAssetId
      || result?.outcome!=='failed' || !isDeepStrictEqual(result.error,cancelError)) return false;
  // The historical PID may remain in a finished row. Reconcile its exact terminal
  // receipt with the published result and the attempt's actual cancellation file.
  try {
    const directory=realpathSync(root), prefix=join(directory,`session-${id}.${attempt}`);
    const files={masterSessionDeployment:prefix+'.master.json',localExecutionResult:prefix+'.master-result.json',
      masterCancelFile:prefix+'.cancel',localPlan:join(directory,`session-${id}.plan.json`)};
    for (const [key,path] of Object.entries(files)) {
      if (typeof previous[key]!=='string' || resolve(previous[key])!==resolve(root,basename(path)) || realpathSync(path)!==path) return false;
    }
    const origin=JSON.parse(boundedFile(directory,files.masterSessionDeployment,1024*1024));
    const asset=previous.bodyAssetId,source=hash(dance.source),args={motion_name:dance.motion,audio_path:''};
    const planBytes=boundedFile(directory,files.localPlan,1024*1024),planHash=hash(planBytes);
    const expectedPlan={version:2,robot_model:'master',asset_id:asset,submission_id:previous.executionSubmissionId,source_sha256:source,
      commands:[{name:'play_body',args,line:1}]};
    if (origin.schema_version!==1 || origin.protocol!=='master-arm-session-v1' || origin.enabled!==true || origin.robot_model!=='master'
        || origin.session_id!==id || origin.attempt_id!==attempt || origin.submission_id!==previous.executionSubmissionId
        || origin.native_body_asset_id!==asset || origin.native_body_start_policy!=='signed_booking' || origin.recovery_owner_binding
        || origin.source_sha256!==source || previous.executionSourceSha256!==source || origin.plan_sha256!==planHash || previous.executionPlanSha256!==planHash
        || origin.scheduled_start!==previous.start || origin.scheduled_end!==previous.end || !isDeepStrictEqual(JSON.parse(planBytes),expectedPlan)
        || !config?.host || masterTargetDigest(origin)!==masterTargetDigest(config)
        || ['relay_url','lease_file','standing_deployment'].some(k=>!isDeepStrictEqual(origin[k]??null,config[k]??null))) return false;
    const bytes=boundedFile(directory,files.localExecutionResult,16*1024*1024).toString('utf8');
    const raw=JSON.parse(bytes), command=raw.commands?.[0];
    const parsed=parseMasterExecutionResult(bytes,{sessionId:id,attemptId:attempt,submissionId:origin.submission_id,
      sourceSha256:source,planSha256:planHash,bookedEnd:previous.end});
    // Only the failed body runner's pre-dispatch shape is eligible. Unknown execution
    // fields, request evidence, and every owner-binding or cleanup phase stay unresolved.
    const fields=['schema_version','robot_model','outcome','session_id','submission_id','source_sha256','plan_sha256','attempt_id','booked_end',
      'command_count','completed_count','commands','error','started_at','finished_at','handoff_ready','owner_hold_preserved','owner_hold_verified',
      'handoff_blocker','first_command_not_before','body_start_authority','overrun_seconds'];
    if (!isDeepStrictEqual(result,parsed) || raw.body_start_authority!=='signed_booking' || raw.command_count!==1 || raw.completed_count!==0
        || raw.commands.length!==1 || raw.handoff_ready!==false || raw.owner_hold_preserved!==false || raw.owner_hold_verified!==false || raw.overrun_seconds!==0
        || !Object.keys(raw).every(k=>fields.includes(k)) || !isDeepStrictEqual(raw.error,cancelError) || command?.status!=='failed'
        || !isDeepStrictEqual(command,{command_index:1,line:1,name:'play_body',args,source_args:args,status:'failed',started_at:command.started_at,
          duration_ms:command.duration_ms,result:{},error:cancelError})) return false;
    const start=Date.parse(previous.start),end=Date.parse(previous.end),published=Date.parse(previous.masterViewerStreamStartedAt);
    const earliest=Math.max(start,published)+20000,claim=Date.parse(previous.bodyBookingClaimedAt),began=Date.parse(raw.started_at);
    const prepared=Date.parse(command.started_at),finish=Date.parse(raw.finished_at);
    if (!boundedFile(directory,files.masterCancelFile,4096).toString('utf8').trim()) return false;
    const cancelled=Math.floor(statSync(files.masterCancelFile).mtimeMs);
    return start<=claim && published<=claim && claim<=began && began<=prepared && prepared<=cancelled && cancelled<=finish && finish<earliest
      && earliest===Date.parse(raw.first_command_not_before) && earliest===Date.parse(previous.masterFirstCommandNotBefore) && earliest<end && end<=now;
  } catch { return false; }
}

export function masterUnresolvedSessions(sessions, runtimeDir, config, now = Date.now()) {
  const proofs = loadMasterNativeHandoffs(sessions, runtimeDir, config, now);
  return Object.fromEntries(Object.entries(sessions).filter(([id,item]) =>
    !Object.hasOwn(proofs,id) && !cancelledBeforeBodyDispatch(id,item,runtimeDir,config,now)));
}

// A successful subprocess is never itself admission: the next gateway poll
// reads the signed proof against the actual failed receipt and the staged plan.
export function automaticNativeHandoff({runtimeDir, run, wake, now=Date.now}) {
  let working = false, previousKey, retryAt = 0, detail = '';
  return ({previousId,attempt,waitingId,config}) => {
    const output = nativeHandoffPath(runtimeDir,previousId,attempt,config.sdk_api_sha256);
    if (!/^\d+$/.test(waitingId) || existsSync(output)) return '';
    const key = JSON.stringify([output,waitingId]);
    if (working) return 'observing native control';
    if (previousKey === key && now() < retryAt) return detail;
    const prefix = join(runtimeDir,`session-${previousId}.${attempt}`);
    working = true; previousKey = key; detail = 'observing native control';
    Promise.resolve().then(()=>run(['--plan',join(runtimeDir,`session-${previousId}.plan.json`),
      '--deployment',prefix+'.master.json','--failed-result',prefix+'.master-result.json',
      '--output',output,'--waiting-session',waitingId])).then(()=>{
        detail = existsSync(output) ? '' : 'no signed observation was produced';
      },error=>{
        detail = String(error?.stderr || error?.message || 'observation failed').trim().split(/\r?\n/).at(-1).slice(0,400);
      }).finally(()=>{working=false;retryAt=now()+15000;wake();});
    return detail;
  };
}
