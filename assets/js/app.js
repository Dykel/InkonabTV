/* InkonabTV — views, routing and UI glue. */
(function () {
  const CFG = window.INKONAB_CONFIG;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const CHUNK = 48;
  const ADULT = /\b(xxx|adult|adults|18\+|\+18|porn)\b/i;

  const ICONS = {
    play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" fill="currentColor"/></svg>',
    info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 11v6M12 7.5v.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z" fill="currentColor"/></svg>',
    trailer: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="m10 9 5 3-5 3Z" fill="currentColor"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    restart: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  // ---------- helpers ----------
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hm = t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const fmtDur = secs => { secs = Math.round(secs); const h = Math.floor(secs / 3600), m = Math.round((secs % 3600) / 60); return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m} min`; };

  function parseName(raw) {
    let s = String(raw || '').trim();
    let lang = '';
    const m = s.match(/^([A-Z]{2,4}(?:-[A-Z]{2})?)\s*[-|:]\s+/);
    if (m) { lang = m[1]; s = s.slice(m[0].length); }
    const quality = (s.match(/\[(4K|UHD|FHD|HD|SD|\d{3,4}p)\]/i) || [])[1] || '';
    const year = (s.match(/\((\d{4})\)/) || [])[1] || '';
    s = s.replace(/\[[^\]]*\]/g, '').replace(/\((\d{4}|[A-Z]{2,7})\)/g, '').replace(/\s{2,}/g, ' ').trim();
    return { title: s || String(raw || ''), lang, year, quality };
  }

  function firstImage(v) {
    if (Array.isArray(v)) return v[0] || '';
    if (typeof v === 'string' && v.startsWith('[')) { try { return JSON.parse(v.replace(/'/g, '"'))[0] || ''; } catch { return ''; } }
    return v || '';
  }

  // Normalise Xtream VOD / series entries into one card model.
  function fromVod(v) {
    const n = parseName(v.name);
    return { kind: 'movie', id: v.stream_id, name: n.title, raw: v.name, lang: n.lang, year: n.year, quality: n.quality,
      img: v.stream_icon || '', added: Number(v.added) || 0, rating: parseFloat(v.rating) || 0, tmdb: v.tmdb || v.tmdb_id || '',
      ext: v.container_extension || 'mp4', cat: String(v.category_id), adult: Number(v.is_adult) === 1, key: fold(v.name) };
  }
  function fromSeries(s) {
    const n = parseName(s.name);
    return { kind: 'series', id: s.series_id, name: n.title, raw: s.name, lang: n.lang, year: n.year || (s.releaseDate || '').slice(0, 4), quality: n.quality,
      img: s.cover || '', added: Number(s.last_modified) || 0, rating: parseFloat(s.rating) || 0, tmdb: s.tmdb || '',
      plot: s.plot || '', genre: s.genre || '', backdrop: firstImage(s.backdrop_path), cat: String(s.category_id),
      adult: false, key: fold(s.name) };
  }

  const App = {
    api: null,
    data: {},
    view: 'home',
    esc, hm,

    // ---------- boot / auth ----------
    async boot() {
      document.title = CFG.appName;
      $$('[data-logo]').forEach(img => { img.src = CFG.logo; img.alt = CFG.appName; });
      Player.init();
      this.bindChrome();
      this.tickDate();
      setInterval(() => this.tickDate(), 60000);

      const creds = Store.get('creds');
      if (!creds) return this.showLogin();
      this.showSplash(true);
      try {
        await this.connect(creds.u, creds.p);
        this.start();
      } catch (err) {
        this.showLogin(err.message);
      } finally {
        this.showSplash(false);
      }
    },

    async connect(u, p) {
      const api = new Xtream(Settings.server, u, p);
      await api.login();
      this.api = api;
      this.data = {};
    },

    showSplash(on) { $('#splash').classList.toggle('hidden', !on); },

    showLogin(error) {
      $('#app').classList.add('hidden');
      $('#login').classList.remove('hidden');
      $('#loginError').textContent = error || '';
      const creds = Store.get('creds');
      if (creds) $('#loginUser').value = creds.u;
      setTimeout(() => ($('#loginUser').value ? $('#loginPass') : $('#loginUser')).focus(), 50);
    },

    async submitLogin(e) {
      e.preventDefault();
      const u = $('#loginUser').value.trim(), p = $('#loginPass').value;
      const btn = $('#loginBtn');
      if (!u || !p) { $('#loginError').textContent = 'Enter your username and password.'; return; }
      btn.disabled = true; btn.textContent = 'Signing in…';
      $('#loginError').textContent = '';
      try {
        await this.connect(u, p);
        Store.del('creds');
        Store.set('creds', { u, p }, !$('#loginRemember').checked);
        $('#loginPass').value = '';
        this.start();
      } catch (err) {
        $('#loginError').textContent = err.message === 'Failed to fetch' ? 'Can’t reach the server. Check your connection.' : err.message;
      } finally {
        btn.disabled = false; btn.textContent = 'Sign in';
      }
    },

    logout() {
      Store.del('creds');
      this.api = null;
      this.data = {};
      this.closeModal();
      location.hash = '';
      this.showLogin();
    },

    start() {
      $('#login').classList.add('hidden');
      $('#app').classList.remove('hidden');
      $('#avatar').textContent = (this.api.username[0] || '?').toUpperCase();
      this.route();
    },

    bindChrome() {
      $('#loginForm').addEventListener('submit', e => this.submitLogin(e));
      $$('[data-view]').forEach(b => b.addEventListener('click', () => { location.hash = b.dataset.view; }));
      $('#searchBtn').addEventListener('click', () => this.openSearch());
      $('#settingsBtn').addEventListener('click', () => this.openSettings());
      $('#avatar').addEventListener('click', () => this.openSettings());
      window.addEventListener('hashchange', () => this.api && this.route());
      $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') this.closeModal(); });

      // Broken poster → show the title placeholder underneath.
      document.addEventListener('error', e => {
        const t = e.target;
        if (t.tagName === 'IMG' && !t.dataset.failed) { t.dataset.failed = '1'; t.classList.add('broken'); }
      }, true);

      document.addEventListener('keydown', e => {
        if (Player.isOpen()) return;
        const back = e.key === 'Escape' || e.key === 'BrowserBack' || e.key === 'GoBack' ||
          (e.key === 'Backspace' && !e.target.matches('input, textarea'));
        if (!back) return;
        if (!$('#modal').classList.contains('hidden')) { e.preventDefault(); this.closeModal(); }
        else if (this.api && this.view !== 'home') { e.preventDefault(); location.hash = 'home'; }
      });
    },

    tickDate() {
      $('#date').textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    },

    toast(msg) {
      const t = $('#toast');
      t.textContent = msg;
      t.classList.add('show');
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
    },

    // ---------- routing ----------
    route() {
      const view = (location.hash.slice(1) || 'home').split('/')[0];
      this.view = ['home', 'live', 'movies', 'series'].includes(view) ? view : 'home';
      $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === this.view));
      $('.home-btn').classList.toggle('active', this.view === 'home');
      document.body.dataset.view = this.view;
      window.scrollTo(0, 0);
      const main = $('#view');
      main.innerHTML = '<div class="loader"><span></span></div>';
      const render = { home: this.renderHome, live: this.renderLive, movies: this.renderMovies, series: this.renderSeries }[this.view];
      render.call(this, main).catch(err => {
        console.error(err);
        main.innerHTML = `<div class="empty"><h3>Couldn’t load this page</h3><p>${esc(err.message)}</p><button class="btn" id="retry">Try again</button></div>`;
        $('#retry').addEventListener('click', () => this.route());
      });
    },

    onPlayerClosed() {
      if (this.view === 'home') this.renderContinue();
    },

    // ---------- data ----------
    loadVod() {
      return this.data.vod || (this.data.vod = this.api.vodStreams().then(list => list.map(fromVod).sort((a, b) => b.added - a.added)));
    },
    loadSeries() {
      return this.data.series || (this.data.series = this.api.seriesList().then(list => list.map(fromSeries).sort((a, b) => b.added - a.added)));
    },
    loadLive() {
      // Channels named "✶⋆✶ … ✶⋆✶" are the provider's section dividers, not real channels.
      return this.data.live || (this.data.live = this.api.liveStreams().then(list => list
        .filter(c => !String(c.name || '').trim().startsWith('✶⋆✶'))
        .map(c => ({ ...c, key: fold(c.name), adult: Number(c.is_adult) === 1 }))));
    },
    async loadCats(kind) {
      const key = kind + 'Cats';
      if (!this.data[key]) {
        const fn = { live: 'liveCategories', movie: 'vodCategories', series: 'seriesCategories' }[kind];
        this.data[key] = this.api[fn]();
      }
      const cats = await this.data[key];
      return Settings.showAdult ? cats : cats.filter(c => !ADULT.test(c.category_name));
    },
    allowed(list) { return Settings.showAdult ? list : list.filter(i => !i.adult); },

    // Catalog titles that TMDB currently ranks highly, one copy per title.
    // byDate: newest release first. byPop: most watched (TMDB popularity) first.
    tmdbPicks(kind) {
      const key = kind + 'Picks';
      if (this.data[key]) return this.data[key];
      return (this.data[key] = (async () => {
        const [all, top] = await Promise.all([kind === 'movie' ? this.loadVod() : this.loadSeries(), TMDB.top(kind === 'movie' ? 'movie' : 'tv')]);
        // Prefer the info language, then French (most of this catalog), English, then untagged copies.
        const order = [Settings.tmdbLang.split('-')[0].toUpperCase(), 'FR', 'QFR', 'EN', ''];
        const rank = i => { const r = order.indexOf(i.lang); return r < 0 ? order.length : r; };
        const best = new Map();
        for (const i of this.allowed(all)) {
          const id = String(i.tmdb || '');
          if (!top.has(id)) continue;
          const cur = best.get(id);
          if (!cur || rank(i) < rank(cur)) best.set(id, i);
        }
        const picks = [...best.values()];
        const meta = i => top.get(String(i.tmdb));
        return {
          byDate: [...picks].sort((a, b) => meta(b).date.localeCompare(meta(a).date) || meta(b).pop - meta(a).pop),
          byPop: [...picks].sort((a, b) => meta(b).pop - meta(a).pop),
        };
      })().catch(() => ({ byDate: [], byPop: [] })));
    },

    // ---------- continue watching ----------
    cw() { return Store.get('cw', []); },
    cwGet(key) { return this.cw().find(e => e.key === key); },
    cwSave(entry, pos, dur) {
      let list = this.cw().filter(e => e.key !== entry.key);
      if (pos / dur < 0.95) list.unshift({ ...entry, pos, dur, t: Date.now() });
      Store.set('cw', list.slice(0, 30));
    },
    cwRemove(key) { Store.set('cw', this.cw().filter(e => e.key !== key)); },

    playEntry(entry, resume = true) {
      Player.open({
        kind: entry.kind, id: entry.id, ext: entry.ext, title: entry.title, subtitle: entry.subtitle,
        resumeAt: resume ? entry.pos : 0,
        onProgress: (pos, dur) => this.cwSave(entry, pos, dur),
        onEnded: entry.onEnded,
      });
    },

    // ---------- shared UI ----------
    card(item) {
      const series = item.kind === 'series';
      return `<button class="card${series ? ' is-series' : ''}" data-kind="${item.kind}" data-id="${item.id}">
        <span class="poster">
          <span class="ph">${esc(item.name)}</span>
          ${item.img ? `<img loading="lazy" src="${esc(item.img)}" alt="">` : ''}
          ${series ? '<span class="badge">Series</span>' : ''}
          ${item.quality ? `<span class="q">${esc(item.quality)}</span>` : ''}
          <span class="play">${ICONS.play}</span>
        </span>
        <span class="card-title">${esc(item.name)}</span>
      </button>`;
    },

    bindCards(root, lookup, onFocus) {
      root.addEventListener('click', e => {
        const c = e.target.closest('.card');
        if (!c) return;
        const item = lookup(c.dataset.kind, c.dataset.id);
        if (item) item.kind === 'series' ? this.openSeries(item) : this.openMovie(item);
      });
      if (onFocus) {
        const f = debounce(c => { const item = lookup(c.dataset.kind, c.dataset.id); if (item) onFocus(item); }, 220);
        root.addEventListener('focusin', e => { const c = e.target.closest('.card'); if (c) f(c); });
        root.addEventListener('mouseover', e => { const c = e.target.closest('.card'); if (c) f(c); });
      }
    },

    row(title, items, extraClass = '') {
      if (!items.length) return '';
      const [a, ...b] = title.split(' ');
      return `<section class="row ${extraClass}"><h2><b>${esc(a)}</b> ${esc(b.join(' '))}</h2>
        <div class="row-scroll">${items.map(i => this.card(i)).join('')}</div></section>`;
    },

    setBackdrop(url) {
      const bg = $('#bg');
      const layers = $$('.bg-img', bg);
      const [cur, next] = layers[0].classList.contains('on') ? layers : [layers[1], layers[0]];
      if (!url) { cur.classList.remove('on'); return; }
      if (cur.dataset.url === url) return;
      const img = new Image();
      img.onload = () => {
        next.style.backgroundImage = `url("${url}")`;
        next.dataset.url = url;
        next.classList.add('on');
        cur.classList.remove('on');
      };
      img.src = url;
    },

    // ---------- home ----------
    async renderHome(main) {
      const [vod, series] = await Promise.all([this.loadVod(), this.loadSeries()]);
      const movies = this.allowed(vod), shows = series;
      // Two movies, then one series, so both show up even when one side is updated more often.
      const latest = [];
      for (let i = 0; latest.length < 30 && i < 30; i++) {
        latest.push(...movies.slice(i * 2, i * 2 + 2));
        if (shows[i]) latest.push(shows[i]);
      }
      const topRated = movies.slice(0, 3000).filter(m => m.rating >= 7.5).slice(0, 30);
      const recentSeries = shows.slice(0, 30);
      const index = new Map([...latest, ...topRated, ...recentSeries].map(i => [i.kind + i.id, i]));

      main.innerHTML = `
        <section class="hero" id="hero">
          <div class="hero-info">
            <div class="hero-genre"></div>
            <h1 class="hero-title"></h1>
            <div class="hero-meta"></div>
            <p class="hero-plot"></p>
            <div class="hero-actions">
              <button class="btn primary" data-hero="play">${ICONS.play}<span>Watch now</span></button>
              <button class="btn ghost" data-hero="info">${ICONS.info}<span>More info</span></button>
            </div>
          </div>
        </section>
        <div class="rows">
          ${this.row('Latest added', latest, 'first')}
          <div id="cwSlot"></div>
          <div id="popSlot"></div>
          ${this.row('Top rated', topRated)}
          ${this.row('New episodes', recentSeries)}
        </div>`;

      const lookup = (k, id) => index.get(k + id);
      this.bindCards($('.rows', main), lookup, item => this.setHero(item));
      $('[data-hero="play"]', main).addEventListener('click', () => this.heroItem && (this.heroItem.kind === 'series' ? this.openSeries(this.heroItem) : this.openMovie(this.heroItem, true)));
      $('[data-hero="info"]', main).addEventListener('click', () => this.heroItem && (this.heroItem.kind === 'series' ? this.openSeries(this.heroItem) : this.openMovie(this.heroItem)));
      this.renderContinue();
      if (latest[0]) this.setHero(latest[0]);

      // TMDB-ranked rows arrive a moment later so they never hold up the page.
      Promise.all([this.tmdbPicks('movie'), this.tmdbPicks('series')]).then(([mp, sp]) => {
        const slot = $('#popSlot', main);
        if (!slot) return;
        const pm = mp.byPop.slice(0, 30), ps = sp.byPop.slice(0, 30);
        for (const i of [...pm, ...ps]) index.set(i.kind + i.id, i);
        slot.innerHTML = this.row('Most watched movies', pm) + this.row('Most watched series', ps);
      });
      const first = $('.row.first .card', main);
      if (first && !$('#modal:not(.hidden)')) first.focus({ preventScroll: true });
    },

    renderContinue() {
      const slot = $('#cwSlot');
      if (!slot) return;
      const list = this.cw();
      if (!list.length) { slot.innerHTML = ''; return; }
      slot.innerHTML = `<section class="row cw"><h2><b>Continue</b> Watching</h2><div class="row-scroll">
        ${list.map(e => `<button class="wide" data-key="${esc(e.key)}">
          <span class="wide-img">${e.backdrop || e.img ? `<img loading="lazy" src="${esc(e.backdrop || e.img)}" alt="">` : ''}<span class="play">${ICONS.play}</span></span>
          <span class="wide-text"><b>${esc(e.title)}</b><small>${esc(e.subtitle || '')} · ${fmtDur(e.dur - e.pos)} left</small></span>
          <span class="bar"><i style="width:${Math.min(100, (e.pos / e.dur) * 100).toFixed(1)}%"></i></span>
        </button>`).join('')}</div></section>`;
      slot.querySelector('.row-scroll').addEventListener('click', e => {
        const b = e.target.closest('.wide');
        const entry = b && this.cwGet(b.dataset.key);
        if (entry) this.playEntry(entry);
      });
    },

    async setHero(item) {
      this.heroItem = item;
      const hero = $('#hero');
      if (!hero) return;
      const put = (genre, title, logo, meta, plot) => {
        $('.hero-genre', hero).textContent = genre || (item.kind === 'series' ? 'Series' : 'Movie');
        $('.hero-title', hero).innerHTML = logo ? `<img class="hero-logo" src="${esc(logo)}" alt="${esc(title)}">` : esc(title);
        $('.hero-meta', hero).innerHTML = meta;
        $('.hero-plot', hero).textContent = plot || '';
      };
      const chips = (year, rating, extra) => [
        item.lang && `<span class="chip">${esc(item.lang)}</span>`,
        item.quality && `<span class="chip">${esc(item.quality)}</span>`,
        year && `<span>${esc(year)}</span>`,
        rating && `<span class="rate">${ICONS.star}${esc(rating)}</span>`,
        extra && `<span>${esc(extra)}</span>`,
      ].filter(Boolean).join('');

      put(item.genre && item.genre.split(/[,/]/).slice(0, 2).join(', '), item.name, '', chips(item.year, item.rating ? item.rating.toFixed(1) : ''), item.plot);
      this.setBackdrop(item.backdrop || '');
      hero.classList.remove('in'); void hero.offsetWidth; hero.classList.add('in');

      const t = await TMDB.details(item.kind === 'series' ? 'tv' : 'movie', item.tmdb);
      if (this.heroItem !== item || !t) return;
      put(t.genres.slice(0, 2).join(', '), t.title || item.name, t.logo, chips(t.year || item.year, t.rating, t.runtime ? fmtDur(t.runtime * 60) : ''), t.overview || item.plot);
      this.setBackdrop(t.backdrop || item.backdrop || '');
    },

    // ---------- movies / series browse ----------
    renderMovies(main) { return this.renderBrowse(main, 'movie'); },
    renderSeries(main) { return this.renderBrowse(main, 'series'); },

    async renderBrowse(main, kind) {
      this.setBackdrop('');
      const [all, cats, picks] = await Promise.all([kind === 'movie' ? this.loadVod() : this.loadSeries(), this.loadCats(kind), this.tmdbPicks(kind)]);
      const items = this.allowed(all);
      const counts = {};
      for (const i of items) counts[i.cat] = (counts[i.cat] || 0) + 1;
      const usable = cats.filter(c => counts[c.category_id]);
      const byId = new Map(items.map(i => [i.kind + i.id, i]));
      const label = kind === 'movie' ? 'Movies' : 'Series';
      const virtual = { '': items, '@top': picks.byDate, '@popular': picks.byPop };
      const titles = { '': `<b>Latest</b> ${label.toLowerCase()}`, '@top': `<b>Top</b> picks`, '@popular': `<b>Most</b> watched` };
      const startCat = picks.byDate.length ? '@top' : '';

      main.innerHTML = `
        <div class="browse">
          <aside class="cats">
            <input class="field" type="search" placeholder="Filter categories" id="catFilter">
            <div class="cat-list" id="catList">
              ${picks.byDate.length ? `
              <button class="cat special" data-cat="@top">Top picks <span>${picks.byDate.length}</span></button>
              <button class="cat special" data-cat="@popular">Most watched <span>${picks.byPop.length}</span></button>` : ''}
              <button class="cat" data-cat="">Latest added <span>${items.length}</span></button>
              ${usable.map(c => `<button class="cat" data-cat="${esc(c.category_id)}" data-name="${esc(fold(c.category_name))}">${esc(c.category_name)} <span>${counts[c.category_id]}</span></button>`).join('')}
            </div>
          </aside>
          <section class="grid-wrap">
            <div class="grid-head">
              <h2 id="gridTitle"></h2>
              <select class="field sort" id="sort">
                <option value="auto">Default order</option><option value="added">Recently added</option><option value="name">A – Z</option><option value="rating">Top rated</option>
              </select>
            </div>
            <div class="grid" id="grid"></div>
            <div class="sentinel" id="sentinel"></div>
          </section>
        </div>`;

      let current = items, shown = 0;
      const grid = $('#grid', main);
      const sortSel = $('#sort', main);
      const more = () => {
        const slice = current.slice(shown, shown + CHUNK);
        grid.insertAdjacentHTML('beforeend', slice.map(i => this.card(i)).join(''));
        shown += slice.length;
      };
      const show = (cat, name) => {
        let list = cat in virtual ? virtual[cat] : items.filter(i => i.cat === cat);
        const s = sortSel.value;
        if (s === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
        else if (s === 'rating') list = [...list].sort((a, b) => b.rating - a.rating);
        else if (s === 'added') list = [...list].sort((a, b) => b.added - a.added);
        current = list; shown = 0; grid.innerHTML = '';
        $('#gridTitle', main).innerHTML = titles[cat] || esc(name);
        if (!list.length) grid.innerHTML = '<div class="empty"><p>Nothing here yet.</p></div>';
        more();
      };

      $('#catList', main).addEventListener('click', e => {
        const b = e.target.closest('.cat');
        if (!b) return;
        $$('.cat', main).forEach(c => c.classList.toggle('active', c === b));
        this.browseCat = b.dataset.cat;
        show(b.dataset.cat, b.firstChild.textContent.trim());
      });
      sortSel.addEventListener('change', () => {
        const b = $('.cat.active', main);
        show(b.dataset.cat, b.firstChild.textContent.trim());
      });
      $('#catFilter', main).addEventListener('input', e => {
        const q = fold(e.target.value);
        $$('.cat[data-name]', main).forEach(c => { c.hidden = q && !c.dataset.name.includes(q); });
      });
      this.bindCards(grid, (k, id) => byId.get(k + id));

      new IntersectionObserver(es => { if (es[0].isIntersecting && shown < current.length) more(); }, { rootMargin: '800px' })
        .observe($('#sentinel', main));
      const first = $(`.cat[data-cat="${startCat}"]`, main);
      first.classList.add('active');
      show(startCat, '');
      first.focus({ preventScroll: true });
    },

    // ---------- live ----------
    async renderLive(main) {
      this.setBackdrop('');
      const [channels, cats] = await Promise.all([this.loadLive(), this.loadCats('live')]);
      const list = this.allowed(channels);
      const counts = {};
      for (const c of list) counts[c.category_id] = (counts[c.category_id] || 0) + 1;
      const usable = cats.filter(c => counts[c.category_id]);

      main.innerHTML = `
        <div class="live">
          <aside class="cats">
            <input class="field" type="search" placeholder="Filter categories" id="catFilter">
            <div class="cat-list" id="catList">
              ${usable.map(c => `<button class="cat" data-cat="${esc(c.category_id)}" data-name="${esc(fold(c.category_name))}">${esc(c.category_name)} <span>${counts[c.category_id]}</span></button>`).join('')}
            </div>
          </aside>
          <section class="channels">
            <div class="grid-head"><h2 id="chTitle"></h2><input class="field" type="search" placeholder="Find channel" id="chFilter"></div>
            <div class="ch-list" id="chList"></div>
          </section>
          <aside class="guide" id="guide"><div class="guide-empty">Select a channel to see what’s on.</div></aside>
        </div>`;

      let current = [];
      const chList = $('#chList', main);
      const renderChannels = (cat, name, q = '') => {
        current = list.filter(c => String(c.category_id) === cat && (!q || c.key.includes(q)));
        $('#chTitle', main).textContent = name;
        chList.innerHTML = current.map((c, i) => `
          <button class="ch" data-i="${i}">
            <span class="ch-num">${esc(c.num)}</span>
            <span class="ch-logo">${c.stream_icon ? `<img loading="lazy" src="${esc(c.stream_icon)}" alt="">` : ''}</span>
            <span class="ch-name">${esc(c.name)}</span>
            ${Number(c.tv_archive) ? '<span class="chip">Catch-up</span>' : ''}
          </button>`).join('') || '<div class="empty"><p>No channels.</p></div>';
      };
      const pick = b => {
        $$('.cat', main).forEach(c => c.classList.toggle('active', c === b));
        $('#chFilter', main).value = '';
        this.liveCat = b.dataset.cat;
        renderChannels(b.dataset.cat, b.firstChild.textContent.trim());
      };

      $('#catList', main).addEventListener('click', e => { const b = e.target.closest('.cat'); if (b) pick(b); });
      $('#catFilter', main).addEventListener('input', e => {
        const q = fold(e.target.value);
        $$('.cat', main).forEach(c => { c.hidden = q && !c.dataset.name.includes(q); });
      });
      $('#chFilter', main).addEventListener('input', debounce(e => {
        const b = $('.cat.active', main);
        if (b) renderChannels(b.dataset.cat, b.firstChild.textContent.trim(), fold(e.target.value));
      }, 150));

      const guide = $('#guide', main);
      const showGuide = debounce(async ch => {
        guide.innerHTML = `<div class="guide-head">${ch.stream_icon ? `<img src="${esc(ch.stream_icon)}" alt="">` : ''}<h3>${esc(ch.name)}</h3></div><div class="loader small"><span></span></div>`;
        let epg = [];
        try { epg = await this.api.shortEpg(ch.stream_id, 8); } catch {}
        if (!guide.isConnected || this.guideFor !== ch) return;
        const now = Date.now();
        const rows = epg.filter(e => e.end > now);
        $('.loader', guide).outerHTML = rows.length ? `<ol class="epg">${rows.map(e => {
          const live = e.start <= now;
          const pct = live ? ((now - e.start) / (e.end - e.start)) * 100 : 0;
          return `<li class="${live ? 'now' : ''}"><time>${hm(e.start)} – ${hm(e.end)}</time><b>${esc(e.title)}</b>
            ${live ? `<span class="bar"><i style="width:${pct.toFixed(1)}%"></i></span>` : ''}
            ${e.description ? `<p>${esc(e.description)}</p>` : ''}</li>`;
        }).join('')}</ol>` : '<div class="guide-empty">No guide information for this channel.</div>';
      }, 350);

      chList.addEventListener('focusin', e => { const b = e.target.closest('.ch'); if (b) { this.guideFor = current[b.dataset.i]; showGuide(this.guideFor); } });
      chList.addEventListener('click', e => {
        const b = e.target.closest('.ch');
        if (!b) return;
        const index = Number(b.dataset.i);
        const ch = current[index];
        const catName = $('#chTitle', main).textContent;
        Player.open({
          kind: 'live', id: ch.stream_id, title: ch.name, subtitle: catName, list: current, index,
          onZap: c => { const btn = chList.querySelector(`[data-i="${current.indexOf(c)}"]`); btn && btn.focus({ preventScroll: true }); },
        });
      });

      const start = (this.liveCat && $(`.cat[data-cat="${CSS.escape(this.liveCat)}"]`, main)) || $('.cat', main);
      if (start) { pick(start); start.focus({ preventScroll: true }); start.scrollIntoView({ block: 'nearest' }); }
    },

    // ---------- modal ----------
    openModal(html, cls = '') {
      const m = $('#modal');
      this.modalReturn = document.activeElement;
      m.className = 'modal ' + cls;
      m.innerHTML = `<div class="sheet">${html}</div>`;
      m.scrollTop = 0;
      const close = $('[data-close]', m);
      close && close.addEventListener('click', () => this.closeModal());
      document.body.classList.add('modal-open');
      return m;
    },
    closeModal() {
      const m = $('#modal');
      if (m.classList.contains('hidden')) return;
      m.classList.add('hidden');
      m.innerHTML = '';
      document.body.classList.remove('modal-open');
      if (this.modalReturn && this.modalReturn.isConnected) this.modalReturn.focus({ preventScroll: true });
    },
    closeBtn: () => `<button class="round-btn close" data-close aria-label="Close">${ICONS.close}</button>`,

    detailShell(item) {
      return `${this.closeBtn()}
        <div class="detail-bg"></div>
        <div class="detail-body">
          <div class="detail-poster"><span class="ph">${esc(item.name)}</span>${item.img ? `<img src="${esc(item.img)}" alt="">` : ''}</div>
          <div class="detail-info">
            <div class="detail-chips">${[item.kind === 'series' ? '<span class="badge">Series</span>' : '', item.lang && `<span class="chip">${esc(item.lang)}</span>`, item.quality && `<span class="chip">${esc(item.quality)}</span>`].filter(Boolean).join('')}</div>
            <h1 class="detail-title">${esc(item.name)}</h1>
            <div class="detail-meta"></div>
            <p class="detail-plot">${esc(item.plot || '')}</p>
            <div class="detail-actions"></div>
            <div class="detail-extra"></div>
          </div>
        </div>`;
    },

    fillDetail(m, item, t, info) {
      const genres = (t && t.genres.length ? t.genres : String(info.genre || item.genre || '').split(/[,/]/).map(s => s.trim()).filter(Boolean)).slice(0, 3);
      const year = (t && t.year) || item.year || String(info.releasedate || info.releaseDate || '').slice(0, 4);
      const rating = (t && t.rating) || (item.rating ? item.rating.toFixed(1) : '');
      const secs = Number(info.duration_secs) || (t && t.runtime * 60) || 0;
      $('.detail-meta', m).innerHTML = [year && `<span>${esc(year)}</span>`, secs && `<span>${fmtDur(secs)}</span>`, rating && `<span class="rate">${ICONS.star}${esc(rating)}</span>`, genres.length && `<span>${esc(genres.join(' · '))}</span>`].filter(Boolean).join('');
      if (t && t.logo) $('.detail-title', m).innerHTML = `<img class="detail-logo" src="${esc(t.logo)}" alt="${esc(t.title)}">`;
      const plot = (t && t.overview) || info.plot || info.description || item.plot;
      if (plot) $('.detail-plot', m).textContent = plot;
      const bg = (t && t.backdrop) || firstImage(info.backdrop_path) || item.backdrop;
      if (bg) $('.detail-bg', m).style.backgroundImage = `url("${bg}")`;
      const cast = t && t.cast.length ? t.cast : [];
      const extra = [];
      if (cast.length) extra.push(`<h3>Cast</h3><div class="cast">${cast.map(c => `<div class="person"><span class="face">${c.photo ? `<img loading="lazy" src="${esc(c.photo)}" alt="">` : esc(c.name[0])}</span><b>${esc(c.name)}</b><small>${esc(c.role || '')}</small></div>`).join('')}</div>`);
      else if (info.cast) extra.push(`<h3>Cast</h3><p class="muted">${esc(info.cast)}</p>`);
      if (info.director) extra.push(`<p class="muted"><b>Director</b> ${esc(info.director)}</p>`);
      $('.detail-extra', m).insertAdjacentHTML('afterbegin', extra.join(''));
      return { trailer: (t && t.trailer) || info.youtube_trailer || '', backdrop: bg || '' };
    },

    trailerBtn(m, key) {
      if (!key) return;
      const b = document.createElement('button');
      b.className = 'btn ghost';
      b.innerHTML = `${ICONS.trailer}<span>Trailer</span>`;
      b.addEventListener('click', () => {
        const layer = document.createElement('div');
        layer.className = 'trailer';
        layer.innerHTML = `${this.closeBtn()}<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(key)}?autoplay=1&rel=0" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe>`;
        $('.sheet', m).appendChild(layer);
        const c = $('[data-close]', layer);
        c.addEventListener('click', ev => { ev.stopPropagation(); layer.remove(); b.focus(); });
        c.focus();
      });
      $('.detail-actions', m).appendChild(b);
    },

    async openMovie(item, autoplay = false) {
      const m = this.openModal(this.detailShell(item), 'detail');
      $('.detail-actions', m).innerHTML = '<div class="loader small"><span></span></div>';
      $('[data-close]', m).focus();
      const [info, t] = await Promise.all([
        this.api.vodInfo(item.id).catch(() => ({})),
        TMDB.details('movie', item.tmdb),
      ]);
      if (!m.contains($('.detail-actions', m))) return;
      const i = (info && info.info) || {};
      const md = (info && info.movie_data) || {};
      if (!t && i.tmdb_id) Object.assign(item, { tmdb: i.tmdb_id });
      const t2 = t || (i.tmdb_id ? await TMDB.details('movie', i.tmdb_id) : null);
      const extra = this.fillDetail(m, item, t2, i);

      const entry = {
        key: 'movie:' + item.id, kind: 'movie', id: item.id, ext: md.container_extension || item.ext,
        title: (t2 && t2.title) || item.name, subtitle: [item.year, item.lang].filter(Boolean).join(' · ') || 'Movie',
        img: (t2 && t2.poster) || item.img, backdrop: extra.backdrop,
      };
      const saved = this.cwGet(entry.key);
      const actions = $('.detail-actions', m);
      actions.innerHTML = saved
        ? `<button class="btn primary" data-a="resume">${ICONS.play}<span>Resume · ${fmtDur(saved.dur - saved.pos)} left</span></button>
           <button class="btn ghost" data-a="start">${ICONS.restart}<span>From start</span></button>`
        : `<button class="btn primary" data-a="start">${ICONS.play}<span>Play</span></button>`;
      this.trailerBtn(m, extra.trailer);
      actions.addEventListener('click', e => {
        const a = e.target.closest('[data-a]');
        if (!a) return;
        this.playEntry({ ...entry, pos: saved ? saved.pos : 0 }, a.dataset.a === 'resume');
      });
      const primary = $('.btn.primary', actions);
      primary.focus();
      if (autoplay) primary.click();
    },

    async openSeries(item) {
      const m = this.openModal(this.detailShell(item), 'detail');
      $('.detail-actions', m).innerHTML = '<div class="loader small"><span></span></div>';
      $('[data-close]', m).focus();
      const [data, t] = await Promise.all([
        this.api.seriesInfo(item.id).catch(() => null),
        TMDB.details('tv', item.tmdb),
      ]);
      if (!m.contains($('.detail-actions', m))) return;
      const info = (data && data.info) || {};
      const extra = this.fillDetail(m, item, t, info);
      const eps = (data && data.episodes) || {};
      const seasons = Object.keys(eps).sort((a, b) => Number(a) - Number(b));
      const title = (t && t.title) || item.name;
      const actions = $('.detail-actions', m);
      if (!seasons.length) {
        actions.innerHTML = '<p class="muted">No episodes available yet.</p>';
        this.trailerBtn(m, extra.trailer);
        return;
      }

      // Provider titles look like "DE - Show (2026) [1080p] - S01E01 - Real title"; keep only the real title.
      const epName = t => {
        const s = String(t || '');
        const m = s.match(/S\d+\s*E\d+\s*(?:[-–:]\s*(.*))?$/i);
        return (m ? m[1] || '' : s).trim();
      };
      const flat = seasons.flatMap(s => asArray(eps[s]).map(e => ({ ...e, season: s, title: epName(e.title) })));
      const epEntry = ep => ({
        key: 'episode:' + ep.id, kind: 'episode', id: ep.id, ext: ep.container_extension || 'mp4', title,
        subtitle: `S${ep.season} · E${ep.episode_num}${ep.title ? ' — ' + ep.title : ''}`,
        img: item.img, backdrop: (ep.info && ep.info.movie_image) || extra.backdrop, seriesId: item.id,
      });
      const playEp = (ep, resume) => {
        const entry = epEntry(ep);
        const saved = this.cwGet(entry.key);
        const next = flat[flat.indexOf(ep) + 1];
        entry.pos = saved ? saved.pos : 0;
        entry.onEnded = next ? () => { this.cwRemove(entry.key); playEp(next, false); } : null;
        this.playEntry(entry, resume);
      };

      // Resume the most recently watched episode, otherwise start at the beginning.
      const last = this.cw().find(e => e.seriesId == item.id);
      const resumeEp = last && flat.find(e => String(e.id) === String(last.id));
      const startEp = resumeEp || flat[0];
      actions.innerHTML = `<button class="btn primary" data-a="play">${ICONS.play}<span>${resumeEp ? 'Resume ' + epEntry(resumeEp).subtitle.split(' — ')[0] : 'Play S' + startEp.season + ' · E' + startEp.episode_num}</span></button>`;
      $('[data-a="play"]', actions).addEventListener('click', () => playEp(startEp, !!resumeEp));
      this.trailerBtn(m, extra.trailer);

      const ex = $('.detail-extra', m);
      ex.insertAdjacentHTML('afterbegin', `
        <div class="seasons">${seasons.map((s, i) => `<button class="season${i === 0 ? ' active' : ''}" data-s="${esc(s)}">Season ${esc(s)}</button>`).join('')}</div>
        <div class="episodes" id="episodes"></div>`);
      const list = $('#episodes', m);
      const renderSeason = s => {
        const items = flat.filter(e => e.season === s);
        list.innerHTML = items.map(ep => {
          const saved = this.cwGet('episode:' + ep.id);
          const img = ep.info && ep.info.movie_image;
          const secs = ep.info && (Number(ep.info.duration_secs) || 0);
          return `<button class="ep" data-id="${esc(ep.id)}">
            <span class="ep-img">${img ? `<img loading="lazy" src="${esc(img)}" alt="">` : ''}<span class="play">${ICONS.play}</span>
              ${saved ? `<span class="bar"><i style="width:${((saved.pos / saved.dur) * 100).toFixed(1)}%"></i></span>` : ''}</span>
            <span class="ep-text"><b>${esc(ep.episode_num)}. ${esc(ep.title || 'Episode ' + ep.episode_num)}</b>
              <small>${secs ? fmtDur(secs) : ''}</small>
              ${ep.info && ep.info.plot ? `<p>${esc(ep.info.plot)}</p>` : ''}</span>
          </button>`;
        }).join('');
      };
      $('.seasons', m).addEventListener('click', e => {
        const b = e.target.closest('.season');
        if (!b) return;
        $$('.season', m).forEach(x => x.classList.toggle('active', x === b));
        renderSeason(b.dataset.s);
      });
      list.addEventListener('click', e => {
        const b = e.target.closest('.ep');
        if (!b) return;
        const ep = flat.find(x => String(x.id) === b.dataset.id);
        playEp(ep, true);
      });
      const firstSeason = resumeEp ? resumeEp.season : seasons[0];
      $$('.season', m).forEach(x => x.classList.toggle('active', x.dataset.s === firstSeason));
      renderSeason(firstSeason);
      $('.btn.primary', actions).focus();
    },

    // ---------- search ----------
    openSearch() {
      const m = this.openModal(`${this.closeBtn()}
        <div class="search-box"><input class="field big" id="q" type="search" placeholder="Search movies, series and channels" autocomplete="off"></div>
        <div id="results"><p class="muted center">Start typing to search.</p></div>`, 'search');
      const q = $('#q', m);
      q.focus();
      const res = $('#results', m);
      let byId = new Map();
      const run = debounce(async () => {
        const term = fold(q.value.trim());
        if (term.length < 2) { res.innerHTML = '<p class="muted center">Start typing to search.</p>'; return; }
        res.innerHTML = '<div class="loader small"><span></span></div>';
        const [vod, series, live] = await Promise.all([this.loadVod(), this.loadSeries(), this.loadLive()]);
        if (fold(q.value.trim()) !== term) return;
        const match = list => list.filter(i => i.key.includes(term)).slice(0, 36);
        const mv = match(this.allowed(vod)), sv = match(series), lv = match(this.allowed(live)).slice(0, 24);
        byId = new Map([...mv, ...sv].map(i => [i.kind + i.id, i]));
        res.innerHTML = (mv.length || sv.length || lv.length) ? [
          lv.length && `<h3>Channels</h3><div class="ch-grid">${lv.map((c, i) => `<button class="ch" data-live="${i}"><span class="ch-logo">${c.stream_icon ? `<img loading="lazy" src="${esc(c.stream_icon)}" alt="">` : ''}</span><span class="ch-name">${esc(c.name)}</span></button>`).join('')}</div>`,
          mv.length && `<h3>Movies</h3><div class="grid">${mv.map(i => this.card(i)).join('')}</div>`,
          sv.length && `<h3>Series</h3><div class="grid">${sv.map(i => this.card(i)).join('')}</div>`,
        ].filter(Boolean).join('') : '<p class="muted center">No results.</p>';
        res.onclick = e => {
          const ch = e.target.closest('[data-live]');
          if (ch) { const index = Number(ch.dataset.live); Player.open({ kind: 'live', id: lv[index].stream_id, title: lv[index].name, subtitle: 'Search', list: lv, index }); }
        };
      }, 250);
      q.addEventListener('input', run);
      this.bindCards(res, (k, id) => byId.get(k + id));
    },

    // ---------- settings ----------
    openSettings() {
      const ui = (this.api && this.api.info && this.api.info.user_info) || {};
      const exp = Number(ui.exp_date) ? new Date(Number(ui.exp_date) * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Never';
      const langs = [['en-US', 'English'], ['fr-FR', 'Français'], ['es-ES', 'Español'], ['de-DE', 'Deutsch'], ['it-IT', 'Italiano'], ['pt-PT', 'Português'], ['nl-NL', 'Nederlands'], ['ar-SA', 'العربية'], ['tr-TR', 'Türkçe']];
      if (!langs.some(l => l[0] === Settings.tmdbLang)) langs.unshift([Settings.tmdbLang, Settings.tmdbLang]);
      const m = this.openModal(`${this.closeBtn()}
        <h2 class="sheet-title">Settings</h2>
        <section class="set-group">
          <h3>Account</h3>
          <div class="kv"><span>Username</span><b>${esc(this.api.username)}</b></div>
          <div class="kv"><span>Status</span><b class="ok">${esc(ui.status || 'Active')}</b></div>
          <div class="kv"><span>Expires</span><b>${esc(exp)}</b></div>
          <div class="kv"><span>Connections</span><b>${esc(ui.active_cons ?? '–')} / ${esc(ui.max_connections ?? '–')}</b></div>
        </section>
        <section class="set-group">
          <h3>Playback</h3>
          <label class="set"><span>HTTPS relay URL<small>Needed to play video when this site is opened over HTTPS. See README.</small></span>
            <span class="set-row"><input class="field" id="setRelay" type="url" placeholder="https://inkonab-relay.you.workers.dev" value="${esc(Settings.relay)}"><button class="btn ghost" id="testRelay">Test</button></span></label>
          <label class="set"><span>Live stream format<small>HLS works best in browsers; try MPEG-TS if a channel won’t start.</small></span>
            <select class="field" id="setFormat"><option value="m3u8">HLS (.m3u8)</option><option value="ts">MPEG-TS (.ts)</option></select></label>
          <label class="set"><span>Info language<small>Language for summaries and titles from TMDB.</small></span>
            <select class="field" id="setLang">${langs.map(([v, n]) => `<option value="${v}">${esc(n)}</option>`).join('')}</select></label>
          <label class="set toggle"><span>Show adult categories</span><input type="checkbox" id="setAdult"></label>
        </section>
        <section class="set-group">
          <h3>Playlist links</h3>
          <div class="kv link"><span>M3U</span><code>${esc(this.api.m3uUrl())}</code><button class="round-btn sm" data-copy="${esc(this.api.m3uUrl())}" aria-label="Copy M3U link">${ICONS.copy}</button></div>
          <div class="kv link"><span>EPG</span><code>${esc(this.api.epgUrl())}</code><button class="round-btn sm" data-copy="${esc(this.api.epgUrl())}" aria-label="Copy EPG link">${ICONS.copy}</button></div>
        </section>
        <div class="set-actions">
          <button class="btn ghost" id="clearCw">Clear Continue Watching</button>
          <button class="btn danger" id="logout">Sign out</button>
        </div>`, 'settings');

      $('#setFormat', m).value = Settings.liveFormat;
      $('#setLang', m).value = Settings.tmdbLang;
      $('#setAdult', m).checked = Settings.showAdult;
      const save = (k, v) => { Settings[k] = v; Settings.save(); };
      $('#setRelay', m).addEventListener('change', e => save('relay', e.target.value.trim()));
      $('#setFormat', m).addEventListener('change', e => save('liveFormat', e.target.value));
      const resetPicks = () => { delete this.data.moviePicks; delete this.data.seriesPicks; };
      $('#setLang', m).addEventListener('change', e => { save('tmdbLang', e.target.value); TMDB.cache.clear(); resetPicks(); });
      $('#setAdult', m).addEventListener('change', e => { save('showAdult', e.target.checked); resetPicks(); this.route(); });
      $('#testRelay', m).addEventListener('click', async () => {
        save('relay', $('#setRelay', m).value.trim());
        if (!Settings.relay) return this.toast('Enter a relay URL first');
        try {
          const r = await fetch(relayUrl(this.api.apiUrl({})));
          const d = await r.json();
          this.toast(d && d.user_info ? 'Relay works ✓' : 'Relay answered, but not with your account');
        } catch { this.toast('Relay not reachable'); }
      });
      $$('[data-copy]', m).forEach(b => b.addEventListener('click', () => { navigator.clipboard && navigator.clipboard.writeText(b.dataset.copy); this.toast('Copied'); }));
      $('#clearCw', m).addEventListener('click', () => { Store.set('cw', []); this.toast('Cleared'); this.renderContinue(); });
      $('#logout', m).addEventListener('click', () => this.logout());
      $('[data-close]', m).focus();
    },
  };

  window.App = App;
  document.addEventListener('DOMContentLoaded', () => App.boot());
})();
