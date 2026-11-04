function Get-CommandLineTokens {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$CommandLine
  )

  # Accept complete quoted/unquoted arguments only. Ambiguous Windows quote
  # escaping and joined quoted fragments are refused rather than guessed.
  if ($CommandLine -match '[\r\n\x00]') { throw "Unsupported command-line quoting." }
  $lastEnd = 0
  $count = 0
  $arguments = [Collections.Generic.List[string]]::new()
  foreach ($match in [regex]::Matches($CommandLine, '"[^"\r\n]*"|[^\s"]+')) {
    $gap = $CommandLine.Substring($lastEnd, $match.Index - $lastEnd)
    if ($gap -match '\S' -or ($count -gt 0 -and $gap.Length -eq 0)) {
      throw "Unsupported command-line quoting."
    }
    $argument = $match.Value
    if ($argument.StartsWith('"')) {
      if ($argument.Contains('\"')) { throw "Unsupported command-line quoting." }
      $argument = $argument.Substring(1, $argument.Length - 2)
    }
    $arguments.Add($argument)
    $lastEnd = $match.Index + $match.Length
    $count++
  }
  if ($CommandLine.Substring($lastEnd) -match '\S') { throw "Unsupported command-line quoting." }
  $arguments.ToArray()
}

function Test-AbsoluteScriptPath {
  param([string]$Path)

  # IsPathRooted alone also accepts drive-relative paths such as C:script.py.
  return $Path -match '^(?:[a-zA-Z]:[\\/]|\\\\[^\\/?\.][^\\/]*[\\/][^\\/]+[\\/])'
}

function Get-CommandLineEntryScript {
  param([string[]]$Tokens)

  if ($Tokens.Count -lt 2) { return $null }
  $executable = [IO.Path]::GetFileName($Tokens[0]).ToLowerInvariant()
  $isNode = $executable -in @('node', 'node.exe')
  $isPython = $executable -match '^(?:python(?:w|\d+(?:\.\d+)?)?|py)(?:\.exe)?$'
  $isPowerShell = $executable -in @('powershell', 'powershell.exe', 'pwsh', 'pwsh.exe')
  if (-not ($isNode -or $isPython -or $isPowerShell)) { return $null }

  for ($index = 1; $index -lt $Tokens.Count; $index++) {
    $argument = $Tokens[$index]
    if ($isPowerShell) {
      if ($argument -ieq '-File') {
        if ($index + 1 -lt $Tokens.Count) { return $Tokens[$index + 1] }
        return $null
      }
      if ($argument -in @('-NoProfile', '-NonInteractive', '-NoLogo', '-Sta', '-Mta')) { continue }
      if ($argument -in @('-ExecutionPolicy', '-WindowStyle')) {
        $index++
        if ($index -ge $Tokens.Count) { return $null }
        $allowed = if ($argument -ieq '-ExecutionPolicy') {
          @('AllSigned', 'Bypass', 'Default', 'RemoteSigned', 'Restricted', 'Undefined', 'Unrestricted')
        } else { @('Normal', 'Hidden', 'Minimized', 'Maximized') }
        if ($Tokens[$index] -notin $allowed) { return $null }
        continue
      }
      return $null
    }

    if ($argument -eq '--') {
      if ($index + 1 -lt $Tokens.Count) { return $Tokens[$index + 1] }
      return $null
    }
    if (-not $argument.StartsWith('-')) { return $argument }
    if ($isNode) {
      if ($argument -cin @('--no-warnings', '--trace-warnings', '--trace-uncaught', '--enable-source-maps', '--experimental-strip-types', '--inspect', '--inspect-brk')) { continue }
      if ($argument -cmatch '^--(?:inspect|inspect-brk|unhandled-rejections|stack-trace-limit|max-old-space-size)=[^\s]+$') { continue }
      if ($argument -cin @('-r', '--require', '--import')) {
        $index++
        if ($index -ge $Tokens.Count -or -not $Tokens[$index] -or $Tokens[$index].StartsWith('-')) { return $null }
        continue
      }
      if ($argument -cmatch '^--(?:require|import)=.+$') { continue }
    } elseif ($isPython) {
      if ($argument -cin @('-u', '-B', '-E', '-I', '-s', '-S', '-O', '-OO', '-q')) { continue }
      if ($executable -in @('py', 'py.exe') -and $argument -cmatch '^-[23](?:\.\d+)?$') { continue }
      if ($argument -cin @('-W', '-X')) {
        $index++
        if ($index -ge $Tokens.Count -or -not $Tokens[$index] -or $Tokens[$index].StartsWith('-')) { return $null }
        continue
      }
      if ($argument -cmatch '^-(?:W|X).+$') { continue }
    }
    # Eval, module, syntax-check, and unrecognized options do not prove an entry script.
    return $null
  }
  return $null
}

