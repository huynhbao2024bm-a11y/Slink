param()

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$secretPath = Join-Path $repoRoot '.local-data\postgres-admin.dpapi'
$secretDirectory = Split-Path -Parent $secretPath
$pendingPath = "$secretPath.pending"
$psql = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
$temporaryFiles = @(Get-ChildItem -LiteralPath $secretDirectory -Filter 'postgres-admin.dpapi.reset-*.tmp' -File -Force -ErrorAction SilentlyContinue)

if (-not (Test-Path -LiteralPath $secretPath)) { throw 'The existing DPAPI credential file is missing.' }
if ($temporaryFiles.Count -ne 1) {
  throw "Expected one verified reset credential file, found $($temporaryFiles.Count). No file was changed."
}
if (-not (Test-Path -LiteralPath $psql)) { throw "psql.exe was not found at '$psql'." }

$password = $null
$bstr = [IntPtr]::Zero
$process = $null
try {
  $protected = [System.IO.File]::ReadAllText($temporaryFiles[0].FullName).Trim()
  $secure = ConvertTo-SecureString $protected
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)

  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = $psql
  $startInfo.Arguments = '-X -q -w -A -t -h 127.0.0.1 -p 5433 -U postgres -d postgres -c "SELECT current_user;"'
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.EnvironmentVariables['PGPASSWORD'] = $password

  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $startInfo
  if (-not $process.Start()) { throw 'Could not start the PostgreSQL credential check.' }
  $output = $process.StandardOutput.ReadToEnd()
  $errorOutput = $process.StandardError.ReadToEnd()
  $process.WaitForExit()
  if ($process.ExitCode -ne 0 -or $output.Trim() -ne 'postgres') {
    throw 'The saved temporary credential did not authenticate. All credential files were preserved.'
  }

  $credentialBackup = "$secretPath.before-finalize-$([Guid]::NewGuid().ToString('N')).bak"
  [System.IO.File]::Copy($secretPath, $credentialBackup, $false)
  Set-Acl -LiteralPath $temporaryFiles[0].FullName -AclObject (Get-Acl -LiteralPath $secretPath)
  Move-Item -LiteralPath $temporaryFiles[0].FullName -Destination $secretPath -Force
  if (Test-Path -LiteralPath $temporaryFiles[0].FullName) {
    throw "The working credential was verified but not promoted. The temporary file remains at $($temporaryFiles[0].FullName)"
  }

  if (Test-Path -LiteralPath $pendingPath) {
    try {
      Remove-Item -LiteralPath $pendingPath -Force
    } catch {
      Write-Warning 'The verified credential is saved, but the obsolete .pending file could not be removed. The saved credential can be used; the pending file can be cleaned up later.'
    }
  }
  Write-Output 'The temporary credential authenticated successfully and is now saved as the DPAPI administrator credential.'
  Write-Output "Previous encrypted credential backup: $credentialBackup"
} finally {
  if ($process) { $process.Dispose() }
  $output = $null
  $errorOutput = $null
  $protected = $null
  $password = $null
  if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  if ($secure) { $secure.Dispose() }
}
