$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$postgresScript = Join-Path $PSScriptRoot 'postgres-local.ps1'
$serverEntry = Join-Path $repoRoot 'server\index.js'
$baseUrl = 'http://127.0.0.1:3000'

if (-not (Test-Path -LiteralPath $postgresScript)) { throw 'Không tìm thấy bộ quản lý PostgreSQL cục bộ của Slink.' }
if (-not (Test-Path -LiteralPath $serverEntry)) { throw 'Không tìm thấy máy chủ Slink.' }

$nodeCandidates = @()
$pathNode = Get-Command node.exe -ErrorAction SilentlyContinue
if ($pathNode) { $nodeCandidates += $pathNode.Source }
if ($env:USERPROFILE) {
  $nodeCandidates += Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
}
$nodeCandidates += 'C:\Program Files\nodejs\node.exe'
$nodePath = $null

foreach ($candidate in ($nodeCandidates | Select-Object -Unique)) {
  if (-not (Test-Path -LiteralPath $candidate)) { continue }
  $versionOutput = & $candidate --version 2>$null
  if ($LASTEXITCODE -ne 0 -or $versionOutput -notmatch '^v(\d+)\.(\d+)\.(\d+)') { continue }
  $version = [version]($versionOutput -replace '^v', '')
  if ($version.Major -eq 24 -and $version -ge [version]'24.11.0' -and $version -lt [version]'25.0.0') {
    $nodePath = $candidate
    break
  }
}
if (-not $nodePath) { throw 'Cần Node.js phiên bản 24.11 trở lên trong nhánh 24. Hãy cài qua nguồn chính thức hoặc dùng runtime Node đã cấu hình cho máy này.' }

& $postgresScript -Action start
if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL Slink chưa khởi động được; API chưa được chạy.' }

try {
  $ready = Invoke-RestMethod -Uri "$baseUrl/api/ready" -TimeoutSec 3
  if ($ready.status -eq 'ready') {
    Write-Output 'PostgreSQL và API Slink đã sẵn sàng trên 127.0.0.1:3000.'
    return
  }
} catch { }

$listeners = @(Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue)
if ($listeners.Count -gt 0) {
  $slinkListener = $false
  foreach ($listener in $listeners) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction SilentlyContinue
    if ($process -and $process.CommandLine -match 'server[\\/]index\.js') { $slinkListener = $true }
  }
  if (-not $slinkListener) { throw 'Cổng 3000 đang được ứng dụng khác sử dụng. Slink không dừng hoặc thay đổi tiến trình đó.' }

  $deadline = (Get-Date).AddSeconds(30)
  while ((Get-Date) -lt $deadline) {
    try {
      $ready = Invoke-RestMethod -Uri "$baseUrl/api/ready" -TimeoutSec 2
      if ($ready.status -eq 'ready') {
        Write-Output 'PostgreSQL đã chạy; API Slink đang có sẵn và báo ready trên 127.0.0.1:3000.'
        return
      }
    } catch { }
    Start-Sleep -Seconds 1
  }
  throw 'API Slink đã có tiến trình trên cổng 3000 nhưng chưa sẵn sàng sau 30 giây. Tiến trình được giữ nguyên; kiểm tra lỗi trong cửa sổ đang chạy API.'
}

Write-Output "Đang chạy API Slink bằng Node.js $(& $nodePath --version). Nhấn Ctrl+C để dừng API; PostgreSQL sẽ tiếp tục chạy."
& $nodePath $serverEntry
if ($LASTEXITCODE -ne 0) { throw "API Slink đã dừng với mã lỗi $LASTEXITCODE." }
