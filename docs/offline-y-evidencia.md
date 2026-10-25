# Evidencia, almacenamiento y sincronización

## Flujo de campo

Equipos ofrece LAN, SNMP, SSH y QR. El descubrimiento usa sockets TCP vinculados a la interfaz Wi-Fi: recorre la subred real /24 a /30, hasta 254 direcciones, con 16 trabajadores y 250 ms por puerto (80, 443, 22, 2222). Un handshake exitoso confirma un servicio activo; el resultado no equivale a un inventario completo. No se lee `/proc/net`, restringido por Android, ni se fabrican MAC o nombres. La IP encontrada se puede llevar al formulario SNMP/SSH, cuyos puertos y credenciales siguen siendo editables.

QR utiliza una foto confirmada por la persona y ML Kit 17.3.0 con modelo incluido en el APK. Si no encuentra un código, aplica ZXing-C++ 2.3.0 offline, con búsqueda de orientación, inversión y escalas. Esta elección se comprobó con la foto real del QR en la pantalla de la PC: ZXing-C++ la pudo leer mientras el lector inicial no la reconocía. «Reintentar última foto» permite repetir el procesamiento de la captura privada más reciente sin volver a fotografiar. El contenido debe ser un identificador de catálogo, como `router-casa` o `tp6-lab`. No se navega automáticamente a URLs recibidas en códigos. La primera ficha se consulta al backend y se conserva en caché local; el formulario permite completar la copia local.

Instalaciones requiere sitio, equipo, notas, al menos una foto y ubicación real. La cámara del sistema escribe el archivo completo en el directorio privado mediante FileProvider; no se guarda una miniatura como evidencia. Se admiten hasta cinco fotos. La ubicación solicita permisos en tiempo de ejecución, acepta precisión aproximada si así la concede la persona, muestra precisión y fecha, descarta mediciones antiguas y vence a los 30 segundos. No inventa coordenadas ni sustituye un GPS fallido por un valor fijo.

Android PdfDocument genera un PDF paginado con ID, fecha, sitio, equipo, notas, GPS, precisión y fotografías con su orientación EXIF. El reporte se puede compartir mediante la hoja del sistema. No se envía a nadie automáticamente mediante esa acción: la persona elige el destino.

## Persistencia local

`field-store.json` en el almacenamiento privado conserva registros, fichas, URL y outbox. Se usa AtomicFile y un ejecutor nativo serializado. JavaScript serializa las mutaciones y publica cambios solo tras completar la escritura. Un error de lectura bloquea nuevas escrituras para evitar reemplazar información ilegible. `allowBackup=false`; no contiene credenciales SSH.

El guardado de una instalación genera primero el PDF y luego persiste registro + entrada de cola juntos. Si falla, no se anuncia éxito. Fotos/PDF permanecen en los subdirectorios privados `evidence` y `reports`. El historial permite filtrar por equipo/sitio y consultar o compartir sin servidor. El formulario se mantiene montado al cambiar de pestaña; los datos sin guardar todavía no son registros persistidos.

## Outbox

Cada registro tiene ID estable. La cola conserva intentos, próximo intento, error y conflicto. NetInfo dispara el procesamiento al recuperar conexión; también se revisa al volver a primer plano y cada 15 segundos mientras la app ejecuta JavaScript. No depende de que haya Internet público: puede funcionar con el stub local. En segundo plano el sistema puede suspender la app; se reanuda al abrirla, sin prometer ejecución permanente.

Los reintentos usan espera exponencial desde 5 segundos con máximo 5 minutos. El botón manual puede adelantar el reintento. Cada petición vence a los 30 segundos. Los adjuntos viajan en base64; la cola solo se elimina al recibir `accepted: true` con el mismo ID. Si el servidor persistió pero se perdió la respuesta, el reenvío es idempotente. HTTP 409 mantiene el conflicto visible. «Resolver conservando una copia» crea un ID nuevo, conserva el original y no sobrescribe la versión remota.

El stub guarda adjuntos reales antes de confirmar el registro y rechaza instalaciones sin evidencia y GPS. Véase `backend/README.md`. Escucha en loopback; el APK permite HTTP solamente hacia localhost para esta prueba. Un despliegue externo requiere HTTPS y autenticación.

## Alcance

Validación real del 25 de octubre de 2026: el Samsung encontró el router de la LAN, descargó la ficha del laboratorio y guardó un diagnóstico y una instalación mientras el backend estaba apagado. Se comprobó un PDF de una página con imagen y GPS coincidentes con el registro. Al reactivar el servidor, ambos registros se enviaron automáticamente, la cola quedó vacía y los adjuntos recibidos coincidieron byte a byte. El script `scripts/check-field-data.py --installation --backend` verifica estas condiciones sin imprimir evidencia personal. Usa `run-as`, por lo que esta inspección directa de archivos corresponde al APK debug; en release se comprueba el historial y el PDF mediante la app.

Implementación Android. Almacenamiento JSON transaccional por archivo apropiado para el volumen de un TP; no es WatermelonDB, que el PDF propone como stack sugerido. No hay edición de registros ya finalizados ni sincronización bidireccional de catálogos. Fotos descartadas o capturas de códigos pueden quedar como archivos privados sin referencia; no se implementó limpieza automática. Los límites actuales son 15 MB por adjunto y 64 MB por petición; un rechazo conserva el registro local con error visible.

Las utilidades Python son opcionales y se describen en `scripts/requirements-tools.txt`; no se instalan ni ejecutan en el teléfono. `check-code-photo.py` permite contrastar una captura fallida con el mismo motor C++ del respaldo. `.tools/barcode/` contiene únicamente herramientas/resultados del diagnóstico y se excluye de las lecturas habituales.

Regresión detectada con la captura real del QR `tp6-lab`: en cierta orientación un detector general devolvía un falso DataBar `71734501075707`. Se corrigió el orden: ML Kit busca QR y el respaldo agota las orientaciones QR antes de consultar formatos de barras. No se agrega una asociación especial entre ese número y el laboratorio; la ficha se consulta con el texto realmente decodificado.

Referencias oficiales: [ML Kit](https://developers.google.com/ml-kit/vision/barcode-scanning/android), [ZXing-C++ Android](https://github.com/zxing-cpp/zxing-cpp/blob/v2.3.0/wrappers/android/README.md), [captura de fotos](https://developer.android.com/media/camera/camera-deprecated/photobasics), [LocationManager](https://developer.android.com/reference/android/location/LocationManager), [restricciones de Android](https://developer.android.com/about/versions/10/privacy/changes), [NetInfo](https://github.com/react-native-netinfo/react-native-netinfo).

Segunda regresión real: una foto completa y enfocada de `router-casa` no se decodificaba a 4080 × 2296. El diagnóstico independiente la leyó tras reducción bilineal a 1200, 1000 y 800 píxeles de lado mayor. El respaldo nativo prueba esas escalas antes del original y conserva el archivo intacto. Además, Reintentar última foto guarda explícitamente la URI de la última imagen enviada al lector; no selecciona una fotografía de instalación por ser más reciente.
