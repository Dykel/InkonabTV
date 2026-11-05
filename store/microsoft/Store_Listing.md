# InkonabTV — Microsoft Store listing

The Store version is the Windows app as a pure player, like the Google Play and Samsung
versions: no free VPN (a Store app can't install the network driver it needs), no built-in
server or free playlists, and no self-updates (the Store updates it). The full Windows app with
the VPN stays a direct download from the website.

## 1. Set up (once)

1. **Developer account:** sign up at https://storedeveloper.microsoft.com as an individual
   developer and complete Microsoft's identity check.
2. **Reserve the name:** Partner Center → Apps and games → **New product** → **MSIX or PWA app**
   → reserve **InkonabTV** (if it's taken, try "InkonabTV Player").
3. **Package identity:** in the new app, open **Product management → Product identity** and copy
   three values into GitHub (repository **Settings → Secrets and variables → Actions →
   Variables**), or send them to Claude to set:

   | Partner Center field | GitHub variable |
   | --- | --- |
   | Package/Identity/Name | `MS_IDENTITY_NAME` |
   | Package/Identity/Publisher (`CN=…`) | `MS_PUBLISHER` |
   | Package/Properties/PublisherDisplayName | `MS_PUBLISHER_NAME` |

4. **Build the package:** GitHub → Actions → **Microsoft Store package** → **Run workflow**.
   When it finishes, download **InkonabTV-store** from the run (a zip containing
   `InkonabTV-store-<version>.appx`). The package must be built with the three values above,
   or Partner Center refuses it.

## 2. Submission

| Partner Center section | What to enter |
| --- | --- |
| **Pricing and availability** | Free · all markets (or the same 178 countries as Google Play) · Public |
| **Properties** | Category **Entertainment** (subcategory none) · Privacy policy URL https://dykel.github.io/InkonabTV/privacy.html · Support https://github.com/Dykel/InkonabTV/issues · Product declarations: none needed |
| **Age ratings** | IARC questionnaire, category "Media player / streaming app". Answer as for Google Play: the app contains no content of its own; users play their own playlists; no chat, purchases or location sharing. Google Play gave Everyone / PEGI 3. |
| **Packages** | Upload the `.appx` from step 4. Device family: **Windows 10/11 Desktop** only. |
| **Store listings → English (United States)** | Text in §3, images in §4 |
| **Submission options → Notes for certification** | Text in §5 |
| **Restricted capability `runFullTrust`** | Reason in §5 |

## 3. Listing text (English)

**Product name:** InkonabTV

**Short description**

> A fast, keyboard- and remote-friendly player for your own IPTV playlists (Xtream Codes and M3U).

**Description**

> InkonabTV plays the IPTV playlist you already have from your provider, in a clean full-screen
> player for your PC.
>
> • Add your playlist with an Xtream Codes account or an M3U link.
> • Live TV with groups, favorites, recently watched channels, channel numbers and quick channel switching.
> • A full-week TV guide and catch-up replays, when your provider supplies them.
> • Movies and series with posters, summaries, cast and trailers. Resume where you stopped, and
>   the next episode starts right after the one you watch.
> • My List, search across everything, and a parental PIN for adult categories.
> • Plays HLS, MPEG-TS, MP4 and MKV, including films with Dolby sound.
> • Works with mouse, keyboard and media keys; F11 for full screen.
> • Available in English, French, Spanish, German, Italian and Portuguese.
>
> InkonabTV is a media player only. It doesn't include, provide or sell any channels or content.
> You need a playlist from your own provider to watch anything.

**What's new in this version:** Series flow from one episode to the next, with a "Next episode"
card in the last 30 seconds.

**Product features** (one per line in Partner Center)

- Xtream Codes and M3U playlists
- Live TV with favorites and channel numbers
- Full-week TV guide and catch-up
- Movies and series with resume and next episode
- Search and My List
- Parental PIN
- Six languages

**Search terms** (up to 7): IPTV player · M3U · Xtream Codes · live TV · EPG · TV guide · video player

**Copyright:** © 2026 InkonabTV

## 4. Images (this folder)

| Partner Center field | File |
| --- | --- |
| Screenshots (Desktop, 1920 × 1080) | `screenshots/1_sign_in.png` … `screenshots/6_series.png` |
| Store logo 1:1 box art (1080 × 1080) | `boxart_1080x1080.png` |
| Store logo 2:3 poster art (720 × 1080) | `poster_720x1080.png` |
| 1:1 app tile icon (300 × 300) | `tile_300x300.png` |

The tiles inside the package (Start menu, taskbar) are in `desktop/build/appx/`.

## 5. Notes for certification

> InkonabTV is a media player for the user's own IPTV playlist; it contains no channels or
> content. No login account is needed for testing: on the sign-in screen choose **M3U
> playlist**, enter the link below and click **Sign in**.
>
> https://dykel.github.io/InkonabTV/test/samsung-review.m3u
>
> The test playlist has only freely licensed open movies (Blender Foundation, CC BY) and public
> streaming test streams (Akamai, Unified Streaming, Mux, Apple): Live TV → "Test channels",
> Movies → "Open Movies", Series → "Open Movie Collection" (three episodes). It has no device
> limit, expiry or country restriction. The TV guide shows "No guide information" for these test
> channels because test streams have no programme data.

**Reason for `runFullTrust`:**

> InkonabTV is a desktop (Win32/Electron) app packaged as MSIX. Full trust runs its desktop
> executable and the bundled FFmpeg (LGPL), which converts Dolby audio tracks to AAC locally so
> films with Dolby sound play with sound. The app doesn't install drivers or services and makes
> no system changes.
