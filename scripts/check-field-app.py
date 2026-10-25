"""Verifica LAN, catálogo QR e historial reales; nunca fabrica evidencia de campo."""
import argparse
import re
import subprocess
import time
import xml.etree.ElementTree as ET
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--device', required=True)
parser.add_argument('--mode', choices=['discovery', 'catalog', 'history', 'qr-retry'], required=True)
parser.add_argument('--expected-code', choices=['tp6-lab', 'router-casa'], default='tp6-lab')
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
adb = root.parent / 'TP5-Network/.tools/android-sdk/platform-tools/adb.exe'
base = [str(adb), '-s', args.device]
out = root / '.tools/android-preview'
out.mkdir(parents=True, exist_ok=True)

def command(*parts):
    return subprocess.run(base + list(parts), check=True, capture_output=True, timeout=20)

def dump():
    command('shell', 'uiautomator', 'dump', '/sdcard/tp6-check.xml')
    command('pull', '/sdcard/tp6-check.xml', str(out / 'tp6-check.xml'))
    nodes = list(ET.parse(out / 'tp6-check.xml').iter('node'))
    if not any(node.get('package') == 'com.networkdiagnosticssuite' for node in nodes):
        raise RuntimeError('Desbloquear el telefono y abrir la app TP6 antes de continuar.')
    return nodes

def scroll(down):
    command('shell','input','swipe','540','1600' if down else '700','540','700' if down else '1600','250')
    time.sleep(0.4)

def find(label, down=False):
    for _ in range(7):
        node = next((node for node in dump() if node.get('content-desc') == label and node.get('enabled') == 'true'), None)
        if node is not None:
            coords = list(map(int, re.findall(r'\d+',node.get('bounds',''))))
            if len(coords) == 4 and coords[3] > coords[1]:
                command('shell','input','tap',str((coords[0]+coords[2])//2),str((coords[1]+coords[3])//2))
                time.sleep(0.5)
                return
        scroll(down)
    raise RuntimeError(f'No se encuentra el control {label}')

def type_value(label, value):
    find(label, True)
    command('shell','input','keyevent','KEYCODE_MOVE_END')
    command('shell','input','keyevent','--longpress','KEYCODE_DEL')
    command('shell','input','text',value)
    command('shell','input','keyevent','KEYCODE_BACK')

if args.mode == 'discovery':
    find('Equipos');find('LAN');find('Buscar equipos', True)
    time.sleep(24)
    texts = []
    for _ in range(4):
        texts.extend(node.get('text','') for node in dump());scroll(True)
    text = '\n'.join(texts)
    if '192.168.101.1' not in text or 'Puerta de enlace' not in text:
        raise RuntimeError('No se verifico el descubrimiento del router domestico. Revisar el resultado.')
    print('LAN: router real 192.168.101.1 encontrado por la app.')
elif args.mode == 'catalog':
    find('Historial')
    type_value('URL del servidor','http://127.0.0.1:8765')
    find('Guardar servidor',True)
    find('Equipos');find('QR')
    # Los acentos del label se comparan en XML; el valor enviado es ASCII.
    type_value('Código del equipo','tp6-lab');find('Consultar ficha',True);time.sleep(3)
    texts=[]
    for _ in range(3):
        texts.extend(node.get('text','') for node in dump());scroll(True)
    if 'Laboratorio TP6' not in '\n'.join(texts):
        raise RuntimeError('La ficha remota no aparece en pantalla.')
    print('QR/catalogo: ficha real del laboratorio consultada y disponible en pantalla.')
elif args.mode == 'qr-retry':
    find('Equipos');find('QR');find('Reintentar última foto',True)
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        nodes = dump()
        if any(node.get('content-desc') == 'Reintentar última foto' and node.get('enabled') == 'true' for node in nodes):
            break
        time.sleep(1)
    # La ficha puede aparecer después de la lectura: volver al inicio antes
    # de recorrer el resultado evita perder el código/mensaje fuera del viewport.
    find('QR')
    texts=[]
    for _ in range(5):
        texts.extend(node.get('text','') for node in dump());scroll(True)
    text = '\n'.join(texts)
    expected_name = 'Laboratorio TP6' if args.expected_code == 'tp6-lab' else 'Router de casa'
    if args.expected_code not in text or expected_name not in text:
        raise RuntimeError('La captura real no se decodifico y asocio a la ficha esperada.')
    print(f'QR real: misma foto capturada por la estudiante decodificada y asociada a {args.expected_code}.')
else:
    find('Historial')
    # Las pestañas conservan el desplazamiento: empezar arriba permite
    # encontrar el botón aunque la vista anterior estuviera al final.
    for _ in range(6):
        scroll(False)
    find('Sincronizar ahora',True);time.sleep(4)
    texts=[]
    for _ in range(5):
        texts.extend(node.get('text','') for node in dump());scroll(True)
    text = '\n'.join(texts)
    if 'Sincronizado' not in text or 'Instalación' not in text or 'Diagnóstico' not in text:
        raise RuntimeError('No se encontro un registro confirmado como sincronizado.')
    print('Historial: registro persistido y confirmado por el backend.')
image = command('exec-out','screencap','-p').stdout
(out / f'{args.mode}-real.png').write_bytes(image)
