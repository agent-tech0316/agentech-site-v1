$ErrorActionPreference='Stop'
if($env:OS -ne 'Windows_NT'){throw 'Run this DPAPI integration check on Windows'}
# Load the real credential reader without starting package verification,
# cloud polling, OBS or any robot transport.
$tokens=$null;$parseErrors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'eaic-windows-gateway.ps1'),[ref]$tokens,[ref]$parseErrors)
if($parseErrors.Count){throw 'Gateway launcher contains parse errors'}
$reader=$ast.Find({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Read-GatewaySecret'},$true)
if(-not $reader){throw 'Credential reader is missing'}
. ([scriptblock]::Create($reader.Extent.Text))
$testRoot=Join-Path ([IO.Path]::GetTempPath()) ('eaic-dpapi-check-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot | Out-Null
try{
  $expected=' roundtrip test with spaces '
  $secure=ConvertTo-SecureString -String $expected -AsPlainText -Force
  $encoded=ConvertFrom-SecureString $secure
  $file=Join-Path $testRoot 'secret.dpapi'
  $passed=0
  foreach($terminator in @('',"`n","`r`n","`r`n`r`n")){
    [IO.File]::WriteAllText($file,$encoded+$terminator)
    $decoded=Read-GatewaySecret $file
    if($decoded -isnot [Security.SecureString] -or [Net.NetworkCredential]::new('',$decoded).Password -cne $expected){throw 'Credential roundtrip lost the secret or its whitespace'}
    $passed++
  }
  foreach($bad in @('',"`r`n",'invalid-protected-value')){
    [IO.File]::WriteAllText($file,$bad)
    $refused=$false
    try{$null=Read-GatewaySecret $file}catch{$refused=$true}
    if(-not $refused){throw 'Invalid credential was accepted'}
    $passed++
  }
  # Exercise the same disk writer used by the configuration wizard.
  $wizardEncoded=ConvertFrom-SecureString $secure
  $wizardEncoded | Set-Content -LiteralPath $file -NoNewline
  if([IO.File]::ReadAllText($file) -cne $wizardEncoded){throw 'Wizard serialization introduced unexpected characters'}
  $decoded=Read-GatewaySecret $file
  if([Net.NetworkCredential]::new('',$decoded).Password -cne $expected){throw 'Wizard serialization could not be read'}
  $passed++
  [ordered]@{passed=$passed;dpapi_roundtrip=$true;legacy_newlines_supported=$true;invalid_values_refused=$true;network_connections_made=$false;robot_commands_sent=$false} | ConvertTo-Json -Compress
}finally{
  # Delete only the explicitly created test files and empty test directory.
  if(Test-Path -LiteralPath (Join-Path $testRoot 'secret.dpapi')){Remove-Item -LiteralPath (Join-Path $testRoot 'secret.dpapi')}
  Remove-Item -LiteralPath $testRoot
}
