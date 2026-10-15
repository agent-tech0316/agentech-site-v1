import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const helperPath = fileURLToPath(new URL("robot-stream-process.ps1", import.meta.url));
const bridge = String.raw`C:\Gateway With Spaces\scripts\robot-stream-bridge.mjs`;
const runner = String.raw`C:\Gateway With Spaces\scripts\trusted-navi-runner.py`;
const watchdog = String.raw`C:\Gateway With Spaces\scripts\robot-stream-watchdog-loop.ps1`;
const now = "2026-10-14T12:00:00Z";
const past = "2026-10-14T11:00:00Z";
const future = "2026-10-14T13:00:00Z";

function inspectFixtures(kind, fixtures) {
  const command = `
$ErrorActionPreference = 'Stop'
function Get-CimInstance { throw 'Live process inspection is forbidden in this test.' }
function Stop-Process { throw 'Stopping processes is forbidden in this test.' }
function Start-Process { throw 'Starting operational processes is forbidden in this test.' }
$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($env:AGENTECH_PROCESS_TEST_HELPER, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw ($parseErrors | Out-String) }
$definitions = $ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $false)
foreach ($definition in $definitions) { Invoke-Expression $definition.Extent.Text }
$payload = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:AGENTECH_PROCESS_TEST_FIXTURES)) | ConvertFrom-Json
$results = @(foreach ($fixture in $payload.fixtures) {
  try {
    if ($payload.kind -eq 'identity') {
      $value = Test-CommandLineArgumentPath -CommandLine $fixture.command -ExpectedPath $fixture.expectedPath
    } else {
      $blockers = @(Get-RobotStreamRestartBlockers -State $fixture.state -Now ([DateTimeOffset]::Parse($payload.now)))
      $value = $blockers.Count -eq 0
    }
    [pscustomobject]@{ name = $fixture.name; value = [bool]$value; error = $null }
  } catch {
    [pscustomobject]@{ name = $fixture.name; value = $false; error = $_.Exception.Message }
  }
})
ConvertTo-Json -InputObject $results -Depth 10 -Compress
`;
  const result = spawnSync(process.platform === "win32" ? "powershell.exe" : "pwsh", [
    "-NoProfile", "-NonInteractive", "-Command", command,
  ], {
    encoding: "utf8",
    timeout: 20_000,
    windowsHide: true,
    env: {
      ...process.env,
      AGENTECH_PROCESS_TEST_HELPER: helperPath,
      AGENTECH_PROCESS_TEST_FIXTURES: Buffer.from(JSON.stringify({ kind, fixtures, now })).toString("base64"),
    },
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim());
}

test("identifies absolute entry scripts with supported runtime flags", () => {
  const fixtures = [
    { name: "quoted Node executable and script", command: `"C:\\Program Files\\nodejs\\node.exe" "${bridge}"`, expectedPath: bridge },
    { name: "Node warning flags", command: `node.exe --no-warnings --enable-source-maps "${bridge}" --session 7`, expectedPath: bridge },
    { name: "Node preload argument", command: `node.exe --require C:\\tools\\preload.cjs --inspect=127.0.0.1:9229 "${bridge}"`, expectedPath: bridge },
    { name: "Node explicit end of options", command: `node.exe -- "${bridge}"`, expectedPath: bridge },
    { name: "case insensitive script path", command: `node.exe "${bridge.toUpperCase()}"`, expectedPath: bridge },
    { name: "Python flags with values", command: `python.exe -u -B -X utf8 -W default "${runner}" --booked-session plan.json`, expectedPath: runner },
    { name: "Python versioned executable", command: `python3.10.exe -I "${runner}"`, expectedPath: runner },
    { name: "Python launcher version selector", command: `py.exe -3.10 -u "${runner}"`, expectedPath: runner },
    { name: "PowerShell File entry", command: `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "${watchdog}"`, expectedPath: watchdog },
    { name: "PowerShell 7 File entry", command: `pwsh.exe -NoLogo -File "${watchdog}" -Verbose`, expectedPath: watchdog },
  ];
  for (const result of inspectFixtures("identity", fixtures)) {
    assert.equal(result.error, null, result.name);
    assert.equal(result.value, true, result.name);
  }
});

test("rejects data arguments, eval modes, relative paths, and unknown flags", () => {
  const fixtures = [
    { name: "Node script path is a data argument", command: `node.exe C:\\tools\\validate.mjs "${bridge}"`, expectedPath: bridge },
    { name: "Node preload is not its entry script", command: `node.exe --require "${bridge}" C:\\tools\\validate.mjs`, expectedPath: bridge },
    { name: "Node eval", command: `node.exe -e "console.log(1)" "${bridge}"`, expectedPath: bridge },
    { name: "Node inline eval", command: `node.exe --eval=1 "${bridge}"`, expectedPath: bridge },
    { name: "Node syntax check", command: `node.exe --check "${bridge}"`, expectedPath: bridge },
    { name: "Node unknown flag", command: `node.exe --unknown "${bridge}"`, expectedPath: bridge },
    { name: "relative script path", command: "node.exe scripts\\robot-stream-bridge.mjs", expectedPath: bridge },
    { name: "drive relative script path", command: "node.exe C:robot-stream-bridge.mjs", expectedPath: bridge },
    { name: "relative expected path", command: `node.exe "${bridge}"`, expectedPath: "scripts\\robot-stream-bridge.mjs" },
    { name: "unbalanced quotes", command: `node.exe "${bridge}`, expectedPath: bridge },
    { name: "path suffix differs", command: `node.exe "${bridge}.backup"`, expectedPath: bridge },
    { name: "Python script path is a data argument", command: `python.exe C:\\tools\\validate.py "${runner}"`, expectedPath: runner },
    { name: "Python command mode", command: `python.exe -c "pass" "${runner}"`, expectedPath: runner },
    { name: "Python module mode", command: `python.exe -m module "${runner}"`, expectedPath: runner },
    { name: "Python unknown flag", command: `python.exe --unknown "${runner}"`, expectedPath: runner },
    { name: "PowerShell command mode", command: `powershell.exe -Command "${watchdog}"`, expectedPath: watchdog },
    { name: "PowerShell encoded command", command: `powershell.exe -EncodedCommand YQ== "${watchdog}"`, expectedPath: watchdog },
    { name: "PowerShell requires File", command: `powershell.exe "${watchdog}"`, expectedPath: watchdog },
    { name: "PowerShell unknown flag", command: `powershell.exe -Unknown -File "${watchdog}"`, expectedPath: watchdog },
    { name: "unknown executable", command: `other.exe "${bridge}"`, expectedPath: bridge },
  ];
  for (const result of inspectFixtures("identity", fixtures)) {
    assert.equal(result.error, null, result.name);
    assert.equal(result.value, false, result.name);
  }
});

function finishedSession(overrides = {}) {
  return {
    status: "finished", end: past, executionModel: "aegis", executionStatus: "completed",
    endCleanupRequired: true, endCleanupStatus: "completed", ...overrides,
  };
}

test("allows settled history and expired AEGIS sessions that never started", () => {
  const fixtures = [
    { name: "empty session history", state: { sessions: {} } },
    { name: "completed AEGIS cleanup", state: { sessions: { a: finishedSession() } } },
    { name: "completed Navi cleanup", state: { sessions: { a: finishedSession({ executionModel: "navi", executionStatus: null }) } } },
    { name: "expired never-started AEGIS", state: { sessions: { a: finishedSession({ executionStatus: "pending", endCleanupRequired: false, endCleanupStatus: "not_started" }) } } },
    { name: "cleanup unnecessary", state: { sessions: { a: finishedSession({ endCleanupRequired: false, endCleanupStatus: "not_required" }) } } },
    { name: "legacy completed cleanup", state: { sessions: { a: { status: "finished", end: past, endLieDownRequired: true, endLieDownStatus: "completed" } } } },
  ];
  for (const result of inspectFixtures("state", fixtures)) {
    assert.equal(result.error, null, result.name);
    assert.equal(result.value, true, result.name);
  }
});

test("blocks active sessions and unresolved cleanup or execution ownership", () => {
  const sessions = [
    ...["pending", "staged", "running", "publishing", "completed"].map((status) => [status, finishedSession({ status })]),
    ["future booking", finishedSession({ end: future })],
    ...["pending", "running", "failed", "unknown"].map((endCleanupStatus) => [`cleanup ${endCleanupStatus}`, finishedSession({ endCleanupStatus })]),
    ["cleanup owner remains", finishedSession({ executionModel: "navi", naviCleanupOwner: { attempt_id: "owner" } })],
    ["empty cleanup owner remains", finishedSession({ executionModel: "navi", naviCleanupOwner: {} })],
    ["execution still pending", finishedSession({ executionStatus: "pending" })],
    ["execution still running", finishedSession({ executionStatus: "running" })],
    ["not-started exception has process identity", finishedSession({ executionStatus: "pending", endCleanupRequired: false, endCleanupStatus: "not_started", pid: "42" })],
    ["not-started exception still needs cleanup", finishedSession({ executionStatus: "pending", endCleanupStatus: "not_started" })],
    ["not-started exception is not AEGIS", finishedSession({ executionModel: "navi", executionStatus: "pending", endCleanupRequired: false, endCleanupStatus: "not_started" })],
    ["unknown cleanup", { status: "finished", end: past, executionStatus: "completed" }],
  ];
  for (const result of inspectFixtures("state", sessions.map(([name, session]) => ({ name, state: { sessions: { a: session } } })))) {
    assert.equal(result.error, null, result.name);
    assert.equal(result.value, false, result.name);
  }
});

test("rejects malformed persisted state instead of treating it as idle", () => {
  const states = [
    null, [], {}, { sessions: null }, { sessions: [] }, { sessions: { a: null } },
    { sessions: { a: [] } }, { sessions: { a: {} } },
    { sessions: { a: finishedSession({ status: "unexpected" }) } },
    { sessions: { a: finishedSession({ end: "invalid" }) } },
    { sessions: { a: finishedSession({ endCleanupRequired: "false" }) } },
    { sessions: { a: finishedSession({ executionStatus: true }) } },
  ];
  for (const result of inspectFixtures("state", states.map((state, index) => ({ name: `malformed ${index}`, state })))) {
    assert.match(result.error ?? "", /Malformed Gateway state/, result.name);
    assert.equal(result.value, false, result.name);
  }
});
