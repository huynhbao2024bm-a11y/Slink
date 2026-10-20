param()

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$secretPath = Join-Path $repoRoot '.local-data\postgres-admin.dpapi'
$psql = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'

if (-not (Test-Path -LiteralPath $secretPath)) {
  throw 'The DPAPI-protected PostgreSQL administrator credential is missing.'
}
if (-not (Test-Path -LiteralPath $psql)) {
  throw "psql.exe was not found at '$psql'."
}

$protected = $null
$secure = $null
$password = $null
$bstr = [IntPtr]::Zero
$process = $null
try {
  $protected = [System.IO.File]::ReadAllText($secretPath).Trim()
  $secure = ConvertTo-SecureString $protected
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)

  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = $psql
  $startInfo.Arguments = '-X -q -w -A -t -F "|" -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 5433 -U postgres -d postgres'
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardInput = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.EnvironmentVariables['PGPASSWORD'] = $password

  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $startInfo
  if (-not $process.Start()) { throw 'Could not start psql.' }
  $process.StandardInput.WriteLine('ALTER ROLE slink_migrator BYPASSRLS; GRANT CREATE ON SCHEMA public TO slink_migrator; SELECT rolname, rolsuper::text, rolbypassrls::text, has_schema_privilege(rolname, ''public'', ''CREATE'')::text FROM pg_catalog.pg_roles WHERE rolname = ''slink_migrator'';')
  $process.StandardInput.Close()
  $output = $process.StandardOutput.ReadToEnd().Trim()
  $errorOutput = $process.StandardError.ReadToEnd()
  $process.WaitForExit()
  if ($process.ExitCode -ne 0) {
    throw 'PostgreSQL rejected the migration-role adjustment. No migration was run.'
  }
  if ($output -ne 'slink_migrator|false|true|true') {
    throw "The migration role did not reach the required state. psql returned: $output"
  }

  Write-Output 'Verified: slink_migrator is not a superuser, has BYPASSRLS, and can CREATE in public.'
  Write-Output 'The slink_app role and its password were not changed. No schema migration was run.'
} finally {
  if ($process) { $process.Dispose() }
  $protected = $null
  $password = $null
  $output = $null
  $errorOutput = $null
  if ($bstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  if ($secure) { $secure.Dispose() }
}
