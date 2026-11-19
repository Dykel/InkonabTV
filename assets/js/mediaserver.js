/* Media servers: the viewer's own Jellyfin or Emby server next to the IPTV playlist.
   Signing in keeps only the server's access token (never the password). Home shows its
   Continue watching, newest movies and newest series; movies play in the app's player, series
   open their episodes. */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const T = s => (window.T ? window.T(s) : s);
  const VERSION = '1.0.37';

  const deviceId = () => {
    let id = Store.get('msDevice', '');
    if (!id) { id = 'itv-' + Math.random().toString(36).slice(2) + Date.now().toString(36); Store.set('msDevice', id); }
    return id;
  };
  const authHeader = token => `MediaBrowser Client="InkonabTV", Device="InkonabTV", DeviceId="${deviceId()}", Version="${VERSION}"${token ? `, Token="${token}"` : ''}`;
  const clean = url => {
    let u = String(url || '').trim().replace(/\/+$/, '');
    if (u && !/^https?:\/\//i.test(u)) u = 'http://' + u;
    return u.replace(/\/web(\/index\.html)?(#.*)?$/i, '');
  };

  const MediaServer = {
    // [{ id, url, name, userId, user, token }]
    list() { return Store.get('mediaServers', []) || []; },
    save(list) { Store.set('mediaServers', list); },

    async api(s, path, opts = {}) {
      const r = await fetch(s.url + path, {
        ...opts,
        headers: { 'Content-Type': 'application/json', Authorization: authHeader(s.token), 'X-Emby-Authorization': authHeader(s.token), ...(opts.headers || {}) },
      });
      if (r.status === 401) throw new Error(T('The server no longer accepts this sign-in. Remove it and add it again.'));
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.status === 204 ? null : r.json();
    },

    async connect(url, user, pass) {
      const base = clean(url);
      if (!base) throw new Error(T('Enter the server address'));
      const s = { url: base, token: '' };
      let info = {};
      try { info = await this.api(s, '/System/Info/Public'); }
      catch { throw new Error(T('Can’t reach this server. Check the address (for example http://192.168.1.20:8096).')); }
      let auth;
      try { auth = await this.api(s, '/Users/AuthenticateByName', { method: 'POST', body: JSON.stringify({ Username: user, Pw: pass }) }); }
      catch { throw new Error(T('Wrong username or password')); }
      const entry = { id: info.Id || auth.ServerId || base, url: base, name: info.ServerName || 'Media server', product: /emby/i.test(info.ProductName || '') ? 'Emby' : 'Jellyfin',
        userId: auth.User && auth.User.Id, user, token: auth.AccessToken };
      this.save([...this.list().filter(x => x.id !== entry.id), entry]);
      return entry;
    },

    async remove(id) {
      const s = this.list().find(x => x.id === id);
      if (s) this.api(s, '/Sessions/Logout', { method: 'POST' }).catch(() => {});
      this.save(this.list().filter(x => x.id !== id));
    },

    img(s, it, kind = 'Primary', h = 450) {
      const id = kind === 'Primary' && it.Type === 'Episode' && it.SeriesId && !(it.ImageTags || {}).Primary ? it.SeriesId : it.Id;
      return `${s.url}/Items/${id}/Images/${kind}?maxHeight=${h}&quality=85&api_key=${encodeURIComponent(s.token)}`;
    },
    streamUrl(s, it) {
      const ext = String(it.Container || 'mp4').split(',')[0].toLowerCase();
      return `${s.url}/Videos/${it.Id}/stream.${ext}?static=true&MediaSourceId=${it.Id}&api_key=${encodeURIComponent(s.token)}`;
    },
    // Where the viewer stopped, and tell the server how far they got (its own Continue watching).
    report(s, it, pos, dur) {
      if (!(dur > 0)) return;
      // The web player reports every 5 s: tell the server at most every 30 s (and at the end).
      const now = Date.now(), last = (this.sent || (this.sent = {}))[it.Id] || 0;
      if (now - last < 30000 && pos / dur < 0.92) return;
      this.sent[it.Id] = now;
      const ticks = Math.round(pos * 1e7);
      this.api(s, '/Sessions/Playing/Stopped', { method: 'POST', body: JSON.stringify({ ItemId: it.Id, PositionTicks: ticks }) }).catch(() => {});
      if (pos / dur > 0.92) this.api(s, `/Users/${s.userId}/PlayedItems/${it.Id}`, { method: 'POST' }).catch(() => {});
    },

    // ---------- Home rows ----------
    async renderRows(slot) {
      const servers = this.list();
      if (!slot || !servers.length) return;
      const parts = await Promise.all(servers.map(async s => {
        const q = `Fields=Overview,ProductionYear,Container,RunTimeTicks&ImageTypeLimit=1&EnableUserData=true`;
        const [resume, movies, series] = await Promise.all([
          this.api(s, `/Users/${s.userId}/Items/Resume?Limit=20&MediaTypes=Video&${q}`).then(r => r.Items || []).catch(() => []),
          this.api(s, `/Users/${s.userId}/Items?IncludeItemTypes=Movie&Recursive=true&SortBy=DateCreated&SortOrder=Descending&Limit=30&${q}`).then(r => r.Items || []).catch(e => ({ error: e.message })),
          this.api(s, `/Users/${s.userId}/Items?IncludeItemTypes=Series&Recursive=true&SortBy=DateLastContentAdded,DateCreated&SortOrder=Descending&Limit=30&${q}`).then(r => r.Items || []).catch(() => []),
        ]);
        return { s, resume, movies, series };
      }));
      if (!slot.isConnected) return;
      this.items = new Map();
      const card = (s, it) => {
        this.items.set(it.Id, { s, it });
        const ud = it.UserData || {}, pct = ud.PlayedPercentage || 0;
        const sub = it.Type === 'Episode' ? `${it.SeriesName || ''} · S${it.ParentIndexNumber || 0}E${it.IndexNumber || 0}` : it.ProductionYear || '';
        return `<button class="card${it.Type === 'Series' ? ' is-series' : ''}" data-ms="${esc(it.Id)}">
          <span class="poster"><span class="ph">${esc(it.Name)}</span><img loading="lazy" src="${esc(this.img(s, it))}" alt="" onerror="this.remove()">
            ${it.Type === 'Series' ? `<span class="badge">${esc(T('Series'))}</span>` : ''}${pct > 1 && pct < 98 ? `<span class="bar"><i style="width:${pct.toFixed(0)}%"></i></span>` : ''}</span>
          <span class="card-title">${esc(it.Name)}</span><span class="card-sub">${esc(sub)}</span></button>`;
      };
      const row = (title, s, list) => list && list.length ? `<section class="row ms-row"><h2><b>${esc(s.name)}</b> · ${esc(T(title))}</h2><div class="row-scroll">${list.map(it => card(s, it)).join('')}</div></section>` : '';
      slot.innerHTML = parts.map(({ s, resume, movies, series }) => movies && movies.error
        ? `<section class="row ms-row"><h2><b>${esc(s.name)}</b></h2><p class="muted ms-err">${esc(movies.error)}</p></section>`
        : row('Continue watching', s, resume) + row('Latest movies', s, movies) + row('Latest series', s, series)).join('');
      slot.onclick = e => {
        const b = e.target.closest('[data-ms]');
        const hit = b && this.items.get(b.dataset.ms);
        if (hit) this.openItem(hit.s, hit.it);
      };
    },

    openItem(s, it) {
      if (it.Type === 'Series') return this.openSeries(s, it);
      return this.play(s, it);
    },

    play(s, it, queue = []) {
      const start = ((it.UserData || {}).PlaybackPositionTicks || 0) / 1e7;
      const title = it.Type === 'Episode' ? it.SeriesName || it.Name : it.Name;
      const sub = it.Type === 'Episode' ? `S${it.ParentIndexNumber || 0} · E${it.IndexNumber || 0} · ${it.Name}` : String(it.ProductionYear || '');
      const toItem = x => ({ kind: 'movie', id: 'ms:' + x.Id, url: this.streamUrl(s, x), title: x.Type === 'Episode' ? x.SeriesName || x.Name : x.Name,
        subtitle: x.Type === 'Episode' ? `S${x.ParentIndexNumber || 0} · E${x.IndexNumber || 0} · ${x.Name}` : '', img: this.img(s, x) });
      Player.open({
        ...toItem(it), title, subtitle: sub, resumeAt: start > 30 ? start : 0,
        queue: queue.map(toItem),
        onProgress: (pos, dur, at) => this.report(s, at ? queue[at - 1] || it : it, pos, dur),
        onEnded: () => { if (queue[0]) this.play(s, queue[0], queue.slice(1)); },
      });
    },

    async openSeries(s, it) {
      App.openModal(`<button class="round-btn close" data-close aria-label="Close">✕</button>
        <div class="ms-series"><img class="ms-poster" src="${esc(this.img(s, it))}" alt="" onerror="this.remove()">
        <div><h2 class="sheet-title">${esc(it.Name)}</h2><p class="muted">${esc([it.ProductionYear, s.name].filter(Boolean).join(' · '))}</p>
        <p class="ms-plot">${esc(it.Overview || '')}</p><div class="ms-eps"><div class="loader small"><span></span></div></div></div></div>`, 'detail ms');
      const m = $('#modal');
      $('[data-close]', m).addEventListener('click', () => App.closeModal());
      let eps = [];
      try { eps = (await this.api(s, `/Shows/${it.Id}/Episodes?UserId=${s.userId}&Fields=Overview,Container,RunTimeTicks&EnableUserData=true`)).Items || []; }
      catch (e) { $('.ms-eps', m).innerHTML = `<p class="muted">${esc(e.message)}</p>`; return; }
      if (!m.classList.contains('ms') || $('#modal').classList.contains('hidden')) return;
      const box = $('.ms-eps', m);
      box.innerHTML = eps.map((e, i) => {
        const ud = e.UserData || {};
        return `<button class="ep" data-i="${i}"><span class="ep-text"><b>S${e.ParentIndexNumber || 0} · E${e.IndexNumber || 0} · ${esc(e.Name)}</b>
          <small>${ud.Played ? '✓ ' + esc(T('Watched')) : ud.PlayedPercentage ? Math.round(ud.PlayedPercentage) + '%' : ''}</small><p>${esc((e.Overview || '').slice(0, 160))}</p></span></button>`;
      }).join('') || `<p class="muted">${esc(T('No episodes'))}</p>`;
      box.addEventListener('click', e => {
        const b = e.target.closest('[data-i]');
        if (!b) return;
        const i = Number(b.dataset.i);
        App.closeModal();
        this.play(s, eps[i], eps.slice(i + 1, i + 6));
      });
      // Start on the next episode to watch.
      const next = eps.findIndex(e => !(e.UserData || {}).Played);
      const f = box.querySelector(`[data-i="${Math.max(0, next)}"]`);
      if (f) { f.focus({ preventScroll: true }); f.scrollIntoView({ block: 'nearest' }); }
    },

    // ---------- Settings ----------
    settingsHtml() {
      const list = this.list();
      return `<section class="set-group" id="msGroup"><h3>${esc(T('Media servers'))}</h3>
        <p class="muted small-note">${esc(T('Your own Jellyfin or Emby server: its movies and series show on Home. Only an access token is kept, never the password.'))}</p>
        ${list.map(s => `<div class="kv"><span>${esc(s.product || 'Jellyfin')} · ${esc(s.name)}</span><b><button class="btn ghost sm" data-msdel="${esc(s.id)}">${esc(T('Remove'))}</button></b></div>`).join('')}
        <div class="set-row vpn-actions"><button class="btn ghost" id="msAdd">${esc(T('Add Jellyfin or Emby server'))}</button></div></section>`;
    },
    bindSettings(m) {
      const g = $('#msGroup', m);
      if (!g) return;
      g.querySelectorAll('[data-msdel]').forEach(b => b.addEventListener('click', async () => { await this.remove(b.dataset.msdel); App.toast(T('Server removed')); App.openSettings(); }));
      $('#msAdd', g).addEventListener('click', () => this.addForm());
    },
    addForm() {
      App.openModal(`<button class="round-btn close" data-close aria-label="Close">✕</button>
        <h2 class="sheet-title">${esc(T('Add Jellyfin or Emby server'))}</h2>
        <label class="set"><span>${esc(T('Server address'))}<small>${esc(T('As in your browser, for example http://192.168.1.20:8096'))}</small></span><input class="field" id="msUrl" type="url" spellcheck="false" autocapitalize="none" placeholder="http://192.168.1.20:8096"></label>
        <label class="set"><span>${esc(T('Username'))}</span><input class="field" id="msUser" spellcheck="false" autocapitalize="none"></label>
        <label class="set"><span>${esc(T('Password'))}</span><input class="field" id="msPass" type="password"></label>
        <p class="login-error" id="msErr"></p>
        <div class="set-row vpn-actions"><button class="btn primary" id="msGo">${esc(T('Connect'))}</button><button class="btn ghost" data-back>${esc(T('Cancel'))}</button></div>`, 'settings ms-add');
      const m = $('#modal');
      $('[data-close]', m).addEventListener('click', () => App.closeModal());
      $('[data-back]', m).addEventListener('click', () => App.openSettings());
      $('#msGo', m).addEventListener('click', async () => {
        const err = $('#msErr', m), btn = $('#msGo', m);
        err.textContent = '';
        btn.disabled = true;
        try {
          const s = await this.connect($('#msUrl', m).value, $('#msUser', m).value.trim(), $('#msPass', m).value);
          App.closeModal();
          App.toast(T('Connected to') + ' ' + s.name);
          if (App.view === 'home') App.route();
        } catch (e) { err.textContent = e.message; }
        btn.disabled = false;
      });
      $('#msUrl', m).focus();
    },
  };

  window.MediaServer = MediaServer;
})();
