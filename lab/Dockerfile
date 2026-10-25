FROM debian:bookworm-slim@sha256:7c7b2c966bc9ee8cedfeef67e0e279108992c77681fa595db4a9d65c06ccc587

# Net-SNMP atiende consultas reales; OpenSSH ejecuta diagnósticos del contenedor.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssh-server snmpd snmp iproute2 procps \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --shell /bin/sh tecnico \
    && passwd -d tecnico \
    && mkdir -p /run/sshd /home/tecnico/.ssh \
    && chmod 700 /home/tecnico/.ssh \
    && rm -f /etc/ssh/ssh_host_*

COPY sshd_config /etc/ssh/sshd_config
COPY snmpd.conf /etc/snmp/snmpd.conf
COPY diagnostics.sh /usr/local/bin/tp6-diagnostics
COPY entrypoint.sh /usr/local/bin/tp6-lab
RUN chmod 755 /usr/local/bin/tp6-diagnostics /usr/local/bin/tp6-lab

EXPOSE 22/tcp 161/udp
ENTRYPOINT ["/usr/local/bin/tp6-lab"]
