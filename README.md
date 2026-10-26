# InkonabTV

A web player for InkonabTV (Xtream Codes) that runs entirely in the browser and is hosted for free on GitHub Pages.

- **Sign in** with your InkonabTV username and password (nothing is stored on any server; you can choose to stay signed in on that device only).
- **Home**: a large featured banner that follows the poster you're on, plus *Latest added*, *Continue Watching*, *Top rated* and *New episodes* rows.
- **Live TV**: categories, a channel list, the TV guide (what's on now and next), and channel up/down in the player.
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
