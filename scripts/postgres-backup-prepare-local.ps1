param(
  [switch]$ApplyMigrations,
  [string]$VerifiedBackupManifest
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$envPath = Join-Path $repoRoot '.env'
$backupScript = Join-Path $repoRoot 'scripts\postgres-backup.js'
$migrationScript = Join-Path $repoRoot 'server\migrate.js'
$roleCheckScript = Join-Path $repoRoot 'scripts\postgres-role-check.js'
$pgDump = 'C:\Program Files\PostgreSQL\18\bin\pg_dump.exe'

if (-not (Test-Path -LiteralPath $envPath -PathType Leaf)) {
  throw 'The local .env file is missing. No credential or backup file was created.'
}
if (-not (Test-Path -LiteralPath $backupScript -PathType Leaf)) {
  throw 'The repository backup tool is missing.'
}
if (-not (Test-Path -LiteralPath $pgDump -PathType Leaf)) {
  throw "pg_dump.exe was not found at '$pgDump'. Install PostgreSQL client tools or set the path in this script."
}

$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue | Select-Object -First 1
$node = if ($nodeCommand) { $nodeCommand.Source } else {
  Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
}
if (-not (Test-Path -LiteralPath $node -PathType Leaf)) {
  throw 'Node.js 24 is unavailable. No database command was run.'
}
$nodeVersionOutput = & $node -p 'process.versions.node' 2>$null
$nodeVersionExit = $LASTEXITCODE
$nodeVersionText = [string]($nodeVersionOutput | Select-Object -First 1)
$nodeVersion = $null
if ($nodeVersionExit -ne 0 -or -not [Version]::TryParse($nodeVersionText, [ref]$nodeVersion) -or $nodeVersion.Major -ne 24 -or $nodeVersion.Minor -lt 11) {
  throw 'Slink requires Node.js 24.11 or newer within major version 24. No database command was run.'
}

if ($ApplyMigrations) {
  $listener = Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($listener) {
    throw "Port 3000 still has a listener (PID $($listener.OwningProcess)). Stop the Slink API before running this migration workflow. No backup or schema migration was run."
  }
}
if ($VerifiedBackupManifest -and -not $ApplyMigrations) {
  throw 'VerifiedBackupManifest can only be used together with -ApplyMigrations.'
}

$content = [System.IO.File]::ReadAllText($envPath)
$envAcl = Get-Acl -LiteralPath $envPath
$currentUserSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
if (-not $envAcl.AreAccessRulesProtected) {
  throw '.env has inherited permissions. Restrict its ACL before adding the backup key; no database command was run.'
}
$allowedSids = @(
  $currentUserSid.Value,
  'S-1-5-18',
  'S-1-5-32-544'
)
foreach ($accessRule in $envAcl.Access) {
  try { $ruleSid = $accessRule.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value }
  catch { throw '.env ACL contains an unrecognized principal. No database command was run.' }
  if ($ruleSid -notin $allowedSids -or $accessRule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow) {
    throw '.env ACL must grant access only to the current user, SYSTEM and Administrators. No database command was run.'
  }
}
$lines = [System.Collections.Generic.List[string]]::new()
$values = @{}
foreach ($line in ($content -split "`r?`n")) {
  $lines.Add($line)
  if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
    $value = $Matches[2].Trim()
    if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $values[$Matches[1]] = $value
  }
}

$migrationUrl = $values['MIGRATION_DATABASE_URL']
if (-not $migrationUrl) { throw 'MIGRATION_DATABASE_URL is missing from .env. No database command was run.' }
$migrationUri = $null
if (-not [Uri]::TryCreate($migrationUrl, [UriKind]::Absolute, [ref]$migrationUri)) {
  throw 'MIGRATION_DATABASE_URL is not a valid PostgreSQL URL. No database command was run.'
}
$migrationUserInfo = ($migrationUri.UserInfo -split ':', 2)[0]
$migrationUser = [Uri]::UnescapeDataString($migrationUserInfo)
$migrationDatabase = [Uri]::UnescapeDataString($migrationUri.AbsolutePath.TrimStart('/'))
if ($migrationUri.Scheme -notin @('postgres', 'postgresql') -or $migrationUser -ne 'slink_migrator' -or $migrationDatabase -ne 'slink' -or $migrationUri.Host -notin @('127.0.0.1', 'localhost', '::1')) {
  throw 'MIGRATION_DATABASE_URL must point to the local slink database as slink_migrator. No database command was run.'
}

