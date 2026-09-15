import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { closeSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import OBSWebSocket from "obs-websocket-js";
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
const compiler = join(here, "compile-robot-plan.py");
const trustedRunner = join(here, "trusted-robot-runner.py");
const deviceResultsSerializer = join(here, "aegis-device-results.py");
const gatewaySpec = join(here, "aegis_gateway_spec.py");
const runnerResultSerializer = join(here, "aegis-runner-result.py");
const trustedNaviRunner = join(here, "trusted-navi-runner.py");
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
const agentechSdkRoot = process.env.AGENTECH_SDK_ROOT || "";
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
let state = { sessions: {} };
try { state = JSON.parse(readFileSync(stateFile, "utf8")); } catch {}
let obs;
const obsRecoveryState = { lastAttemptAt: 0 };
const obsRecoveryCooldownMs = 5 * 60 * 1000;

async function obsCall(requestType, requestData) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      if (!obs) {
        obs = new OBSWebSocket();
        await obs.connect(obsUrl, obsPassword);
      }
      return await obs.call(requestType, requestData);
    } catch (error) {
      lastError = error;
      try { await obs?.disconnect(); } catch {}
      obs = undefined;
    }
  }
  throw lastError;
}

function saveState() { writeFileSync(stateFile, JSON.stringify(state, null, 2)); }
function normalized(value) { return String(value || "").replaceAll(" ", "_").toLowerCase(); }
function robotModel(value) {
  const model = normalized(value);
  if (model === "aegis" || model === "aegies" || !model) return "aegis";
  if (model === "navi") return "navi";
  throw new Error(`unsupported robot model: ${value}`);
}
function naviEnvironment() {
  return { ...process.env, AGENTECH_NAVI_HOST: naviHost, AGENTECH_NAVI_PORT: naviPort, AGENTECH_SDK_ROOT: agentechSdkRoot };
}
function sshArgs() { return [...(sshKey ? ["-i", sshKey] : []), "-o", "BatchMode=yes", "-o", "ConnectTimeout=8"]; }
function run(program, args, options = {}) { return execFileSync(program, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options }); }

