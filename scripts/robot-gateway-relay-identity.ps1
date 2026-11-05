# Classify protected Nodes by independent Windows ownership and the documented
# loopback metadata endpoint. Never open a video, SDK, or robot connection.
function Test-RelayCounter($Value) {
  return (($Value -is [int] -or $Value -is [long] -or $Value -is [uint32] -or $Value -is [uint64]) -and $Value -ge 0)
}

function ConvertTo-RelayProcessIdentity($Process) {
  if ($null -eq $Process -or $null -eq $Process.CreationDate -or $null -eq $Process.SessionId) {throw 'Incomplete protected process identity'}
  return [ordered]@{id=[long]$Process.ProcessId; name=$Process.Name; parent=[long]$Process.ParentProcessId;
    session=[long]$Process.SessionId; born=([datetime]$Process.CreationDate).ToUniversalTime().Ticks}
}

function Get-RelayWindowsSnapshot([long]$ProcessId) {
  $node=Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction Stop
  $identity=ConvertTo-RelayProcessIdentity $node
  $parent=ConvertTo-RelayProcessIdentity (Get-CimInstance Win32_Process -Filter "ProcessId=$($identity.parent)" -ErrorAction Stop)
  $grand=ConvertTo-RelayProcessIdentity (Get-CimInstance Win32_Process -Filter "ProcessId=$($parent.parent)" -ErrorAction Stop)
  $service=Get-CimInstance Win32_Service -Filter "Name='Schedule'" -ErrorAction Stop
  $listeners=@(Get-NetTCPConnection -State Listen -ErrorAction Stop)
  $own=@($listeners | Where-Object OwningProcess -eq $ProcessId | ForEach-Object {
    [ordered]@{address=$_.LocalAddress;port=[int]$_.LocalPort;id=[long]$_.OwningProcess}})
  $portOwners=@()
  if($own.Count -eq 1){
    $portOwners=@($listeners | Where-Object LocalPort -eq $own[0].port | ForEach-Object {
      [ordered]@{address=$_.LocalAddress;port=[int]$_.LocalPort;id=[long]$_.OwningProcess}})
  }
  return [ordered]@{node=$identity; parent=$parent; grand=$grand; service=[ordered]@{id=[long]$service.ProcessId;name=$service.Name;state=$service.State};
    own=$own; portOwners=$portOwners}
}

function Assert-RelayWindowsSnapshot($s,$listed) {
  if ($s.node.name -ine 'node.exe' -or $s.parent.name -ine 'powershell.exe' -or $s.grand.name -ine 'svchost.exe' -or
      $s.service.name -ine 'Schedule' -or $s.service.state -ne 'Running' -or $s.grand.id -ne $s.service.id -or
      $s.node.parent -ne $s.parent.id -or $s.parent.parent -ne $s.grand.id -or
      $s.node.session -ne 0 -or $s.parent.session -ne 0 -or $s.grand.session -ne 0 -or
      $s.grand.born -le 0 -or $s.parent.born -le $s.grand.born -or $s.node.born -le $s.parent.born -or
      $s.node.id -ne $listed.id -or $s.node.parent -ne $listed.parent -or $s.node.born -ne $listed.born -or
      $listed.session -ne 0 -or $listed.name -ine 'node.exe' -or
      $s.own.Count -ne 1 -or $s.portOwners.Count -ne 1) {throw 'Unverified protected Node service lineage or listener count'}
  $port=$s.own[0].port
  foreach($listener in @($s.own[0],$s.portOwners[0])){
    if($listener.id -ne $listed.id -or $listener.address -ne '127.0.0.1' -or
        $listener.port -ne $port -or $port -notin @(4173,4175)){throw 'Unverified protected Node listener ownership'}
  }
  return $port
}

