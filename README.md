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
- **Instant start:** the playlists (movies, series, channels, categories) are saved on the device and shown immediately at launch; they refresh themselves in the background when older than 6 hours (Settings → *Refresh now* to force it). Works offline with the last saved copy.
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
3. **(Required)** Open **Settings → Variables and Secrets**, add a secret named `SECRET` with a random value of at least 16 characters (for example the output of `openssl rand -hex 24`), and deploy again. Without it the relay answers "Relay not set up" — otherwise anyone could use it as a free proxy.
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
- **Free VPN (built in):** when a channel won't play even after trying its other copies and formats, the app connects an app-only VPN through free [VPN Gate](https://www.vpngate.net) servers and retries — no separate VPN app. MBC PLAY always plays directly (it refuses VPN addresses): the VPN drops for it and comes back for provider channels. A channel that won't play tries VPN servers one country at a time (up to 6) with a message showing which; the server it plays through is remembered and used first next time (Settings → Free VPN shows it, *Forget server* resets it). A green/amber badge in the top bar and in the player shows the VPN status. Settings → Free VPN: *Automatic* (default), *Always on* or *Off*, and a preferred server country. Android asks once for permission to create the VPN. Free servers are run by volunteers — use them to unblock channels, not for privacy. See `THIRD_PARTY_NOTICES.md` (OpenVPN is GPL).
- The remote works everywhere: the D-pad moves around the app, **Back** closes dialogs or goes Home, and in live TV **▲/▼** (or CH+/CH−) change channel and **◀/▶** change quality.

**Two versions** are built from the same code:

| Version | App ID / name | What's inside | Where it goes |
| --- | --- | --- | --- |
| `play` | `tv.inkonab.app` · InkonabTV | Pure player like the Samsung app: sign in with your own Xtream account or M3U link (or from a phone), extra playlists, no built-in server, no VPN | Google Play (`store/google-play/Play_Listing.md`) |
| `full` | `tv.inkonab.app.full` · InkonabTV+ | Built-in InkonabTV server, MBC PLAY and the free VPN | Installed by hand (sideload) |

Both can be installed side by side. In the full version the VPN session follows the app: it ends
when you quit (Back on Home), swipe the app away, or leave it in the background for 30 seconds
(Home / Source); "Always on" reconnects when you come back.

Build them (needs Node, Java 21 and the Android SDK with API 36):

```bash
npm install
npm run apk
```

Debug APKs: `android/app/build/outputs/apk/full/debug/` and `…/apk/play/debug/`. Signed release
builds: `npm run apk:release` (both APKs) and `npm run aab` (the Google Play bundle,
`android/app/build/outputs/bundle/playRelease/app-play-release.aab`). Release signing reads
`android/keystore.properties` and `android/keystore/inkonab-upload.jks`, which are never
committed: keep a backup of both. To install an APK on an Android TV, enable *Developer options → USB/Network debugging* on the TV, then run `adb connect <tv-ip>` and `adb install -r app-debug.apk`. Or copy the APK to a USB stick and open it with a file manager.

After changing the web app, run `npm run sync` (or `npm run apk`) so the Android app gets the new files.

## Samsung TV app (Tizen)

The same app, packaged for Samsung Smart TVs (2018 and newer). It uses Samsung's own video
player (AVPlay), so HLS, MPEG-TS, MKV and Dolby audio play directly — no relay needed.

Remote: arrows / OK / **Back** as usual (Back on Home exits). While live TV plays: **◀** opens
the channel list, **OK** shows the top bar on ☆ (**◀ ▶** move along it: qualities, ☆, channel
list; **▼** or **Back** hides it), **CH+ / CH−** change channel, **▶** switches quality, number
keys jump to a channel. Colour keys: **Red** ★ favorite, **Green** channel list, **Yellow** TV Guide,
**Blue** search. On text fields press **OK** to open the keyboard.

Build: `npm run tizen` → `build/tizen/` (code converted for older TV engines, see
`scripts/build-tizen.mjs`). To install it on your TV once:

1. **TV:** open *Apps*, press **1 2 3 4 5** on the remote, switch **Developer mode** on, enter your
   Mac's IP address, then restart the TV (hold Power until it reboots).
2. **Mac:** connect to the TV: `~/tizen-studio/tools/sdb connect <TV-IP>`
3. **Certificate (one time):** open `~/tizen-studio/tools/certificate-manager/certificate-manager.app`,
   click **+**, choose **Samsung** → **TV**, name the profile **InkonabTV**, create an author
   certificate (any name and password), sign in with your Samsung account, and create the
   distributor certificate for the connected TV.
4. `npm run tizen` now also signs `build/tizen/InkonabTV.wgt`; install it with
   `~/tizen-studio/tools/ide/bin/tizen install -n InkonabTV.wgt -- build/tizen`.

The free VPN is Android-only (Samsung TVs don't let apps create VPNs).

**Store version (player mode).** The Samsung build is a pure player, so it can be published in
the Samsung store: there is no built-in server and no MBC PLAY. People add their own playlist
with an Xtream Codes account (server, username, password), an M3U link, or **Set up from phone**
(see below). The interface follows the TV's menu language (English, French, Spanish, German,
Italian, Portuguese). Other Samsung store requirements are also covered: the screensaver turns
off during playback, a message appears when the network drops, adult categories need a parental
PIN, and movies have on-screen play controls.
**Extra playlists:** Settings → *Extra playlists* adds M3U links of your own (for example
MBC PLAY), by hand or with *Add from phone* (the setup page's *Extra playlist* option). Each
one shows as a group on top of Live TV and as a row on Home, in every version of the app.
Store files are in `store/samsung/`: icons, 1920×1080 screenshots, `App_Description.md` for
Samsung's description template and `Store_Listing.md` with the store texts. The free test
playlist for Samsung's reviewers is `test/samsung-review.m3u`. It holds only Blender open movies
and public test streams.

## Remote setup (fill in a TV's playlist from your phone)

With remote setup switched on, the sign-in screen has a **Set up from phone** tab that shows a
code and a QR code. Open `https://dykel.github.io/InkonabTV/setup.html` (or scan the QR code),
enter the code and the playlist, and press **Send to TV**. The TV signs in by itself within a
few seconds. Each code works once and expires after 15 minutes. The details pass through a small
Cloudflare Worker (`proxy/pair/`) that deletes them as soon as the TV collects them.

Deploy the worker once (free Cloudflare plan):

```bash
cd proxy/pair
npx wrangler login
npx wrangler deploy
```

Copy the URL it prints (e.g. `https://inkonab-pair.yourname.workers.dev`) into `pairApi:` in
`config.js`, then rebuild the apps (`npm run tizen`, `npm run apk`) and push so the website's
setup page uses it too. While `pairApi` is empty, the tab is hidden.

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
