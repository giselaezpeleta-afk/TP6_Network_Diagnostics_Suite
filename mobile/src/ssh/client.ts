import { NativeModules } from 'react-native';
import { validateTarget } from '../snmp/client';

type Adapter = {
  hasKey(): Promise<boolean>;
  importKey(): Promise<boolean>;
  execute(
    host: string,
    port: number,
    username: string,
    fingerprint: string,
    command: string,
  ): Promise<string>;
};
function adapter(): Adapter {
  const module = NativeModules.SSHDiagnostics as Adapter | undefined;
  if (!module) {
    throw new Error('SSH no está disponible en este dispositivo.');
  }
  return module;
}
export async function hasKey() {
  return adapter().hasKey();
}
export async function importKey() {
  return adapter().importKey();
}
export async function execute(
  host: string,
  port: number,
  username: string,
  fingerprint: string,
  command: 'uptime' | 'ip -s link',
) {
  // La misma validación IPv4/puerto se aplica a ambos protocolos.
  validateTarget({ host, port, community: 'unused' });
  if (!username.trim() || !/^SHA256:[A-Za-z0-9+/]{43}$/.test(fingerprint)) {
    throw new Error('Ingresá usuario y huella SHA256 del servidor.');
  }
  return adapter().execute(host, port, username.trim(), fingerprint, command);
}