function Get-RelayMetadata([int]$Port) {
  if($Port -notin @(4173,4175)){throw 'Unrecognized relay port'}
  Add-Type -AssemblyName System.Net.Http -ErrorAction Stop
  $handler=[Net.Http.HttpClientHandler]::new()
  $handler.AllowAutoRedirect=$false; $handler.UseProxy=$false
  $client=[Net.Http.HttpClient]::new($handler)
  $cancel=[Threading.CancellationTokenSource]::new(2500)
  try {
    $uri=[Uri]"http://127.0.0.1:$Port/health"
    $resp=$client.GetAsync($uri,[Net.Http.HttpCompletionOption]::ResponseHeadersRead,$cancel.Token).GetAwaiter().GetResult()
    try {
      if([int]$resp.StatusCode -ne 200 -or $resp.Content.Headers.ContentType.MediaType -ne 'application/json'){throw 'Invalid relay health response'}
      $stream=$resp.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
      $buf=[byte[]]::new(1024); $data=[IO.MemoryStream]::new()
      try {
        while(($n=$stream.ReadAsync($buf,0,$buf.Length,$cancel.Token).GetAwaiter().GetResult()) -gt 0){
          if($data.Length+$n -gt 16384){throw 'Oversized relay health response'}
          $data.Write($buf,0,$n)
        }
        return ([Text.UTF8Encoding]::new($false,$true).GetString($data.ToArray()) | ConvertFrom-Json -ErrorAction Stop)
      } finally {$data.Dispose(); $stream.Dispose()}
    } finally {$resp.Dispose()}
  } finally {$cancel.Dispose(); $client.Dispose(); $handler.Dispose()}
}

function Assert-RelayMetadata($health,[int]$Port) {
  if($health -isnot [pscustomobject] -or $health.ok -isnot [bool] -or !$health.ok -or
      $health.robot -notin @('connected','connecting') -or $health.h264 -isnot [pscustomobject] -or
      'lastFrameForwardedAt' -notin $health.PSObject.Properties.Name) {throw 'Unrecognized relay health schema'}
  foreach($name in @('viewers','sdkClients','pendingServiceCalls','upstreamConnectionGeneration','framesForwarded')){
    if(!(Test-RelayCounter $health.$name)){throw "Invalid relay health counter: $name"}
  }
  if($health.pendingServiceCalls -ne 0){throw 'Relay has pending SDK service calls'}
  if($null -ne $health.lastFrameForwardedAt -and !(Test-RelayCounter $health.lastFrameForwardedAt)){throw 'Invalid last-frame timestamp'}
  if($Port -eq 4173 -and $health.h264.role -ceq 'preview' -and $health.h264.state -ceq 'proxy'){return}
  if($Port -eq 4175 -and $health.h264.role -ceq 'primary' -and
      $health.h264.state -cin @('idle','connecting','connected','reconnecting') -and
      (Test-RelayCounter $health.h264.generation) -and (Test-RelayCounter $health.h264.viewers) -and
      $health.h264.cameras -is [pscustomobject]){return}
  throw 'Relay health role does not match its documented port'
}

function Assert-ProtectedMediaRelay($Process, [scriptblock]$Snapshot={param($ProcessId) Get-RelayWindowsSnapshot $ProcessId},
    [scriptblock]$ReadMetadata={param($Port) Get-RelayMetadata $Port}) {
  $listed=ConvertTo-RelayProcessIdentity $Process
  if($listed.name -ine 'node.exe' -or $listed.session -ne 0){throw 'Cannot classify unreadable process as a protected relay'}
  $before=& $Snapshot $listed.id
  $port=Assert-RelayWindowsSnapshot $before $listed
  $health=& $ReadMetadata $port
  $after=& $Snapshot $listed.id
  $confirmed=Assert-RelayWindowsSnapshot $after $listed
  if($confirmed -ne $port -or ($before | ConvertTo-Json -Depth 6 -Compress) -cne ($after | ConvertTo-Json -Depth 6 -Compress)){
    throw 'Protected relay PID, listener, or lineage changed during health check'
  }
  Assert-RelayMetadata $health $port
}
