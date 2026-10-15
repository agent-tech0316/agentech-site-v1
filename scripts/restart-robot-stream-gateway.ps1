[CmdletBinding()]
param(
  [switch]$ConfirmNoDueSession,

  [ValidateRange(15, 120)]
  [int]$RestartTimeoutSeconds = 30
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$guardedRestart = Join-Path $scriptDir "restart-robot-stream-bridge.ps1"

# Keep the older entry point on the same state and process-identity guards.
& $guardedRestart @PSBoundParameters
