# InkonabTV — Application description (for Samsung TV app certification)

Seller: Joseph Jonathan COLLET · Support: https://github.com/Dykel/InkonabTV/issues

## 1. Application information

| Item | Value |
| --- | --- |
| App name | InkonabTV |
| Tizen application ID | InkonabTV1.InkonabTV |
| Version | 1.0.1 |
| Type | Tizen web application (TV) |
| Category | Video |
| Supported resolution | 1920 × 1080 (FHD); the layout is scaled by the TV on UHD models |
| Supported TVs | 2018 models and later (Tizen 4.0+) |
| UI languages | English, French, Spanish, German, Italian, Portuguese. The language follows the TV menu language (Settings → General → System Manager → Language); any other language shows English |
| Input | Samsung remote (D-pad, OK, Return, Exit, number keys, Play / Pause / Stop / FF / REW, CH+ / CH−, colour keys). Mouse/pointer also works |
| Network | Required (wired or Wi-Fi) |
| Advertising | None |
| In-app purchases | None |
| Accounts | None of our own. The user adds a playlist from their own provider |

## 2. Overview

InkonabTV is a media player for IPTV playlists. **It does not provide, host or sell any channels or content.** Users add a playlist they already have from their own provider, in one of three ways:

- **Xtream Codes:** server address, username and password.
- **M3U playlist:** a link to an M3U/M3U8 playlist file.
- **Set up from phone:** the TV shows a 6-character code and a QR code. On a phone or computer, the user opens `dykel.github.io/InkonabTV/setup.html`, enters the code, and types the playlist details there. The TV then signs in by itself. The code works once and expires after 15 minutes.

The app then shows Live TV, a TV guide (when the provider supplies programme information), Movies and Series. Artwork, summaries and cast come from TMDB. Playback uses Samsung's native player (AVPlay): HLS, MPEG-TS, MP4, MKV, MOV and AVI.

## 3. Test information for the QA team

**No login account is needed.** Use this free test playlist, which contains only freely licensed open movies (Blender Foundation, CC BY) and public streaming test streams (Akamai, Unified Streaming, Mux, Apple):

```
https://dykel.github.io/InkonabTV/test/samsung-review.m3u
```

1. Launch the app. The sign-in screen opens on **Xtream Codes**.
2. Press ▶ to select **M3U playlist**, press OK, then move ▼ to the **Playlist link (M3U)** field.
3. Press OK to open the on-screen keyboard, type the link above, and press Done.
4. Move to **Sign in** and press OK.

The playlist has no device limit, no expiry, and no country or IP restriction, so whitelisting Samsung's test IP addresses isn't needed.

Contents of the test playlist:

| Section | Items |
| --- | --- |
| Live TV → "Test channels" | Test Live (Akamai), Test Live Clock (Unified Streaming), Test Pattern (Apple) |
| Movies → "Open Movies" | Big Buck Bunny (HLS), Tears of Steel (HLS, several audio tracks), Sintel (MKV 1080p), Elephants Dream (AVI) |
| Series → "Open Movie Collection" | Season 1: three episodes (HLS, HLS, MOV) |

The TV guide shows "No guide information" for these test channels, because test streams have no programme data. With an Xtream Codes account whose provider supplies EPG data, the guide shows the full week and catch-up.

## 4. Menu structure

```
Sign in
├── Xtream Codes (Server address · Username · Password · Keep me signed in · Sign in)
├── M3U playlist (Playlist link · Keep me signed in · Sign in)
└── Set up from phone (code + QR code, refreshed every 15 minutes)

Main screen (top bar: Home · Live TV · TV Guide · Movies · Series · Search · Settings · Account)
├── Home: featured banner, Continue Watching, Latest added, My List, Top rated, New episodes, Most watched
├── Live TV: groups (Favorites, Recently watched, playlist groups) → channels → now/next guide
│   └── Player (live): channel list, channel up/down, number keys, favorite
├── TV Guide: week grid per group; OK on a live programme plays it, OK on a past programme marked ⟲ replays it (catch-up, Xtream only)
├── Movies: categories, sort (Default / Recently added / A–Z / Top rated) → details (Play / Resume / From start, Trailer, My List, Versions, Cast)
│   └── Player (VOD): on-screen controls (⏪ 30 s · Play/Pause · ⏩ 30 s · Stop) and progress bar
├── Series: categories, sort → details → seasons → episodes (resume, next episode plays automatically)
├── Search: movies, series and channels
└── Settings
    ├── Account (playlist link, or server / username / status / expiry / connections)
    ├── Playback (live format, info language, catch-up correction)
    ├── Parental control (Show adult categories, protected by a 4-digit PIN; Change PIN)
    ├── Playlist on this device (last updated, Refresh now)
    ├── Playlist links, privacy policy
    └── Clear Continue Watching · Sign out
```

## 5. Remote control keys

| Key | Action |
| --- | --- |
| ◀ ▲ ▼ ▶ | Move the focus (one item is focused at a time, shown with a white outline) |
| OK | Select. On a text field, opens the on-screen keyboard |
| Return | Back to the previous page or closes the open dialog or player. On the main (Home) page it exits to Smart Hub |
| Exit | Closes the app and returns to TV (handled by the TV) |
| 0–9 | Live player: jump to that channel number. PIN dialog: enter digits |
| CH+ / CH− | Live player: next / previous channel |
| ▶ (live player) | Next quality copy of the channel, when the playlist has several |
| ◀ / OK (live player) | Opens the channel list |
| OK (movie / episode player) | Shows the on-screen controls and focuses Play/Pause |
| ◀ ▶ (movie / episode player) | Seek 10 s back / forward; when the controls have focus, move between buttons |
| Play, Pause, Play/Pause | Play / pause |
| FF / REW | Skip 30 s forward / back (movies and episodes) |
| Stop | Stops playback and closes the player |
| Red | ★ Favorite (live player) |
| Green | Channel list (live player) or Live TV |
| Yellow | TV Guide |
| Blue | Search |
| Volume, Mute | Handled by the TV (the app doesn't change them) |

Keys the app doesn't use do nothing.

## 6. Behaviour notes for testing

- **Screensaver:** turned off while a video plays and back on when it is paused, stopped or ends.
- **Network:** if the network drops, a message "No network connection" appears at the top. Return and Exit still work. When the network comes back, the message closes, "Connection restored" is shown, and a failed video retries.
- **Loading:** a loading indicator shows while pages, playlists and videos load.
- **Errors:** a wrong account shows "Wrong username or password"; an unreachable server or playlist link says so and asks to check the link and connection. A stream that can't be played shows "Can't play this" with a Try again button.
- **Parental control:** adult categories (and titles the provider marks as adult) are hidden by default. Turning on "Show adult categories" asks the user to create a 4-digit PIN the first time and asks for the PIN after that. They are hidden again every time the app starts.
- **Multitasking:** when the user leaves with Home/Source, playback is suspended and resumes when the app returns.
- **Saved playlist:** the playlist is saved on the TV and refreshed every 6 hours in the background, or with Settings → Refresh now.
- **Sign out** (Settings) deletes the saved playlist and account from the TV.

## 7. Content and privacy

- The app contains no channels or content and no links to any provider. All content comes from the playlist the user adds.
- Privacy policy: https://dykel.github.io/InkonabTV/privacy.html
- No ads, no analytics, no tracking. Playlist details are stored only on the TV. The remote setup service keeps them only until the TV receives them (15 minutes at most).
- Third-party services: the user's own playlist provider; TMDB (artwork and descriptions); the remote setup relay (only when "Set up from phone" is used).
