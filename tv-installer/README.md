# InkonabTV installer for Samsung TV (Windows)

`release/InkonabTV-Samsung-TV-Installer.exe` installs the InkonabTV app on a Samsung TV in
Developer mode. It's one file: Samsung's `sdb.exe` and the signed `InkonabTV.wgt` are built in,
so the PC needs nothing else (no Tizen Studio, no Java).

Double-click it: a page opens in the browser with the steps, this PC's IP address (for the TV's
Developer mode), a box for the TV's IP, an **Install** button with live progress, and a help link
to Dykel Away on Facebook. It closes by itself a minute after the page is closed. If Windows says
"Windows protected your PC", click **More info → Run anyway** (the program isn't code-signed).

What the page tells the tester:

1. TV and PC on the same network.
2. TV's IP: Settings → General (or Connection) → Network → Network Status → IP Settings.
3. TV: Apps → press 1 2 3 4 5 → Developer mode On → Host PC IP = the PC's address (shown) →
   OK → restart the TV (hold Power).
4. Type the TV's IP, press Install (about 30 s; the app opens on the TV). The IP is remembered.

## Adding a tester's TV (certificate)

Samsung only lets a test build install on TVs whose ID (**DUID**) is written in the distributor
certificate it's signed with, and only Samsung's certificate server can issue that certificate,
after signing in with the developer's Samsung account. So adding a TV can't happen inside the
installer, but everything around it is automatic:

- The installer reads the TV's DUID before installing. A TV that isn't in the certificate gets a
  clear message with its DUID and a **Copy** button: "send this TV ID to Dykel Away on Facebook".
- To add it (on this Mac, a few minutes):
  1. Open `~/tizen-studio/tools/certificate-manager/certificate-manager.app`.
  2. Profile **InkonabTV** → the distributor certificate → create it again (Samsung type, TV,
     Public privilege), keep the same author certificate, and in **Device IDs** add the new DUID
     next to the existing ones (`tv-installer/bin/duids.txt` lists the current ones). Sign in with
     the Samsung account when asked. Save it to `~/SamsungCertificate/InkonabTV/` (replacing
     `distributor.p12` / `distributor.crt`).
  3. Rebuild: `scripts/build-tv-installer.sh`. It prints "Certificate covers N TV(s)"; send the new
     `.exe` to the tester.
- For many testers, Samsung's own beta test (Seller Office → beta test, activation codes) avoids
  the certificate entirely: the app comes from the Samsung store.

## Build

```bash
scripts/build-tv-installer.sh
```

Builds and signs the TV app (`npm run tizen -- --preview`), downloads `sdb.exe` from
download.tizen.org the first time (kept in `tv-installer/bin/`, not in git), reads the TV list
from the distributor certificate, and writes `release/InkonabTV-Samsung-TV-Installer.exe` plus a
Mac copy (`…-mac`) for testing from this Mac (set `INKONAB_NO_BROWSER=1` to not open a browser).

How it installs (same as Tizen Studio): `sdb connect <tv>:26101`, `sdb shell 0 getduid`,
`sdb capability` for the TV's SDK folder, `sdb push` the package there,
`sdb shell 0 vd_appinstall InkonabTV1 <path>`, then `sdb shell 0 was_execute InkonabTV1.InkonabTV`.
The help link (`helpURL` in `main.go`) points to the Inkonab TV Facebook page.
