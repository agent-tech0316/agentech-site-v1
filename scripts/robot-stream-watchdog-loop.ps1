$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$bridgeScript = Join-Path $scriptDir "robot-stream-bridge.mjs"
$processHelper = Join-Path $scriptDir "robot-stream-process.ps1"
$logDir = Join-Path $repoRoot ".robot-stream-logs"
$stdoutLog = Join-Path $logDir "robot-stream-bridge.out.log"
$stderrLog = Join-Path $logDir "robot-stream-bridge.err.log"
$watchdogLog = Join-Path $logDir "robot-stream-watchdog.log"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null
. $processHelper

foreach ($key in @("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ROBOT_RUNNER_SECRET", "OBS_WEBSOCKET_URL", "OBS_WEBSOCKET_PASSWORD", "ROBOT_HOST", "ROBOT_SSH_USER", "ROBOT_SSH_KEY", "ROBOT_REMOTE_DIR", "ROBOT_PYTHON", "ROBOT_LOCAL_PYTHON", "ROBOT_STREAM_START_HOUR", "ROBOT_STREAM_END_HOUR", "ROBOT_STREAM_PREP_SECONDS", "ROBOT_STREAM_POLL_MS")) {
  if (-not [Environment]::GetEnvironmentVariable($key, "Process")) {
    $userValue = [Environment]::GetEnvironmentVariable($key, "User")
    if ($userValue) {
      [Environment]::SetEnvironmentVariable($key, $userValue, "Process")
    }
  }
}

# Refresh explicit Master settings from the current Windows user configuration.
# A persistent watchdog must refresh before each child launch, not only at login.
function Import-MasterGatewayUserEnvironment {
  foreach ($masterKey in @("AGENTECH_MASTER_DEPLOYMENT_FILE", "AGENTECH_MASTER_SSH_PASSWORD", "AGENTECH_MASTER_STANDING_DEPLOYMENT")) {
    $masterUserValue = [Environment]::GetEnvironmentVariable($masterKey, "User")
    [Environment]::SetEnvironmentVariable($masterKey, $masterUserValue, "Process")
  }
}
Import-MasterGatewayUserEnvironment

$missing = @("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ROBOT_HOST", "ROBOT_SSH_USER") | Where-Object {
  -not [Environment]::GetEnvironmentVariable($_, "Process")
}

if ($missing.Count -gt 0) {
  Add-Content -LiteralPath $stderrLog -Value "[$(Get-Date -Format o)] Missing environment variables: $($missing -join ', ')"
  exit 1
}

$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$node = if ($nodeCommand) { $nodeCommand.Source } else { "C:\Users\victo\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" }
if (-not (Test-Path -LiteralPath $node)) {
  Add-Content -LiteralPath $stderrLog -Value "[$(Get-Date -Format o)] Node.js executable was not found."
  exit 1
}

Add-Content -LiteralPath $watchdogLog -Value "[$(Get-Date -Format o)] Persistent hidden watchdog started."

while ($true) {
  try {
    $startHourRaw = [Environment]::GetEnvironmentVariable("ROBOT_STREAM_START_HOUR", "Process")
    $endHourRaw = [Environment]::GetEnvironmentVariable("ROBOT_STREAM_END_HOUR", "Process")
    $startHour = if ($startHourRaw) { [double]$startHourRaw } else { 0.0 }
    $endHour = if ($endHourRaw) { [double]$endHourRaw } else { 24.0 }
    $now = Get-Date
    $hourValue = $now.Hour + ($now.Minute / 60.0) + ($now.Second / 3600.0)
    $insideOperatingWindow = ($hourValue -ge $startHour) -and ($hourValue -lt $endHour)

    $bridges = @(Get-RobotStreamBridgeProcess -BridgeScript $bridgeScript)
    $bridge = $bridges | Select-Object -First 1
    $duplicates = @($bridges | Select-Object -Skip 1)
    foreach ($duplicate in $duplicates) {
      Stop-Process -Id $duplicate.ProcessId -ErrorAction SilentlyContinue
      Add-Content -LiteralPath $watchdogLog -Value "[$($now.ToString('o'))] Stopped duplicate bridge PID $($duplicate.ProcessId); retained PID $($bridge.ProcessId)."
    }

    if ($insideOperatingWindow -and -not $bridge) {
      Import-MasterGatewayUserEnvironment
      Start-Process `
        -FilePath $node `
        -ArgumentList @("`"$bridgeScript`"") `
        -WorkingDirectory $repoRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput $stdoutLog `
        -RedirectStandardError $stderrLog
      Add-Content -LiteralPath $watchdogLog -Value "[$($now.ToString('o'))] Robot stream bridge restarted."
    } elseif (-not $insideOperatingWindow -and $bridge) {
      Stop-Process -Id $bridge.ProcessId -ErrorAction SilentlyContinue
      Add-Content -LiteralPath $watchdogLog -Value "[$($now.ToString('o'))] Robot stream bridge stopped outside operating window."
    }
  } catch {
    Add-Content -LiteralPath $stderrLog -Value "[$(Get-Date -Format o)] Watchdog loop error: $($_.Exception.Message)"
  }

  Start-Sleep -Seconds 15
}
