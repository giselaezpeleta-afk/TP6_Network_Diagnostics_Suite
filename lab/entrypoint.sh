#!/bin/sh
set -eu
# Las claves de host se crean dentro del contenedor, sin incluir secretos en la imagen.
ssh-keygen -A
test -s /run/tp6/authorized_keys
# Un montaje de Windows no conserva los permisos POSIX esperados por SSH.
# Copiamos únicamente la clave pública y aplicamos permisos dentro de Linux.
cp /run/tp6/authorized_keys /home/tecnico/.ssh/authorized_keys
chown -R tecnico:tecnico /home/tecnico/.ssh
chmod 700 /home/tecnico/.ssh
chmod 600 /home/tecnico/.ssh/authorized_keys
/usr/sbin/sshd -t
/usr/sbin/snmpd -f -Lo -C -c /etc/snmp/snmpd.conf &
exec /usr/sbin/sshd -D -e
