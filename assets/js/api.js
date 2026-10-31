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
  // Adult categories are hidden again at every start (parental PIN); only the PIN is kept.
  Settings.showAdult = false;
  Settings.save = function () {
    const { save, showAdult, ...plain } = Settings;
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

  // A fetch that gives up: a server that doesn't answer must not keep the app waiting forever.
  function getJson(url, ms) {
    return Promise.race([
      fetch(url, { cache: 'no-store' }).then(r => {
        if (!r.ok) throw new Error('Server error ' + r.status);
        return r.json();
      }),
      new Promise((resolve, reject) => setTimeout(() => reject(new Error('Failed to fetch')), ms)),
    ]);
  }

  // The new download of a list against the saved copy, item by item (matched by id). Unchanged
  // items keep the saved object; `same` means nothing to save or redraw. The position number
  // (`num`) is left out of the comparison: one new channel would otherwise change all the others.
  function mergeList(old, fresh) {
    const id = x => String(x.stream_id ?? x.series_id ?? x.category_id ?? x.url ?? '');
    const sig = x => JSON.stringify(x, (k, v) => (k === 'num' ? undefined : v));
    const before = new Map((Array.isArray(old) ? old : []).map(x => [id(x), x]));
    let added = 0, changed = 0, moved = false;
    const list = fresh.map((x, i) => {
      const o = before.get(id(x));
      if (!o) { added++; return x; }
      if (!moved && id(old[i] || {}) !== id(x)) moved = true;
      before.delete(id(x));
      if (sig(o) === sig(x)) return o;
      changed++;
      return x;
    });
    const removed = before.size;
    return { list, added, removed, changed, same: !added && !removed && !changed && !moved };
  }

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
      const p = getJson(url, action ? 120e3 : 15e3);
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
      const net = () => getJson(url, 180e3).then(d => {
        const t = Date.now();
        Disk.set(key, { t, d });
        this.saved.set(action, { url, key, t });
        return d;
      });
      const p = Disk.get(key).then(hit => {
        if (!hit || hit.d == null) return net();
        const t = checkedAt(key, hit.t);
        this.saved.set(action, { url, key, t });
        if (Date.now() - t > MAX_AGE) this.scheduleRefresh();
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

    // Refresh when the saved playlists were last checked more than `age` ms ago.
    refreshIfOlder(age) {
      const t = this.savedAt();
      if (t != null && Date.now() - t > age) this.refreshAll();
    }

    // Download every saved playlist again, one after another, without blocking the UI, and keep
    // only the differences: new, removed and changed items. An unchanged list isn't saved again;
    // a list that fails or comes back empty (a provider glitch) keeps the saved copy.
    // Fires 'inkonab:catalog' with the changed sections ({ live, movie, series }) and counts.
    async refreshAll() {
      if (this.refreshing) return this.refreshing;
      this.refreshing = (async () => {
        const sections = {}, counts = { added: 0, removed: 0, changed: 0 };
        // Category lists first: the language downloads after them read the fresh lists.
        const entries = [...(this.saved || [])].sort((a, b) => (a[1].lang ? 1 : 0) - (b[1].lang ? 1 : 0));
        for (const [action, { url, key, lang }] of entries) {
          try {
            const hit = await Disk.get(key);
            const old = hit && hit.d;
            let d;
            if (lang) d = await this.fetchLangs(lang.action, lang.catAction, old);
            else d = await getJson(url, 180e3);
            const fresh = asArray(d);
            if (!fresh.length && asArray(old).length) continue;
            const t = Date.now();
            const diff = mergeList(old, fresh);
            if (!diff.same) {
              await Disk.set(key, { t, d: diff.list });
              this.cache.set(lang ? key : url, Promise.resolve(diff.list));
              sections[SECTION[lang ? lang.action : action]] = true;
              counts.added += diff.added; counts.removed += diff.removed; counts.changed += diff.changed;
            }
            Store.set('checked.' + key, t);
            this.saved.set(action, { url, key, t, lang });
          } catch {}
        }
        this.refreshing = null;
        const changed = Object.keys(sections).length > 0;
        if (changed) window.dispatchEvent(new CustomEvent('inkonab:catalog', { detail: { sections, ...counts } }));
        return changed;
      })();
      return this.refreshing;
    }

    // Saved sign-in for this account (the last time the server answered), or null.
    savedLogin() {
      const remembered = Store.get('creds');
      if (!remembered || remembered.u !== this.username || remembered.p !== this.password) return null;
      const data = Store.get('login.' + this.server + '|' + this.username);
      return data && data.user_info ? data : null;
    }

    // `strict`: the server must answer (no saved sign-in). `offline` is set when the saved
    // sign-in was used because the server didn't answer.
    async login({ strict } = {}) {
      // Offline or server down: fall back to the last successful sign-in for this account.
      const savedKey = 'login.' + this.server + '|' + this.username;
      let data;
      try {
        data = await this.call('', {}, { cache: false });
        this.offline = false;
      } catch (e) {
        // The server answers a wrong account with 401/403/404: say so plainly (no offline fallback).
        if (/Server error 40[134]/.test(e.message)) throw new Error('Wrong username or password');
        data = strict ? null : this.savedLogin();
        if (!data) throw e;
        this.offline = true;
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
    liveStreams(categoryId) { return categoryId == null && this.langs ? this.langStreams('get_live_streams', 'get_live_categories') : this.call('get_live_streams', { category_id: categoryId }).then(asArray); }
    vodStreams(categoryId) { return categoryId == null && this.langs ? this.langStreams('get_vod_streams', 'get_vod_categories') : this.call('get_vod_streams', { category_id: categoryId }).then(asArray); }
    seriesList(categoryId) { return categoryId == null && this.langs ? this.langStreams('get_series', 'get_series_categories') : this.call('get_series', { category_id: categoryId }).then(asArray); }

    // Playlist languages. Big providers start every category with a code ("FR: Sport", "UK: News").
    // With languages chosen (codes; '' = categories without one), only their categories are
    // downloaded, one category at a time, which keeps memory and storage small on a TV. A new
    // category in a chosen language is picked up at the next refresh, since the category lists
    // are read again first.
    setLangs(codes) { this.langs = codes && codes.length ? new Set(codes) : null; }
    langAllowed(name) { return !this.langs || this.langs.has(langCode(name)); }

    // Languages found in the playlist, with how many categories each has per section.
    async langSummary() {
      const [live, movie, series] = await Promise.all([this.liveCategories(), this.vodCategories(), this.seriesCategories()]);
      const m = new Map();
      const add = (list, kind) => {
        for (const c of list) {
          const code = langCode(c.category_name);
          if (!m.has(code)) m.set(code, { code, live: 0, movie: 0, series: 0 });
          m.get(code)[kind]++;
        }
      };
      add(live, 'live'); add(movie, 'movie'); add(series, 'series');
      return [...m.values()];
    }

    langStreams(action, catAction) {
      const key = `${this.server}|${this.username}|${action}|lang:${[...this.langs].sort().join(',')}`;
      if (this.cache.has(key)) return this.cache.get(key);
      this.saved = this.saved || new Map();
      const lang = { action, catAction };
      const net = () => this.fetchLangs(action, catAction).then(d => {
        const t = Date.now();
        Disk.set(key, { t, d });
        this.saved.set(key, { key, t, lang });
        return d;
      });
      const p = Disk.get(key).then(hit => {
        if (!hit || hit.d == null) return net();
        const t = checkedAt(key, hit.t);
        this.saved.set(key, { key, t, lang });
        if (Date.now() - t > MAX_AGE) this.scheduleRefresh();
        return hit.d;
      });
      this.cache.set(key, p);
      p.catch(() => this.cache.delete(key));
      return p;
    }

    // The streams of every category in the chosen languages, 6 requests at a time, in the
    // provider's category order. A category that fails is tried a second time, then keeps its
    // items from `old` (the saved copy) or is skipped; all failing is an error.
    async fetchLangs(action, catAction, old) {
      const cats = asArray(await this.call(catAction)).filter(c => this.langAllowed(c.category_name));
      const parts = new Array(cats.length);
      let next = 0, failed = 0;
      const get = i => getJson(this.apiUrl({ action, category_id: cats[i].category_id }), 60e3).then(asArray);
      const worker = async () => {
        while (next < cats.length) {
          const i = next++;
          try { parts[i] = await get(i).catch(() => get(i)); }
          catch {
            failed++;
            parts[i] = asArray(old).filter(x => String(x.category_id) === String(cats[i].category_id));
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(6, cats.length) }, worker));
      if (cats.length && failed === cats.length) throw new Error('Failed to fetch');
      return parts.flat();
    }
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
        // formatToParts is missing on 2018 Samsung TVs (Chromium 56): read the formatted text instead.
        const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
        const m = f.format(t).match(/(\d{2})\/(\d{2})\/(\d{4}),?\s+(\d{2}):(\d{2})/);
        if (!m) throw new Error('date format');
        parts = { year: m[3], month: m[1], day: m[2], hour: m[4] === '24' ? '00' : m[4], minute: m[5] };
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

  // An M3U playlist behind the same interface as Xtream, so the whole app works with either.
  // Entries are sorted into live channels, movies and series episodes ("Show S01E02"); ids are
  // a hash of the link so favorites and Continue Watching survive playlist refreshes.
  class M3UPlaylist {
    constructor(url) {
      this.url = url.trim();
      this.server = this.url;
      this.username = 'Playlist';
      this.cache = new Map();
      this.isM3U = true;
    }

    async login() {
      const key = 'm3u|' + this.url;
      let hit = await Disk.get(key);
      if (!hit || !hit.d) {
        hit = { t: Date.now(), d: await M3U.load(this.url) };
        Disk.set(key, hit);
      } else if (Date.now() - checkedAt('m3u|' + this.url, hit.t) > MAX_AGE) this.scheduleRefresh();
      this.savedT = checkedAt('m3u|' + this.url, hit.t);
      this.index(hit.d);
      if (!this.live.length && !this.vod.length && !this.series.length) throw new Error('This playlist is empty');
      this.info = { user_info: { username: this.username, status: 'Active' }, server_info: {} };
      return this.info;
    }

    index(entries) {
      const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0).toString(36); };
      const ext = u => ((u.match(/\.([a-z0-9]{2,4})(?:\?|$)/i) || [])[1] || 'm3u8').toLowerCase();
      const cats = { live: new Map(), movie: new Map(), series: new Map() };
      const catId = (kind, name) => {
        const m = cats[kind];
        if (!m.has(name)) m.set(name, { category_id: kind[0] + hash(name), category_name: name, parent_id: 0 });
        return m.get(name).category_id;
      };
      this.urls = new Map();
      this.live = []; this.vod = []; this.series = [];
      const shows = new Map();
      entries.forEach((e, i) => {
        const id = hash(e.url);
        this.urls.set(id, e.url);
        const ep = e.name.match(/^(.*?)[\s._-]*S(\d{1,2})\s*E(\d{1,3})\b[\s._-]*(.*)$/i);
        const kind = /\/series\//.test(e.url) || (ep && e.type !== 'live') ? 'series'
          : /\/movie\//.test(e.url) || e.type === 'movie' || /\b(movies?|films?|vod|cin[eé]ma)\b/i.test(e.group) || /\.(mp4|mkv|avi|mov)(\?|$)/i.test(e.url) ? 'movie' : 'live';
        const group = e.group || { live: 'Channels', movie: 'Movies', series: 'Series' }[kind];
        if (kind === 'live') {
          this.live.push({ num: i + 1, name: e.name, stream_id: id, stream_icon: e.logo, category_id: catId('live', group), epg_channel_id: e.tvgId || '', is_adult: 0 });
        } else if (kind === 'movie') {
          this.vod.push({ stream_id: id, name: e.name, stream_icon: e.logo, category_id: catId('movie', group), container_extension: ext(e.url), added: entries.length - i, rating: 0, is_adult: 0, tmdb: e.tmdb || '' });
        } else {
          const title = (ep ? ep[1] : e.name).trim() || e.name;
          let s = shows.get(title);
          if (!s) {
            s = { series_id: 's' + hash(title), name: title, cover: e.logo, category_id: catId('series', group), last_modified: entries.length - i, tmdb: e.tmdb || '', episodes: {} };
            shows.set(title, s);
            this.series.push(s);
          }
          const season = String(ep ? Number(ep[2]) : 1);
          (s.episodes[season] = s.episodes[season] || []).push({
            id, episode_num: ep ? Number(ep[3]) : s.episodes[season].length + 1, title: ep ? ep[4] : e.name,
            container_extension: ext(e.url), info: { movie_image: e.logo },
          });
        }
      });
      this.cats = { live: [...cats.live.values()], movie: [...cats.movie.values()], series: [...cats.series.values()] };
    }

    savedAt() { return this.savedT || null; }
    scheduleRefresh(delay = 8000) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = setTimeout(() => this.refreshAll(), delay);
    }
    refreshIfOlder(age) { if (this.savedT && Date.now() - this.savedT > age) this.refreshAll(); }
    // Same rules as Xtream: only a playlist that really changed is saved and redrawn.
    async refreshAll() {
      if (this.refreshing) return this.refreshing;
      this.refreshing = (async () => {
        const key = 'm3u|' + this.url;
        const d = await M3U.load(this.url);
        if (!d.length) return false;
        const hit = await Disk.get(key);
        const diff = mergeList(hit && hit.d, d);
        this.savedT = Date.now();
        Store.set('checked.' + key, this.savedT);
        if (diff.same) return false;
        await Disk.set(key, { t: this.savedT, d });
        this.index(d);
        window.dispatchEvent(new CustomEvent('inkonab:catalog', { detail: {
          sections: { live: true, movie: true, series: true }, added: diff.added, removed: diff.removed, changed: diff.changed } }));
        return true;
      })().catch(() => false).then(r => { this.refreshing = null; return r; });
      return this.refreshing;
    }

    byCat(list, categoryId) { return Promise.resolve(categoryId == null ? list : list.filter(x => x.category_id === categoryId)); }
    liveCategories() { return Promise.resolve(this.cats.live); }
    vodCategories() { return Promise.resolve(this.cats.movie); }
    seriesCategories() { return Promise.resolve(this.cats.series); }
    liveStreams(categoryId) { return this.byCat(this.live, categoryId); }
    vodStreams(categoryId) { return this.byCat(this.vod, categoryId); }
    seriesList(categoryId) { return this.byCat(this.series, categoryId); }
    vodInfo(id) { const v = this.vod.find(x => x.stream_id === String(id)); return Promise.resolve({ info: {}, movie_data: { container_extension: v && v.container_extension } }); }
    seriesInfo(id) { const s = this.series.find(x => x.series_id === String(id)); return Promise.resolve(s ? { info: { name: s.name, cover: s.cover }, episodes: s.episodes } : null); }
    shortEpg() { return Promise.resolve([]); }
    epgTable() { return Promise.resolve([]); }
    streamUrl(kind, id) { return this.urls.get(String(id)) || String(id); }
    m3uUrl() { return this.url; }
    epgUrl() { return ''; }
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
          cur = { name: line.slice(line.lastIndexOf(',') + 1).trim(), logo: attr('tvg-logo'), group: attr('group-title'), tvgId: attr('tvg-id'), type: attr('tvg-type'), tmdb: attr('tmdb-id') || attr('tvg-tmdb') };
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

  // The language code a category name starts with ("FR: Sport" → "FR", "UK | News" → "UK"); '' when none.
  // Which section of the app a saved list belongs to.
  const SECTION = {
    get_live_streams: 'live', get_live_categories: 'live', get_vod_streams: 'movie',
    get_vod_categories: 'movie', get_series: 'series', get_series_categories: 'series',
  };

  // When a saved list was last compared with the server (an unchanged list keeps its old date).
  function checkedAt(key, t) { return Math.max(t || 0, Store.get('checked.' + key, 0)); }

  function langCode(name) {
    const m = /^\s*([A-Za-z]{2,8})\s*[:|]/.exec(name || '');
    return m ? m[1].toUpperCase() : '';
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
  window.M3UPlaylist = M3UPlaylist;
  window.Disk = Disk;
  window.TMDB = TMDB;
  window.M3U = M3U;
  window.asArray = asArray;
  window.langCode = langCode;
})();
