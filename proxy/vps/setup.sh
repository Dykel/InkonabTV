#!/usr/bin/env bash
# Installs the InkonabTV relay on a fresh Ubuntu 24.04 server. Run as root on the server:
#   bash setup.sh
# It installs Node 22 and Caddy, puts the relay in /opt/inkonab-relay, creates a random SECRET
# (kept in /etc/inkonab-relay.env, readable by root only) and gets an HTTPS certificate for
# <server-ip-with-dashes>.sslip.io, a free name that points at the server's IP address.
# Running it again updates the relay and keeps the SECRET.
set -euo pipefail
cd "$(dirname "$0")"

IP=$(curl -4 -s https://api.ipify.org)
NAME="${RELAY_NAME:-${IP//./-}.sslip.io}"

export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q ca-certificates curl gnupg debian-keyring debian-archive-keyring apt-transport-https ufw ffmpeg

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -q nodejs
fi
if ! command -v caddy >/dev/null; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q && apt-get install -y -q caddy
fi

id inkonab >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin inkonab
install -d /opt/inkonab-relay
install -m 644 server.mjs smooth.mjs relay.js /opt/inkonab-relay/
echo '{"type":"module"}' > /opt/inkonab-relay/package.json

if [ ! -s /etc/inkonab-relay.env ]; then
  umask 077
  echo "SECRET=$(openssl rand -hex 24)" > /etc/inkonab-relay.env
fi

cat > /etc/systemd/system/inkonab-relay.service <<'EOF'
[Unit]
Description=InkonabTV HTTPS relay
After=network-online.target

[Service]
User=inkonab
EnvironmentFile=/etc/inkonab-relay.env
ExecStart=/usr/bin/node /opt/inkonab-relay/server.mjs
Restart=always
RestartSec=2
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
# Smooth live TV pieces (smooth.mjs), emptied at each start.
CacheDirectory=inkonab-smooth

[Install]
WantedBy=multi-user.target
EOF

sed -e "s/RELAY_NAME/$NAME/" -e "s/RELAY_IP/$IP/" Caddyfile > /etc/caddy/Caddyfile

ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

systemctl daemon-reload
systemctl enable --now inkonab-relay
systemctl restart inkonab-relay caddy

echo
echo "Relay URL: https://$NAME/relay"
