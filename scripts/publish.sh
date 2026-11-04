#!/bin/bash
# Publishes a release built with `npm run release:plus` and, in desktop/, `npm run release:windows`
# and `npm run release:mac`:
#   1. GitHub releases windows-v<version> (inkonabtv.exe) and mac-v<version> (inkonabtv.dmg),
#      skipped when they already exist;
#   2. the update site (alwaysdata www/): inkonabtv.apk, version.json, windows.json, mac.json and
#      the website's index.html, in one FTP upload (asks for the FTP password once).
#   bash scripts/publish.sh
set -e
cd "$(dirname "$0")/.."
V=$(node -p "require('./desktop/package.json').version")

for os in windows mac; do
  file=$([ $os = mac ] && echo inkonabtv.dmg || echo inkonabtv.exe)
  title=$([ $os = mac ] && echo "InkonabTV for Mac $V" || echo "InkonabTV for Windows $V")
  if gh release view "$os-v$V" >/dev/null 2>&1; then
    echo "GitHub release $os-v$V already exists"
  else
    echo "Creating GitHub release $os-v$V (uploading $file, a few minutes)…"
    gh release create "$os-v$V" "release/$os/$file" --title "$title" --notes-file "release/$os-notes.txt"
  fi
done

echo "Uploading to inkonabtv.alwaysdata.net — type your FTP password:"
curl --ssl-reqd --tls-max 1.2 --user inkonabtv \
  -T "{release/plus/inkonabtv.apk,release/plus/version.json,release/windows/windows.json,release/mac/mac.json,website/index.html}" \
  "ftp://ftp-inkonabtv.alwaysdata.net/www/"
echo "Published $V"
