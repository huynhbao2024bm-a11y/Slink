param(
  [switch]$IncludeBackupRestore
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$envPath = Join-Path $repoRoot '.env'
$pgData = Join-Path $repoRoot '.local-data\postgres-native'
$pgBin = if ($env:SLINK_PG_BIN) { $env:SLINK_PG_BIN } else { 'C:\Program Files\PostgreSQL\18\bin' }
$pgCtl = Join-Path $pgBin 'pg_ctl.exe'
$psql = Join-Path $pgBin 'psql.exe'
$postgresScript = Join-Path $PSScriptRoot 'postgres-local.ps1'
$adminSecretPath = Join-Path $repoRoot '.local-data\postgres-admin.dpapi'
$nodeCandidates = @()
$pathNode = Get-Command node.exe -ErrorAction SilentlyContinue
if ($pathNode) { $nodeCandidates += $pathNode.Source }
if ($env:USERPROFILE) {
  $nodeCandidates += Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
}
$nodeCandidates += 'C:\Program Files\nodejs\node.exe'
$node = $null
$nodeVersion = $null
foreach ($candidate in ($nodeCandidates | Select-Object -Unique)) {
  if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
  $versionOutput = & $candidate --version 2>$null
  if ($LASTEXITCODE -ne 0 -or $versionOutput -notmatch '^v(\d+)\.(\d+)\.(\d+)') { continue }
  $candidateVersion = [version]($versionOutput -replace '^v', '')
  if ($candidateVersion.Major -eq 24 -and $candidateVersion -ge [version]'24.11.0' -and $candidateVersion -lt [version]'25.0.0') {
    $node = $candidate
    $nodeVersion = $versionOutput
    break
  }
}

foreach ($requiredPath in @($envPath, $pgCtl, $psql, (Join-Path $pgData 'PG_VERSION'), $adminSecretPath, $postgresScript)) {
  if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) { throw "Missing required local component: $requiredPath" }
}
if (-not $node) { throw 'Node.js 24.11 or newer within major version 24 is required. Use the Codex Node 24 runtime or install Node 24.' }
if (([System.IO.File]::ReadAllText((Join-Path $pgData 'PG_VERSION'))).Trim() -ne '18') {
  throw 'This acceptance script only runs against the Slink-owned PostgreSQL 18 cluster.'
}

$envAcl = Get-Acl -LiteralPath $envPath
if (-not $envAcl.AreAccessRulesProtected) { throw '.env ACL is not protected; stopping before reading connection settings.' }
$allowedSids = @([System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value, 'S-1-5-18', 'S-1-5-32-544')
foreach ($rule in $envAcl.Access) {
  try { $sid = $rule.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value }
  catch { throw '.env ACL contains an unrecognized account; stopping before reading connection settings.' }
  if ($sid -notin $allowedSids -or $rule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow) {
    throw '.env ACL must grant access only to the current account, SYSTEM, and Administrators.'
  }
}

$envValues = @{}
foreach ($line in [System.IO.File]::ReadAllLines($envPath)) {
  if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
    $value = $Matches[2].Trim()
    if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $envValues[$Matches[1]] = $value
  }
}

function Get-LocalRoleUri([string]$Value, [string]$ExpectedRole, [string]$VariableName) {
  $uri = $null
  if (-not [Uri]::TryCreate($Value, [UriKind]::Absolute, [ref]$uri)) { throw "$VariableName is invalid." }
  $user = [Uri]::UnescapeDataString(($uri.UserInfo -split ':', 2)[0])
  $database = [Uri]::UnescapeDataString($uri.AbsolutePath.TrimStart('/'))
  if ($uri.Scheme -notin @('postgres', 'postgresql') -or $uri.Host -notin @('127.0.0.1', 'localhost') -or $uri.Port -ne 5433 -or $user -ne $ExpectedRole -or $database -ne 'slink') {
    throw "$VariableName must target the local Slink database on 127.0.0.1:5433 with role $ExpectedRole. No database command was run."
  }
  return $uri
}

function Set-DatabaseInUri([Uri]$Source, [string]$DatabaseName) {
  $builder = [UriBuilder]::new($Source)
  $builder.Path = "/$DatabaseName"
  return $builder.Uri.AbsoluteUri
}

function Test-TcpPortOccupiedOrUnavailable([int]$Port) {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
  $started = $false
  try {
    $listener.Start()
    $started = $true
    return $false
  } catch {
    return $true
  } finally {
    if ($started) { $listener.Stop() }
  }
}

