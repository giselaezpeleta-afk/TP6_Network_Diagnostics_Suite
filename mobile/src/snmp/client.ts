import { Buffer } from 'buffer';
import dgram from 'react-native-udp';
import { Binding, decodeResponse, encodeGet } from './ber';

export type Target = { host: string; port: number; community: string };
export function validateTarget(target: Target) {
  if (
    !/^\d{1,3}(\.\d{1,3}){3}$/.test(target.host) ||
    target.host.split('.').some(part => Number(part) > 255)
  ) {
    throw new Error('Ingresá una dirección IPv4 válida.');
  }
  if (
    !Number.isInteger(target.port) ||
    target.port < 1 ||
    target.port > 65535
  ) {
    throw new Error('El puerto debe estar entre 1 y 65535.');
  }
  if (!target.community || Buffer.byteLength(target.community) > 255) {
    throw new Error('Ingresá una community válida (máximo 255 bytes).');
  }
}

let sequence = 0;
export function get(
  target: Target,
  oids: string[],
  signal: AbortSignal,
): Promise<Binding[]> {
  validateTarget(target);
  // Un identificador distinto por pedido permite detectar respuestas ajenas.
  sequence = (sequence % 0x7ffffffe) + 1;
  const id = sequence;
  const packet = encodeGet(oids, target.community, id);
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket({ type: 'udp4' });
    let finished = false;
    const finish = (error?: Error, result?: Binding[]) => {
      if (finished) {
        return;
      }
      finished = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      socket.close();
      if (error) {
        reject(error);
      } else {
        resolve(result!);
      }
    };
    const cancel = () => finish(new Error('Consulta cancelada.'));
    const timer = setTimeout(
      () =>
        finish(
          new Error(
            'El equipo no respondió por SNMP. Revisá IP, puerto y community.',
          ),
        ),
      5000,
    );
    signal.addEventListener('abort', cancel);
    socket.on('error', (error: Error) => finish(error));
    socket.on(
      'message',
      (message: Buffer, remote: { address: string; port: number }) => {
        if (remote.address !== target.host || remote.port !== target.port) {
          return;
        }
        try {
          const bindings = decodeResponse(message, target.community, id);
          if (
            bindings.length !== oids.length ||
            bindings.some((b, i) => b.oid !== oids[i])
          ) {
            throw new Error(
              'La respuesta no corresponde a los OIDs consultados.',
            );
          }
          finish(undefined, bindings);
        } catch (error) {
          finish(
            error instanceof Error
              ? error
              : new Error('Respuesta SNMP inválida.'),
          );
        }
      },
    );
    socket.once('listening', () =>
      socket.send(packet, 0, packet.length, target.port, target.host, error => {
        if (error) {
          finish(error);
        }
      }),
    );
    if (signal.aborted) {
      cancel();
    } else {
      socket.bind(0);
    }
  });
}

export type Diagnostics = {
  name: string;
  uptime: number;
  interfaces: {
    index: number;
    description: string;
    incoming: number | null;
    outgoing: number | null;
  }[];
};
export async function diagnose(
  target: Target,
  signal: AbortSignal,
): Promise<Diagnostics> {
  const system = await get(
    target,
    ['1.3.6.1.2.1.1.5.0', '1.3.6.1.2.1.1.3.0', '1.3.6.1.2.1.2.1.0'],
    signal,
  );
  if (
    typeof system[0].value !== 'string' ||
    typeof system[1].value !== 'number' ||
    typeof system[2].value !== 'number'
  ) {
    throw new Error('El agente no devolvió los datos básicos requeridos.');
  }
  const count = system[2].value;
  // GetRequest no permite recorrer índices dispersos sin conocerlos. Esta
  // primera versión consulta índices 1..ifNumber, con un límite explícito.
  if (!Number.isInteger(count) || count < 0 || count > 16) {
    throw new Error('Esta versión admite hasta 16 interfaces.');
  }
  const interfaces: Diagnostics['interfaces'] = [];
  for (let index = 1; index <= count; index++) {
    const prefix = '1.3.6.1.2.1.2.2.1';
    const values = await get(
      target,
      [
        `${prefix}.2.${index}`,
        `${prefix}.10.${index}`,
        `${prefix}.16.${index}`,
      ],
      signal,
    );
    if (values[0].value === null) {
      continue;
    }
    interfaces.push({
      index,
      description: String(values[0].value),
      incoming: typeof values[1].value === 'number' ? values[1].value : null,
      outgoing: typeof values[2].value === 'number' ? values[2].value : null,
    });
  }
  return { name: system[0].value, uptime: system[1].value, interfaces };
}
