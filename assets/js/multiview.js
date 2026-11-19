/* Multiview: up to four live channels on one screen (website, Windows, Mac).
   The selected tile has the sound; OK on it opens Full screen / Change channel / Remove; OK on an
   empty tile opens the channel picker; Return closes. Samsung TVs play one video at a time (AVPlay),
   and the Android app has its own native multiview, so this one is for browsers only. */
(function () {
  const MAX = 4;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const T = s => (window.T ? window.T(s) : s);

  const Multi = {
    tiles: [], // { ch, video, hls, ts, timer, tries }
    focus: 0,

    // Samsung: one video at a time. Android: the app's own native multiview (openNative).
    supported() { return !window.TizenAV && !window.TizenTV; },
    isOpen() { return !!this.el && !this.el.classList.contains('hidden'); },

    build() {
      if (this.el) return;
      const el = this.el = document.createElement('div');
      el.id = 'multi';
      el.className = 'multi hidden';
      el.innerHTML = `<div class="mv-grid"></div>
        <p class="mv-hint">${esc(T('Multiview'))} · ${esc(T('OK: options'))} · ◀ ▲ ▼ ▶ · ${esc(T('Return: close'))}</p>
        <div class="mv-pop mv-menu hidden" role="menu"></div>
        <div class="mv-pop mv-pick hidden" role="dialog" aria-label="${esc(T('Add a channel'))}">
          <h3>${esc(T('Add a channel'))}</h3>
          <div class="mv-cols"><div class="mv-groups"></div><div class="mv-chans"></div></div>
        </div>`;
      document.body.appendChild(el);
      this.grid = $('.mv-grid', el);
      this.menu = $('.mv-menu', el);
      this.pick = $('.mv-pick', el);
      this.grid.addEventListener('click', e => { const t = e.target.closest('[data-t]'); if (t) this.activate(Number(t.dataset.t)); });
      this.grid.addEventListener('focusin', e => { const t = e.target.closest('[data-t]'); if (t) this.setFocus(Number(t.dataset.t), false); });
      this.menu.addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (b) this.menuAction(b.dataset.m); });
      this.pick.addEventListener('click', e => {
        const g = e.target.closest('[data-g]'), c = e.target.closest('[data-c]');
        if (g) this.showGroup(Number(g.dataset.g), true);
        else if (c) this.choose(Number(c.dataset.c));
      });
      this.pick.addEventListener('focusin', e => {
        const g = e.target.closest('[data-g]');
        if (g) { clearTimeout(this.preview); this.preview = setTimeout(() => this.showGroup(Number(g.dataset.g), false), 120); }
      });
      el.addEventListener('mousemove', () => this.poke());
    },

    // seed: a channel from the catalogue (the one being watched), or nothing.
    async open(seed) {
      if (!this.supported()) return;
      if (window.Native) return this.openNative(seed);
      this.build();
      if (window.Player && Player.isOpen()) Player.close();
      const saved = (Store.get('multiview', []) || []).filter(Boolean);
      let chans = [];
      try {
        const cat = await App.liveCatalog();
        chans = saved.map(k => cat.byKey.get(k)).filter(Boolean);
      } catch {}
      if (seed) chans = [seed, ...chans.filter(c => c.gkey !== seed.gkey)];
      this.returnFocus = document.activeElement;
      this.el.classList.remove('hidden');
      document.body.classList.add('playing', 'multi-on');
      this.tiles = [];
      for (const ch of chans.slice(0, MAX)) this.tiles.push({ ch, tries: 0 });
      this.focus = 0;
      this.render();
      this.tiles.forEach((t, i) => this.start(i));
      this.setFocus(0, true);
      this.limitNote();
      this.poke();
    },

    // Android app: MultiviewActivity (ExoPlayer per tile) with the same channel list as the player.
    async openNative(seed) {
      if (this.nativeBusy) return;
      this.nativeBusy = true;
      try {
        const cat = await App.liveCatalog();
        let chans = (Store.get('multiview', []) || []).map(k => cat.byKey.get(k)).filter(Boolean);
        if (seed) chans = [seed, ...chans.filter(c => c.gkey !== seed.gkey)];
        const groups = await App.liveGroups().catch(() => []);
        const first = chans[0] || (groups.find(g => g.channels.length) || { channels: [] }).channels[0];
        if (!first) { App.toast(T('No channels')); return; }
        const g = groups.find(x => x.channels.includes(first)) || { key: '@now', name: '', channels: [first] };
        const payload = await Player.livePayload({ kind: 'live', list: g.channels, index: g.channels.indexOf(first), groupKey: g.key, subtitle: g.name, version: first.versions[0] });
        payload.tiles = chans.slice(0, MAX).map(c => c.gkey);
        payload.maxConn = this.allowed();
        payload.sleep = Number(Settings.sleepMin) || 0;
        const back = document.activeElement;
        await Native.player.stage({ payload: JSON.stringify(payload) });
        const r = await Native.player.multi({ staged: true });
        Store.set('multiview', (r && r.tiles) || []);
        if (r && r.full) return App.openChannelByKey(r.full);
        if (back && back.isConnected && back.offsetParent) back.focus({ preventScroll: true });
        else App.afterLive(null, r && r.focus);
      } catch (e) {
        console.warn('[multiview]', e);
        App.toast(T('Can’t open multiview'));
      } finally {
        this.nativeBusy = false;
      }
    },

    close() {
      if (!this.isOpen()) return;
      this.save();
      const last = this.tiles[this.focus] || this.tiles[0];
      this.tiles.forEach((t, i) => this.stop(i));
      this.tiles = [];
      this.grid.innerHTML = '';
      this.hidePops();
      this.el.classList.add('hidden');
      document.body.classList.remove('playing', 'multi-on');
      const back = this.returnFocus;
      if (back && back.isConnected && !back.closest('#player') && back.offsetParent) back.focus({ preventScroll: true });
      // Opened from the player (now closed): back to Live TV on the channel that had the sound.
      else App.afterLive(null, last && last.ch.gkey);
    },

    save() { Store.set('multiview', this.tiles.map(t => t.ch.gkey).filter(Boolean)); },

    // How many streams the subscription allows at once (Xtream accounts say so).
    allowed() {
      const ui = App.api && App.api.info && App.api.info.user_info;
      const n = Number(ui && ui.max_connections);
      return n > 0 ? n : 0;
    },
    limitNote() {
      const n = this.allowed();
      if (n && this.tiles.length > n) App.toast(T('Your subscription allows {n} stream(s) at once: some channels may not play').replace('{n}', n));
    },

    // Tiles: the channels, plus an empty "Add channel" tile while there is room.
    render() {
      const n = this.tiles.length, cells = Math.min(MAX, n + (n < MAX ? 1 : 0));
      this.grid.className = 'mv-grid n' + Math.max(1, cells);
      let html = '';
      for (let i = 0; i < cells; i++) {
        const t = this.tiles[i];
        html += t
          ? `<div class="mv-tile" data-t="${i}" tabindex="0" role="button" aria-label="${esc(t.ch.label || '')}">
               <video playsinline muted></video>
               <div class="mv-state"><div class="loader small"><span></span></div></div>
               <div class="mv-label"><span class="mv-sound" aria-hidden="true">🔊</span><b>${esc(t.ch.label || '')}</b></div>
             </div>`
          : `<div class="mv-tile mv-add" data-t="${i}" tabindex="0" role="button">
               <span class="mv-plus">+</span><span>${esc(T('Add channel'))}</span>
             </div>`;
      }
      // Keep the videos already playing: only new tiles get a fresh element.
      const old = this.tiles.map(t => t.video);
      this.grid.innerHTML = html;
      this.tiles.forEach((t, i) => {
        const cell = this.cell(i), fresh = $('video', cell);
        if (old[i]) { fresh.replaceWith(old[i]); }
        else t.video = fresh;
        this.paintState(i);
      });
    },

    cell(i) { return this.grid.querySelector(`[data-t="${i}"]`); },

    setFocus(i, move = true) {
      this.focus = i;
      this.tiles.forEach((t, k) => {
        if (!t.video) return;
        t.video.muted = k !== i;
        const c = this.cell(k);
        if (c) c.classList.toggle('audio', k === i);
      });
      const c = this.cell(i);
      if (move && c && document.activeElement !== c) c.focus({ preventScroll: true });
    },

    activate(i) {
      if (!this.tiles[i]) return this.openPicker(i);
      this.setFocus(i);
      this.openMenu(i);
    },

    // ---------- playback, one per tile ----------
    start(i) {
      const t = this.tiles[i];
      if (!t) return;
      this.stop(i, true);
      const v = t.video, ch = t.ch, ver = (ch.versions || [ch])[0];
      const L = window.PlayerLib;
      let raw, ext;
      if (ver.url) { raw = ver.url; ext = ((ver.url.match(/\.(m3u8|ts|mp4)(?:\?|$)/i) || [])[1] || 'm3u8').toLowerCase(); }
      // The format that worked in the player this session (some providers' HLS is broken), or the
      // tile's own switch after a failure.
      else { ext = t.fmt || (window.Player && Player.fmtPref) || Settings.liveFormat || 'm3u8'; raw = App.api.streamUrl('live', ver.stream_id, ext); }
      t.fmt = ext;
      const url = ver.url && !ver.relay ? raw : L.relay(raw);
      t.state = 'loading';
      this.paintState(i);
      const need = ext === 'm3u8' ? 'Hls' : ext === 'ts' ? 'mpegts' : '';
      if (need && !window[need]) {
        L.lib(need).catch(() => {}).then(() => { if (this.tiles[i] === t && window[need]) this.start(i); else if (this.tiles[i] === t) this.failed(i); });
        return;
      }
      const fail = () => this.failed(i, t);
      if (ext === 'm3u8' && window.Hls && Hls.isSupported()) {
        // Smaller buffers than the full-screen player: four of them share the line.
        t.hls = new Hls({ ...L.hlsConfig(true), maxBufferLength: 20, maxMaxBufferLength: 30, maxBufferSize: 30e6, capLevelToPlayerSize: true });
        t.hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) fail(); });
        t.hls.loadSource(url);
        t.hls.attachMedia(v);
      } else if (ext === 'ts' && window.mpegts && mpegts.isSupported()) {
        t.ts = mpegts.createPlayer({ type: 'mpegts', isLive: true, url },
          { enableStashBuffer: true, stashInitialSize: 512 * 1024, liveBufferLatencyChasing: false, autoCleanupSourceBuffer: true });
        t.ts.on(mpegts.Events.ERROR, fail);
        t.ts.attachMediaElement(v);
        t.ts.load();
      } else {
        v.src = url;
      }
      v.muted = i !== this.focus;
      v.onplaying = () => {
        if (this.tiles[i] !== t) return;
        t.state = 'playing'; t.tries = 0; this.paintState(i);
        if (t.altTried && window.Player) Player.fmtPref = t.fmt;
      };
      v.onwaiting = () => { if (this.tiles[i] === t && t.state === 'playing') { t.state = 'loading'; this.paintState(i); } };
      v.onerror = fail;
      clearTimeout(t.timer);
      t.timer = setTimeout(() => { if (this.tiles[i] === t && t.state === 'loading') fail(); }, 20000);
      const p = v.play();
      if (p && p.catch) p.catch(() => {});
    },

    failed(i, t = this.tiles[i]) {
      if (!t || this.tiles[i] !== t || t.state === 'failed') return;
      // The other format first (m3u8 ↔ ts), as the full-screen player does.
      const ver = (t.ch.versions || [t.ch])[0];
      if (!ver.url && !t.altTried) {
        t.altTried = true;
        t.fmt = t.fmt === 'ts' ? 'm3u8' : 'ts';
        this.stop(i, true);
        return this.start(i);
      }
      // Try twice more, a little later (a stream that just started on another tile can take a moment).
      if (t.tries < 2) {
        t.tries++;
        this.stop(i, true);
        t.state = 'loading';
        this.paintState(i);
        t.timer = setTimeout(() => { if (this.tiles[i] === t) this.start(i); }, 3000);
        return;
      }
      this.stop(i, true);
      t.state = 'failed';
      this.paintState(i);
    },

    stop(i, keepTile) {
      const t = this.tiles[i];
      if (!t) return;
      clearTimeout(t.timer);
      try { if (t.hls) t.hls.destroy(); } catch {}
      try { if (t.ts) { t.ts.pause(); t.ts.unload(); t.ts.detachMediaElement(); t.ts.destroy(); } } catch {}
      t.hls = t.ts = null;
      const v = t.video;
      if (v) {
        v.onplaying = v.onwaiting = v.onerror = null;
        try { v.pause(); } catch {}
        v.removeAttribute('src');
        try { v.load(); } catch {}
      }
      if (!keepTile) t.state = 'stopped';
    },

    paintState(i) {
      const t = this.tiles[i], c = this.cell(i);
      if (!t || !c) return;
      c.dataset.state = t.state || 'loading';
      const box = $('.mv-state', c);
      if (!box) return;
      box.innerHTML = t.state === 'failed'
        ? `<p>${esc(T('Can’t play this channel'))}</p><small>${esc(T('OK: options'))}</small>`
        : t.state === 'playing' ? '' : '<div class="loader small"><span></span></div>';
    },

    // ---------- tile menu ----------
    openMenu(i) {
      const t = this.tiles[i];
      if (!t) return;
      this.menuFor = i;
      this.menu.innerHTML = `<h4>${esc(t.ch.label || '')}</h4>
        <button class="btn primary" data-m="full">${esc(T('Full screen'))}</button>
        ${t.state === 'failed' ? `<button class="btn ghost" data-m="retry">${esc(T('Try again'))}</button>` : ''}
        <button class="btn ghost" data-m="change">${esc(T('Change channel'))}</button>
        <button class="btn ghost" data-m="remove">${esc(T('Remove'))}</button>`;
      const r = this.cell(i).getBoundingClientRect();
      this.menu.style.left = Math.round(r.left + r.width / 2) + 'px';
      this.menu.style.top = Math.round(r.top + r.height / 2) + 'px';
      this.menu.classList.remove('hidden');
      $('button', this.menu).focus({ preventScroll: true });
    },

    menuAction(m) {
      const i = this.menuFor, t = this.tiles[i];
      this.hidePops();
      if (!t) return;
      if (m === 'full') return this.fullScreen(i);
      if (m === 'retry') { t.tries = 0; t.altTried = false; t.state = 'loading'; return this.start(i); }
      if (m === 'change') return this.openPicker(i);
      if (m === 'remove') {
        this.stop(i);
        this.tiles.splice(i, 1);
        this.render();
        this.save();
        this.setFocus(Math.min(i, Math.max(0, this.tiles.length - 1)));
        if (!this.tiles.length) this.setFocus(0);
      }
    },

    // The tile's channel in the normal player; Return there comes back to Live TV, as usual.
    async fullScreen(i) {
      const ch = this.tiles[i].ch;
      this.close();
      const groups = await App.liveGroups().catch(() => []);
      const g = groups.find(x => x.channels.includes(ch)) || { key: '@now', name: '', channels: [ch] };
      App.playChannel(g.channels, Math.max(0, g.channels.indexOf(ch)), g);
    },

    // ---------- channel picker ----------
    async openPicker(i) {
      this.pickFor = i;
      this.groups = await App.liveGroups().catch(() => []);
      if (!this.groups.length) return App.toast(T('No channels'));
      const cur = this.tiles[i] && this.tiles[i].ch;
      let gi = cur ? this.groups.findIndex(g => g.channels.includes(cur)) : -1;
      if (gi < 0) gi = this.groups.findIndex(g => !g.special) >= 0 && this.groups[0].special && this.groups[0].channels.length ? 0 : Math.max(0, this.groups.findIndex(g => !g.special));
      $('.mv-groups', this.pick).innerHTML = this.groups.map((g, k) =>
        `<button class="mv-g${k === gi ? ' active' : ''}" data-g="${k}">${esc((g.key === '@fav' ? '★ ' : '') + g.name)}<small>${g.channels.length}</small></button>`).join('');
      this.pick.classList.remove('hidden');
      this.showGroup(gi, false);
      const at = cur ? this.groups[gi].channels.indexOf(cur) : 0;
      const c = $(`[data-c="${Math.max(0, at)}"]`, this.pick) || $('[data-g].active', this.pick);
      if (c) { c.focus({ preventScroll: true }); c.scrollIntoView({ block: 'center' }); }
    },

    showGroup(gi, focus) {
      const g = this.groups && this.groups[gi];
      if (!g) return;
      this.pickGroup = gi;
      this.pick.querySelectorAll('[data-g]').forEach(b => b.classList.toggle('active', Number(b.dataset.g) === gi));
      const used = new Set(this.tiles.map(t => t.ch));
      // Long groups: the first 400 (the picker is a quick choice; Live TV has the full list).
      $('.mv-chans', this.pick).innerHTML = g.channels.slice(0, 400).map((c, k) =>
        `<button class="mv-c${used.has(c) ? ' used' : ''}" data-c="${k}">${c.num ? `<small>${esc(c.num)}</small>` : ''}${c.stream_icon ? `<img loading="lazy" src="${esc(c.stream_icon)}" alt="">` : ''}<span>${esc(c.label || '')}</span></button>`).join('');
      if (focus) { const c = $('[data-c]', this.pick); if (c) c.focus({ preventScroll: true }); }
    },

    choose(k) {
      const g = this.groups[this.pickGroup], ch = g && g.channels[k];
      if (!ch) return;
      const i = this.pickFor;
      this.hidePops();
      const dup = this.tiles.findIndex(t => t.ch === ch);
      if (dup >= 0 && dup !== i) { App.toast(T('This channel is already on screen')); this.setFocus(dup); return; }
      if (this.tiles[i]) {
        this.stop(i);
        this.tiles[i] = { ch, tries: 0, video: this.tiles[i].video };
        $('.mv-label b', this.cell(i)).textContent = ch.label || '';
        this.cell(i).setAttribute('aria-label', ch.label || '');
      } else {
        this.tiles.push({ ch, tries: 0 });
        this.render();
        this.limitNote();
      }
      const n = this.tiles.indexOf(this.tiles.find(t => t.ch === ch));
      this.start(n);
      this.save();
      this.setFocus(n);
    },

    hidePops() {
      this.menu.classList.add('hidden');
      this.pick.classList.add('hidden');
    },
    popOpen() { return !this.menu.classList.contains('hidden') ? this.menu : !this.pick.classList.contains('hidden') ? this.pick : null; },

    // Mouse: the hint shows while the pointer moves.
    poke() {
      this.el.classList.add('ui');
      clearTimeout(this.uiTimer);
      this.uiTimer = setTimeout(() => this.el && this.el.classList.remove('ui'), 3500);
    },

    onKey(e) {
      if (!this.isOpen()) return;
      const back = ['Escape', 'Backspace', 'BrowserBack', 'GoBack', 'XF86Back'].includes(e.key);
      const pop = this.popOpen();
      if (back) {
        if (e.key === 'Backspace' && e.target.matches && e.target.matches('input')) return;
        e.preventDefault(); e.stopImmediatePropagation();
        if (pop) {
          const from = pop === this.menu ? this.menuFor : this.pickFor;
          this.hidePops();
          this.setFocus(Math.min(from, this.grid.children.length - 1));
        } else this.close();
        return;
      }
      this.poke();
      // Picker: ◀ from the channels goes back to the groups (on the open group).
      if (pop === this.pick && e.key === 'ArrowLeft' && e.target.closest && e.target.closest('[data-c]')) {
        e.preventDefault(); e.stopImmediatePropagation();
        const g = $('[data-g].active', this.pick);
        if (g) g.focus({ preventScroll: true });
        return;
      }
      if (pop === this.pick && e.key === 'ArrowRight' && e.target.closest && e.target.closest('[data-g]')) {
        e.preventDefault(); e.stopImmediatePropagation();
        this.showGroup(Number(e.target.closest('[data-g]').dataset.g), true);
        return;
      }
      if (e.key === 'Enter' && !pop && e.target.closest && e.target.closest('[data-t]')) {
        e.preventDefault(); e.stopImmediatePropagation();
        this.activate(Number(e.target.closest('[data-t]').dataset.t));
      }
    },
  };

  // Before the app's own key handlers (Return there goes back a page).
  document.addEventListener('keydown', e => Multi.onKey(e), true);
  window.Multi = Multi;
})();
