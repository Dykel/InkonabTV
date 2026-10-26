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
      this.returnFocus = document.activeElement;
      this.el.classList.remove('hidden');
      document.body.classList.add('playing');
      this.play(item);
      this.el.querySelector('[data-act="close"]').focus({ preventScroll: true });
    },

    play(item) {
      this.destroy();
      this.item = item;
      const ext = item.kind === 'live' ? Settings.liveFormat : item.ext || 'mp4';
      item.rawUrl = App.api.streamUrl(item.kind, item.id, ext);
      const url = relay(item.rawUrl);
      this.el.querySelector('.p-title').textContent = item.title || '';
      this.el.querySelector('.p-sub').textContent = item.subtitle || '';
      this.el.querySelector('.p-zap').classList.toggle('hidden', !item.list);
      this.el.querySelector('.p-epg').innerHTML = '';
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
      } else {
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
      this.play({ ...it, id: ch.stream_id, title: ch.name, subtitle: it.subtitle, index });
      if (it.onZap) it.onZap(ch);
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
      const mixed = location.protocol === 'https:' && !Settings.relay;
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
          if (!live && document.activeElement === v) { e.preventDefault(); v.currentTime = Math.max(0, v.currentTime - 10); } break;
        case 'ArrowRight':
          if (!live && document.activeElement === v) { e.preventDefault(); v.currentTime += 10; } break;
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
