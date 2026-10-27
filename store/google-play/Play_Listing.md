# InkonabTV on Google Play

The Google Play version is the **player** build (`play` flavor, app ID `tv.inkonab.app`): no
built-in server, no built-in playlists and no VPN. The sideload build with the VPN is the
`full` flavor (`tv.inkonab.app.full`, "InkonabTV+") and is never uploaded to Play.

## Files

| What | File |
| --- | --- |
| App bundle to upload | `android/app/build/outputs/bundle/playRelease/app-play-release.aab` (`npm run aab`) |
| App icon 512 × 512 | `icon_512.png` |
| Feature graphic 1024 × 500 | `feature_graphic_1024x500.png` |
| Phone screenshots (1080 × 2160) | `phone/1-home.png` … `phone/4-signin.png` |
| Android TV banner 1280 × 720 | `tv_banner_1280x720.png` |
| Android TV screenshots 1920 × 1080 | `tv/*.png` |
| Privacy policy | https://dykel.github.io/InkonabTV/privacy.html |

Signing: the bundle is signed with the **upload key** in `android/keystore/inkonab-upload.jks`
(passwords in `android/keystore.properties`). Keep a backup of both somewhere safe outside the
project. In Play Console use **Play App Signing** (the default): Google keeps the real app
signing key, and a lost upload key can be reset through Play support.

## Store listing

- **App name:** InkonabTV
- **Short description (80 characters max):** A remote-friendly player for your own IPTV playlists (Xtream Codes and M3U).
- **Full description:** use the English text from `store/samsung/Store_Listing.md`, with
  "Samsung's native player" replaced by "Android's native player (ExoPlayer)". End it with the
  sentence: *InkonabTV is a media player only. It doesn't include, provide or sell any channels or
  content. You need a playlist from your own provider to watch anything.*
- **Category:** Video Players & Editors
- **Contact email:** your support email (the one used in Samsung Seller Office) · **Website:** https://dykel.github.io/InkonabTV/

## App content (Policy → App content)

- **Privacy policy:** https://dykel.github.io/InkonabTV/privacy.html
- **Ads:** No, the app has no ads.
- **App access:** "All or some functionality is restricted" → add instructions:
  *No account needed. On the sign-in screen choose "M3U playlist", enter
  https://dykel.github.io/InkonabTV/test/samsung-review.m3u and tap Sign in. The playlist holds
  only Blender open movies (CC BY) and public streaming test streams.*
- **Content rating:** fill the IARC questionnaire as a video player of user-provided content
  (no content included, no user interaction between people, no purchases). Adult categories from
  a playlist are hidden behind a parental PIN.
- **Target audience:** 18 and over (or 16+); not designed for children.
- **News app:** No. **Government app:** No. **Financial features:** None. **Health:** None.
- **Data safety:**
  - *Does your app collect or share user data?* Yes, only for the optional "Set up from
    phone": the playlist details the person types on the setup page (server, username,
    password or M3U link) pass through the pairing service to their TV and are deleted as soon
    as the TV receives them (15 minutes at most).
  - Data types: **Personal info → User IDs** (the playlist username) and **Personal info → Other
    info** (the playlist password or M3U link).
    Collected: yes · Shared: no · Processed ephemerally: no (kept up to 15 minutes) · Required:
    no (optional) · Purpose: App functionality · Encrypted in transit: yes · Deletion: deleted
    automatically.
  - Everything else (favorites, history, settings, saved playlist) stays on the device and is not
    collected. TMDB is asked for artwork by title number only.
- **Foreground service / VPN declarations:** none (the Play version has neither).

## Android TV

Play Console → **Advanced settings → Form factors → Android TV → Add**, then upload the TV banner
and TV screenshots and opt in to the TV review. The app already declares leanback, works without a
touchscreen and shows the TV banner on the home screen. Google reviews the TV experience
separately; the first TV review can take a few days longer than the phone one.

## New personal developer accounts: closed test first

A personal Play Console account created after November 2023 must run a **closed test with at
least 12 testers for 14 days in a row** before it can publish to Production:

1. Testing → Closed testing → Create track → upload the AAB → add testers by email (a Google Group
   or list of 12+ Gmail addresses: friends, family, customers).
2. Share the opt-in link; each tester must accept and install the app from Play, and keep it
   installed for the 14 days.
3. After 14 days: Dashboard → **Apply for production access** (answer the short questionnaire about
   the test), then create the Production release with the same AAB.

## Updates

Every upload needs a higher `versionCode` (in `android/app/build.gradle`, now 5 for 1.0.4) and the
same upload key. Run `npm run aab` and upload the new bundle.
