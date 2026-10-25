# Equipo de laboratorio del TP6

Configuración preparada para un contenedor Linux con Net-SNMP y OpenSSH.
El 11 de octubre de 2026 se construyó e inició, con respuestas SNMP y SSH verificadas. Docker Desktop requirió reiniciar su motor Linux.

- SNMP: UDP/1161 de la PC → UDP/161 del contenedor, community de laboratorio `tp6-lab-readonly`, solo lectura.
- SSH: TCP/2222 de la PC → TCP/22 del contenedor, usuario `tecnico`, autenticación con clave pública.
- Comandos permitidos: `uptime` e `ip -s link`. No se habilita consola interactiva.
- Las métricas son reales del contenedor, no datos simulados del router.
- Por defecto Compose publica puertos únicamente en `127.0.0.1`; para usar la LAN se indica explícitamente `LAB_BIND_IP`.
- En la sesión actual se publicó sobre `192.168.101.3`, la IP Wi-Fi verificada de la PC. El Android usa `192.168.101.4`. Las dos reglas de firewall creadas permiten únicamente ese origen y esos puertos, conservando el perfil público de Windows.

## Preparación e inicio

Con Docker funcionando, desde la raíz del proyecto:

```powershell
New-Item -ItemType Directory -Force .tools/lab
# Crear una clave solo para el laboratorio; ssh-keygen solicitará la frase de protección.
C:\Windows\System32\OpenSSH\ssh-keygen.exe -t ed25519 -f .tools/lab/id_ed25519
Copy-Item .tools/lab/id_ed25519.pub .tools/lab/authorized_keys
docker compose -f lab/compose.yaml up --build -d
```

No iniciar Compose antes de crear `authorized_keys`: el montaje debe ser un archivo.
No enviar la clave privada al repositorio. `.tools/lab/` está excluida de Git y de las revisiones habituales.

## Verificación

```powershell
docker compose -f lab/compose.yaml ps
docker compose -f lab/compose.yaml exec equipo snmpget -v2c -c tp6-lab-readonly 127.0.0.1 1.3.6.1.2.1.1.5.0 1.3.6.1.2.1.1.3.0
C:\Windows\System32\OpenSSH\ssh.exe -i .tools/lab/id_ed25519 -p 2222 -o HostKeyAlias=tp6-lab -o UserKnownHostsFile=.tools/lab/known_hosts -o StrictHostKeyChecking=yes tecnico@192.168.101.3 uptime
```

El comando SSH anterior usa la publicación LAN y el archivo de hosts ya verificado para la sesión actual. En otra PC o tras recrear el contenedor, comprobar la nueva clave pública directamente desde Docker antes de actualizar ese archivo.

En la verificación realizada se obtuvo la clave de host pública directamente del contenedor y se guardó en `.tools/lab/known_hosts` con alias `tp6-lab`. Se usó verificación estricta de host, sin aceptar claves desconocidas automáticamente. Las claves de host se generan al arrancar un contenedor nuevo: si se recrea, hay que volver a comprobar su huella.

## Uso desde la LAN doméstica

Para iniciar o mantener la publicación en la IP comprobada de esta PC:

```powershell
$env:LAB_BIND_IP = '192.168.101.3'
docker compose -f lab/compose.yaml up -d
```

Si cambian las IP, comprobarlas antes de configurar puertos o reglas. El script `scripts/enable-lab-firewall.ps1` requiere administrador y recibe explícitamente `-PcAddress` y `-PhoneAddress`. Las reglas actuales ya existen; no volver a crearlas.

Prueba del enlace desde el Android conectado por ADB:

```powershell
python scripts/check-lab-from-android.py --device 'SERIAL_MOSTRADO_POR_ADB' --host 192.168.101.3
```

Esta prueba auxiliar consulta SNMP desde el teléfono y valida su GetResponse; para SSH verifica el saludo TCP. Después se integraron los clientes React Native y se verificaron consultas SNMP y ejecución SSH autenticada desde la propia app. Ver `docs/protocolos-y-credenciales.md` para su alcance.

Resultados observados: `sysName = TP6-Lab`, sysUpTime y contadores de entrada de interfaces; `uptime` e `ip -s link` por SSH exitosos y `whoami` rechazado por la lista cerrada.

También se verificó la restricción de escritura: una operación SNMP SET devolvió `noAccess` y el nombre siguió siendo `TP6-Lab`. El estado final del contenedor fue `healthy`.

El sistema no guarda contraseñas SSH. La clave de cliente de prueba no tiene frase de protección y se limita al laboratorio; no se incluye en Git ni en el APK. La app permite importarla mediante el selector de archivos y la cifra con Android Keystore. La provisión automatizada con `scripts/provision-lab-key.py` solo corresponde al APK debug; el APK autónomo utiliza la importación manual. Mantener la copia privada original fuera del repositorio.

Para detener únicamente este laboratorio:

```powershell
docker compose -f lab/compose.yaml down
```

Las reglas de Windows permanecen tras detener el contenedor. Para retirarlas al terminar definitivamente las pruebas, ejecutar como administrador:

```powershell
Remove-NetFirewallRule -Name 'TP6-Lab-SNMP','TP6-Lab-SSH'
```

Mantener `lab/` en las revisiones: contiene configuración y scripts propios.
Las imágenes y cachés internas de Docker no requieren lecturas rutinarias.