function Test-CommandLineArgumentPath {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$CommandLine,

    [Parameter(Mandatory = $true)]
    [string]$ExpectedPath
  )

  try {
    if (-not (Test-AbsoluteScriptPath -Path $ExpectedPath)) { return $false }
    $tokens = @(Get-CommandLineTokens -CommandLine $CommandLine)
    $entryScript = Get-CommandLineEntryScript -Tokens $tokens
    if (-not $entryScript -or -not (Test-AbsoluteScriptPath -Path $entryScript)) { return $false }
    $expected = [IO.Path]::GetFullPath($ExpectedPath)
    $actual = [IO.Path]::GetFullPath($entryScript)
    return $actual.Equals($expected, [StringComparison]::OrdinalIgnoreCase)
  } catch {
    return $false
  }
}

function Get-RobotStreamRestartBlockers {
  [CmdletBinding()]
  param(
    [AllowNull()]$State,
    [DateTimeOffset]$Now = [DateTimeOffset]::UtcNow
  )

  if ($State -isnot [pscustomobject] -or $State.sessions -isnot [pscustomobject]) {
    throw "Malformed Gateway state: expected an object containing a sessions object."
  }
  # A later completed cleanup can settle restart ownership for old history,
  # without changing that history's failed outcome or granting motion readiness.
  # Match the bridge's legacy model default (AEGIS) and require a later booking's
  # start, not just a late write to an old result, to prove ordering.
  $verifiedCleanupStarts = @{}
  foreach ($candidateProperty in $State.sessions.PSObject.Properties) {
    $candidate = $candidateProperty.Value
    if ($candidate -isnot [pscustomobject] -or $candidate.status -ne 'finished' -or
        $null -ne $candidate.naviCleanupOwner -or $candidate.executionStatus -in @('pending', 'staged', 'running')) { continue }
    $candidateRequired = if ($null -ne $candidate.endCleanupRequired) { $candidate.endCleanupRequired } else { $candidate.endLieDownRequired }
    $candidateCleanup = if ($null -ne $candidate.endCleanupStatus) { $candidate.endCleanupStatus } else { $candidate.endLieDownStatus }
    if ($candidateRequired -ne $true -or $candidateCleanup -ne 'completed') { continue }
    $candidateModel = if ($null -eq $candidate.executionModel) { 'aegis' } else { $candidate.executionModel }
    if ($candidateModel -notin @('aegis', 'navi')) { continue }
    $candidateStart = [DateTimeOffset]::MinValue
    $candidateEnd = [DateTimeOffset]::MinValue
    if ($candidate.start -isnot [string] -or $candidate.end -isnot [string] -or
        $candidate.start -notmatch 'T.*(?:Z|[+-]\d{2}:\d{2})$' -or
        -not [DateTimeOffset]::TryParse($candidate.start, [ref]$candidateStart) -or
        -not [DateTimeOffset]::TryParse($candidate.end, [ref]$candidateEnd) -or
        $candidateEnd -lt $candidateStart -or $candidateEnd -gt $Now) { continue }
    if ($candidateModel -eq 'navi') {
      $receipt = $candidate.endCleanupResult
      if ($receipt -isnot [pscustomobject] -or $receipt.succeeded -ne $true -or
          $receipt.damping_completed -ne $true -or $receipt.terminal_state -ne 'lowered_damped' -or
          $receipt.final_state.standing -ne $false -or $receipt.final_state.error -ne 0 -or
          $receipt.final_state.warning -ne 0) { continue }
    }
    if (-not $verifiedCleanupStarts.ContainsKey($candidateModel) -or
        $candidateStart -gt $verifiedCleanupStarts[$candidateModel]) {
      $verifiedCleanupStarts[$candidateModel] = $candidateStart
    }
  }
  foreach ($property in $State.sessions.PSObject.Properties) {
    $session = $property.Value
    $label = "session $($property.Name)"
    if ($session -isnot [pscustomobject] -or $session.status -isnot [string] -or
        $session.status -notin @('pending', 'staged', 'running', 'publishing', 'completed', 'finished', 'skipped', 'failed')) {
      throw "Malformed Gateway state: $label has an invalid status."
    }
    $end = [DateTimeOffset]::MinValue
    if ($session.end -isnot [string] -or $session.end -notmatch 'T.*(?:Z|[+-]\d{2}:\d{2})$' -or
        -not [DateTimeOffset]::TryParse($session.end, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::None, [ref]$end)) {
      throw "Malformed Gateway state: $label has an invalid scheduled end."
    }
    $executionStatus = $session.executionStatus
    if ($null -ne $executionStatus -and ($executionStatus -isnot [string] -or
        $executionStatus -notin @('pending', 'staged', 'running', 'completed', 'failed'))) {
      throw "Malformed Gateway state: $label has an invalid executionStatus."
    }
    $cleanupRequired = if ($null -ne $session.endCleanupRequired) { $session.endCleanupRequired } else { $session.endLieDownRequired }
    $cleanupStatus = if ($null -ne $session.endCleanupStatus) { $session.endCleanupStatus } else { $session.endLieDownStatus }
    if ($null -ne $cleanupRequired -and $cleanupRequired -isnot [bool]) {
      throw "Malformed Gateway state: $label has an invalid cleanup requirement."
    }
    if ($null -ne $cleanupStatus -and ($cleanupStatus -isnot [string] -or
        $cleanupStatus -notin @('pending', 'running', 'failed', 'unknown', 'completed', 'not_required', 'not_started'))) {
      throw "Malformed Gateway state: $label has an invalid cleanup status."
    }

    if ($session.status -in @('pending', 'staged', 'running', 'publishing', 'completed') -or $end -gt $Now) {
      "$label is active or has not finished its booked interval"
      continue
    }
    if ($null -ne $session.naviCleanupOwner) {
      "$label still has an unresolved cleanup owner"
      continue
    }
    # The bridge expires an unlaunched AEGIS plan without collecting an
    # execution result. Its historical pending value is not an active runner.
    $neverStarted = $session.status -eq 'finished' -and $session.executionModel -eq 'aegis' -and
      $executionStatus -eq 'pending' -and $cleanupRequired -eq $false -and
      $cleanupStatus -eq 'not_started' -and $null -eq $session.pid
    if ($neverStarted) { continue }
    if ($executionStatus -in @('pending', 'staged', 'running')) {
      "$label has unresolved execution"
      continue
    }
    # Failed admission/expired staging never created a physical cleanup owner.
    if ($session.status -eq 'finished' -and $session.executionModel -in @('aegis', 'navi', 'master') -and
        $cleanupRequired -eq $false -and $cleanupStatus -eq 'not_started' -and $null -eq $session.pid) { continue }
    $model = if ($null -eq $session.executionModel) { 'aegis' } else { $session.executionModel }
    $cleanupAttempts = if ($null -ne $session.endCleanupAttempts) { $session.endCleanupAttempts } else { $session.endLieDownAttempts }
    $legacyHistory = $null -eq $cleanupRequired -and $null -eq $cleanupStatus -and $null -eq $executionStatus
    $exhaustedHistory = $cleanupRequired -eq $true -and $cleanupStatus -eq 'failed' -and
      ($cleanupAttempts -is [int] -or $cleanupAttempts -is [long]) -and $cleanupAttempts -ge 3
    if (($legacyHistory -or $exhaustedHistory) -and $verifiedCleanupStarts.ContainsKey($model) -and
        $verifiedCleanupStarts[$model] -ge $end) { continue }
    if ($cleanupStatus -notin @('completed', 'not_required') -or
        ($cleanupStatus -eq 'not_required' -and $cleanupRequired -ne $false)) {
      "$label has unresolved cleanup"
    }
  }
}

function Get-RobotStreamBridgeProcess {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$BridgeScript
  )

  @(
    Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
      Where-Object {
        $_.CommandLine -and
        (Test-CommandLineArgumentPath -CommandLine $_.CommandLine -ExpectedPath $BridgeScript)
      }
  )
}
