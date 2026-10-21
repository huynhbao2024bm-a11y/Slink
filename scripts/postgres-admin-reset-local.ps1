param()

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$pgData = Join-Path $repoRoot '.local-data\postgres-native'
$pgBin = if ($env:SLINK_PG_BIN) { $env:SLINK_PG_BIN } else { 'C:\Program Files\PostgreSQL\18\bin' }
$pgCtl = Join-Path $pgBin 'pg_ctl.exe'
$psql = Join-Path $pgBin 'psql.exe'
$pgHba = Join-Path $pgData 'pg_hba.conf'
$secretPath = Join-Path $repoRoot '.local-data\postgres-admin.dpapi'
$pendingPath = "$secretPath.pending"
$backupParent = 'D:\Slink-postgres-backups'
$backupPath = $null
$backupData = $null
$originalHbaBytes = $null
$temporaryHbaActive = $false
$newSecure = $null
$newPassword = $null
$newBstr = [IntPtr]::Zero
$process = $null

foreach ($requiredPath in @((Join-Path $pgData 'PG_VERSION'), $pgCtl, $psql, $pgHba, $secretPath)) {
  if (-not (Test-Path -LiteralPath $requiredPath)) {
    throw "Required Slink PostgreSQL file was not found: $requiredPath"
  }
}
if (([System.IO.File]::ReadAllText((Join-Path $pgData 'PG_VERSION'))).Trim() -ne '18') {
  throw 'This recovery procedure is restricted to the existing PostgreSQL 18 Slink cluster.'
}

$apiListeners = @(Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue)
if ($apiListeners.Count -gt 0) {
  throw 'Stop the Slink API on port 3000 first (Ctrl+C in its PowerShell window), then rerun this script. No database files were changed.'
}

$pgListeners = @(Get-NetTCPConnection -State Listen -LocalPort 5433 -ErrorAction SilentlyContinue)
& $pgCtl status -D $pgData *> $null
$clusterRunning = $LASTEXITCODE -eq 0
if ($pgListeners.Count -gt 0 -and -not $clusterRunning) {
  throw 'Port 5433 is occupied by a process not confirmed as this Slink cluster. No files were changed.'
}
if ($clusterRunning) {
  & $pgCtl stop -D $pgData -m fast -w
  if ($LASTEXITCODE -ne 0) { throw 'Could not cleanly stop the Slink PostgreSQL cluster. No backup or password change was attempted.' }
}

$stillListening = @(Get-NetTCPConnection -State Listen -LocalPort 5433 -ErrorAction SilentlyContinue)
if ($stillListening.Count -gt 0) {
  throw 'Port 5433 is still listening after the stop request. Do not copy the data directory; inspect the listener first.'
}
if (Test-Path -LiteralPath (Join-Path $pgData 'postmaster.pid')) {
  throw 'A PostgreSQL postmaster.pid remains after shutdown. The cluster was not copied or modified; inspect the PostgreSQL log before retrying.'
}

