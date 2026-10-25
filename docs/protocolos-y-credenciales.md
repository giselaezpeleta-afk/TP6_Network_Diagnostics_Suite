# SNMP y SSH implementados — TP6

## Resultado verificado en Android

El 11 de octubre de 2026 se instaló el APK actualizado en el Samsung A55 (Android 16). En Equipos hay un selector SNMP/SSH, con formularios editables y botones de diagnóstico. Las pestañas principales permanecen visibles.

Pruebas desde la app contra el contenedor de laboratorio:

- SNMP: `sysName = TP6-Lab`, uptime y contadores de entrada/salida de `lo` y `eth0`.
- SSH: `uptime` e `ip -s link` devuelven salidas reales.
- Una huella SSH incorrecta produce rechazo explícito. Se restauró la huella correcta después de comprobarlo.
- La credencial sobrevive al reinicio de la app: solo queda `ssh-credential.enc`; la copia temporal `ssh-import` fue eliminada.
- Jest, TypeScript y lint pasaron. Las pruebas de Jest cubren protocolo, timeout, cancelación, origen de datagramas y navegación.

Capturas de verificación en `.tools/android-preview/`; no se incluyen en Git. El laboratorio continúa en `192.168.101.3`, puertos UDP/1161 y TCP/2222. La IP y los puertos iniciales son valores comprobados del laboratorio, no resultados simulados.

## Subconjunto SNMP

`mobile/src/snmp/ber.ts` implementa BER/ASN.1 propio para GetRequest/GetResponse. La codificación contempla mensajes v1/v2c; el cliente y el formulario actuales usan v2c.

Se validan límites de longitud, estructura del mensaje, community, versión, request-id, errores del agente y correspondencia de OIDs. El transporte descarta datagramas de otra IP/puerto, vence a los cinco segundos y cierra el socket al terminar o cancelar.

Tipos leídos: INTEGER, OCTET STRING UTF-8, OBJECT IDENTIFIER, Counter32, Gauge32, TimeTicks y NULL/excepciones de OID ausente. No hay SET, SNMPv3, GetBulk, GetNext ni Counter64.

OIDs consultados:

| Dato | OID |
| --- | --- |
| sysName.0 | 1.3.6.1.2.1.1.5.0 |
| sysUpTime.0 | 1.3.6.1.2.1.1.3.0 |
| ifNumber.0 | 1.3.6.1.2.1.2.1.0 |
| ifDescr.i | 1.3.6.1.2.1.2.2.1.2.i |
| ifInOctets.i | 1.3.6.1.2.1.2.2.1.10.i |
| ifOutOctets.i | 1.3.6.1.2.1.2.2.1.16.i |

Limitación explícita: hasta 16 interfaces, consultando índices 1..ifNumber. Funciona en el laboratorio, cuyos índices son 1 y 2; no garantiza descubrir interfaces con índices dispersos. Para esos equipos habrá que incorporar recorrido GetNext o índices obtenidos de su ficha. Los contadores son acumulados de 32 bits, pueden reiniciarse/desbordarse y no representan velocidad instantánea. Un OID ausente se muestra como no disponible, sin inventar cero.

sysUpTime mide el tiempo desde que se inicializó la parte de gestión SNMP. No necesariamente coincide con `uptime` de SSH, que consulta el tiempo del sistema operativo.

SNMP v1/v2c transmite la community y los datos sin cifrado. El alcance de esta entrega es una LAN de pruebas y un agente de solo lectura.

## SSH y credenciales

La biblioteca sugerida `react-native-ssh-sftp` desactiva StrictHostKeyChecking en su implementación Android. No se instaló. Se implementó un adaptador propio sobre el fork mantenido JSch 2.28.8, con Bouncy Castle 1.86 para Ed25519.

El adaptador exige una huella SHA256 obtenida por un canal confiable y mantiene StrictHostKeyChecking habilitado. La huella inicial se calculó a partir de la clave pública del laboratorio previamente obtenida directamente desde Docker; el perfil JSON contiene solo información pública, nunca la clave privada.

La autenticación actual usa clave privada, sin contraseña. La clave se almacena cifrada mediante AES-256-GCM; la clave de cifrado está en Android Keystore, ligada a la app. La importación usa el selector de archivos del sistema y no conserva permisos permanentes sobre el archivo fuente. La interfaz actual contempla claves sin frase de protección; la clave de laboratorio es Ed25519. Hay una sola credencial local; la gestión de múltiples credenciales y contraseñas queda pendiente.

Para la prueba debug, `scripts/provision-lab-key.py` transfirió la clave del laboratorio a un archivo temporal privado de la app mediante `run-as`, sin mostrarla ni incluirla en JavaScript. `hasKey()` la cifra y elimina ese archivo. Esa provision automática solo está habilitada en builds debug. El archivo original que el usuario seleccione al importar manualmente pertenece al usuario y no se elimina.

Solo se permiten `uptime` e `ip -s link` en cliente y servidor. No se habilita consola interactiva. La conexión y el comando tienen tiempos máximos, la salida se limita a 64 KiB y se cierran las sesiones al finalizar. No se registran secretos ni se muestran errores crudos de la librería. Este adaptador es Android; falta implementar/verificar iOS.

Los diagnósticos exitosos se guardan en el historial persistente y se incorporan a la outbox. La aplicación también integra descubrimiento LAN, evidencia fotográfica, GPS, PDF y sincronización; véase [offline-y-evidencia.md](offline-y-evidencia.md).

## Fuentes técnicas

- RFC 1905: https://www.rfc-editor.org/rfc/rfc1905.html
- UDP: https://github.com/tradle/react-native-udp
- Implementación SSH sugerida revisada: https://github.com/shaqian/react-native-ssh-sftp/blob/master/android/src/main/java/com/reactlibrary/RNSshClientModule.java
- JSch mantenido: https://github.com/mwiede/jsch
- Android Keystore: https://developer.android.com/privacy-and-security/keystore
