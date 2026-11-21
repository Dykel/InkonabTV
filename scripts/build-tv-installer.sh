#!/usr/bin/env bash
# Builds the one-file Samsung TV installer for Windows (and a Mac copy for testing):
#   scripts/build-tv-installer.sh
# 1. builds and signs the TV app (npm run tizen -- --preview: developer TVs, with Smart Hub rows),
# 2. fetches Samsung's sdb for Windows from download.tizen.org (once) and takes the Mac sdb from
#    Tizen Studio,
# 3. lists the TVs the signing certificate covers (bin/duids.txt),
# 4. builds tv-installer/ with all of them embedded (Windows: no console window, opens a page).
# Output: release/InkonabTV-Samsung-TV-Installer.exe (+ release/InkonabTV-Samsung-TV-Installer-mac).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/tv-installer"
SDB_VERSION=4.2.36

cd "$ROOT"
npm run tizen -- --preview
VERSION=$(node -p "require('./package.json').version")

mkdir -p "$SRC/bin/windows" "$SRC/bin/darwin" release
cp build/tizen/InkonabTV.wgt "$SRC/bin/InkonabTV.wgt"

if [ ! -s "$SRC/bin/windows/sdb.exe" ]; then
  TMP="$(mktemp -d)"
  curl -fsSL -o "$TMP/sdb.zip" "https://download.tizen.org/sdk/tizenstudio/official/binary/sdb_${SDB_VERSION}_windows-64.zip"
  unzip -q -o -j "$TMP/sdb.zip" data/tools/sdb.exe -d "$SRC/bin/windows"
  rm -rf "$TMP"
fi
cp "${TIZEN_STUDIO:-$HOME/tizen-studio}/tools/sdb" "$SRC/bin/darwin/sdb"

# The TVs (DUIDs) the package can install on: those in the signing distributor certificate.
CERT="${TIZEN_DISTRIBUTOR_CRT:-$HOME/SamsungCertificate/InkonabTV/distributor.crt}"
openssl x509 -in "$CERT" -noout -ext subjectAltName 2>/dev/null \
  | grep -oE 'deviceid=[A-Z0-9]+' | cut -d= -f2 | sort -u > "$SRC/bin/duids.txt"
echo "Certificate covers $(wc -l < "$SRC/bin/duids.txt" | tr -d ' ') TV(s)"

cd "$SRC"
GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "-s -w -H windowsgui -X main.version=$VERSION" \
  -o "$ROOT/release/InkonabTV-Samsung-TV-Installer.exe" .
GOOS=darwin GOARCH=arm64 go build -trimpath -ldflags "-s -w -X main.version=$VERSION" \
  -o "$ROOT/release/InkonabTV-Samsung-TV-Installer-mac" .
ls -la "$ROOT/release/InkonabTV-Samsung-TV-Installer.exe" "$ROOT/release/InkonabTV-Samsung-TV-Installer-mac"
