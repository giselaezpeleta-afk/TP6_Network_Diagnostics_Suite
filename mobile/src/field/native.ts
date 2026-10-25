import { NativeModules, PermissionsAndroid } from 'react-native';

export type Location = {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
};
export type Device = {
  ip: string;
  mac: string | null;
  hostname: string | null;
  ports: number[];
  gateway: boolean;
  source: string;
};
export type Discovery = { subnet: string; localIp: string; devices: Device[] };
type Tools = {
  readStore(): Promise<string | null>;
  writeStore(value: string): Promise<void>;
  takePhoto(): Promise<string>;
  scanPhoto(uri: string): Promise<string>;
  retryLastCodePhoto(): Promise<string>;
  locate(): Promise<Location>;
  discover(): Promise<Discovery>;
  generatePdf(json: string): Promise<string>;
  sharePdf(uri: string): Promise<void>;
  readAttachment(uri: string): Promise<string>;
};
export const field: Tools = NativeModules.FieldTools;
export async function currentLocation() {
  const result = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  ]);
  if (
    result['android.permission.ACCESS_COARSE_LOCATION'] !== 'granted' &&
    result['android.permission.ACCESS_FINE_LOCATION'] !== 'granted'
  ) {
    throw new Error(
      'Se necesita permiso de ubicación para georreferenciar la instalación.',
    );
  }
  return field.locate();
}
