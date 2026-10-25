"""Provisiona la clave local en la app debug, sin imprimirla ni incluirla en JS.

hasKey() del módulo Android cifra la copia temporal con Keystore y la elimina.
Solo usar con el APK debug instalado y el laboratorio propio del TP6.
"""
import argparse
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--device', required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
adb = root.parent / 'TP5-Network/.tools/android-sdk/platform-tools/adb.exe'
key = bytearray((root / '.tools/lab/id_ed25519').read_bytes())
try:
    subprocess.run(
        [str(adb), '-s', args.device, 'shell',
         "run-as com.networkdiagnosticssuite sh -c 'umask 077; mkdir -p files; cat > files/ssh-import'"],
        input=key, check=True, capture_output=True, timeout=10,
    )
    print('Clave provisionada para importar a Keystore al abrir SSH en la app.')
finally:
    key[:] = b'\x00' * len(key)
