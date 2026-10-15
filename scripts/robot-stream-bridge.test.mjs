import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  endSessionCleanupPolicy,
  finalSessionDatabaseStatus,
  keepsStreamActive,
  requiresEndLieDown,
} from "./robot-stream-session-policy.mjs";

const scriptsDir = fileURLToPath(new URL(".", import.meta.url));
const compiler = join(scriptsDir, "compile-robot-plan.py");
const bridge = join(scriptsDir, "robot-stream-bridge.mjs");
const gatewayRestart = join(scriptsDir, "restart-robot-stream-gateway.ps1");
const obsLauncher = join(scriptsDir, "ensure-obs-running.ps1");
const watchdog = join(scriptsDir, "robot-stream-watchdog.ps1");
const watchdogLoop = join(scriptsDir, "robot-stream-watchdog-loop.ps1");
const qualificationExample = join(scriptsDir, "..", "docs", "aegis", "examples", "aegis-29-command-qualification.py");
const naviRunner = join(scriptsDir, "trusted-navi-runner.py");
const python = process.env.ROBOT_LOCAL_PYTHON || (process.platform === "win32" ? "python" : "python3");

function compile(source, robotModel) {
  const directory = mkdtempSync(join(tmpdir(), "agentech-plan-"));
  const sourcePath = join(directory, "reviewed.py");
  const planPath = join(directory, "plan.json");
  writeFileSync(sourcePath, source, "utf8");
  const args = [compiler, sourcePath, "submission-test"];
  if (robotModel) args.push(robotModel);
  args.push(planPath);
  const result = spawnSync(python, args, { encoding: "utf8" });
  return {
    status: result.status,
    stderr: result.stderr,
    plan: result.status === 0 ? JSON.parse(readFileSync(planPath, "utf8")) : null,
  };
}

test("compiler turns literal Agentech calls into an inert plan", () => {
  const source = [
    "from agentech import Agentech",
    "Agentech.stand()",
    "Agentech.forward(speed_mps=0.3, duration_s=1.0)",
    "Agentech.capture_image(output=\"capture.jpg\", source=\"default\")"
  ].join("\n");
  const result = compile(source);
  assert.equal(result.status, 0);
  const { plan } = result;

  assert.equal(plan.version, 2);
  assert.equal(plan.robot_model, "aegis");
  assert.equal(plan.submission_id, "submission-test");
  assert.equal(plan.source_sha256, createHash("sha256").update(source).digest("hex"));
  assert.deepEqual(plan.commands.map(({ name }) => name), ["stand", "forward", "capture_image"]);
  assert.equal("source" in plan, false);
});

test("Aegies compiler accepts body sensing, hold, and live-proven battery telemetry", () => {
  const source = [
    "from agentech import Agentech",
    "Agentech.stay(duration_s=1.0)",
    "Agentech.get_body_state()",
    "Agentech.capture_image(output=\"capture.jpg\", source=\"default\")"
  ].join("\n");
  const result = compile(source);
  assert.equal(result.status, 0);
  const { plan } = result;

  assert.deepEqual(plan.commands, [
    { name: "stay", args: { duration_s: 1 }, line: 2 },
    { name: "get_body_state", args: {}, line: 3 },
    { name: "capture_image", args: { output: "capture.jpg", source: "default" }, line: 4 }
  ]);

  const battery = compile("from agentech import Agentech\nAgentech.get_battery_status()\n");
  assert.equal(battery.status, 0, battery.stderr);
  assert.deepEqual(battery.plan.commands, [
    { name: "get_battery_status", args: {}, line: 2 },
  ]);
  assert.equal(battery.plan.device_profile.battery_present, true);
});

test("Aegies compiler rejects session 37 diagonal before staging", () => {
  const result = compile(
    "from agentech import Agentech\nAgentech.diagonal(angle_deg=45, speed_mps=0.10, duration_s=0.50)\n",
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /lateral component/);
});

