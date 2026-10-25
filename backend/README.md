# Backend mínimo de sincronización

Ejecutar desde la raíz del proyecto con Node instalado:

```powershell
node backend/server.mjs
. .\scripts\environment.ps1
adb -s DIRECCION_DEL_TELEFONO reverse tcp:8765 tcp:8765
```

En Historial, guardar `http://127.0.0.1:8765` como servidor. Este stub escucha solo en la PC (loopback); no requiere abrir el firewall. Mientras no esté conectado ADB, el teléfono conservará la cola y reintentará al volver a conectarlo. Para un servidor accesible fuera de esta demostración, se necesita desplegarlo con HTTPS y autenticación; no publicar este stub directamente.

- `GET /health`: estado.
- `GET /equipment/router-casa` y `/equipment/tp6-lab`: fichas de los equipos utilizados en la validación. Los códigos contienen solamente esos identificadores.
- `POST /sync`: registro y adjuntos codificados en base64. La respuesta confirma el ID después de persistir el registro y sus archivos.
- Reenvío idéntico: HTTP 200, sin duplicación. Mismo ID y distinto contenido: HTTP 409, sin sobrescritura.
- Máximo 64 MB por petición y 15 MB por archivo. Los archivos y la confirmación se guardan en `.tools/backend-data/`, excluida de Git por contener evidencia personal.
- Variables opcionales: `TP6_DATA_DIR`, `TP6_PORT`, `TP6_HOST`. No ampliar el host de escucha para la prueba por ADB.

Prueba automática: `node --test backend/server.test.mjs`.

Las fichas editadas en el teléfono son copias locales para consulta offline. Esta primera versión no publica cambios de catálogo: el backend es el stub de recepción de diagnósticos y reportes solicitado por el enunciado.
