"""Prueba los botones reales de la app del TP6 en el Samsung conectado.

Usa la jerarquía de accesibilidad para localizar controles, verifica resultados
en pantalla y guarda capturas solo de nuestra app. No imprime campos secretos.
"""
import argparse
import re
import subprocess
import time
import xml.etree.ElementTree as ET
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--device', required=True)
parser.add_argument('--mode', choices=['snmp', 'ssh-uptime', 'ssh-interfaces', 'ssh-untrusted'], required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
adb = root.parent / 'TP5-Network/.tools/android-sdk/platform-tools/adb.exe'
base = [str(adb), '-s', args.device]
out = root / '.tools/android-preview'
out.mkdir(parents=True, exist_ok=True)


def command(*parts):
    return subprocess.run(base + list(parts), check=True, capture_output=True, timeout=15)


def dump():
    command('shell', 'uiautomator', 'dump', '/sdcard/tp6-check.xml')
    command('pull', '/sdcard/tp6-check.xml', str(out / 'tp6-check.xml'))
    nodes = list(ET.parse(out / 'tp6-check.xml').iter('node'))
    if not any(n.get('package') == 'com.networkdiagnosticssuite' for n in nodes):
        raise RuntimeError('Desbloqueá el teléfono y dejá abierta la app del TP6.')
    return nodes


def scroll(down):
    # Coordenadas de la pantalla 1080x2340 del A55 comprobado en esta sesión.
    command('shell', 'input', 'swipe', '540', '1600' if down else '700',
            '540', '700' if down else '1600', '350')
    time.sleep(0.4)


def tap(label, down):
    for _ in range(6):
        node = next((n for n in dump() if n.get('content-desc') == label and n.get('clickable') == 'true'), None)
        if node is not None:
            x1, y1, x2, y2 = map(int, re.findall(r'\d+', node.get('bounds')))
            if y2 > y1 and x2 > x1 and node.get('enabled') == 'true':
                command('shell', 'input', 'tap', str((x1 + x2) // 2), str((y1 + y2) // 2))
                time.sleep(0.7)
                return
        scroll(down)
    raise RuntimeError(f'No se pudo pulsar {label}: revisar pantalla y estado de la credencial.')


tap('Equipos', False)
tap('SNMP' if args.mode == 'snmp' else 'SSH', False)
time.sleep(1)
label = {'snmp': 'Consultar SNMP', 'ssh-uptime': 'Consultar uptime por SSH', 'ssh-untrusted': 'Consultar uptime por SSH',
         'ssh-interfaces': 'Consultar interfaces por SSH'}[args.mode]
tap(label, True)
time.sleep(6)
observed = []
for _ in range(4):
    observed.extend(n.get('text', '') for n in dump() if n.get('password') != 'true')
    text = '\n'.join(observed)
    success = ('TP6-Lab' in text and 'Tiempo de actividad:' in text) if args.mode == 'snmp' else (
        'load average:' in text if args.mode == 'ssh-uptime' else (
            'huella del servidor SSH no coincide' in text if args.mode == 'ssh-untrusted'
            else 'eth0' in text and 'RX:' in text))
    if success:
        image = command('exec-out', 'screencap', '-p').stdout
        (out / f'{args.mode}-real.png').write_bytes(image)
        print(f'{args.mode}: resultado real verificado en la app.')
        break
    scroll(True)
else:
    print(text)
    raise RuntimeError('La app no mostró el resultado esperado.')