test("Aegies compiler normalizes session 38 left turn and preserves source args", () => {
  const result = compile(
    "from agentech import Agentech\nAgentech.turn(angle_deg=-10, turn_rate_deg_s=-10)\n",
  );
  assert.equal(result.status, 0);
  assert.deepEqual(result.plan.commands[0], {
    name: "turn",
    args: { angle_deg: -10, turn_rate_deg_s: 10 },
    source_args: { angle_deg: -10, turn_rate_deg_s: -10 },
    line: 2,
  });
});

test("committed corrected AEGIS qualification source compiles to exactly 29 commands", () => {
  const source = readFileSync(qualificationExample, "utf8");
  const result = compile(source);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.plan.commands.length, 29);
  assert.equal(result.plan.commands[19].name, "turn");
  assert.deepEqual(result.plan.commands[19].args, {
    angle_deg: -90,
    turn_rate_deg_s: 60,
  });
  assert.equal(result.plan.commands[27].name, "get_battery_status");
  assert.equal(result.plan.device_profile.battery_present, true);
});

test("Session 43 compiles to the exact ordered AEGIS plan", () => {
  const source = [
    "from agentech import Agentech",
    "Agentech.stand()",
    "Agentech.squat()",
    "Agentech.squat_forward(speed_mps=0.20, duration_s=0.75)",
    "Agentech.squat_backward(speed_mps=0.20, duration_s=0.75)",
    "Agentech.squat_lateral(direction=\"left\", speed_mps=0.20, duration_s=0.75)",
    "Agentech.squat_diagonal(angle_deg=45, speed_mps=0.30, duration_s=0.75)",
    "Agentech.squat_turn(angle_deg=30)",
    "Agentech.sit()",
    "Agentech.emergency_stop()",
  ].join("\n");
  const result = compile(source, "Aegis");

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.plan.commands, [
    { name: "stand", args: {}, line: 2 },
    { name: "squat", args: {}, line: 3 },
    { name: "squat_forward", args: { speed_mps: 0.2, duration_s: 0.75 }, line: 4 },
    { name: "squat_backward", args: { speed_mps: 0.2, duration_s: 0.75 }, line: 5 },
    { name: "squat_lateral", args: { direction: "left", speed_mps: 0.2, duration_s: 0.75 }, line: 6 },
    { name: "squat_diagonal", args: { angle_deg: 45, speed_mps: 0.3, duration_s: 0.75 }, line: 7 },
    { name: "squat_turn", args: { angle_deg: 30 }, line: 8 },
    { name: "sit", args: {}, line: 9 },
    { name: "emergency_stop", args: {}, line: 10 },
  ]);
  assert.equal(requiresEndLieDown(result.plan, "aegis"), false);
  assert.deepEqual(endSessionCleanupPolicy(result.plan, "aegis"), {
    required: false,
    returnHomeRequired: false,
  });
});

test("Aegies compiler rejects removed website-only battery and IMU names", () => {
  for (const source of [
    "from agentech import Agentech\nAgentech.battery()\n",
    "from agentech import Agentech\nAgentech.imu(freq_hz=5)\n",
  ]) {
    const result = compile(source);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /unapproved command/);
  }
});

test("compiler creates a model-bound Navi plan from exact SDK calls", () => {
  const source = [
    "from agentech import Agentech",
    "Agentech.stand()",
    "Agentech.forward(speed_mps=0.5, duration_s=1.0)",
    "Agentech.wave_hand()"
  ].join("\n");
  const result = compile(source, "Navi");
  assert.equal(result.status, 0);
  const { plan } = result;

  assert.equal(plan.version, 2);
  assert.equal(plan.robot_model, "navi");
  assert.deepEqual(plan.commands.map(({ name }) => name), ["stand", "forward", "wave_hand"]);
  execFileSync(python, [naviRunner, "--validate", writePlan(plan)]);
});

