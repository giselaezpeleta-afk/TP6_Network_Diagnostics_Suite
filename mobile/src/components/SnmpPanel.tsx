import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { diagnose, Diagnostics } from '../snmp/client';
import { saveDiagnostic } from '../field/store';

function uptime(ticks: number) {
  const seconds = Math.floor(ticks / 100);
  return `${Math.floor(seconds / 86400)} d ${
    Math.floor(seconds / 3600) % 24
  } h ${Math.floor(seconds / 60) % 60} min ${seconds % 60} s`;
}

export default function SnmpPanel({ initialHost }: { initialHost?: string }) {
  // Valores del laboratorio ya comprobado; el técnico puede consultar otro equipo.
  const [host, setHost] = useState(initialHost || '192.168.101.3');
  const isLab = !initialHost || initialHost === '192.168.101.3';
  const [port, setPort] = useState(isLab ? '1161' : '161');
  const [community, setCommunity] = useState(isLab ? 'tp6-lab-readonly' : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Diagnostics | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  async function consult() {
    if (controller.current) {
      return;
    }
    const current = new AbortController();
    controller.current = current;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const response = await diagnose(
        { host: host.trim(), port: Number(port), community },
        current.signal,
      );
      if (!current.signal.aborted) {
        setResult(response);
        await saveDiagnostic(host.trim(), 'SNMP', response);
      }
    } catch (failure) {
      if (!current.signal.aborted) {
        setError(
          failure instanceof Error
            ? failure.message
            : 'No se pudo consultar el equipo.',
        );
      }
    } finally {
      if (!current.signal.aborted) {
        setBusy(false);
      }
      controller.current = null;
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Consulta SNMP</Text>
      <Text style={styles.description}>
        Consultá el nombre, tiempo de actividad y contadores de interfaces de un
        equipo.
      </Text>
      <Text style={styles.label}>IP del equipo</Text>
      <TextInput
        accessibilityLabel="IP del equipo"
        style={styles.input}
        value={host}
        onChangeText={setHost}
        editable={!busy}
        keyboardType="decimal-pad"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Text style={styles.label}>Puerto UDP</Text>
      <TextInput
        accessibilityLabel="Puerto UDP"
        style={styles.input}
        value={port}
        onChangeText={setPort}
        editable={!busy}
        keyboardType="number-pad"
      />
      <Text style={styles.label}>Community</Text>
      <TextInput
        accessibilityLabel="Community"
        style={styles.input}
        value={community}
        onChangeText={setCommunity}
        editable={!busy}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Consultar SNMP"
        accessibilityState={{ disabled: busy, busy }}
        disabled={busy}
        onPress={consult}
        style={styles.button}
      >
        {busy ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.buttonText}>Consultar SNMP</Text>
        )}
      </Pressable>
      {!!error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      {result && (
        <View accessibilityLiveRegion="polite" style={styles.results}>
          <Text style={styles.title}>{result.name}</Text>
          <Text style={styles.description}>
            Tiempo de actividad: {uptime(result.uptime)}
          </Text>
          {result.interfaces.map(item => (
            <View key={item.index} style={styles.interface}>
              <Text style={styles.label}>{item.description}</Text>
              <Text style={styles.description}>
                Entrada:{' '}
                {item.incoming === null
                  ? 'No disponible'
                  : `${item.incoming} bytes`}
              </Text>
              <Text style={styles.description}>
                Salida:{' '}
                {item.outgoing === null
                  ? 'No disponible'
                  : `${item.outgoing} bytes`}
              </Text>
            </View>
          ))}
          <Text style={styles.description}>
            Contadores acumulados de 32 bits; no representan velocidad
            instantánea.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    gap: 12,
  },
  title: { fontSize: 18, fontWeight: '600', color: '#18181B' },
  description: { fontSize: 14, lineHeight: 22, color: '#52525B' },
  label: { fontSize: 13, color: '#27272A', fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#D4D4D8',
    borderRadius: 8,
    paddingHorizontal: 12,
    minHeight: 46,
    color: '#18181B',
    fontSize: 15,
  },
  button: {
    minHeight: 48,
    backgroundColor: '#18181B',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },
  buttonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
  error: { color: '#B91C1C', fontSize: 14, lineHeight: 22 },
  results: { gap: 12, paddingTop: 8 },
  interface: {
    borderTopWidth: 1,
    borderTopColor: '#E4E4E7',
    paddingTop: 12,
    gap: 4,
  },
});
