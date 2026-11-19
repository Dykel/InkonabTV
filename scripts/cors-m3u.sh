#!/bin/bash
# Lets every InkonabTV app (website, Samsung TV, browsers) read the playlists on the update site
# (tv.m3u, hotel.m3u…): adds a CORS header for .m3u/.m3u8 files to www/.htaccess on alwaysdata.
# Keeps whatever the .htaccess already contains, and does nothing if the rule is there already.
#   bash scripts/cors-m3u.sh        (asks for the FTP password once)
set -e
HOST="ftp://ftp-inkonabtv.alwaysdata.net/www"
read -r -s -p "FTP password for inkonabtv: " PW; echo
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
NETRC="$TMP/netrc"; ( umask 077; printf 'machine ftp-inkonabtv.alwaysdata.net login inkonabtv password %s\n' "$PW" > "$NETRC" )
unset PW
# The current .htaccess (none yet is fine).
set +e
curl -s --ssl-reqd --tls-max 1.2 --netrc-file "$NETRC" -o "$TMP/htaccess" "$HOST/.htaccess"; rc=$?
set -e
if [ $rc -eq 0 ]; then
  echo "Current .htaccess: $(wc -l < "$TMP/htaccess" | tr -d ' ') lines (kept)"
elif [ $rc -eq 78 ]; then
  : > "$TMP/htaccess"; echo "No .htaccess yet: creating one"
else
  # Wrong password, no connection…: stop, so an existing .htaccess is never replaced.
  echo "Couldn't read the current .htaccess (curl error $rc: wrong password or no connection). Nothing changed."; exit 1
fi
if grep -q "InkonabTV playlists CORS" "$TMP/htaccess"; then echo "Already set, nothing to do"; exit 0; fi
cp "$TMP/htaccess" "$TMP/htaccess.before"
cat >> "$TMP/htaccess" <<'EOF'

# InkonabTV playlists CORS: the apps (website, Samsung TV) may read the .m3u playlists.
<IfModule mod_headers.c>
  <FilesMatch "\.(m3u|m3u8)$">
    Header set Access-Control-Allow-Origin "*"
  </FilesMatch>
</IfModule>
EOF
curl -s --ssl-reqd --tls-max 1.2 --netrc-file "$NETRC" -T "$TMP/htaccess" "$HOST/.htaccess"
echo "Uploaded. Checking…"
curl -s -o /dev/null -D - https://inkonabtv.alwaysdata.net/tv.m3u | grep -i "access-control-allow-origin" && echo "Done: playlists can now be read by every app." || echo "The header isn't there yet (it can take a minute)."