function writePlan(plan) {
  const directory = mkdtempSync(join(tmpdir(), "agentech-navi-plan-"));
  const planPath = join(directory, "plan.json");
  writeFileSync(planPath, JSON.stringify(plan), "utf8");
  return planPath;
}

test("Navi compiler rejects Aegies-only capture commands", () => {
  const result = compile("from agentech import Agentech\nAgentech.capture_image(output=\"capture.jpg\", source=\"default\")\n", "Navi");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /not approved/);
});

test("Navi compiler accepts only cardinal return-to-home headings", () => {
  const source = [
    "from agentech import Agentech",
    "Agentech.return_to_home(facing_angle_deg=270)"
  ].join("\n");
  const result = compile(source, "Navi");
  assert.equal(result.status, 0);
  const { plan } = result;

  assert.deepEqual(plan.commands, [
    { name: "return_to_home", args: { facing_angle_deg: 270 }, line: 2 }
  ]);
  execFileSync(python, [naviRunner, "--validate", writePlan(plan)]);
  const rejected = compile(
    "from agentech import Agentech\nAgentech.return_to_home(facing_angle_deg=45)\n",
    "Navi"
  );
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /must be 0, 90, 180, or 270/);
});

test("compiler rejects loops and nonliteral customer execution", () => {
  const result = compile("for _ in range(2):\n    Agentech.forward(speed_mps=0.3, duration_s=1.0)\n");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /only direct robot command calls are executable/);
});

