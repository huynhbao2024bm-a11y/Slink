param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-z][a-z0-9-]{4,28}[a-z0-9]$')]
  [string]$ProjectId
)

$ErrorActionPreference = 'Stop'
$gcloud = Get-Command gcloud -ErrorAction SilentlyContinue
if (-not $gcloud) { throw 'Install Google Cloud CLI and sign in before adding secret versions.' }

$secretNames = @(
  'postgres-admin-password',
  'slink-app-password',
  'slink-migrator-password',
  'email-delivery-url',
  'email-delivery-token',
  'backup-encryption-key-v1'
)

foreach ($secretName in $secretNames) {
  & $gcloud.Source secrets describe $secretName --project $ProjectId --format='value(name)' *> $null
  if ($LASTEXITCODE -ne 0) { throw "Secret '$secretName' is missing. Apply the prepared Terraform after choosing the domain first." }
  $versions = @(& $gcloud.Source secrets versions list $secretName --project $ProjectId --format='value(name)' 2>$null)
  if ($LASTEXITCODE -ne 0) { throw "Could not inspect versions for '$secretName'. No secret was changed." }
  if ($versions.Count -gt 0) { throw "Secret '$secretName' already has a version. Refusing to rotate database credentials through this one-time setup script." }
}

$emailUrl = Read-Host 'HTTPS email delivery endpoint URL'
if ($emailUrl -notmatch '^https://[^\s]+$') { throw 'The email delivery endpoint must be an HTTPS URL.' }
$emailTokenSecure = Read-Host 'Email delivery bearer token' -AsSecureString
$emailTokenPtr = [IntPtr]::Zero
$emailToken = $null
try {
  $emailTokenPtr = [Runtime.InteropServices.Marshal]::SecureStringToGlobalAllocUnicode($emailTokenSecure)
  $emailToken = [Runtime.InteropServices.Marshal]::PtrToStringUni($emailTokenPtr)
  if ($emailToken.Length -lt 32) { throw 'The email delivery token must contain at least 32 characters.' }

  $random = [Security.Cryptography.RandomNumberGenerator]::Create()
  function New-Base64Secret([int]$Length, $Generator) {
    $bytes = New-Object byte[] $Length
    $Generator.GetBytes($bytes)
    [Convert]::ToBase64String($bytes)
  }

  $values = [ordered]@{
    'postgres-admin-password' = (New-Base64Secret 48 $random)
    'slink-app-password' = (New-Base64Secret 48 $random)
    'slink-migrator-password' = (New-Base64Secret 48 $random)
    'email-delivery-url' = $emailUrl
    'email-delivery-token' = $emailToken
    'backup-encryption-key-v1' = (New-Base64Secret 32 $random)
  }

  $tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('slink-secret-upload-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $tempRoot | Out-Null
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $directoryAcl = New-Object Security.AccessControl.DirectorySecurity
  $directoryAcl.SetAccessRuleProtection($true, $false)
  $directoryAcl.SetOwner($identity.User)
  $rule = New-Object Security.AccessControl.FileSystemAccessRule(
    $identity.User,
    [Security.AccessControl.FileSystemRights]::FullControl,
    [Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit,
    [Security.AccessControl.PropagationFlags]::None,
    [Security.AccessControl.AccessControlType]::Allow
  )
  $directoryAcl.AddAccessRule($rule)
  Set-Acl -LiteralPath $tempRoot -AclObject $directoryAcl

  try {
    $index = 0
    foreach ($entry in $values.GetEnumerator()) {
      $index++
      $file = Join-Path $tempRoot ("secret-$index")
      [IO.File]::WriteAllText($file, [string]$entry.Value, (New-Object Text.UTF8Encoding($false)))
      & $gcloud.Source secrets versions add $entry.Key --project $ProjectId --data-file $file --quiet *> $null
      if ($LASTEXITCODE -ne 0) {
        throw "Upload failed for '$($entry.Key)'. Some earlier secret versions may already exist; inspect Secret Manager before retrying. No values were printed."
      }
    }
  } finally {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
    $random.Dispose()
  }
  'Secret Manager is configured. Database passwords and the backup encryption key were generated locally and uploaded without printing their values.'
} finally {
  if ($emailTokenPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeGlobalAllocUnicode($emailTokenPtr) }
  $emailTokenSecure.Dispose()
  $emailToken = $null
  $emailUrl = $null
}
