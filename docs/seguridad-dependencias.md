# Dependencias y alcance de seguridad

El informe npm registrado en [npm-audit-actual.json](npm-audit-actual.json) indica **0 vulnerabilidades** después de actualizaciones compatibles, sin utilizar `npm audit fix --force`. El resultado corresponde al árbol npm consultado y no constituye una auditoría integral del código nativo, el sistema operativo o el despliegue.

## Decisiones técnicas

- `package-lock.json` fija las versiones reproducibles de npm. Los cambios se verificaron con Jest, TypeScript, ESLint y compilación Android.
- Un override acotado de `@istanbuljs/load-nyc-config` a `js-yaml` 4.3.2 elimina su dependencia antigua de `sprintf-js`.
- La clave privada SSH se importa por separado, se cifra con AES-256-GCM y Android Keystore y no se distribuye en Git ni en el APK. La conexión verifica la huella del servidor.
- SNMP v1/v2c transmite la comunidad sin cifrado. Se limita a una LAN de pruebas y un agente de solo lectura.
- El stub se publica solamente en loopback, mediante ADB reverse. HTTP está permitido únicamente para localhost en la aplicación. Un servicio externo requiere HTTPS y autenticación.
- Fotos, coordenadas, PDFs de instalaciones y datos recibidos quedan fuera del repositorio público.
- El APK de entrega utiliza la firma de prueba; no se presenta como un paquete de producción para Play Store.

## Revisión reproducible

Desde `mobile/`, ejecutar `npm ci`, `npm audit`, `npm test -- --runInBand`, `npx tsc --noEmit` y `npm run lint`. Repetir la auditoría al cambiar dependencias. Las dependencias Maven y módulos Kotlin requieren revisión adicional; no están cubiertos por npm audit.
