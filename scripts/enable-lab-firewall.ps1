param(
    [Parameter(Mandatory = $true)][string]$PcAddress,
    [Parameter(Mandatory = $true)][string]$PhoneAddress
)
$ErrorActionPreference = 'Stop'
$labIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$labPrincipal = [Security.Principal.WindowsPrincipal]::new($labIdentity)
if (-not $labPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Windows requiere una consola elevada como administrador para crear estas reglas.'
}
# Requiere administrador. Se habilitan únicamente los dos servicios de este
# laboratorio, hacia esta IP de la PC y desde este teléfono; no se cambia
# el perfil público/privado de la red ni se desactiva el firewall.
foreach ($address in @($PcAddress, $PhoneAddress)) {
    $parsed = [System.Net.IPAddress]::Parse($address)
    if ($parsed.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) {
        throw 'Este laboratorio requiere direcciones IPv4.'
    }
}
if (-not (Get-NetIPAddress -IPAddress $PcAddress -ErrorAction SilentlyContinue)) {
    throw 'La IP indicada no pertenece a la PC. Revisar antes de abrir puertos.'
}
foreach ($service in @(
    @{ Name = 'TP6-Lab-SNMP'; Protocol = 'UDP'; Port = 1161 },
    @{ Name = 'TP6-Lab-SSH'; Protocol = 'TCP'; Port = 2222 }
)) {
    if (Get-NetFirewallRule -Name $service.Name -ErrorAction SilentlyContinue) {
        throw "Ya existe la regla $($service.Name). Revisarla antes de repetir la configuración."
    }
    New-NetFirewallRule -Name $service.Name -DisplayName $service.Name `
        -Group 'TP6 Network Lab' -Direction Inbound -Action Allow -Profile Any `
        -Protocol $service.Protocol -LocalPort $service.Port `
        -LocalAddress $PcAddress -RemoteAddress $PhoneAddress -ErrorAction Stop | Out-Null
}
Write-Output 'Reglas del laboratorio creadas, limitadas al Android indicado.'
