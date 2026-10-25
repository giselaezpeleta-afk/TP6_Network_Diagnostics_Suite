#!/bin/sh
set -eu
# Lista cerrada: el cliente no obtiene una consola ni ejecuta texto arbitrario.
case "${SSH_ORIGINAL_COMMAND:-}" in
  uptime) exec /usr/bin/uptime ;;
  'ip -s link') exec /usr/sbin/ip -s link ;;
  *) printf '%s\n' 'Comando no permitido. Usar: uptime o ip -s link.' >&2; exit 1 ;;
esac
