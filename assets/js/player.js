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
      this.el.querySelector('[data-act="close"]').focus({ preventScroll: true });
    },

    // Android app: hand playback to ExoPlayer (PlayerActivity). It plays HTTP streams and
    // codecs browsers can't, so no relay is used. Live sends the whole list for zapping.
    async openNative(item) {
      const label = v => [v.quality || (v.url ? '' : 'SD'), ...(v.tags || [])].filter(Boolean).join(' · ');
      const liveUrl = v => v.url || App.api.streamUrl('live', v.stream_id, Settings.liveFormat);
      let payload;
      if (item.kind === 'live') {
        const list = item.list || [item.version || { stream_id: item.id, url: item.url, name: item.title, radio: item.radio, stream_icon: item.img }];
        const index = item.list ? item.index : 0;
        const cur = list[index];
        payload = {
          live: true, index,
          version: Math.max(0, (cur.versions || [cur]).indexOf(item.version)),
          channels: list.map(ch => ({
            title: ch.label || ch.name || '', subtitle: item.subtitle || '', img: ch.stream_icon || '', radio: !!ch.radio,
            versions: (ch.versions || [ch]).map(v => ({ url: liveUrl(v), label: label(v) })),
          })),
        };
      } else {
        payload = {
          live: false, index: 0, version: 0, startAt: item.resumeAt > 5 ? item.resumeAt : 0,
          channels: [{ title: item.title || '', subtitle: item.subtitle || '', img: item.img || '',
            versions: [{ url: App.api.streamUrl(item.kind, item.id, item.ext || 'mp4'), label: '' }] }],
        };
      }
      const back = document.activeElement;
      let r = {};
      try { r = await Native.player.play(payload); } catch (e) { App.toast('Can’t open the player'); console.warn('[native player]', e); }
      if (item.kind !== 'live') {
        if (r.duration > 0 && item.onProgress) item.onProgress(r.position, r.duration);
        if (r.ended && item.onEnded) return item.onEnded();
      } else if (item.list && item.onZap && item.list[r.index]) {
        item.onZap(item.list[r.index]);
      }
      if (back && back.isConnected) back.focus({ preventScroll: true });
      App.onPlayerClosed();
    },

    play(item) {
      this.destroy();
      this.item = item;
      // item.url: a direct link from a free playlist (MBC PLAY); otherwise an Xtream stream.
      const ext = item.url
        ? ((item.url.match(/\.(m3u8|ts|mp4|mkv|mp3|aac)(?:\?|$)/i) || [])[1] || 'm3u8').toLowerCase()
        : item.kind === 'live' ? Settings.liveFormat : item.ext || 'mp4';
      item.rawUrl = item.url || App.api.streamUrl(item.kind, item.id, ext);
      const url = item.url || relay(item.rawUrl);
      this.el.classList.toggle('radio', !!item.radio);
      const art = this.el.querySelector('.p-radio img');
      if (item.radio && item.img) art.src = item.img; else art.removeAttribute('src');
      this.el.querySelector('.p-title').textContent = item.title || '';
      this.el.querySelector('.p-sub').textContent = item.subtitle || '';
      this.el.querySelector('.p-zap').classList.toggle('hidden', !item.list);
      this.el.querySelector('.p-epg').innerHTML = '';
      this.renderVersions(item);
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

    zap(step) {
      const it = this.item;
      if (!it || !it.list) return;
      const index = (it.index + step + it.list.length) % it.list.length;
      const ch = it.list[index];
      const v = (ch.versions || [ch])[0];
      this.play({ ...it, id: v.stream_id, url: v.url, radio: v.radio, img: v.stream_icon, title: ch.label || ch.name, subtitle: it.subtitle, version: v, index });
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
      this.play({ ...it, id: v.stream_id, version: v });
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

    fail(detail) {
      if (!this.item) return;
      const mixed = !this.item.url && location.protocol === 'https:' && !Settings.relay;
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
      if (this.hls) { this.hls.destroy(); this.hls = null; }
      if (this.ts) { try { this.ts.destroy(); } catch {} this.ts = null; }
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
    },

    close() {
      this.saveProgress();
      this.destroy();
      this.item = null;
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