$backupUrl = $values['BACKUP_DATABASE_URL']
if ($backupUrl) {
  $backupUri = $null
  if (-not [Uri]::TryCreate($backupUrl, [UriKind]::Absolute, [ref]$backupUri)) {
    throw 'BACKUP_DATABASE_URL is not a valid PostgreSQL URL. No database command was run.'
  }
  $backupUser = [Uri]::UnescapeDataString(($backupUri.UserInfo -split ':', 2)[0])
  $backupDatabase = [Uri]::UnescapeDataString($backupUri.AbsolutePath.TrimStart('/'))
  if ($backupUri.Scheme -notin @('postgres', 'postgresql') -or $backupUser -ne 'slink_migrator' -or $backupDatabase -ne 'slink' -or $backupUri.Host -notin @('127.0.0.1', 'localhost', '::1')) {
    throw 'BACKUP_DATABASE_URL must point to the local slink database as slink_migrator. No database command was run.'
  }
} else {
  $backupUrl = $migrationUrl
}

$backupKey = $values['SLINK_BACKUP_ENCRYPTION_KEY']
if ($backupKey) {
  try { $decodedKey = [Convert]::FromBase64String($backupKey) } catch { throw 'The existing backup encryption key is not valid base64. No database command was run.' }
  if ($decodedKey.Length -ne 32 -or [Convert]::ToBase64String($decodedKey) -cne $backupKey) {
    throw 'The existing backup encryption key is not a canonical base64-encoded 32-byte key. No database command was run.'
  }
} else {
  $keyBytes = [byte[]]::new(32)
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($keyBytes) } finally { $rng.Dispose() }
  $backupKey = [Convert]::ToBase64String($keyBytes)
  [Array]::Clear($keyBytes, 0, $keyBytes.Length)
}

$keyId = $values['SLINK_BACKUP_KEY_ID']
if (-not $keyId) { $keyId = 'local-windows-v1' }
if ($keyId -notmatch '^[A-Za-z0-9._-]{1,80}$') {
  throw 'SLINK_BACKUP_KEY_ID contains unsupported characters. No database command was run.'
}

$updates = @{
  BACKUP_DATABASE_URL = $backupUrl
  SLINK_BACKUP_ENCRYPTION_KEY = $backupKey
  SLINK_BACKUP_KEY_ID = $keyId
}
$seen = @{}
$updatedLines = [System.Collections.Generic.List[string]]::new()
foreach ($line in $lines) {
  if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=') {
    $name = $Matches[1]
    if ($updates.ContainsKey($name)) {
      if (-not $seen.ContainsKey($name)) {
        $updatedLines.Add("$name=$($updates[$name])")
        $seen[$name] = $true
      }
      continue
    }
  }
  $updatedLines.Add($line)
}
foreach ($name in $updates.Keys) {
  if (-not $seen.ContainsKey($name)) { $updatedLines.Add("$name=$($updates[$name])") }
}