$reparseItems = @(Get-ChildItem -LiteralPath $pgData -Force -Recurse -ErrorAction Stop | Where-Object {
  ($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0
})
if ($reparseItems.Count -gt 0) {
  throw 'The PostgreSQL data directory contains a junction or symbolic link. This backup helper stops before copying so external tablespaces are not omitted.'
}

$sourceFiles = @(Get-ChildItem -LiteralPath $pgData -File -Force -Recurse -ErrorAction Stop)
$sourceBytes = [long](($sourceFiles | Measure-Object -Property Length -Sum).Sum)
$driveFree = (Get-PSDrive -Name D).Free
if ($driveFree -lt ($sourceBytes + 50MB)) {
  throw 'There is not enough free space on D: for a full PostgreSQL backup. No password change was attempted.'
}

if (-not (Test-Path -LiteralPath $backupParent)) {
  New-Item -ItemType Directory -Path $backupParent -Force | Out-Null
}
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupPath = Join-Path $backupParent "postgres-native-$stamp"
if (Test-Path -LiteralPath $backupPath) { throw "Backup destination already exists: $backupPath" }
New-Item -ItemType Directory -Path $backupPath | Out-Null

$currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$backupAcl = Get-Acl -LiteralPath $backupPath
$backupAcl.SetAccessRuleProtection($true, $false)
foreach ($existingRule in @($backupAcl.Access)) { $null = $backupAcl.RemoveAccessRuleSpecific($existingRule) }
$backupAcl.SetOwner($currentSid)
$inheritFlags = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
$userOnlyRule = [System.Security.AccessControl.FileSystemAccessRule]::new(
  $currentSid,
  [System.Security.AccessControl.FileSystemRights]::FullControl,
  $inheritFlags,
  [System.Security.AccessControl.PropagationFlags]::None,
  [System.Security.AccessControl.AccessControlType]::Allow
)
$backupAcl.AddAccessRule($userOnlyRule)
Set-Acl -LiteralPath $backupPath -AclObject $backupAcl

$backupData = Join-Path $backupPath 'postgres-native'
$null = [System.IO.File]::Copy($secretPath, (Join-Path $backupPath 'postgres-admin.dpapi.before-reset'), $false)
if (Test-Path -LiteralPath $pendingPath) {
  $null = [System.IO.File]::Copy($pendingPath, (Join-Path $backupPath 'postgres-admin.dpapi.pending.before-reset'), $false)
}

& robocopy.exe $pgData $backupData /E /COPY:DAT /DCOPY:DAT /R:1 /W:1 /NP /NFL /NDL
$copyExitCode = $LASTEXITCODE
if ($copyExitCode -ge 8) { throw "The physical backup copy failed (robocopy code $copyExitCode). No password change was attempted. Backup folder: $backupPath" }

$backupFiles = @(Get-ChildItem -LiteralPath $backupData -File -Force -Recurse -ErrorAction Stop)
if ($backupFiles.Count -ne $sourceFiles.Count) {
  throw "Backup file count mismatch ($($sourceFiles.Count) source, $($backupFiles.Count) copy). No password change was attempted. Backup folder: $backupPath"
}
$sourcePrefix = $pgData.TrimEnd('\') + '\'
foreach ($sourceFile in $sourceFiles) {
  $relativePath = $sourceFile.FullName.Substring($sourcePrefix.Length)
  $copyFilePath = Join-Path $backupData $relativePath
  if (-not (Test-Path -LiteralPath $copyFilePath -PathType Leaf)) {
    throw "A file is missing from the backup ($relativePath). No password change was attempted. Backup folder: $backupPath"
  }
  $sourceHash = (Get-FileHash -LiteralPath $sourceFile.FullName -Algorithm SHA256).Hash
  $copyHash = (Get-FileHash -LiteralPath $copyFilePath -Algorithm SHA256).Hash
  if ($sourceHash -ne $copyHash) {
    throw "Backup verification failed for $relativePath. No password change was attempted. Backup folder: $backupPath"
  }
}

$originalHbaBytes = [System.IO.File]::ReadAllBytes($pgHba)
$hbaBackup = Join-Path $backupPath 'pg_hba.conf.original'
[System.IO.File]::WriteAllBytes($hbaBackup, $originalHbaBytes)
$manifest = @(
  'Slink PostgreSQL physical backup',
  "Created: $(Get-Date -Format o)",
  "PostgreSQL major: 18",
  "Source: $pgData",
  "Files: $($sourceFiles.Count)",
  "Bytes: $sourceBytes",
  'Verification: SHA-256 matched for every file before password reset.'
) -join "`r`n"
[System.IO.File]::WriteAllText((Join-Path $backupPath 'BACKUP-MANIFEST.txt'), $manifest, [System.Text.Encoding]::UTF8)
Write-Output "Verified offline backup created: $backupPath"

try {
  $trustPrefix = [System.Text.Encoding]::ASCII.GetBytes("host all postgres 127.0.0.1/32 trust`r`n")
  $temporaryHbaBytes = New-Object byte[] ($trustPrefix.Length + $originalHbaBytes.Length)
  [System.Buffer]::BlockCopy($trustPrefix, 0, $temporaryHbaBytes, 0, $trustPrefix.Length)
  [System.Buffer]::BlockCopy($originalHbaBytes, 0, $temporaryHbaBytes, $trustPrefix.Length, $originalHbaBytes.Length)
  [System.IO.File]::WriteAllBytes($pgHba, $temporaryHbaBytes)
  $temporaryHbaActive = $true

  & $pgCtl start -D $pgData -o '-h 127.0.0.1 -p 5433' -w
  if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL did not start with the temporary loopback-only recovery rule.' }

  Write-Host ''
  Write-Host 'In the psql prompt, enter: \password postgres'
  Write-Host 'Choose the new password there (input is hidden), then enter: \q'
  Write-Host 'The original pg_hba.conf will be restored and PostgreSQL restarted after psql exits.'
  & $psql -X -h 127.0.0.1 -p 5433 -U postgres -d postgres
  $psqlExitCode = $LASTEXITCODE
} finally {
  if ($temporaryHbaActive) {
    [System.IO.File]::WriteAllBytes($pgHba, $originalHbaBytes)
    & $pgCtl status -D $pgData *> $null
    if ($LASTEXITCODE -eq 0) {
      & $pgCtl stop -D $pgData -m fast -w
      if ($LASTEXITCODE -ne 0) {
        throw "Original pg_hba.conf was restored on disk, but PostgreSQL did not stop cleanly. Backup: $backupPath"
      }
    }
    $temporaryHbaActive = $false
  }
}

if ($psqlExitCode -ne 0) {
  throw "psql exited with code $psqlExitCode. The original pg_hba.conf is restored; the verified backup is at $backupPath."
}

& $pgCtl start -D $pgData -o '-h 127.0.0.1 -p 5433' -w
if ($LASTEXITCODE -ne 0) { throw "PostgreSQL did not restart with the original authentication rules. Backup: $backupPath" }

$newSecure = Read-Host 'Re-enter the new postgres password to verify it (input hidden)' -AsSecureString
try {
  $newBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($newSecure)
  $newPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($newBstr)

  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = $psql
  $startInfo.Arguments = '-X -q -w -A -t -h 127.0.0.1 -p 5433 -U postgres -d postgres -c "SELECT current_user;"'
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.EnvironmentVariables['PGPASSWORD'] = $newPassword

  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $startInfo
  if (-not $process.Start()) { throw 'Could not start the password verification query.' }
  $verifyOutput = $process.StandardOutput.ReadToEnd()
  $verifyError = $process.StandardError.ReadToEnd()
  $process.WaitForExit()
  if ($process.ExitCode -ne 0 -or $verifyOutput.Trim() -ne 'postgres') {
    throw "The new password was not verified. Database contents and the original DPAPI credential files were preserved. Verified backup: $backupPath"
  }

  $protectedNew = ConvertFrom-SecureString $newSecure
  $credentialTemp = "$secretPath.reset-$([Guid]::NewGuid().ToString('N')).tmp"
  [System.IO.File]::WriteAllText($credentialTemp, $protectedNew, [System.Text.Encoding]::ASCII)
  Set-Acl -LiteralPath $credentialTemp -AclObject (Get-Acl -LiteralPath $secretPath)
  $credentialBackup = "$secretPath.before-reset-$([Guid]::NewGuid().ToString('N')).bak"
  [System.IO.File]::Copy($secretPath, $credentialBackup, $false)
  Move-Item -LiteralPath $credentialTemp -Destination $secretPath -Force
  if (Test-Path -LiteralPath $pendingPath) { Remove-Item -LiteralPath $pendingPath -Force }

  Write-Output 'Password reset and localhost authentication verified. The new credential is DPAPI-encrypted for this Windows account; the stale pending credential was removed.'
  Write-Output "Verified data backup: $backupPath"
} finally {
  if ($process) { $process.Dispose() }
  $verifyOutput = $null
  $verifyError = $null
  $protectedNew = $null
  $newPassword = $null
  if ($newBstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($newBstr) }
  if ($newSecure) { $newSecure.Dispose() }
}
