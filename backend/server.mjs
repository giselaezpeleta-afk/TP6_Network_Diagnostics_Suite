import http from 'node:http';
import {mkdir, readFile, writeFile, rename} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

// Stub de laboratorio sin dependencias. Solo escucha en localhost por defecto.
// ADB reverse permite probarlo sin abrir otro puerto en el firewall doméstico.
const dataDir = resolve(process.env.TP6_DATA_DIR || '.tools/backend-data');
const cards = [
  {id: 'router-casa', name: 'Router de casa', model: 'Navigator SM164242-GHDUHR-T21V', ip: '192.168.101.1', notes: 'Puerta de enlace de la LAN doméstica. No se confirmó soporte SNMP/SSH.'},
  {id: 'tp6-lab', name: 'Laboratorio TP6', model: 'Debian / Net-SNMP / OpenSSH', ip: '192.168.101.3', notes: 'SNMP UDP/1161; SSH TCP/2222. Usuario técnico: tecnico. Autenticación mediante clave protegida en Android.'},
];
const validId = value => typeof value === 'string' && /^[\w.-]{1,128}$/.test(value);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function receive(req) {
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64 * 1024 * 1024) {const error = new Error('Cuerpo demasiado grande');error.status = 413;throw error;}
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export function createServer(directory = dataDir) {
  // Serializar escrituras hace que duplicados concurrentes también sean idempotentes.
  let queue = Promise.resolve();
  return http.createServer(async (req, res) => {
    const send = (status, body) => {res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8'});res.end(JSON.stringify(body));};
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/health') {send(200, {ok: true});return;}
      if (req.method === 'GET' && url.pathname.startsWith('/equipment/')) {
        const id = decodeURIComponent(url.pathname.slice('/equipment/'.length));
        const card = cards.find(item => item.id === id);send(card ? 200 : 404, card || {error: 'Ficha no encontrada'});return;
      }
      if (req.method !== 'POST' || url.pathname !== '/sync') {send(404, {error: 'Ruta no encontrada'});return;}
      const body = await receive(req);
      const record = body.record;
      if (!record || !validId(record.id) || !['installation','diagnostic'].includes(record.kind) ||
          typeof record.equipment !== 'string' || typeof record.notes !== 'string' || !Number.isFinite(Date.parse(record.createdAt)) || !Array.isArray(body.attachments)) {
        send(400, {error: 'Registro inválido'});return;
      }
      const attachments = body.attachments.map(attachment => {
        if (!validId(attachment.name) || typeof attachment.data !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(attachment.data)) {throw new Error('Adjunto inválido');}
        const bytes = Buffer.from(attachment.data, 'base64');
        if (!bytes.length || bytes.length > 15 * 1024 * 1024) {throw new Error('Tamaño de adjunto inválido');}
        return {...attachment, bytes};
      });
      if (record.kind === 'installation') {
        const gps = record.location;
        if (!gps || !Number.isFinite(gps.latitude) || Math.abs(gps.latitude) > 90 || !Number.isFinite(gps.longitude) || Math.abs(gps.longitude) > 180 ||
            !record.photos?.length || !record.pdf || ![...record.photos,record.pdf].every(uri => attachments.some(a => a.name === uri.split('/').pop()))) {
          send(400, {error: 'Falta evidencia, GPS o PDF'});return;
        }
      }
      const operation = queue.then(async () => {
        await mkdir(directory, {recursive: true});
        const file = join(directory, `${record.id}.json`);
        let previous;
        try {previous = JSON.parse(await readFile(file,'utf8'));} catch (error) {if (error.code !== 'ENOENT') {throw error;}}
        const digest = hash(body);
        if (previous) {send(previous.digest === digest ? 200 : 409, previous.digest === digest ? {id: record.id, accepted: true, duplicate: true} : {error: 'Conflicto: ID ya recibido con otro contenido'});return;}
        const folder = join(directory, record.id);await mkdir(folder,{recursive: true});
        for (const attachment of attachments) {await writeFile(join(folder, attachment.name), attachment.bytes);}
        await writeFile(`${file}.tmp`, JSON.stringify({record, digest, attachments: attachments.map(a => a.name), receivedAt: new Date().toISOString()},null,2));
        await rename(`${file}.tmp`,file);
        send(201,{id: record.id,accepted: true});
      });
      queue = operation.catch(() => {});await operation;
    } catch (error) {if (!res.headersSent) {send(error.status || 400, {error: error.status === 413 ? 'Máximo 64 MB' : 'Solicitud inválida o error de almacenamiento'});}}
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.TP6_PORT || 8765);
  createServer().listen(port, process.env.TP6_HOST || '127.0.0.1', () => console.log(`Backend TP6: http://127.0.0.1:${port}`));
}
