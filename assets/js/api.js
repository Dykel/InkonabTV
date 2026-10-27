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
    { server: CFG.server, relay: CFG.relay || '', liveFormat: 'm3u8', showAdult: false, tmdbLang: defaultLang, catchupShift: 0 },
    Store.get('settings', {})
  );
  Settings.save = function () {
    const { save, ...plain } = Settings;
    Store.set('settings', plain);
  };

  // IndexedDB key/value store: the playlists are several MB each (too big for localStorage).
  const Disk = {
    open() {
      if (!this.db) {
        this.db = new Promise((resolve, reject) => {
          const req = indexedDB.open('inkonab', 1);
          req.onupgradeneeded = () => req.result.createObjectStore('kv');
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        }).catch(() => null);
      }
      return this.db;
    },
    async run(mode, fn) {
      try {
        const db = await this.open();
        if (!db) return null;
        return await new Promise(resolve => {
          const tx = db.transaction('kv', mode);
          const req = fn(tx.objectStore('kv'));
          tx.oncomplete = () => resolve(req && req.result);
          tx.onerror = tx.onabort = () => resolve(null);
        });
      } catch { return null; }
    },
    get(key) { return this.run('readonly', st => st.get(key)); },
    set(key, value) { return this.run('readwrite', st => st.put(value, key)); },
    clear() { return this.run('readwrite', st => st.clear()); },
  };

  // Playlists kept on the device: shown at once on launch, refreshed in the background.
  const PERSIST = new Set(['get_live_streams', 'get_vod_streams', 'get_series', 'get_live_categories', 'get_vod_categories', 'get_series_categories']);
  const MAX_AGE = 6 * 3600e3;

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
      if (cache && PERSIST.has(action) && params.category_id == null) return this.persisted(action, url);
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

    // Saved copy first (refreshed in the background when older than 6 hours), network otherwise.
    persisted(action, url) {
      const key = `${this.server}|${this.username}|${action}`;
      this.saved = this.saved || new Map();
      const net = () => fetch(url, { cache: 'no-store' }).then(r => {
        if (!r.ok) throw new Error('Server error ' + r.status);
        return r.json();
      }).then(d => {
        const t = Date.now();
        Disk.set(key, { t, d });
        this.saved.set(action, { url, key, t });
        return d;
      });
      const p = Disk.get(key).then(hit => {
        if (!hit || hit.d == null) return net();
        this.saved.set(action, { url, key, t: hit.t });
        if (Date.now() - hit.t > MAX_AGE) this.scheduleRefresh();
        return hit.d;
      });
      this.cache.set(url, p);
      p.catch(() => this.cache.delete(url));
      return p;
    }

    // Oldest time any saved playlist was downloaded (null: nothing saved yet).
    savedAt() {
      const ts = [...(this.saved || new Map()).values()].map(v => v.t);
      return ts.length ? Math.min(...ts) : null;
    }

    scheduleRefresh(delay = 8000) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = setTimeout(() => this.refreshAll(), delay);
    }

    // Download every saved playlist again, one after another, without blocking the UI.
    // Fires 'inkonab:catalog' when the new data is stored.
    async refreshAll() {
      if (this.refreshing) return this.refreshing;
      this.refreshing = (async () => {
        let changed = false;
        for (const [action, { url, key }] of this.saved || []) {
          try {
            const r = await fetch(url, { cache: 'no-store' });
            if (!r.ok) continue;
            const d = await r.json();
            const t = Date.now();
            await Disk.set(key, { t, d });
            this.saved.set(action, { url, key, t });
            this.cache.set(url, Promise.resolve(d));
            changed = true;
          } catch {}
        }
        this.refreshing = null;
        if (changed) window.dispatchEvent(new CustomEvent('inkonab:catalog'));
        return changed;
      })();
      return this.refreshing;
    }

    async login() {
      // Offline or server down: fall back to the last successful sign-in for this account.
      const savedKey = 'login.' + this.server + '|' + this.username;
      let data;
      try {
        data = await this.call('', {}, { cache: false });
      } catch (e) {
        // The server answers a wrong account with 401/403/404: say so plainly (no offline fallback).
        if (/Server error 40[134]/.test(e.message)) throw new Error('Wrong username or password');
        const remembered = Store.get('creds');
        data = remembered && remembered.u === this.username && remembered.p === this.password ? Store.get(savedKey) : null;
        if (!data) throw e;
      }
      if (!data || !data.user_info || Number(data.user_info.auth) !== 1) throw new Error('Wrong username or password');
      if (data.user_info.status && data.user_info.status !== 'Active') throw new Error('Account ' + data.user_info.status.toLowerCase());
      this.info = data;
      const { password, ...userInfo } = data.user_info;
      Store.set(savedKey, { user_info: userInfo, server_info: data.server_info });
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

    // A channel's whole guide (about a week back and a few days ahead) in one call.
    // `archive`: the programme can be replayed (catch-up); `startStr` is the server-local start
    // ("2026-10-26 19:00:00") that catch-up links expect.
    epgTable(streamId) {
      return this.call('get_simple_data_table', { stream_id: streamId }, { cache: false }).then(d =>
        asArray(d && d.epg_listings).map(e => ({
          title: b64(e.title), description: b64(e.description),
          start: Number(e.start_timestamp) * 1000, end: Number(e.stop_timestamp) * 1000,
          startStr: e.start || '', archive: Number(e.has_archive) === 1,
        })).filter(e => e.end > e.start).sort((a, b) => a.start - b.start)
      );
    }

    // Catch-up (timeshift) link; only the MPEG-TS form is served by this provider. The start
    // time is written in the server's timezone (server_info.timezone), shifted by the
    // "Catch-up time correction" setting for panels whose clock differs.
    catchupUrl(streamId, startMs, minutes) {
      const tz = (this.info && this.info.server_info && this.info.server_info.timezone) || 'UTC';
      const t = new Date(startMs + (Number(Settings.catchupShift) || 0) * 3600e3);
      let parts;
      try {
        parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
          .formatToParts(t).map(x => [x.type, x.value]));
      } catch {
        const z = n => String(n).padStart(2, '0');
        parts = { year: t.getUTCFullYear(), month: z(t.getUTCMonth() + 1), day: z(t.getUTCDate()), hour: z(t.getUTCHours()), minute: z(t.getUTCMinutes()) };
      }
      const start = `${parts.year}-${parts.month}-${parts.day}:${parts.hour}-${parts.minute}`;
      return `${this.server}/timeshift/${encodeURIComponent(this.username)}/${encodeURIComponent(this.password)}/${Math.max(1, Math.round(minutes))}/${start}/${streamId}.ts`;
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
  window.Disk = Disk;
  window.TMDB = TMDB;
  window.M3U = M3U;
  window.asArray = asArray;
})();
