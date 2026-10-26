/* Storage, Xtream Codes API client and TMDB client. */
(function () {
  const CFG = window.INKONAB_CONFIG;

  const Store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem('itv.' + key) ?? sessionStorage.getItem('itv.' + key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch { return fallback; }
    },
    set(key, value, sessionOnly) {
      try { (sessionOnly ? sessionStorage : localStorage).setItem('itv.' + key, JSON.stringify(value)); } catch {}
    },
    del(key) {
      try { localStorage.removeItem('itv.' + key); sessionStorage.removeItem('itv.' + key); } catch {}
    },
  };

  const defaultLang = (navigator.language || 'en-US').includes('-')
    ? navigator.language : (navigator.language || 'en') + '-' + (navigator.language || 'en').toUpperCase();

  const Settings = Object.assign(
    { server: CFG.server, relay: CFG.relay || '', liveFormat: 'm3u8', showAdult: false, tmdbLang: defaultLang },
    Store.get('settings', {})
  );
  Settings.save = function () {
    const { save, ...plain } = Settings;
    Store.set('settings', plain);
  };

  class Xtream {
    constructor(server, username, password) {
      this.server = server.replace(/\/+$/, '');
      this.username = username;
      this.password = password;
      this.cache = new Map();
    }

    apiUrl(params) {
      const u = new URL(this.server + '/player_api.php');
      u.searchParams.set('username', this.username);
      u.searchParams.set('password', this.password);
      for (const [k, v] of Object.entries(params)) if (v != null && v !== '') u.searchParams.set(k, v);
      return u.toString();
    }

    call(action, params = {}, { cache = true } = {}) {
      const url = this.apiUrl(action ? { action, ...params } : params);
      if (cache && this.cache.has(url)) return this.cache.get(url);
      const p = fetch(url, { cache: 'no-store' }).then(r => {
        if (!r.ok) throw new Error('Server error ' + r.status);
        return r.json();
      });
      if (cache) {
        this.cache.set(url, p);
        p.catch(() => this.cache.delete(url));
      }
      return p;
    }

    async login() {
      const data = await this.call('', {}, { cache: false });
      if (!data || !data.user_info || Number(data.user_info.auth) !== 1) throw new Error('Wrong username or password');
      if (data.user_info.status && data.user_info.status !== 'Active') throw new Error('Account ' + data.user_info.status.toLowerCase());
      this.info = data;
      return data;
    }

    liveCategories() { return this.call('get_live_categories').then(asArray); }
    vodCategories() { return this.call('get_vod_categories').then(asArray); }
    seriesCategories() { return this.call('get_series_categories').then(asArray); }
    liveStreams(categoryId) { return this.call('get_live_streams', { category_id: categoryId }).then(asArray); }
    vodStreams(categoryId) { return this.call('get_vod_streams', { category_id: categoryId }).then(asArray); }
    seriesList(categoryId) { return this.call('get_series', { category_id: categoryId }).then(asArray); }
    vodInfo(id) { return this.call('get_vod_info', { vod_id: id }); }
    seriesInfo(id) { return this.call('get_series_info', { series_id: id }); }
    shortEpg(streamId, limit = 8) {
      return this.call('get_short_epg', { stream_id: streamId, limit }, { cache: false }).then(d =>
        asArray(d && d.epg_listings).map(e => ({
          title: b64(e.title), description: b64(e.description),
          start: Number(e.start_timestamp) * 1000, end: Number(e.stop_timestamp) * 1000,
        }))
      );
    }

    streamUrl(kind, id, ext) {
      const path = { live: 'live', movie: 'movie', episode: 'series' }[kind];
      return `${this.server}/${path}/${encodeURIComponent(this.username)}/${encodeURIComponent(this.password)}/${id}.${ext}`;
    }
    m3uUrl() { return `${this.server}/get.php?username=${encodeURIComponent(this.username)}&password=${encodeURIComponent(this.password)}&output=ts&type=m3u_plus`; }
    epgUrl() { return `${this.server}/xmltv.php?username=${encodeURIComponent(this.username)}&password=${encodeURIComponent(this.password)}`; }
  }

  const TMDB = {
    img: (path, size = 'w780') => (path ? `https://image.tmdb.org/t/p/${size}${path}` : ''),
    cache: new Map(),
    details(type, id) {
      if (!CFG.tmdbKey || !id || id === '0') return Promise.resolve(null);
      const key = type + id + Settings.tmdbLang;
      if (this.cache.has(key)) return this.cache.get(key);
      const lang = Settings.tmdbLang;
      const base = lang.split('-')[0];
      const u = new URL(`https://api.themoviedb.org/3/${type}/${id}`);
      u.searchParams.set('api_key', CFG.tmdbKey);
      u.searchParams.set('language', lang);
      u.searchParams.set('append_to_response', 'videos,images,credits');
      u.searchParams.set('include_image_language', `${base},en,null`);
      u.searchParams.set('include_video_language', `${base},en`);
      const p = fetch(u).then(r => (r.ok ? r.json() : null)).then(d => d && TMDB.normalize(d, base)).catch(() => null);
      this.cache.set(key, p);
      return p;
    },
    // Titles TMDB ranks highest right now (trending, popular, top rated, in theaters / on air),
    // as Map(tmdbId → {date, pop}). Cached for 12 hours so pages open instantly.
    async top(type) {
      if (!CFG.tmdbKey) return new Map();
      const cacheKey = 'tmdbTop.' + type;
      const cached = Store.get(cacheKey);
      if (cached && Date.now() - cached.t < 12 * 3600e3) return new Map(cached.list);
      const lists = type === 'movie'
        ? [['trending/movie/week', 10], ['movie/popular', 25], ['movie/top_rated', 20], ['movie/now_playing', 5]]
        : [['trending/tv/week', 10], ['tv/popular', 25], ['tv/top_rated', 20], ['tv/on_the_air', 5]];
      const jobs = lists.flatMap(([path, pages]) => Array.from({ length: pages }, (_, i) => {
        const u = new URL('https://api.themoviedb.org/3/' + path);
        u.searchParams.set('api_key', CFG.tmdbKey);
        u.searchParams.set('page', i + 1);
        return fetch(u).then(r => (r.ok ? r.json() : null)).catch(() => null);
      }));
      const map = new Map();
      for (const page of await Promise.all(jobs)) {
        for (const r of (page && page.results) || []) {
          map.set(String(r.id), { date: r.release_date || r.first_air_date || '', pop: r.popularity || 0 });
        }
      }
      if (map.size) Store.set(cacheKey, { t: Date.now(), list: [...map] });
      return map;
    },
    normalize(d, base) {
      const logos = (d.images && d.images.logos) || [];
      const logo = logos.find(l => l.iso_639_1 === base) || logos.find(l => l.iso_639_1 === 'en') || logos[0];
      const vids = ((d.videos && d.videos.results) || []).filter(v => v.site === 'YouTube');
      const trailer = vids.find(v => v.type === 'Trailer' && v.iso_639_1 === base) || vids.find(v => v.type === 'Trailer') || vids[0];
      return {
        title: d.title || d.name,
        overview: d.overview,
        tagline: d.tagline,
        genres: (d.genres || []).map(g => g.name),
        year: (d.release_date || d.first_air_date || '').slice(0, 4),
        runtime: d.runtime || (d.episode_run_time && d.episode_run_time[0]) || 0,
        rating: d.vote_average ? d.vote_average.toFixed(1) : '',
        backdrop: TMDB.img(d.backdrop_path, 'w1280'),
        poster: TMDB.img(d.poster_path, 'w500'),
        logo: logo ? TMDB.img(logo.file_path, 'w500') : '',
        trailer: trailer ? trailer.key : '',
        cast: ((d.credits && d.credits.cast) || []).slice(0, 12).map(c => ({
          name: c.name, role: c.character, photo: TMDB.img(c.profile_path, 'w185'),
        })),
      };
    },
  };

  // Minimal M3U parser: [{name, logo, group, url, radio}]
  const M3U = {
    async load(url) {
      const text = await fetch(url, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error('Playlist ' + r.status); return r.text(); });
      const out = [];
      let cur = null;
      for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (line.startsWith('#EXTINF')) {
          const attr = k => (line.match(new RegExp(k + '="([^"]*)"')) || [])[1] || '';
          cur = { name: line.slice(line.lastIndexOf(',') + 1).trim(), logo: attr('tvg-logo'), group: attr('group-title') };
        } else if (line && !line.startsWith('#') && cur) {
          cur.url = line;
          cur.radio = /radio/i.test(cur.group) || /\bradio\b|\bfm\b/i.test(cur.name) || /\/radio\.|fm\.m3u8$/i.test(line);
          out.push(cur);
          cur = null;
        }
      }
      return out;
    },
  };

  function asArray(v) {
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') return Object.values(v);
    return [];
  }

  function b64(s) {
    if (!s) return '';
    try {
      const bin = atob(s);
      return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
    } catch { return s; }
  }

  window.Store = Store;
  window.Settings = Settings;
  window.Xtream = Xtream;
  window.TMDB = TMDB;
  window.M3U = M3U;
  window.asArray = asArray;
})();
