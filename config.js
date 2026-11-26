// InkonabTV configuration — edit these values, commit, and GitHub Pages picks them up.
window.INKONAB_CONFIG = {
  appName: 'InkonabTV',
  logo: 'logo1.svg',
  icon: 'icon.svg',

  // Xtream Codes server (HTTPS so it works from GitHub Pages).
  server: 'https://inkonabtv.ottb.xyz:443',

  // HTTPS relay: none built in. A viewer sets one in Settings → HTTPS relay URL, on the sign-in
  // screen, or from a phone (Set up from phone). When set, the website and the Samsung TV app still
  // try the provider's server directly first and use the relay only when it can't be reached
  // (sign-in, playlists, guide and, on the TV, video); the website always needs it for the
  // provider's plain-HTTP video. The Android apps don't use it. Relays: README → Video playback
  // over HTTPS (proxy/vps, proxy/netlify, proxy/alwaysdata, proxy/api).
  relay: '',
  // The provider's server: the only host the relays accept, so only its addresses go through them.
  relayHosts: ['inkonabtv.ottb.xyz', 'rvenv.khan349.com', 'rvenv.barond.cc'],

  // Free playlists that are always available, signed in or not (TV and radio), as
  // { name, url } M3U links. None built in: people add theirs in Settings → Extra playlists.
  freePlaylists: [],

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
