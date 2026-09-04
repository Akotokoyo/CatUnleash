$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$androidRoot = Join-Path $projectRoot "android"
$hostsFile = Join-Path $androidRoot "gradle-hosts.txt"
$sourceApk = Join-Path $androidRoot "app\build\outputs\apk\debug\app-debug.apk"
$targetApk = Join-Path $projectRoot "CatUnleashed-debug.apk"

if (Test-Path $hostsFile) {
    $env:JAVA_TOOL_OPTIONS = "-Djdk.net.hosts.file=$($hostsFile.Replace('\', '/'))"
}

Push-Location $androidRoot
try {
    & ".\gradlew.bat" --no-daemon assembleDebug
    if ($LASTEXITCODE -ne 0) {
        throw "Gradle build failed with exit code $LASTEXITCODE."
    }
}
finally {
    Pop-Location
}

if (-not (Test-Path $sourceApk)) {
    throw "Gradle completed but the APK was not found at $sourceApk."
}

Copy-Item -LiteralPath $sourceApk -Destination $targetApk -Force
$sizeMb = [Math]::Round((Get-Item $targetApk).Length / 1MB, 2)
Write-Host "APK ready: $targetApk ($sizeMb MB)"
