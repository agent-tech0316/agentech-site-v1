param(
  [switch]$RepairNvencFailure
)

$ErrorActionPreference = "Stop"

$obsPath = "C:\Program Files\obs-studio\bin\64bit\obs64.exe"
$obsWorkingDirectory = Split-Path -Parent $obsPath
$nvencTestPath = Join-Path $obsWorkingDirectory "obs-nvenc-test.exe"
$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$nvencHealthScript = Join-Path $scriptDirectory "obs-nvenc-health.mjs"
$obsLogDirectory = Join-Path $env:APPDATA "obs-studio\logs"
$safeModeMarker = Join-Path $env:APPDATA "obs-studio\safe_mode"
$logDirectory = "C:\AgentechRobotGateway\.robot-stream-logs"
$logPath = Join-Path $logDirectory "ensure-obs-running.log"

New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null

$obsProcesses = @(Get-Process -Name "obs64" -ErrorAction SilentlyContinue)
if ($obsProcesses.Count -gt 1) {
  Add-Content -LiteralPath $logPath -Value "[$(Get-Date -Format o)] More than one OBS process is running; refusing to choose an owner. Close all OBS windows once, then rerun this script."
  exit 2
}

if (-not (Test-Path -LiteralPath $obsPath)) {
  Add-Content -LiteralPath $logPath -Value "[$(Get-Date -Format o)] OBS executable was not found at $obsPath."
  exit 1
}

if (-not (Test-Path -LiteralPath $nvencTestPath) -or -not (Test-Path -LiteralPath $nvencHealthScript)) {
  Add-Content -LiteralPath $logPath -Value "[$(Get-Date -Format o)] OBS NVENC health checker is missing."
  exit 1
}

$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
  Add-Content -LiteralPath $logPath -Value "[$(Get-Date -Format o)] Node.js is required for the OBS NVENC health check."
  exit 1
}

$restartedForNvenc = $false
if ($obsProcesses.Count -eq 1) {
  $obsProcess = $obsProcesses[0]
  $healthOutput = & $nodeCommand.Source $nvencHealthScript $obsLogDirectory $nvencTestPath $obsProcess.StartTime.ToString("o") 2>&1
  $healthExitCode = $LASTEXITCODE

  if ($healthExitCode -eq 0) {
    Add-Content -LiteralPath $logPath -Value "[$(Get-Date -Format o)] OBS is running with NVENC available."
    exit 0
  }

  if ($healthExitCode -eq 11) {
    Add-Content -LiteralPath $logPath -Value "[$(Get-Date -Format o)] NVIDIA NVENC is unavailable at the driver level; leaving OBS untouched so the scheduled retry can try again."
    exit 3
  }

  if ($healthExitCode -ne 10) {
    Add-Content -LiteralPath $logPath -Value "[$(Get-Date -Format o)] OBS NVENC health check failed with exit code ${healthExitCode}: $healthOutput"
    exit 4
  }

  Add-Content -LiteralPath $logPath -Value "[$(Get-Date -Format o)] OBS is running with stale NVENC state; restarting it once."
  $null = $obsProcess.CloseMainWindow()
  if (-not $obsProcess.WaitForExit(20000)) {
    Stop-Process -Id $obsProcess.Id -Force
    $obsProcess.WaitForExit(10000)
  }
  $restartedForNvenc = $true
  Start-Sleep -Seconds 2
}

$driverProbe = & $nvencTestPath 2>&1
if ($LASTEXITCODE -ne 0 -or ($driverProbe -join "`n") -notmatch "nvenc_supported=true") {
  Add-Content -LiteralPath $logPath -Value "[$(Get-Date -Format o)] NVIDIA NVENC probe failed; OBS launch deferred until the scheduled retry."
  exit 3
}

if (Test-Path -LiteralPath $safeModeMarker) {
  Remove-Item -LiteralPath $safeModeMarker -Force
  Add-Content -LiteralPath $logPath -Value "[$(Get-Date -Format o)] Cleared the stale unclean-shutdown marker before launching OBS normally."
}

Start-Process `
  -FilePath $obsPath `
  -WorkingDirectory $obsWorkingDirectory `
  -ArgumentList @("--minimize-to-tray")

$deadline = (Get-Date).AddSeconds(75)
do {
  Start-Sleep -Seconds 1
  $startedProcesses = @(Get-Process -Name "obs64" -ErrorAction SilentlyContinue)
  if ($startedProcesses.Count -eq 1) {
    $healthOutput = & $nodeCommand.Source $nvencHealthScript $obsLogDirectory $nvencTestPath $startedProcesses[0].StartTime.ToString("o") 2>&1
    $healthExitCode = $LASTEXITCODE
    if ($healthExitCode -eq 0) {
      Add-Content -LiteralPath $logPath -Value "[$(Get-Date -Format o)] OBS started successfully with NVENC available."
      if ($RepairNvencFailure -and $restartedForNvenc) { exit 10 }
      exit 0
    }
    if ($healthExitCode -eq 10 -or $healthExitCode -eq 11) { break }
  }
} while ((Get-Date) -lt $deadline)

if ($startedProcesses.Count -eq 1) {
  Add-Content -LiteralPath $logPath -Value "[$(Get-Date -Format o)] OBS stayed open but NVENC did not become available: $healthOutput"
  exit 4
}

Add-Content -LiteralPath $logPath -Value "[$(Get-Date -Format o)] OBS did not remain running after launch."
exit 1
