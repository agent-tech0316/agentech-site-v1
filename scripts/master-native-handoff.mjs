import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { closeSync, existsSync, fstatSync, openSync, readFileSync, readSync, realpathSync } from 'node:fs';
import { join, sep } from 'node:path';
import { parseMasterExecutionResult, scopedNativeOwner } from './master-session-gateway.mjs';

const commands = JSON.parse(readFileSync(new URL('./master-command-contract.json', import.meta.url), 'utf8')).commands;
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
    && Array.isArray(plan.commands) && plan.commands.length > 0
    && plan.commands.every(c => ['native_preset','native_head','passive'].includes(commands[c.name]?.backend)), 'program can own raw or retained control');
  const receipt = parseMasterExecutionResult(receiptBytes.toString('utf8'), {sessionId:String(id),
    submissionId:previous.executionSubmissionId, attemptId:previous.executionAttemptId,
    sourceSha256:proof.source_sha256, planSha256:proof.plan_sha256, bookedEnd:previous.end});
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
    proofs[id] = verifyNativeHandoff(proof,{id,previous,config:issuanceConfig,nowMs,signed:!pinned,
      receiptBytes:boundedFile(runtimeDir,join(runtimeDir,basename+'.master-result.json'),16*1024*1024),
      planBytes:boundedFile(runtimeDir,join(runtimeDir,`session-${id}.plan.json`),1024*1024)});
  }
  return proofs;
}

export function masterUnresolvedSessions(sessions, runtimeDir, config, now = Date.now()) {
  const proofs = loadMasterNativeHandoffs(sessions, runtimeDir, config, now);
  return Object.fromEntries(Object.entries(sessions).filter(([id]) => !Object.hasOwn(proofs, id)));
}
