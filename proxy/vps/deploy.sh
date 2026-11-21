#!/usr/bin/env bash
# Installs or updates the relay on the rented server, from this Mac:
#   proxy/vps/deploy.sh <server-ip>
# Needs SSH access as root (the server was created with this Mac's SSH key).
set -euo pipefail
IP="${1:?usage: deploy.sh <server-ip>}"
HERE="$(cd "$(dirname "$0")" && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cp "$HERE/server.mjs" "$HERE/setup.sh" "$HERE/Caddyfile" "$HERE/../netlify/netlify/edge-functions/relay.js" "$TMP/"
SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)
ssh "${SSH_OPTS[@]}" "root@$IP" 'mkdir -p /root/inkonab-relay'
scp -q "${SSH_OPTS[@]}" "$TMP"/* "root@$IP:/root/inkonab-relay/"
ssh "${SSH_OPTS[@]}" "root@$IP" 'bash /root/inkonab-relay/setup.sh'
