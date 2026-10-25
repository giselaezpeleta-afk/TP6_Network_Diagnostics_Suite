"""Revisa persistencia y PDF reales sin imprimir notas, fotos ni coordenadas."""
import argparse
import io
import json
import re
import subprocess
from pathlib import Path
from pypdf import PdfReader

parser = argparse.ArgumentParser()
parser.add_argument('--device', required=True)
parser.add_argument('--installation', action='store_true')
parser.add_argument('--backend', action='store_true')
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
adb = root.parent / 'TP5-Network/.tools/android-sdk/platform-tools/adb.exe'
base = [str(adb), '-s', args.device, 'exec-out', 'run-as', 'com.networkdiagnosticssuite', 'cat']
store = json.loads(subprocess.run(base + ['files/field-store.json'], check=True, capture_output=True, timeout=20).stdout)
print(f"Persistencia: {len(store['records'])} registros; {len(store['outbox'])} pendientes; {len(store['cards'])} fichas.")
for item in store['outbox']:
    print(f"Cola: intentos={item['attempts']}; conflicto={item['conflict']}; error={item['error'] or 'ninguno'}")
if args.installation:
    record = next((record for record in store['records'] if record['kind'] == 'installation'), None)
    if record is None:
        raise RuntimeError('Todavia no hay una instalacion finalizada en el telefono.')
    assert record.get('location') and record.get('photos') and record.get('pdf')
    name = record['pdf'].rsplit('/', 1)[-1]
    assert name.endswith('.pdf') and '/' not in name and '\\' not in name and '..' not in name
    raw = subprocess.run(base + [f'files/reports/{name}'], check=True, capture_output=True, timeout=20).stdout
    pdf = PdfReader(io.BytesIO(raw))
    text = '\n'.join(page.extract_text() for page in pdf.pages)
    assert record['id'] in text and record['site'] in text and record['equipment'] in text
    assert str(record['location']['latitude']) in text and str(record['location']['longitude']) in text
    assert sum(len(page.images) for page in pdf.pages) >= len(record['photos'])
    out = root / '.tools/android-preview'
    out.mkdir(parents=True, exist_ok=True)
    (out / 'installation-real.pdf').write_bytes(raw)
    print(f"PDF real verificado: {len(pdf.pages)} paginas, fotos incorporadas y GPS coincidente con el registro.")
if args.backend:
    assert not store['outbox'], 'Todavia quedan registros pendientes.'
    for record in store['records']:
        identifier = record['id']
        assert re.fullmatch(r'[a-zA-Z0-9-]+', identifier)
        received = json.loads((root / '.tools/backend-data' / f'{identifier}.json').read_text(encoding='utf-8'))
        assert received['record'] == record
        for uri in [*(record.get('photos') or []), *([record['pdf']] if record.get('pdf') else [])]:
            name = uri.rsplit('/', 1)[-1]
            assert name == Path(name).name and '..' not in name
            folder = 'reports' if name.endswith('.pdf') else 'evidence'
            local = subprocess.run(base + [f'files/{folder}/{name}'], check=True, capture_output=True, timeout=20).stdout
            remote = (root / '.tools/backend-data' / identifier / name).read_bytes()
            assert local == remote, 'El adjunto recibido no coincide byte a byte.'
    print('Sincronizacion real verificada: registros y adjuntos identicos, cola vacia.')