$needsEnvUpdate = $false
foreach ($name in $updates.Keys) {
  if (-not $values.ContainsKey($name) -or $values[$name] -cne $updates[$name]) { $needsEnvUpdate = $true }
}
if ($needsEnvUpdate) {
  $tempEnvPath = Join-Path (Split-Path $envPath -Parent) ".env.backup-setup-$([Guid]::NewGuid().ToString('N')).tmp"
  $accessSections = [System.Security.AccessControl.AccessControlSections]::Access
  $originalEnvAccessSddl = $envAcl.GetSecurityDescriptorSddlForm($accessSections)
  $modifyRule = [System.Security.AccessControl.FileSystemAccessRule]::new(
    $currentUserSid,
    [System.Security.AccessControl.FileSystemRights]::Modify,
    [System.Security.AccessControl.AccessControlType]::Allow
  )
  $destinationAclExpanded = $false
  $envWriteError = $null
  $envCleanupError = $null
  try {
    $tempStream = [System.IO.File]::Open($tempEnvPath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
    $tempStream.Dispose()
    $tempAcl = [System.Security.AccessControl.FileSecurity]::new()
    $tempAcl.SetSecurityDescriptorSddlForm($originalEnvAccessSddl, $accessSections)
    $tempAcl.AddAccessRule($modifyRule)
    Set-Acl -LiteralPath $tempEnvPath -AclObject $tempAcl
    $encoding = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($tempEnvPath, ($updatedLines -join [Environment]::NewLine) + [Environment]::NewLine, $encoding)

    # Atomic replacement needs DELETE on both the existing .env file and the temporary source.
    # Grant Modify only to the current user for the replacement window, then restore the exact ACL.
    $replacementAcl = [System.Security.AccessControl.FileSecurity]::new()
    $replacementAcl.SetSecurityDescriptorSddlForm($originalEnvAccessSddl, $accessSections)
    $replacementAcl.AddAccessRule($modifyRule)
    $destinationAclExpanded = $true
    Set-Acl -LiteralPath $envPath -AclObject $replacementAcl
    Move-Item -LiteralPath $tempEnvPath -Destination $envPath -Force
  } catch {
    $envWriteError = $_
  } finally {
    if ($destinationAclExpanded) {
      try {
        $restoredEnvAcl = [System.Security.AccessControl.FileSecurity]::new()
        $restoredEnvAcl.SetSecurityDescriptorSddlForm($originalEnvAccessSddl, $accessSections)
        Set-Acl -LiteralPath $envPath -AclObject $restoredEnvAcl
        $destinationAclExpanded = $false
      } catch {
        $envCleanupError = $_
      }
    }
    if (Test-Path -LiteralPath $tempEnvPath) {
      try {
        $tempAcl = [System.Security.AccessControl.FileSecurity]::new()
        $tempAcl.SetSecurityDescriptorSddlForm($originalEnvAccessSddl, $accessSections)
        $tempAcl.AddAccessRule($modifyRule)
        Set-Acl -LiteralPath $tempEnvPath -AclObject $tempAcl
        Remove-Item -LiteralPath $tempEnvPath -Force -ErrorAction Stop
      } catch {
        if (-not $envCleanupError) { $envCleanupError = $_ }
      }
    }
    $content = $null
    $lines.Clear()
    $updatedLines.Clear()
  }
  if ($envWriteError) {
    if ($envCleanupError) { Write-Warning 'Backup setup could not fully clean up its temporary .env file; no database command was run. Keep the path and error details for recovery.' }
    throw $envWriteError.Exception
  }
  if ($envCleanupError) { throw 'Backup setup could not restore the original .env ACL or remove its temporary file. No database command was run.' }
} else {
  $content = $null
  $lines.Clear()
  $updatedLines.Clear()
}

$variableNames = @('BACKUP_DATABASE_URL', 'SLINK_BACKUP_ENCRYPTION_KEY', 'SLINK_BACKUP_KEY_ID', 'PG_DUMP_BIN')
$previousEnvironment = @{}
foreach ($name in $variableNames) { $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
try {
  $env:BACKUP_DATABASE_URL = $backupUrl
  $env:SLINK_BACKUP_ENCRYPTION_KEY = $backupKey
  $env:SLINK_BACKUP_KEY_ID = $keyId
  $env:PG_DUMP_BIN = $pgDump

  Write-Output 'Local backup settings are saved in the ACL-protected .env file. The encryption key is not displayed.'
  if ($VerifiedBackupManifest) {
    $backupRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot '.local-data\backups')).TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
    $requestedManifest = [System.IO.Path]::GetFullPath($VerifiedBackupManifest)
    if (-not $requestedManifest.StartsWith($backupRoot, [System.StringComparison]::OrdinalIgnoreCase) -or -not $requestedManifest.EndsWith('.manifest.json', [System.StringComparison]::OrdinalIgnoreCase)) {
      throw 'VerifiedBackupManifest must name a manifest inside .local-data\backups. No schema migration was run.'
    }
    if (-not (Test-Path -LiteralPath $requestedManifest -PathType Leaf)) {
      throw 'VerifiedBackupManifest does not exist. No schema migration was run.'
    }
    $manifestItem = Get-Item -LiteralPath $requestedManifest -Force
    if (($manifestItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw 'VerifiedBackupManifest cannot be a reparse point. No schema migration was run.'
    }
    $manifestPath = (Resolve-Path -LiteralPath $requestedManifest).Path
    Write-Output "Reusing existing encrypted backup: $manifestPath"
  } else {
    $createOutput = @(& $node $backupScript create 2>&1)
    $createExit = $LASTEXITCODE
    $createOutput | ForEach-Object { Write-Output $_ }
    if ($createExit -ne 0) { throw 'Encrypted backup creation failed. No schema migration was run.' }

    $manifestLine = $createOutput | ForEach-Object { "$($_)" } | Where-Object { $_ -match '^Encrypted backup created: (.+\.manifest\.json)$' } | Select-Object -Last 1
    if (-not $manifestLine -or $manifestLine -notmatch '^Encrypted backup created: (.+\.manifest\.json)$') {
      throw 'The backup command did not return a manifest path. No schema migration was run.'
    }
    if ($manifestLine -match '^Encrypted backup created: (.+\.manifest\.json)$') { $manifestPath = $Matches[1] }
  }

  $verifyOutput = @(& $node $backupScript verify $manifestPath 2>&1)
  $verifyExit = $LASTEXITCODE
  $verifyOutput | ForEach-Object { Write-Output $_ }
  if ($verifyExit -ne 0) { throw 'Backup verification failed. No schema migration was run.' }
  Write-Output 'Encrypted backup and manifest verification succeeded. No schema migration was run.'

  if ($ApplyMigrations) {
    Write-Output 'Applying pending PostgreSQL migrations. The migration runner checks slink_migrator privileges and slink_app before changing schema.'
    $migrationOutput = @(& $node $migrationScript 2>&1)
    $migrationExit = $LASTEXITCODE
    $migrationOutput | ForEach-Object { Write-Output $_ }
    if ($migrationExit -ne 0) { throw "A schema migration failed. The verified backup is safe at '$manifestPath'; review the reported migration before retrying." }

    Write-Output 'Checking application and migration-role boundaries after migrations.'
    $postflightOutput = @(& $node $roleCheckScript 2>&1)
    $postflightExit = $LASTEXITCODE
    $postflightOutput | ForEach-Object { Write-Output $_ }
    if ($postflightExit -ne 0) { throw "Post-migration role checks failed. The verified backup is safe at '$manifestPath'; keep the API stopped and review the failed checks." }
    Write-Output "Pending migrations and role checks completed. Verified backup: $manifestPath"
  }
} finally {
  foreach ($name in $variableNames) {
    [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], 'Process')
  }
  $backupKey = $null
  $backupUrl = $null
  $values['SLINK_BACKUP_ENCRYPTION_KEY'] = $null
  $values['BACKUP_DATABASE_URL'] = $null
  $values['MIGRATION_DATABASE_URL'] = $null
  $updates['SLINK_BACKUP_ENCRYPTION_KEY'] = $null
  $updates['BACKUP_DATABASE_URL'] = $null
  if ($decodedKey) { [Array]::Clear($decodedKey, 0, $decodedKey.Length) }
}
