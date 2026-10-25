import React, { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import SnmpPanel from './src/components/SnmpPanel';
import SshPanel from './src/components/SshPanel';
import {
  DiscoveryPanel,
  IdentificationPanel,
  InstallationPanel,
  HistoryPanel,
} from './src/components/FieldPanels';
import { startSync } from './src/field/sync';

type Section = 'Equipos' | 'Instalaciones' | 'Historial';

// Una definición común mantiene alineados el menú y el contenido de cada sección.
const sections: Record<
  Section,
  { subtitle: string; title: string; detail: string; tasks: string[] }
> = {
  Equipos: {
    subtitle: 'Conocé los equipos de tu red local.',
    title: 'Tus equipos, en un solo lugar',
    detail:
      'Aquí podrás consultar los dispositivos encontrados y acceder a sus diagnósticos.',
    tasks: [
      'Descubrimiento de la red local',
      'Consultas SNMP y diagnóstico SSH',
      'Identificación por QR o código de barras',
    ],
  },
  Instalaciones: {
    subtitle: 'Documentá cada visita de campo.',
    title: 'Cada instalación, documentada',
    detail:
      'Aquí podrás reunir las fotos, la ubicación y las notas de cada instalación.',
    tasks: [
      'Evidencia fotográfica y ubicación GPS',
      'Notas técnicas de la instalación',
      'Reporte de instalación en PDF',
    ],
  },
  Historial: {
    subtitle: 'Volvé a tus visitas y diagnósticos.',
    title: 'El registro de tu trabajo',
    detail:
      'Aquí podrás consultar diagnósticos e instalaciones por equipo o sitio.',
    tasks: [
      'Diagnósticos e instalaciones anteriores',
      'Consulta de registros sin conexión',
      'Pendientes de sincronización',
    ],
  },
};
const tabs = Object.keys(sections) as Section[];

function AppContent() {
  const [selected, setSelected] = useState<Section>('Equipos');
  const [protocol, setProtocol] = useState<'LAN' | 'SNMP' | 'SSH' | 'QR'>(
    'LAN',
  );
  const [target, setTarget] = useState<string | undefined>();
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  useEffect(() => startSync(), []);
  const selectTarget = (ip: string) => {
    setTarget(ip);
    setProtocol('SNMP');
    scroll.current?.scrollTo({ y: 0, animated: true });
  };
  const content = sections[selected];

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.brand}>
        <View style={styles.brandMark}>
          <Text style={styles.brandLetter}>N</Text>
        </View>
        <View>
          <Text style={styles.brandName}>Network Diagnostics</Text>
          <Text style={styles.brandCaption}>Herramientas de campo</Text>
        </View>
      </View>
      {/* Se desplaza el contenido; las pestañas quedan visibles abajo.
          No mostramos equipos ni resultados ficticios en esta etapa visual. */}
      <ScrollView
        ref={scroll}
        style={styles.content}
        contentContainerStyle={styles.contentInner}
      >
        <Text style={styles.eyebrow}>TU ESPACIO DE TRABAJO</Text>
        <Text accessibilityRole="header" style={styles.title}>
          {selected}
        </Text>
        <Text style={styles.subtitle}>{content.subtitle}</Text>
        {selected === 'Equipos' ? (
          <>
            <View accessibilityRole="tablist" style={styles.protocolBar}>
              {(['LAN', 'SNMP', 'SSH', 'QR'] as const).map(value => (
                <Pressable
                  key={value}
                  accessibilityRole="tab"
                  accessibilityLabel={value}
                  accessibilityState={{ selected: protocol === value }}
                  onPress={() => {
                    setProtocol(value);
                    scroll.current?.scrollTo({ y: 0, animated: true });
                  }}
                  style={[
                    styles.protocolTab,
                    protocol === value && styles.activeTab,
                  ]}
                >
                  <Text
                    style={[
                      styles.tabText,
                      protocol === value && styles.activeTabText,
                    ]}
                  >
                    {value}
                  </Text>
                </Pressable>
              ))}
            </View>
            {protocol === 'LAN' && <DiscoveryPanel select={selectTarget} />}
            {protocol === 'QR' && <IdentificationPanel select={selectTarget} />}
            {protocol === 'SNMP' && <SnmpPanel initialHost={target} />}
            {protocol === 'SSH' && <SshPanel initialHost={target} />}
          </>
        ) : null}
        {/* Mantener montado el formulario evita perder fotos/notas al consultar otra pestaña. */}
        <View style={selected !== 'Instalaciones' && styles.hidden}>
          <InstallationPanel />
        </View>
        {selected === 'Historial' && <HistoryPanel />}
        <Text style={styles.sectionLabel}>EN ESTA SECCIÓN</Text>
        <View style={styles.taskCard}>
          {content.tasks.map((task, index) => (
            <View
              key={task}
              style={[styles.taskRow, index > 0 && styles.rowBorder]}
            >
              <Text style={styles.taskNumber}>0{index + 1}</Text>
              <Text style={styles.taskText}>{task}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
      {/* TalkBack puede anunciar la pestaña activa gracias al rol y al estado.
          La selección también se distingue por contraste y una marca visual. */}
      <View accessibilityRole="tablist" style={styles.tabBar}>
        {tabs.map(tab => {
          const active = selected === tab;
          return (
            <Pressable
              key={tab}
              accessibilityRole="tab"
              accessibilityLabel={tab}
              accessibilityState={{ selected: active }}
              onPress={() => setSelected(tab)}
              style={({ pressed }) => [
                styles.tab,
                active && styles.activeTab,
                pressed && styles.pressedTab,
              ]}
            >
              <View
                style={[styles.tabIndicator, active && styles.activeIndicator]}
              />
              <Text style={[styles.tabText, active && styles.activeTabText]}>
                {tab}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

// Paleta neutra inspirada en shadcn/ui, con componentes nativos de React Native.
const styles = StyleSheet.create({
  hidden: { display: 'none' },
  protocolBar: {
    flexDirection: 'row',
    gap: 8,
    padding: 4,
    backgroundColor: '#F4F4F5',
    borderRadius: 10,
  },
  protocolTab: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shell: { flex: 1, backgroundColor: '#FAFAFA' },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#E4E4E7',
  },
  brandMark: {
    width: 38,
    height: 38,
    backgroundColor: '#18181B',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandLetter: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  brandName: { color: '#18181B', fontSize: 15, fontWeight: '600' },
  brandCaption: { color: '#71717A', fontSize: 12, marginTop: 3 },
  content: { flex: 1 },
  contentInner: {
    padding: 24,
    gap: 12,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
  },
  eyebrow: {
    color: '#71717A',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.6,
    marginTop: 8,
  },
  title: {
    color: '#18181B',
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  subtitle: {
    color: '#52525B',
    fontSize: 15,
    lineHeight: 23,
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E4E4E7',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  illustration: { flexDirection: 'row', gap: 8, paddingVertical: 20 },
  tile: {
    width: 24,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#F4F4F5',
    borderWidth: 1,
    borderColor: '#D4D4D8',
  },
  darkTile: {
    backgroundColor: '#27272A',
    borderColor: '#27272A',
    marginTop: -8,
  },
  cardTitle: {
    color: '#18181B',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  cardDescription: {
    color: '#52525B',
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
  },
  sectionLabel: {
    color: '#71717A',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 2,
  },
  taskCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    paddingHorizontal: 16,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 17,
  },
  rowBorder: { borderTopWidth: 1, borderTopColor: '#F4F4F5' },
  taskNumber: { color: '#71717A', fontSize: 11, fontWeight: '600' },
  taskText: { flex: 1, color: '#3F3F46', fontSize: 14, lineHeight: 20 },
  syncCard: {
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    gap: 8,
  },
  syncTitle: {
    color: '#27272A',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  tabBar: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#E4E4E7',
    backgroundColor: '#FFFFFF',
  },
  tab: {
    flex: 1,
    minHeight: 56,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  activeTab: { backgroundColor: '#18181B' },
  pressedTab: { opacity: 0.75 },
  tabIndicator: {
    height: 3,
    width: 18,
    borderRadius: 2,
    backgroundColor: '#D4D4D8',
  },
  activeIndicator: { backgroundColor: '#FFFFFF' },
  tabText: { fontSize: 12, fontWeight: '600', color: '#52525B' },
  activeTabText: { color: '#FFFFFF' },
});
