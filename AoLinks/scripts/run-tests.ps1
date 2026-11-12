$ErrorActionPreference = 'Stop'
$moduleRoot = Split-Path -Parent $PSScriptRoot
$logDirectory = Join-Path $moduleRoot 'Logs\test-runs'
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$logPath = Join-Path $logDirectory "$timestamp.txt"
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Write-LogLine([string]$line) {
  [Console]::WriteLine($line)
  [System.IO.File]::AppendAllText($logPath, $line + [Environment]::NewLine, $utf8)
}

function Invoke-LoggedCommand([string]$executable, [string[]]$arguments) {
  $ErrorActionPreference = 'Continue'
  $output = @(& $executable @arguments 2>&1)
  $commandExitCode = $LASTEXITCODE
  foreach ($line in $output) {
    Write-LogLine ([string]$line)
  }
  return $commandExitCode
}

Push-Location $moduleRoot
try {
  [System.IO.File]::WriteAllText($logPath, '', $utf8)
  Write-LogLine "AoLinks test run: $timestamp"
  Write-LogLine "Node: $(& node --version)"
  Write-LogLine "Rust: $(& rustc --version)"

  $rustTestExitCode = Invoke-LoggedCommand 'cargo' @('test', '--manifest-path', (Join-Path $moduleRoot 'rust\Cargo.toml'))
  Write-LogLine "Rust test exit code: $rustTestExitCode"
  if ($rustTestExitCode -ne 0) {
    throw "AoLinks Rust tests failed with exit code $rustTestExitCode. See $logPath"
  }

  $buildExitCode = Invoke-LoggedCommand 'powershell' @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $PSScriptRoot 'build-native.ps1'))
  Write-LogLine "Native build exit code: $buildExitCode"
  if ($buildExitCode -ne 0) {
    throw "AoLinks native build failed with exit code $buildExitCode. See $logPath"
  }

  $testExitCode = Invoke-LoggedCommand 'node' @('--test')
  Write-LogLine "Node test exit code: $testExitCode"
  if ($testExitCode -ne 0) {
    throw "AoLinks tests failed with exit code $testExitCode. See $logPath"
  }
  Write-LogLine 'Overall result: PASS'
  Write-Output "Test report: $logPath"
} finally {
  Pop-Location
}
