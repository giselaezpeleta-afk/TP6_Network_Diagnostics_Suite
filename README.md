# Network Diagnostics Suite — TP6

Aplicación Android desarrollada con React Native para diagnosticar infraestructura de telecomunicaciones y registrar instalaciones con evidencia, incluso cuando el servidor no está disponible.

## Entrega

- [APK autónomo de prueba](https://github.com/giselaezpeleta-afk/TP6_Network_Diagnostics_Suite/releases/latest).
- [Documento técnico](docs/Documento-tecnico-TP6.md).
- Código fuente, pruebas, laboratorio Docker y backend de sincronización incluidos en este repositorio.
- Video demostrativo entregado por separado en el campus.

## Funciones

| Sección | Funciones |
| --- | --- |
| Equipos | Descubrimiento LAN, consultas SNMP, comandos SSH, lectura QR/barras y fichas técnicas con caché |
| Instalaciones | Sitio, equipo, notas, fotografías reales, ubicación y generación de PDF |
| Historial | Consulta local por equipo/sitio, PDF y estado de sincronización |

La outbox conserva los registros pendientes y reintenta su envío. El backend confirma después de persistir los datos y adjuntos; admite reenvíos idénticos y detecta conflictos sin sobrescribir registros.

## Instalación y prueba

Descargar el APK desde Releases e instalarlo en Android. Incluye JavaScript y abre sin Metro. Es una compilación ARM64 firmada con la clave de prueba del proyecto; no es una publicación en Play Store. La validación se realizó en Samsung A55 con Android 16.

Para reproducir el entorno de desarrollo: Node compatible con `mobile/package.json` (>= 22.11), Java 17 y Android SDK configurados. Expo Go no admite los módulos nativos de esta aplicación.

```powershell
cd mobile
npm ci
npm start
# En otra terminal, dentro de mobile:
npm run android
```

En Windows, `scripts/environment.ps1` admite `JAVA_HOME` y `ANDROID_HOME`/`ANDROID_SDK_ROOT`. Después de configurar las rutas:

```powershell
.\scripts\build-android.ps1 -Standalone
```

Salida: `mobile/android/app/build/outputs/apk/release/app-release.apk`.

### Backend y laboratorio

Desde la raíz, iniciar el stub y configurar el acceso desde el dispositivo autorizado:

```powershell
node backend/server.mjs
adb -s SERIAL reverse tcp:8765 tcp:8765
```

En Historial, guardar `http://127.0.0.1:8765`. El backend escucha en loopback y no necesita publicar un puerto en Internet. Los datos personales recibidos quedan en `.tools/backend-data/`, fuera de Git.

- [Backend: configuración y endpoints](backend/README.md).
- [Laboratorio SNMP/SSH y generación de claves propias](lab/README.md).
- [Etiquetas QR](docs/etiquetas/imprimir.html): contienen identificadores de equipos, no credenciales.

Las direcciones del perfil de laboratorio corresponden a una LAN de prueba y deben adaptarse a otra red. La clave SSH privada debe generarse e importarse por separado; no se distribuye en el repositorio ni en el APK. Verificar la huella del servidor antes de usarla.

## Verificación

Desde `mobile/`:

```powershell
npm test -- --runInBand
npx tsc --noEmit
npm run lint
```

Desde la raíz: `node --test backend/server.test.mjs`.

Se comprobaron en el teléfono descubrimiento del router, SNMP, ambos comandos SSH, lectura de QR, foto/GPS, PDF y sincronización tras recuperar el backend. La auditoría npm registrada informa cero vulnerabilidades; su alcance y las restricciones funcionales se detallan en la documentación.

## Alcance

Implementación Android. SNMP usa un subconjunto propio BER/ASN.1 y consultas v2c de solo lectura; los contadores son acumulados de 32 bits y no representan velocidad instantánea. El descubrimiento por sockets no garantiza identificar todos los equipos ni obtener MAC/hostname. La sincronización opera con la app activa o al volver a primer plano. El stub es de laboratorio: un despliegue externo requiere HTTPS y autenticación.

Detalles: [SNMP y credenciales SSH](docs/protocolos-y-credenciales.md), [evidencia y sincronización](docs/offline-y-evidencia.md), [dependencias](docs/seguridad-dependencias.md).
