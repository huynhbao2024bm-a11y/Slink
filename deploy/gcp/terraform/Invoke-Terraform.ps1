param(
  [Parameter(Mandatory = $true, Position = 0, ValueFromRemainingArguments = $true)]
  [string[]]$TerraformArgs
)

$ErrorActionPreference = 'Stop'
$docker = Get-Command docker.exe -ErrorAction SilentlyContinue
if (-not $docker) { throw 'Docker Desktop CLI was not found. Start Docker Desktop before running Terraform.' }

$gcpRoot = Split-Path -Parent $PSScriptRoot
$workspace = (Resolve-Path -LiteralPath $gcpRoot).Path.Replace('\', '/')
$dockerArgs = @(
  'run', '--rm', '--interactive',
  '--volume', "${workspace}:/workspace",
  '--workdir', '/workspace/terraform',
  '--env', 'TF_IN_AUTOMATION=1'
)

$action = $TerraformArgs | Where-Object { $_ -notmatch '^-' } | Select-Object -First 1
if ($action -in @('plan', 'apply', 'destroy', 'refresh', 'import')) {
  $adcFile = Join-Path $env:APPDATA 'gcloud\application_default_credentials.json'
  if (-not (Test-Path -LiteralPath $adcFile -PathType Leaf)) {
    throw 'Run gcloud auth application-default login before a Terraform plan or apply.'
  }
  $adcMount = (Resolve-Path -LiteralPath $adcFile).Path.Replace('\', '/')
  $dockerArgs += @('--volume', "${adcMount}:/root/.config/gcloud/application_default_credentials.json:ro")
}

$dockerArgs += @('hashicorp/terraform:1.9.8') + $TerraformArgs
& $docker.Source @dockerArgs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
