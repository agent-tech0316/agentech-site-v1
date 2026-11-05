import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

// Run the exact production PowerShell role checks with injected, offline
// observations. The actual Windows listener/service API and /health are never contacted.
test('protected relay requires exact lineage, stable exclusive listener, genuine per-role health and zero pending calls',
  {skip:process.platform !== 'win32'}, () => {
  const source=String.raw`
$ErrorActionPreference='Stop'
. $env:EAIC_RELAY_TEST_HELPER
$created=[datetime]::new(2026,11,5,11,0,0,[DateTimeKind]::Utc)
$listed=[pscustomobject]@{ProcessId=42;Name='node.exe';ParentProcessId=31;SessionId=0;CreationDate=$created}
function fixture([int]$port) {
  $own=@([ordered]@{id=42;address='127.0.0.1';port=$port})
  return [ordered]@{node=(ConvertTo-RelayProcessIdentity $listed);parent=[ordered]@{id=31;name='powershell.exe';parent=20;session=0;born=$created.Ticks-10};
    grand=[ordered]@{id=20;name='svchost.exe';parent=1;session=0;born=$created.Ticks-20};
    service=[ordered]@{id=20;name='Schedule';state='Running'};own=$own;portOwners=$own}
}
function health([int]$port) {
  $codec=if($port -eq 4173){[pscustomobject]@{role='preview';state='proxy'}}else{[pscustomobject]@{role='primary';state='idle';generation=0;viewers=0;cameras=[pscustomobject]@{}}}
  return [pscustomobject]@{ok=$true;robot='connecting';viewers=0;sdkClients=0;pendingServiceCalls=0;
    upstreamConnectionGeneration=1;framesForwarded=0;lastFrameForwardedAt=$null;h264=$codec}
}
function run($port,$mutate,$expected) {
  $a=fixture $port; $b=fixture $port; $h=health $port
  if($mutate){& $mutate $a $b $h}
  $q=[Collections.Queue]::new();$q.Enqueue($a);$q.Enqueue($b)
  $valid=$true
  try{Assert-ProtectedMediaRelay $listed -Snapshot {param($id) $q.Dequeue()} -ReadMetadata {param($p) $h}}catch{$valid=$false}
  if($valid -ne $expected){throw "Unexpected acceptance=$valid for fixture $mutate"}
}
run 4173 $null $true
run 4175 $null $true
$invalid=@(
  {param($a,$b,$h) $a.parent.name='cmd.exe'},
  {param($a,$b,$h) $a.parent.id=99},
  {param($a,$b,$h) $a.grand.name='node.exe'},
  {param($a,$b,$h) $a.service.id=19},
  {param($a,$b,$h) $a.service.state='Stopped'},
  {param($a,$b,$h) $a.node.session=2},
  {param($a,$b,$h) $a.parent.born=$a.node.born+1},
  {param($a,$b,$h) $a.own[0].address='0.0.0.0'},
  {param($a,$b,$h) $a.own=@($a.own[0],$a.own[0])},
  {param($a,$b,$h) $a.portOwners=@($a.portOwners[0],$a.portOwners[0])},
  {param($a,$b,$h) $a.own[0].id=45},
  {param($a,$b,$h) $b.node.born++},
  {param($a,$b,$h) $b.grand.born++},
  {param($a,$b,$h) $b.parent.id=55; $b.node.parent=55},
  {param($a,$b,$h) $b.own[0].port=4175},
  {param($a,$b,$h) $h.pendingServiceCalls=1},
  {param($a,$b,$h) $h.upstreamConnectionGeneration='1'},
  {param($a,$b,$h) $h.ok='true'},
  {param($a,$b,$h) $h.h264.role='primary'},
  {param($a,$b,$h) $h.h264.state='idle'},
  {param($a,$b,$h) $h.PSObject.Properties.Remove('lastFrameForwardedAt')}
)
foreach($case in $invalid){run 4173 $case $false}
run 4177 $null $false
run 4175 {param($a,$b,$h) $h.h264.cameras=@()} $false
run 4175 {param($a,$b,$h) $h.h264.generation=-1} $false
run 4175 {param($a,$b,$h) $h.h264.state='protocol-error'} $false
$listed.Name='python.exe'
run 4173 $null $false
$listed.Name='node.exe';$listed.SessionId=1
run 4173 $null $false
Write-Output 'offline relay identity checks passed'
`;
  const result=spawnSync(process.env.AGENTECH_GATEWAY_POWERSHELL || 'pwsh',
    ['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(source,'utf16le').toString('base64')],
    {encoding:'utf8',timeout:15000,windowsHide:true,env:{...process.env,
      EAIC_RELAY_TEST_HELPER:fileURLToPath(new URL('./robot-gateway-relay-identity.ps1',import.meta.url))}});
  assert.equal(result.status,0,result.error?.message||result.stderr);
  assert.match(result.stdout,/offline relay identity checks passed/);
});
