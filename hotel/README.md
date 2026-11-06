# InkonabTV Hotel

A version of the Android app for hotel room TVs (`tv.inkonab.app.hotel`, "InkonabTV Hotel").

- One welcome screen: big channel tiles, the hotel's Wi-Fi (QR code, network, password), hotel
  information and website. No sign-in, films or series.
- Channels come from `playlist` (an M3U link) and are downloaded again at every start; the saved
  copy is used only when the internet is down. Edit the M3U on the server to change channels.
- Autoplay: after `autoplayDelay` seconds the last watched channel (or the first) starts. Any
  button cancels. 0 = start at once, -1 = never.
- Free VPN (same as InkonabTV+): a channel that won't play directly is tried through the VPN.
  Staff settings: ⚙ at the bottom right, or the remote's Menu button.
- Starts with the TV (switched on, or woken from standby) once "Display over other apps" is
  allowed: ⚙ → Start with the TV → Allow it. If the TV hides that setting, from a computer:
  `adb shell appops set tv.inkonab.app.hotel SYSTEM_ALERT_WINDOW allow`
- Back on the welcome screen: press twice to leave the app.

## Hotel details

`hotel/hotel.json` (not in git, it holds the Wi-Fi password; copy `hotel.example.json`):
name, playlist, website, wifi { ssid, security, password, qr }, info [{ en, fr, time, note }],
autoplayDelay. The screen itself is `hotel/web/`.

## Build

    npm run apk:hotel   # → android/app/build/outputs/apk/hotel/release/app-hotel-release.apk
