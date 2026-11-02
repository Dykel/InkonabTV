// InkonabTV configuration — edit these values, commit, and GitHub Pages picks them up.
window.INKONAB_CONFIG = {
  appName: 'InkonabTV',
  logo: 'logo1.svg',
  icon: 'icon.svg',

  // Xtream Codes server (HTTPS so it works from GitHub Pages).
  server: 'https://inkonabtv.ottb.xyz:443',

  // HTTPS relay for video (optional). The website plays the provider's plain-HTTP video through
  // the InkonabTV Helper on the viewer's computer (helper/), so no server relay is set. A relay
  // (proxy/alwaysdata/index.php or proxy/worker.js) can still be set here or in Settings.
  relay: '',

  // Free playlists that are always available, signed in or not (TV and radio).
  freePlaylists: [
    { name: 'MBC PLAY', url: 'https://raw.githubusercontent.com/Dykel/MBCPLAY/refs/heads/main/mbc.m3u' },
  ],

  // Player mode: no built-in server or free playlists; people add their own Xtream account
  // (server, username, password) or M3U link. The Samsung TV build turns this on.
  playerMode: false,

  // Playlist languages: after sign-in, people choose the languages of a big multi-language playlist
  // (category names starting with "FR:", "UK:"…) and only those are downloaded. On in every build.
  langPicker: true,

  // Remote setup: the sign-in screen shows a code that someone enters on setupUrl to fill in
  // the account from a phone. pairApi is the pairing worker (proxy/pair-worker.js, see README);
  // leave it empty to hide remote setup.
  pairApi: 'https://inkonab-pair.inkonab.workers.dev',
  setupUrl: 'https://dykel.github.io/InkonabTV/setup.html',

  // InkonabTV+ (sideload Android app) updates itself from here: inkonabtv.apk + version.json.
  // Empty in the Google Play and Samsung builds, which update through their stores.
  updateUrl: 'https://inkonabtv.alwaysdata.net/',

  privacyUrl: 'https://dykel.github.io/InkonabTV/privacy.html',

  // TMDB v3 API key — used for backdrops, title logos, summaries, cast and trailers.
  tmdbKey: '6c337b22c291ab1d3ff5a86e17ef6f49',
};
