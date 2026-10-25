# Ejecutar: . .\scripts\environment.ps1
# Reutilizamos las herramientas del TP5 en lectura; las cachés del TP6 son propias.
$tp6Root = Split-Path $PSScriptRoot -Parent
$sharedTools = Join-Path (Split-Path $tp6Root -Parent) 'TP5-Network\.tools'
# Preferir rutas estándar para que otra PC pueda reproducir la compilación.
# El perfil portable de la PC de pruebas queda como alternativa local.
$tp6JavaCandidates = @($env:JAVA_HOME, (Join-Path $sharedTools 'java\jdk-17.0.20.1+1'))
$tp6SdkCandidates = @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, (Join-Path $env:LOCALAPPDATA 'Android\Sdk'), (Join-Path $sharedTools 'android-sdk'))
$tp6Java = $tp6JavaCandidates | Where-Object { $_ -and (Test-Path -LiteralPath (Join-Path $_ 'bin\java.exe')) } | Select-Object -First 1
$tp6Android = $tp6SdkCandidates | Where-Object { $_ -and (Test-Path -LiteralPath (Join-Path $_ 'platform-tools\adb.exe')) } | Select-Object -First 1
if (-not $tp6Java) { throw 'Configurar JAVA_HOME con la ruta de un JDK 17 antes de compilar.' }
if (-not $tp6Android) { throw 'Configurar ANDROID_HOME o ANDROID_SDK_ROOT con la ruta del Android SDK.' }
# Estas variables afectan solamente a la sesión actual de PowerShell.
$env:JAVA_HOME = $tp6Java
$env:ANDROID_HOME = $tp6Android
$env:GRADLE_USER_HOME = Join-Path $tp6Root '.gradle-local'
$env:PATH = "$tp6Java\bin;$tp6Android\platform-tools;$env:PATH"