test("gateway transfers only trusted runtime files and persists authoritative results", () => {
  const source = readFileSync(bridge, "utf8");
  assert.match(source, /gatewaySpec/);
  assert.match(source, /runnerResultSerializer/);
  assert.doesNotMatch(source, /run\("scp", \[\.\.\.sshArgs\(\), sourcePath,/);
  assert.match(source, /customer source is never sent to the robot/);
  assert.match(source, /async function claimSession/);
  assert.match(source, /spawn\(localPython, \[trustedNaviRunner, "--booked-session", item\.localPlan, item\.end/);
  assert.match(source, /"--cleanup-supervisor"/);
  assert.doesNotMatch(source, /"--damp"/);
  assert.match(source, /naviLaunchBlocker\(state.sessions/);
  assert.match(source, /reconcileNaviCleanupOutcome\(owner/);
  assert.match(source, /"--check-home-ready"/);
  assert.match(source, /await stopObs\(\)/);
  assert.match(source, /await stopObsVirtualCamera\(\)/);
  assert.doesNotMatch(source, /readFileSync\(item\.localPlan/);
  assert.match(source, /session robot model does not match its reviewed submission/);
  assert.match(source, /remoteResults/);
  assert.match(source, /collectDeviceResults/);
  assert.match(source, /syncDeviceResults/);
  assert.match(source, /buildDeviceResultsPatch/);
  assert.match(source, /remoteExecutionResult/);
  assert.match(source, /const staleOutputs = \[item\.remoteExecutionResult, item\.remoteResults\]/);
  assert.match(source, /"rm", "-f", \.\.\.staleOutputs/);
  assert.match(source, /collectExecutionResult/);
  assert.match(source, /syncExecutionResult/);
  assert.match(source, /parseExecutionResult/);
  assert.match(source, /buildExecutionResultPatch/);
});

test("Gateway restart is process-only and OBS ownership fails closed", () => {
  const restartSource = readFileSync(gatewayRestart, "utf8");
  const obsSource = readFileSync(obsLauncher, "utf8");
  const watchdogSource = readFileSync(watchdog, "utf8");
  const watchdogLoopSource = readFileSync(watchdogLoop, "utf8");
  const combined = [restartSource, obsSource, watchdogSource, watchdogLoopSource].join("\n");

  assert.match(restartSource, /restart-robot-stream-bridge\.ps1/);
  assert.match(restartSource, /ConfirmNoDueSession/);
  assert.doesNotMatch(restartSource, /obs64|CamoStudio/i);
  assert.doesNotMatch(combined, /Restart-Computer|Stop-Computer|shutdown\.exe|shutdown\s+\/r/i);
  assert.match(obsSource, /More than one OBS process is running/);
  assert.match(watchdogSource, /Select-Object -Skip 1/);
  assert.match(watchdogLoopSource, /Select-Object -Skip 1/);
});

test("stream bridge uses a bounded one-second default poll without changing OBS encoding", () => {
  const source = readFileSync(bridge, "utf8");
  assert.match(source, /ROBOT_STREAM_POLL_MS \|\| 1000/);
  assert.match(source, /Math\.min\(60000, Math\.max\(500,/);
  assert.doesNotMatch(source, /SetVideoSettings|SetStreamServiceSettings|SetProfileParameter/);
});

test("session policy selects model-specific scheduled-end cleanup", () => {
  assert.equal(requiresEndLieDown({ commands: [{ name: "stand" }] }, "navi"), true);
  assert.equal(
    requiresEndLieDown({ commands: [{ name: "lie_down" }, { name: "wave_hand" }] }, "navi"),
    true,
  );
  assert.equal(requiresEndLieDown({ commands: [{ name: "lie_down" }] }, "navi"), false);
  assert.equal(requiresEndLieDown({ commands: [{ name: "sit" }] }, "aegis"), false);
  assert.equal(
    requiresEndLieDown({ commands: [{ name: "sit" }, { name: "emergency_stop" }] }, "aegis"),
    false,
  );
  assert.deepEqual(
    endSessionCleanupPolicy({ commands: [{ name: "stand" }] }, "navi"),
    { required: true, returnHomeRequired: true },
  );
  assert.deepEqual(
    endSessionCleanupPolicy(
      { commands: [{ name: "return_to_home" }, { name: "wave_hand" }] },
      "navi",
    ),
    { required: true, returnHomeRequired: true },
  );
  assert.deepEqual(
    endSessionCleanupPolicy({ commands: [{ name: "sit" }] }, "aegis"),
    { required: false, returnHomeRequired: false },
  );
  assert.equal(
    keepsStreamActive(
      { status: "completed", end: "2026-07-20T20:05:00Z" },
      Date.parse("2026-07-20T20:04:59Z"),
    ),
    true,
  );
  assert.equal(
    keepsStreamActive(
      { status: "completed", end: "2026-07-20T20:05:00Z" },
      Date.parse("2026-07-20T20:05:00Z"),
    ),
    false,
  );
});

test("session policy publishes AEGIS status only from persisted runner outcome", () => {
  assert.equal(finalSessionDatabaseStatus({ status: "running" }), null);
  assert.equal(
    finalSessionDatabaseStatus({
      status: "finished",
      executionResultRequired: true,
      executionResultPersisted: true,
      executionStatus: "completed",
      streamAvailableDuringSession: true,
      endCleanupRequired: true,
      endCleanupStatus: "failed",
      endCleanupAttempts: 3,
    }),
    "completed",
  );
  assert.equal(
    finalSessionDatabaseStatus({
      status: "finished",
      executionResultRequired: true,
      executionResultPersisted: true,
      executionStatus: "failed",
      streamAvailableDuringSession: true,
    }),
    "failed",
  );
  assert.equal(
    finalSessionDatabaseStatus({
      status: "finished",
      executionResultRequired: true,
      executionResultPersisted: false,
      executionStatus: "completed",
    }),
    null,
  );
  assert.equal(
    finalSessionDatabaseStatus({
      status: "finished",
      executionResultRequired: true,
      executionResultPersisted: true,
    }),
    "failed",
  );
});

test("legacy non-AEGIS sessions retain stream-delivery status", () => {
  assert.equal(
    finalSessionDatabaseStatus({
      status: "finished",
      executionResultRequired: false,
      streamAvailableDuringSession: true,
    }),
    "completed",
  );
  assert.equal(
    finalSessionDatabaseStatus({
      status: "finished",
      executionResultRequired: false,
      streamAvailableDuringSession: false,
    }),
    "failed",
  );
});
