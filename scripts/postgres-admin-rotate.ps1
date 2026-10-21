param()

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$secretPath = Join-Path $repoRoot '.local-data\postgres-admin.dpapi'
$pendingPath = "$secretPath.pending"
$psql = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'

if (-not (Test-Path -LiteralPath $secretPath)) {
  throw 'The DPAPI-protected local PostgreSQL administrator credential is missing.'
}
if (-not (Test-Path -LiteralPath $psql)) {
  throw "psql.exe was not found at '$psql'."
}
if (Test-Path -LiteralPath $pendingPath) {
  throw 'A previous password rotation left a .pending credential file. Resolve it before retrying.'
}

$newSecure = Read-Host 'Enter the new PostgreSQL postgres password (20+ characters)' -AsSecureString
$confirmSecure = Read-Host 'Enter the new password again' -AsSecureString
$newBstr = [IntPtr]::Zero
$confirmBstr = [IntPtr]::Zero
$oldBstr = [IntPtr]::Zero
$process = $null
$sqlMayHaveBeenApplied = $false

try {
  $newBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($newSecure)
  $confirmBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($confirmSecure)
  $newPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($newBstr)
  $confirmPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($confirmBstr)
  if ($newPassword.Length -lt 20) { throw 'Password rotation requires at least 20 characters.' }
  if (-not [string]::Equals($newPassword, $confirmPassword, [StringComparison]::Ordinal)) {
    throw 'The two new passwords do not match.'
  }

  $protectedOld = [System.IO.File]::ReadAllText($secretPath).Trim()
  $oldSecure = ConvertTo-SecureString $protectedOld
  $oldBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($oldSecure)
  $oldPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($oldBstr)

  $delimiter = '$slink_' + [Guid]::NewGuid().ToString('N') + '$'
  while ($newPassword.Contains($delimiter)) {
    $delimiter = '$slink_' + [Guid]::NewGuid().ToString('N') + '$'
  }
  $sql = 'ALTER ROLE postgres WITH PASSWORD ' + $delimiter + $newPassword + $delimiter + ';'

  $pendingProtected = ConvertFrom-SecureString $newSecure
  [System.IO.File]::WriteAllText($pendingPath, $pendingProtected, [System.Text.Encoding]::ASCII)
  Set-Acl -LiteralPath $pendingPath -AclObject (Get-Acl -LiteralPath $secretPath)

  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = $psql
  $startInfo.Arguments = '-X -q -w -h 127.0.0.1 -p 5433 -U postgres -d slink -v ON_ERROR_STOP=1'
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardInput = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.EnvironmentVariables['PGPASSWORD'] = $oldPassword

  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $startInfo
  if (-not $process.Start()) { throw 'Could not start psql.' }
  $sqlMayHaveBeenApplied = $true
  $process.StandardInput.WriteLine($sql)
  $process.StandardInput.Close()
  $null = $process.StandardOutput.ReadToEnd()
  $psqlError = $process.StandardError.ReadToEnd()
  $process.WaitForExit()
  if ($process.ExitCode -ne 0) {
    if ($psqlError -match 'password authentication failed') {
      throw 'The DPAPI credential does not match the current postgres password. No password was changed.'
    }
    if ($psqlError -match 'connection refused|could not connect') {
      throw 'PostgreSQL is not reachable on 127.0.0.1:5433. No password was changed.'
    }
    throw 'PostgreSQL rejected the rotation. The saved DPAPI credential was left unchanged.'
  }
  try {
    [System.IO.File]::Replace($pendingPath, $secretPath, $null)
  } catch {
    throw 'The PostgreSQL password changed, but its encrypted pending credential could not replace the saved file. Keep .local-data\postgres-admin.dpapi.pending for recovery.'
  }
  Write-Output 'PostgreSQL administrator password changed. The new credential is encrypted for this Windows account.'
} finally {
  if ($process) { $process.Dispose() }
  $newPassword = $null
  $confirmPassword = $null
  $oldPassword = $null
  $protectedOld = $null
  $pendingProtected = $null
  $psqlError = $null
  $sql = $null
  if ($newBstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($newBstr) }
  if ($confirmBstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($confirmBstr) }
  if ($oldBstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($oldBstr) }
  if ($newSecure) { $newSecure.Dispose() }
  if ($confirmSecure) { $confirmSecure.Dispose() }
  if ($oldSecure) { $oldSecure.Dispose() }
  if (-not $sqlMayHaveBeenApplied -and (Test-Path -LiteralPath $pendingPath)) {
    Remove-Item -LiteralPath $pendingPath -Force
  }
}
