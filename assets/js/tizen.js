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
      // Done in Server moves on to Username, Username to Password.
      const next = { loginServer: 'loginUser', loginUser: 'loginPass' }[t.id];
      if (next && e.keyCode !== IME_CANCEL) {
        e.preventDefault();
        t.readOnly = true;
        delete t.dataset.typing;
        openKeyboard(document.getElementById(next));
        return;
      }
      if (e.keyCode !== 13) { t.readOnly = true; delete t.dataset.typing; }
    }
  }, true);

  // ---------- network: Samsung reports cable / Wi-Fi changes itself ----------
  try {
    const NS = webapis.network.NetworkState;
    webapis.network.addNetworkStateChangeListener(state => {
      if (state === NS.GATEWAY_DISCONNECTED || state === NS.LAN_CABLE_DETACHED || state === NS.WIFI_MODULE_STATE_DETACHED) window.dispatchEvent(new Event('offline'));
      else if (state === NS.GATEWAY_CONNECTED || state === NS.LAN_CABLE_ATTACHED) window.dispatchEvent(new Event('online'));
    });
  } catch (e) {}

  // ---------- screensaver: off while a video plays, back on when it stops or pauses ----------
  const screenSaver = on => {
    try {
      const S = webapis.appcommon.AppCommonScreenSaverState;
      webapis.appcommon.setScreenSaver(on ? S.SCREEN_SAVER_ON : S.SCREEN_SAVER_OFF);
    } catch (e) {}
  };

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
    open(url, again) {
      const at = this.t;
      this.stop();
      this.url = url;
      if (!again) { this.reconnects = 0; this.played = false; }
      else if (isFinite(this.dur) && at > 5) this.pendingSeek = at; // films: carry on where it dropped
      this.t = 0;
      this.dur = NaN;
      this.isPaused = false;
      const mine = url;
      try {
        av.open(url);
        av.setDisplayRect(0, 0, 1920, 1080);
        av.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX');
        // Slow lines: start after 5 s of video, and after a freeze wait for 10 s so it doesn't
        // stop again straight away. Adaptive streams start on their lowest level and climb.
        try {
          av.setBufferingParam('PLAYER_BUFFER_FOR_PLAY', 'PLAYER_BUFFER_SIZE_IN_SECOND', 5);
          av.setBufferingParam('PLAYER_BUFFER_FOR_RESUME', 'PLAYER_BUFFER_SIZE_IN_SECOND', 10);
        } catch (e) {}
        try { av.setTimeoutForBuffering(20); } catch (e) {}
        try { av.setStreamingProperty('ADAPTIVE_INFO', 'STARTBITRATE=LOWEST'); } catch (e) {}
        av.setListener({
          onbufferingstart: () => this.emit('waiting'),
          onbufferingcomplete: () => this.emit('playing'),
          oncurrentplaytime: ms => { this.t = ms / 1000; },
          onstreamcompleted: () => { screenSaver(true); this.emit('ended'); },
          onerror: err => { if (this.url === mine && !this.reconnect()) { this.error = err; this.emit('error'); } },
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
          screenSaver(false);
          this.played = true;
          this.reconnects = 0;
          this.emit('playing');
        }, err => { if (this.url === mine && !this.reconnect()) { this.error = err; this.emit('error'); } });
      } catch (e) {
        setTimeout(() => { if (this.url === mine) this.emit('error'); }, 0);
      }
    },
    // A stream that was playing and dropped reopens quietly (up to 8 times, waiting a little
    // longer each time) before player.js hears about an error.
    reconnect() {
      if (!this.played || this.reconnects >= 8) return false;
      const url = this.url;
      this.reconnects++;
      this.emit('waiting');
      clearTimeout(this.again);
      this.again = setTimeout(() => { if (this.url === url) this.open(url, true); }, Math.min(8000, 1000 * this.reconnects));
      return true;
    },
    stop() {
      clearTimeout(this.again);
      this.url = '';
      screenSaver(true);
      try {
        const st = av.getState();
        if (st !== 'NONE' && st !== 'IDLE') av.stop();
        av.close();
      } catch (e) {}
    },
    play() { try { av.play(); this.isPaused = false; screenSaver(false); } catch (e) {} return Promise.resolve(); },
    pause() { try { av.pause(); this.isPaused = true; screenSaver(true); } catch (e) {} },
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

  // On-screen controls for movies and episodes (AVPlay has none): ⏪ 30 s · play/pause · ⏩ 30 s ·
  // stop, plus the time and a progress bar. OK shows them; ◀ ▶ move between buttons; ▲ ▼ hide them.
  document.addEventListener('DOMContentLoaded', () => {
    const player = document.getElementById('player');
    const icon = d => '<svg viewBox="0 0 24 24"><path fill="currentColor" d="' + d + '"/></svg>';
    const PLAY = icon('M8 5v14l11-7z'), PAUSE = icon('M7 5h3.5v14H7zM13.5 5H17v14h-3.5z');
    const bar = document.createElement('div');
    bar.className = 'tz-progress';
    bar.innerHTML = '<div class="tz-ctl">' +
      '<button class="round-btn" data-tz="rew" aria-label="Rewind 30 seconds">' + icon('M11 18V6l-8.5 6zm.5-6 8.5 6V6z') + '</button>' +
      '<button class="round-btn tz-pp" data-tz="pp" aria-label="Pause">' + PAUSE + '</button>' +
      '<button class="round-btn" data-tz="ff" aria-label="Forward 30 seconds">' + icon('M4 18l8.5-6L4 6zm9-12v12l8.5-6z') + '</button>' +
      '<button class="round-btn" data-tz="stop" aria-label="Stop">' + icon('M6 6h12v12H6z') + '</button>' +
      '</div><span class="tz-time"></span><span class="bar"><i></i></span><span class="tz-dur"></span>';
    player.appendChild(bar);
    const ctl = bar.querySelector('.tz-ctl');
    const btns = [].slice.call(ctl.querySelectorAll('button'));
    const P = () => window.Player;
    const vod = () => P() && P().isOpen() && P().item && P().item.kind !== 'live';
    const act = name => {
      const v = P().video;
      if (name === 'rew') v.currentTime = Math.max(0, v.currentTime - 30);
      else if (name === 'ff') v.currentTime = v.currentTime + 30;
      else if (name === 'pp') { if (v.paused) v.play(); else v.pause(); }
      else if (name === 'stop') { P().close(); return; }
      paint();
    };
    ctl.addEventListener('click', e => { const b = e.target.closest('[data-tz]'); if (b) act(b.dataset.tz); });
    document.addEventListener('keydown', e => {
      if (!vod()) return;
      const a = document.activeElement, i = btns.indexOf(a);
      if (i < 0) {
        // OK on the playing video: show the controls on play/pause.
        if (e.key === 'Enter' && P().mediaFocused()) { e.preventDefault(); e.stopImmediatePropagation(); P().poke(); btns[1].focus(); }
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault(); e.stopImmediatePropagation(); P().poke();
        btns[Math.max(0, Math.min(btns.length - 1, i + (e.key === 'ArrowLeft' ? -1 : 1)))].focus();
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault(); e.stopImmediatePropagation(); P().video.focus();
      }
    }, true);
    const fmt = s => { s = Math.floor(s); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
    function paint() {
      const on = vod();
      bar.hidden = !on;
      if (!on) return;
      const v = P().video, d = v.duration;
      // Paused: keep the controls on screen so the state is clear.
      if (v.paused) player.classList.add('ui');
      else if (!player.classList.contains('ui') && ctl.contains(document.activeElement)) v.focus();
      const pp = btns[1];
      pp.innerHTML = v.paused ? PLAY : PAUSE;
      pp.setAttribute('aria-label', window.T(v.paused ? 'Play' : 'Pause'));
      bar.classList.toggle('paused', v.paused);
      if (!(d > 0 && isFinite(d))) return;
      bar.querySelector('.tz-time').textContent = fmt(v.currentTime);
      bar.querySelector('.tz-dur').textContent = fmt(d);
      bar.querySelector('i').style.width = Math.min(100, (v.currentTime / d) * 100).toFixed(2) + '%';
    }
    setInterval(paint, 500);
  });
})();
