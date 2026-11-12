param(
  [ValidateSet('debug', 'release')]
  [string]$Profile = 'debug'
)

$ErrorActionPreference = 'Stop'
$moduleRoot = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $moduleRoot 'rust\Cargo.toml'
$targetDirectory = Join-Path $moduleRoot 'rust\target'
$cargoArguments = @('build', '--manifest-path', $manifestPath)
if ($Profile -eq 'release') {
  $cargoArguments += '--release'
}

$ErrorActionPreference = 'Continue'
& cargo @cargoArguments
$buildExitCode = $LASTEXITCODE
if ($LASTEXITCODE -ne 0) {
  throw "Rust AoLinks build failed with exit code $buildExitCode."
}

$profileDirectory = Join-Path $targetDirectory $Profile
$platformLibrary = if ($env:OS -eq 'Windows_NT') {
  Join-Path $profileDirectory 'aolinks_engine.dll'
} elseif ($IsMacOS) {
  Join-Path $profileDirectory 'libaolinks_engine.dylib'
} else {
  Join-Path $profileDirectory 'libaolinks_engine.so'
}
$nodeAddon = Join-Path $profileDirectory 'aolinks_engine.node'
if (-not (Test-Path -LiteralPath $platformLibrary)) {
  throw "Rust build succeeded but the native library was not found: $platformLibrary"
}
Copy-Item -LiteralPath $platformLibrary -Destination $nodeAddon -Force
Write-Output "AoLinks native addon: $nodeAddon"
