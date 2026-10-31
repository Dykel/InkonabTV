/* Full-screen video player: HLS (hls.js), MPEG-TS (mpegts.js) and native files. */
(function () {
  const $ = s => document.querySelector(s);

  // hls.js / mpegts.js ship with the app but load only on the website, the first time a stream
  // needs them (the Android app plays with ExoPlayer, Samsung TVs with AVPlay).
  const LIBS = { Hls: 'assets/js/vendor/hls.min.js', mpegts: 'assets/js/vendor/mpegts.js' };
  const loading = {}, missing = {};
  const lib = name => window[name] ? Promise.resolve() : (loading[name] = loading[name] || new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = LIBS[name];
    s.onload = resolve;
    s.onerror = () => { delete loading[name]; reject(new Error('Could not load ' + name)); };
    document.head.appendChild(s);
  }));

  // Tuned for slow or unsteady lines (measured: no freezes on 20–25 s drops to 1 Mbps, where the
  // old low-latency setup froze). Live plays about 25 s behind with no speed-up to catch up;
  // films and series buffer up to 2 minutes ahead. Lost segments are retried, not given up on.
  const hlsConfig = live => ({
    enableWorker: true, lowLatencyMode: false, backBufferLength: 30,
    liveSyncDurationCount: 6, liveMaxLatencyDurationCount: 15, maxLiveSyncPlaybackRate: 1,
    maxBufferLength: live ? 60 : 120, maxMaxBufferLength: 120, maxBufferSize: 120e6,
    fragLoadingMaxRetry: 8, fragLoadingRetryDelay: 500, manifestLoadingMaxRetry: 8, levelLoadingMaxRetry: 8,
    fragLoadingTimeOut: 20000, nudgeMaxRetry: 10, startLevel: -1, capLevelToPlayerSize: true,
  });

  const Player = {
    item: null,
    hls: null,
    ts: null,
    hideTimer: 0,
    saveTimer: 0,

    init() {
      this.el = $('#player');
      // Samsung TVs: AVPlay (native player) through an adapter with the same API (tizen.js).
      this.video = window.TizenAV ? TizenAV.create() : $('#video');
      this.el.querySelector('[data-act="close"]').addEventListener('click', () => this.close());
      this.el.querySelector('[data-act="prev"]').addEventListener('click', () => this.zap(-1));
      this.el.querySelector('[data-act="next"]').addEventListener('click', () => this.zap(1));
      this.el.querySelector('[data-act="list"]').addEventListener('click', () => this.openSide());
      this.el.querySelector('[data-act="fav"]').addEventListener('click', () => this.toggleFav());
      this.side = this.el.querySelector('.p-side');
      this.side.addEventListener('click', e => this.onSideClick(e));
      this.sched = this.el.querySelector('.p-sched');
      this.info = this.el.querySelector('.p-info');
      this.strip = this.el.querySelector('.p-strip');
      this.sched.addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (b) this.pickProgramme(Number(b.dataset.p)); });
      this.info.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (b) this.infoAction(b.dataset.a); });
      this.strip.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) this.tune(Number(b.dataset.i)); });
      this.side.addEventListener('focusin', e => {
        const g = e.target.closest('[data-g]');
        if (g) { clearTimeout(this.sidePreview); this.sidePreview = setTimeout(() => this.renderSideChannels(Number(g.dataset.g)), 120); }
      });
      this.el.querySelector('[data-act="retry"]').addEventListener('click', () => this.play(this.item));
      this.el.querySelector('[data-act="copy"]').addEventListener('click', () => {
        navigator.clipboard && navigator.clipboard.writeText(this.item.rawUrl);
        App.toast('Stream link copied — paste it into VLC');
      });
      this.el.querySelector('[data-act="settings"]').addEventListener('click', () => { this.close(); App.openSettings(); });
      this.el.addEventListener('mousemove', () => this.poke());
      this.el.addEventListener('click', () => this.poke());
      this.video.addEventListener('playing', () => { this.setState('playing'); });
      this.video.addEventListener('waiting', () => { const was = this.el.dataset.state; this.setState('loading'); if (was === 'playing') this.onFreeze(); });
      this.video.addEventListener('error', () => this.fail());
      this.video.addEventListener('ended', () => this.ended());
      document.addEventListener('keydown', e => this.onKey(e), true);
      // Website: fetch hls.js in the background once the app is up, so the first channel starts at once.
      setTimeout(() => { if (!window.Native && !this.video.isAV) lib('Hls').catch(() => {}); }, 4000);
    },

    isOpen() { return !this.el.classList.contains('hidden'); },

    // item: {kind, id, ext, title, subtitle, img, resumeAt, list, index, onProgress, onEnded}
    open(item) {
      if (window.Native) return this.openNative(item);
      this.returnFocus = document.activeElement;
      this.el.classList.remove('hidden');
      document.body.classList.add('playing');
      this.play(item);
      this.video.focus({ preventScroll: true });
    },

    // Android app: hand playback to ExoPlayer (PlayerActivity). It plays HTTP streams and
    // codecs browsers can't, so no relay is used. Live sends every group (deduplicated channels +
    // group index lists) so the native channel list matches the app.
    async openNative(item) {
      const label = v => [v.quality || (v.url ? '' : 'SD'), ...(v.tags || [])].filter(Boolean).join(' · ');
      let payload, groups = [];
      if (item.kind === 'live') {
        const cur = (item.list && item.list[item.index]) || item.version;
        groups = await App.liveGroups().catch(() => []);
        let gi = groups.findIndex(g => g.key === item.groupKey && g.channels.includes(cur));
        if (gi < 0) gi = groups.findIndex(g => g.channels.includes(cur));
        if (gi < 0) { groups.unshift({ key: item.groupKey || '@now', name: item.subtitle || 'Channels', channels: item.list || [cur] }); gi = 0; }
        const flat = [], at = new Map();
        const add = ch => {
          if (!at.has(ch)) {
            at.set(ch, flat.length);
            flat.push({
              title: ch.label || ch.name || '', img: ch.stream_icon || '', num: String(ch.num || ''), radio: !!ch.radio,
              gkey: ch.gkey || '', fav: App.isFav('live', ch.gkey), free: !!ch.source, // free playlist (MBC PLAY): never via the VPN
              // Guide (▼ / ◀ in the player): the stream whose guide we read, and the catch-up copy.
              epgId: String(((ch.versions && App.epgStream(ch)) || {}).stream_id || ''),
              cu: String(((ch.versions || []).find(v => Number(v.tv_archive)) || {}).stream_id || ''),
              // An M3U playlist has no URL template: each channel brings its own link.
              versions: (ch.versions || [ch]).map(v => (v.url ? { url: v.url, label: label(v) }
                : App.api && App.api.isM3U ? { url: App.api.streamUrl('live', v.stream_id), label: label(v) }
                : { id: String(v.stream_id), label: label(v) })),
            });
          }
          return at.get(ch);
        };
        payload = {
          live: true,
          template: App.api ? App.api.streamUrl('live', '{id}', Settings.liveFormat) : '',
          groups: groups.map(g => ({ key: g.key, name: g.name, items: g.channels.map(add) })),
          group: gi,
          index: Math.max(0, groups[gi].channels.indexOf(cur)),
          version: Math.max(0, ((cur && cur.versions) || [cur]).indexOf(item.version)),
        };
        payload.channels = flat;
        const api = App.api;
        if (api && !api.isM3U && api.apiUrl) {
          payload.epg = api.apiUrl({ action: 'get_simple_data_table', stream_id: 'ID' }).replace(/stream_id=ID$/, 'stream_id={id}');
          payload.catchup = api.catchupUrl('{id}', Date.now(), 1).replace(/\/\d+\/[^/]+\/\{id\}\.ts$/, '/{min}/{start}/{id}.ts');
          payload.tz = (api.info && api.info.server_info && api.info.server_info.timezone) || 'UTC';
          payload.shift = Number(Settings.catchupShift) || 0;
        }
      } else {
        payload = {
          live: false, group: 0, index: 0, version: 0, startAt: item.resumeAt > 5 ? item.resumeAt : 0,
          channels: [{ title: item.title || '', subtitle: item.subtitle || '', img: item.img || '',
            versions: [{ url: item.url || App.api.streamUrl(item.kind, item.id, item.ext || 'mp4'), label: item.kind === 'catchup' ? 'Replay' : '' }] }],
        };
      }
      const back = document.activeElement;
      let r = {};
      try {
        await Native.player.stage({ payload: JSON.stringify(payload) });
        r = await Native.player.play({ staged: true });
      } catch (e) { App.toast('Can’t open the player'); console.warn('[native player]', e); }
      if (item.kind !== 'live') {
        if (r.duration > 0 && item.onProgress) item.onProgress(r.position, r.duration);
        if (r.ended && item.onEnded) return item.onEnded();
      } else {
        for (const [k, on] of Object.entries(r.fav || {})) App.setFav('live', k, on);
        for (const k of r.history || []) App.pushRecent(k);
        const g = payload.groups[r.group] || payload.groups[payload.group];
        const ch = g && payload.channels[g.items[r.index]];
        if (back && back.isConnected) back.focus({ preventScroll: true });
        App.afterLive(g && g.key, ch && ch.gkey);
      }
      if (item.kind !== 'live' && back && back.isConnected) back.focus({ preventScroll: true });
      App.onPlayerClosed();
    },

    play(item) {
      this.destroy();
      this.item = item;
      this.freezes = [];
      this.recovers = 0;
      // item.url: a direct link — a free playlist (MBC PLAY), or a catch-up replay (relay: true,
      // it comes from the provider's plain-HTTP host like live TV). Otherwise an Xtream stream.
      const ext = item.url
        ? ((item.url.match(/\.(m3u8|ts|mp4|mkv|mp3|aac)(?:\?|$)/i) || [])[1] || 'm3u8').toLowerCase()
        : item.kind === 'live' ? item.fmtOverride || Settings.liveFormat : item.ext || 'mp4';
      item.fmt = ext;
      item.rawUrl = item.url || App.api.streamUrl(item.kind, item.id, ext);
      const url = item.url && !item.relay ? item.url : relay(item.rawUrl);
      this.el.classList.toggle('radio', !!item.radio);
      const art = this.el.querySelector('.p-radio img');
      if (item.radio && item.img) art.src = item.img; else art.removeAttribute('src');
      this.el.querySelector('.p-title').textContent = item.title || '';
      this.el.querySelector('.p-sub').textContent = item.subtitle || '';
      this.el.querySelector('.p-zap').classList.toggle('hidden', !item.list);
      this.el.querySelector('.p-epg').innerHTML = '';
      if (this.sched) this.hidePanels();
      this.renderVersions(item);
      if (item.kind === 'live') App.pushRecent(this.gkey());
      this.paintFav();
      this.setState('loading');
      this.poke();

      const v = this.video;
      v.removeAttribute('src');
      const need = !v.isAV && (ext === 'm3u8' ? 'Hls' : ext === 'ts' ? 'mpegts' : '');
      if (need && !window[need] && !missing[need]) {
        // Starts again once the library is here; without it, the browser tries the link itself.
        lib(need).catch(() => { missing[need] = true; }).then(() => { if (this.item === item) this.play(item); });
        return;
      }
      if (v.isAV) {
        v.src = url; // AVPlay handles HLS, MPEG-TS and files itself
      } else if (ext === 'm3u8' && window.Hls && Hls.isSupported()) {
        const hls = this.hls = new Hls(hlsConfig(item.kind === 'live'));
        hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal && !this.recover(d)) this.fail(d.details); });
        hls.on(Hls.Events.FRAG_BUFFERED, () => { this.recovers = 0; });
        this.hls.loadSource(url);
        this.hls.attachMedia(v);
      } else if (ext === 'ts' && window.mpegts && mpegts.isSupported()) {
        // No latency chasing: on a slow line it jumps ahead and empties the buffer again.
        this.ts = mpegts.createPlayer({ type: 'mpegts', isLive: item.kind === 'live', url },
          { enableStashBuffer: true, stashInitialSize: 1024 * 1024, liveBufferLatencyChasing: false, autoCleanupSourceBuffer: true });
        this.ts.on(mpegts.Events.ERROR, (t, d) => this.fail(d || t));
        this.ts.attachMediaElement(v);
        this.ts.load();
      } else {
        v.src = url;
      }
      if (item.resumeAt > 5) v.addEventListener('loadedmetadata', () => { v.currentTime = item.resumeAt; }, { once: true });
      clearTimeout(this.watchdog);
      this.watchdog = setTimeout(() => { if (this.item === item && this.el.dataset.state === 'loading') this.fail('timeout'); }, 15000);
      const p = v.play();
      if (p && p.catch) p.catch(() => {});

      if (item.kind !== 'live') {
        this.saveTimer = setInterval(() => this.saveProgress(), 5000);
      } else if (!item.url) {
        this.loadEpg(item);
      }
    },

    async loadEpg(item) {
      const box = this.el.querySelector('.p-epg');
      try {
        const list = await App.api.shortEpg(item.id, 3);
        if (this.item !== item) return;
        const now = Date.now();
        box.innerHTML = list.filter(e => e.end > now).slice(0, 2).map((e, i) => `
          <div class="p-epg-row"><span class="p-epg-tag">${i === 0 && e.start <= now ? 'Now' : 'Next'}</span>
          <span class="p-epg-time">${App.hm(e.start)} – ${App.hm(e.end)}</span>
          <span class="p-epg-title">${App.esc(e.title)}</span></div>`).join('');
      } catch {}
    },

    gkey() { return this.item && this.item.version && this.item.version.gkey; },

    paintFav() {
      const on = this.item && this.item.kind === 'live' && App.isFav('live', this.gkey());
      this.el.querySelector('.p-fav-icon').textContent = on ? '★' : '☆';
      this.el.querySelector('[data-act="fav"]').classList.toggle('on', !!on);
    },

    toggleFav() {
      if (!this.item || this.item.kind !== 'live') return;
      App.toggleFav('live', this.gkey(), this.item.title);
      this.paintFav();
    },

    // ---------- channel list sidebar (live): groups on the left, their channels on the right ----------
    sideOpen() { return !this.side.classList.contains('hidden'); },

    async openSide() {
      const it = this.item;
      if (!it || it.kind !== 'live') return;
      const groups = await App.liveGroups().catch(() => []);
      const cur = it.list && it.list[it.index];
      let gi = groups.findIndex(g => g.key === it.groupKey);
      if (gi < 0) gi = groups.findIndex(g => g.channels.includes(cur));
      if (gi < 0) { groups.unshift({ key: it.groupKey || '@now', name: it.subtitle || 'Channels', channels: it.list || [] }); gi = 0; }
      this.sideGroups = groups;
      this.side.querySelector('.p-groups').innerHTML = groups.map((g, i) =>
        `<button class="p-g${g.special || g.free ? ' special' : ''}" data-g="${i}">${App.esc((g.key === '@fav' ? '★ ' : '') + g.name)}<small>${g.channels.length}</small></button>`).join('');
      this.side.classList.remove('hidden');
      this.renderSideChannels(gi);
      const playing = this.side.querySelector('.p-c.playing') || this.side.querySelector('.p-c');
      (playing || this.side.querySelector(`[data-g="${gi}"]`)).focus();
      playing && playing.scrollIntoView({ block: 'center' });
    },

    renderSideChannels(gi) {
      const g = this.sideGroups[gi];
      if (!g || this.sideGi === gi && this.side.querySelector('.p-c')) { this.markSideGroup(gi); return; }
      this.sideGi = gi;
      this.markSideGroup(gi);
      const now = this.gkey();
      this.side.querySelector('.p-side-title').textContent = g.name;
      this.side.querySelector('.p-chans').innerHTML = g.channels.map((c, i) => `
        <button class="p-c${c.gkey === now ? ' playing' : ''}" data-c="${i}">
          <span class="ch-num">${App.esc(c.num)}</span>
          <span class="ch-logo">${c.stream_icon ? `<img loading="lazy" src="${App.esc(c.stream_icon)}" alt="">` : ''}</span>
          <span class="ch-name">${App.esc(c.label)}</span>
          ${App.isFav('live', c.gkey) ? '<span class="fav-star">★</span>' : ''}
        </button>`).join('') || '<p class="muted">No channels.</p>';
    },

    markSideGroup(gi) {
      this.side.querySelectorAll('.p-g').forEach(b => b.classList.toggle('active', Number(b.dataset.g) === gi));
    },

    onSideClick(e) {
      const g = e.target.closest('[data-g]');
      if (g) {
        this.renderSideChannels(Number(g.dataset.g));
        const first = this.side.querySelector('.p-c');
        first && first.focus();
        return;
      }
      const c = e.target.closest('[data-c]');
      if (!c) return;
      const grp = this.sideGroups[this.sideGi];
      const index = Number(c.dataset.c);
      const ch = grp.channels[index];
      const v = ch.versions[0];
      this.closeSide();
      this.play({ ...this.item, id: v.stream_id, url: v.url, radio: v.radio, img: v.stream_icon, title: ch.label,
        subtitle: grp.name, version: v, list: grp.channels, index, groupKey: grp.key, tried: null, fmtOverride: null });
    },

    closeSide() {
      this.side.classList.add('hidden');
      this.sideGi = -1;
      this.video.focus({ preventScroll: true });
    },

    // ↑/↓ inside a column, ←/→ between groups and channels; OK is a normal button click.
    sideKey(e) {
      const a = document.activeElement;
      const col = a && a.closest('.p-groups, .p-chans');
      const move = el => { if (el) { e.preventDefault(); el.focus(); el.scrollIntoView({ block: 'nearest' }); } };
      switch (e.key) {
        case 'ArrowUp': if (col) move(a.previousElementSibling); else e.preventDefault(); return true;
        case 'ArrowDown': if (col) move(a.nextElementSibling); else e.preventDefault(); return true;
        case 'ArrowLeft': move(this.side.querySelector('.p-g.active')); return true;
        case 'ArrowRight':
          if (col && col.classList.contains('p-groups')) move(this.side.querySelector('.p-c.playing') || this.side.querySelector('.p-c'));
          else e.preventDefault();
          return true;
        case 'Escape': case 'Backspace': case 'BrowserBack': case 'GoBack':
          e.preventDefault(); this.closeSide(); return true;
      }
      return false;
    },

    // ---------- live guide panels (Apple-style: each closes with the opposite arrow or Back) ----------
    // ▼ / OK: info panel (now / next, progress, actions) · ▲: channel strip (▲ again: every group)
    // ◀: channel list · ▶: this channel's programmes for today · CH+/CH−: change channel
    channel() { const it = this.item; return (it && it.list && it.list[it.index]) || null; },

    async programmes() {
      const it = this.item, ch = this.channel();
      if (!it || !App.api || it.url) return [];
      let list = ch && ch.versions && App.epgStream(ch) ? await App.epgFor(ch) : [];
      if (!list.length) list = await App.api.shortEpg(it.id, 10).catch(() => []);
      return list;
    },

    panel() { return ['info', 'strip', 'sched'].find(k => !this[k].classList.contains('hidden')) || ''; },

    hidePanels() {
      clearTimeout(this.panelTimer);
      ['info', 'strip', 'sched'].forEach(k => this[k].classList.add('hidden'));
      this.el.classList.remove('prog');
      if (this.el.contains(document.activeElement) && document.activeElement !== this.video) this.video.focus({ preventScroll: true });
    },

    showPanel(k, timeout) {
      this.hidePanels();
      if (this.sideOpen()) this.closeSide();
      this.el.classList.remove('ui');
      this[k].classList.remove('hidden');
      if (timeout) this.panelTimer = setTimeout(() => this.hidePanels(), 10000);
    },

    async openInfo() {
      const it = this.item, ch = this.channel(), box = this.info;
      if (!it || it.kind !== 'live') return;
      this.showPanel('info', true);
      this.el.classList.add('prog');
      const cu = ch && ch.versions && ch.versions.some(v => Number(v.tv_archive));
      const versions = (it.version && it.version.versions) || [];
      box.innerHTML = `<div class="pp-now"><span class="p-epg-tag">Now</span><b>${App.esc(it.title || '')}</b></div>
        <div class="pp-guide"><div class="loader small"><span></span></div></div>
        <div class="pp-acts">
          ${cu ? '<button class="btn ghost" data-a="over">⟲ Start over</button>' : ''}
          <button class="btn ghost" data-a="fav">${App.isFav('live', this.gkey()) ? '★' : '☆'} Favorite</button>
          ${versions.length > 1 ? `<button class="btn ghost" data-a="quality">Quality · ${App.esc(it.version.quality || 'SD')}</button>` : ''}
          <button class="btn ghost" data-a="list">☰ Channels</button>
          <button class="btn ghost" data-a="sched">Programmes</button>
        </div>`;
      box.querySelector('.pp-acts .btn').focus({ preventScroll: true });
      const list = await this.programmes();
      if (this.item !== it || this.panel() !== 'info') return;
      const now = Date.now(), cur = list.find(e => e.start <= now && e.end > now), next = list.find(e => e.start >= (cur ? cur.end : now));
      this.infoNow = cur;
      const guide = box.querySelector('.pp-guide');
      if (!cur) { guide.innerHTML = '<p class="pp-none">No guide information for this channel.</p>'; return; }
      box.querySelector('.pp-now b').textContent = cur.title;
      const pct = Math.min(100, ((now - cur.start) / (cur.end - cur.start)) * 100);
      guide.innerHTML = `<div class="pp-bar"><i style="width:${pct.toFixed(1)}%"></i></div>
        <div class="pp-meta"><span>${App.hm(cur.start)} – ${App.hm(cur.end)} · ${App.esc(it.title || '')}</span><span>${Math.max(1, Math.round((cur.end - now) / 60000))} min left</span></div>
        ${next ? `<div class="pp-next"><span>Next</span> ${App.hm(next.start)} · ${App.esc(next.title)}</div>` : ''}`;
    },

    infoAction(a) {
      const it = this.item, ch = this.channel();
      if (a === 'over') {
        if (!this.infoNow) return App.toast('No guide information for this channel.');
        return this.replay(ch, this.infoNow);
      }
      if (a === 'fav') { this.toggleFav(); const b = this.info.querySelector('[data-a="fav"]'); b.textContent = (App.isFav('live', this.gkey()) ? '★' : '☆') + ' Favorite'; return; }
      if (a === 'quality') { this.hidePanels(); this.stepVersion(1); return; }
      if (a === 'list') { this.hidePanels(); this.openSide(); return; }
      if (a === 'sched') this.openSched();
    },

    // A past (or the current) programme from the channel's archive; leaving it goes back to live.
    replay(ch, prog) {
      this.hidePanels();
      this.play({ ...App.catchupItem(ch, prog), liveReturn: { ...this.item, tried: null, fmtOverride: null } });
    },

    async openStrip() {
      const it = this.item, row = this.strip.querySelector('.p-strip-row');
      if (!it || !it.list || it.list.length < 2) return;
      this.showPanel('strip', true);
      this.strip.querySelector('h4').textContent = it.subtitle || 'Channels';
      // A window around the channel playing keeps big groups quick to open.
      const from = Math.max(0, it.index - 60), to = Math.min(it.list.length, it.index + 61);
      let html = '';
      for (let i = from; i < to; i++) {
        const c = it.list[i];
        html += `<button class="p-card${i === it.index ? ' playing' : ''}" data-i="${i}">
          <span class="ch-logo">${c.stream_icon ? `<img loading="lazy" src="${App.esc(c.stream_icon)}" alt="">` : ''}</span>
          <span class="p-card-name">${c.num ? `<small>${App.esc(c.num)}</small> ` : ''}${App.esc(c.label || c.name || '')}</span></button>`;
      }
      row.innerHTML = html;
      const cur = row.querySelector('.p-card.playing');
      if (cur) { cur.focus({ preventScroll: true }); cur.scrollIntoView({ inline: 'center', block: 'nearest' }); }
    },

    tune(index) {
      const it = this.item;
      this.hidePanels();
      if (!it || !it.list || index === it.index) return;
      this.zap(index - it.index);
    },

    async openSched() {
      const it = this.item, list = this.sched.querySelector('.p-sched-list');
      if (!it || it.kind !== 'live') return;
      this.showPanel('sched', false);
      this.sched.querySelector('h4').textContent = it.title || 'Programmes';
      list.innerHTML = '<div class="loader small"><span></span></div>';
      this.sched.tabIndex = -1;
      this.sched.focus({ preventScroll: true });
      const all = await this.programmes();
      if (this.item !== it || this.panel() !== 'sched') return;
      // Today (and the last 6 hours, for replays just after midnight), at least the next few programmes.
      const now = Date.now(), day = new Date(); day.setHours(0, 0, 0, 0);
      const from = Math.min(day.getTime(), now - 6 * 3600e3), to = day.getTime() + 864e5;
      const rows = this.schedRows = all.filter((e, i) => e.end > from && (e.start < to || all.slice(0, i).filter(x => x.start > now).length < 6));
      const ch = this.channel();
      list.innerHTML = rows.length ? rows.map((e, i) => {
        const live = e.start <= now && e.end > now, past = e.end <= now, replay = past && ch && App.canReplay(ch, e);
        return `<button class="p-s${live ? ' now' : ''}${past && !replay ? ' off' : ''}" data-p="${i}">
          <time>${App.hm(e.start)}</time><span class="p-s-title">${App.esc(e.title)}</span>${live ? '<span class="p-epg-tag">Now</span>' : replay ? '<span class="chip">Replay</span>' : ''}</button>`;
      }).join('') : '<p class="muted">No guide information for this channel.</p>';
      const at = list.querySelector('.p-s.now') || list.querySelector('.p-s:not(.off)') || list.querySelector('.p-s');
      if (at) { at.focus({ preventScroll: true }); at.scrollIntoView({ block: 'center' }); }
    },

    // Now → back to the channel; past with catch-up → replay.
    pickProgramme(i) {
      const prog = this.schedRows && this.schedRows[i], ch = this.channel(), now = Date.now();
      if (!prog || !this.item) return;
      if (prog.start <= now && prog.end > now) return this.hidePanels();
      if (prog.end <= now) {
        if (!ch || !App.canReplay(ch, prog)) return App.toast(ch && ch.versions && ch.versions.some(v => Number(v.tv_archive)) ? 'This programme is no longer in the replay archive' : 'Replay isn’t available on this channel');
        return this.replay(ch, prog);
      }
      App.toast(`${prog.title} starts ${App.dayLabel(prog.start).toLowerCase()} at ${App.hm(prog.start)}`);
    },

    // Keys while a panel is open. Returns true when the key was used.
    panelKey(e, k) {
      const a = document.activeElement;
      const move = el => { e.preventDefault(); if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } };
      const back = ['Escape', 'Backspace', 'BrowserBack', 'GoBack'].includes(e.key);
      clearTimeout(this.panelTimer);
      if (k !== 'sched') this.panelTimer = setTimeout(() => this.hidePanels(), 10000);
      if (back) { e.preventDefault(); this.hidePanels(); return true; }
      if (k === 'info') {
        const btn = a && a.closest('.pp-acts .btn');
        switch (e.key) {
          case 'ArrowUp': e.preventDefault(); this.hidePanels(); return true;
          case 'ArrowDown': e.preventDefault(); return true;
          case 'ArrowLeft': move(btn ? btn.previousElementSibling : this.info.querySelector('.pp-acts .btn')); return true;
          case 'ArrowRight': move(btn ? btn.nextElementSibling : this.info.querySelector('.pp-acts .btn')); return true;
        }
      } else if (k === 'strip') {
        const card = a && a.closest('.p-card');
        switch (e.key) {
          case 'ArrowDown': e.preventDefault(); this.hidePanels(); return true;
          case 'ArrowUp': e.preventDefault(); this.hidePanels(); this.openSide(); return true;
          case 'ArrowLeft': move(card ? card.previousElementSibling : this.strip.querySelector('.p-card')); return true;
          case 'ArrowRight': move(card ? card.nextElementSibling : this.strip.querySelector('.p-card')); return true;
        }
      } else if (k === 'sched') {
        const row = a && a.closest('.p-s');
        switch (e.key) {
          case 'ArrowUp': move(row ? row.previousElementSibling : this.sched.querySelector('.p-s')); return true;
          case 'ArrowDown': move(row ? row.nextElementSibling : this.sched.querySelector('.p-s')); return true;
          case 'ArrowLeft': e.preventDefault(); this.hidePanels(); return true;
          case 'ArrowRight': e.preventDefault(); return true;
        }
      }
      return false;
    },

    // Remote number keys: type a channel number, it switches after a short pause.
    digit(d) {
      const box = this.el.querySelector('.p-num');
      this.digits = ((this.digits || '') + d).slice(-4);
      box.textContent = this.digits;
      box.classList.remove('hidden');
      clearTimeout(this.digitTimer);
      this.digitTimer = setTimeout(async () => {
        const num = this.digits;
        this.digits = '';
        box.classList.add('hidden');
        const it = this.item;
        const hit = it && await App.findChannelByNum(num, it.list);
        if (!hit) return App.toast('No channel ' + num);
        const ch = hit.list[hit.index], v = ch.versions[0];
        this.play({ ...this.item, id: v.stream_id, url: v.url, radio: v.radio, img: v.stream_icon, title: ch.label, version: v, tried: null, fmtOverride: null,
          list: hit.list, index: hit.index, ...(hit.group ? { groupKey: hit.group.key, subtitle: hit.group.name } : {}) });
      }, 1300);
    },

    zap(step) {
      const it = this.item;
      if (!it || !it.list) return;
      const index = (it.index + step + it.list.length) % it.list.length;
      const ch = it.list[index];
      const v = (ch.versions || [ch])[0];
      this.play({ ...it, id: v.stream_id, url: v.url, radio: v.radio, img: v.stream_icon, title: ch.label || ch.name, subtitle: it.subtitle, version: v, index, tried: null, fmtOverride: null });
      if (it.onZap) it.onZap(ch);
    },

    // Live channels with several qualities: chips in the top bar, ←/→ to switch.
    renderVersions(item) {
      const box = this.el.querySelector('.p-vers');
      const versions = (item.version && item.version.versions) || [];
      if (versions.length < 2) { box.innerHTML = ''; return; }
      const labels = versions.map(v => [v.quality || 'SD', ...v.tags].join(' · '));
      const seen = {};
      box.innerHTML = versions.map((v, i) => {
        const n = labels.filter(l => l === labels[i]).length > 1 ? ' ' + (seen[labels[i]] = (seen[labels[i]] || 0) + 1) : '';
        return `<button class="p-ver${v === item.version ? ' on' : ''}" data-v="${i}">${App.esc(labels[i] + n)}</button>`;
      }).join('');
      box.querySelectorAll('.p-ver').forEach(b => b.addEventListener('click', () => this.switchVersion(versions[b.dataset.v])));
    },

    switchVersion(v) {
      const it = this.item;
      if (!it || !v || v === it.version) return;
      this.play({ ...it, id: v.stream_id, version: v, tried: null, fmtOverride: null });
      App.toast('Quality: ' + [v.quality || 'SD', ...v.tags].join(' · '));
    },

    stepVersion(step) {
      const it = this.item, versions = it && it.version && it.version.versions;
      if (!versions || versions.length < 2) return false;
      const i = versions.indexOf(it.version);
      this.switchVersion(versions[(i + step + versions.length) % versions.length]);
      return true;
    },

    saveProgress() {
      const v = this.video, it = this.item;
      if (!it || !it.onProgress || !v.duration || !isFinite(v.duration)) return;
      it.onProgress(v.currentTime, v.duration);
    },

    ended() {
      this.saveProgress();
      if (this.item && this.item.onEnded) this.item.onEnded();
    },

    // A channel that fails (or never starts) tries its other quality copies, then the other
    // stream format, before giving up.
    retry() {
      const it = this.item;
      if (!it || it.kind !== 'live' || (it.url && !it.relay)) return false;
      it.tried = it.tried || new Set();
      it.tried.add(`${it.id}:${it.fmt}`);
      if (it.tried.size >= 6) return false; // keep the wait short when a channel is truly down
      const versions = (it.version && it.version.versions) || [];
      const next = versions.find(v => !it.tried.has(`${v.stream_id}:${it.fmt}`));
      if (next) {
        App.toast(`Trying another copy (${next.quality || 'SD'})…`);
        this.play({ ...it, id: next.stream_id, version: next, tried: it.tried });
        return true;
      }
      const alt = it.fmt === 'm3u8' ? 'ts' : 'm3u8';
      const first = versions[0] || it.version;
      if (first && !it.tried.has(`${first.stream_id}:${alt}`)) {
        App.toast(`Trying the ${alt === 'ts' ? 'MPEG-TS' : 'HLS'} format…`);
        this.play({ ...it, id: first.stream_id, version: first, fmtOverride: alt, tried: it.tried });
        return true;
      }
      return false;
    },

    // A dropped connection reconnects quietly (same position) before anything is shown.
    recover(d) {
      const hls = this.hls;
      if (!hls || this.recovers >= 8) return false;
      this.recovers++;
      if (d.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
      else setTimeout(() => { if (this.hls === hls) hls.startLoad(); }, Math.min(8000, 1000 * this.recovers));
      console.warn('[player] reconnecting after', d.details, this.recovers);
      return true;
    },

    // A channel that plays is kept: a freeze is waited out. Only when it goes back to loading
    // more than 3 times within 15 s does it move to another copy of the channel.
    onFreeze() {
      const it = this.item, now = Date.now();
      if (!it || it.kind !== 'live') return;
      this.freezes = (this.freezes || []).filter(t => now - t < 15000).concat(now);
      if (this.freezes.length <= 3) return;
      this.freezes = [];
      it.tried = it.tried || new Set();
      it.tried.add(`${it.id}:${it.fmt}`);
      const next = ((it.version && it.version.versions) || []).find(v => !it.tried.has(`${v.stream_id}:${it.fmt}`));
      if (!next) return;
      App.toast(`Keeps stopping · trying another copy (${next.quality || 'SD'})…`);
      this.play({ ...it, id: next.stream_id, version: next, tried: it.tried });
    },

    fail(detail) {
      if (!this.item) return;
      const blocked = (!this.item.url || this.item.relay) && location.protocol === 'https:' && !Settings.relay;
      if (!blocked && this.retry()) { if (detail) console.warn('[player] retrying after', detail); return; }
      const mixed = (!this.item.url || this.item.relay) && location.protocol === 'https:' && !Settings.relay;
      const msg = mixed
        ? 'This channel is sent over plain HTTP, which browsers block on an HTTPS site. Add a relay in Settings (see README) to play it here.'
        : 'The stream could not be played. It may be offline, or use a format your browser can’t decode (try the other live format in Settings, or open it in VLC).';
      this.el.querySelector('.p-error-msg').textContent = msg;
      this.el.querySelector('[data-act="settings"]').classList.toggle('hidden', !mixed);
      this.setState('error');
      if (detail) console.warn('[player]', detail);
    },

    setState(s) {
      this.el.dataset.state = s;
      // The controls stay up while a stream loads; once it plays, hide them a moment later.
      if (s === 'playing' && this.el.classList.contains('ui')) this.poke();
    },

    poke() {
      this.el.classList.add('ui');
      clearTimeout(this.hideTimer);
      this.hideTimer = setTimeout(() => {
        if (this.el.dataset.state !== 'playing') return;
        this.el.classList.remove('ui');
        if (this.barFocused()) this.video.focus();
      }, 3500);
    },

    // ---------- top bar on a TV (live): OK brings it up on ☆, ◀ ▶ move along it ----------
    barFocused() { return this.el.querySelector('.p-top').contains(document.activeElement); },



    // Returns true when the key was used inside the bar.
    barKey(e) {
      const bar = this.el.querySelector('.p-top');
      const btns = [...bar.querySelectorAll('button')].filter(b => b.offsetParent);
      const i = btns.indexOf(document.activeElement);
      switch (e.key) {
        case 'ArrowLeft': case 'ArrowRight':
          btns[Math.max(0, Math.min(btns.length - 1, i + (e.key === 'ArrowLeft' ? -1 : 1)))].focus({ preventScroll: true });
          return true;
        case 'ArrowUp': return true;
        case 'ArrowDown': case 'Escape': case 'Backspace': case 'BrowserBack': case 'GoBack':
          this.el.classList.remove('ui');
          this.video.focus();
          return true;
      }
      return false;
    },

    // The video has the remote's attention (the AVPlay adapter focuses the player itself).
    mediaFocused() {
      const a = document.activeElement;
      return a === this.video || a === document.body || a === this.el || !!this.video.isAV && !this.el.contains(a);
    },

    onKey(e) {
      if (!this.isOpen()) return;
      this.poke();
      const v = this.video, live = this.item && this.item.kind === 'live';
      if (live && this.sideOpen()) { if (this.sideKey(e)) e.stopPropagation(); return; }
      const panel = this.panel();
      if (panel) { if (this.panelKey(e, panel)) e.stopPropagation(); return; }
      const tv = document.documentElement.classList.contains('tv');
      if (tv && this.barFocused() && this.barKey(e)) { e.preventDefault(); e.stopPropagation(); return; }
      if (live && /^[0-9]$/.test(e.key) && !e.target.matches('input')) { e.preventDefault(); this.digit(e.key); return; }
      if (live && e.key === 'Enter' && this.mediaFocused()) {
        e.preventDefault(); e.stopPropagation();
        this.openInfo();
        return;
      }
      switch (e.key) {
        case 'Escape': case 'Backspace': case 'BrowserBack': case 'GoBack':
          e.preventDefault(); e.stopPropagation(); this.close(); break;
        // ▲/▼ move up/down the list; CH+/CH− go to the next/previous channel number, like a TV.
        case 'PageUp': case 'ChannelDown':
          if (live) { e.preventDefault(); e.stopPropagation(); this.zap(-1); } break;
        case 'PageDown': case 'ChannelUp':
          if (live) { e.preventDefault(); e.stopPropagation(); this.zap(1); } break;
        case 'ArrowUp':
          if (live) { e.preventDefault(); e.stopPropagation(); this.openStrip(); } break;
        case 'ArrowDown':
          if (live) { e.preventDefault(); e.stopPropagation(); this.openInfo(); } break;
        case 'ArrowLeft':
          if (live) { e.preventDefault(); e.stopPropagation(); this.openSide(); }
          else if (this.mediaFocused()) { e.preventDefault(); v.currentTime = Math.max(0, v.currentTime - 10); } break;
        case 'ArrowRight':
          if (live) { e.preventDefault(); e.stopPropagation(); this.openSched(); }
          else if (this.mediaFocused()) { e.preventDefault(); v.currentTime += 10; } break;
        case ' ': case 'MediaPlayPause':
          if (this.mediaFocused() || e.key === 'MediaPlayPause') { e.preventDefault(); v.paused ? v.play() : v.pause(); } break;
        case 'MediaPlay': e.preventDefault(); v.play(); break;
        case 'MediaPause': e.preventDefault(); v.pause(); break;
        case 'MediaFastForward': if (!live) { e.preventDefault(); v.currentTime += 30; } break;
        case 'MediaRewind': if (!live) { e.preventDefault(); v.currentTime = Math.max(0, v.currentTime - 30); } break;
        case 'MediaStop': e.preventDefault(); this.close(); break;
        case 'f':
          if (document.fullscreenElement) document.exitFullscreen(); else this.el.requestFullscreen && this.el.requestFullscreen().catch(() => {}); break;
      }
    },

    destroy() {
      clearInterval(this.saveTimer);
      clearTimeout(this.watchdog);
      if (this.hls) { this.hls.destroy(); this.hls = null; }
      if (this.ts) { try { this.ts.destroy(); } catch {} this.ts = null; }
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
    },

    close() {
      // Leaving a replay started from the programme list goes back to the live channel.
      if (this.item && this.item.liveReturn) { this.play(this.item.liveReturn); return; }
      this.saveProgress();
      this.destroy();
      const it = this.item;
      this.item = null;
      this.side.classList.add('hidden');
      this.hidePanels();
      if (it && it.kind === 'live') App.afterLive(it.groupKey, it.version && it.version.gkey);
      this.el.classList.add('hidden');
      document.body.classList.remove('playing');
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      if (this.returnFocus && this.returnFocus.isConnected) this.returnFocus.focus({ preventScroll: true });
      App.onPlayerClosed();
    },
  };

  function relay(url) {
    if (!Settings.relay) return url;
    return Settings.relay.replace(/\/+$/, '') + '/?url=' + encodeURIComponent(url);
  }

  window.Player = Player;
  window.relayUrl = relay;
})();
