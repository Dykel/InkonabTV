; Installs OpenVPN's TAP-Windows driver (needed by the free VPN) during setup, silently.
!macro customInstall
  DetailPrint "Installing the network driver for the free VPN..."
  ExecWait '"$INSTDIR\resources\openvpn\tap-windows.exe" /S' $0
  DetailPrint "TAP-Windows driver setup finished ($0)"
!macroend
