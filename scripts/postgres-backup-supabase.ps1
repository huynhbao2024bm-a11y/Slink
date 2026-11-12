param(
  [string]$PoolerHost = 'aws-0-ap-northeast-1.pooler.supabase.com',
  [int]$Port = 5432,
  [string]$Database = 'postgres',
  [string]$Username = 'postgres.giuraqrlmqdocrvwaqna'
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$envPath = Join-Path $repoRoot '.env'
$backupScript = Join-Path $PSScriptRoot 'postgres-backup.js'
$caPath = Join-Path $repoRoot 'deploy\render\supabase-ca.crt'
$pgDump = 'C:\Program Files\PostgreSQL\18\bin\pg_dump.exe'
$outputDirectory = Join-Path $repoRoot '.local-data\backups\supabase'

if (-not (Test-Path -LiteralPath $envPath -PathType Leaf)) { throw 'Protected .env is missing; no database connection was attempted.' }
if (-not (Test-Path -LiteralPath $backupScript -PathType Leaf)) { throw 'Slink encrypted backup tool is missing.' }
if (-not (Test-Path -LiteralPath $caPath -PathType Leaf)) { throw 'Supabase CA certificate is missing; no database connection was attempted.' }
if (-not (Test-Path -LiteralPath $pgDump -PathType Leaf)) { throw 'PostgreSQL 18 pg_dump.exe was not found; no database connection was attempted.' }
if ($PoolerHost -notmatch '^[A-Za-z0-9.-]+\.pooler\.supabase\.com$' -or $Port -ne 5432 -or $Database -ne 'postgres' -or $Username -notmatch '^postgres\.[a-z0-9]+$') {
  throw 'Backup target must be a Supabase Session Pooler endpoint on port 5432 and database postgres.'
}

$nodeCandidates = [System.Collections.Generic.List[string]]::new()
$nodeCandidates.Add((Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'))
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue | Select-Object -First 1
if ($nodeCommand) { $nodeCandidates.Add($nodeCommand.Source) }
$node = $null
foreach ($candidate in ($nodeCandidates | Select-Object -Unique)) {
  if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
  $versionOutput = & $candidate -p 'process.versions.node' 2>$null
  $version = $null
  if ($LASTEXITCODE -eq 0 -and [Version]::TryParse([string]($versionOutput | Select-Object -First 1), [ref]$version) -and $version.Major -eq 24 -and $version.Minor -ge 11) {
    $node = $candidate
    break
  }
}
if (-not $node) { throw 'Slink requires Node.js 24.11 or newer within major version 24; no database connection was attempted.' }

$acl = Get-Acl -LiteralPath $envPath
if (-not $acl.AreAccessRulesProtected) { throw '.env permissions are inherited; secure the file before using its backup key.' }
$currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$allowedSids = @($currentSid, 'S-1-5-18', 'S-1-5-32-544')
foreach ($rule in $acl.Access) {
  try { $sid = $rule.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value }
  catch { throw '.env contains an unrecognized ACL principal; no database connection was attempted.' }
  if ($sid -notin $allowedSids -or $rule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow) {
    throw '.env ACL permits an unexpected principal; no database connection was attempted.'
  }
}

$values = @{}
foreach ($line in [System.IO.File]::ReadAllLines($envPath)) {
  if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
    $name = $Matches[1]
    if ($name -in @('SLINK_BACKUP_ENCRYPTION_KEY', 'SLINK_BACKUP_KEY_ID')) {
      $value = $Matches[2].Trim()
      if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
        $value = $value.Substring(1, $value.Length - 2)
      }
      $values[$name] = $value
    }
  }
}

$backupKey = $values['SLINK_BACKUP_ENCRYPTION_KEY']
$keyId = $values['SLINK_BACKUP_KEY_ID']
if (-not $backupKey -or -not $keyId) { throw 'The protected .env must already contain the Slink backup encryption key and key ID.' }
try { $keyBytes = [Convert]::FromBase64String($backupKey) } catch { throw 'The saved Slink backup key is invalid; no database connection was attempted.' }
if ($keyBytes.Length -ne 32 -or [Convert]::ToBase64String($keyBytes) -cne $backupKey -or $keyId -notmatch '^[A-Za-z0-9._-]{1,80}$') {
  [Array]::Clear($keyBytes, 0, $keyBytes.Length)
  throw 'The saved Slink backup key settings are invalid; no database connection was attempted.'
}
[Array]::Clear($keyBytes, 0, $keyBytes.Length)
$values.Clear()

$securePassword = Read-Host 'Enter the Supabase postgres database password (hidden; it will not be saved)' -AsSecureString
$passwordPointer = [IntPtr]::Zero
$password = $null
$databaseUrl = $null
$previousEnvironment = @{}
$environmentNames = @('BACKUP_DATABASE_URL', 'SLINK_BACKUP_ENCRYPTION_KEY', 'SLINK_BACKUP_KEY_ID', 'PG_DUMP_BIN', 'SLINK_BACKUP_DIR')
foreach ($name in $environmentNames) { $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }

try {
  $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
  $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  if ([string]::IsNullOrEmpty($password)) { throw 'A non-empty database password is required.' }

  $escapedUser = [Uri]::EscapeDataString($Username)
  $escapedPassword = [Uri]::EscapeDataString($password)
  $escapedCaPath = [Uri]::EscapeDataString($caPath.Replace('\', '/'))
  $databaseUrl = "postgresql://${escapedUser}:${escapedPassword}@${PoolerHost}:${Port}/${Database}?sslmode=verify-full&sslrootcert=${escapedCaPath}"

  New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
  $env:BACKUP_DATABASE_URL = $databaseUrl
  $env:SLINK_BACKUP_ENCRYPTION_KEY = $backupKey
  $env:SLINK_BACKUP_KEY_ID = $keyId
  $env:PG_DUMP_BIN = $pgDump
  $env:SLINK_BACKUP_DIR = $outputDirectory

  Write-Output 'Creating a read-only, encrypted snapshot from the Supabase Session Pooler. The password will not be saved.'
  $createOutput = @(& $node $backupScript create 2>&1)
  $createExit = $LASTEXITCODE
  $createOutput | ForEach-Object { Write-Output $_ }
  if ($createExit -ne 0) { throw 'Supabase backup creation failed. No schema migration was run.' }

  $manifestLine = $createOutput | ForEach-Object { [string]$_ } | Where-Object { $_ -match '^Encrypted backup created: (.+\.manifest\.json)$' } | Select-Object -Last 1
  if (-not $manifestLine -or $manifestLine -notmatch '^Encrypted backup created: (.+\.manifest\.json)$') {
    throw 'The backup tool did not return a manifest path. No schema migration was run.'
  }
  $manifestPath = [regex]::Match([string]$manifestLine, '^Encrypted backup created: (.+\.manifest\.json)$').Groups[1].Value
  $resolvedManifest = (Resolve-Path -LiteralPath $manifestPath).Path
  $backupRoot = [System.IO.Path]::GetFullPath($outputDirectory).TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
  if (-not $resolvedManifest.StartsWith($backupRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'The backup manifest is outside the configured Supabase backup directory.'
  }

  $verifyOutput = @(& $node $backupScript verify $resolvedManifest 2>&1)
  $verifyExit = $LASTEXITCODE
  $verifyOutput | ForEach-Object { Write-Output $_ }
  if ($verifyExit -ne 0) { throw 'Supabase backup verification failed. No schema migration was run.' }
  Write-Output 'Verified encrypted Supabase backup manifest (local path):'
  Write-Output $resolvedManifest
  Write-Output 'No database schema or business data was changed.'
} finally {
  foreach ($name in $environmentNames) { [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], 'Process') }
  if ($passwordPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer) }
  $password = $null
  $databaseUrl = $null
  $backupKey = $null
  $keyId = $null
  if ($securePassword) { $securePassword.Dispose() }
}
