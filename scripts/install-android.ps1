param(
    [Parameter(Mandatory = $true)]
    [string]$Device,
    [int]$MetroPort = 8082
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'environment.ps1')
$tp6Apk = Join-Path $tp6Root 'mobile\android\app\build\outputs\apk\debug\app-debug.apk'
if (-not (Test-Path -LiteralPath $tp6Apk)) {
    throw 'Todavía no existe el APK. Ejecutar scripts/build-android.ps1 primero.'
}

# El dispositivo se indica explícitamente para no instalar en otro teléfono.
$tp6DeviceState = & adb -s $Device get-state
if ($LASTEXITCODE -ne 0 -or $tp6DeviceState.Trim() -ne 'device') {
    throw 'El Android indicado no está conectado o no autorizó la depuración.'
}
& adb -s $Device install -r $tp6Apk
if ($LASTEXITCODE -ne 0) { throw 'No se pudo instalar el APK del TP6.' }

# La app debug busca Metro en localhost:8081 del teléfono. ADB lo conecta
# con el puerto reservado al TP6 en la PC, sin exponer Metro a toda la LAN.
& adb -s $Device reverse tcp:8081 "tcp:$MetroPort"
if ($LASTEXITCODE -ne 0) { throw 'No se pudo conectar el teléfono con Metro.' }
& adb -s $Device shell am start -n com.networkdiagnosticssuite/.MainActivity
if ($LASTEXITCODE -ne 0) { throw 'No se pudo abrir Network Diagnostics Suite.' }
