"""Comprueba TCP/SSH y una consulta SNMP real desde el Android vía ADB.

Esta verificación del laboratorio no reemplaza los clientes de la app móvil.
No lee ni envía claves privadas al teléfono.
"""
import argparse
import ipaddress
import subprocess
from pathlib import Path


def tlv(tag, value):
    # Esta consulta mínima usa únicamente longitudes BER menores que 128.
    if len(value) >= 128:
        raise ValueError("Longitud fuera del alcance de esta prueba")
    return bytes([tag, len(value)]) + value


def read_tlv(data, offset=0):
    tag, length = data[offset:offset + 2]
    start = offset + 2
    if length & 128:
        count = length & 127
        if not count or count > 4:
            raise ValueError("Longitud BER inválida")
        length = int.from_bytes(data[start:start + count], "big")
        start += count
    end = start + length
    if end > len(data):
        raise ValueError("Respuesta BER truncada")
    return tag, data[start:end], end


def children(data):
    result, offset = [], 0
    while offset < len(data):
        tag, value, offset = read_tlv(data, offset)
        result.append((tag, value))
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--device", required=True)
    parser.add_argument("--host", required=True)
    args = parser.parse_args()
    host = str(ipaddress.IPv4Address(args.host))
    root = Path(__file__).resolve().parent.parent
    adb = root.parent / "TP5-Network/.tools/android-sdk/platform-tools/adb.exe"
    base = [str(adb), "-s", args.device, "exec-out", "sh", "-c"]

    # Solo se lee el saludo SSH. La autenticación se verifica aparte desde la PC.
    result = subprocess.run(
        base + [f"toybox nc -w 3 -W 3 -q 3 {host} 2222"],
        input=b"", capture_output=True, timeout=10,
    )
    if not result.stdout.startswith(b"SSH-2.0-"):
        raise RuntimeError("El Android no recibió el saludo SSH del laboratorio")
    print("Android -> SSH: saludo del servidor recibido")

    # sysName.0: OID 1.3.6.1.2.1.1.5.0, GetRequest SNMP v2c, request-id 1.
    oid = bytes.fromhex("2b06010201010500")
    integer_zero = tlv(2, b"\x00")
    varbind = tlv(0x30, tlv(6, oid) + tlv(5, b""))
    pdu = tlv(0xA0, tlv(2, b"\x01") + integer_zero * 2 + tlv(0x30, varbind))
    packet = tlv(0x30, tlv(2, b"\x01") + tlv(4, b"tp6-lab-readonly") + pdu)
    request_file = root / ".tools/lab/snmp-get.bin"
    request_file.write_bytes(packet)
    subprocess.run(
        [str(adb), "-s", args.device, "push", str(request_file),
         "/data/local/tmp/tp6-snmp-get.bin"],
        check=True, capture_output=True,
    )
    # Mantenemos stdin abierto: cerrar inmediatamente el pipe de ADB puede
    # terminar netcat antes de recibir el datagrama de respuesta.
    command = ("(cat /data/local/tmp/tp6-snmp-get.bin; sleep 3) | "
               f"toybox nc -u -w 3 -W 3 -q 1 {host} 1161")
    result = subprocess.run(
        base + [command], capture_output=True, timeout=10,
    )
    if not result.stdout:
        raise RuntimeError("El Android no recibió respuesta SNMP por UDP")
    tag, message, end = read_tlv(result.stdout)
    if tag != 0x30 or end != len(result.stdout):
        raise ValueError("Mensaje SNMP inválido")
    fields = children(message)
    if fields[0] != (2, b"\x01") or fields[1] != (4, b"tp6-lab-readonly") or fields[2][0] != 0xA2:
        raise ValueError("No es la respuesta SNMP v2c esperada")
    response = children(fields[2][1])
    if response[:3] != [(2, b"\x01"), (2, b"\x00"), (2, b"\x00")]:
        raise ValueError("Request-id incorrecto o error del agente SNMP")
    bindings = children(response[3][1])
    binding = children(bindings[0][1])
    if binding != [(6, oid), (4, b"TP6-Lab")]:
        raise ValueError("OID o nombre de laboratorio inesperado")
    print("Android -> SNMP UDP: sysName.0 = TP6-Lab (respuesta validada)")


if __name__ == "__main__":
    main()
