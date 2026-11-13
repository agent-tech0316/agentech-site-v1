param([Parameter(Mandatory=$true)][string]$GatewayRoot)
$ErrorActionPreference = 'Stop'
$answers = [Console]::In.ReadToEnd() | ConvertFrom-Json
function Read-Host([string]$Prompt, [switch]$AsSecureString) {
    $value = switch -Wildcard ($Prompt) {
        'Unique gateway name*' { $answers.gatewayId }
        'Robot models*' { $answers.model }
        'Agentech cloud Supabase*' { $answers.cloudUrl }
        'Cloud service role key*' { $answers.cloudKey }
        'Local OBS WebSocket password*' { $answers.obsPassword }
        'Master deployment*' { $answers.masterDeployment }
        'Full path to reviewed Master*' { $answers.masterDeployment }
        'Navi rosbridge host*' { $answers.robotHost }
        'Aegis SSH host*' { $answers.robotHost }
        'Aegis SSH user*' { $answers.aegisUser }
        'Full path to the Aegis*' { $answers.sshKey }
        default { throw 'Gateway installer prompts have changed. Check the release.' }
    }
    if (!$value) { throw "Missing setup value for $Prompt" }
    if ($AsSecureString) { return ConvertTo-SecureString $value -AsPlainText -Force }
    return [string]$value
}
& (Join-Path $PSScriptRoot 'site-gateway.ps1') -GatewayRoot $GatewayRoot -Action Configure
