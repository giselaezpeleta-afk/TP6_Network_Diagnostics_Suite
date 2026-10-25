import { useSyncExternalStore } from 'react';
import { field, Location } from './native';

export type RecordEntry = {
  id: string;
  kind: 'installation' | 'diagnostic';
  createdAt: string;
  equipment: string;
  site: string;
  notes: string;
  location?: Location;
  photos?: string[];
  pdf?: string;
  resolvedAsCopy?: boolean;
};
export type TechnicalCard = {
  id: string;
  name: string;
  model: string;
  ip: string;
  notes: string;
};
export type Pending = {
  id: string;
  attempts: number;
  nextAttempt: number;
  error: string;
  conflict: boolean;
};
export type State = {
  version: 1;
  records: RecordEntry[];
  outbox: Pending[];
  cards: TechnicalCard[];
  endpoint: string;
  error: string;
  loaded: boolean;
};
let state: State = {
  version: 1,
  records: [],
  outbox: [],
  cards: [],
  endpoint: '',
  error: '',
  loaded: false,
};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());
export const snapshot = () => state;
export function useStore() {
  return useSyncExternalStore(listener => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, snapshot);
}
let tail: Promise<unknown> = Promise.resolve();
export const ready = Promise.resolve().then(async () => {
  try {
    const raw = await field.readStore();
    if (raw) {
      const saved = JSON.parse(raw);
      if (
        saved.version !== 1 ||
        !Array.isArray(saved.records) ||
        !Array.isArray(saved.outbox) ||
        !Array.isArray(saved.cards)
      ) {
        throw new Error(
          'Formato local desconocido. No se reemplazará el archivo.',
        );
      }
      state = { ...saved, error: '', loaded: true };
    } else {
      state = { ...state, loaded: true };
    }
  } catch (error) {
    state = { ...state, error: String(error), loaded: false };
  }
  emit();
});
// Serializar mutaciones evita perder un registro si la sincronización termina
// mientras se guarda otro. Publicamos el estado solo después de persistirlo.
export function update(change: (current: State) => State): Promise<void> {
  const task = tail.then(async () => {
    await ready;
    if (!state.loaded) {
      throw new Error(state.error || 'No se pudo abrir el almacenamiento.');
    }
    const next = change(state);
    await field.writeStore(JSON.stringify(next));
    state = next;
    emit();
  });
  tail = task.catch(() => {});
  return task;
}
export function newId() {
  return `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 14)}`;
}
export async function saveRecord(record: RecordEntry) {
  await update(current => ({
    ...current,
    records: [record, ...current.records],
    outbox: [
      ...current.outbox,
      {
        id: record.id,
        attempts: 0,
        nextAttempt: 0,
        error: '',
        conflict: false,
      },
    ],
  }));
}
export async function saveDiagnostic(
  equipment: string,
  protocol: string,
  details: unknown,
) {
  await saveRecord({
    id: newId(),
    kind: 'diagnostic',
    createdAt: new Date().toISOString(),
    equipment,
    site: '',
    notes: `${protocol}\n${
      typeof details === 'string' ? details : JSON.stringify(details, null, 2)
    }`,
  });
}
export function setEndpoint(endpoint: string) {
  if (endpoint && !/^https?:\/\/[^\s/?#]+(?::\d+)?$/.test(endpoint)) {
    return Promise.reject(
      new Error(
        'Ingresá la URL base sin ruta, por ejemplo http://127.0.0.1:8765.',
      ),
    );
  }
  return update(current => ({ ...current, endpoint }));
}
