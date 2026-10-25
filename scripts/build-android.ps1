param([switch]$Standalone)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'environment.ps1')
$tp6AndroidProject = Join-Path $tp6Root 'mobile\android'

# local.properties es específico de esta PC y se excluye de Git.
# Gradle necesita barras normales para interpretar la ruta Windows del SDK.
$tp6SdkPath = $env:ANDROID_HOME.Replace('\', '/')
[IO.File]::WriteAllText(
    (Join-Path $tp6AndroidProject 'local.properties'),
    "sdk.dir=$tp6SdkPath`n",
    [Text.UTF8Encoding]::new($false)
)
Push-Location $tp6AndroidProject
try {
    # Compilación limitada para no saturar la computadora durante el trabajo remoto.
    # Release incluye el bundle JavaScript y funciona sin Metro. La firma sigue
    # siendo de prueba; no es una clave destinada a publicación en Play Store.
    $tp6Task = if ($Standalone) { 'assembleRelease' } else { 'assembleDebug' }
    & .\gradlew.bat $tp6Task --no-daemon --max-workers=2 '-PreactNativeArchitectures=arm64-v8a'
    if ($LASTEXITCODE -ne 0) { throw 'Falló la compilación Android del TP6.' }
    if ($Standalone) { Write-Output 'APK autónomo: mobile/android/app/build/outputs/apk/release/app-release.apk' }
    else { Write-Output 'APK: mobile/android/app/build/outputs/apk/debug/app-debug.apk' }
} finally {
    Pop-Location
}
