jest.mock('../src/field/native', () => ({
  field: {
    readStore: jest.fn().mockResolvedValue(null),
    writeStore: jest.fn().mockResolvedValue(undefined),
    readAttachment: jest.fn().mockResolvedValue('cGhvdG8='),
  },
}));
jest.mock('@react-native-community/netinfo', () =>
  require('@react-native-community/netinfo/jest/netinfo-mock.js'),
);

beforeEach(() => {
  jest.resetModules();
});

test('un fallo de escritura conserva el estado previo y no anuncia un guardado inexistente', async () => {
  const { field } = jest.requireMock(
    '../src/field/native',
  ) as typeof import('../src/field/native');
  const store =
    jest.requireActual<typeof import('../src/field/store')>(
      '../src/field/store',
    );
  await store.ready;
  jest.mocked(field.writeStore).mockRejectedValueOnce(new Error('Sin espacio'));
  await expect(
    store.saveDiagnostic('router', 'SNMP', 'resultado'),
  ).rejects.toThrow('Sin espacio');
  expect(store.snapshot().records).toHaveLength(0);
  expect(store.snapshot().outbox).toHaveLength(0);
});

test('sin conexión conserva la cola; al recuperar el servidor exige confirmación antes de quitarla', async () => {
  const store =
    jest.requireActual<typeof import('../src/field/store')>(
      '../src/field/store',
    );
  await store.ready;
  const { synchronize } =
    jest.requireActual<typeof import('../src/field/sync')>('../src/field/sync');
  await store.setEndpoint('http://127.0.0.1:8765');
  await store.saveDiagnostic('router', 'SNMP', 'resultado');
  const fetchMock = jest
    .spyOn(globalThis, 'fetch')
    .mockRejectedValueOnce(new Error('Servidor apagado'));
  try {
    await synchronize(true);
    expect(store.snapshot().outbox[0].attempts).toBe(1);
    expect(store.snapshot().records).toHaveLength(1);
    const id = store.snapshot().records[0].id;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id, accepted: true }),
    } as Response);
    await synchronize(true);
    expect(store.snapshot().outbox).toHaveLength(0);
    expect(store.snapshot().records).toHaveLength(1);
  } finally {
    fetchMock.mockRestore();
  }
});

test('un conflicto conserva el original y puede resolverse con un ID nuevo', async () => {
  const store =
    jest.requireActual<typeof import('../src/field/store')>(
      '../src/field/store',
    );
  await store.ready;
  const { synchronize, resolveAsCopy } =
    jest.requireActual<typeof import('../src/field/sync')>('../src/field/sync');
  await store.setEndpoint('http://127.0.0.1:8765');
  await store.saveDiagnostic('router', 'SSH', 'uptime');
  const original = store.snapshot().records[0];
  const fetchMock = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce({ status: 409 } as Response);
  try {
    await synchronize(true);
    expect(store.snapshot().outbox[0].conflict).toBe(true);
    await resolveAsCopy(original.id);
    expect(store.snapshot().records).toHaveLength(2);
    expect(store.snapshot().outbox).toHaveLength(1);
    expect(store.snapshot().outbox[0].id).not.toBe(original.id);
    expect(
      store.snapshot().records.find(row => row.id === original.id),
    ).toEqual({ ...original, resolvedAsCopy: true });
  } finally {
    fetchMock.mockRestore();
  }
});