$appSourceUri = Get-LocalRoleUri $envValues['APP_DATABASE_URL'] 'slink_app' 'APP_DATABASE_URL'
$migrationSourceUri = Get-LocalRoleUri $envValues['MIGRATION_DATABASE_URL'] 'slink_migrator' 'MIGRATION_DATABASE_URL'
$databaseName = 'slink_accept_' + ([Guid]::NewGuid().ToString('N').Substring(0, 12))
$acceptanceSuffix = $databaseName.Substring('slink_accept_'.Length)
$restoreDatabaseName = 'slink_restore_' + $acceptanceSuffix
$databaseCreated = $false
$restoreDatabaseCreated = $false
$backupWorkDirCreated = $false
$backupRoot = Join-Path $repoRoot '.local-data\backups'
$backupWorkDir = Join-Path $backupRoot "native-restore-$acceptanceSuffix"
$backupManifestPath = $null
$backupScript = Join-Path $PSScriptRoot 'postgres-backup.js'
$restoreAcceptanceScript = Join-Path $PSScriptRoot 'postgres-backup-restore-acceptance.js'
$pgDump = Join-Path $pgBin 'pg_dump.exe'
$pgRestore = Join-Path $pgBin 'pg_restore.exe'
$temporaryUrls = @{
  APP_DATABASE_URL = [Environment]::GetEnvironmentVariable('APP_DATABASE_URL', 'Process')
  MIGRATION_DATABASE_URL = [Environment]::GetEnvironmentVariable('MIGRATION_DATABASE_URL', 'Process')
  SLINK_ACCEPTANCE_DATABASE = [Environment]::GetEnvironmentVariable('SLINK_ACCEPTANCE_DATABASE', 'Process')
  NODE_ENV = [Environment]::GetEnvironmentVariable('NODE_ENV', 'Process')
  BACKUP_DATABASE_URL = [Environment]::GetEnvironmentVariable('BACKUP_DATABASE_URL', 'Process')
  RESTORE_DATABASE_URL = [Environment]::GetEnvironmentVariable('RESTORE_DATABASE_URL', 'Process')
  MIGRATION_DATABASE_URL_RESTORED = [Environment]::GetEnvironmentVariable('MIGRATION_DATABASE_URL_RESTORED', 'Process')
  SLINK_RESTORE_SOURCE_DATABASE = [Environment]::GetEnvironmentVariable('SLINK_RESTORE_SOURCE_DATABASE', 'Process')
  SLINK_RESTORE_TARGET_DATABASE = [Environment]::GetEnvironmentVariable('SLINK_RESTORE_TARGET_DATABASE', 'Process')
  SLINK_BACKUP_DIR = [Environment]::GetEnvironmentVariable('SLINK_BACKUP_DIR', 'Process')
  SLINK_BACKUP_ENCRYPTION_KEY = [Environment]::GetEnvironmentVariable('SLINK_BACKUP_ENCRYPTION_KEY', 'Process')
  SLINK_BACKUP_KEY_ID = [Environment]::GetEnvironmentVariable('SLINK_BACKUP_KEY_ID', 'Process')
  SLINK_RESTORE_CONFIRM_DATABASE = [Environment]::GetEnvironmentVariable('SLINK_RESTORE_CONFIRM_DATABASE', 'Process')
  SLINK_RESTORE_ALLOW_EMPTY_TARGET = [Environment]::GetEnvironmentVariable('SLINK_RESTORE_ALLOW_EMPTY_TARGET', 'Process')
  PG_DUMP_BIN = [Environment]::GetEnvironmentVariable('PG_DUMP_BIN', 'Process')
  PG_RESTORE_BIN = [Environment]::GetEnvironmentVariable('PG_RESTORE_BIN', 'Process')
}
$adminSecure = $null
$adminPassword = $null
$adminProtected = $null
$adminBstr = [IntPtr]::Zero
$lastError = $null
$cleanupError = $null
$psqlProcess = $null

function Invoke-NodeAcceptance([string]$ScriptPath, [string[]]$Arguments, [string]$FailureMessage) {
  $output = @(& $node $ScriptPath @Arguments 2>&1)
  $exitCode = $LASTEXITCODE
  foreach ($line in $output) { Write-Output "$line" }
  if ($exitCode -ne 0) { throw $FailureMessage }
}

function Remove-AcceptanceDatabase([string]$Name, [string]$ExpectedPattern) {
  if ($Name -notmatch $ExpectedPattern) { throw 'Temporary database name failed the safety check.' }
  $quotedDatabase = '"' + $Name + '"'
  $null = Invoke-AdminPsql 'postgres' "DROP DATABASE $quotedDatabase WITH (FORCE);"
}

