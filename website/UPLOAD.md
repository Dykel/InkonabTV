# Uploading the InkonabTV website to alwaysdata

Upload **everything in this folder** (except this file) into the folder that serves
https://inkonabtv.alwaysdata.net/ — on alwaysdata that's usually `www/` in your home
folder. Keep `inkonabtv.apk` where it is: the site's download buttons point to it.

    www/
      index.html        ← the site
      privacy.html
      version.json      ← also turns on the in-app update check
      inkonabtv.apk     ← already there, don't delete
      img/  fonts/

Easiest: alwaysdata admin → Remote access → FTP/SFTP, or the web file manager.
With the zip: upload `inkonabtv-website.zip` and unzip it inside `www/`.

When you release a new version, upload the new `inkonabtv.apk` and `version.json`
together (`npm run release:plus` writes both to release/plus/). The site reads the
version number from version.json by itself.
