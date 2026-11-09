[CmdletBinding()]
param([ValidateSet('Configure','Offline','Check','Start')][string]$Action='Offline')
$ErrorActionPreference='Stop'
$gatewayRoot=Split-Path -Parent $PSScriptRoot
$manifest=Get-Content -LiteralPath (Join-Path $gatewayRoot 'package-manifest.json') -Raw | ConvertFrom-Json
$configDir=Join-Path $gatewayRoot 'configuration'
$configPath=Join-Path $configDir 'gateway.json'
$credentialPath=Join-Path $configDir 'cloud-key.dpapi'
$node=Join-Path $gatewayRoot 'runtime/node/node.exe'
$python=Join-Path $gatewayRoot 'runtime/python/python.exe'
function Verify-Package {
  foreach($item in $manifest.files.PSObject.Properties){
    $file=Join-Path $gatewayRoot $item.Name
    if(-not (Test-Path -LiteralPath $file -PathType Leaf)){throw "Package file missing: $($item.Name)"}
    if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $item.Value){throw "Package file changed: $($item.Name)"}
  }
  & $node --version
  if($LASTEXITCODE -ne 0){throw 'Bundled Node cannot run'}
  & $python (Join-Path $PSScriptRoot 'eaic-package-check.py') $gatewayRoot
  if($LASTEXITCODE -ne 0){throw 'Bundled SDK offline check failed'}
}
function Read-GatewaySecret([string]$Path){
  # Set-Content from Windows PowerShell writes a line terminator. DPAPI's
  # hexadecimal serialization does not accept it; trim the encoding only.
  $encoded=(Get-Content -LiteralPath $Path -Raw -ErrorAction Stop).Trim()
  if(-not $encoded){throw 'Protected gateway credential is empty'}
  return ConvertTo-SecureString $encoded -ErrorAction Stop
}
function Test-Tcp([string]$TargetHost,[int]$Port){
  $client=[Net.Sockets.TcpClient]::new()
  try{
    $attempt=$client.BeginConnect($TargetHost,$Port,$null,$null)
    if(-not $attempt.AsyncWaitHandle.WaitOne(3000)){throw "Cannot reach configured service on port $Port"}
    $client.EndConnect($attempt)
  }finally{$client.Dispose()}
}
if($Action -eq 'Configure'){
  Verify-Package
  if(Test-Path -LiteralPath $configPath){throw 'Configuration already exists. Review the saved configuration before changing assignments; this wizard never replaces an active gateway configuration.'}
  $gatewayId=Read-Host 'Unique gateway name (for example eaic-site02)'
  $models=@((Read-Host 'Robot models (comma separated: navi,master,aegis)').Split(',') | ForEach-Object {$_.Trim().ToLowerInvariant()})
  $sessionIds=@((Read-Host 'Booking IDs exclusively assigned to this PC (comma separated)').Split(',') | ForEach-Object {$_.Trim()})
  $cloudUrl=Read-Host 'Agentech cloud Supabase HTTPS URL'
  if(([uri]$cloudUrl).Scheme -ne 'https'){throw 'Cloud HTTPS URL required'}
  $cloudKey=Read-Host 'Cloud service role key (stored for this Windows user with DPAPI)' -AsSecureString
  $aegisHost=if($models -contains 'aegis'){Read-Host 'Aegis SSH host'}else{'unused.invalid'}
  $aegisUser=if($models -contains 'aegis'){Read-Host 'Aegis SSH user'}else{'unused'}
  $sshKey=if($models -contains 'aegis'){Read-Host 'Full path to the Aegis SSH private key'}else{''}
  $naviHost=if($models -contains 'navi'){Read-Host 'Navi rosbridge host'}else{'unused.invalid'}
  $masterDeployment=if($models -contains 'master'){Read-Host 'Full path to reviewed Master deployment JSON (enabled only after operator commissioning)'}else{''}
  $obsKey=Read-Host 'Local OBS WebSocket password (DPAPI protected)' -AsSecureString
  $config=[ordered]@{gatewayId=$gatewayId;models=$models;sessionIds=$sessionIds;cloudUrl=$cloudUrl;aegisHost=$aegisHost;aegisUser=$aegisUser;sshKey=$sshKey;naviHost=$naviHost;naviPort=9090;masterDeployment=$masterDeployment;obsUrl='ws://127.0.0.1:4455';sdkRevision=$manifest.sdkRevision}
  $env:AGENTECH_GATEWAY_ID=$gatewayId;$env:AGENTECH_GATEWAY_MODELS=ConvertTo-Json -InputObject $models -Compress;$env:AGENTECH_GATEWAY_SESSION_IDS=ConvertTo-Json -InputObject $sessionIds -Compress
  Push-Location $gatewayRoot
  try{& $node --input-type=module -e "import {gatewayAssignment} from './scripts/eaic-gateway-assignment.mjs'; gatewayAssignment();"}finally{Pop-Location}
  if($LASTEXITCODE -ne 0){throw 'Gateway assignment is invalid'}
  New-Item -ItemType Directory -Force -Path $configDir | Out-Null
  # Keep cloud and OBS credentials readable only by the installing Windows user.
  $identity=[Security.Principal.WindowsIdentity]::GetCurrent().Name
  $acl=Get-Acl -LiteralPath $configDir;$acl.SetAccessRuleProtection($true,$false)
  $acl.SetAccessRule([Security.AccessControl.FileSystemAccessRule]::new($identity,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
  Set-Acl -LiteralPath $configDir -AclObject $acl
  $config | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $configPath -Encoding UTF8
  ConvertFrom-SecureString $cloudKey | Set-Content -LiteralPath $credentialPath -NoNewline
  ConvertFrom-SecureString $obsKey | Set-Content -LiteralPath (Join-Path $configDir 'obs-key.dpapi') -NoNewline
  $stateDir=Join-Path $gatewayRoot '.robot-stream-runtime'
  New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
  $statePath=Join-Path $stateDir 'state.json'
  if(-not (Test-Path -LiteralPath $statePath)){
    $initialState=[IO.File]::Open($statePath,'CreateNew','Write','None')
    try{$bytes=[Text.Encoding]::UTF8.GetBytes('{"sessions":{}}');$initialState.Write($bytes,0,$bytes.Length)}finally{$initialState.Dispose()}
  }
  Write-Host 'Configuration saved. Nothing has been started. Run Check before Start.'
  exit 0
}
Push-Location $gatewayRoot
try{
  Verify-Package
  if($Action -eq 'Offline'){Write-Host 'Offline package verification passed. No cloud or robot connection was made.';exit 0}
  if(-not (Test-Path -LiteralPath $configPath)){throw 'Run Configure first; this PC is not commissioned'}
  $config=Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
  if($config.sdkRevision -ne $manifest.sdkRevision){throw 'Configured SDK revision differs from this package'}
  $env:AGENTECH_GATEWAY_ID=$config.gatewayId
  $env:AGENTECH_GATEWAY_MODELS=ConvertTo-Json -InputObject @($config.models) -Compress
  $env:AGENTECH_GATEWAY_SESSION_IDS=ConvertTo-Json -InputObject @($config.sessionIds) -Compress
  & $node --input-type=module -e "import {gatewayAssignment} from './scripts/eaic-gateway-assignment.mjs'; gatewayAssignment();"
  if($LASTEXITCODE -ne 0){throw 'No valid exclusive booking assignment'}
  $env:SUPABASE_URL=$config.cloudUrl
  $secure=Read-GatewaySecret $credentialPath
  $env:SUPABASE_SERVICE_ROLE_KEY=[Net.NetworkCredential]::new('',$secure).Password
  $obsSecure=Read-GatewaySecret (Join-Path $configDir 'obs-key.dpapi')
  $env:OBS_WEBSOCKET_PASSWORD=[Net.NetworkCredential]::new('',$obsSecure).Password
  $env:OBS_WEBSOCKET_URL=$config.obsUrl
  $env:ROBOT_HOST=$config.aegisHost;$env:ROBOT_SSH_USER=$config.aegisUser;$env:ROBOT_SSH_KEY=$config.sshKey
  $env:ROBOT_LOCAL_PYTHON=$python;$env:AGENTECH_SDK_ROOT=Join-Path $gatewayRoot 'sdk';$env:AGENTECH_NAVI_SDK_ROOT=$env:AGENTECH_SDK_ROOT
  $env:AGENTECH_NAVI_HOST=$config.naviHost;$env:AGENTECH_NAVI_PORT=[string]$config.naviPort
  $env:AGENTECH_MASTER_DEPLOYMENT_FILE=$config.masterDeployment
  $env:PATH=(Join-Path $gatewayRoot 'runtime/node')+';'+$env:PATH
  Test-Tcp ([uri]$config.cloudUrl).DnsSafeHost 443
  Test-Tcp '127.0.0.1' 4455
  if($config.models -contains 'navi'){Test-Tcp $config.naviHost ([int]$config.naviPort)}
  if($config.models -contains 'aegis'){
    Get-Command ssh.exe,scp.exe -ErrorAction Stop | Out-Null
    if(-not (Test-Path -LiteralPath $config.sshKey -PathType Leaf)){throw 'Aegis SSH key is missing'}
    Test-Tcp $config.aegisHost 22
    & ssh.exe -i $config.sshKey -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=5 ($config.aegisUser+'@'+$config.aegisHost) 'true'
    if($LASTEXITCODE -ne 0){throw 'SSH key or trusted host key verification failed; review the host fingerprint with the operator'}
  }
  if($config.models -contains 'master'){
    if(-not (Test-Path -LiteralPath $config.masterDeployment)){throw 'Reviewed Master deployment is missing'}
    $master=Get-Content -LiteralPath $config.masterDeployment -Raw | ConvertFrom-Json
    if($master.enabled -ne $true){throw 'Master commissioning is not enabled'}
    if([IO.Path]::GetFullPath($master.sdk_root) -ne [IO.Path]::GetFullPath((Join-Path $gatewayRoot 'sdk'))){throw 'Master deployment must reference this installation SDK; review its pins before enabling it'}
    Test-Tcp $master.host 22
  }
  # Read-only cloud check. Never publish credentials or customer booking data.
  $headers=@{apikey=$env:SUPABASE_SERVICE_ROLE_KEY;Authorization=('Bearer '+$env:SUPABASE_SERVICE_ROLE_KEY)}
  try{$rows=Invoke-RestMethod -Uri ($config.cloudUrl.TrimEnd('/')+'/rest/v1/agentech_robot_sessions?select=id&limit=1') -Headers $headers -TimeoutSec 10}catch{throw 'Cloud authentication or booking table check failed'}
  Write-Host 'Connectivity checks passed. These checks do not qualify robot motion, streaming, or an end-to-end booking.'
  if($Action -eq 'Check'){exit 0}
  $lockPath=Join-Path $gatewayRoot '.gateway-launch.lock'
  # Exclusive OS handle prevents a second bridge in this installation. Never
  # kill an existing owner to acquire it; a crashed process releases its handle.
  try{$lock=[IO.File]::Open($lockPath,'OpenOrCreate','ReadWrite','None')}catch{throw 'This gateway installation already has a running launcher'}
  try{& $node (Join-Path $PSScriptRoot 'robot-stream-bridge.mjs');exit $LASTEXITCODE}finally{$lock.Dispose()}
}finally{
  Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY,Env:OBS_WEBSOCKET_PASSWORD -ErrorAction SilentlyContinue
  Pop-Location
}