async function request(table, query, options = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?${query}`, {
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
    const fallbackQuery = `email=eq.${encodeURIComponent(session.email)}&created_at=lte.${cutoff}&physical_safety_status=eq.passed&ai_security_status=eq.passed&select=id,code,robot_model&order=created_at.desc&limit=1`;
    const candidates = await request("agentech_code_submissions", fallbackQuery);
    if (candidates.length !== 1) throw new Error("custom session has no eligible reviewed submission to pin");
    const updated = await request(
      "agentech_robot_sessions",
      `id=eq.${encodeURIComponent(session.id)}&code_submission_id=is.null`,
      { method: "PATCH", body: { code_submission_id: candidates[0].id } }
    );
    if (!updated?.length) throw new Error("unable to atomically pin reviewed submission");
    session.code_submission_id = candidates[0].id;
    console.log(`[robot-stream] pinned reviewed submission ${candidates[0].id} to legacy booking ${session.id}.`);
  }
  const query = `id=eq.${encodeURIComponent(session.code_submission_id)}&email=eq.${encodeURIComponent(session.email)}&physical_safety_status=eq.passed&ai_security_status=eq.passed&select=id,code,robot_model&limit=1`;
  const rows = await request("agentech_code_submissions", query);
  if (rows.length !== 1) throw new Error("pinned submission no longer passes both reviews");
  if (robotModel(rows[0].robot_model) !== robotModel(session.robot_model)) throw new Error("session robot model does not match its reviewed submission");
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
  if (selectedModel === "navi") run(localPython, [compiler, sourcePath, submission.id, "navi", planPath]);
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
    executionResultRequired: selectedModel === "aegis",
    executionResultCollectionAttempted: selectedModel !== "aegis",
    executionResultPersisted: selectedModel !== "aegis",
    executionStatus: selectedModel === "aegis" ? "pending" : null,
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
    `id=eq.${encodeURIComponent(session.id)}&session_status=in.(${statuses})&select=id`,
    { method: "PATCH", body: { session_status: "running" } }
  );
  return claimed?.length === 1;
}

async function launch(session) {
  const item = state.sessions[session.id];
  if (!(await claimSession(session))) {
    item.status = "skipped";
    saveState();
    console.log(`[robot-stream] session ${session.id} was claimed by another gateway; skipping.`);
    return;
  }
  if (item.executionModel === "navi") {
    const localLog = join(runtimeDir, `session-${session.id}.navi.log`);
    const logFd = openSync(localLog, "a");
    try {
      const child = spawn(localPython, [trustedNaviRunner, item.localPlan], {
        detached: true,
        windowsHide: true,
        stdio: ["ignore", logFd, logFd],
        env: naviEnvironment()
      });
      child.unref();
      item.pid = String(child.pid);
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

function stopSession(id) {
  const item = state.sessions[id];
  if (item?.pid && item.status === "running") {
    if (item.executionModel === "navi") {
      try { process.kill(Number(item.pid)); } catch {}
      try { run(localPython, [trustedNaviRunner, "--stop"], { stdio: "ignore", env: naviEnvironment() }); } catch {}
    } else {
      try { run("ssh", [...sshArgs(), robot, "kill", item.pid], { stdio: "ignore" }); } catch {}
    }
  }
  item.status = "finished";
  saveState();
}

function processRunning(item) {
  if (item.executionModel === "navi") {
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
  return Number(attempts || 0) < 3;
}

function finishSessionCleanup(id, item) {
  if (!endCleanupCanRun(item)) return;
  item.endCleanupAttempts = Number(item.endCleanupAttempts ?? item.endLieDownAttempts ?? 0) + 1;
  item.endCleanupStatus = "running";
  delete item.endCleanupError;
  saveState();
  try {
    if (item.executionModel === "navi") {
      const mode = item.endReturnHomeRequired === false ? "--damp" : "--return-home-and-damp";
      run(localPython, [trustedNaviRunner, mode], { env: naviEnvironment() });
    } else {
      const remoteRunner = `${remoteDir}/trusted-robot-runner.py`;
      const command = `cd '${remoteDir}' && PYTHONPATH=/home/firefly/Agentech-SDK ${robotPython} '${remoteRunner}' --lie-down`;
      run("ssh", [...sshArgs(), robot, command]);
    }
    item.endCleanupStatus = "completed";
    const result = item.executionModel === "navi"
      ? (item.endReturnHomeRequired === false ? "damping" : "return-to-home and damping")
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
  if (
    item.executionResultRequired !== true
    || item.executionResultCollectionAttempted === true
  ) return;
  item.executionResultCollectionAttempted = true;
  try {
    const localResult = join(runtimeDir, `session-${id}.execution.json`);
    run("scp", [...sshArgs(), `${robot}:${item.remoteExecutionResult}`, localResult]);
    item.executionResult = parseExecutionResult(readFileSync(localResult, "utf8"), {
      sessionId: id,
      submissionId: item.executionSubmissionId,
      sourceSha256: item.executionSourceSha256,
      planSha256: item.executionPlanSha256,
    });
    item.executionStatus = item.executionResult.outcome;
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
  const sessions = await dueSessions();
  for (const session of sessions) {
    if (!state.sessions[session.id]) {
      const submission = await reviewedSubmission(session);
      stage(session, submission);
    }
    const item = state.sessions[session.id];
    const streamReady = await ensureSessionStream(session.id, item, now);
    if (streamReady && item.status === "staged" && now >= Date.parse(session.scheduled_start)) await launch(session);
  }
  for (const [id, item] of Object.entries(state.sessions)) {
    if (item.status === "running" && !processRunning(item)) {
      item.status = "publishing";
      saveState();
      collectExecutionResult(id, item);
      try {
        await publishCaptures(id, item);
      } catch (error) {
        item.capturePublishingError = error.message;
        console.error(`[robot-stream] session ${id} capture publishing failed:`, error.message);
      }
      item.status = "completed";
      saveState();
    }
    if (item.status === "staged" && now >= Date.parse(item.end)) {
      item.status = "finished";
      item.streamAvailableDuringSession = false;
      item.endCleanupRequired = false;
      item.endCleanupStatus = "not_started";
      saveState();
    }
    if (["running", "completed"].includes(item.status) && now >= Date.parse(item.end)) {
      stopSession(id);
      endingSessions.add(id);
    }
    if (item.status === "finished" && now >= Date.parse(item.end) && endCleanupCanRun(item)) {
      endingSessions.add(id);
    }
  }
  for (const [id, item] of Object.entries(state.sessions)) {
    if (["completed", "finished"].includes(item.status)) collectExecutionResult(id, item);
    await syncExecutionResult(id, item);
    if (["completed", "finished"].includes(item.status)) collectDeviceResults(id, item);
    await syncDeviceResults(id, item);
  }
  const active = Object.values(state.sessions).some((item) => keepsStreamActive(item, now));
  if (!active) await stopObs();
  for (const id of endingSessions) {
    const item = state.sessions[id];
    finishSessionCleanup(id, item);
    await syncFinalSessionStatus(id, item);
  }
  for (const [id, item] of Object.entries(state.sessions)) {
    if (item.status === "finished") await syncFinalSessionStatus(id, item);
  }
  if (!active) await stopObsVirtualCamera();
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
