# Third-party software in the Android app

The Android app's free VPN feature includes native libraries
(`android/app/src/main/jniLibs/*/libopenvpn.so`, `libovpnexec.so`) compiled with
`scripts/build-openvpn.sh` from these sources, unmodified:

| Component | License | Source (commit) |
| --- | --- | --- |
| OpenVPN 2 (OpenVPN for Android fork) | GPL-2.0 with OpenSSL exception | https://github.com/schwabe/openvpn (`c29ee42`), via https://github.com/schwabe/ics-openvpn (`f669267`) |
| OpenSSL | Apache-2.0 | https://github.com/schwabe/platform_external_openssl (`b280e0c`) |
| LZ4 | BSD-2-Clause | https://github.com/lz4/lz4 (`5ff8396`) |
| LZO (bundled in ics-openvpn) | GPL-2.0 | same ics-openvpn commit |

**GPL note:** because the APK contains GPL-licensed OpenVPN, anyone you give the APK to is entitled
to the corresponding source code — this repository plus the sources above. Personal use has no
obligations.

Free VPN servers are provided by the VPN Gate Academic Experiment Project (University of Tsukuba,
https://www.vpngate.net) and run by volunteers.
