import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { field } from './native';
import { ready, snapshot, update, newId } from './store';

let running = false;
export async function request(path: string, body?: unknown) {
  const base = snapshot().endpoint;
  if (!base) {
    throw new Error('Configurá el servidor en Historial.');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    return await fetch(`${base}${path}`, {
      method: body ? 'POST' : 'GET',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  } finally {
    clearTimeout(timeout);
  }
}
export async function synchronize(force = false) {
  await ready;
  if (running || !snapshot().endpoint || !snapshot().loaded) {
    return;
  }
  running = true;
  try {
    for (const item of [...snapshot().outbox]) {
      if (item.conflict || (!force && item.nextAttempt > Date.now())) {
        continue;
      }
      const record = snapshot().records.find(row => row.id === item.id);
      if (!record) {
        continue;
      }
      try {
        // Adjuntos reales, no rutas privadas que el servidor no podría leer.
        const attachments = [];
        for (const uri of [
          ...(record.photos || []),
          ...(record.pdf ? [record.pdf] : []),
        ]) {
          attachments.push({
            name: uri.split('/').pop(),
            data: await field.readAttachment(uri),
          });
        }
        const response = await request('/sync', { record, attachments });
        if (response.status === 409) {
          await update(current => ({
            ...current,
            outbox: current.outbox.map(row =>
              row.id === item.id
                ? {
                    ...row,
                    conflict: true,
                    error:
                      'El servidor tiene otro contenido con el mismo ID. La copia local se conserva.',
                  }
                : row,
            ),
          }));
          continue;
        }
        if (!response.ok) {
          throw new Error(`Servidor: HTTP ${response.status}`);
        }
        const ack = await response.json();
        if (ack.id !== record.id || ack.accepted !== true) {
          throw new Error('Confirmación inválida del servidor.');
        }
        await update(current => ({
          ...current,
          outbox: current.outbox.filter(row => row.id !== item.id),
        }));
      } catch (error) {
        await update(current => ({
          ...current,
          outbox: current.outbox.map(row =>
            row.id === item.id
              ? {
                  ...row,
                  attempts: row.attempts + 1,
                  nextAttempt:
                    Date.now() +
                    Math.min(300000, 5000 * 2 ** Math.min(row.attempts, 6)),
                  error:
                    error instanceof Error
                      ? error.message
                      : 'Sin conexión con el servidor.',
                }
              : row,
          ),
        }));
      }
    }
  } finally {
    running = false;
  }
}
export async function resolveAsCopy(id: string) {
  const record = snapshot().records.find(row => row.id === id);
  if (!record) {
    return;
  }
  // Resolución explícita: conservar ambas versiones en lugar de pisar la remota.
  const copy = {
    ...record,
    id: newId(),
    notes: `${record.notes}\nCopia para resolver conflicto del registro ${id}.`,
  };
  await update(current => ({
    ...current,
    records: [
      copy,
      ...current.records.map(row =>
        row.id === id ? { ...row, resolvedAsCopy: true } : row,
      ),
    ],
    outbox: [
      ...current.outbox.filter(row => row.id !== id),
      { id: copy.id, attempts: 0, nextAttempt: 0, error: '', conflict: false },
    ],
  }));
}
export function startSync() {
  const run = () => {
    synchronize().catch(() => {});
  };
  const unsubscribe = NetInfo.addEventListener(info => {
    if (info.isConnected) {
      run();
    }
  });
  const app = AppState.addEventListener('change', value => {
    if (value === 'active') {
      run();
    }
  });
  // Reintentar también si la red sigue conectada pero el backend vuelve a estar disponible.
  const timer = setInterval(run, 15000);
  run();
  return () => {
    unsubscribe();
    app.remove();
    clearInterval(timer);
  };
}
