/* Samsung TV (Tizen) glue: remote keys, Back/exit, on-screen keyboard, older-engine CSS
   fallbacks, and an AVPlay adapter so the web player uses Samsung's native video player.
   Does nothing outside a Tizen TV. Loaded only in the Tizen package (scripts/build-tizen.mjs). */
(function () {
  if (typeof window.tizen === 'undefined') return;
  const html = document.documentElement;
  html.classList.add('tizen', 'tv');
  window.TizenTV = true;
  // Same design width as Android TV (the TV scales it to the screen).
  const vp = document.querySelector('meta[name="viewport"]');
  if (vp) vp.setAttribute('content', 'width=1600');

  // ---------- older engines (2019–2021 TVs): flags for CSS fallbacks ----------
  try { if (!(window.CSS && CSS.supports && CSS.supports('aspect-ratio', '1 / 1'))) html.classList.add('no-aspect'); } catch (e) { html.classList.add('no-aspect'); }
  (function () {
    const d = document.createElement('div');
    d.style.cssText = 'display:flex;flex-direction:column;row-gap:1px;position:absolute;visibility:hidden';
    d.appendChild(document.createElement('div'));
    d.appendChild(document.createElement('div'));
    document.addEventListener('DOMContentLoaded', () => {
      document.body.appendChild(d);
      if (d.scrollHeight !== 1) html.classList.add('no-flexgap');
      d.remove();
    });
  })();

  // ---------- remote keys ----------
  // Register the keys the app uses; map their key codes to the names the app listens for.
  const wanted = ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaFastForward', 'MediaRewind',
    'ChannelUp', 'ChannelDown', 'Info', 'ColorF0Red', 'ColorF1Green', 'ColorF2Yellow', 'ColorF3Blue',
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const byCode = {};
  try {
    const supported = tizen.tvinputdevice.getSupportedKeys().map(k => k.name);
    const names = wanted.filter(n => supported.indexOf(n) >= 0);
    if (tizen.tvinputdevice.registerKeyBatch) tizen.tvinputdevice.registerKeyBatch(names);
    else names.forEach(n => tizen.tvinputdevice.registerKey(n));
    names.forEach(n => { byCode[tizen.tvinputdevice.getKey(n).code] = n; });
  } catch (e) { /* older firmware: the standard remote keys still arrive as arrows / Enter */ }

  const BACK = 10009, IME_DONE = 65376, IME_CANCEL = 65385;
  const exitApp = () => { try { tizen.application.getCurrentApplication().exit(); } catch (e) {} };
  const send = (target, key) => {
    const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    return (target || document.body).dispatchEvent(ev); // true = nobody handled it
  };

  document.addEventListener('keydown', e => {
    const code = e.keyCode;
    if (code === BACK) {
      e.preventDefault();
      e.stopImmediatePropagation();
      // Same as Escape in the app (close the channel list / player / dialog, go Home); exit from Home.
      if (send(document.activeElement, 'Escape')) exitApp();
      return;
    }
    const name = byCode[code];
    if (!name || e.key === name) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (/^[0-9]$/.test(name)) { send(document.activeElement, name); return; }
    if (name.indexOf('Color') === 0) { colorKey(name); return; }
    send(document.activeElement, name);
  }, true);

  // Colour keys: Red = ★ favorite, Green = channel list / Live TV, Yellow = TV Guide, Blue = Search.
  function colorKey(name) {
    const P = window.Player, A = window.App;
    const playingLive = P && P.isOpen() && P.item && P.item.kind === 'live';
    if (name === 'ColorF0Red' && playingLive) P.toggleFav();
    else if (name === 'ColorF1Green') { if (playingLive) P.openSide(); else location.hash = 'live'; }
    else if (name === 'ColorF2Yellow') { if (P && P.isOpen()) P.close(); location.hash = 'guide'; }
    else if (name === 'ColorF3Blue' && A && A.api) { if (P && P.isOpen()) P.close(); A.openSearch(); }
  }

  // ---------- on-screen keyboard ----------
  // Moving onto a text field must not open the keyboard (it would trap the remote): fields are
  // read-only until OK is pressed; Done/Cancel on the keyboard makes them remote-friendly again.
  const isText = el => el && el.matches && el.matches('input:not([type="checkbox"]):not([type="radio"]), textarea');
  document.addEventListener('focusin', e => { if (isText(e.target) && !e.target.dataset.typing) e.target.readOnly = true; }, true);
  document.addEventListener('focusout', e => { if (isText(e.target)) { delete e.target.dataset.typing; e.target.readOnly = true; } }, true);
  const openKeyboard = t => {
    t.dataset.typing = '1';
    t.readOnly = false;
    t.blur();
    setTimeout(() => { t.dataset.typing = '1'; t.readOnly = false; t.focus(); }, 30);
  };
  document.addEventListener('keydown', e => {
    const t = e.target;
    if (!isText(t)) return;
    if (e.keyCode === 13 && t.readOnly) { e.preventDefault(); e.stopPropagation(); openKeyboard(t); return; }
    if (e.keyCode === IME_DONE || e.keyCode === IME_CANCEL || (e.keyCode === 13 && !t.readOnly)) {
      // Done in Username moves on to Password.
      if (t.id === 'loginUser' && e.keyCode !== IME_CANCEL) {
        e.preventDefault();
        const pass = document.getElementById('loginPass');
        t.readOnly = true;
        delete t.dataset.typing;
        openKeyboard(pass);
        return;
      }
      if (e.keyCode !== 13) { t.readOnly = true; delete t.dataset.typing; }
    }
  }, true);

  // ---------- AVPlay: Samsung's native player behind the web page ----------
  // Exposes the small part of HTMLVideoElement the web player uses, so player.js stays the same.
  if (!window.webapis || !webapis.avplay) return;
  const av = webapis.avplay;

  function AvVideo() {
    this.isAV = true;
    this.listeners = {};
    this.url = '';
    this.t = 0;
    this.dur = NaN;
    this.isPaused = true;
    this.pendingSeek = 0;
  }
  AvVideo.prototype = {
    addEventListener(name, fn, opts) { (this.listeners[name] = this.listeners[name] || []).push({ fn, once: !!(opts && opts.once) }); },
    removeEventListener(name, fn) { this.listeners[name] = (this.listeners[name] || []).filter(l => l.fn !== fn); },
    emit(name) {
      const list = this.listeners[name] || [];
      this.listeners[name] = list.filter(l => !l.once);
      list.forEach(l => { try { l.fn({ type: name }); } catch (e) { console.warn(e); } });
    },
    get src() { return this.url; },
    set src(url) { this.open(url); },
    removeAttribute(attr) { if (attr === 'src') this.stop(); },
    load() {},
    focus() { const p = document.getElementById('player'); if (p) p.focus({ preventScroll: true }); },
    open(url) {
      this.stop();
      this.url = url;
      this.t = 0;
      this.dur = NaN;
      this.isPaused = false;
      const mine = url;
      try {
        av.open(url);
        av.setDisplayRect(0, 0, 1920, 1080);
        av.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX');
        av.setListener({
          onbufferingstart: () => this.emit('waiting'),
          onbufferingcomplete: () => this.emit('playing'),
          oncurrentplaytime: ms => { this.t = ms / 1000; },
          onstreamcompleted: () => this.emit('ended'),
          onerror: err => { if (this.url === mine) { this.error = err; this.emit('error'); } },
          onevent: () => {},
        });
        av.prepareAsync(() => {
          if (this.url !== mine) return;
          const d = av.getDuration();
          this.dur = d > 0 ? d / 1000 : Infinity;
          this.emit('loadedmetadata');
          if (this.pendingSeek) { try { av.seekTo(this.pendingSeek * 1000); } catch (e) {} this.pendingSeek = 0; }
          av.play();
          this.isPaused = false;
          this.emit('playing');
        }, err => { if (this.url === mine) { this.error = err; this.emit('error'); } });
      } catch (e) {
        setTimeout(() => { if (this.url === mine) this.emit('error'); }, 0);
      }
    },
    stop() {
      this.url = '';
      try {
        const st = av.getState();
        if (st !== 'NONE' && st !== 'IDLE') av.stop();
        av.close();
      } catch (e) {}
    },
    play() { try { av.play(); this.isPaused = false; } catch (e) {} return Promise.resolve(); },
    pause() { try { av.pause(); this.isPaused = true; } catch (e) {} },
    get paused() { return this.isPaused; },
    get duration() { return this.dur; },
    get currentTime() { return this.t; },
    set currentTime(s) {
      s = Math.max(0, s);
      let st = 'NONE';
      try { st = av.getState(); } catch (e) {}
      if (st === 'READY' || st === 'PLAYING' || st === 'PAUSED') { try { av.seekTo(s * 1000); this.t = s; } catch (e) {} }
      else this.pendingSeek = s;
    },
  };

  window.TizenAV = {
    create() {
      // AVPlay draws into this element, under the (transparent) web page.
      const obj = document.createElement('object');
      obj.type = 'application/avplayer';
      obj.id = 'avplayer';
      const player = document.getElementById('player');
      player.insertBefore(obj, player.firstChild);
      player.tabIndex = -1;
      return new AvVideo();
    },
  };

  // Pause the stream while the app is in the background (Home / Source pressed).
  document.addEventListener('visibilitychange', () => {
    try { if (document.hidden) av.suspend(); else av.restore(); } catch (e) {}
  });

  // Progress bar for movies and episodes (AVPlay has no built-in controls).
  document.addEventListener('DOMContentLoaded', () => {
    const player = document.getElementById('player');
    const bar = document.createElement('div');
    bar.className = 'tz-progress';
    bar.innerHTML = '<span class="tz-time"></span><span class="bar"><i></i></span><span class="tz-dur"></span>';
    player.appendChild(bar);
    const fmt = s => { s = Math.floor(s); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
    setInterval(() => {
      const P = window.Player;
      const vod = P && P.isOpen() && P.item && P.item.kind !== 'live';
      bar.hidden = !vod;
      if (!vod) return;
      const v = P.video, d = v.duration;
      if (!(d > 0 && isFinite(d))) return;
      bar.querySelector('.tz-time').textContent = fmt(v.currentTime) + (v.paused ? '  ❚❚' : '');
      bar.querySelector('.tz-dur').textContent = fmt(d);
      bar.querySelector('i').style.width = Math.min(100, (v.currentTime / d) * 100).toFixed(2) + '%';
    }, 1000);
  });
})();
