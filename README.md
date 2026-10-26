# InkonabTV

A web player for InkonabTV (Xtream Codes) that runs entirely in the browser and is hosted for free on GitHub Pages.

- **Sign in** with your InkonabTV username and password (nothing is stored on any server; you can choose to stay signed in on that device only).
- **Home**: a large featured banner that follows the poster you're on, plus *Latest added*, *Continue Watching*, *Top rated* and *New episodes* rows.
- **Live TV**: categories (quality copies merged), a channel list, the TV guide (what's on now and next), ★ Favorites and Recently watched groups. While a channel plays: **OK** opens the channel list (groups ▸ channels), **▲/▼** change channel, **◀/▶** change quality, **number keys** jump to a channel number.
- **TV Guide**: a week-wide programme grid per group (days back as far as the catch-up archive), with a red now-line and programme details. OK on a live programme watches it; OK on a past programme marked ⟲ replays it (catch-up). The Live TV guide panel also lists recent replays.
- **Automatic recovery**: if a channel fails or doesn't start within 15 seconds, the player tries its other quality copies and the other stream format before showing an error.
- **My List**: add any movie or series (☆ My List on its page) or channel (☆ in the guide, or hold OK in the player's channel list); they appear on Home and as their own category.
- **Movies / Series**: every category with filtering and sorting, a details page (backdrop, cast, trailer from TMDB), seasons and episodes, resume where you stopped, and the next episode plays automatically.
- **MBC PLAY** live TV and radio, free and always available — on the sign-in screen, on Home and pinned first in Live TV (add more playlists in `freePlaylists` in `config.js`).
- **Search** across movies, series and channels.
- Works with a mouse, a touch screen, or a keyboard/TV remote (arrow keys, Enter, Back).

## Publish on GitHub Pages

1. Push this folder to `github.com/Dykel/InkonabTV`.
2. On GitHub, open **Settings → Pages**. Under *Build and deployment*, pick **Deploy from a branch**, then `main` / `/ (root)`, and save.
3. After about a minute the site is at **https://dykel.github.io/InkonabTV/**.

> GitHub Pages on a **private** repository needs a paid GitHub plan. If you're on the free plan, make the repository public. No passwords are in the code: viewers sign in with their own account.

## Video playback over HTTPS (important)

GitHub Pages always uses HTTPS. Logging in and browsing the catalog work over HTTPS. The actual video, though, is sent from a plain-HTTP address (`http://50.7.196.90/...`), **and browsers block plain-HTTP video inside an HTTPS page.** To fix this, run the small relay in `proxy/worker.js` on Cloudflare Workers (free plan):

1. Sign in at <https://dash.cloudflare.com> → **Workers & Pages** → **Create** → **Create Worker**. Name it e.g. `inkonab-relay` → **Deploy**.
2. Click **Edit code**, replace everything with the contents of `proxy/worker.js`, then click **Deploy**.
3. (Recommended) Open **Settings → Variables and Secrets**, add a secret named `SECRET` with a random value, and deploy again.
4. Copy the worker URL (e.g. `https://inkonab-relay.yourname.workers.dev`) and either
   - paste it into `relay:` in `config.js` (applies to everyone), or
   - paste it into **Settings → HTTPS relay URL** inside the app and press **Test**.

The relay only accepts your provider's host (`ALLOWED_HOSTS` in the worker), so strangers can't use it as an open proxy. Check that video streaming is allowed under Cloudflare's terms for your use.

**No relay?** If you open the player from a plain-HTTP address (for example `http://localhost` on your own computer), the browser plays video directly without a relay.

## Configuration — `config.js`

| Key | What it does |
| --- | --- |
| `server` | Xtream server, `https://inkonabtv.ottb.xyz:443` |
| `relay` | HTTPS relay URL (see above); leave empty to disable |
| `freePlaylists` | M3U playlists anyone can watch without signing in (MBC PLAY) |
| `tmdbKey` | TMDB v3 API key, used for artwork, summaries, cast and trailers |
| `logo`, `icon` | Brand images |

In-app **Settings** also offer: live format (HLS or MPEG-TS), the language for TMDB info, showing adult categories, M3U/EPG links to copy, and signing out.

## Android app (phones and Android TV / Google TV)

The `android/` folder wraps the same web app in a native Android app (Capacitor), so it looks and works exactly like the website. One APK installs on phones, tablets, Android TV and Google TV boxes, and it shows up on the TV home screen with the InkonabTV banner.

Differences from the website, all improvements:

- Video plays in Android's native player (ExoPlayer) with FFmpeg audio. That means MKV, HEVC/H265 and Dolby AC3/EAC3/DTS audio work, and **no relay is needed** (plain-HTTP streams are allowed in the app).
- **Free VPN (built in):** when a channel won't play even after trying its other copies and formats, the app connects an app-only VPN through free [VPN Gate](https://www.vpngate.net) servers and retries — no separate VPN app. Servers are tried best-first with automatic failover; if the VPN doesn't help (some services refuse VPN addresses), the app retries directly and switches it off again. Settings → Free VPN: *Automatic* (default), *Always on* or *Off*, and a preferred server country. Android asks once for permission to create the VPN. Free servers are run by volunteers — use them to unblock channels, not for privacy. See `THIRD_PARTY_NOTICES.md` (OpenVPN is GPL).
- The remote works everywhere: the D-pad moves around the app, **Back** closes dialogs or goes Home, and in live TV **▲/▼** (or CH+/CH−) change channel and **◀/▶** change quality.

Build it (needs Node, Java 21 and the Android SDK):

```bash
npm install
npm run apk
```

The APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. To install it on an Android TV, enable *Developer options → USB/Network debugging* on the TV, then run `adb connect <tv-ip>` and `adb install -r app-debug.apk`. Or copy the APK to a USB stick and open it with a file manager.

After changing the web app, run `npm run sync` (or `npm run apk`) so the Android app gets the new files.

## Run it on your computer

```bash
cd InkonabTV
python3 -m http.server 8080
```

Then open <http://localhost:8080>.

## Notes

- Movies saved as `.mkv` play in Chrome/Edge when they use common formats (H.264/H.265 with AAC). If a file won't play, use **Copy link for VLC** in the player.
- Your watch progress is stored only in this browser.
- The TMDB key is visible to anyone who opens the site. That's normal for TMDB read-only keys, and you can create a new one at any time at themoviedb.org.
