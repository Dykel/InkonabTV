// InkonabTV configuration — edit these values, commit, and GitHub Pages picks them up.
window.INKONAB_CONFIG = {
  appName: 'InkonabTV',
  logo: 'https://raw.githubusercontent.com/Dykel/inkonab/refs/heads/main/logo1.svg',
  icon: 'https://raw.githubusercontent.com/Dykel/inkonab/refs/heads/main/icon.svg',

  // Xtream Codes server (HTTPS so it works from GitHub Pages).
  server: 'https://inkonabtv.ottb.xyz:443',

  // HTTPS relay for video. The provider hands out video from a plain-HTTP address,
  // which browsers block on an HTTPS site. Deploy proxy/worker.js to Cloudflare
  // (see README) and paste its URL here, e.g. 'https://inkonab-relay.you.workers.dev'.
  // Users can also set it from Settings inside the app.
  relay: '',

  // Free playlists that are always available, signed in or not (TV and radio).
  freePlaylists: [
    { name: 'MBC PLAY', url: 'https://raw.githubusercontent.com/Dykel/MBCPLAY/refs/heads/main/mbc.m3u' },
  ],

  // Player mode: no built-in server or free playlists; people add their own Xtream account
  // (server, username, password) or M3U link. The Samsung TV build turns this on.
  playerMode: false,

  // Remote setup: the sign-in screen shows a code that someone enters on setupUrl to fill in
  // the account from a phone. pairApi is the pairing worker (proxy/pair-worker.js, see README);
  // leave it empty to hide remote setup.
  pairApi: 'https://inkonab-pair.inkonab.workers.dev',
  setupUrl: 'https://dykel.github.io/InkonabTV/setup.html',

  privacyUrl: 'https://dykel.github.io/InkonabTV/privacy.html',

  // TMDB v3 API key — used for backdrops, title logos, summaries, cast and trailers.
  tmdbKey: '6c337b22c291ab1d3ff5a86e17ef6f49',
};
