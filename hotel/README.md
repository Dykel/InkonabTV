# InkonabTV Hotel

A version of the Android app for hotel room TVs (`tv.inkonab.app.hotel`, "InkonabTV Hotel").

- One welcome screen: big channel tiles, the hotel's Wi-Fi (QR code, network, password), hotel
  information and website. No sign-in, films or series.
- Channels come from `playlist` (an M3U link) and are downloaded again at every start; the saved
  copy is used only when the internet is down. Edit the M3U on the server to change channels.
- Autoplay: the last watched channel (or the first) starts after a countdown; any button
  cancels. Settings → Autoplay (Off, at once, 5/10/30 s, saved per TV); the default is
  `autoplayDelay` in hotel.json (0 = at once, -1 = off).
- Free VPN (same as InkonabTV+): a channel that won't play directly is tried through the VPN.
  Staff settings: ⚙ at the bottom right, or the remote's Menu button.
- Settings (⚙ Settings at the bottom right, or the remote's Menu button) need the staff PIN:
  1234 at first, changed in Settings → Change PIN (saved on each TV; clearing the app's data
  resets it to 1234).
- Starts with the TV (switched on, or woken from standby), two ways in Settings:
  A. "Display over other apps" allowed for the app (Settings → Switch it on).
  B. The app as the TV's home screen (Settings → Use as home screen). TVs with Google's own
     launcher keep theirs, so B only works on TVs/boxes that let you pick a home app.
  If the TV has neither, from a computer on the same network (TV: Developer options → network
  debugging): `adb connect <TV IP>` then
  `adb shell appops set tv.inkonab.app.hotel SYSTEM_ALERT_WINDOW allow`
- Back on the welcome screen: press twice to leave the app.

## Hotel details

`hotel/hotel.json` (not in git, it holds the Wi-Fi password; copy `hotel.example.json`):
name, playlist, website, wifi { ssid, security, password, qr }, info [{ en, fr, time, note }],
autoplayDelay. The screen itself is `hotel/web/`.

## Build

    npm run apk:hotel   # → android/app/build/outputs/apk/hotel/release/app-hotel-release.apk
