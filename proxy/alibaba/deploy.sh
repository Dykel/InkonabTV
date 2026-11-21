#!/usr/bin/env bash
# Deploys or updates the relay on Alibaba Cloud Function Compute, from this Mac:
#   proxy/alibaba/deploy.sh
# Needs the Serverless Devs tool signed in once (`npx @serverless-devs/s config add`, you type
# your own AccessKey there). The relay's SECRET is made once and kept in ~/.inkonab-alibaba-secret.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
rm -rf "$HERE/code" && mkdir -p "$HERE/code"
cp "$HERE/../vps/server.mjs" "$HERE/../netlify/netlify/edge-functions/relay.js" "$HERE/code/"
echo '{"type":"module"}' > "$HERE/code/package.json"
F=~/.inkonab-alibaba-secret
[ -s "$F" ] || (umask 077; openssl rand -hex 24 > "$F")
cd "$HERE"
RELAY_SECRET="$(cat "$F")" npx -y @serverless-devs/s@3 deploy -y
