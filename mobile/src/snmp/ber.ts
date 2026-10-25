import { Buffer } from 'buffer';

/* eslint-disable no-bitwise -- BER usa máscaras de bits para longitudes y OIDs. */

export type SnmpValue = string | number | null;
export type Binding = { oid: string; value: SnmpValue; tag: number };
type Element = { tag: number; body: Buffer };

function tlv(tag: number, body: Buffer): Buffer {
  const size = body.length;
  const length =
    size < 128
      ? [size]
      : size < 256
      ? [0x81, size]
      : [0x82, size >> 8, size & 255];
  if (size > 65535) {
    throw new Error('Paquete SNMP demasiado grande.');
  }
  return Buffer.concat([Buffer.from([tag, ...length]), body]);
}

function integer(value: number): Buffer {
  const bytes = Buffer.alloc(4);
  bytes.writeInt32BE(value, 0);
  let start = 0;
  while (start < 3 && bytes[start] === 0 && bytes[start + 1] < 128) {
    start++;
  }
  return tlv(2, bytes.slice(start));
}

function base128(value: number): number[] {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
    throw new Error('OID inválido.');
  }
  const bytes = [value % 128];
  while ((value = Math.floor(value / 128)) > 0) {
    bytes.unshift(value % 128 | 128);
  }
  return bytes;
}

function encodeOid(oid: string): Buffer {
  if (!/^\d+(\.\d+)+$/.test(oid)) {
    throw new Error('OID inválido.');
  }
  const arcs = oid.split('.').map(Number);
  if (arcs[0] > 2 || arcs[0] < 0 || (arcs[0] < 2 && arcs[1] > 39)) {
    throw new Error('OID inválido.');
  }
  return tlv(
    6,
    Buffer.from([
      ...base128(arcs[0] * 40 + arcs[1]),
      ...arcs.slice(2).flatMap(base128),
    ]),
  );
}

function decodeOid(body: Buffer): string {
  const arcs: number[] = [];
  let value = 0;
  let pending = false;
  for (const byte of body) {
    value = value * 128 + (byte & 127);
    if (value > 0xffffffff) {
      throw new Error('OID fuera de alcance.');
    }
    pending = !!(byte & 128);
    if (!pending) {
      arcs.push(value);
      value = 0;
    }
  }
  if (pending || !arcs.length) {
    throw new Error('OID truncado.');
  }
  const first = arcs.shift()!;
  const root = first < 40 ? 0 : first < 80 ? 1 : 2;
  return [root, first - root * 40, ...arcs].join('.');
}

// Lectura acotada: no se aceptan longitudes indefinidas ni datos fuera del datagrama.
function elements(data: Buffer): Element[] {
  const result: Element[] = [];
  let offset = 0;
  while (offset < data.length) {
    if (offset + 2 > data.length) {
      throw new Error('BER truncado.');
    }
    const tag = data[offset++];
    let length = data[offset++];
    if (length & 128) {
      const count = length & 127;
      if (!count || count > 4 || offset + count > data.length) {
        throw new Error('Longitud BER inválida.');
      }
      length = 0;
      for (let i = 0; i < count; i++) {
        length = length * 256 + data[offset++];
      }
    }
    if (offset + length > data.length) {
      throw new Error('BER truncado.');
    }
    result.push({ tag, body: data.slice(offset, offset + length) });
    offset += length;
  }
  return result;
}

function number(element: Element): number {
  const { body, tag } = element;
  if (!body.length || body.length > 5) {
    throw new Error('Entero SNMP fuera de alcance.');
  }
  let value = 0;
  for (const byte of body) {
    value = value * 256 + byte;
  }
  if (tag === 2 && body[0] & 128) {
    value -= 2 ** (body.length * 8);
  }
  if (!Number.isSafeInteger(value)) {
    throw new Error('Entero SNMP fuera de alcance.');
  }
  return value;
}

export function encodeGet(
  oids: string[],
  community: string,
  requestId: number,
  version: 0 | 1 = 1,
): Buffer {
  if (
    !oids.length ||
    oids.length > 64 ||
    !community ||
    Buffer.byteLength(community) > 255 ||
    requestId < 1 ||
    requestId > 0x7fffffff
  ) {
    throw new Error('Parámetros SNMP inválidos.');
  }
  const bindings = oids.map(oid =>
    tlv(0x30, Buffer.concat([encodeOid(oid), tlv(5, Buffer.alloc(0))])),
  );
  const pdu = tlv(
    0xa0,
    Buffer.concat([
      integer(requestId),
      integer(0),
      integer(0),
      tlv(0x30, Buffer.concat(bindings)),
    ]),
  );
  // 0 = SNMP v1, 1 = SNMP v2c. La community viaja sin cifrado por diseño del protocolo.
  return tlv(
    0x30,
    Buffer.concat([integer(version), tlv(4, Buffer.from(community)), pdu]),
  );
}

export function decodeResponse(
  data: Buffer,
  community: string,
  requestId: number,
  version: 0 | 1 = 1,
): Binding[] {
  const message = elements(data);
  if (message.length !== 1 || message[0].tag !== 0x30) {
    throw new Error('Mensaje SNMP inválido.');
  }
  const fields = elements(message[0].body);
  if (
    fields.length !== 3 ||
    fields[0].tag !== 2 ||
    number(fields[0]) !== version ||
    fields[1].tag !== 4 ||
    fields[1].body.toString() !== community ||
    fields[2].tag !== 0xa2
  ) {
    throw new Error('Respuesta SNMP inesperada.');
  }
  const pdu = elements(fields[2].body);
  if (
    pdu.length !== 4 ||
    pdu.slice(0, 3).some(e => e.tag !== 2) ||
    pdu[3].tag !== 0x30 ||
    number(pdu[0]) !== requestId
  ) {
    throw new Error('Request-id o PDU inválido.');
  }
  if (number(pdu[1]) !== 0) {
    throw new Error(
      `El agente SNMP informó error ${number(pdu[1])} en el OID ${number(
        pdu[2],
      )}.`,
    );
  }
  return elements(pdu[3].body).map(item => {
    if (item.tag !== 0x30) {
      throw new Error('Varbind inválido.');
    }
    const pair = elements(item.body);
    if (pair.length !== 2 || pair[0].tag !== 6) {
      throw new Error('Varbind inválido.');
    }
    const e = pair[1];
    let value: SnmpValue;
    if ([2, 0x41, 0x42, 0x43].includes(e.tag)) {
      value = number(e);
    } else if (e.tag === 4) {
      value = e.body.toString('utf8');
    } else if (e.tag === 6) {
      value = decodeOid(e.body);
    } else if ([5, 0x80, 0x81, 0x82].includes(e.tag) && !e.body.length) {
      value = null;
    } else {
      throw new Error(`Tipo SNMP no soportado: ${e.tag}.`);
    }
    return { oid: decodeOid(pair[0].body), value, tag: e.tag };
  });
}
