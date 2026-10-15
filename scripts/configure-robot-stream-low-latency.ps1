[CmdletBinding()]
param(
  [switch]$Apply,

  [string]$ObsProfileDirectory = (Join-Path $env:APPDATA "obs-studio\basic\profiles\Untitled"),

  [string]$ObsExecutable = "C:\Program Files\obs-studio\bin\64bit\obs64.exe"
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$statusProbe = Join-Path $scriptDir "obs-stream-status.mjs"
$basicIni = Join-Path $ObsProfileDirectory "basic.ini"
$streamEncoder = Join-Path $ObsProfileDirectory "streamEncoder.json"
$obsConfigRoot = [IO.Path]::GetFullPath((Join-Path $env:APPDATA "obs-studio"))
$safeModeMarker = Join-Path $obsConfigRoot "safe_mode"
$uncleanShutdownMarker = Join-Path $obsConfigRoot ".sentinel"
$backupRoot = Join-Path $repoRoot ".robot-stream-backups"

function Start-ObsNormally {
  if (Test-Path -LiteralPath $safeModeMarker) {
    Remove-Item -LiteralPath $safeModeMarker -Force
  }
  if (Test-Path -LiteralPath $uncleanShutdownMarker) {
    $marker = Get-Item -LiteralPath $uncleanShutdownMarker -Force
    $resolvedMarker = (Resolve-Path -LiteralPath $uncleanShutdownMarker).ProviderPath
    $resolvedRoot = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $obsConfigRoot).ProviderPath)
    $markerParent = [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($resolvedMarker))
    if (($marker.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
        -not $markerParent.Equals($resolvedRoot, [StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to remove an OBS marker outside the exact OBS configuration directory."
    }
    Remove-Item -LiteralPath $resolvedMarker -Recurse -Force
  }

  Start-Process `
    -FilePath $ObsExecutable `
    -WorkingDirectory (Split-Path -Parent $ObsExecutable) `
    -ArgumentList @("--minimize-to-tray") `
    -WindowStyle Hidden
}

if (-not $Apply) {
  throw "No change made. Re-run with -Apply only after confirming no authorized stream or recording is active."
}

foreach ($path in @($ObsExecutable, $basicIni, $streamEncoder, $statusProbe)) {
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Required OBS file is missing: $path"
  }
}

$nodeCommand = Get-Command node.exe -ErrorAction Stop
$statusText = & $nodeCommand.Source $statusProbe $ObsProfileDirectory
if ($LASTEXITCODE -ne 0) {
  throw "Unable to verify the selected active OBS profile, Advanced NVENC CBR settings, and inactive outputs. No change was made."
}
$status = $statusText | ConvertFrom-Json
if ($status.outputActive -isnot [bool] -or $status.recordOutputActive -isnot [bool] -or
    [string]::IsNullOrWhiteSpace($status.currentProfileName)) {
  throw "OBS activity or active profile identity is missing. No change was made."
}
$expectedProfileName = $status.currentProfileName
if ($status.outputActive) {
  throw "OBS outputActive is true. Stop the authorized stream normally before changing its delivery profile."
}
if ($status.recordOutputActive) {
  throw "OBS recordOutputActive is true. Stop the authorized recording normally before changing its delivery profile."
}

$obsProcesses = @(Get-Process -Name "obs64" -ErrorAction SilentlyContinue)
if ($obsProcesses.Count -ne 1) {
  throw "Exactly one OBS process is required; found $($obsProcesses.Count)."
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDirectory = Join-Path $backupRoot "obs-low-latency-$timestamp"
New-Item -ItemType Directory -Force -Path $backupDirectory | Out-Null
Copy-Item -LiteralPath $basicIni -Destination (Join-Path $backupDirectory "basic.ini")
Copy-Item -LiteralPath $streamEncoder -Destination (Join-Path $backupDirectory "streamEncoder.json")

function Set-IniEntry {
  param(
    [Parameter(Mandatory = $true)][string]$Content,
    [Parameter(Mandatory = $true)][string]$Section,
    [Parameter(Mandatory = $true)][string]$Key,
    [Parameter(Mandatory = $true)][string]$Entry
  )

  $sectionPattern = "(?ms)(^\[$([regex]::Escape($Section))\]\r?\n)(.*?)(?=^\[|\z)"
  $sections = [regex]::Matches($Content, $sectionPattern)
  if ($sections.Count -ne 1) {
    throw "OBS profile must contain exactly one section: $Section"
  }
  $body = $sections[0].Groups[2].Value
  $pattern = "(?m)^$([regex]::Escape($Key))=.*$"
  if ([regex]::Matches($body, $pattern).Count -ne 1) {
    throw "OBS profile must contain exactly one key: $Section.$Key"
  }
  $replacement = $sections[0].Groups[1].Value + [regex]::Replace($body, $pattern, $Entry)
  $Content.Remove($sections[0].Index, $sections[0].Length).Insert($sections[0].Index, $replacement)
}

$obsPid = [int]$obsProcesses[0].Id
Stop-Process -Id $obsPid
$stopDeadline = (Get-Date).AddSeconds(15)
do {
  Start-Sleep -Milliseconds 250
  $remainingObs = Get-CimInstance Win32_Process -Filter "ProcessId = $obsPid" -ErrorAction SilentlyContinue
} while ($remainingObs -and (Get-Date) -lt $stopDeadline)
if ($remainingObs) {
  throw "OBS did not stop within 15 seconds. Configuration was not changed."
}

try {
  $ini = Get-Content -LiteralPath $basicIni -Raw
  $ini = Set-IniEntry -Content $ini -Section "Video" -Key "OutputCX" -Entry "OutputCX=1280"
  $ini = Set-IniEntry -Content $ini -Section "Video" -Key "OutputCY" -Entry "OutputCY=720"
  $ini = Set-IniEntry -Content $ini -Section "Video" -Key "FPSType" -Entry "FPSType=0"
  $ini = Set-IniEntry -Content $ini -Section "Video" -Key "FPSCommon" -Entry "FPSCommon=30"
  Set-Content -LiteralPath $basicIni -Value $ini -Encoding UTF8 -NoNewline

  $encoder = Get-Content -LiteralPath $streamEncoder -Raw | ConvertFrom-Json
  $settings = if ($encoder.PSObject.Properties.Name -contains "settings") {
    $encoder.settings
  } else {
    $encoder
  }
  $settings.bitrate = 3500
  $settings.keyint_sec = 1
  $settings.preset = "p3"
  $settings.tune = "ull"
  $settings.multipass = "disabled"
  $settings.lookahead = $false
  $settings | Add-Member -NotePropertyName "bf" -NotePropertyValue 0 -Force
  $encoder | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $streamEncoder -Encoding UTF8
} catch {
  Copy-Item -LiteralPath (Join-Path $backupDirectory "basic.ini") -Destination $basicIni -Force
  Copy-Item -LiteralPath (Join-Path $backupDirectory "streamEncoder.json") -Destination $streamEncoder -Force
  Start-ObsNormally
  throw
}

Start-ObsNormally

$deadline = (Get-Date).AddSeconds(30)
$verified = $null
do {
  Start-Sleep -Seconds 1
  try {
    $verifiedText = & $nodeCommand.Source $statusProbe $ObsProfileDirectory --verify-configured $expectedProfileName 2>$null
    if ($LASTEXITCODE -eq 0) {
      $candidate = $verifiedText | ConvertFrom-Json
      if (
        $candidate.outputActive -is [bool] -and -not $candidate.outputActive -and
        $candidate.recordOutputActive -is [bool] -and -not $candidate.recordOutputActive -and
        $candidate.currentProfileName -ceq $expectedProfileName -and
        $candidate.outputWidth -eq 1280 -and
        $candidate.outputHeight -eq 720 -and
        $candidate.fpsDenominator -gt 0 -and
        $candidate.fpsNumerator -eq (30 * $candidate.fpsDenominator) -and
        $candidate.profileSettings.bitrateKbps -eq 3500
      ) {
        $verified = $candidate
      }
    }
  } catch {
    $verified = $null
  }
} while (-not $verified -and (Get-Date) -lt $deadline)

if (-not $verified) {
  throw "OBS restarted, but its active profile and persisted 1280x720@30 NVENC CBR settings could not be verified within 30 seconds. Backup: $backupDirectory"
}

[pscustomobject]@{
  outcome = "configured"
  profile_name = $verified.profileSettings.profileName
  encoder = $verified.profileSettings.encoder
  rate_control = $verified.profileSettings.rateControl
  output_active = [bool]$verified.outputActive
  output_width = [int]$verified.outputWidth
  output_height = [int]$verified.outputHeight
  fps = $verified.profileSettings.fps
  bitrate_kbps = $verified.profileSettings.bitrateKbps
  keyframe_seconds = $verified.profileSettings.keyframeSeconds
  preset = $verified.profileSettings.preset
  tune = $verified.profileSettings.tune
  multipass = $verified.profileSettings.multipass
  lookahead = $verified.profileSettings.lookahead
  b_frames = $verified.profileSettings.bFrames
  backup = $backupDirectory
  stream_started = $false
}
