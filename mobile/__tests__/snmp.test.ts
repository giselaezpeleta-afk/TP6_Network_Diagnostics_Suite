import { Buffer } from 'buffer';
import { decodeResponse, encodeGet } from '../src/snmp/ber';

// Respuesta real del Net-SNMP del laboratorio, capturada al consultar sysName.0.
const response = Buffer.from(
  '303702010104107470362d6c61622d726561646f6e6c79a2200201010201000201003015301306082b0601020101050004075450362d4c6162',
  'hex',
);
const community = 'tp6-lab-readonly';
const oid = '1.3.6.1.2.1.1.5.0';

test('decodifica el nombre devuelto por el agente real', () => {
  expect(decodeResponse(response, community, 1)).toEqual([
    { oid, value: 'TP6-Lab', tag: 4 },
  ]);
});
test('construye GetRequest con el OID y request-id correctos', () => {
  expect(encodeGet([oid], community, 1).toString('hex')).toBe(
    '303002010104107470362d6c61622d726561646f6e6c79a019020101020100020100300e300c06082b060102010105000500',
  );
});
test('rechaza respuestas truncadas, de otro pedido o de otra community', () => {
  expect(() => decodeResponse(response.slice(0, -1), community, 1)).toThrow(
    'BER truncado',
  );
  expect(() => decodeResponse(response, community, 2)).toThrow('Request-id');
  expect(() => decodeResponse(response, 'incorrecta', 1)).toThrow('inesperada');
});
test('rechaza BER indefinido y parámetros fuera del alcance', () => {
  expect(() => decodeResponse(Buffer.from([0x30, 0x80]), community, 1)).toThrow(
    'Longitud',
  );
  expect(() => encodeGet(['1.40.1'], community, 1)).toThrow('OID');
  expect(() => encodeGet([oid], '', 1)).toThrow('Parámetros');
});
