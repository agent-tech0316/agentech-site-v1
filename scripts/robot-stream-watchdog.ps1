$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$bridgeScript = Join-Path $scriptDir "robot-stream-bridge.mjs"
$processHelper = Join-Path $scriptDir "robot-stream-process.ps1"
$logDir = Join-Path $repoRoot ".robot-stream-logs"
$stdoutLog = Join-Path $logDir "robot-stream-bridge.out.log"
$stderrLog = Join-Path $logDir "robot-stream-bridge.err.log"

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

$missing = @("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ROBOT_HOST", "ROBOT_SSH_USER") | Where-Object {
  -not [Environment]::GetEnvironmentVariable($_, "Process")
}

if ($missing.Count -gt 0) {
  Add-Content -Path $stderrLog -Value "[$(Get-Date -Format o)] Missing environment variables: $($missing -join ', ')"
  exit 1
}

$startHourRaw = [Environment]::GetEnvironmentVariable("ROBOT_STREAM_START_HOUR", "Process")
if (-not $startHourRaw) {
  $startHourRaw = "0"
}
$endHourRaw = [Environment]::GetEnvironmentVariable("ROBOT_STREAM_END_HOUR", "Process")
if (-not $endHourRaw) {
  $endHourRaw = "24"
}
$startHour = [double]$startHourRaw
$endHour = [double]$endHourRaw
$now = Get-Date
$hourValue = $now.Hour + ($now.Minute / 60.0) + ($now.Second / 3600.0)

$bridges = @(Get-RobotStreamBridgeProcess -BridgeScript $bridgeScript)
$existing = $bridges | Select-Object -First 1
$duplicates = @($bridges | Select-Object -Skip 1)
foreach ($duplicate in $duplicates) {
  Stop-Process -Id $duplicate.ProcessId -ErrorAction SilentlyContinue
  Add-Content -Path $stdoutLog -Value "[$($now.ToString("o"))] Stopped duplicate bridge PID $($duplicate.ProcessId); retained PID $($existing.ProcessId)."
}

if (($hourValue -lt $startHour) -or ($hourValue -ge $endHour)) {
  if ($existing) {
    Stop-Process -Id $existing.ProcessId -ErrorAction SilentlyContinue
    Add-Content -Path $stdoutLog -Value "[$($now.ToString("o"))] Stopped bridge outside operating window $($startHour):00-$($endHour):00."
  }
  exit 0
}

if ($existing) {
  exit 0
}

$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$node = if ($nodeCommand) { $nodeCommand.Source } else { "C:\Users\victo\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" }
if (-not (Test-Path -LiteralPath $node)) {
  throw "Node.js executable was not found."
}

Start-Process `
  -FilePath $node `
  -ArgumentList @("`"$bridgeScript`"") `
  -WorkingDirectory $repoRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $stdoutLog `
  -RedirectStandardError $stderrLog
