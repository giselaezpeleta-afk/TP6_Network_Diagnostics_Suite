import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ssh from '../ssh/client';
import profile from '../ssh/labProfile.json';
import { saveDiagnostic } from '../field/store';

export default function SshPanel({ initialHost }: { initialHost?: string }) {
  const [host, setHost] = useState(initialHost || profile.host);
  const isLab = !initialHost || initialHost === profile.host;
  const [port, setPort] = useState(isLab ? profile.port : '22');
  const [username, setUsername] = useState(isLab ? profile.username : '');
  const [fingerprint, setFingerprint] = useState(isLab ? profile.fingerprint : '');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const active = useRef(true);
  const working = useRef(false);
  useEffect(() => {
    active.current = true;
    ssh
      .hasKey()
      .then(value => {
        if (active.current) {
          setReady(value);
        }
      })
      .catch(() => {});
    return () => {
      active.current = false;
    };
  }, []);

  async function run(command?: 'uptime' | 'ip -s link') {
    if (working.current) {
      return;
    }
    working.current = true;
    setBusy(true);
    setError('');
    setOutput('');
    try {
      if (!command) {
        const imported = await ssh.importKey();
        if (active.current && imported) {
          setReady(true);
        }
      } else {
        const text = await ssh.execute(
          host.trim(),
          Number(port),
          username,
          fingerprint.trim(),
          command,
        );
        if (active.current) {
          setOutput(text);
          await saveDiagnostic(host.trim(), `SSH · ${command}`, text);
        }
      }
    } catch (failure) {
      if (active.current) {
        setError(
          failure instanceof Error
            ? failure.message
            : 'No se pudo realizar el diagnóstico SSH.',
        );
      }
    } finally {
      working.current = false;
      if (active.current) {
        setBusy(false);
      }
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Diagnóstico SSH</Text>
      <Text style={styles.description}>
        Ejecutá comandos de diagnóstico con autenticación por clave y
        verificación del servidor.
      </Text>
      {[
        { label: 'IP del equipo SSH', value: host, update: setHost },
        { label: 'Puerto SSH', value: port, update: setPort },
        { label: 'Usuario SSH', value: username, update: setUsername },
        {
          label: 'Huella SHA256 del servidor',
          value: fingerprint,
          update: setFingerprint,
        },
      ].map(field => (
        <View key={field.label} style={styles.field}>
          <Text style={styles.label}>{field.label}</Text>
          <TextInput
            accessibilityLabel={field.label}
            style={styles.input}
            value={field.value}
            onChangeText={field.update}
            editable={!busy}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      ))}
      <Text style={styles.description}>
        {ready
          ? 'Clave guardada de forma protegida en este dispositivo.'
          : 'Importá tu archivo de clave privada SSH para autenticarte.'}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Importar clave SSH"
        disabled={busy}
        accessibilityState={{ disabled: busy }}
        onPress={() => run()}
        style={styles.secondary}
      >
        <Text style={styles.secondaryText}>Importar clave SSH</Text>
      </Pressable>
      <Text style={styles.description}>
        Verificá la huella por un canal confiable antes de consultar un equipo.
        La huella inicial corresponde al laboratorio comprobado.
      </Text>
      {(['uptime', 'ip -s link'] as const).map(command => (
        <Pressable
          key={command}
          accessibilityRole="button"
          accessibilityLabel={
            command === 'uptime'
              ? 'Consultar uptime por SSH'
              : 'Consultar interfaces por SSH'
          }
          disabled={busy || !ready}
          accessibilityState={{ disabled: busy || !ready }}
          onPress={() => run(command)}
          style={[styles.button, (busy || !ready) && styles.disabled]}
        >
          <Text style={styles.buttonText}>
            {command === 'uptime' ? 'Consultar uptime' : 'Consultar interfaces'}
          </Text>
        </Pressable>
      ))}
      {busy && <ActivityIndicator color="#18181B" />}
      {!!error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      {!!output && (
        <View style={styles.results} accessibilityLiveRegion="polite">
          <Text selectable style={styles.output}>
            {output}
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
  field: { gap: 8 },
  label: { fontSize: 13, color: '#27272A', fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#D4D4D8',
    borderRadius: 8,
    paddingHorizontal: 12,
    minHeight: 46,
    color: '#18181B',
    fontSize: 14,
  },
  button: {
    minHeight: 48,
    backgroundColor: '#18181B',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },
  disabled: { opacity: 0.5 },
  buttonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
  secondary: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#D4D4D8',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { color: '#18181B', fontWeight: '600' },
  error: { color: '#B91C1C', fontSize: 14, lineHeight: 22 },
  results: { borderTopWidth: 1, borderTopColor: '#E4E4E7', paddingTop: 12 },
  output: {
    color: '#27272A',
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 20,
  },
});
