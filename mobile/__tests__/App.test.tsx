/**
 * @format
 */

import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import App from '../App';
jest.setTimeout(60000);

// La prueba de pestañas no debe abrir sockets nativos.
jest.mock('../src/snmp/client', () => ({ diagnose: jest.fn() }));
jest.mock('@react-native-community/netinfo', () =>
  require('@react-native-community/netinfo/jest/netinfo-mock.js'),
);
jest.mock('../src/field/native', () => ({
  field: {
    readStore: jest.fn().mockResolvedValue(null),
    writeStore: jest.fn().mockResolvedValue(undefined),
    discover: jest
      .fn()
      .mockResolvedValue({
        subnet: '192.168.101.0/24',
        localIp: '192.168.101.4',
        devices: [
          {
            ip: '192.168.101.1',
            mac: null,
            hostname: null,
            ports: [80],
            gateway: true,
            source: 'TCP / ARP-like',
          },
        ],
      }),
  },
}));

// Jest no recibe los márgenes nativos del teléfono. Usamos el mock oficial
// para renderizar el contenido sin sustituir nuestra navegación.
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

test('las pestañas cambian de sección y anuncian cuál está seleccionada', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });
  const tab = (name: string) =>
    renderer.root.findByProps({
      accessibilityRole: 'tab',
      accessibilityLabel: name,
    });
  const heading = () =>
    renderer.root
      .findAllByType(Text)
      .find(node => node.props.accessibilityRole === 'header')!.props.children;

  expect(heading()).toBe('Equipos');
  // Ida y vuelta: verificamos navegación observable y el estado para TalkBack.
  for (const name of ['Instalaciones', 'Historial', 'Equipos']) {
    await act(() => {
      tab(name).props.onPress();
    });
    expect(heading()).toBe(name);
    for (const other of ['Equipos', 'Instalaciones', 'Historial']) {
      expect(tab(other).props.accessibilityState.selected).toBe(other === name);
    }
  }
  await act(() => {
    renderer.unmount();
  });
});

test('un equipo descubierto se lleva al diagnóstico sin copiar las credenciales del laboratorio', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await act(() => {
    renderer = ReactTestRenderer.create(<App />);
  });
  try {
    await act(async () => {
      renderer.root
        .findByProps({ accessibilityLabel: 'Buscar equipos' })
        .props.onPress();
      await Promise.resolve();
    });
    await act(() => {
      renderer.root
        .findByProps({ accessibilityLabel: 'Diagnosticar 192.168.101.1' })
        .props.onPress();
    });
    expect(
      renderer.root.findByProps({ accessibilityLabel: 'IP del equipo' }).props
        .value,
    ).toBe('192.168.101.1');
    expect(
      renderer.root.findByProps({ accessibilityLabel: 'Puerto UDP' }).props
        .value,
    ).toBe('161');
    expect(
      renderer.root.findByProps({ accessibilityLabel: 'Community' }).props
        .value,
    ).toBe('');
  } finally {
    await act(() => {
      renderer.unmount();
    });
  }
});
