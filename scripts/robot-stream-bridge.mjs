import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import OBSWebSocket from "obs-websocket-js";
import { createMasterSessionDeployment, masterLaunchBlocker, masterRecoveryForStagedPlan, masterReceiptNeedsReload, parseMasterExecutionResult, assertMasterExecutableSubmission } from "./master-session-gateway.mjs";
import {
  naviLaunchBlocker, parseNaviCleanupResult, loadGatewayState, saveGatewayState,
  selectNaviResetBaseline, reconcileNaviCleanupOutcome,
} from "./navi-session-handoff.mjs";
import { ensureStreamWithRecovery } from "./obs-stream-recovery.mjs";
import {
  endSessionCleanupPolicy,
  finalSessionDatabaseStatus,
  keepsStreamActive,
} from "./robot-stream-session-policy.mjs";
import {
  buildDeviceResultsPatch,
  deviceResultsStateForPlan,
  parseDeviceResults,
} from "./robot-session-device-results.mjs";
import {
  buildExecutionResultPatch,
  parseExecutionResult,
} from "./robot-session-execution-result.mjs";

for (const key of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ROBOT_HOST", "ROBOT_SSH_USER"]) {
  if (!process.env[key]) throw new Error(`${key} is required.`);
}

const here = dirname(fileURLToPath(import.meta.url));
const runtimeDir = join(here, "..", ".robot-stream-runtime");
const stateFile = join(runtimeDir, "state.json");
// Written only by a trusted supervised handoff, never by cached bridge state.
const supervisedNaviBaselineFile = join(runtimeDir, "navi-supervised-baseline.json");
const compiler = join(here, "compile-robot-plan.py");
const trustedRunner = join(here, "trusted-robot-runner.py");
const deviceResultsSerializer = join(here, "aegis-device-results.py");
const gatewaySpec = join(here, "aegis_gateway_spec.py");
const runnerResultSerializer = join(here, "aegis-runner-result.py");
const trustedNaviRunner = join(here, "trusted-navi-runner.py");
const trustedMasterRunner = join(here, "trusted-master-runner.py");
const masterDeploymentFile = process.env.AGENTECH_MASTER_DEPLOYMENT_FILE;
const obsHiddenLauncher = join(here, "ensure-obs-running-hidden.vbs");
const captureUploadUrl = process.env.AGENTECH_CAPTURE_UPLOAD_URL || "https://www.agent-tech.ai/api/agentech-capture";
const supabaseUrl = process.env.SUPABASE_URL.replace(/\/$/, "").replace(/\/rest\/v1$/, "");
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const robot = `${process.env.ROBOT_SSH_USER}@${process.env.ROBOT_HOST}`;
const remoteDir = process.env.ROBOT_REMOTE_DIR || "/home/firefly/agentech-stream";
const robotPython = process.env.ROBOT_PYTHON || "python3";
const localPython = process.env.ROBOT_LOCAL_PYTHON || "python";
const naviHost = process.env.AGENTECH_NAVI_HOST || "192.168.4.65";
const naviPort = process.env.AGENTECH_NAVI_PORT || "9090";
// Navi's verified deployment is isolated from the older Aegis gateway package.
const agentechSdkRoot = process.env.AGENTECH_NAVI_SDK_ROOT || process.env.AGENTECH_SDK_ROOT || join(here, "..", "navi-sdk");
const sshKey = process.env.ROBOT_SSH_KEY;
const requestedPollMs = Number(process.env.ROBOT_STREAM_POLL_MS || 1000);
const pollMs = Number.isFinite(requestedPollMs)
  ? Math.min(60000, Math.max(500, requestedPollMs))
  : 1000;
const prepMs = Number(process.env.ROBOT_STREAM_PREP_SECONDS || 120) * 1000;
const obsUrl = process.env.OBS_WEBSOCKET_URL || "ws://127.0.0.1:4455";
const obsPassword = process.env.OBS_WEBSOCKET_PASSWORD || undefined;
const activeStatuses = new Set(["requested", "confirmed", "approved", "scheduled", "pending", "running"]);
const claimableStatuses = ["requested", "confirmed", "approved", "scheduled", "pending"];

mkdirSync(runtimeDir, { recursive: true });
let state = loadGatewayState(stateFile);
let obs;
const obsRecoveryState = { lastAttemptAt: 0 };
const obsRecoveryCooldownMs = 5 * 60 * 1000;

async function boundedObs(operation) {
  let timer;
  try {
    return await Promise.race([operation, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("OBS response timed out")), 3000);
    })]);
  } finally { clearTimeout(timer); }
}

async function obsCall(requestType, requestData) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      if (!obs) {
        obs = new OBSWebSocket();
        await boundedObs(obs.connect(obsUrl, obsPassword));
      }
      return await boundedObs(obs.call(requestType, requestData));
    } catch (error) {
      lastError = error;
      try { await obs?.disconnect(); } catch {}
      obs = undefined;
    }
  }
  throw lastError;
}

