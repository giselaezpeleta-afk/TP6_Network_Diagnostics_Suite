"""Copia únicamente la última captura para diagnosticar un QR fallido en debug."""
import argparse
import re
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--device', required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
adb = root.parent / 'TP5-Network/.tools/android-sdk/platform-tools/adb.exe'
base = [str(adb), '-s', args.device, 'exec-out', 'run-as', 'com.networkdiagnosticssuite']
names = subprocess.run(base + ['ls', '-t', 'files/evidence'], check=True, capture_output=True, timeout=15).stdout.decode().splitlines()
name = names[0]
assert re.fullmatch(r'[0-9a-f-]+\.jpg', name)
raw = subprocess.run(base + ['cat', f'files/evidence/{name}'], check=True, capture_output=True, timeout=20).stdout
target = root / '.tools/android-preview/qr-debug.jpg'
target.write_bytes(raw)
print(target)
