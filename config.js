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

  // TMDB v3 API key — used for backdrops, title logos, summaries, cast and trailers.
  tmdbKey: '6c337b22c291ab1d3ff5a86e17ef6f49',
};
