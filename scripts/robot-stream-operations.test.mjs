import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptsDir = fileURLToPath(new URL(".", import.meta.url));

function readScript(name) {
  return readFileSync(join(scriptsDir, name), "utf8");
}

test("Gateway restart is process-only and fails closed around robot execution", () => {
  const processHelper = readScript("robot-stream-process.ps1");
  const restart = readScript("restart-robot-stream-bridge.ps1");

  assert.match(processHelper, /Get-RobotStreamBridgeProcess/);
  assert.match(processHelper, /Get-CommandLineTokens/);
  assert.match(processHelper, /GetFullPath/);
  assert.match(restart, /ConfirmNoDueSession/);
  assert.match(restart, /\.robot-stream-runtime/);
  assert.match(restart, /Get-RobotStreamRestartBlockers\s+-State\s+\$state/);
  assert.match(processHelper, /executionStatus/);
  assert.match(restart, /trusted-robot-runner\.py/);
  assert.match(restart, /trusted-navi-runner\.py/);
  assert.match(restart, /Stop-Process\s+-Id\s+\$oldBridge\.ProcessId/);
  assert.match(restart, /RestartTimeoutSeconds/);
  assert.doesNotMatch(
    `${processHelper}\n${restart}`,
    /\b(?:shutdown(?:\.exe)?|Restart-Computer|Stop-Computer|Win32Shutdown)\b/i,
  );
});

test("all Gateway watchdogs identify only the exact configured bridge path", () => {
  for (const name of ["robot-stream-watchdog.ps1", "robot-stream-watchdog-loop.ps1"]) {
    const source = readScript(name);
    assert.match(source, /robot-stream-process\.ps1/);
    assert.match(source, /Get-RobotStreamBridgeProcess\s+-BridgeScript\s+\$bridgeScript/);
    assert.doesNotMatch(source, /CommandLine\s+-like\s+"\*robot-stream-bridge\.mjs\*"/);
  }
});

test("OBS tuning preserves low-latency encoder controls and lowers delivery load", () => {
  const source = readScript("configure-robot-stream-low-latency.ps1");
  const statusProbe = readScript("obs-stream-status.mjs");
  const ensureObs = readScript("ensure-obs-running.ps1");

  assert.match(source, /OutputCX=1280/);
  assert.match(source, /OutputCY=720/);
  assert.match(source, /FPSCommon=30/);
  assert.match(source, /bitrate\s*=\s*3500/);
  assert.match(source, /keyint_sec\s*=\s*1/);
  assert.match(source, /preset\s*=\s*"p3"/);
  assert.match(source, /tune\s*=\s*"ull"/);
  assert.match(source, /NotePropertyName\s+"bf"\s+-NotePropertyValue\s+0/);
  assert.match(source, /lookahead\s*=\s*\$false/);
  assert.match(source, /Copy-Item/);
  assert.match(statusProbe, /GetStreamStatus/);
  assert.match(statusProbe, /GetRecordStatus/);
  assert.match(source, /outputActive/);
  assert.match(source, /recordOutputActive/);
  assert.match(source, /\$obsPid\s*=\s*\[int\]/);
  assert.match(source, /Stop-Process\s+-Id\s+\$obsPid/);
  assert.match(source, /\$stopDeadline/);
  assert.match(source, /Win32_Process/);
  assert.match(source, /PSObject\.Properties\.Name\s+-contains\s+"settings"/);
  assert.match(source, /function Start-ObsNormally/);
  assert.match(source, /catch\s*\{[\s\S]*Start-ObsNormally/);
  assert.match(source, /\.sentinel/);
  assert.match(ensureObs, /\.sentinel/);
  assert.match(source, /GetDirectoryName/);
  assert.match(source, /Remove-Item[^\n]+-Recurse/);
  assert.match(ensureObs, /GetDirectoryName/);
  assert.match(ensureObs, /Remove-Item[^\n]+-Recurse/);
  assert.doesNotMatch(source, /StartStream|StartRecord/);
});
