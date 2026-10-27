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
  const LOCALE = (window.I18N && I18N.locale) || 'en-US';
  const T = window.T || (s => s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // "server.tv:8080" / "http://server.tv:8080/player_api.php?…" → "http://server.tv:8080".
  const normServer = v => {
    v = String(v || '').trim();
    if (!v) return '';
    try { const u = new URL(/^\w+:\/\//.test(v) ? v : 'http://' + v); return u.origin + u.pathname.replace(/\/(player_api|get|xmltv)\.php$/, '').replace(/\/+$/, ''); } catch { return ''; }
  };
  const hm = t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const fmtDur = secs => { secs = Math.round(secs); const h = Math.floor(secs / 3600), m = Math.round((secs % 3600) / 60); return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m} min`; };

  // Tags the provider puts in names, e.g. "FR - Title (2026) (VOSTFR) [4K-Q]".
  const TAG_NAMES = [
    [/^4K(-Q)?$|^UHD$/i, '4K'], [/^(\d{3,4})p$/i, m => m[1] + 'p'],
    [/^VOSTFR$/i, 'VOSTFR'], [/^MULTI[ -]?AUDIO$/i, 'Multi-audio'], [/^(?:[A-Z]+ )?MULTI[ -]?SUB$/i, 'Multi-sub'], [/^MULTI$/i, 'Multi'],
    [/^(?:([A-Z]+) )?ENG[ -]SUB$/i, m => (m[1] ? m[1][0] + m[1].slice(1).toLowerCase() + ' · ' : '') + 'English subs'],
    [/^FHD$/i, '1080p'], [/^H\.?265$|^HEVC$/i, 'H265'],
    [/^L ?Q$/i, 'Low quality'], [/^HQ$/i, 'HQ'], [/^CAM$/i, 'CAM'], [/^REC$/i, 'Recording'], [/^Бг Аудио$/i, 'Bulgarian audio'],
  ];
  const tagName = t => {
    for (const [re, out] of TAG_NAMES) { const m = t.trim().match(re); if (m) return typeof out === 'function' ? out(m) : out; }
    return '';
  };
  const QUALITY_RANK = { '4K': 0, '1080p': 1, '720p': 2, '480p': 3 };

  function parseName(raw) {
    let s = String(raw || '').trim();
    let lang = '', year = '';
    const tags = [];
    const m = s.match(/^([A-Z]{2,4}(?:-[A-Z]{2})?)\s*[-|:]\s+/);
    if (m) { lang = m[1]; s = s.slice(m[0].length); }
    s = s.replace(/\[([^\]]*)(?:\]|$)/g, (_, t) => { t.split(/[/|,]/).map(tagName).forEach(x => x && tags.push(x)); return ''; });
    s = s.replace(/\(([^)]*)\)/g, (all, t) => {
      if (/^\d{4}$/.test(t)) { year = year || t; return ''; }
      const tag = tagName(t);
      if (tag) { tags.push(tag); return ''; }
      return /^[A-Z]{2}$/.test(t) ? '' : all; // two-letter country of origin, e.g. (GB)
    });
    s = s.replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').trim();
    const quality = tags.find(t => t in QUALITY_RANK) || '';
    return { title: s || String(raw || ''), lang, year, quality, tags: [...new Set(tags.filter(t => t !== quality))] };
  }

  // Live names look like "FR: TF1 [4K-Q]", "SP: BEIN SPORTS 1 LQ [1080p]".
  function parseChannel(raw) {
    let s = String(raw || '').trim();
    const tags = [];
    s = s.replace(/\[([^\]]*)(?:\]|$)/g, (_, t) => { t.split(/[/|,]/).map(tagName).forEach(x => x && tags.push(x)); return ''; });
    s = s.replace(/(^|\s)(H\.?265|HEVC|LQ|4K|UHD|FHD)(?=\s|$)/gi, (_, sp, w) => { tags.push(tagName(w)); return sp; });
    const label = s.replace(/\s{2,}/g, ' ').trim() || String(raw || '');
    const quality = tags.find(t => t in QUALITY_RANK) || '';
    return { label, quality, tags: [...new Set(tags.filter(t => t && t !== quality))] };
  }
  // Categories are split by quality ("FR: FRANCE [4K-Q]", "FR: FRANCE [720p]"); merge them.
  const liveCatKey = name => String(name || '').replace(/\[\s*(?:\d{3,4}p|4K(?:-Q)?|UHD|FHD|HD|SD|H\.?265|HEVC)\s*\]/gi, '').replace(/\s{2,}/g, ' ').trim();
  // Which copy of a channel plays first: 1080p, then 4K, 720p…; H265 and low quality last.
  const liveRank = c => ({ '1080p': 0, '4K': 1, '720p': 2, '480p': 3 }[c.quality] ?? 4) + (c.tags.includes('H265') ? 3 : 0) + (c.tags.includes('Low quality') ? 6 : 0);

  const LANG_NAMES = { QFR: 'French (Canada)', EX: 'Ex-Yugoslav', IN: 'Indian', SOM: 'Somali', PK: 'Pakistani', MA: 'Moroccan', AL: 'Albanian' };
  let langNamer;
  function langName(code) {
    if (!code) return 'Original';
    if (LANG_NAMES[code]) return LANG_NAMES[code];
    try { langNamer = langNamer || new Intl.DisplayNames(['en'], { type: 'language' }); return langNamer.of(code.toLowerCase()) || code; } catch { return code; }
  }

  // Keep one entry per title (versions are grouped by TMDB id, see App.group).
  const uniq = list => { const seen = new Set(); return list.filter(i => !seen.has(i.gkey) && seen.add(i.gkey)); };

  function firstImage(v) {
    if (Array.isArray(v)) return v[0] || '';
    if (typeof v === 'string' && v.startsWith('[')) { try { return JSON.parse(v.replace(/'/g, '"'))[0] || ''; } catch { return ''; } }
    return v || '';
  }

  // Normalise Xtream VOD / series entries into one card model.
  function fromVod(v) {
    const n = parseName(v.name);
    return { kind: 'movie', id: v.stream_id, name: n.title, raw: v.name, lang: n.lang, year: n.year, quality: n.quality, tags: n.tags,
      img: v.stream_icon || '', added: Number(v.added) || 0, rating: parseFloat(v.rating) || 0, tmdb: v.tmdb || v.tmdb_id || '',
      ext: v.container_extension || 'mp4', cat: String(v.category_id), adult: Number(v.is_adult) === 1, key: fold(v.name) };
  }
  function fromSeries(s) {
    const n = parseName(s.name);
    return { kind: 'series', id: s.series_id, name: n.title, raw: s.name, lang: n.lang, year: n.year || (s.releaseDate || '').slice(0, 4), quality: n.quality, tags: n.tags,
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

      this.watchNetwork();

      const creds = Store.get('creds');
      if (!creds) return this.showLogin();
      this.showSplash(true);
      try {
        await this.connect(creds);
        this.start();
      } catch (err) {
        this.showLogin(this.loginError(err, creds));
      } finally {
        this.showSplash(false);
      }
    },

    // creds: { u, p, s? } for an Xtream account (s: server, player mode only) or { m } for an M3U link.
    async connect(creds) {
      const api = creds.m ? new M3UPlaylist(creds.m) : new Xtream(creds.s || Settings.server, creds.u, creds.p);
      await api.login();
      this.api = api;
      this.data = {};
    },

    loginError(err, creds) {
      if (err.message !== 'Failed to fetch' && !/^Playlist \d/.test(err.message)) return err.message;
      return creds && creds.m ? 'Can’t load the playlist. Check the link and your connection.' : 'Can’t reach the server. Check your connection.';
    },

    showSplash(on) { $('#splash').classList.toggle('hidden', !on); },

    // Sign-in modes: "xtream" (username/password; plus the server address in player mode),
    // "m3u" (player mode) and "remote" (filled in from a phone, when CFG.pairApi is set).
    loginModes() {
      return ['xtream', ...(CFG.playerMode ? ['m3u'] : []), ...(CFG.pairApi ? ['remote'] : [])];
    },

    showLogin(error) {
      $('#app').classList.add('hidden');
      $('#login').classList.remove('hidden');
      $('#loginError').textContent = error || '';
      this.renderFree($('#freeLogin'));
      if (CFG.playerMode) {
        $('#loginSub').textContent = 'Add your playlist';
        $('#loginNote').hidden = false;
      }
      const modes = this.loginModes();
      $('#loginModes').hidden = modes.length < 2;
      $('#loginForm').classList.toggle('wide', modes.length > 1);
      $$('.login-mode').forEach(b => { b.hidden = !modes.includes(b.dataset.mode); });
      if (!$('#loginModes').dataset.bound) {
        $('#loginModes').dataset.bound = '1';
        $('#loginModes').addEventListener('click', e => { const b = e.target.closest('.login-mode'); if (b) this.setLoginMode(b.dataset.mode, true); });
      }
      const creds = Store.get('creds');
      if (creds) {
        if (creds.m) $('#loginM3u').value = creds.m;
        if (creds.u) $('#loginUser').value = creds.u;
        if (creds.s) $('#loginServer').value = creds.s;
      }
      this.setLoginMode(creds && creds.m && modes.includes('m3u') ? 'm3u' : 'xtream');
    },

    setLoginMode(mode, fromClick) {
      this.loginMode = mode;
      $$('.login-mode').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
      const show = { server: mode === 'xtream' && !!CFG.playerMode, xtream: mode === 'xtream', m3u: mode === 'm3u', remote: mode === 'remote', form: mode !== 'remote' };
      $$('#loginForm [data-for]').forEach(el => { el.hidden = !show[el.dataset.for]; });
      $('#loginForm').classList.toggle('has-pair', mode === 'remote');
      if (fromClick) $('#loginError').textContent = '';
      if (mode === 'remote') this.startPair(); else this.stopPair();
      if (fromClick) return;
      const first = mode === 'm3u' ? '#loginM3u'
        : [CFG.playerMode && '#loginServer', '#loginUser', '#loginPass'].filter(Boolean).find(sel => !$(sel).value) || '#loginPass';
      setTimeout(() => $(mode === 'remote' ? '.login-mode.active' : first).focus(), 50);
    },

    // What the form holds, or an error message.
    formCreds() {
      if (this.loginMode === 'm3u') {
        const m = $('#loginM3u').value.trim();
        if (!m) return 'Enter the playlist link.';
        // An Xtream "get.php" playlist link: sign in to the account itself (movies, series, guide).
        try {
          const u = new URL(/^\w+:\/\//.test(m) ? m : 'http://' + m);
          const user = u.searchParams.get('username'), pass = u.searchParams.get('password');
          if (/\/get\.php$/.test(u.pathname) && user && pass) return { s: u.origin, u: user, p: pass };
          return { m: u.toString() };
        } catch { return 'Enter the playlist link.'; }
      }
      const u = $('#loginUser').value.trim(), p = $('#loginPass').value;
      if (!CFG.playerMode) return u && p ? { u, p } : 'Enter your username and password.';
      const s = normServer($('#loginServer').value);
      return s && u && p ? { s, u, p } : 'Enter the server address, username and password.';
    },

    async submitLogin(e) {
      e.preventDefault();
      const c = this.formCreds();
      if (typeof c === 'string') { $('#loginError').textContent = c; return; }
      await this.signIn(c);
    },

    async signIn(c) {
      const btn = $('#loginBtn');
      btn.disabled = true; btn.textContent = 'Signing in…';
      $('#loginError').textContent = '';
      try {
        await this.connect(c);
        Store.del('creds');
        Store.set('creds', c, !$('#loginRemember').checked);
        $('#loginPass').value = '';
        this.stopPair();
        this.start();
      } catch (err) {
        $('#loginError').textContent = this.loginError(err, c);
        if (this.loginMode === 'remote') this.setLoginMode(c.m ? 'm3u' : 'xtream');
      } finally {
        btn.disabled = false; btn.textContent = 'Sign in';
      }
    },

    // ---------- remote setup: the TV shows a code, someone fills the account in from a phone ----------
    // CFG.pairApi is the pairing worker (proxy/pair-worker.js); CFG.setupUrl the page that sends to it.
    // opts.box: element holding .pair-url / .pair-code / .pair-qr / .pair-note (the sign-in screen by
    // default); opts.onData(d): what to do with what the phone sent (sign in by default).
    async startPair(opts = {}) {
      this.stopPair();
      const run = this.pairRun = {};
      const box = opts.box || $('#loginForm .pair');
      const el = c => box.querySelector('.pair-' + c);
      const note = el('note');
      el('url').textContent = CFG.setupUrl.replace(/^https?:\/\//, '');
      el('code').textContent = '…';
      el('qr').removeAttribute('src');
      note.textContent = 'Getting a code…';
      let pair;
      try {
        const r = await fetch(CFG.pairApi.replace(/\/+$/, '') + '/pair', { method: 'POST' });
        if (!r.ok) throw new Error(r.status);
        pair = await r.json();
      } catch {
        if (run !== this.pairRun) return;
        note.textContent = 'Remote setup isn’t available right now. Try again later.';
        run.timer = setTimeout(() => run === this.pairRun && this.startPair(opts), 20000);
        return;
      }
      if (run !== this.pairRun) return;
      el('code').textContent = pair.code.slice(0, 3) + '-' + pair.code.slice(3);
      note.textContent = 'or scan the QR code. The code works once and changes every 15 minutes.';
      try {
        const qr = qrcode(0, 'M');
        qr.addData(CFG.setupUrl + '#' + pair.code);
        qr.make();
        el('qr').src = qr.createDataURL(6, 0);
      } catch {}
      const until = Date.now() + (pair.ttl || 900) * 1000 - 5000;
      const poll = async () => {
        if (run !== this.pairRun) return;
        if (Date.now() > until) return this.startPair(opts);
        try {
          const r = await fetch(`${CFG.pairApi.replace(/\/+$/, '')}/pair/${pair.code}?token=${encodeURIComponent(pair.token)}`, { cache: 'no-store' });
          if (r.status === 200) {
            const d = await r.json();
            if (run !== this.pairRun) return;
            this.pairRun = null;
            if (opts.onData) return opts.onData(d);
            const c = d.m ? { m: d.m } : { s: CFG.playerMode ? normServer(d.s) : undefined, u: d.u, p: d.p };
            if (c.m) $('#loginM3u').value = c.m; else { $('#loginUser').value = c.u || ''; if (c.s) $('#loginServer').value = c.s; }
            note.textContent = 'Received — signing in…';
            return this.signIn(c);
          }
        } catch {}
        run.timer = setTimeout(poll, 3000);
      };
      poll();
    },

    stopPair() {
      if (this.pairRun) clearTimeout(this.pairRun.timer);
      this.pairRun = null;
    },

    // ---------- extra playlists (the viewer's own M3U links, shown on top of Live TV) ----------
    async addExtraPlaylist(name, url) {
      url = String(url || '').trim();
      if (!/^\w+:\/\//.test(url)) url = 'http://' + url;
      name = String(name || '').trim().slice(0, 40) || 'My playlist';
      const list = await M3U.load(url);
      if (!list.length) throw new Error('This playlist is empty');
      Settings.extraPlaylists = [...(Settings.extraPlaylists || []).filter(p => p.url !== url && p.name !== name), { name, url }];
      Settings.save();
      this.extraChanged();
      this.toast('Playlist added: ' + name);
    },

    removeExtraPlaylist(i) {
      Settings.extraPlaylists = (Settings.extraPlaylists || []).filter((p, n) => n !== i);
      Settings.save();
      this.extraChanged();
    },

    extraChanged() {
      this.free = null;
      delete this.data.liveCatalog;
      this.redrawLater = true;
    },

    // Settings section: list, add by hand, or add from a phone with a code.
    bindExtraPlaylists(m) {
      const list = $('#xpList', m), note = $('#xpError', m);
      const paint = () => {
        const xs = Settings.extraPlaylists || [];
        list.innerHTML = xs.length ? xs.map((p, i) => `<div class="kv link"><span>${esc(p.name)}</span><code>${esc(p.url)}</code>
          <button class="round-btn sm" data-xp-del="${i}" aria-label="Remove">${ICONS.close}</button></div>`).join('')
          : '<p class="muted small-note">No extra playlists yet.</p>';
      };
      paint();
      list.addEventListener('click', e => {
        const b = e.target.closest('[data-xp-del]');
        if (!b) return;
        this.removeExtraPlaylist(Number(b.dataset.xpDel));
        paint();
        $('#xpAdd', m).focus();
      });
      const add = async (name, url) => {
        note.textContent = 'Checking the playlist…';
        try {
          await this.addExtraPlaylist(name, url);
          note.textContent = '';
          $('#xpName', m).value = ''; $('#xpUrl', m).value = '';
          paint();
        } catch (err) {
          note.textContent = err.message === 'This playlist is empty' ? err.message : 'Can’t load the playlist. Check the link and your connection.';
        }
      };
      $('#xpAdd', m).addEventListener('click', () => {
        if (!$('#xpUrl', m).value.trim()) { note.textContent = 'Enter the playlist link.'; return; }
        add($('#xpName', m).value, $('#xpUrl', m).value);
      });
      const phone = $('#xpPhone', m);
      if (phone) phone.addEventListener('click', () => {
        const box = $('#xpPair', m);
        box.hidden = false;
        this.startPair({
          box,
          onData: d => {
            box.hidden = true;
            if (!d.m) { note.textContent = 'Send an M3U playlist link from the phone.'; return; }
            add(d.name, d.m);
          },
        });
      });
    },

    // ---------- network lost / back ----------
    watchNetwork() {
      const box = document.createElement('div');
      box.className = 'net-down';
      box.hidden = true;
      box.setAttribute('role', 'alert');
      box.innerHTML = '<b>No network connection</b><span>Check your TV’s network settings. The app continues by itself when the connection is back.</span>';
      document.body.appendChild(box);
      const down = () => { box.hidden = false; };
      const up = () => {
        if (box.hidden) return;
        box.hidden = true;
        this.toast('Connection restored');
        if (Player.isOpen() && Player.el.dataset.state === 'error') Player.play({ ...Player.item, tried: null });
        else if (this.api && $('#view .empty #retry')) this.route();
      };
      window.addEventListener('offline', down);
      window.addEventListener('online', up);
      if (navigator.onLine === false) down();
    },

    // ---------- parental PIN ----------
    // Resolves true when the right PIN is entered (or a new one is created twice), false on cancel.
    askPin(mode) {
      return new Promise(resolve => {
        const steps = mode === 'create' ? ['Create a 4-digit PIN', 'Enter the PIN again'] : [mode === 'change' ? 'Enter your current PIN' : 'Enter your parental PIN'];
        let step = 0, digits = '', first = '';
        const back = document.activeElement;
        const dlg = document.createElement('div');
        dlg.className = 'pin-dlg';
        dlg.innerHTML = `<div class="pin-card" role="dialog" aria-modal="true">
          <h3 class="pin-title"></h3><p>Use the number keys or the keypad below.</p>
          <div class="pin-dots"><i></i><i></i><i></i><i></i></div><p class="pin-err"></p>
          <div class="pin-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button type="button" data-d="${n}">${n}</button>`).join('')}
            <button type="button" data-d="del" aria-label="Delete">⌫</button><button type="button" data-d="0">0</button><button type="button" data-d="cancel" aria-label="Cancel">✕</button></div>
          <button type="button" class="btn ghost" data-d="cancel">Cancel</button></div>`;
        document.body.appendChild(dlg);
        const paint = () => {
          $('.pin-title', dlg).textContent = steps[step];
          $$('.pin-dots i', dlg).forEach((d, i) => d.classList.toggle('on', i < digits.length));
        };
        const done = ok => {
          document.removeEventListener('keydown', onKey, true);
          dlg.remove();
          if (back && back.isConnected) back.focus();
          resolve(ok);
        };
        const fail = msg => { $('.pin-err', dlg).textContent = msg; digits = ''; paint(); };
        const press = d => {
          if (d === 'cancel') return done(false);
          if (d === 'del') { digits = digits.slice(0, -1); return paint(); }
          if (digits.length >= 4) return;
          if (!digits) $('.pin-err', dlg).textContent = '';
          digits += d;
          paint();
          if (digits.length < 4) return;
          setTimeout(() => {
            if (mode !== 'create') return digits === Settings.adultPin ? done(true) : fail('Wrong PIN');
            if (step === 0) { first = digits; step = 1; digits = ''; $('.pin-err', dlg).textContent = ''; return paint(); }
            if (digits !== first) { step = 0; return fail('The PINs don’t match'); }
            Settings.adultPin = digits;
            Settings.save();
            this.toast('PIN saved');
            done(true);
          }, 150);
        };
        const onKey = e => {
          if (/^[0-9]$/.test(e.key)) { e.preventDefault(); e.stopImmediatePropagation(); press(e.key); }
          else if (e.key === 'Escape' || e.key === 'BrowserBack' || e.key === 'GoBack') { e.preventDefault(); e.stopImmediatePropagation(); done(false); }
          else if (e.key === 'Backspace' && !e.target.matches('input')) { e.preventDefault(); e.stopImmediatePropagation(); press('del'); }
        };
        document.addEventListener('keydown', onKey, true);
        dlg.addEventListener('click', e => { const b = e.target.closest('[data-d]'); if (b) press(b.dataset.d); });
        paint();
        $('[data-d="1"]', dlg).focus();
      });
    },

    logout() {
      Store.del('creds');
      Disk.clear();
      this.api = null;
      this.data = {};
      this.closeModal();
      location.hash = '';
      this.showLogin();
    },

    // Saved playlists were refreshed in the background: rebuild from the new data, forget what the
    // provider removed, and redraw the page (later, if a dialog or the player is open).
    async onCatalogRefreshed() {
      this.data = {};
      this.epgCache = null;
      try { await this.pruneRemoved(); } catch (e) { console.warn('[refresh]', e); }
      if (Player.isOpen() || !$('#modal').classList.contains('hidden')) this.redrawLater = true;
      else this.redraw();
      this.toast('Playlist updated');
    },

    // Drop favorites, history, Continue Watching and My List entries whose channel or title is gone.
    // A list that comes back empty (a provider glitch) removes nothing.
    async pruneRemoved() {
      const [cat, vod, series] = await Promise.all([this.liveCatalog(), this.loadVod().catch(() => []), this.loadSeries().catch(() => [])]);
      const fav = Store.get('fav', {});
      const keep = (list, set) => (set.size ? (list || []).filter(k => set.has(k)) : list);
      const movieKeys = new Set(vod.map(i => i.gkey)), seriesKeys = new Set(series.map(i => i.gkey));
      Object.assign(fav, { live: keep(fav.live, cat.byKey), movie: keep(fav.movie, movieKeys), series: keep(fav.series, seriesKeys) });
      Store.set('fav', fav);
      if (cat.byKey.size) Store.set('recentLive', this.recentLive().filter(k => cat.byKey.has(k)));
      const movieIds = new Set(vod.map(i => String(i.id))), seriesIds = new Set(series.map(i => String(i.id)));
      Store.set('cw', this.cw().filter(e =>
        e.kind === 'movie' ? !movieIds.size || movieIds.has(String(e.id))
          : e.kind === 'episode' ? !seriesIds.size || seriesIds.has(String(e.seriesId)) : true));
      // The channel playing now zaps through the new list.
      const it = Player.isOpen() && Player.item;
      if (it && it.kind === 'live' && it.list) {
        const groups = await this.liveGroups();
        const g = groups.find(x => x.key === it.groupKey);
        if (g) {
          const cur = it.list[it.index];
          it.list = g.channels;
          it.index = cur ? g.channels.findIndex(c => c.gkey === cur.gkey) : -1;
        }
      }
    },

    // Redraw the current page, keeping the focus on the same item when it still exists.
    async redraw() {
      this.redrawLater = false;
      const a = document.activeElement;
      const attrs = a && a.closest && $('#view').contains(a) ? [...a.attributes].filter(x => x.name.startsWith('data-')) : [];
      const y = window.scrollY;
      await this.route();
      window.scrollTo(0, y);
      const sel = attrs.map(x => `[${x.name}="${CSS.escape(x.value)}"]`).join('');
      const back = sel && $('#view ' + sel);
      if (back) back.focus({ preventScroll: true });
    },

    start() {
      if (!this.catalogHooked) {
        this.catalogHooked = true;
        window.addEventListener('inkonab:catalog', () => this.onCatalogRefreshed());
        // Long sessions (a TV left on): refresh the saved playlists every 6 hours.
        setInterval(() => this.api && this.api.refreshAll(), 6 * 3600e3);
      }
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
      $('#date').textContent = new Date().toLocaleDateString(LOCALE, { weekday: 'long', month: 'long', day: 'numeric' });
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
      this.view = ['home', 'live', 'guide', 'movies', 'series'].includes(view) ? view : 'home';
      $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === this.view));
      $('.home-btn').classList.toggle('active', this.view === 'home');
      document.body.dataset.view = this.view;
      window.scrollTo(0, 0);
      const main = $('#view');
      main.innerHTML = '<div class="loader"><span></span></div>';
      const render = { home: this.renderHome, live: this.renderLive, guide: this.renderGuide, movies: this.renderMovies, series: this.renderSeries }[this.view];
      return render.call(this, main).catch(err => {
        console.error(err);
        main.innerHTML = `<div class="empty"><h3>Couldn’t load this page</h3><p>${esc(err.message)}</p><button class="btn" id="retry">Try again</button></div>`;
        $('#retry').addEventListener('click', () => this.route());
      });
    },

    onPlayerClosed() {
      if (this.redrawLater && $('#modal').classList.contains('hidden')) this.redraw();
      else if (this.view === 'home') this.renderContinue();
    },

    // ---------- data ----------
    loadVod() {
      return this.data.vod || (this.data.vod = this.api.vodStreams().then(list => this.group(list.map(fromVod).sort((a, b) => b.added - a.added))));
    },
    loadSeries() {
      return this.data.series || (this.data.series = this.api.seriesList().then(list => this.group(list.map(fromSeries).sort((a, b) => b.added - a.added))));
    },

    // Link every copy of the same title (other languages, 4K, MKV/MP4…) through item.versions,
    // best first: info language, French, English, then by resolution.
    group(list) {
      const order = [Settings.tmdbLang.split('-')[0].toUpperCase(), 'FR', 'QFR', 'EN', ''];
      const langRank = i => { const r = order.indexOf(i.lang); return r < 0 ? order.length : r; };
      const rank = i => langRank(i) * 10 + (QUALITY_RANK[i.quality] ?? 5) + (i.tags.includes('Low quality') || i.tags.includes('CAM') ? 5 : 0);
      const groups = new Map();
      for (const i of list) {
        i.gkey = i.tmdb && i.tmdb !== '0' ? 't' + i.tmdb : 'n' + fold(i.name) + i.year;
        let g = groups.get(i.gkey);
        if (!g) groups.set(i.gkey, (g = []));
        g.push(i);
      }
      for (const g of groups.values()) {
        g.sort((a, b) => rank(a) - rank(b) || b.added - a.added);
        for (const i of g) i.versions = g;
      }
      return list;
    },
    loadLive() {
      // Channels named "✶⋆✶ … ✶⋆✶" are the provider's section dividers, not real channels.
      // Copies of the same channel in other qualities share c.versions (best first).
      return this.data.live || (this.data.live = this.api.liveStreams().then(list => {
        const out = list
          .filter(c => !String(c.name || '').trim().startsWith('✶⋆✶'))
          .map(c => { const p = parseChannel(c.name); return { ...c, ...p, key: fold(c.name), gkey: fold(p.label), adult: Number(c.is_adult) === 1 }; });
        const groups = new Map();
        for (const c of out) { let g = groups.get(c.gkey); if (!g) groups.set(c.gkey, (g = [])); g.push(c); }
        for (const g of groups.values()) {
          g.sort((a, b) => liveRank(a) - liveRank(b));
          for (const c of g) c.versions = g;
        }
        return out;
      }));
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
        // Show each title's best version (see group()).
        const picks = uniq(this.allowed(all).filter(i => top.has(String(i.tmdb)))).map(i => i.versions[0]);
        const meta = i => top.get(String(i.tmdb));
        return {
          byDate: [...picks].sort((a, b) => meta(b).date.localeCompare(meta(a).date) || meta(b).pop - meta(a).pop),
          byPop: [...picks].sort((a, b) => meta(b).pop - meta(a).pop),
        };
      })().catch(() => ({ byDate: [], byPop: [] })));
    },

    // ---------- free playlists — available signed in or not ----------
    // Built-in ones (config.js freePlaylists, e.g. MBC PLAY) and the viewer's own extra M3U
    // playlists (Settings → Extra playlists). Each is a group pinned on top of Live TV.
    loadFree() {
      if (!this.free) {
        const lists = [...(CFG.freePlaylists || []).map(p => ({ ...p, builtin: true })), ...(Settings.extraPlaylists || [])];
        this.free = Promise.all(lists.map(p =>
          M3U.load(p.url).then(list => list.map((c, i) => {
            const ch = { num: i + 1, name: c.name, label: c.name, stream_icon: c.logo, url: c.url, radio: c.radio, source: p.name, builtin: !!p.builtin,
              quality: '', tags: [], key: fold(c.name), gkey: 'free:' + p.name + ':' + fold(c.name) };
            ch.versions = [ch];
            return ch;
          })).catch(err => { console.warn('[free playlist]', p.url, err); return []; })
        )).then(lists => lists.flat());
      }
      return this.free;
    },

    // ---------- live catalog: every group, shared by the Live page and both players ----------
    // Groups: free playlists first, then provider categories (quality-split ones merged).
    liveCatalog() {
      if (!this.data.liveCatalog) {
        this.data.liveCatalog = (async () => {
          const free = await this.loadFree();
          const groups = [...new Set(free.map(c => c.source))].map(src => {
            const channels = free.filter(c => c.source === src);
            return { key: '@free:' + src, name: src, free: true, builtin: channels[0].builtin, channels };
          });
          let catName = {};
          if (this.api) {
            const [channels, cats] = await Promise.all([this.loadLive(), this.loadCats('live')]);
            const merged = new Map();
            for (const c of cats) {
              const key = liveCatKey(c.category_name);
              let m = merged.get(key);
              if (!m) merged.set(key, (m = { key, name: key, ids: new Set() }));
              m.ids.add(String(c.category_id));
            }
            const catOf = Object.fromEntries([...merged.values()].flatMap(m => [...m.ids].map(id => [id, m.key])));
            catName = Object.fromEntries(cats.map(c => [String(c.category_id), c.category_name]));
            const perCat = {};
            for (const c of this.allowed(channels)) {
              const k = catOf[String(c.category_id)];
              if (k) (perCat[k] || (perCat[k] = [])).push(c);
            }
            for (const m of merged.values()) if (perCat[m.key]) groups.push({ key: m.key, name: m.name, channels: uniq(perCat[m.key]) });
          }
          const byKey = new Map();
          for (const g of groups) for (const c of g.channels) if (!byKey.has(c.gkey)) byKey.set(c.gkey, c);
          return { groups, catName, byKey };
        })();
      }
      return this.data.liveCatalog;
    },

    // Catalog groups plus the viewer's Favorites and Recently watched, pinned first.
    async liveGroups() {
      const cat = await this.liveCatalog();
      const pick = keys => keys.map(k => cat.byKey.get(k)).filter(Boolean);
      const fav = pick(this.favs('live')), recent = pick(this.recentLive());
      return [
        ...(fav.length ? [{ key: '@fav', name: 'Favorites', special: true, channels: fav }] : []),
        ...(recent.length ? [{ key: '@recent', name: 'Recently watched', special: true, channels: recent }] : []),
        ...cat.groups,
      ];
    },

    // Play list[index]; group = {key, name} is what the player's channel list opens on.
    playChannel(list, index, group = {}, version) {
      const ch = list[index];
      const v = version || ch.versions[0];
      Player.open({
        kind: 'live', id: v.stream_id, url: v.url, radio: v.radio, img: v.stream_icon, title: ch.label,
        subtitle: group.name || ch.source || '', version: v, list, index, groupKey: group.key,
      });
    },

    // Called by both players when live playback ends: reopen Live TV on what was watched.
    afterLive(groupKey, gkey) {
      if (groupKey && !groupKey.startsWith('@now')) this.liveCat = groupKey;
      this.liveFocus = gkey;
      if (this.view === 'live') this.route();
    },

    // A titled row of channel tiles; click plays that channel with the row as its zapping list.
    channelRow(title, list, group, note = '') {
      if (!list.length) return '';
      const [a, ...b] = T(title).split(' ');
      return `<section class="row free-row" data-group="${esc(group.key)}"><h2><b>${esc(a)}</b> ${esc(b.join(' '))}${note ? ` <small class="free-note">${esc(note)}</small>` : ''}</h2>
        <div class="row-scroll">${list.map((c, i) => `
          <button class="tile${c.radio ? ' is-radio' : ''}" data-ch="${i}">
            <span class="tile-logo">${c.stream_icon ? `<img loading="lazy" src="${esc(c.stream_icon)}" alt="">` : ''}<span class="ph">${esc(c.label)}</span><span class="play">${ICONS.play}</span></span>
            <span class="tile-name">${this.isFav('live', c.gkey) ? '<span class="fav-star">★</span>' : ''}${esc(c.label)}${c.radio ? ' <span class="chip">Radio</span>' : ''}</span>
          </button>`).join('')}</div></section>`;
    },

    bindChannelRows(slot, rows) {
      slot.onclick = e => {
        const b = e.target.closest('[data-ch]');
        const sec = b && b.closest('[data-group]');
        const row = sec && rows.find(r => r.group.key === sec.dataset.group);
        if (row) this.playChannel(row.list, Number(b.dataset.ch), row.group);
      };
    },

    // Free playlists (sign-in screen and Home), plus Favorite / Recent channels on Home.
    async renderFree(slot, withMine = false) {
      const groups = withMine ? await this.liveGroups().catch(() => []) : (await this.liveCatalog()).groups.filter(g => g.free);
      if (!slot.isConnected) return;
      const rows = groups.filter(g => g.free || (withMine && g.special)).map(g => ({ group: g, list: g.channels }));
      slot.innerHTML = rows.map(r => this.channelRow(
        r.group.key === '@fav' ? 'Favorite channels' : r.group.key === '@recent' ? 'Recently watched channels' : r.group.name,
        r.list, r.group, r.group.free ? (r.group.builtin ? 'Free · Live TV & radio' : 'Your playlist') : '')).join('');
      this.bindChannelRows(slot, rows);
    },

    // ---------- favorites & recently watched ----------
    // fav: { movie: [gkey], series: [gkey], live: [gkey] } — gkeys cover every version of a title/channel.
    favs(kind) { return (Store.get('fav', {})[kind]) || []; },
    isFav(kind, key) { return !!key && this.favs(kind).includes(key); },
    setFav(kind, key, on) {
      const all = Store.get('fav', {});
      const list = (all[kind] || []).filter(k => k !== key);
      if (on) list.unshift(key);
      all[kind] = list.slice(0, 500);
      Store.set('fav', all);
    },
    toggleFav(kind, key, name) {
      const on = !this.isFav(kind, key);
      this.setFav(kind, key, on);
      this.toast(on ? `★ ${name || 'Added'} — added to ${kind === 'live' ? 'Favorites' : 'My List'}` : `Removed from ${kind === 'live' ? 'Favorites' : 'My List'}`);
      return on;
    },
    recentLive() { return Store.get('recentLive', []); },
    pushRecent(gkey) {
      if (!gkey) return;
      Store.set('recentLive', [gkey, ...this.recentLive().filter(k => k !== gkey)].slice(0, 30));
    },

    // Remote number keys: find a channel by its number, preferring the group being watched.
    async findChannelByNum(num, list) {
      const want = String(num);
      const inList = (list || []).findIndex(c => String(c.num) === want);
      if (inList >= 0) return { list, index: inList };
      for (const g of (await this.liveCatalog()).groups) {
        const i = g.channels.findIndex(c => String(c.num) === want);
        if (i >= 0) return { list: g.channels, index: i, group: g };
      }
      return null;
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
      const versions = item.versions || [item];
      const langs = [...new Set(versions.map(v => v.lang).filter(Boolean))];
      const has4k = versions.some(v => v.quality === '4K');
      const sub = [item.year, langs.slice(0, 3).join(' · ') + (langs.length > 3 ? ` +${langs.length - 3}` : '')].filter(Boolean).join('  •  ');
      return `<button class="card${series ? ' is-series' : ''}" data-kind="${item.kind}" data-id="${item.id}">
        <span class="poster">
          <span class="ph">${esc(item.name)}</span>
          ${item.img ? `<img loading="lazy" src="${esc(item.img)}" alt="">` : ''}
          ${series ? '<span class="badge">Series</span>' : ''}
          ${has4k ? '<span class="q">4K</span>' : ''}
          ${this.isFav(item.kind, item.gkey) ? '<span class="fav-badge" title="In My List">★</span>' : ''}
          ${versions.length > 1 ? `<span class="vcount">${versions.length} versions</span>` : ''}
          <span class="play">${ICONS.play}</span>
        </span>
        <span class="card-title">${esc(item.name)}</span>
        ${sub ? `<span class="card-sub">${esc(sub)}</span>` : ''}
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
      const [a, ...b] = T(title).split(' ');
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
      const movies = uniq(this.allowed(vod)), shows = uniq(series);
      // Two movies, then one series, so both show up even when one side is updated more often.
      const latest = [];
      for (let i = 0; latest.length < 30 && i < 30; i++) {
        latest.push(...movies.slice(i * 2, i * 2 + 2));
        if (shows[i]) latest.push(shows[i]);
      }
      const topRated = movies.slice(0, 3000).filter(m => m.rating >= 7.5).slice(0, 30);
      const recentSeries = shows.slice(0, 30);
      // My List: favorite movies and series, newest first.
      const byG = new Map([...movies, ...shows].map(i => [i.kind + i.gkey, i]));
      const myList = Store.get('fav', {});
      const mine = [...(myList.series || []).map(k => byG.get('series' + k)), ...(myList.movie || []).map(k => byG.get('movie' + k))].filter(Boolean);
      const index = new Map([...latest, ...topRated, ...recentSeries, ...mine].map(i => [i.kind + i.id, i]));

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
          ${this.row('My List', mine)}
          <div id="freeSlot"></div>
          <div id="popSlot"></div>
          ${this.row('Top rated', topRated)}
          ${this.row('New episodes', recentSeries)}
        </div>`;

      const lookup = (k, id) => index.get(k + id);
      this.bindCards($('.rows', main), lookup, item => this.setHero(item));
      $('[data-hero="play"]', main).addEventListener('click', () => this.heroItem && (this.heroItem.kind === 'series' ? this.openSeries(this.heroItem) : this.openMovie(this.heroItem, true)));
      $('[data-hero="info"]', main).addEventListener('click', () => this.heroItem && (this.heroItem.kind === 'series' ? this.openSeries(this.heroItem) : this.openMovie(this.heroItem)));
      this.renderContinue();
      this.renderFree($('#freeSlot', main), true);
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
      const perCat = {};
      for (const i of items) (perCat[i.cat] || (perCat[i.cat] = new Set())).add(i.gkey);
      const counts = Object.fromEntries(Object.entries(perCat).map(([k, v]) => [k, v.size]));
      const usable = cats.filter(c => counts[c.category_id]);
      const byId = new Map(items.map(i => [i.kind + i.id, i]));
      const label = kind === 'movie' ? 'Movies' : 'Series';
      const latest = uniq(items);
      const byGkey = new Map(latest.map(i => [i.gkey, i]));
      const mine = () => this.favs(kind).map(k => byGkey.get(k)).filter(Boolean);
      const virtual = { '': latest, '@top': picks.byDate, '@popular': picks.byPop };
      const titles = { '': `<b>Latest</b> ${label.toLowerCase()}`, '@top': `<b>Top</b> picks`, '@popular': `<b>Most</b> watched`, '@fav': `<b>My</b> List` };
      const startCat = picks.byDate.length ? '@top' : '';

      main.innerHTML = `
        <section class="slider" id="slider" aria-roledescription="carousel"></section>
        <div class="browse">
          <aside class="cats">
            <input class="field" type="search" placeholder="Filter categories" id="catFilter">
            <div class="cat-list" id="catList">
              <button class="cat special" data-cat="@fav">★ My List <span>${mine().length}</span></button>
              ${picks.byDate.length ? `
              <button class="cat special" data-cat="@top">Top picks <span>${picks.byDate.length}</span></button>
              <button class="cat special" data-cat="@popular">Most watched <span>${picks.byPop.length}</span></button>` : ''}
              <button class="cat" data-cat="">Latest added <span>${latest.length}</span></button>
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
        let list = cat === '@fav' ? mine() : cat in virtual ? virtual[cat] : uniq(items.filter(i => i.cat === cat));
        const s = sortSel.value;
        if (s === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
        else if (s === 'rating') list = [...list].sort((a, b) => b.rating - a.rating);
        else if (s === 'added') list = [...list].sort((a, b) => b.added - a.added);
        current = list; shown = 0; grid.innerHTML = '';
        $('#gridTitle', main).innerHTML = titles[cat] || esc(name);
        if (!list.length) grid.innerHTML = `<div class="empty"><p>${cat === '@fav' ? 'Nothing in My List yet. Open a title and choose “☆ My List” to add it here.' : 'Nothing here yet.'}</p></div>`;
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
      this.renderSlider($('#slider', main), kind, picks.byDate);
    },

    // Banner carousel: newest TMDB top titles that are in the catalog, with their TMDB backdrops.
    async renderSlider(host, kind, picks) {
      const type = kind === 'movie' ? 'movie' : 'tv';
      const cands = picks.slice(0, 14);
      const details = await Promise.all(cands.map(i => TMDB.details(type, i.tmdb)));
      const slides = cands.map((item, k) => ({ item, t: details[k] })).filter(s => s.t && s.t.backdrop).slice(0, 8);
      if (!host.isConnected) return;
      if (!slides.length) { host.remove(); return; }
      host.innerHTML = `
        <div class="slides">${slides.map(({ item, t }, k) => `
          <div class="slide${k === 0 ? ' on' : ''}"${k === 0 ? '' : ' inert'} style="background-image:url('${esc(t.backdrop.replace('/w1280/', '/original/'))}')">
            <div class="slide-info">
              <div class="slide-kicker">${esc(t.genres.slice(0, 2).join(', ') || (kind === 'movie' ? 'Movie' : 'Series'))}</div>
              <h2 class="slide-title">${t.logo ? `<img src="${esc(t.logo)}" alt="${esc(t.title)}">` : esc(t.title || item.name)}</h2>
              <div class="hero-meta">${[t.year && `<span>${esc(t.year)}</span>`, t.rating && `<span class="rate">${ICONS.star}${esc(t.rating)}</span>`,
                ...[...new Set(item.versions.map(v => v.lang).filter(Boolean))].slice(0, 4).map(l => `<span class="chip">${esc(l)}</span>`),
                item.versions.some(v => v.quality === '4K') && '<span class="chip">4K</span>'].filter(Boolean).join('')}</div>
              <p class="slide-plot">${esc(t.overview || '')}</p>
              <div class="hero-actions">
                <button class="btn primary" data-k="${k}" data-s="play">${ICONS.play}<span>${kind === 'movie' ? 'Watch now' : 'Episodes'}</span></button>
                <button class="btn ghost" data-k="${k}" data-s="info">${ICONS.info}<span>More info</span></button>
              </div>
            </div>
          </div>`).join('')}</div>
        ${slides.length > 1 ? `
        <button class="round-btn slide-nav prev" aria-label="Previous"><svg viewBox="0 0 24 24"><path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <button class="round-btn slide-nav next" aria-label="Next"><svg viewBox="0 0 24 24"><path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <div class="dots">${slides.map((_, k) => `<button class="dot${k === 0 ? ' on' : ''}" data-dot="${k}" aria-label="Slide ${k + 1}"></button>`).join('')}</div>` : ''}`;

      let at = 0;
      const els = $$('.slide', host), dots = $$('.dot', host);
      const go = k => {
        at = (k + slides.length) % slides.length;
        els.forEach((el, i) => { el.classList.toggle('on', i === at); el.inert = i !== at; });
        dots.forEach((d, i) => d.classList.toggle('on', i === at));
      };
      host.addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.dot) go(Number(b.dataset.dot));
        else if (b.classList.contains('prev')) go(at - 1);
        else if (b.classList.contains('next')) go(at + 1);
        else if (b.dataset.s) {
          const item = slides[b.dataset.k].item;
          kind === 'movie' ? this.openMovie(item, b.dataset.s === 'play') : this.openSeries(item);
        }
      });
      const timer = setInterval(() => {
        if (!host.isConnected) return clearInterval(timer);
        if (document.hidden || host.matches(':hover') || host.contains(document.activeElement) || !$('#modal').classList.contains('hidden')) return;
        go(at + 1);
      }, 7000);
    },

    // ---------- live ----------
    async renderLive(main) {
      this.setBackdrop('');
      const [groups, cat] = await Promise.all([this.liveGroups(), this.liveCatalog()]);
      const byKey = new Map(groups.map(g => [g.key, g]));
      const catName = cat.catName;

      main.innerHTML = `
        <div class="live">
          <aside class="cats">
            <input class="field" type="search" placeholder="Filter categories" id="catFilter">
            <div class="cat-list" id="catList">
              ${groups.map(g => `<button class="cat${g.free || g.special ? ' special' : ''}" data-cat="${esc(g.key)}" data-name="${esc(fold(g.name))}">${g.key === '@fav' ? '★ ' : ''}${esc(g.name)} <span>${g.channels.length}</span></button>`).join('')}
            </div>
          </aside>
          <section class="channels">
            <div class="grid-head"><h2 id="chTitle"></h2><input class="field" type="search" placeholder="Find channel" id="chFilter"></div>
            <div class="ch-list" id="chList"></div>
          </section>
          <aside class="guide" id="guide"><div class="guide-empty">Select a channel to see what’s on.</div></aside>
        </div>`;

      const qualities = ch => [...new Set(ch.versions.map(v => v.quality || 'SD'))];
      let current = [], group = null;
      const chList = $('#chList', main);
      const rowHtml = (c, i) => `
          <button class="ch" data-i="${i}">
            <span class="ch-num">${esc(c.num)}</span>
            <span class="ch-logo">${c.stream_icon ? `<img loading="lazy" src="${esc(c.stream_icon)}" alt="">` : ''}</span>
            <span class="ch-name">${esc(c.label)}</span>
            ${this.isFav('live', c.gkey) ? '<span class="fav-star" title="Favorite">★</span>' : ''}
            <span class="ch-q">${c.url ? (c.radio ? '<span class="chip">Radio</span>' : '') : qualities(c).map(t => `<span class="chip">${esc(t)}</span>`).join('')}</span>
            ${c.versions.some(v => Number(v.tv_archive)) ? '<span class="chip">Catch-up</span>' : ''}
          </button>`;
      const renderChannels = (key, q = '') => {
        group = byKey.get(key);
        current = group.channels.filter(c => !q || c.versions.some(v => v.key.includes(q)));
        $('#chTitle', main).textContent = group.name;
        chList.innerHTML = current.map(rowHtml).join('') || '<div class="empty"><p>No channels.</p></div>';
      };
      const pick = b => {
        $$('.cat', main).forEach(c => c.classList.toggle('active', c === b));
        $('#chFilter', main).value = '';
        this.liveCat = b.dataset.cat;
        renderChannels(b.dataset.cat);
      };

      $('#catList', main).addEventListener('click', e => { const b = e.target.closest('.cat'); if (b) pick(b); });
      $('#catFilter', main).addEventListener('input', e => {
        const q = fold(e.target.value);
        $$('.cat', main).forEach(c => { c.hidden = q && !c.dataset.name.includes(q); });
      });
      $('#chFilter', main).addEventListener('input', debounce(e => {
        const b = $('.cat.active', main);
        if (b) renderChannels(b.dataset.cat, fold(e.target.value));
      }, 150));

      const play = (index, version) => this.playChannel(current, index, group, version);

      const guide = $('#guide', main);
      const favBtn = ch => `<button class="btn ghost sm fav-btn" data-fav>${this.isFav('live', ch.gkey) ? '★ In Favorites' : '☆ Add to Favorites'}</button>`;
      const bindFav = (ch, index) => {
        const b = $('[data-fav]', guide);
        b && b.addEventListener('click', () => {
          this.toggleFav('live', ch.gkey, ch.label);
          b.outerHTML = favBtn(ch);
          bindFav(ch, index);
          const row = chList.querySelector(`[data-i="${index}"]`);
          if (row) row.outerHTML = rowHtml(ch, index);
          $('[data-fav]', guide).focus();
        });
      };
      const showGuide = debounce(async index => {
        const ch = current[index];
        const head = `<div class="guide-head">${ch.stream_icon ? `<img src="${esc(ch.stream_icon)}" alt="">` : ''}<h3>${esc(ch.label)}</h3></div>${favBtn(ch)}`;
        if (ch.url) {
          guide.innerHTML = `${head}<div class="guide-empty">${ch.radio ? 'Live radio' : 'Live TV'} from ${esc(ch.source)} — free, no guide information.</div>`;
          bindFav(ch, index);
          return;
        }
        const epgSource = ch.versions.find(v => v.epg_channel_id) || ch.versions[0];
        guide.innerHTML = `${head}
          ${ch.versions.length > 1 ? `<div class="guide-vers"><h4>Versions <span class="muted">${ch.versions.length}</span></h4>
            ${ch.versions.map((v, vi) => `<button class="gver" data-v="${vi}">
              <span class="chip">${esc(v.quality || 'SD')}</span>${v.tags.map(t => `<span class="chip">${esc(t)}</span>`).join('')}
              <small>${esc(catName[String(v.category_id)] || '')}</small>${ICONS.play}</button>`).join('')}</div>` : ''}
          <div class="loader small"><span></span></div>`;
        bindFav(ch, index);
        $$('.gver', guide).forEach(b => b.addEventListener('click', () => play(index, ch.versions[b.dataset.v])));
        // Catch-up channels: the full guide, so recent programmes can be replayed.
        const hasArchive = ch.versions.some(v => Number(v.tv_archive));
        let epg = [];
        try { epg = hasArchive ? await this.epgFor(ch) : await this.api.shortEpg(epgSource.stream_id, 8); } catch {}
        if (!guide.isConnected || this.guideFor !== ch) return;
        const now = Date.now();
        const past = hasArchive ? epg.filter(e => e.end <= now && this.canReplay(ch, e)).slice(-4) : [];
        const rows = [...past, ...epg.filter(e => e.end > now).slice(0, 8)];
        $('.loader', guide).outerHTML = rows.length ? `<ol class="epg">${rows.map(e => {
          const live = e.start <= now && e.end > now, replay = e.end <= now;
          const pct = live ? ((now - e.start) / (e.end - e.start)) * 100 : 0;
          const inner = `<time>${replay ? esc(this.dayLabel(e.start)) + ' · ' : ''}${hm(e.start)} – ${hm(e.end)}</time><b>${replay ? '⟲ ' : ''}${esc(e.title)}</b>
            ${live ? `<span class="bar"><i style="width:${pct.toFixed(1)}%"></i></span>` : ''}
            ${e.description ? `<p>${esc(e.description)}</p>` : ''}`;
          return replay ? `<li class="past"><button class="epg-replay" data-replay="${rows.indexOf(e)}">${inner}<span class="chip">Replay</span></button></li>`
            : `<li class="${live ? 'now' : ''}">${inner}</li>`;
        }).join('')}</ol>${hasArchive ? '<a class="guide-more" href="#guide">Open the TV Guide for the full week ›</a>' : ''}` : '<div class="guide-empty">No guide information for this channel.</div>';
        $$('[data-replay]', guide).forEach(b => b.addEventListener('click', () => this.playCatchup(ch, rows[Number(b.dataset.replay)])));
        const nowRow = $('.epg li.now', guide);
        if (nowRow) nowRow.scrollIntoView({ block: 'nearest' });
      }, 350);

      chList.addEventListener('focusin', e => { const b = e.target.closest('.ch'); if (b) { this.guideFor = current[b.dataset.i]; showGuide(Number(b.dataset.i)); } });
      chList.addEventListener('click', e => { const b = e.target.closest('.ch'); if (b) play(Number(b.dataset.i)); });

      // Reopen on the group (and channel) watched last.
      const start = (this.liveCat && $(`.cat[data-cat="${CSS.escape(this.liveCat)}"]`, main)) || $('.cat', main);
      if (!start) return;
      pick(start);
      start.scrollIntoView({ block: 'nearest' });
      const at = this.liveFocus ? current.findIndex(c => c.gkey === this.liveFocus) : -1;
      this.liveFocus = null;
      const target = at >= 0 ? chList.querySelector(`[data-i="${at}"]`) : start;
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: 'center' });
    },

    // ---------- EPG & catch-up ----------
    // The stream whose guide we read: the catch-up copy when there is one (its guide marks
    // which programmes can be replayed), otherwise one with a guide id.
    epgStream(ch) {
      if (ch.url) return null;
      return ch.versions.find(v => Number(v.tv_archive)) || ch.versions.find(v => v.epg_channel_id) || null;
    },

    // Cached for 20 minutes, at most 6 requests at a time.
    epgFor(ch) {
      const v = this.epgStream(ch);
      if (!v || !this.api) return Promise.resolve([]);
      const cache = this.epgCache || (this.epgCache = new Map());
      const hit = cache.get(v.stream_id);
      if (hit && Date.now() - hit.t < 20 * 60e3) return hit.p;
      const p = this.epgLimit(() => this.api.epgTable(v.stream_id)).catch(() => []);
      cache.set(v.stream_id, { t: Date.now(), p });
      return p;
    },

    epgLimit(job) {
      this.epgQueue = this.epgQueue || [];
      this.epgActive = this.epgActive || 0;
      return new Promise((resolve, reject) => {
        const run = () => {
          this.epgActive++;
          job().then(resolve, reject).finally(() => {
            this.epgActive--;
            const next = this.epgQueue.shift();
            if (next) next();
          });
        };
        if (this.epgActive < 6) run(); else this.epgQueue.push(run);
      });
    },

    canReplay(ch, prog) {
      return !!prog && prog.archive && prog.end <= Date.now() && ch.versions.some(v => Number(v.tv_archive));
    },

    playCatchup(ch, prog) {
      const v = ch.versions.find(x => Number(x.tv_archive));
      const minutes = (prog.end - prog.start) / 60000 + 2;
      Player.open({
        kind: 'catchup', url: this.api.catchupUrl(v.stream_id, prog.start, minutes), relay: true,
        title: prog.title, subtitle: `${ch.label} · ${this.dayLabel(prog.start)} ${hm(prog.start)}–${hm(prog.end)} · Replay`,
        img: ch.stream_icon,
      });
    },

    dayLabel(t) {
      const d = new Date(t), today = new Date();
      const diff = Math.round((new Date(d.toDateString()) - new Date(today.toDateString())) / 864e5);
      if (diff === 0) return 'Today';
      if (diff === -1) return 'Yesterday';
      if (diff === 1) return 'Tomorrow';
      return d.toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' });
    },

    // What happens when a programme is chosen: live now → watch, past + archive → replay.
    playProgramme(list, index, group, prog) {
      const ch = list[index], now = Date.now();
      if (!prog || (prog.start <= now && prog.end > now)) return this.playChannel(list, index, group);
      if (prog.end <= now) {
        if (this.canReplay(ch, prog)) return this.playCatchup(ch, prog);
        return this.toast(ch.versions.some(v => Number(v.tv_archive)) ? 'This programme is no longer in the replay archive' : 'Replay isn’t available on this channel');
      }
      this.toast(`${prog.title} starts ${this.dayLabel(prog.start).toLowerCase()} at ${hm(prog.start)}`);
    },

    // ---------- TV guide grid ----------
    async renderGuide(main) {
      this.setBackdrop('');
      const groups = (await this.liveGroups()).filter(g => !g.free);
      if (!groups.length) { main.innerHTML = '<div class="empty"><h3>No channels</h3></div>'; return; }
      let group = groups.find(g => g.key === (this.guideCat || this.liveCat)) || groups.find(g => !g.special) || groups[0];
      const PX = 6;                      // pixels per minute
      const CELL = 260;                  // channel column width
      const maxBack = Math.max(1, ...group.channels.flatMap(c => c.versions.map(v => Number(v.tv_archive_duration) || 0)));
      let day = this.guideDay || 0;      // 0 = today, -1 = yesterday…

      main.innerHTML = `
        <div class="guide-page">
          <div class="gp-top">
            <div class="gp-info" id="gpInfo"><p class="muted">Move through the guide to see programme details. OK plays live programmes and replays past ones marked ⟲.</p></div>
            <div class="gp-controls">
              <button class="btn ghost" id="gpGroup"></button>
              <div class="gp-days" id="gpDays"></div>
              <button class="btn ghost" id="gpNow">Now</button>
            </div>
          </div>
          <div class="gp-grid" id="gpGrid" style="--px:${PX}px;--cell:${CELL}px"></div>
        </div>`;

      const grid = $('#gpGrid', main), info = $('#gpInfo', main);
      const days = [];
      for (let d = -Math.min(7, maxBack); d <= 1; d++) days.push(d);

      const paintControls = () => {
        $('#gpGroup', main).innerHTML = `${esc(group.key === '@fav' ? '★ ' + group.name : group.name)} <span class="muted">▾</span>`;
        $('#gpDays', main).innerHTML = days.map(d => `<button class="gp-day${d === day ? ' active' : ''}" data-day="${d}">${esc(this.dayLabel(Date.now() + d * 864e5))}</button>`).join('');
      };

      let observer;
      const render = () => {
        paintControls();
        const dayStart = new Date(new Date().toDateString()).getTime() + day * 864e5;
        const dayEnd = dayStart + 864e5;
        const width = 1440 * PX;
        const x = t => ((Math.max(dayStart, Math.min(dayEnd, t)) - dayStart) / 60000) * PX;
        const hours = Array.from({ length: 48 }, (_, i) => `<span style="left:${i * 30 * PX}px">${hm(dayStart + i * 30 * 60000)}</span>`).join('');
        grid.innerHTML = `
          <div class="gp-head"><div class="gp-corner">${esc(this.dayLabel(dayStart))}</div><div class="gp-ruler" style="width:${width}px">${hours}</div></div>
          <div class="gp-body">
          ${group.channels.map((c, i) => `
            <div class="gp-row" data-i="${i}">
              <div class="gp-ch"><span class="ch-num">${esc(c.num)}</span><span class="ch-logo">${c.stream_icon ? `<img loading="lazy" src="${esc(c.stream_icon)}" alt="">` : ''}</span><span class="gp-name">${esc(c.label)}</span>${c.versions.some(v => Number(v.tv_archive)) ? '<span class="gp-cu" title="Catch-up">⟲</span>' : ''}</div>
              <div class="gp-track" style="width:${width}px"><span class="gp-loading"></span></div>
            </div>`).join('')}
          <div class="gp-nowline" hidden></div>
          </div>`;

        const nowLine = $('.gp-nowline', grid);
        const placeNow = () => {
          const t = Date.now();
          nowLine.hidden = !(t >= dayStart && t < dayEnd);
          nowLine.style.left = `${(($('.gp-ch', grid) || {}).offsetWidth || CELL) + x(t)}px`;
        };
        placeNow();
        clearInterval(this.guideTimer);
        this.guideTimer = setInterval(() => { if (!grid.isConnected) return clearInterval(this.guideTimer); placeNow(); }, 60000);

        const fill = async row => {
          const i = Number(row.dataset.i), ch = group.channels[i];
          const list = await this.epgFor(ch);
          const track = $('.gp-track', row);
          if (!track || !grid.isConnected) return;
          const now = Date.now();
          const progs = list.filter(p => p.end > dayStart && p.start < dayEnd);
          row.progs = progs;
          track.innerHTML = progs.length ? progs.map((p, k) => {
            const state = p.end <= now ? 'past' : p.start <= now ? 'now' : 'future';
            const replay = this.canReplay(ch, p);
            return `<button class="prog ${state}${replay ? ' replay' : ''}" data-k="${k}" style="left:${x(p.start)}px;width:${Math.max(x(p.end) - x(p.start) - 3, 24)}px">
              <b>${replay ? '⟲ ' : ''}${esc(p.title)}</b><small>${hm(p.start)} – ${hm(p.end)}</small></button>`;
          }).join('') : `<button class="prog none" data-k="-1" style="left:0;width:${width - 4}px"><b>${ch.url ? 'Free channel' : 'No guide information'}</b><small>OK to watch live</small></button>`;
        };

        if (observer) observer.disconnect();
        observer = new IntersectionObserver(entries => {
          for (const e of entries) if (e.isIntersecting && !e.target.filled) { e.target.filled = true; fill(e.target); }
        }, { root: grid, rootMargin: '600px 0px' });
        $$('.gp-row', grid).forEach(r => observer.observe(r));

        // Start around now (today) or the evening (other days).
        const focusT = day === 0 ? Date.now() - 30 * 60000 : dayStart + 19 * 3600e3;
        grid.scrollLeft = Math.max(0, x(focusT));
        grid.scrollTop = 0;
      };

      const progAt = b => {
        const row = b.closest('.gp-row'), i = Number(row.dataset.i), k = Number(b.dataset.k);
        return { i, ch: group.channels[i], prog: k >= 0 && row.progs ? row.progs[k] : null };
      };
      const showInfo = debounce(b => {
        const { ch, prog } = progAt(b);
        const now = Date.now();
        const badge = !prog ? '<span class="chip">Live</span>'
          : prog.start <= now && prog.end > now ? `<span class="badge live">● Live now</span> <span class="bar gp-bar"><i style="width:${(((now - prog.start) / (prog.end - prog.start)) * 100).toFixed(1)}%"></i></span>`
          : prog.end <= now ? (this.canReplay(ch, prog) ? '<span class="badge replay">⟲ Replay — press OK</span>' : '<span class="chip">Ended</span>')
          : '<span class="chip">Upcoming</span>';
        info.innerHTML = `
          <div class="gp-info-ch">${ch.stream_icon ? `<img src="${esc(ch.stream_icon)}" alt="">` : ''}<span>${esc(ch.num)} · ${esc(ch.label)}</span></div>
          <h2>${esc(prog ? prog.title : ch.label)}</h2>
          <div class="gp-info-meta">${prog ? `${esc(this.dayLabel(prog.start))} · ${hm(prog.start)} – ${hm(prog.end)} · ${Math.round((prog.end - prog.start) / 60000)} min` : ''} ${badge}</div>
          <p>${esc(prog ? prog.description : '')}</p>`;
      }, 120);

      grid.addEventListener('focusin', e => { const b = e.target.closest('.prog'); if (b) showInfo(b); });
      grid.addEventListener('click', e => {
        const b = e.target.closest('.prog');
        if (!b) return;
        const { i, prog } = progAt(b);
        this.playProgramme(group.channels, i, group, prog);
      });
      $('#gpDays', main).addEventListener('click', e => {
        const b = e.target.closest('[data-day]');
        if (!b) return;
        day = this.guideDay = Number(b.dataset.day);
        render();
        $(`[data-day="${day}"]`, main).focus();
      });
      $('#gpNow', main).addEventListener('click', () => {
        day = this.guideDay = 0;
        render();
        setTimeout(() => { const n = $('.gp-row .prog.now', grid) || $('.gp-row .prog', grid); n && n.focus({ preventScroll: true }); }, 400);
      });
      $('#gpGroup', main).addEventListener('click', () => {
        const m = this.openModal(`${this.closeBtn()}<h2 class="sheet-title">Choose a group</h2>
          <div class="pick-list">${groups.map((g, i) => `<button class="cat${g.special ? ' special' : ''}${g === group ? ' active' : ''}" data-g="${i}">${esc((g.key === '@fav' ? '★ ' : '') + g.name)} <span>${g.channels.length}</span></button>`).join('')}</div>`, 'settings');
        m.querySelector('.pick-list').addEventListener('click', e => {
          const b = e.target.closest('[data-g]');
          if (!b) return;
          group = groups[Number(b.dataset.g)];
          this.guideCat = group.key;
          this.closeModal();
          render();
          $('#gpGroup', main).focus();
        });
        ($('.pick-list .active', m) || $('.pick-list .cat', m)).focus();
      });

      render();
      // Land on what's on now for the first channel.
      setTimeout(() => {
        const n = $('.gp-row .prog.now', grid) || $('.gp-row .prog', grid);
        (n || $('#gpGroup', main)).focus({ preventScroll: true });
      }, 900);
    },

    // ---------- modal ----------
    openModal(html, cls = '') {
      const m = $('#modal');
      // Switching from one details page to another keeps the original focus target.
      if (!m.contains(document.activeElement)) this.modalReturn = document.activeElement;
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
      if ($('#login').classList.contains('hidden')) this.stopPair();
      if (this.redrawLater && !Player.isOpen()) this.redraw();
    },
    closeBtn: () => `<button class="round-btn close" data-close aria-label="Close">${ICONS.close}</button>`,

    detailShell(item) {
      return `${this.closeBtn()}
        <div class="detail-bg"></div>
        <div class="detail-body">
          <div class="detail-poster"><span class="ph">${esc(item.name)}</span>${item.img ? `<img src="${esc(item.img)}" alt="">` : ''}</div>
          <div class="detail-info">
            <div class="detail-chips">${[item.kind === 'series' ? '<span class="badge">Series</span>' : '', item.lang && `<span class="chip">${esc(langName(item.lang))}</span>`, ...[item.quality, ...(item.tags || [])].filter(Boolean).map(t => `<span class="chip">${esc(t)}</span>`), item.kind === 'movie' && item.ext ? `<span class="chip">${esc(item.ext.toUpperCase())}</span>` : ''].filter(Boolean).join('')}</div>
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

    // Every copy of this title: language, resolution, tags, file format and category. onPick(version).
    async renderVersions(m, item, onPick) {
      const versions = item.versions || [item];
      const cats = await this.loadCats(item.kind).catch(() => []);
      const extra = $('.detail-extra', m);
      if (!extra) return;
      const catName = Object.fromEntries(cats.map(c => [String(c.category_id), c.category_name]));
      const box = document.createElement('section');
      box.className = 'versions-box';
      box.innerHTML = `<h3>${versions.length > 1 ? `Versions <span class="muted">${versions.length}</span>` : 'Version'}</h3>
        <div class="versions">${versions.map(v => {
          const saved = item.kind === 'movie' && this.cwGet('movie:' + v.id);
          const chips = [v.quality, ...v.tags, item.kind === 'movie' && v.ext ? v.ext.toUpperCase() : ''].filter(Boolean);
          const state = v === item && item.kind === 'series' ? 'Showing' : saved ? `Resume · ${fmtDur(saved.dur - saved.pos)} left` : '';
          return `<button class="ver${v === item ? ' current' : ''}" data-vid="${esc(v.id)}">
            <span class="ver-lang"><b>${esc(v.lang || '—')}</b><span>${esc(langName(v.lang))}</span></span>
            <span class="ver-tags">${chips.map(c => `<span class="chip">${esc(c)}</span>`).join('')}</span>
            <span class="ver-cat">${esc(catName[v.cat] || '')}</span>
            <span class="ver-go">${state ? `<small>${esc(state)}</small>` : ''}${ICONS.play}</span>
          </button>`;
        }).join('')}</div>`;
      box.addEventListener('click', e => {
        const b = e.target.closest('.ver');
        const v = b && versions.find(x => String(x.id) === b.dataset.vid);
        if (v) onPick(v);
      });
      extra.prepend(box);
    },

    // "☆ My List" toggle on a details page; refreshes the poster star wherever the card is shown.
    myListBtn(m, item) {
      const b = document.createElement('button');
      b.className = 'btn ghost fav-btn';
      const paint = () => { b.innerHTML = this.isFav(item.kind, item.gkey) ? '<span>★ In My List</span>' : '<span>☆ My List</span>'; };
      paint();
      b.addEventListener('click', () => {
        this.toggleFav(item.kind, item.gkey, item.name);
        paint();
        $$(`.card[data-kind="${item.kind}"][data-id="${item.id}"]`).forEach(c => { c.outerHTML = this.card(item); });
      });
      $('.detail-actions', m).appendChild(b);
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
      this.myListBtn(m, item);
      actions.addEventListener('click', e => {
        const a = e.target.closest('[data-a]');
        if (!a) return;
        this.playEntry({ ...entry, pos: saved ? saved.pos : 0 }, a.dataset.a === 'resume');
      });
      this.renderVersions(m, item, v => {
        const key = 'movie:' + v.id;
        const prev = this.cwGet(key);
        this.playEntry({
          ...entry, key, id: v.id, ext: v === item ? entry.ext : v.ext,
          subtitle: [v.year || item.year, langName(v.lang), v.quality].filter(Boolean).join(' · '),
          pos: prev ? prev.pos : 0,
        }, true);
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
        this.myListBtn(m, item);
        this.renderVersions(m, item, v => { if (v !== item) this.openSeries(v); });
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
      this.myListBtn(m, item);

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
      this.renderVersions(m, item, v => { if (v !== item) this.openSeries(v); });
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
        const [vod, series, live, free] = await Promise.all([this.loadVod(), this.loadSeries(), this.loadLive(), this.loadFree()]);
        if (fold(q.value.trim()) !== term) return;
        const match = list => list.filter(i => i.key.includes(term)).slice(0, 36);
        const mv = match(uniq(this.allowed(vod))), sv = match(uniq(series)), lv = match(uniq([...free, ...this.allowed(live)])).slice(0, 24);
        byId = new Map([...mv, ...sv].map(i => [i.kind + i.id, i]));
        res.innerHTML = (mv.length || sv.length || lv.length) ? [
          lv.length && `<h3>Channels</h3><div class="ch-grid">${lv.map((c, i) => `<button class="ch" data-live="${i}"><span class="ch-logo">${c.stream_icon ? `<img loading="lazy" src="${esc(c.stream_icon)}" alt="">` : ''}</span><span class="ch-name">${esc(c.label)}</span><span class="ch-q">${(c.url ? (c.radio ? ['Radio'] : []) : [...new Set(c.versions.map(v => v.quality || 'SD'))]).map(t => `<span class="chip">${esc(t)}</span>`).join('')}</span></button>`).join('')}</div>`,
          mv.length && `<h3>Movies</h3><div class="grid">${mv.map(i => this.card(i)).join('')}</div>`,
          sv.length && `<h3>Series</h3><div class="grid">${sv.map(i => this.card(i)).join('')}</div>`,
        ].filter(Boolean).join('') : '<p class="muted center">No results.</p>';
        res.onclick = e => {
          const ch = e.target.closest('[data-live]');
          if (ch) this.playChannel(lv, Number(ch.dataset.live), { key: '@now:search', name: 'Search' });
        };
      }, 250);
      q.addEventListener('input', run);
      this.bindCards(res, (k, id) => byId.get(k + id));
    },

    ago(t) {
      if (!t) return 'Not saved yet';
      const min = Math.round((Date.now() - t) / 60000);
      if (min < 1) return 'Just now';
      if (min < 60) return `${min} min ago`;
      const h = Math.round(min / 60);
      return h < 48 ? `${h} hour${h > 1 ? 's' : ''} ago` : new Date(t).toLocaleString(LOCALE, { dateStyle: 'medium', timeStyle: 'short' });
    },

    // ---------- free VPN (Android app) ----------
    bindVpnSettings(m) {
      const P = Native.player;
      const paint = v => {
        const el = $('#vpnState', m);
        if (!el) return;
        const label = { connected: `Connected · ${v.server || ''}`, connecting: v.detail || 'Connecting…', failed: v.detail || 'Failed', disconnected: 'Off' }[v.state] || v.state;
        el.textContent = label;
        el.className = v.state === 'connected' ? 'ok' : v.state === 'failed' ? 'bad' : '';
        $('#vpnGood', m).textContent = v.remembered ? v.remembered + (v.need ? ' · used for provider channels' : '') : 'None yet — found automatically when a channel needs it';
        $('#vpnMode', m).value = v.mode;
        $('#vpnCountry', m).value = v.country || '';
      };
      P.vpnStatus().then(paint).catch(() => {});
      if (!this.vpnListener) this.vpnListener = P.addListener('vpn', v => { if ($('#vpnState')) paint(v); });
      $('#vpnMode', m).addEventListener('change', e => P.vpnSettings({ mode: e.target.value }).then(v => {
        paint(v);
        if (v.mode === 'always' && v.state !== 'connected') P.vpnConnect().then(paint).catch(err => this.toast(err.message || 'VPN not allowed'));
      }));
      $('#vpnCountry', m).addEventListener('change', e => P.vpnSettings({ country: e.target.value }).then(paint));
      $('#vpnConnect', m).addEventListener('click', () => {
        this.toast('Connecting to a free VPN server…');
        P.vpnConnect().then(v => { paint(v); this.toast(v.ok ? 'VPN connected · ' + v.server : 'No free server answered'); })
          .catch(err => this.toast(err.message || 'VPN not allowed'));
      });
      $('#vpnOff', m).addEventListener('click', () => P.vpnDisconnect().then(paint));
      $('#vpnForget', m).addEventListener('click', () => P.vpnSettings({ forget: true }).then(v => { paint(v); this.toast('Forgot the remembered VPN server'); }));
    },

    // ---------- settings ----------
    openSettings() {
      const ui = (this.api && this.api.info && this.api.info.user_info) || {};
      const exp = Number(ui.exp_date) ? new Date(Number(ui.exp_date) * 1000).toLocaleDateString(LOCALE, { year: 'numeric', month: 'long', day: 'numeric' }) : 'Never';
      const langs = [['en-US', 'English'], ['fr-FR', 'Français'], ['es-ES', 'Español'], ['de-DE', 'Deutsch'], ['it-IT', 'Italiano'], ['pt-PT', 'Português'], ['nl-NL', 'Nederlands'], ['ar-SA', 'العربية'], ['tr-TR', 'Türkçe']];
      if (!langs.some(l => l[0] === Settings.tmdbLang)) langs.unshift([Settings.tmdbLang, Settings.tmdbLang]);
      const m = this.openModal(`${this.closeBtn()}
        <h2 class="sheet-title">Settings</h2>
        <section class="set-group">
          <h3>Account</h3>
          ${this.api.isM3U ? `<div class="kv link"><span>Playlist</span><code>${esc(this.api.url)}</code></div>` : `
          ${CFG.playerMode ? `<div class="kv link"><span>Server</span><code>${esc(this.api.server)}</code></div>` : ''}
          <div class="kv"><span>Username</span><b>${esc(this.api.username)}</b></div>
          <div class="kv"><span>Status</span><b class="ok">${esc(ui.status || 'Active')}</b></div>
          <div class="kv"><span>Expires</span><b>${esc(exp)}</b></div>
          <div class="kv"><span>Connections</span><b>${esc(ui.active_cons ?? '–')} / ${esc(ui.max_connections ?? '–')}</b></div>`}
        </section>
        <section class="set-group">
          <h3>Playback</h3>
          <label class="set"${window.Native || window.TizenTV ? ' hidden' : ''}><span>HTTPS relay URL<small>Needed to play video when this site is opened over HTTPS. See README.</small></span>
            <span class="set-row"><input class="field" id="setRelay" type="url" placeholder="https://inkonab-relay.you.workers.dev" value="${esc(Settings.relay)}"><button class="btn ghost" id="testRelay">Test</button></span></label>
          <label class="set"><span>Live stream format<small>HLS works best in browsers; try MPEG-TS if a channel won’t start.</small></span>
            <select class="field" id="setFormat"><option value="m3u8">HLS (.m3u8)</option><option value="ts">MPEG-TS (.ts)</option></select></label>
          <label class="set"><span>Info language<small>Language for summaries and titles from TMDB.</small></span>
            <select class="field" id="setLang">${langs.map(([v, n]) => `<option value="${v}">${esc(n)}</option>`).join('')}</select></label>
          <label class="set"${this.api.isM3U ? ' hidden' : ''}><span>Catch-up time correction<small>If replays start at the wrong time, shift them here.</small></span>
            <select class="field" id="setShift">${[-2, -1, 0, 1, 2].map(h => `<option value="${h}">${h === 0 ? 'None (server time)' : (h > 0 ? '+' : '−') + Math.abs(h) + ' hour' + (Math.abs(h) > 1 ? 's' : '')}</option>`).join('')}</select></label>
          <label class="set toggle"><span>Show adult categories<small>Protected by your parental PIN. Hidden again each time the app starts.</small></span><input type="checkbox" id="setAdult"></label>
          <div class="kv"><span>Parental PIN</span><b id="pinState">${Settings.adultPin ? 'Set' : 'Not set'}</b></div>
          ${Settings.adultPin ? '<div class="set-row vpn-actions"><button class="btn ghost" id="pinChange">Change PIN</button></div>' : ''}
        </section>
        ${window.Native ? `<section class="set-group" id="vpnGroup">
          <h3>Free VPN</h3>
          <label class="set"><span>When to use it<small>Only InkonabTV's traffic goes through it — the rest of the device is untouched.</small></span>
            <select class="field" id="vpnMode"><option value="auto">Automatic — when a channel won’t play</option><option value="always">Always on</option><option value="off">Off</option></select></label>
          <label class="set"><span>Preferred server country<small>Free VPN Gate servers are mostly in Japan and Korea.</small></span>
            <select class="field" id="vpnCountry"><option value="">Best available</option><option value="JP">Japan</option><option value="KR">South Korea</option><option value="US">United States</option><option value="TH">Thailand</option><option value="VN">Vietnam</option><option value="RU">Russia</option></select></label>
          <div class="kv"><span>Status</span><b id="vpnState">…</b></div>
          <div class="kv"><span>Remembered server</span><b id="vpnGood">—</b></div>
          <div class="set-row vpn-actions"><button class="btn ghost" id="vpnConnect">Connect now</button><button class="btn ghost" id="vpnOff">Disconnect</button><button class="btn ghost" id="vpnForget">Forget server</button></div>
          <p class="muted small-note">Servers come from the VPN Gate academic project and are run by volunteers: they can be slow, and their operators could see unencrypted traffic. Use it to unblock channels, not for privacy.</p>
        </section>` : ''}
        <section class="set-group">
          <h3>Playlist on this device</h3>
          <div class="kv"><span>Last updated</span><b id="plUpdated">${esc(this.ago(this.api.savedAt()))}</b></div>
          <p class="muted small-note">Movies, series and channels are saved on this device so the app opens instantly. They refresh by themselves in the background every 6 hours.</p>
          <div class="set-row vpn-actions"><button class="btn ghost" id="plRefresh">Refresh now</button></div>
        </section>
        <section class="set-group" id="xpGroup">
          <h3>Extra playlists</h3>
          <p class="muted small-note">Add M3U playlists of your own, for example free TV channels. Each one shows as a group on top of Live TV and as a row on Home.</p>
          <div id="xpList"></div>
          <label class="set"><span>Name</span><input class="field" id="xpName" maxlength="40" placeholder="My channels" autocapitalize="none" spellcheck="false"></label>
          <label class="set"><span>Playlist link (M3U)</span><input class="field" id="xpUrl" type="url" inputmode="url" placeholder="https://example.com/playlist.m3u" autocapitalize="none" spellcheck="false"></label>
          <p class="login-error" id="xpError" role="alert"></p>
          <div class="set-row vpn-actions"><button class="btn ghost" id="xpAdd">Add playlist</button>${CFG.pairApi ? '<button class="btn ghost" id="xpPhone">Add from phone</button>' : ''}</div>
          <div class="pair" id="xpPair" hidden>
            <img class="pair-qr" alt="">
            <div class="pair-text"><p>On your phone or computer, open</p><b class="pair-url"></b><p>choose “Extra playlist” and enter this code:</p>
              <div class="pair-code">…</div><p class="muted pair-note"></p></div>
          </div>
        </section>
        <section class="set-group">
          <h3>Playlist links</h3>
          <div class="kv link"><span>M3U</span><code>${esc(this.api.m3uUrl())}</code><button class="round-btn sm" data-copy="${esc(this.api.m3uUrl())}" aria-label="Copy M3U link">${ICONS.copy}</button></div>
          ${this.api.epgUrl() ? `<div class="kv link"><span>EPG</span><code>${esc(this.api.epgUrl())}</code><button class="round-btn sm" data-copy="${esc(this.api.epgUrl())}" aria-label="Copy EPG link">${ICONS.copy}</button></div>` : ''}
          ${CFG.privacyUrl ? `<div class="kv link"><span>Privacy policy</span><code>${esc(CFG.privacyUrl.replace(/^https?:\/\//, ''))}</code></div>` : ''}
        </section>
        <div class="set-actions">
          <button class="btn ghost" id="clearCw">Clear Continue Watching</button>
          <button class="btn danger" id="logout">Sign out</button>
        </div>`, 'settings');

      $('#setFormat', m).value = Settings.liveFormat;
      $('#setLang', m).value = Settings.tmdbLang;
      $('#setAdult', m).checked = Settings.showAdult;
      $('#setShift', m).value = String(Settings.catchupShift || 0);
      $('#setShift', m).addEventListener('change', e => save('catchupShift', Number(e.target.value)));
      const save = (k, v) => { Settings[k] = v; Settings.save(); };
      $('#setRelay', m).addEventListener('change', e => save('relay', e.target.value.trim()));
      $('#setFormat', m).addEventListener('change', e => save('liveFormat', e.target.value));
      const resetPicks = () => { delete this.data.moviePicks; delete this.data.seriesPicks; delete this.data.liveCatalog; };
      $('#setLang', m).addEventListener('change', e => { save('tmdbLang', e.target.value); TMDB.cache.clear(); resetPicks(); });
      $('#setAdult', m).addEventListener('change', async e => {
        const box = e.target, on = box.checked;
        // Turning adult categories on needs the parental PIN (created the first time).
        if (on) {
          box.checked = false;
          if (!(await this.askPin(Settings.adultPin ? 'check' : 'create'))) return;
          box.checked = true;
          $('#pinState', m).textContent = 'Set';
        }
        Settings.showAdult = on;
        resetPicks();
        this.route();
      });
      const pinChange = $('#pinChange', m);
      if (pinChange) pinChange.addEventListener('click', async () => { if (await this.askPin('change')) await this.askPin('create'); });
      $('#testRelay', m).addEventListener('click', async () => {
        save('relay', $('#setRelay', m).value.trim());
        if (!Settings.relay) return this.toast('Enter a relay URL first');
        try {
          const r = await fetch(relayUrl(this.api.apiUrl ? this.api.apiUrl({}) : this.api.url));
          const d = await r.json();
          this.toast(d && d.user_info ? 'Relay works ✓' : 'Relay answered, but not with your account');
        } catch { this.toast('Relay not reachable'); }
      });
      $$('[data-copy]', m).forEach(b => b.addEventListener('click', () => { navigator.clipboard && navigator.clipboard.writeText(b.dataset.copy); this.toast('Copied'); }));
      $('#clearCw', m).addEventListener('click', () => { Store.set('cw', []); this.toast('Cleared'); this.renderContinue(); });
      $('#logout', m).addEventListener('click', () => this.logout());
      $('#plRefresh', m).addEventListener('click', async e => {
        const b = e.currentTarget;
        b.disabled = true; b.textContent = 'Updating…';
        const changed = await this.api.refreshAll();
        b.disabled = false; b.textContent = 'Refresh now';
        $('#plUpdated', m).textContent = this.ago(this.api.savedAt());
        if (!changed) this.toast('Couldn’t reach the server — keeping the saved playlist');
        else if (this.view !== 'home') this.route();
      });
      this.bindExtraPlaylists(m);
      if (window.Native && $('#vpnGroup', m)) this.bindVpnSettings(m);
      $('[data-close]', m).focus();
    },
  };

  window.App = App;
  document.addEventListener('DOMContentLoaded', () => App.boot());
})();
