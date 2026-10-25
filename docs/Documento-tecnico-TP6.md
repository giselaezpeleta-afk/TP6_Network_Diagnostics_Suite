# Documento técnico — Network Diagnostics Suite

Trabajo práctico 6 · Desarrollo de Aplicaciones Móviles · 2026

## Arquitectura implementada

Aplicación React Native 0.87.1 para Android con componentes claros inspirados en shadcn/ui. Tres secciones persistentes: Equipos, Instalaciones e Historial. Equipos agrupa LAN, SNMP, SSH y QR. El almacenamiento local es la fuente de datos del historial; la disponibilidad del servidor no condiciona el guardado de campo.

| Capa | Implementación |
| --- | --- |
| Descubrimiento | Módulo Kotlin, LinkProperties Wi-Fi, sockets TCP limitados a la subred real |
| SNMP | BER/ASN.1 propio en TypeScript y UDP mediante react-native-udp |
| SSH | Adaptador Kotlin sobre JSch mantenido, comandos predefinidos y huella estricta |
| Evidencia | Cámara del sistema, FileProvider, LocationManager, ML Kit y respaldo ZXing-C++ offline |
| Persistencia | Archivo privado con AtomicFile, mutaciones serializadas y outbox persistente |
| Reportes | PdfDocument nativo, texto paginado, fotografías y GPS |
| Sincronización | NetInfo, reintentos y confirmaciones contra stub Node sin dependencias |

Las bibliotecas del PDF se presentan como stack sugerido. Se utilizan adaptadores Android donde resuelven el requisito sin incorporar una dependencia React Native adicional. No se implementa iOS en esta entrega.

## Subconjunto SNMP y seguridad

El códec propio construye GetRequest y valida GetResponse: estructura BER, longitud, versión, request-id, community, OIDs, errores de agente y origen IP/puerto. Acepta INTEGER, OCTET STRING, OID, NULL, Counter32, Gauge32, TimeTicks y excepciones de varbind. No implementa SET, GetNext/GetBulk, walks completos, Counter64 ni SNMPv3. Usa un plazo de cinco segundos y libera el socket al terminar o cancelar.

Se consultan sysName, sysUpTime, ifNumber, ifDescr, ifInOctets e ifOutOctets. El cliente de diagnóstico está acotado a hasta 16 interfaces con índices densos 1..N. RX/TX son bytes acumulados, no velocidad instantánea; los contadores de 32 bits pueden desbordar. sysUpTime mide el agente SNMP y no necesariamente el encendido del sistema.

SNMP v1/v2c no cifra la comunidad. La prueba utiliza un agente de solo lectura dentro de la LAN; este enfoque no se presenta como adecuado para Internet o redes no confiables. Código y límites detallados: [protocolos-y-credenciales.md](protocolos-y-credenciales.md).

## Credenciales SSH

La app importa una clave privada OpenSSH sin frase de protección. La valida y la cifra mediante AES-256-GCM con una clave de Android Keystore; el archivo cifrado permanece en el almacenamiento privado. La clave privada no se entrega a JavaScript, no se escribe en logs ni se incluye en Git. Las copias temporales de provisión del laboratorio se eliminan tras cifrarlas. `allowBackup=false` evita incorporarlas a la copia estándar de la app.

La conexión exige la huella pública SHA-256 indicada por el técnico y no acepta automáticamente una identidad desconocida o distinta. Se permiten solamente `uptime` e `ip -s link`. Hay límites de conexión, ejecución y salida. El laboratorio además impone su propia lista de comandos y autenticación únicamente por clave. La huella es información pública; no sustituye una contraseña ni una clave privada.

## Cola offline y conflictos

Cada guardado finalizado persiste registro y entrada de outbox juntos. La interfaz publica el éxito después de completar la escritura. Un error de lectura bloquea escrituras para no reemplazar información potencialmente recuperable. Fotos y PDF se conservan como archivos privados.

NetInfo dispara el procesamiento al recuperar conexión; también se revisa al volver a primer plano y cada 15 segundos con JavaScript activo. Cada elemento conserva número de intentos, fecha del próximo intento, error y estado de conflicto. La espera exponencial parte de cinco segundos y se limita a cinco minutos. El sistema puede suspender la app en segundo plano: no se promete ejecución indefinida con la aplicación cerrada.

Los archivos se envían junto al registro. Solo se retira de la cola una confirmación positiva con el mismo ID. El backend persiste antes de confirmar, admite reenvíos idénticos sin duplicación y responde HTTP 409 si el mismo ID llega con otro contenido. La resolución disponible conserva el original y crea una copia con ID nuevo, sin sobrescribir la versión remota. La copia original se identifica como conflicto resuelto mediante una copia.

El stub escucha en localhost y se prueba mediante ADB reverse. El APK permite HTTP solo a localhost; un despliegue externo necesita HTTPS y autenticación. Límites: 15 MB por adjunto y 64 MB por petición. Las fichas se descargan y conservan localmente; la edición local no publica cambios al catálogo remoto.

## Evidencia y comprobaciones

La instalación exige sitio, equipo, notas, foto real y ubicación medida. Se informa precisión y fecha del GPS; no se completan coordenadas ficticias si falla el permiso o la medición. El PDF incorpora los datos y las fotos. El historial permite consultar por equipo o sitio sin servidor.

Se verificaron 12 pruebas móviles, la prueba del backend y compilaciones debug y autónoma. En el Samsung se comprobaron el descubrimiento del router, SNMP, ambos comandos SSH y lectura QR con consulta de ficha remota. Una instalación real generó un PDF con imagen/GPS. Con el backend apagado se conservaron instalación y diagnóstico; al reactivarlo se enviaron automáticamente y los adjuntos recibidos coincidieron byte a byte con los originales. El APK autónomo abre sin Metro. El video se entrega por separado en el campus.

La auditoría npm registrada informó cero vulnerabilidades tras actualizaciones compatibles; no equivale a una auditoría integral del código nativo.

Más detalles: [evidencia y offline](offline-y-evidencia.md), [backend](../backend/README.md), [seguridad de dependencias](seguridad-dependencias.md).
