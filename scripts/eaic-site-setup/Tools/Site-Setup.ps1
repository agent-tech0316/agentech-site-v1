[CmdletBinding()]
param([switch]$VerifyOnly)
$ErrorActionPreference = 'Stop'
$kit = Split-Path -Parent $PSScriptRoot
$gatewayName = 'EAIC-Gateway-1.0.1-Setup-Windows-x64.exe'
$obsName = 'OBS-Studio-33.0.1-Windows-x64-Installer.exe'
$downloads = @{
    $gatewayName = 'https://github.com/agent-tech0316/agentech-site-v1/releases/download/eaic-gateway-v1.0.1/EAIC-Gateway-1.0.1-Setup-Windows-x64.exe'
    $obsName = 'https://github.com/obsproject/obs-studio/releases/download/33.0.1/OBS-Studio-33.0.1-Windows-x64-Installer.exe'
    'vc_redist.x64.exe' = 'https://aka.ms/vc14/vc_redist.x64.exe'
}
$hashes = @{
    $gatewayName = '98169eb40588a680dc0dc46323bddd5ea50375be2489da81346d28f1ece156a3'
    $obsName = '37ecde4d9a28e8aeeb07623c8469b5d558eb264e02ccf435bb859891c401758b'
}
function Assert-VerifiedInstaller([string]$Name, [string]$Path) {
    if ($hashes.ContainsKey($Name)) {
        if ((Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash -ne $hashes[$Name]) {
            throw "The copy of $Name differs from its published checksum."
        }
        return
    }
    $signature = Get-AuthenticodeSignature -LiteralPath $Path
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.GetNameInfo('SimpleName', $false) -ne 'Microsoft Corporation') {
        throw "The Microsoft signature for $Name could not be verified."
    }
}
function Get-GatewayRoot {
    $path = Join-Path $env:LOCALAPPDATA 'Agentech\EAICGateway\1.0.1'
    $menu = [Environment]::GetFolderPath('Programs')
    $shortcut = Join-Path $menu 'Agentech EAIC Gateway\2 Offline check.lnk'
    if (Test-Path -LiteralPath $shortcut) {
        $target = (New-Object -ComObject WScript.Shell).CreateShortcut($shortcut).TargetPath
        if ($target) {
            $shortcutRoot = Split-Path -Parent $target
            $shortcutManifest = Join-Path $shortcutRoot 'package-manifest.json'
            if ((Test-Path -LiteralPath $shortcutManifest -PathType Leaf) -and
                (Get-FileHash -LiteralPath $shortcutManifest).Hash -eq '4f50bd07c7d802713106bcd4974bdec99bcf458872b40fde28387bfa137b8170') {
                $path = $shortcutRoot
            }
        }
    }
    $manifest = Join-Path $path 'package-manifest.json'
    if (!(Test-Path -LiteralPath $manifest)) { throw 'Install EAIC Gateway 1.0.1 for this Windows account first (option 1).' }
    if ((Get-FileHash -LiteralPath $manifest).Hash -ne '4f50bd07c7d802713106bcd4974bdec99bcf458872b40fde28387bfa137b8170') {
        throw 'This menu is for the released gateway 1.0.1. Check the installation selected by the Start menu.'
    }
    return $path
}
function Invoke-Gateway([string]$Action) {
    $root = Get-GatewayRoot
    $script = Join-Path $root 'scripts\eaic-windows-gateway.ps1'
    if ($Action -eq 'Offline') {
        & "$PSHOME\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File $script -Action Offline
    } else {
        & "$PSHOME\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'site-gateway.ps1') -GatewayRoot $root -Action $Action
    }
    if ($LASTEXITCODE -ne 0) { throw "Gateway $Action returned $LASTEXITCODE. See its message above." }
}
function Install-Program([string]$Name) {
    $file = Join-Path (Join-Path $kit 'Programs') $Name
    $temporary = $null
    try {
        if (!(Test-Path -LiteralPath $file -PathType Leaf)) {
            $temporary = Join-Path ([IO.Path]::GetTempPath()) ('EAIC-' + [Guid]::NewGuid().ToString('N'))
            New-Item -ItemType Directory -Path $temporary | Out-Null
            $file = Join-Path $temporary $Name
            Write-Host "Downloading $Name from its publisher..."
            $ProgressPreference = 'SilentlyContinue'
            Invoke-WebRequest -UseBasicParsing -Uri $downloads[$Name] -OutFile $file
        }
        Assert-VerifiedInstaller $Name $file
        $result = Start-Process -FilePath $file -Wait -PassThru
        $successCodes = if ($Name -eq 'vc_redist.x64.exe') { @(0, 3010) } else { @(0) }
        if ($result.ExitCode -notin $successCodes) { throw "$Name returned $($result.ExitCode)." }
        if ($result.ExitCode -eq 3010) { Write-Host 'Restart Windows to finish installing the Microsoft runtime.' }
    } finally {
        if ($temporary) {
            Remove-Item -LiteralPath $file -Force -ErrorAction SilentlyContinue
            Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
        }
    }
}
function Test-Obs {
    $root = Get-GatewayRoot
    $saved = Join-Path $root 'configuration\obs-key.dpapi'
    if (Test-Path -LiteralPath $saved) {
        $password = ConvertTo-SecureString ((Get-Content -LiteralPath $saved -Raw).Trim())
    } else {
        $password = Read-Host 'Password from OBS > Tools > WebSocket Server Settings' -AsSecureString
    }
    try {
        $env:EAIC_LOCAL_OBS_PASSWORD = [Net.NetworkCredential]::new('', $password).Password
        & (Join-Path $root 'runtime\python\python.exe') (Join-Path $PSScriptRoot 'check-obs.py')
        if ($LASTEXITCODE -ne 0) { throw 'Local OBS authentication or status check failed.' }
    } finally {
        Remove-Item Env:EAIC_LOCAL_OBS_PASSWORD -ErrorAction SilentlyContinue
    }
}
function New-MasterDraft {
    $root = Get-GatewayRoot
    $robotHost = (Read-Host 'Master IP or DNS name on the new LAN').Trim()
    if ([Uri]::CheckHostName($robotHost) -eq 'Unknown') { throw 'Enter an IP or DNS name only.' }
    $draftDir = Join-Path $env:LOCALAPPDATA 'Agentech\EAIC Site'
    New-Item -ItemType Directory -Force -Path $draftDir | Out-Null
    $file = Join-Path $draftDir 'master-deployment.json'
    if (Test-Path -LiteralPath $file) { throw "Existing draft preserved at $file. Review that file with your Master operator." }
    & (Join-Path $root 'runtime\python\python.exe') (Join-Path $PSScriptRoot 'prepare-master-gateway.py') --sdk-root (Join-Path $root 'sdk') --host $robotHost --output $file
    if ($LASTEXITCODE -ne 0) { throw 'The Master draft could not be created.' }
    Write-Host "Give this file to the Master operator for review: $file"
}
function Start-AssignedGateway {
    $root = Get-GatewayRoot
    $path = Join-Path $root 'configuration\gateway.json'
    if (!(Test-Path -LiteralPath $path)) { throw 'Finish Configure and the connectivity check first.' }
    $config = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
    Write-Host "Starting $($config.gatewayId) to watch for $($config.models -join ', ') website bookings."
    if ($config.discoveryMode -ne 'single-venue') { throw 'Press Enter to upgrade the saved configuration to automatic booking discovery.' }
    $needsPassword = ($config.models -contains 'master') -and !$env:AGENTECH_MASTER_SSH_PASSWORD
    try {
        if ($needsPassword) {
            $credential = Read-Host 'Master SSH password for this gateway session' -AsSecureString
            if (!$credential.Length) { throw 'Master requires its SSH credential.' }
            $env:AGENTECH_MASTER_SSH_PASSWORD = [Net.NetworkCredential]::new('', $credential).Password
        }
        Invoke-Gateway 'Start'
    } finally {
        if ($needsPassword) { Remove-Item Env:AGENTECH_MASTER_SSH_PASSWORD -ErrorAction SilentlyContinue }
    }
}
function Invoke-QuickSetup {
    if (!(Test-Path -LiteralPath (Join-Path $kit 'Site connection.json') -PathType Leaf)) {
        throw 'Place your private Site connection.json beside START HERE.cmd. See Site connection.example.json for the format.'
    }
    try {
        $root = Get-GatewayRoot
    } catch {
        $defaultRoot = Join-Path $env:LOCALAPPDATA 'Agentech\EAICGateway\1.0.1'
        if (Test-Path -LiteralPath $defaultRoot) { throw }
        Install-Program $gatewayName
        $root = Get-GatewayRoot
    }
    $obs = Join-Path $env:ProgramFiles 'obs-studio\bin\64bit\obs64.exe'
    if (!(Test-Path -LiteralPath $obs)) {
        Install-Program $obsName
        if (!(Test-Path -LiteralPath $obs)) { throw 'Install OBS Studio in its default Windows folder and retry.' }
    }
    Invoke-Gateway 'Offline'
    & (Join-Path $root 'runtime\python\python.exe') (Join-Path $PSScriptRoot 'quick-setup.py') $root $obs
    if ($LASTEXITCODE -ne 0) { throw 'Quick setup stopped. See the message above.' }
}
if ($VerifyOnly) {
    foreach ($name in $downloads.Keys) {
        $file = Join-Path (Join-Path $kit 'Programs') $name
        if (Test-Path -LiteralPath $file -PathType Leaf) {
            Assert-VerifiedInstaller $name $file
            Write-Host "Verified local installer: $name"
        }
    }
    return
}
while ($true) {
    Write-Host @'

EAIC | New Windows site

  ENTER   Quick setup - select robot model, enter robot IP, pick camera

  1   Install EAIC Gateway
  2   Install OBS Studio
  3   Run offline gateway check (works before you know the robot IP)

  4   Open site details worksheet
  M   Prepare a disabled Master deployment draft (Master only)
  5   Configure this PC with the on-site details
  6   Check local OBS camera connection and password
  7   Check cloud and selected robot connections

  H   Open the EAIC website
  G   Read the setup guide
  V   Install Microsoft Visual C++ x64 runtime if a program requests it
  S   START LIVE GATEWAY - wait for eligible website bookings
  Q   Quit

'@
    try {
        switch ((Read-Host 'Choose one').Trim().ToUpperInvariant()) {
            '' { Invoke-QuickSetup }
            'A' { Invoke-QuickSetup }
            '1' { Install-Program $gatewayName }
            '2' { Install-Program $obsName }
            '3' { Invoke-Gateway 'Offline' }
            '4' { & notepad.exe (Join-Path $kit 'SITE DETAILS.txt') }
            'M' { New-MasterDraft }
            '5' { Invoke-QuickSetup }
            '6' { Test-Obs }
            '7' { Invoke-Gateway 'Check' }
            'H' { Start-Process 'https://www.agent-tech.ai/agentech-products/eaic-hub' }
            'G' { & notepad.exe (Join-Path $kit 'READ ME.txt') }
            'V' { Install-Program 'vc_redist.x64.exe' }
            'S' { Start-AssignedGateway }
            'Q' { return }
            default { Write-Host 'Choose a number or letter shown in the menu.' }
        }
    } catch { Write-Host $_.Exception.Message -ForegroundColor Yellow }
}
