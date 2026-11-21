// InkonabTV configuration — edit these values, commit, and GitHub Pages picks them up.
window.INKONAB_CONFIG = {
  appName: 'InkonabTV',
  logo: 'logo1.svg',
  icon: 'icon.svg',

  // Xtream Codes server (HTTPS so it works from GitHub Pages).
  server: 'https://inkonabtv.ottb.xyz:443',

  // HTTPS relay for the website and the Samsung TV app (the Android apps don't use it). It's used
  // only when the provider's server can't be reached directly (blocked on some networks); the
  // website also always needs it for the provider's plain-HTTP video. Default: the rented
  // Kamatera server (proxy/vps, 5 TB a month). Others, for Settings → HTTPS relay URL or as a
  // fallback here: https://inkonab-relay.netlify.app/relay (about 5–10 h of HD a month),
  // https://inkonabtv.alwaysdata.net/relay, https://inkonab-relay.vercel.app/relay
  // (README → Video playback over HTTPS). '' turns it off (the InkonabTV Helper then plays video).
  relay: 'https://185-229-224-187.sslip.io/relay',
  // The provider's server: the only host the relays accept, so only its addresses go through them.
  relayHosts: ['inkonabtv.ottb.xyz'],

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