function Invoke-AdminPsql([string]$Database, [string]$Sql) {
  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $psql
  $startInfo.Arguments = '-X -q -w -A -t -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 5433 -U postgres -d ' + $Database
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardInput = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.EnvironmentVariables['PGPASSWORD'] = $adminPassword
  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  if (-not $process.Start()) { throw 'Could not start psql for the acceptance database operation.' }
  try {
    $process.StandardInput.WriteLine($Sql)
    $process.StandardInput.Close()
    $output = $process.StandardOutput.ReadToEnd().Trim()
    $errorOutput = $process.StandardError.ReadToEnd().Trim()
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) {
      if ($errorOutput -match 'password authentication failed') { throw 'The saved PostgreSQL administrator credential did not authenticate; store data was not changed.' }
      if ($errorOutput -match 'connection refused|could not connect') { throw 'Could not connect to local PostgreSQL on port 5433.' }
      throw "psql failed: $errorOutput"
    }
    return $output
  } finally {
    $process.Dispose()
  }
}

try {
  & $pgCtl status -D $pgData *> $null
  if ($LASTEXITCODE -ne 0) {
    if (Test-TcpPortOccupiedOrUnavailable 5433) { throw 'Port 5433 is occupied or unavailable; no acceptance database was created.' }
    & $postgresScript -Action start
    if ($LASTEXITCODE -ne 0) { throw 'Could not start the Slink-owned PostgreSQL cluster.' }
  }

  $adminProtected = [System.IO.File]::ReadAllText($adminSecretPath).Trim()
  $adminSecure = ConvertTo-SecureString $adminProtected
  $adminBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($adminSecure)
  $adminPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($adminBstr)
  $clusterUser = Invoke-AdminPsql 'postgres' 'SELECT current_user;'
  $clusterDataPath = Invoke-AdminPsql 'postgres' 'SHOW data_directory;'
  $clusterPort = Invoke-AdminPsql 'postgres' 'SELECT inet_server_port();'
  $expectedDataPath = (Resolve-Path $pgData).Path.Replace('\', '/').TrimEnd('/')
  $actualDataPath = $clusterDataPath.Replace('\', '/').TrimEnd('/')
  if ($clusterUser -ne 'postgres' -or $actualDataPath -ine $expectedDataPath -or $clusterPort -ne '5433') {
    throw 'Port 5433 does not point to the Slink-owned PostgreSQL cluster; no acceptance database was created.'
  }

  $safeDatabase = '"' + $databaseName + '"'
  $null = Invoke-AdminPsql 'postgres' "CREATE DATABASE $safeDatabase OWNER slink_migrator;"
  $databaseCreated = $true
  $null = Invoke-AdminPsql 'postgres' "GRANT CONNECT ON DATABASE $safeDatabase TO slink_app;"

  $env:APP_DATABASE_URL = Set-DatabaseInUri $appSourceUri $databaseName
  $env:MIGRATION_DATABASE_URL = Set-DatabaseInUri $migrationSourceUri $databaseName
  $env:SLINK_ACCEPTANCE_DATABASE = $databaseName
  $env:NODE_ENV = 'test'

  Write-Output "Created temporary acceptance database $databaseName on the Slink-owned local PostgreSQL cluster."
  Write-Output "Applying migrations with Node.js $nodeVersion. The slink store database is not opened for writes."
  & $node (Join-Path $repoRoot 'server\migrate.js')
  if ($LASTEXITCODE -ne 0) { throw 'Migration on the temporary database failed.' }

  Write-Output 'Checking PostgreSQL roles in the temporary database.'
  & $node (Join-Path $repoRoot 'scripts\postgres-role-check.js')
  if ($LASTEXITCODE -ne 0) { throw 'Role checks on the temporary database failed.' }

  Write-Output 'Running registration, opening stock, cash session and reconciliation, sales, returns, supplier purchases and settlement, customer receivables and settlement, inventory, idempotency, concurrency, and CSV workflows.'
  & $node (Join-Path $repoRoot 'scripts\postgres-native-acceptance.js')
  if ($LASTEXITCODE -ne 0) { throw 'Native PostgreSQL business-flow acceptance failed.' }

  if ($IncludeBackupRestore) {
    if (-not (Test-Path -LiteralPath $pgDump -PathType Leaf) -or -not (Test-Path -LiteralPath $pgRestore -PathType Leaf)) {
      throw 'PostgreSQL pg_dump.exe and pg_restore.exe are required for the restore drill.'
    }
    if (-not (Test-Path -LiteralPath $restoreAcceptanceScript -PathType Leaf) -or -not (Test-Path -LiteralPath $backupScript -PathType Leaf)) {
      throw 'The local backup or restore acceptance tool is missing.'
    }

    $configuredBackupUri = Get-LocalRoleUri $envValues['BACKUP_DATABASE_URL'] 'slink_migrator' 'BACKUP_DATABASE_URL'
    $encodedKey = $envValues['SLINK_BACKUP_ENCRYPTION_KEY']
    $keyId = $envValues['SLINK_BACKUP_KEY_ID']
    try { $decodedBackupKey = [Convert]::FromBase64String($encodedKey) }
    catch { throw 'The protected local backup encryption key is not valid base64. No restore drill was attempted.' }
    if ($decodedBackupKey.Length -ne 32 -or [Convert]::ToBase64String($decodedBackupKey) -cne $encodedKey -or $keyId -notmatch '^[A-Za-z0-9._-]{1,80}$') {
      throw 'The protected local backup key configuration is invalid. No restore drill was attempted.'
    }
    $decodedBackupKey = $null

    $restoreUri = Set-DatabaseInUri $migrationSourceUri $restoreDatabaseName
    $null = Invoke-AdminPsql 'postgres' "CREATE DATABASE `"$restoreDatabaseName`" OWNER slink_migrator TEMPLATE template0;"
    $restoreDatabaseCreated = $true
    $null = Invoke-AdminPsql $restoreDatabaseName 'GRANT CREATE ON SCHEMA public TO slink_migrator;'
    $null = Invoke-AdminPsql 'postgres' "GRANT CONNECT ON DATABASE `"$restoreDatabaseName`" TO slink_app;"

    $backupSourceUri = Set-DatabaseInUri $configuredBackupUri $databaseName
    $backupRoot = (Resolve-Path -LiteralPath (Split-Path $backupRoot -Parent)).Path + '\backups'
    if (-not (Test-Path -LiteralPath $backupRoot -PathType Container)) {
      New-Item -ItemType Directory -Path $backupRoot | Out-Null
    }
    if (Test-Path -LiteralPath $backupWorkDir) { throw 'The unique backup acceptance directory already exists; refusing to overwrite it.' }
    New-Item -ItemType Directory -Path $backupWorkDir | Out-Null
    $backupWorkDirCreated = $true
    $backupAcl = Get-Acl -LiteralPath $backupWorkDir
    $backupAcl.SetAccessRuleProtection($true, $false)
    foreach ($existingRule in @($backupAcl.Access)) { $null = $backupAcl.RemoveAccessRuleSpecific($existingRule) }
    $currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $backupAcl.SetOwner($currentSid)
    foreach ($sidValue in @($currentSid.Value, 'S-1-5-18', 'S-1-5-32-544')) {
      $sid = [System.Security.Principal.SecurityIdentifier]::new($sidValue)
      $rule = [System.Security.AccessControl.FileSystemAccessRule]::new(
        $sid,
        [System.Security.AccessControl.FileSystemRights]::FullControl,
        [System.Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit',
        [System.Security.AccessControl.PropagationFlags]::None,
        [System.Security.AccessControl.AccessControlType]::Allow
      )
      $backupAcl.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $backupWorkDir -AclObject $backupAcl

    $env:BACKUP_DATABASE_URL = $backupSourceUri
    $env:SLINK_BACKUP_DIR = $backupWorkDir
    $env:SLINK_BACKUP_ENCRYPTION_KEY = $encodedKey
    $env:SLINK_BACKUP_KEY_ID = $keyId
    $env:PG_DUMP_BIN = $pgDump
    $env:PG_RESTORE_BIN = $pgRestore
    Write-Output 'Creating and verifying an encrypted backup of the isolated acceptance database.'
    $backupOutput = @(& $node $backupScript create 2>&1)
    $backupExitCode = $LASTEXITCODE
    foreach ($line in $backupOutput) { Write-Output "$line" }
    if ($backupExitCode -ne 0) { throw 'Encrypted backup creation failed during the isolated restore drill.' }
    $manifestLine = $backupOutput | Where-Object { "$_" -match '^Encrypted backup created: (.+\.manifest\.json)$' } | Select-Object -Last 1
    if (-not $manifestLine) {
      throw 'Backup creation did not return a manifest path.'
    }
    if ("$manifestLine" -match '^Encrypted backup created: (.+\.manifest\.json)$') {
      $backupManifestPath = $Matches[1]
    } else {
      throw 'Backup creation returned an unrecognized manifest path.'
    }
    Invoke-NodeAcceptance $backupScript @('verify', $backupManifestPath) 'Encrypted backup verification failed during the isolated restore drill.'

    $env:RESTORE_DATABASE_URL = $restoreUri
    $env:SLINK_RESTORE_CONFIRM_DATABASE = $restoreDatabaseName
    $env:SLINK_RESTORE_ALLOW_EMPTY_TARGET = 'YES'
    Write-Output "Restoring to isolated empty database $restoreDatabaseName created from template0."
    Invoke-NodeAcceptance $backupScript @('restore', $backupManifestPath) 'Encrypted backup restore failed in the isolated target database.'

    $env:APP_DATABASE_URL = Set-DatabaseInUri $appSourceUri $restoreDatabaseName
    $env:MIGRATION_DATABASE_URL = $restoreUri
    $env:MIGRATION_DATABASE_URL_RESTORED = $restoreUri
    $env:SLINK_RESTORE_SOURCE_DATABASE = $databaseName
    $env:SLINK_RESTORE_TARGET_DATABASE = $restoreDatabaseName
    Write-Output 'Applying the release migration check and role checks to the restored database.'
    Invoke-NodeAcceptance (Join-Path $repoRoot 'server\migrate.js') @() 'Migration check against the restored database failed.'
    Invoke-NodeAcceptance (Join-Path $repoRoot 'scripts\postgres-role-check.js') @() 'Role checks against the restored database failed.'
    Invoke-NodeAcceptance $restoreAcceptanceScript @() 'Restored data or API readiness did not match the acceptance source.'
  }
} catch {
  $lastError = $_
} finally {
  foreach ($name in $temporaryUrls.Keys) {
    [Environment]::SetEnvironmentVariable($name, $temporaryUrls[$name], 'Process')
  }
  if ($restoreDatabaseCreated) {
    try {
      Remove-AcceptanceDatabase $restoreDatabaseName '^slink_restore_[a-f0-9]{12}$'
      Write-Output 'Temporary restored database dropped.'
    } catch {
      $cleanupError = $_
      Write-Output "CLEANUP REQUIRED: temporary restored database $restoreDatabaseName still exists. Do not manually drop any other database. Error: $($_.Exception.Message)"
    }
  }
  if ($databaseCreated) {
    try {
      Remove-AcceptanceDatabase $databaseName '^slink_accept_[a-f0-9]{12}$'
      Write-Output 'Temporary acceptance database dropped; no test data remains in PostgreSQL.'
    } catch {
      if (-not $cleanupError) { $cleanupError = $_ }
      Write-Output "CLEANUP REQUIRED: temporary acceptance database $databaseName still exists. Do not manually drop any other database. Error: $($_.Exception.Message)"
    }
  }
  if ($backupWorkDirCreated) {
    try {
      $backupRootPath = [System.IO.Path]::GetFullPath($backupRoot).TrimEnd('\')
      $backupPath = [System.IO.Path]::GetFullPath($backupWorkDir)
      if (($backupPath -notmatch '\\native-restore-[a-f0-9]{12}$') -or (-not $backupPath.StartsWith($backupRootPath + '\', [System.StringComparison]::OrdinalIgnoreCase))) {
        throw 'Temporary encrypted backup path failed the safety check.'
      }
      Remove-Item -LiteralPath $backupPath -Recurse -Force
      Write-Output 'Temporary encrypted acceptance backup and manifest removed.'
    } catch {
      if (-not $cleanupError) { $cleanupError = $_ }
      Write-Output "CLEANUP REQUIRED: temporary encrypted backup files remain at $backupWorkDir. Error: $($_.Exception.Message)"
    }
  }
  $adminPassword = $null
  $adminProtected = $null
  $appSourceUri = $null
  $migrationSourceUri = $null
  $configuredBackupUri = $null
  $decodedBackupKey = $null
  $encodedKey = $null
  $keyId = $null
  $backupOutput = $null
  $backupManifestPath = $null
  $restoreUri = $null
  $backupSourceUri = $null
  $envValues['SLINK_BACKUP_ENCRYPTION_KEY'] = $null
  $envValues['BACKUP_DATABASE_URL'] = $null
  if ($adminBstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($adminBstr) }
  if ($adminSecure) { $adminSecure.Dispose() }
  $temporaryUrls.Clear()
  $envValues.Clear()
}

if ($lastError) { throw $lastError }
if ($cleanupError) { throw $cleanupError }
Write-Output 'Local PostgreSQL acceptance completed; the slink database and existing API process were preserved.'