function saveState() { saveGatewayState(stateFile, state); }
function refreshNaviResetBaseline() {
  let supervised;
  try { supervised = JSON.parse(readFileSync(supervisedNaviBaselineFile, "utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  return selectNaviResetBaseline({verified_at:state.naviResetVerifiedAt,result:state.naviResetResult}, supervised, Date.now());
}

function createNaviSessionOwner(id) {
  const attempt_id = randomUUID();
  return {attempt_id, pid:null, result_file:join(runtimeDir,`navi-${id}-${attempt_id}.cleanup.json`),
    owner_file:join(runtimeDir,`navi-${id}-${attempt_id}.owner.json`)};
}
function normalized(value) { return String(value || "").replaceAll(" ", "_").toLowerCase(); }
function robotModel(value) {
  const model = normalized(value);
  if (model === "aegis" || model === "aegies" || !model) return "aegis";
  if (model === "navi") return "navi";
  if (model === "master") return "master";
  throw new Error(`unsupported robot model: ${value}`);
}
function naviEnvironment() {
  return { ...process.env, AGENTECH_NAVI_HOST: naviHost, AGENTECH_NAVI_PORT: naviPort, AGENTECH_SDK_ROOT: agentechSdkRoot,
    AGENTECH_NAVI_OWNER_LOCK:join(runtimeDir,"navi-owner.lock") };
}
function masterEnvironment() {
  const env = { ...process.env };
  delete env.SUPABASE_SERVICE_ROLE_KEY;
  delete env.OBS_WEBSOCKET_PASSWORD;
  return env;
}
function sshArgs() { return [...(sshKey ? ["-i", sshKey] : []), "-o", "BatchMode=yes", "-o", "ConnectTimeout=8"]; }
function run(program, args, options = {}) { return execFileSync(program, args, { encoding: "utf8", timeout: 20000, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], ...options }); }

async function request(table, query, options = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?${query}`, {
    signal: AbortSignal.timeout(8000),
    method: options.method || "GET",
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
      Prefer: options.prefer || "return=representation"
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  if (!response.ok) throw new Error(await response.text());
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function dueSessions() {
  const now = new Date();
  const end = new Date(now.getTime() + prepMs);
  const select = "id,email,session_title,robot_model,scheduled_start,scheduled_end,session_status,approved_run_type,code_submission_id,created_at";
  const query = `scheduled_start=lte.${encodeURIComponent(end.toISOString())}&scheduled_end=gte.${encodeURIComponent(now.toISOString())}&approved_run_type=eq.custom_code&select=${select}&order=scheduled_start.asc`;
  return (await request("agentech_robot_sessions", query)).filter((item) => activeStatuses.has(normalized(item.session_status)));
}

async function reviewedSubmission(session) {
  if (session.approved_run_type !== "custom_code") throw new Error("session is not approved for custom code");
  if (!session.code_submission_id) {
    // Compatibility for website deployments created before booking-time pinning:
    // choose only the newest fully reviewed submission that already existed when the booking was made.
    const cutoff = encodeURIComponent(session.created_at);
    const fallbackQuery = `email=eq.${encodeURIComponent(session.email)}&created_at=lte.${cutoff}&physical_safety_status=eq.passed&ai_security_status=eq.passed&select=id,code,robot_model,run_mode,ai_security_model&order=created_at.desc&limit=1`;
    const candidates = await request("agentech_code_submissions", fallbackQuery);
    if (candidates.length !== 1) throw new Error("custom session has no eligible reviewed submission to pin");
    if (robotModel(session.robot_model) === "master") assertMasterExecutableSubmission(candidates[0]);
    const updated = await request(
      "agentech_robot_sessions",
      `id=eq.${encodeURIComponent(session.id)}&code_submission_id=is.null`,
      { method: "PATCH", body: { code_submission_id: candidates[0].id } }
    );
    if (!updated?.length) throw new Error("unable to atomically pin reviewed submission");
    session.code_submission_id = candidates[0].id;
    console.log(`[robot-stream] pinned reviewed submission ${candidates[0].id} to legacy booking ${session.id}.`);
  }
  const query = `id=eq.${encodeURIComponent(session.code_submission_id)}&email=eq.${encodeURIComponent(session.email)}&physical_safety_status=eq.passed&ai_security_status=eq.passed&select=id,code,robot_model,run_mode,ai_security_model&limit=1`;
  const rows = await request("agentech_code_submissions", query);
  if (rows.length !== 1) throw new Error("pinned submission no longer passes both reviews");
  if (robotModel(rows[0].robot_model) !== robotModel(session.robot_model)) throw new Error("session robot model does not match its reviewed submission");
  if (robotModel(session.robot_model) === "master") assertMasterExecutableSubmission(rows[0]);
  return rows[0];
}

async function startObs() {
  await ensureStreamWithRecovery({
    getStatus: () => obsCall("GetStreamStatus"),
    startStream: () => obsCall("StartStream"),
    recover: async () => {
      const wscript = join(process.env.SystemRoot || "C:\\Windows", "System32", "wscript.exe");
      const result = spawnSync(wscript, ["//B", "//Nologo", obsHiddenLauncher, "repair-nvenc"], {
        encoding: "utf8",
        timeout: 120000,
        windowsHide: true,
      });
      if (result.error) throw result.error;
      if (result.status !== 10) return false;
      try { await obs?.disconnect(); } catch {}
      obs = undefined;
      return true;
    },
    recoveryState: obsRecoveryState,
    recoveryCooldownMs: obsRecoveryCooldownMs,
    nowMs: Date.now(),
  });
  const verified = await obsCall("GetStreamStatus");
  if (!verified.outputActive) throw new Error("OBS did not enter the streaming state");
}

async function stopObs() {
  const status = await obsCall("GetStreamStatus");
  if (status.outputActive) await obsCall("StopStream");
}

async function stopObsVirtualCamera() {
  const stream = await obsCall("GetStreamStatus");
  if (stream.outputActive) return;
  const camera = await obsCall("GetVirtualCamStatus");
  if (camera.outputActive) await obsCall("StopVirtualCam");
}

function stage(session, submission) {
  const prefix = `session-${session.id}`;
  const selectedModel = robotModel(session.robot_model);
  const sourcePath = join(runtimeDir, `${prefix}.reviewed.py`);
  const planPath = join(runtimeDir, `${prefix}.plan.json`);
  writeFileSync(sourcePath, submission.code, { encoding: "utf8", flag: "wx" });
  if (selectedModel === "navi" || selectedModel === "master") run(localPython, [compiler, sourcePath, submission.id, selectedModel, planPath]);
  else run(localPython, [compiler, sourcePath, submission.id, planPath]);
  const plan = JSON.parse(readFileSync(planPath, "utf8"));
  if (plan.source_sha256 !== createHash("sha256").update(submission.code).digest("hex")) throw new Error("compiled plan source hash mismatch");
  const endCleanup = endSessionCleanupPolicy(plan, selectedModel);
  const deviceResultsState = selectedModel === "aegis"
    ? deviceResultsStateForPlan(plan, `${remoteDir}/${prefix}`)
    : deviceResultsStateForPlan({ commands: [] }, `${remoteDir}/${prefix}`);
  let captureIndex = 0;
  const remoteCaptures = [];
  if (selectedModel === "aegis") {
    run("ssh", [...sshArgs(), robot, "mkdir", "-p", remoteDir]);
    run("scp", [
      ...sshArgs(),
      planPath,
      trustedRunner,
      deviceResultsSerializer,
      gatewaySpec,
      runnerResultSerializer,
      `${robot}:${remoteDir}/`,
    ]);
    for (const command of plan.commands) {
      if (command.name !== "capture_image") continue;
      captureIndex += 1;
      remoteCaptures.push(`${remoteDir}/${prefix}.plan-capture-${captureIndex}.jpg`);
    }
  }
  state.sessions[session.id] = {
    status: "staged",
    executionModel: selectedModel,
    executionResultRequired: selectedModel === "aegis" || selectedModel === "master",
    executionResultCollectionAttempted: selectedModel !== "aegis" && selectedModel !== "master",
    executionResultPersisted: selectedModel !== "aegis" && selectedModel !== "master",
    executionStatus: selectedModel === "aegis" || selectedModel === "master" ? "pending" : null,
    executionSubmissionId: submission.id,
    executionSourceSha256: plan.source_sha256,
    executionPlanSha256: createHash("sha256").update(readFileSync(planPath)).digest("hex"),
    remoteExecutionResult: selectedModel === "aegis"
      ? `${remoteDir}/${prefix}.execution.json`
      : null,
    localPlan: planPath,
    remotePlan: selectedModel === "aegis" ? `${remoteDir}/${prefix}.plan.json` : null,
    ...deviceResultsState,
    remoteCaptures,
    publishedCaptures: [],
    accountEmail: session.email,
    start: session.scheduled_start,
    end: session.scheduled_end,
    streamStatus: "pending",
    streamAvailableDuringSession: false,
    streamFailureCount: 0,
    endCleanupRequired: endCleanup.required,
    endReturnHomeRequired: endCleanup.returnHomeRequired,
    endCleanupStatus: endCleanup.required ? "pending" : "not_required",
    endCleanupAttempts: 0
  };
  saveState();
  console.log(`[robot-stream] Code X compiled and staged ${plan.commands.length} ${selectedModel} commands for session ${session.id}.`);
}

async function ensureSessionStream(id, item, nowMs) {
  try {
    await startObs();
    const firstStart = item.streamStatus !== "publishing";
    const wasAvailableDuringSession = item.streamAvailableDuringSession === true;
    item.streamStatus = "publishing";
    item.streamStartedAt ??= new Date().toISOString();
    delete item.streamError;
    if (nowMs >= Date.parse(item.start) && nowMs < Date.parse(item.end)) {
      item.streamAvailableDuringSession = true;
      item.streamAvailableDuringSessionAt ??= new Date().toISOString();
    }
    const becameAvailableDuringSession = !wasAvailableDuringSession
      && item.streamAvailableDuringSession === true;
    if (firstStart || becameAvailableDuringSession) saveState();
    return true;
  } catch (error) {
    item.streamStatus = "failed";
    item.streamError = error.message;
    item.streamFailureCount = Number(item.streamFailureCount || 0) + 1;
    saveState();
    console.error(`[robot-stream] session ${id} OBS delivery check failed:`, error.message);
    return false;
  }
}

async function claimSession(session) {
  const statuses = claimableStatuses.join(",");
  const claimed = await request(
    "agentech_robot_sessions",
    `id=eq.${encodeURIComponent(session.id)}&session_status=in.(${statuses})&scheduled_end=gt.${encodeURIComponent(new Date().toISOString())}&select=id`,
    { method: "PATCH", body: { session_status: "running" } }
  );
  return claimed?.length === 1;
}

async function launch(session) {
  const item = state.sessions[session.id];
  if (!Number.isFinite(Date.parse(item.end)) || Date.now() >= Date.parse(item.end)) return;
  if (item.executionModel === "master") {
    item.masterRecoveryOwner = masterRecoveryForStagedPlan(readFileSync(item.localPlan), item.executionPlanSha256, state.sessions, session.id);
    let blocker = masterLaunchBlocker(state.sessions, session.id, item);
    if (!blocker) {
      try {
        if (!masterDeploymentFile) throw new Error("AGENTECH_MASTER_DEPLOYMENT_FILE is not configured");
        const config = JSON.parse(readFileSync(masterDeploymentFile, "utf8"));
        const attemptId = item.masterPreparedAttemptId ?? randomUUID();
        const deployment = createMasterSessionDeployment(config, session, item, attemptId);
        item.masterPreparedAttemptId = attemptId;
        item.masterSessionDeployment = join(runtimeDir, `session-${session.id}.${attemptId}.master.json`);
        item.masterCancelFile = join(runtimeDir, `session-${session.id}.${attemptId}.cancel`);
        writeFileSync(item.masterSessionDeployment, JSON.stringify(deployment));
        run(localPython, [trustedMasterRunner, "--check-ready", "--plan", item.localPlan,
          "--deployment", item.masterSessionDeployment], { env: masterEnvironment(), timeout: 20000 });
      } catch (error) { blocker = `Master readiness check failed: ${error.message}`; }
    }
    if (blocker) {
      if (item.launchBlockedReason !== blocker) {
        item.launchBlockedReason = blocker;
        saveState();
        console.error(`[robot-stream] session ${session.id} waiting: ${blocker}`);
      }
      return;
    }
    delete item.launchBlockedReason;
  }
  if (item.executionModel === "navi") {
    let blocker;
    let baseline;
    try {
      baseline = refreshNaviResetBaseline();
      blocker = naviLaunchBlocker(state.sessions, session.id, Date.now(), baseline.verified_at);
    } catch (error) { blocker = error.message; }
    if (!blocker) {
      try {
        run(localPython, [trustedNaviRunner, "--check-home-ready"], {
          env:{...naviEnvironment(),AGENTECH_NAVI_EXPECTED_RESET_RUN_ID:baseline.result.run_id}, timeout:20000 });
      } catch (error) { blocker = `Navi live readiness check failed: ${error.message}`; }
    }
    if (blocker) {
      if (item.launchBlockedReason !== blocker) {
        item.launchBlockedReason = blocker;
        saveState();
        console.error(`[robot-stream] session ${session.id} waiting: ${blocker}`);
      }
      return;
    }
    delete item.launchBlockedReason;
  }
  if (Date.now() >= Date.parse(item.end)) return;
  if (!(await claimSession(session))) {
    item.status = "skipped";
    saveState();
    console.log(`[robot-stream] session ${session.id} was claimed by another gateway; skipping.`);
    return;
  }
  if (Date.now() >= Date.parse(item.end)) {
    item.status = "finished";
    item.endCleanupRequired = false;
    item.endCleanupStatus = "not_started";
    item.streamAvailableDuringSession = false;
    saveState();
    return;
  }
  if (item.executionModel === "master") {
    // Persist the attempt before spawn. A crash must not authorize a replay.
    item.executionAttemptId = item.masterPreparedAttemptId;
    item.masterHandoffReady = false;
    item.localExecutionResult = join(runtimeDir, `session-${session.id}.${item.executionAttemptId}.master-result.json`);
    item.status = "running";
    saveState();
    const logFd = openSync(join(runtimeDir, `session-${session.id}.master.log`), "a");
    try {
      const child = spawn(localPython, [trustedMasterRunner, "--plan", item.localPlan,
        "--deployment", item.masterSessionDeployment, "--result-file", item.localExecutionResult,
        "--session-end", item.end, "--cancel-file", item.masterCancelFile], {
        detached: true, windowsHide: true, stdio: ["ignore", logFd, logFd], env: masterEnvironment(),
      });
      child.on("error", error => console.error(`[robot-stream] Master runner spawn failed: ${error.message}`));
      if (!child.pid) throw new Error("Master runner process identity is missing; handoff verification required");
      child.unref();
      item.pid = String(child.pid);
    } finally { closeSync(logFd); }
    saveState();
    return;
  }
  if (item.executionModel === "navi") {
    // Reserve ownership before spawn: a crash in the spawn/PID-save window
    // must leave an unverified owner, never another launch opportunity.
    item.naviCleanupOwner = createNaviSessionOwner(session.id);
    item.naviSessionGuardian = true;
    item.endCleanupAttempts = 1;
    item.status = "running";
    saveState();
    const localLog = join(runtimeDir, `session-${session.id}.navi.log`);
    const logFd = openSync(localLog, "a");
    try {
      const owner = item.naviCleanupOwner;
      const child = spawn(localPython, [trustedNaviRunner, "--booked-session", item.localPlan, item.end,
        owner.result_file, owner.owner_file, owner.attempt_id], {
        detached: true,
        windowsHide: true,
        stdio: ["ignore", logFd, logFd],
        env: naviEnvironment()
      });
      child.on("error", error => console.error(`[robot-stream] Navi supervisor spawn failed: ${error.message}`));
      if (!child.pid) throw new Error("Navi supervisor did not provide a process identity; ownership recovery required");
      child.unref();
      item.pid = String(child.pid);
      owner.pid = String(child.pid);
      item.localLog = localLog;
    } finally {
      closeSync(logFd);
    }
    item.status = "running";
    saveState();
    console.log(`[robot-stream] trusted Navi SDK runner started for session ${session.id}; PID ${item.pid}.`);
    return;
  }
  const remoteRunner = `${remoteDir}/trusted-robot-runner.py`;
  const remoteLog = `${remoteDir}/session-${session.id}.log`;
  const staleOutputs = [item.remoteExecutionResult, item.remoteResults]
    .filter(Boolean);
  run("ssh", [...sshArgs(), robot, "rm", "-f", ...staleOutputs]);
  const resultsArgument = item.remoteResults ? ` --results '${item.remoteResults}'` : "";
  const finalResultArgument = ` --final-result '${item.remoteExecutionResult}'`;
  const command = `cd '${remoteDir}' && PYTHONPATH=/home/firefly/Agentech-SDK nohup ${robotPython} '${remoteRunner}' '${item.remotePlan}'${resultsArgument}${finalResultArgument} > '${remoteLog}' 2>&1 & echo $!`;
  item.pid = run("ssh", [...sshArgs(), robot, command]).trim();
  item.status = "running";
  saveState();
  console.log(`[robot-stream] trusted runner started for session ${session.id}; PID ${item.pid}.`);
}

async function stopSession(id) {
  const item = state.sessions[id];
  if (item?.executionModel === "master") {
    // Cancel admission only; never terminate the persistent robot owner or
    // replace its held target. The runner independently checks booked expiry.
    if (item.masterCancelFile) writeFileSync(item.masterCancelFile, "booked session ended\n");
    item.status = "finished";
    saveState();
    return;
  }
  if (item?.executionModel === "navi" && item.naviSessionGuardian === true) {
    // The detached supervisor enforces the deadline even if this bridge is
    // blocked or restarted. Do not kill it while it is stopping/resetting.
    item.status = "finished";
    if (item.endCleanupStatus === "pending") item.endCleanupStatus = "running";
    saveState();
    return;
  }
  if (item?.pid && item.status === "running") {
    if (item.executionModel === "navi") {
      if (processRunning(item)) {
        process.kill(Number(item.pid));
        const deadline = Date.now() + 5000;
        while (processRunning(item) && Date.now() < deadline) await delay(50);
        if (processRunning(item)) throw new Error(`Navi session ${id} runner did not exit; reset blocked`);
      }
      run(localPython, [trustedNaviRunner, "--stop"], { stdio: "ignore", env: naviEnvironment(), timeout: 10000 });
    } else {
      try { run("ssh", [...sshArgs(), robot, "kill", item.pid], { stdio: "ignore" }); } catch {}
    }
  }
  item.status = "finished";
  saveState();
}

function processRunning(item) {
  if (item.executionModel === "navi" || item.executionModel === "master") {
    if (!item.pid || !/^\d+$/.test(String(item.pid))) return false;
    try {
      process.kill(Number(item.pid), 0);
      return true;
    } catch {
      return false;
    }
  }
  try {
    run("ssh", [...sshArgs(), robot, "kill", "-0", String(item.pid)], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function endCleanupCanRun(item) {
  const required = item.endCleanupRequired ?? item.endLieDownRequired;
  const status = item.endCleanupStatus ?? item.endLieDownStatus;
  const attempts = item.endCleanupAttempts ?? item.endLieDownAttempts;
  if (required !== true) return false;
  if (status === "completed") return false;
  if (item.executionModel === "navi" && (item.naviCleanupOwner || status === "running")) return true;
  return Number(attempts || 0) < 3;
}

function reconcileNaviCleanup(item) {
  const owner = item.naviCleanupOwner;
  if (!owner) return {status:"unknown",error:"Persisted Navi cleanup has no recoverable process identity"};
  let outcome;
  try { outcome = JSON.parse(readFileSync(owner.result_file,"utf8")); } catch {}
  if (owner.pid && processRunning({executionModel:"navi",pid:owner.pid})) {
    return reconcileNaviCleanupOutcome(owner,true,outcome);
  }
  let metadata;
  try { metadata = JSON.parse(readFileSync(owner.owner_file,"utf8")); } catch {}
  if (!owner.pid || metadata?.attempt_id !== owner.attempt_id
      || ["starting","starting_cleanup"].includes(metadata.phase)) {
    return reconcileNaviCleanupOutcome(owner,null,outcome);
  }
  for (const pid of [metadata.program_pid,metadata.cleanup_pid]) {
    if (pid && processRunning({executionModel:"navi",pid})) return reconcileNaviCleanupOutcome(owner,true,outcome);
  }
  return reconcileNaviCleanupOutcome(owner,false,outcome);
}

function finishSessionCleanup(id, item) {
  if (!endCleanupCanRun(item)) return;
  if (item.executionModel === "navi" && (item.naviCleanupOwner || item.endCleanupStatus === "running")) {
    const recovered = reconcileNaviCleanup(item);
    if (["running","unknown"].includes(recovered.status)) {
      item.endCleanupStatus = "running";
      if (recovered.error) item.endCleanupError = recovered.error;
      saveState();
      return;
    }
    item.endCleanupStatus = recovered.status;
    if (recovered.status === "completed") {
      item.endCleanupResult = recovered.result;
      state.naviResetVerifiedAt = recovered.verified_at;
      state.naviResetResult = recovered.result;
      delete item.endCleanupError;
    } else item.endCleanupError = recovered.error;
    delete item.naviCleanupOwner;
    saveState();
    return; // Failed known owner becomes eligible for retry on the next tick.
  }
  if (item.executionModel === "navi") {
    // A newer trusted reset can supersede this failure without rewriting its
    // history. Admission uses the same baseline, so never retry it afterward.
    let baseline;
    try { baseline = refreshNaviResetBaseline(); } catch {}
    const end = Date.parse(item.end);
    if (Number.isFinite(end) && end <= Date.parse(baseline?.verified_at)) return;
    // The SDK lock ends when a program exits early; the booked guardian still
    // owns its slot. An old cleanup must not acquire that temporarily free lock.
    const now = Date.now();
    const anotherOwner = Object.entries(state.sessions).some(([otherId, other]) => {
      if (String(otherId) === String(id) || other.executionModel !== "navi") return false;
      const otherEnd = Date.parse(other.end);
      return other.naviCleanupOwner || other.endCleanupStatus === "running"
        || ["running", "publishing"].includes(other.status)
        || (other.status === "completed" && (!Number.isFinite(otherEnd) || now < otherEnd));
    });
    if (anotherOwner) return;
  }
  item.endCleanupAttempts = Number(item.endCleanupAttempts ?? item.endLieDownAttempts ?? 0) + 1;
  item.endCleanupStatus = "running";
  delete item.endCleanupError;
  saveState();
  try {
    if (item.executionModel === "navi") {
      if (!item.localPlan) throw new Error("Navi cleanup requires its validated session plan");
      item.naviCleanupOwner = createNaviSessionOwner(id);
      saveState();
      const owner = item.naviCleanupOwner;
      const child = spawn(localPython,[trustedNaviRunner,"--cleanup-supervisor",item.localPlan,
        owner.result_file,owner.owner_file,owner.attempt_id],{
        detached:true,windowsHide:true,stdio:"ignore",env:naviEnvironment()});
      child.on("error",error=>console.error(`[robot-stream] Navi cleanup supervisor failed: ${error.message}`));
      if (!child.pid) throw new Error("Navi cleanup supervisor has unknown process identity");
      owner.pid = String(child.pid);
      child.unref();
      saveState();
      return;
    } else {
      const remoteRunner = `${remoteDir}/trusted-robot-runner.py`;
      const command = `cd '${remoteDir}' && PYTHONPATH=/home/firefly/Agentech-SDK ${robotPython} '${remoteRunner}' --lie-down`;
      run("ssh", [...sshArgs(), robot, command]);
    }
    item.endCleanupStatus = "completed";
    const result = item.executionModel === "navi"
      ? "return-to-home and damping"
      : "lie-down";
    console.log(`[robot-stream] session ${id} reached its booked end; automatic ${result} completed.`);
  } catch (error) {
    item.endCleanupStatus = "failed";
    item.endCleanupError = error.message;
    console.error(
      `[robot-stream] session ${id} automatic cleanup attempt ${item.endCleanupAttempts}/3 failed:`,
      error.message,
    );
  }
  saveState();
}

async function syncFinalSessionStatus(id, item) {
  const databaseStatus = finalSessionDatabaseStatus(item);
  if (!databaseStatus || item.databaseStatus === databaseStatus) return;
  try {
    await request(
      "agentech_robot_sessions",
      `id=eq.${encodeURIComponent(id)}&select=id`,
      { method: "PATCH", body: { session_status: databaseStatus } },
    );
    item.databaseStatus = databaseStatus;
    delete item.databaseStatusError;
    console.log(`[robot-stream] session ${id} synchronized to ${databaseStatus} in Supabase.`);
  } catch (error) {
    item.databaseStatusError = error.message;
    console.error(
      `[robot-stream] unable to synchronize final status for session ${id}:`,
      error.message,
    );
  }
  saveState();
}

function executionErrorMessage(result) {
  if (result?.outcome !== "failed") return null;
  const error = result.error || {};
  const location = error.command_index
    ? ` at command ${error.command_index}${error.command ? ` (${error.command})` : ""}`
    : error.command
      ? ` during ${error.command}`
      : "";
  return `${error.type || "ExecutionError"}: ${error.message || "runner reported failure"}${location}`
    .slice(0, 4000);
}

function collectExecutionResult(id, item) {
  if (masterReceiptNeedsReload(item)) {
    item.masterReceiptSizeVersion = 2;
    item.executionResultCollectionAttempted = false;
    item.executionResultPersisted = false;
  }
  if (
    item.executionResultRequired !== true
    || item.executionResultCollectionAttempted === true
  ) return;
  // A Master runner may still be finalizing its receipt.
  // Do not race a live writer; after runner exit, missing evidence fails closed.
  if ((item.executionModel === "master") && item.localExecutionResult
      && !existsSync(item.localExecutionResult) && item.pid && processRunning(item)) return;
  item.executionResultCollectionAttempted = true;
  try {
    const localResult = (item.executionModel === "master") ? item.localExecutionResult
      : join(runtimeDir, `session-${id}.execution.json`);
    if (!(item.executionModel === "master")) {
      run("scp", [...sshArgs(), `${robot}:${item.remoteExecutionResult}`, localResult]);
    }
    const parseResult = item.executionModel === "master" ? parseMasterExecutionResult : parseExecutionResult;
    item.executionResult = parseResult(readFileSync(localResult, "utf8"), {
      sessionId: id,
      submissionId: item.executionSubmissionId,
      sourceSha256: item.executionSourceSha256,
      planSha256: item.executionPlanSha256,
      attemptId: item.executionAttemptId,
      bookedEnd: item.end,
    });
    item.executionStatus = item.executionResult.outcome;
    if (item.executionModel === "master") item.masterHandoffReady = item.executionResult.handoff_ready === true;
    item.executionResultError = executionErrorMessage(item.executionResult);
    console.log(
      `[robot-stream] collected authoritative ${item.executionStatus} result for session ${id}.`,
    );
  } catch (error) {
    item.executionResult = null;
    item.executionStatus = "failed";
    item.executionResultError = `MissingOrInvalidExecutionResult: ${error.message}`.slice(0, 4000);
    console.error(
      `[robot-stream] session ${id} has no trustworthy execution result:`,
      error.message,
    );
  }
  saveState();
}

async function syncExecutionResult(id, item) {
  if (
    item.executionResultRequired !== true
    || item.executionResultCollectionAttempted !== true
    || item.executionResultPersisted === true
  ) return;
  try {
    await request(
      "agentech_robot_sessions",
      `id=eq.${encodeURIComponent(id)}&select=id`,
      { method: "PATCH", body: buildExecutionResultPatch(item) },
    );
    item.executionResultPersisted = true;
    delete item.executionResultPersistenceError;
    console.log(`[robot-stream] synchronized authoritative execution result for session ${id}.`);
  } catch (error) {
    item.executionResultPersistenceError = error.message;
    console.error(
      `[robot-stream] unable to persist execution result for session ${id}; final status remains unsynchronized:`,
      error.message,
    );
  }
  saveState();
}

function collectDeviceResults(id, item) {
  if (item.deviceResultsRequested !== true || item.deviceResultsCollectionAttempted === true) return;
  item.deviceResultsCollectionAttempted = true;
  try {
    const localResults = join(runtimeDir, `session-${id}.results.json`);
    run("scp", [...sshArgs(), `${robot}:${item.remoteResults}`, localResults]);
    item.deviceResults = parseDeviceResults(readFileSync(localResults, "utf8"));
    delete item.deviceResultsError;
    console.log(`[robot-stream] collected ${item.deviceResults.length} device results for session ${id}.`);
  } catch (error) {
    item.deviceResults = [];
    item.deviceResultsError = error.message;
    console.error(`[robot-stream] unable to collect device results for session ${id}:`, error.message);
  }
  saveState();
}

async function syncDeviceResults(id, item) {
  if (
    item.deviceResultsRequested !== true
    || item.deviceResultsCollectionAttempted !== true
    || item.deviceResultsPersisted === true
  ) return;
  try {
    await request(
      "agentech_robot_sessions",
      `id=eq.${encodeURIComponent(id)}&select=id`,
      { method: "PATCH", body: buildDeviceResultsPatch(item) },
    );
    item.deviceResultsPersisted = true;
    delete item.deviceResultsPersistenceError;
    console.log(`[robot-stream] synchronized device results for session ${id} in Supabase.`);
  } catch (error) {
    item.deviceResultsPersistenceError = error.message;
    console.error(
      `[robot-stream] unable to synchronize device results for session ${id}; verify the additive session schema:`,
      error.message,
    );
  }
  saveState();
}

async function publishCaptures(id, item) {
  const remoteCaptures = item.remoteCaptures ?? (item.remoteCapture ? [item.remoteCapture] : []);
  item.publishedCaptures ??= [];
  const token = process.env.ROBOT_RUNNER_SECRET || createHmac("sha256", supabaseKey)
    .update("agentech-capture-upload-v1")
    .digest("hex");
  for (const [index, remoteCapture] of remoteCaptures.entries()) {
    if (item.publishedCaptures.includes(remoteCapture)) continue;
    const localCapture = join(runtimeDir, `session-${id}.capture-${index + 1}.jpg`);
    run("scp", [...sshArgs(), `${robot}:${remoteCapture}`, localCapture]);
    const response = await fetch(captureUploadUrl, {
      signal: AbortSignal.timeout(8000),
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "x-robot-runner-secret": token,
        "Content-Type": "image/jpeg",
        "x-agentech-account-email": item.accountEmail
      },
      body: readFileSync(localCapture)
    });
    if (!response.ok) throw new Error(`capture upload failed: ${await response.text()}`);
    const result = await response.json();
    item.publishedCaptures.push(remoteCapture);
    item.captureIds ??= [];
    item.captureIds.push(result.captureId);
    saveState();
    console.log(`[robot-stream] published display capture ${result.captureId} (${index + 1}/${remoteCaptures.length}) for session ${id}.`);
  }
}

async function tick() {
  const now = Date.now();
  const endingSessions = new Set();
  for (const [id, item] of Object.entries(state.sessions)) {
    if (["running", "completed", "publishing"].includes(item.status) && now >= Date.parse(item.end)) {
      await stopSession(id);
      endingSessions.add(id);
    }
    if (item.status === "staged" && now >= Date.parse(item.end)) {
      item.status = "finished";
      item.streamAvailableDuringSession = false;
      item.endCleanupRequired = false;
      item.endCleanupStatus = "not_started";
      saveState();
    }
    if (item.status === "finished" && now >= Date.parse(item.end) && endCleanupCanRun(item)) {
      endingSessions.add(id);
    }
  }
  // Local physical cleanup must not depend on the cloud or launch a second owner.
  for (const id of endingSessions) {
    const item = state.sessions[id];
    finishSessionCleanup(id, item);
  }
  const active = Object.values(state.sessions).some((item) => keepsStreamActive(item, Date.now()));
  if (!active) {
    try { await stopObs(); }
    catch (error) { console.error("[robot-stream] stream stop failed:", error.message); }
  }
  for (const [id, item] of Object.entries(state.sessions)) {
    const captures = item.remoteCaptures ?? (item.remoteCapture ? [item.remoteCapture] : []);
    const pendingCaptures = captures.some(capture => !(item.publishedCaptures ?? []).includes(capture));
    const expiredCaptures = item.status === "finished" && item.pid && pendingCaptures
      && item.capturePublishingError == null;
    if ((item.status === "running" || expiredCaptures) && !processRunning(item)) {
      // Expiry cleanup runs first, but a runner first observed after expiry can
      // still have captures to deliver. Publication must retain its final state.
      const afterPublication = item.status === "finished" ? "finished" : "completed";
      item.status = "publishing";
      saveState();
      collectExecutionResult(id, item);
      try {
        await publishCaptures(id, item);
      } catch (error) {
        item.capturePublishingError = error.message;
        console.error(`[robot-stream] session ${id} capture publishing failed:`, error.message);
      }
      item.status = afterPublication;
      saveState();
    }
    if (["completed", "finished"].includes(item.status)) collectExecutionResult(id, item);
    await syncExecutionResult(id, item);
    if (["completed", "finished"].includes(item.status)) collectDeviceResults(id, item);
    await syncDeviceResults(id, item);
    if (item.status === "finished") await syncFinalSessionStatus(id, item);
  }
  const sessions = await dueSessions();
  for (const session of sessions) {
    if (!state.sessions[session.id]) {
      const submission = await reviewedSubmission(session);
      stage(session, submission);
    }
    const item = state.sessions[session.id];
    const launchNow = Date.now();
    if (launchNow >= Date.parse(item.end)) continue;
    const streamReady = await ensureSessionStream(session.id, item, launchNow);
    if (streamReady && item.status === "staged" && Date.now() < Date.parse(item.end)
        && Date.now() >= Date.parse(session.scheduled_start)) await launch(session);
  }
  if (!Object.values(state.sessions).some((item) => keepsStreamActive(item, Date.now()))) await stopObsVirtualCamera();
}

console.log(`[robot-stream] Standalone trusted command gateway running for Aegies ${robot} and Navi ${naviHost}:${naviPort}; customer source is never sent to the robot. Navi receives only exact SDK calls from an inert plan.`);
let tickInProgress = false;
async function guardedTick() {
  if (tickInProgress) return;
  tickInProgress = true;
  try {
    await tick();
  } catch (error) {
    console.error("[robot-stream] tick failed:", error.message);
  } finally {
    tickInProgress = false;
  }
}

await guardedTick();
setInterval(() => void guardedTick(), pollMs);
