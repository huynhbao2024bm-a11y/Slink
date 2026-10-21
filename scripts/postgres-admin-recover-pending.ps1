param()

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$secretPath = Join-Path $repoRoot '.local-data\postgres-admin.dpapi'
$pendingPath = "$secretPath.pending"
$psql = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'

if (-not (Test-Path -LiteralPath $secretPath)) {
  throw 'The saved DPAPI-protected PostgreSQL administrator credential is missing.'
}
if (-not (Test-Path -LiteralPath $pendingPath)) {
  throw 'No pending administrator credential exists; nothing to recover.'
}
if (-not (Test-Path -LiteralPath $psql)) {
  throw "psql.exe was not found at '$psql'."
}

function Convert-ProtectedFileToPlaintext([string] $Path) {
  $protected = [System.IO.File]::ReadAllText($Path).Trim()
  $secure = ConvertTo-SecureString $protected
  $bstr = [IntPtr]::Zero
  try {
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
    if ($secure) { $secure.Dispose() }
    $protected = $null
  }
}

function Test-PostgresCredential([string] $Password) {
  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = $psql
  $startInfo.Arguments = '-X -q -w -A -t -h 127.0.0.1 -p 5433 -U postgres -d postgres -c "SELECT current_user;"'
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.EnvironmentVariables['PGPASSWORD'] = $Password

  $process = New-Object System.Diagnostics.Process
  try {
    $process.StartInfo = $startInfo
    if (-not $process.Start()) { throw 'Could not start psql.' }
    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    $process.WaitForExit()

    if ($process.ExitCode -eq 0 -and $stdout.Trim() -eq 'postgres') { return 'valid' }
    if ($stderr -match 'password authentication failed|no password supplied') { return 'invalid' }
    if ($stderr -match 'connection refused|could not connect|timed out|actively refused') { return 'unreachable' }
    return 'unknown'
  } finally {
    $stdout = $null
    $stderr = $null
    $process.Dispose()
  }
}

$savedPassword = $null
$pendingPassword = $null
try {
  $savedPassword = Convert-ProtectedFileToPlaintext $secretPath
  $pendingPassword = Convert-ProtectedFileToPlaintext $pendingPath

  $savedStatus = Test-PostgresCredential $savedPassword
  if ($savedStatus -eq 'unreachable') {
    throw 'PostgreSQL is not reachable at 127.0.0.1:5433. Neither credential file was changed; start the local cluster and retry.'
  }
  if ($savedStatus -eq 'unknown') {
    throw 'Could not safely determine whether the saved credential works. Neither credential file was changed.'
  }

  $pendingStatus = Test-PostgresCredential $pendingPassword
  if ($pendingStatus -eq 'unreachable') {
    throw 'PostgreSQL became unreachable during the check. Neither credential file was changed.'
  }
  if ($pendingStatus -eq 'unknown') {
    throw 'Could not safely determine whether the pending credential works. Neither credential file was changed.'
  }

  if ($savedStatus -eq 'valid' -and $pendingStatus -eq 'valid') {
    if (-not [string]::Equals($savedPassword, $pendingPassword, [StringComparison]::Ordinal)) {
      throw 'Both distinct credentials were accepted. This is unexpected; neither file was changed.'
    }
    Remove-Item -LiteralPath $pendingPath -Force
    Write-Output 'Both files contain the same working credential. The redundant pending file was removed.'
    return
  }

  if ($pendingStatus -eq 'valid') {
    $savedAcl = Get-Acl -LiteralPath $secretPath
    [System.IO.File]::Replace($pendingPath, $secretPath, $null)
    Set-Acl -LiteralPath $secretPath -AclObject $savedAcl
    Write-Output 'The pending credential is accepted by PostgreSQL. It is now the saved DPAPI credential; the password itself was not displayed.'
    return
  }

  if ($savedStatus -eq 'valid') {
    Remove-Item -LiteralPath $pendingPath -Force
    Write-Output 'The saved credential is accepted by PostgreSQL and the pending credential is not. The stale pending file was removed; the database password was not changed.'
    return
  }

  throw 'Neither DPAPI credential is accepted by PostgreSQL. Both files were preserved; password recovery is required before retrying rotation.'
} finally {
  $savedPassword = $null
  $pendingPassword = $null
}
