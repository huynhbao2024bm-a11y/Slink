param([string]$Destination = '', [string]$AppOrigin = 'https://slink-xny3.onrender.com')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $Destination) { $Destination = Join-Path $projectRoot 'dist/Slink-0.3.4-preview.apk' }
$previousJava = $env:JAVA_HOME
$previousAndroid = $env:ANDROID_HOME
try {
    if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android/Sdk' }
    if (-not (Test-Path -LiteralPath $env:ANDROID_HOME)) { throw 'Install the Android SDK using Android Studio first.' }
    if (-not $env:JAVA_HOME) {
        $jdkRoot = Join-Path $env:USERPROFILE '.gradle/jdks'
        $jdk = Get-ChildItem -LiteralPath $jdkRoot -Directory -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -match '-21-' } | Select-Object -First 1
        if ($jdk) { $env:JAVA_HOME = $jdk.FullName }
        else { throw 'Set JAVA_HOME to an installed JDK 17 or 21 directory.' }
    }
    $javaRelease = Join-Path $env:JAVA_HOME 'release'
    if (-not (Test-Path -LiteralPath $javaRelease) -or
        -not ((Get-Content -LiteralPath $javaRelease) -match '^JAVA_VERSION="(17|21)[.\-\"]')) {
        throw 'JAVA_HOME must point to JDK 17 or 21. The newer JDK bundled with Android Studio may not work with this build.'
    }
    Push-Location (Join-Path $projectRoot 'android')
    try {
        & .\gradlew.bat --no-daemon "-PslinkOrigin=$AppOrigin" :app:assembleDebug
        if ($LASTEXITCODE -ne 0) { throw 'Android build did not complete.' }
    } finally { Pop-Location }
    $target = [IO.Path]::GetFullPath($Destination)
    [IO.Directory]::CreateDirectory((Split-Path -Parent $target)) | Out-Null
    Copy-Item -LiteralPath (Join-Path $projectRoot 'android/app/build/outputs/apk/debug/app-debug.apk') -Destination $target
    Write-Output "APK ready: $target"
    Get-FileHash -LiteralPath $target -Algorithm SHA256
} finally {
    $env:JAVA_HOME = $previousJava
    $env:ANDROID_HOME = $previousAndroid
}
