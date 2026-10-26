/* Full-screen video player: HLS (hls.js), MPEG-TS (mpegts.js) and native files. */
(function () {
  const $ = s => document.querySelector(s);

  const Player = {
    item: null,
    hls: null,
    ts: null,
    hideTimer: 0,
    saveTimer: 0,

    init() {
      this.el = $('#player');
      this.video = $('#video');
      this.el.querySelector('[data-act="close"]').addEventListener('click', () => this.close());
      this.el.querySelector('[data-act="prev"]').addEventListener('click', () => this.zap(-1));
      this.el.querySelector('[data-act="next"]').addEventListener('click', () => this.zap(1));
      this.el.querySelector('[data-act="list"]').addEventListener('click', () => this.openSide());
      this.el.querySelector('[data-act="fav"]').addEventListener('click', () => this.toggleFav());
      this.side = this.el.querySelector('.p-side');
      this.side.addEventListener('click', e => this.onSideClick(e));
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
      this.video.addEventListener('waiting', () => this.setState('loading'));
      this.video.addEventListener('error', () => this.fail());
      this.video.addEventListener('ended', () => this.ended());
      document.addEventListener('keydown', e => this.onKey(e), true);
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
              versions: (ch.versions || [ch]).map(v => (v.url ? { url: v.url, label: label(v) } : { id: String(v.stream_id), label: label(v) })),
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
      this.renderVersions(item);
      if (item.kind === 'live') App.pushRecent(this.gkey());
      this.paintFav();
      this.setState('loading');
      this.poke();

      const v = this.video;
      v.removeAttribute('src');
      if (ext === 'm3u8' && window.Hls && Hls.isSupported()) {
        this.hls = new Hls({ enableWorker: true, lowLatencyMode: item.kind === 'live', backBufferLength: 60 });
        this.hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) this.fail(d.details); });
        this.hls.loadSource(url);
        this.hls.attachMedia(v);
      } else if (ext === 'ts' && window.mpegts && mpegts.isSupported()) {
        this.ts = mpegts.createPlayer({ type: 'mpegts', isLive: item.kind === 'live', url }, { enableStashBuffer: true, liveBufferLatencyChasing: true });
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

    setState(s) { this.el.dataset.state = s; },

    poke() {
      this.el.classList.add('ui');
      clearTimeout(this.hideTimer);
      this.hideTimer = setTimeout(() => { if (this.el.dataset.state === 'playing') this.el.classList.remove('ui'); }, 3500);
    },

    onKey(e) {
      if (!this.isOpen()) return;
      this.poke();
      const v = this.video, live = this.item && this.item.kind === 'live';
      if (live && this.sideOpen()) { if (this.sideKey(e)) e.stopPropagation(); return; }
      if (live && /^[0-9]$/.test(e.key) && !e.target.matches('input')) { e.preventDefault(); this.digit(e.key); return; }
      if (live && e.key === 'Enter' && (document.activeElement === v || document.activeElement === document.body)) {
        e.preventDefault(); e.stopPropagation(); this.openSide(); return;
      }
      switch (e.key) {
        case 'Escape': case 'Backspace': case 'BrowserBack': case 'GoBack':
          e.preventDefault(); e.stopPropagation(); this.close(); break;
        case 'ArrowUp': case 'ChannelUp': case 'PageUp':
          if (live) { e.preventDefault(); e.stopPropagation(); this.zap(-1); } break;
        case 'ArrowDown': case 'ChannelDown': case 'PageDown':
          if (live) { e.preventDefault(); e.stopPropagation(); this.zap(1); } break;
        case 'ArrowLeft':
          if (live) { if (this.stepVersion(-1)) { e.preventDefault(); e.stopPropagation(); } }
          else if (document.activeElement === v) { e.preventDefault(); v.currentTime = Math.max(0, v.currentTime - 10); } break;
        case 'ArrowRight':
          if (live) { if (this.stepVersion(1)) { e.preventDefault(); e.stopPropagation(); } }
          else if (document.activeElement === v) { e.preventDefault(); v.currentTime += 10; } break;
        case ' ': case 'MediaPlayPause':
          if (document.activeElement === v || document.activeElement === document.body) { e.preventDefault(); v.paused ? v.play() : v.pause(); } break;
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
      this.saveProgress();
      this.destroy();
      const it = this.item;
      this.item = null;
      this.side.classList.add('hidden');
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
