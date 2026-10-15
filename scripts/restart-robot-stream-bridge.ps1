[CmdletBinding()]
param(
  [switch]$ConfirmNoDueSession,

  [ValidateRange(15, 120)]
  [int]$RestartTimeoutSeconds = 30
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$bridgeScript = Join-Path $scriptDir "robot-stream-bridge.mjs"
$processHelper = Join-Path $scriptDir "robot-stream-process.ps1"
$watchdogLoop = Join-Path $scriptDir "robot-stream-watchdog-loop.ps1"
$aegisRunner = Join-Path $scriptDir "trusted-robot-runner.py"
$naviRunner = Join-Path $scriptDir "trusted-navi-runner.py"
$statePath = Join-Path $repoRoot ".robot-stream-runtime\state.json"

. $processHelper

if (-not $ConfirmNoDueSession) {
  throw "Restart refused. First verify Hub/Supabase has no due, staged, or active session, then pass -ConfirmNoDueSession."
}

if (-not (Test-Path -LiteralPath $statePath)) {
  throw "Restart refused because the local Gateway state file is missing: $statePath"
}

$state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
$blockingSessions = @(Get-RobotStreamRestartBlockers -State $state)

if ($blockingSessions.Count -gt 0) {
  throw "Restart refused: $($blockingSessions -join '; ')"
}

$runnerProcesses = @(
  Get-CimInstance Win32_Process |
    Where-Object {
      $_.CommandLine -and (
        (Test-CommandLineArgumentPath -CommandLine $_.CommandLine -ExpectedPath $aegisRunner) -or
        (Test-CommandLineArgumentPath -CommandLine $_.CommandLine -ExpectedPath $naviRunner)
      )
    }
)
if ($runnerProcesses.Count -gt 0) {
  throw "Restart refused because a trusted robot runner is still active."
}

$watchdogProcesses = @(
  Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe' OR Name = 'pwsh.exe'" |
    Where-Object {
      $_.CommandLine -and
      (Test-CommandLineArgumentPath -CommandLine $_.CommandLine -ExpectedPath $watchdogLoop)
    }
)
if ($watchdogProcesses.Count -ne 1) {
  throw "Restart refused because exactly one persistent Gateway watchdog was expected; found $($watchdogProcesses.Count)."
}

$bridges = @(Get-RobotStreamBridgeProcess -BridgeScript $bridgeScript)
if ($bridges.Count -ne 1) {
  throw "Restart refused because exactly one Gateway bridge was expected; found $($bridges.Count)."
}

# Refresh local state after process discovery, immediately before the stop.
$state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
$blockingSessions = @(Get-RobotStreamRestartBlockers -State $state)
if ($blockingSessions.Count -gt 0) {
  throw "Restart refused: $($blockingSessions -join '; ')"
}

$oldBridge = $bridges[0]
$startedAt = Get-Date
Stop-Process -Id $oldBridge.ProcessId -Force

$deadline = $startedAt.AddSeconds($RestartTimeoutSeconds)
$newBridge = $null
do {
  Start-Sleep -Milliseconds 500
  $candidates = @(
    Get-RobotStreamBridgeProcess -BridgeScript $bridgeScript |
      Where-Object { $_.ProcessId -ne $oldBridge.ProcessId }
  )
  if ($candidates.Count -eq 1) {
    $newBridge = $candidates[0]
  } elseif ($candidates.Count -gt 1) {
    throw "Gateway restart produced more than one exact bridge process."
  }
} while (-not $newBridge -and (Get-Date) -lt $deadline)

if (-not $newBridge) {
  throw "Gateway bridge stopped, but the watchdog did not create a verified replacement within $RestartTimeoutSeconds seconds."
}

[pscustomobject]@{
  outcome = "restarted"
  old_pid = [int]$oldBridge.ProcessId
  new_pid = [int]$newBridge.ProcessId
  started_at = $startedAt.ToString("o")
  finished_at = (Get-Date).ToString("o")
  computer_restart = $false
}
