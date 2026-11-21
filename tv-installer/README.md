# InkonabTV installer for Samsung TV (Windows)

`release/InkonabTV-Samsung-TV-Installer.exe` installs the InkonabTV app on a Samsung TV in
Developer mode. It's one file: Samsung's `sdb.exe` and the signed `InkonabTV.wgt` are built in,
so the PC needs nothing else (no Tizen Studio, no Java).

## Use it

1. **TV, one time:** open **Apps**, press **1 2 3 4 5** on the remote, turn **Developer mode** on
   and enter the PC's IP address (the installer shows it), then restart the TV (hold Power).
2. **PC:** run the `.exe`. If Windows says "Windows protected your PC", click **More info →
   Run anyway** (the program isn't code-signed).
3. Type the TV's IP address (TV: Settings → General → Network → Network Status → IP Settings).
   It's remembered for next time: just press Enter.

It connects, copies the app, installs it and opens it on the TV (about 20 seconds).

- The TV's Developer mode trusts **one** computer at a time: put the IP of the PC you install from.
- Only TVs listed in the Samsung distributor certificate used to sign the app accept it (today:
  the owner's TV). Another TV needs its DUID added to the certificate, or the Samsung beta test.

## Build

```bash
scripts/build-tv-installer.sh
```

Builds and signs the TV app (`npm run tizen -- --preview`), downloads `sdb.exe` from
download.tizen.org the first time (kept in `tv-installer/bin/`, not in git), and writes
`release/InkonabTV-Samsung-TV-Installer.exe` plus a Mac copy (`…-mac`) for testing from this Mac.

How it installs (same as Tizen Studio): `sdb connect <tv>:26101`, `sdb capability` for the TV's
SDK folder, `sdb push` the package there, `sdb shell 0 vd_appinstall InkonabTV1 <path>`, then
`sdb shell 0 was_execute InkonabTV1.InkonabTV`.
