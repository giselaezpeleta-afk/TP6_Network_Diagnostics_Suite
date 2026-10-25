"""Diagnóstico independiente de una captura QR; no genera imágenes modificadas."""
import argparse
from PIL import Image
import zxingcpp

parser = argparse.ArgumentParser()
parser.add_argument('image')
parser.add_argument('--expected', required=True)
args = parser.parse_args()
with Image.open(args.image) as image:
    # Las fotos de monitores pueden tener muaré: probar filtrado bilineal
    # a distintas escalas sin cambiar el archivo original de la estudiante.
    decoded = False
    longest = max(image.size)
    for limit in dict.fromkeys(min(size, longest) for size in (1200, 1000, 800, longest)):
        size = tuple(max(1, int(side * limit / longest)) for side in image.size)
        sample = image.convert('RGB').resize(size, Image.Resampling.BILINEAR)
        results = zxingcpp.read_barcodes(sample, formats=zxingcpp.BarcodeFormat.QRCode)
        if any(result.text == args.expected for result in results):
            decoded = True
            print(f'Captura real decodificada: QR esperado, escala {limit}px.')
            break
    assert decoded, 'No se encontro el codigo esperado.'
