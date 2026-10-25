import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { currentLocation, Discovery, field, Location } from '../field/native';
import {
  newId,
  RecordEntry,
  saveRecord,
  setEndpoint,
  TechnicalCard,
  update,
  useStore,
} from '../field/store';
import { request, resolveAsCopy, synchronize } from '../field/sync';

export function Button({
  title,
  onPress,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={[s.button, disabled && s.disabled]}
    >
      <Text style={s.buttonText}>{title}</Text>
    </Pressable>
  );
}
function Input({
  label,
  value,
  change,
  multiline = false,
}: {
  label: string;
  value: string;
  change: (value: string) => void;
  multiline?: boolean;
}) {
  return (
    <>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        style={[s.input, multiline && s.multiline]}
        value={value}
        onChangeText={change}
        multiline={multiline}
        autoCapitalize="none"
      />
    </>
  );
}
function useAction() {
  const working = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const run = async (action: () => Promise<void>) => {
    if (working.current) {
      return;
    }
    working.current = true;
    setBusy(true);
    setMessage('');
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      working.current = false;
      setBusy(false);
    }
  };
  return { busy, message, setMessage, run };
}
export function DiscoveryPanel({ select }: { select: (ip: string) => void }) {
  const [result, setResult] = useState<Discovery | null>(null);
  const action = useAction();
  return (
    <View style={s.card}>
      <Text style={s.title}>Explorar la red Wi-Fi</Text>
      <Text style={s.text}>
        Busca equipos con servicios TCP en 80, 443, 22 o 2222 dentro de tu
        subred (máximo 254 direcciones). Un equipo que no responda puede seguir
        conectado.
      </Text>
      <Button
        title="Buscar equipos"
        disabled={action.busy}
        onPress={() => {
          action.run(async () => {
            setResult(await field.discover());
          });
        }}
      />
      {action.busy && (
        <>
          <ActivityIndicator />
          <Text>Explorando la LAN… puede tardar unos 20 segundos.</Text>
        </>
      )}
      <Text accessibilityLiveRegion="polite" style={s.message}>
        {action.message}
      </Text>
      {result && (
        <>
          <Text style={s.text}>
            Red: {result.subnet} · Teléfono: {result.localIp}
          </Text>
          {result.devices.length === 0 && (
            <Text>
              No se encontraron servicios accesibles en los puertos consultados.
            </Text>
          )}
          {result.devices.map(device => (
            <View key={device.ip} style={s.row}>
              <Text style={s.title}>
                {device.ip}
                {device.gateway ? ' · Puerta de enlace' : ''}
              </Text>
              <Text>Nombre: {device.hostname || 'No disponible'}</Text>
              <Text>MAC: {device.mac || 'No disponible en Android'}</Text>
              <Text>Puertos: {device.ports.join(', ')}</Text>
              <Text>{device.source}</Text>
              <Button
                title={`Diagnosticar ${device.ip}`}
                onPress={() => select(device.ip)}
              />
            </View>
          ))}
        </>
      )}
    </View>
  );
}
export function IdentificationPanel({
  select,
}: {
  select: (ip: string) => void;
}) {
  const store = useStore();
  const [code, setCode] = useState('');
  const [card, setCard] = useState<TechnicalCard | null>(null);
  const [name, setName] = useState('');
  const [model, setModel] = useState('');
  const [ip, setIp] = useState('');
  const [notes, setNotes] = useState('');
  const action = useAction();
  async function lookup(value: string) {
    const id = value.trim();
    if (!id || id.length > 128 || !/^[\w.-]+$/.test(id)) {
      throw new Error(
        'El QR debe contener el identificador del equipo (hasta 128 letras, números, guiones o puntos).',
      );
    }
    setCode(id);
    let found = store.cards.find(item => item.id === id);
    try {
      const response = await request(`/equipment/${encodeURIComponent(id)}`);
      if (response.status === 404) {
        throw new Error(
          'El servidor no tiene una ficha para ese código. Podés completarla aquí.',
        );
      }
      if (!response.ok) {
        throw new Error(`Ficha: HTTP ${response.status}`);
      }
      found = (await response.json()) as TechnicalCard;
      if (
        found.id !== id ||
        typeof found.name !== 'string' ||
        typeof found.ip !== 'string'
      ) {
        throw new Error('Ficha remota inválida.');
      }
      const saved = found;
      await update(current => ({
        ...current,
        cards: [...current.cards.filter(item => item.id !== id), saved],
      }));
      action.setMessage(
        'Ficha remota descargada y guardada para usar sin conexión.',
      );
    } catch (error) {
      if (!found) {
        setCard({ id, name: '', model: '', ip: '', notes: '' });
        setName('');
        setModel('');
        setIp('');
        setNotes('');
        throw error;
      }
      action.setMessage(
        'Sin acceso al servidor: se muestra la ficha guardada en el teléfono.',
      );
    }
    setCard(found);
    setName(found.name);
    setModel(found.model);
    setIp(found.ip);
    setNotes(found.notes);
  }
  return (
    <View style={s.card}>
      <Text style={s.title}>Identificar equipo</Text>
      <Text style={s.text}>
        Fotografiá el QR o código de barras y confirmá la imagen. El lector
        funciona sin Internet. Para la primera consulta de una ficha remota
        necesitás el servidor configurado en Historial.
      </Text>
      <Button
        title="Fotografiar QR o código"
        disabled={action.busy}
        onPress={() => {
          action.run(async () => {
            const photo = await field.takePhoto();
            const value = await field.scanPhoto(photo);
            await lookup(value);
          });
        }}
      />
      <Button
        title="Reintentar última foto"
        disabled={action.busy || typeof field.retryLastCodePhoto !== 'function'}
        onPress={() => {
          action.run(async () => {
            await lookup(await field.retryLastCodePhoto());
          });
        }}
      />
      <Input label="Código del equipo" value={code} change={setCode} />
      <Button
        title="Consultar ficha"
        disabled={action.busy}
        onPress={() => {
          action.run(() => lookup(code));
        }}
      />
      <Text style={s.text}>Códigos iniciales: router-casa · tp6-lab</Text>
      <Text accessibilityLiveRegion="polite" style={s.message}>
        {action.message}
      </Text>
      {card && (
        <>
          <Text style={s.title}>Ficha: {card.id}</Text>
          <Input label="Nombre del equipo" value={name} change={setName} />
          <Input label="Modelo" value={model} change={setModel} />
          <Input label="IP de la ficha" value={ip} change={setIp} />
          <Input
            label="Datos técnicos"
            value={notes}
            change={setNotes}
            multiline
          />
          <Button
            title="Guardar ficha local"
            disabled={action.busy}
            onPress={() => {
              action.run(async () => {
                if (!name.trim()) {
                  throw new Error('Completá el nombre del equipo.');
                }
                const saved = { id: card.id, name, model, ip, notes };
                await update(current => ({
                  ...current,
                  cards: [
                    ...current.cards.filter(row => row.id !== card.id),
                    saved,
                  ],
                }));
                action.setMessage('Ficha guardada en este teléfono.');
              });
            }}
          />
          {ip !== '' && (
            <Button
              title="Diagnosticar equipo de la ficha"
              onPress={() => select(ip)}
            />
          )}
        </>
      )}
    </View>
  );
}
export function InstallationPanel() {
  const store = useStore();
  const [site, setSite] = useState('');
  const [equipment, setEquipment] = useState('');
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [location, setLocation] = useState<Location | undefined>();
  const [saved, setSaved] = useState<RecordEntry | null>(null);
  const action = useAction();
  async function save() {
    if (!site.trim() || !equipment.trim() || !notes.trim()) {
      throw new Error('Completá sitio, equipo y notas técnicas.');
    }
    if (!photos.length || !location) {
      throw new Error(
        'Agregá al menos una foto real y la ubicación de la instalación.',
      );
    }
    const entry: RecordEntry = {
      id: newId(),
      kind: 'installation',
      createdAt: new Date().toISOString(),
      site: site.trim(),
      equipment: equipment.trim(),
      notes: notes.trim(),
      photos,
      location,
    };
    entry.pdf = await field.generatePdf(JSON.stringify(entry));
    await saveRecord(entry);
    setSaved(entry);
    setSite('');
    setEquipment('');
    setNotes('');
    setPhotos([]);
    setLocation(undefined);
    action.setMessage(
      'Instalación y PDF guardados en el teléfono. El envío queda en la cola de Historial.',
    );
    synchronize().catch(() => {});
  }
  return (
    <View style={s.card}>
      <Text style={s.title}>Nueva instalación</Text>
      <Text style={s.text}>
        Registrá datos reales de la visita. El PDF y la instalación se guardan
        primero en el teléfono.
      </Text>
      <Input label="Sitio de instalación" value={site} change={setSite} />
      <Input label="Equipo o código" value={equipment} change={setEquipment} />
      {store.cards.map(card => (
        <Button
          key={card.id}
          title={`Usar ${card.name}`}
          onPress={() => setEquipment(card.id)}
        />
      ))}
      <Input
        label="Notas técnicas de la instalación"
        value={notes}
        change={setNotes}
        multiline
      />
      <Button
        title="Agregar foto de instalación"
        disabled={action.busy || photos.length >= 5}
        onPress={() => {
          action.run(async () => {
            const photo = await field.takePhoto();
            setPhotos(current => [...current, photo]);
          });
        }}
      />
      <Text style={s.text}>Hasta 5 fotos por instalación.</Text>
      {photos.map((uri, index) => (
        <View key={uri}>
          <Image
            source={{ uri }}
            style={s.photo}
            accessibilityLabel={`Foto de instalación ${index + 1}`}
          />
          <Button
            title={`Quitar foto ${index + 1}`}
            disabled={action.busy}
            onPress={() =>
              setPhotos(current => current.filter(photo => photo !== uri))
            }
          />
        </View>
      ))}
      <Button
        title="Obtener ubicación actual"
        disabled={action.busy}
        onPress={() => {
          action.run(async () => {
            setLocation(await currentLocation());
          });
        }}
      />
      {location && (
        <Text>
          GPS: {location.latitude}, {location.longitude}
          {'\n'}Precisión: {Math.round(location.accuracy)} m ·{' '}
          {new Date(location.timestamp).toLocaleString()}
        </Text>
      )}
      <Button
        title="Guardar instalación y generar PDF"
        disabled={action.busy || !store.loaded}
        onPress={() => {
          action.run(save);
        }}
      />
      {action.busy && <ActivityIndicator />}
      <Text accessibilityLiveRegion="polite" style={s.message}>
        {action.message || store.error}
      </Text>
      {saved?.pdf && (
        <Button
          title="Compartir último PDF"
          onPress={() => {
            action.run(() => field.sharePdf(saved.pdf!));
          }}
        />
      )}
    </View>
  );
}
export function HistoryPanel() {
  const store = useStore();
  const [filter, setFilter] = useState('');
  const [endpoint, changeEndpoint] = useState(store.endpoint);
  const action = useAction();
  const rows = store.records.filter(row =>
    `${row.equipment} ${row.site}`.toLowerCase().includes(filter.toLowerCase()),
  );
  return (
    <View style={s.card}>
      <Text style={s.title}>Historial sin conexión</Text>
      <Input
        label="Filtrar por equipo o sitio"
        value={filter}
        change={setFilter}
      />
      <Text style={s.title}>
        Sincronización · {store.outbox.length} pendientes
      </Text>
      <Input
        label="URL del servidor"
        value={endpoint}
        change={changeEndpoint}
      />
      <Text style={s.text}>
        Para el backend de prueba conectado por ADB: http://127.0.0.1:8765. Los
        datos se conservan aunque el servidor esté apagado.
      </Text>
      <Button
        title="Guardar servidor"
        disabled={action.busy}
        onPress={() => {
          action.run(async () => {
            await setEndpoint(endpoint.trim());
            action.setMessage('Servidor guardado.');
          });
        }}
      />
      <Button
        title="Sincronizar ahora"
        disabled={action.busy}
        onPress={() => {
          action.run(async () => {
            if (!store.endpoint) {
              throw new Error('Guardá la URL del servidor primero.');
            }
            await synchronize(true);
            action.setMessage(
              'Revisión de pendientes terminada. Consultá el estado de cada registro.',
            );
          });
        }}
      />
      <Text accessibilityLiveRegion="polite" style={s.message}>
        {action.message || store.error}
      </Text>
      {!rows.length && <Text>Todavía no hay registros para este filtro.</Text>}
      {rows.map(row => {
        const pending = store.outbox.find(item => item.id === row.id);
        return (
          <View key={row.id} style={s.row}>
            <Text style={s.title}>
              {row.kind === 'installation' ? 'Instalación' : 'Diagnóstico'} ·{' '}
              {row.equipment}
            </Text>
            <Text>
              {row.site || 'Sin sitio asociado'} ·{' '}
              {new Date(row.createdAt).toLocaleString()}
            </Text>
            <Text style={s.text}>{row.notes}</Text>
            <Text>
              {pending
                ? `Pendiente · ${pending.attempts} intentos`
                : row.resolvedAsCopy
                ? 'Conflicto resuelto mediante una copia'
                : 'Sincronizado'}
            </Text>
            {!!pending?.error && <Text style={s.message}>{pending.error}</Text>}
            {pending?.conflict && (
              <Button
                title="Resolver conservando una copia"
                disabled={action.busy}
                onPress={() => {
                  action.run(() => resolveAsCopy(row.id));
                }}
              />
            )}
            {row.location && (
              <Text>
                GPS: {row.location.latitude}, {row.location.longitude}
              </Text>
            )}
            {row.pdf && (
              <Button
                title={`Compartir PDF de ${row.site}`}
                onPress={() => {
                  action.run(() => field.sharePdf(row.pdf!));
                }}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}
const s = StyleSheet.create({
  card: {
    padding: 18,
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    backgroundColor: '#FFFFFF',
  },
  title: { fontSize: 17, fontWeight: '600', color: '#18181B' },
  text: { fontSize: 14, color: '#52525B', lineHeight: 21 },
  label: { fontSize: 13, fontWeight: '600', color: '#27272A' },
  input: {
    borderWidth: 1,
    borderColor: '#D4D4D8',
    borderRadius: 8,
    padding: 12,
    color: '#18181B',
    minHeight: 48,
  },
  multiline: { minHeight: 100, textAlignVertical: 'top' },
  button: {
    backgroundColor: '#18181B',
    borderRadius: 8,
    padding: 14,
    minHeight: 48,
    justifyContent: 'center',
  },
  buttonText: { color: '#FFFFFF', fontWeight: '600', textAlign: 'center' },
  disabled: { opacity: 0.45 },
  message: { color: '#7F1D1D', lineHeight: 21 },
  row: { borderTopWidth: 1, borderColor: '#E4E4E7', paddingTop: 16, gap: 10 },
  photo: { width: '100%', height: 200, resizeMode: 'contain' },
});
