# InkonabTV for Windows

The web player in an Electron window. A desktop app may play the provider's plain-HTTP
video directly, so no relay or helper is needed.

Free VPN (vpn.js): VPN Gate servers through the official OpenVPN client, bundled in
`vendor/openvpn/win` (not in git): openvpn.exe, libcrypto-3-x64.dll, libssl-3-x64.dll,
libpkcs11-helper-1.dll, vcruntime140.dll, tapctl.exe from the OpenVPN 2.6.23 MSI
(build.openvpn.net, PGP-verified), and tap-windows-9.24.7-I601-Win10.exe as tap-windows.exe
(signed by OpenVPN Inc.). The installer runs the TAP driver setup silently
(build/installer.nsh). When a channel won't play, the player connects the VPN once (Windows
asks for administrator permission) and tries again. While on, it carries the computer's
traffic; it stops when the app closes.

    npm install
    npm start            # run it (VPN is Windows-only)
    npm run dist:win     # installer in ../release/windows

The installer is unsigned: Windows SmartScreen shows "More info → Run anyway".
OpenVPN is GPL-2.0 (vendor/openvpn/win/OpenVPN-LICENSE.txt); this app's source is public.
