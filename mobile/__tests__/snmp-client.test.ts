import { Buffer } from 'buffer';
import { EventEmitter } from 'events';
import dgram from 'react-native-udp';
import { get } from '../src/snmp/client';

jest.mock('react-native-udp', () => ({
  __esModule: true,
  default: { createSocket: jest.fn() },
}));

const target = {
  host: '192.168.101.3',
  port: 1161,
  community: 'tp6-lab-readonly',
};
function fakeSocket() {
  const socket = Object.assign(new EventEmitter(), {
    bind: jest.fn(),
    close: jest.fn(),
    send: jest.fn(),
  });
  socket.bind.mockImplementation(() => socket.emit('listening'));
  jest
    .mocked(dgram.createSocket)
    .mockReturnValue(
      socket as unknown as ReturnType<typeof dgram.createSocket>,
    );
  return socket;
}

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

test('el timeout rechaza la consulta y cierra el socket', async () => {
  jest.useFakeTimers();
  const socket = fakeSocket();
  const promise = get(
    target,
    ['1.3.6.1.2.1.1.5.0'],
    new AbortController().signal,
  );
  const settled = promise.catch(error => error as Error);
  jest.advanceTimersByTime(5000);
  expect(((await settled) as Error).message).toContain('no respondió');
  expect(socket.close).toHaveBeenCalledTimes(1);
  expect(socket.send).toHaveBeenCalledTimes(1);
});

test('cancelar una consulta libera el socket y el temporizador', async () => {
  jest.useFakeTimers();
  const socket = fakeSocket();
  const controller = new AbortController();
  const promise = get(target, ['1.3.6.1.2.1.1.5.0'], controller.signal);
  const settled = promise.catch(error => error as Error);
  controller.abort();
  expect(((await settled) as Error).message).toContain('cancelada');
  expect(socket.close).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

test('un datagrama de otro equipo se ignora, sin resolver una consulta falsa', async () => {
  const socket = fakeSocket();
  const controller = new AbortController();
  const promise = get(target, ['1.3.6.1.2.1.1.5.0'], controller.signal);
  const settled = promise.catch(error => error as Error);
  socket.emit('message', Buffer.from([0]), {
    address: '192.168.101.1',
    port: 1161,
  });
  expect(socket.close).not.toHaveBeenCalled();
  controller.abort();
  expect(((await settled) as Error).message).toContain('cancelada');
});
