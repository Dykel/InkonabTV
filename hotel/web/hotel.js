/* InkonabTV Hotel: the welcome screen (channels, Wi-Fi, hotel information) for hotel room TVs.
 * Settings come from config.js (window.INKONAB_CONFIG.hotel, written by scripts/build-web.mjs from
 * hotel/hotel.json). The playlist is downloaded again at every start; the saved copy is only used
 * when the internet is down. */
(function () {
  const H = (window.INKONAB_CONFIG && window.INKONAB_CONFIG.hotel) || {};
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k) { try { return localStorage.getItem('hotel.' + k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem('hotel.' + k, v); } catch {} },
  };
  const native = () => window.Native && Native.player;
  let channels = [];
  let countdown = null;
  let exitArmed = 0;
  let playing = false;

  // ---------- static parts: name, clock, Wi-Fi, information, website ----------

  function qrSrc(text, cell) {
    try {
      const q = qrcode(0, 'M');
      q.addData(text);
      q.make();
      return q.createDataURL(cell, 0);
    } catch { return ''; }
  }

  function paintStatic() {
    $('hotelName').textContent = H.name || 'Welcome';
    document.title = H.name || 'InkonabTV Hotel';
    const w = H.wifi || {};
    if (w.ssid) {
      $('wifiQr').src = qrSrc(w.qr || `WIFI:S:${w.ssid};T:${w.security || 'WPA'};P:${w.password || ''};;`, 6);
      $('ssid').textContent = w.ssid;
      $('pass').textContent = w.password || '';
      $('passLabel').classList.toggle('hidden', !w.password);
      $('pass').classList.toggle('hidden', !w.password);
    } else document.querySelector('.wifi').classList.add('hidden');
    $('info').innerHTML = (H.info || []).map(i => `
      <li><div class="what">${esc(i.en)}<span>${esc(i.fr)}</span></div>
      <div class="when">${esc(i.time)}${i.note ? `<small>${esc(i.note.en)} · ${esc(i.note.fr)}</small>` : ''}</div></li>`).join('');
    if (!(H.info || []).length) document.querySelector('.info').classList.add('hidden');
    if (H.website) {
      $('webQr').src = qrSrc(H.website, 5);
      $('webUrl').textContent = H.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
    } else document.querySelector('.web').classList.add('hidden');
  }

  function tick() {
    const d = new Date();
    $('time').textContent = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    $('date').textContent = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  // ---------- playlist ----------

  async function download(url) {
    const fresh = url + (url.includes('?') ? '&' : '?') + 't=' + Date.now();
    // The playlist site sends no CORS headers: the Android app reads it natively.
    if (native()) {
      const r = await Native.player.fetchText({ url: fresh });
      if (!r.ok) throw new Error(r.text || 'Download failed');
      return r.text;
    }
    const r = await fetch(fresh, { cache: 'no-store' });
    if (!r.ok) throw new Error('Playlist ' + r.status);
    return r.text();
  }

  function parse(text) {
    const out = [];
    let cur = null;
    for (const raw of String(text).split(/\r?\n/)) {
      const line = raw.trim();
      if (line.startsWith('#EXTINF')) {
        let rest = line.replace(/^#EXTINF:\s*-?\d+(\.\d+)?/, '');
        const attrs = {};
        const re = /^\s*([\w-]+)="([^"]*)"/;
        let m;
        while ((m = rest.match(re))) { attrs[m[1].toLowerCase()] = m[2]; rest = rest.slice(m[0].length); }
        const name = rest.replace(/^\s*,/, '').trim();
        cur = { name: name || attrs['tvg-name'] || 'Channel', logo: attrs['tvg-logo'] || '', group: attrs['group-title'] || '' };
      } else if (line && !line.startsWith('#') && cur) {
        cur.url = line;
        cur.radio = /radio|\bfm\b/i.test(cur.name) || /\.(mp3|aac)(\?|$)/i.test(line);
        out.push(cur);
        cur = null;
      }
    }
    return out;
  }

  async function loadChannels() {
    let text = '';
    try {
      text = await download(H.playlist);
      if (parse(text).length) store.set('m3u', text);
    } catch (e) {
      console.warn('[hotel] playlist', e);
      text = store.get('m3u') || '';
      if (text) toast('No internet: showing the saved channels · Pas d’internet');
    }
    channels = parse(text);
    paintGrid();
    return channels.length;
  }

  function paintGrid() {
    const grid = $('grid');
    if (!channels.length) {
      grid.innerHTML = `<p class="note">The channels can’t be loaded right now. Check the internet connection, then press OK to try again.<br>
        Impossible de charger les chaînes. Vérifiez la connexion internet puis appuyez sur OK.</p>
        <button class="btn tile-retry" id="retry">Try again · Réessayer</button>`;
      $('retry').addEventListener('click', () => { grid.innerHTML = '<p class="note">Loading channels… · Chargement des chaînes…</p>'; loadChannels().then(focusFirst); });
      return;
    }
    const last = store.get('last');
    grid.innerHTML = channels.map((c, i) => {
      const letters = c.name.split(/\s+/).map(w => w[0]).join('').slice(0, 3).toUpperCase();
      return `<button class="tile${c.url === last ? ' last' : ''}" data-i="${i}">
        <span class="logo">${c.logo ? `<img src="${esc(c.logo)}" alt="" loading="lazy">` : `<span class="letters">${esc(letters)}</span>`}</span>
        <span class="num">${i + 1}</span>
        <span class="name">${esc(c.name)}</span>
      </button>`;
    }).join('');
    grid.querySelectorAll('.tile img').forEach(img => img.addEventListener('error', () => {
      const name = channels[Number(img.closest('.tile').dataset.i)].name;
      img.replaceWith(Object.assign(document.createElement('span'), { className: 'letters', textContent: name.split(/\s+/).map(w => w[0]).join('').slice(0, 3).toUpperCase() }));
    }));
    grid.querySelectorAll('.tile').forEach(t => t.addEventListener('click', () => play(Number(t.dataset.i))));
  }

  function focusFirst() {
    const t = document.querySelector('.tile.last') || document.querySelector('.tile') || document.querySelector('#retry');
    if (t) t.focus({ preventScroll: false });
  }

  // ---------- playback ----------

  async function play(i) {
    stopCountdown();
    const ch = channels[i];
    if (!ch) return;
    store.set('last', ch.url);
    if (!native()) return playWeb(ch);
    // Native player (ExoPlayer): every channel in one group, so ▲ ▼ zap through them all.
    // "free: false": a channel that won't play directly is tried through the free VPN.
    const payload = {
      live: true, template: '', group: 0, index: i, version: 0,
      groups: [{ key: 'hotel', name: H.name || 'Channels', items: channels.map((_, n) => n) }],
      channels: channels.map((c, n) => ({
        title: c.name, img: c.logo, num: String(n + 1), radio: c.radio, gkey: c.url, fav: false, free: false,
        epgId: '', cu: '', versions: [{ url: c.url, label: '' }],
      })),
    };
    let r = {};
    playing = true;
    try {
      await Native.player.stage({ payload: JSON.stringify(payload) });
      r = await Native.player.play({ staged: true });
    } catch (e) { toast('Can’t open the player'); console.warn('[hotel] player', e); }
    playing = false;
    const back = channels[r.index != null ? r.index : i];
    if (back) store.set('last', back.url);
    paintGrid();
    focusFirst();
  }

  // Website / computer test: a plain video element (hls.js when the browser has no HLS).
  let hls = null;
  function playWeb(ch) {
    const box = $('webPlayer'), v = $('video');
    box.classList.remove('hidden');
    if (hls) { hls.destroy(); hls = null; }
    if (v.canPlayType('application/vnd.apple.mpegurl') || !/\.m3u8(\?|$)/i.test(ch.url)) v.src = ch.url;
    else {
      const go = () => { hls = new Hls(); hls.loadSource(ch.url); hls.attachMedia(v); };
      if (window.Hls) go();
      else { const s = document.createElement('script'); s.src = 'assets/js/vendor/hls.min.js'; s.onload = go; document.head.appendChild(s); }
    }
    v.focus();
  }
  function closeWeb() {
    const v = $('video');
    if (hls) { hls.destroy(); hls = null; }
    v.removeAttribute('src'); v.load();
    $('webPlayer').classList.add('hidden');
    paintGrid();
    focusFirst();
  }

  // ---------- autoplay at start ----------

  function startCountdown() {
    const secs = autoplaySecs();
    if (!channels.length || !(secs >= 0)) return;
    const last = store.get('last');
    let i = Math.max(0, channels.findIndex(c => c.url === last));
    if (secs === 0) return play(i);
    let left = secs;
    const box = $('autoplay');
    const paint = () => { box.innerHTML = `▶ <b>${esc(channels[i].name)}</b> starts in ${left} s · démarre dans ${left} s<small>Press any button to stay here · Appuyez sur une touche pour rester</small>`; };
    paint();
    box.classList.remove('hidden');
    countdown = setInterval(() => {
      left -= 1;
      if (left <= 0) { stopCountdown(); play(i); } else paint();
    }, 1000);
  }
  function stopCountdown() {
    if (countdown) clearInterval(countdown);
    countdown = null;
    $('autoplay').classList.add('hidden');
  }

  // ---------- remote control: move between tiles and buttons ----------

  function focusables() {
    const modal = $('modal');
    const scope = modal.classList.contains('hidden') ? document : modal;
    return [...scope.querySelectorAll('.tile, #retry, .gear, .btn')].filter(el => el.offsetParent !== null || el.classList.contains('gear'));
  }
  function move(dir) {
    const list = focusables();
    const cur = document.activeElement;
    if (!list.includes(cur)) return focusFirst() || (list[0] && list[0].focus());
    const a = cur.getBoundingClientRect();
    const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bestScore = Infinity;
    for (const el of list) {
      if (el === cur) continue;
      const b = el.getBoundingClientRect();
      const bx = b.left + b.width / 2, by = b.top + b.height / 2;
      const dx = bx - ax, dy = by - ay;
      const main = dir === 'ArrowRight' ? dx : dir === 'ArrowLeft' ? -dx : dir === 'ArrowDown' ? dy : -dy;
      const side = dir === 'ArrowRight' || dir === 'ArrowLeft' ? Math.abs(dy) : Math.abs(dx);
      if (main <= 4) continue;
      const score = main + side * 2.2;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    if (best) { best.focus(); best.scrollIntoView({ block: 'nearest' }); }
  }

  document.addEventListener('keydown', e => {
    if (countdown) { stopCountdown(); e.preventDefault(); e.stopPropagation(); return; }
    if (!$('webPlayer').classList.contains('hidden')) {
      if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); closeWeb(); }
      return;
    }
    if (e.key === 'Escape') {
      if (!$('modal').classList.contains('hidden')) { e.preventDefault(); closeSettings(); }
      return; // on the welcome screen: native.js asks App.confirmExit()
    }
    if (/^Arrow/.test(e.key)) { e.preventDefault(); move(e.key); return; }
    // Number keys on the remote: play that channel.
    if (/^[1-9]$/.test(e.key) && $('modal').classList.contains('hidden')) {
      const n = Number(e.key) - 1;
      if (channels[n]) { e.preventDefault(); play(n); }
    }
    if (e.key === 'ContextMenu' || e.key === 'Menu') { e.preventDefault(); openSettings(); }
  }, true);
  document.addEventListener('mousedown', () => stopCountdown(), true);
  document.addEventListener('touchstart', () => stopCountdown(), { capture: true, passive: true });

  // ---------- staff settings (⚙ at the bottom right, or the remote's Menu key) ----------

  // Autoplay at start: chosen in Settings (saved on this TV), else hotel.json's autoplayDelay.
  // -1 = off, 0 = at once, else seconds of countdown.
  function autoplaySecs() {
    const saved = store.get('autoplay');
    return saved != null && saved !== '' ? Number(saved) : Number(H.autoplayDelay);
  }

  async function openSettings(focusKey) {
    stopCountdown();
    const P = native();
    const vpn = P ? await P.vpnStatus().catch(() => null) : null;
    const auto = P && P.autostartStatus ? await P.autostartStatus().catch(() => null) : null;
    const ver = P ? await P.appVersion().catch(() => null) : null;
    const secs = autoplaySecs();
    const modal = $('modal');
    modal.innerHTML = `<div class="sheet">
      <h2>Settings · Réglages</h2>
      <p>For hotel staff. Channels are downloaded from the hotel playlist at every start.</p>

      <h3>1 · Start with the TV <span class="${auto && auto.allowed ? 'ok' : 'warn'}">${!P ? 'only in the TV app' : auto && auto.allowed ? 'ON ✓' : 'OFF'}</span></h3>
      <p>The app opens by itself when the TV is switched on or wakes up. Android asks for
        “Display over other apps” (or “Appear on top”) for this: press the button, choose
        <b>InkonabTV Hotel</b>, switch it on, then press Back.</p>
      ${P ? `<div class="row"><button class="btn${auto && auto.allowed ? '' : ' on'}" data-act="autostart">${auto && auto.allowed ? 'Open the setting' : 'Switch it on'}</button></div>` : ''}

      <h3>2 · Autoplay when the app opens <span class="${secs >= 0 ? 'ok' : 'warn'}">${secs < 0 ? 'OFF' : secs === 0 ? 'ON · at once' : 'ON · after ' + secs + ' s'}</span></h3>
      <p>Plays the last watched channel. Guests can press any button during the countdown to stay on this screen.</p>
      <div class="row">${[[-1, 'Off'], [0, 'At once'], [5, '5 s'], [10, '10 s'], [30, '30 s']].map(([v, l]) =>
        `<button class="btn${secs === v ? ' on' : ''}" data-autoplay="${v}">${l}</button>`).join('')}</div>

      ${vpn && vpn.available ? `
        <h3>3 · Free VPN <span class="muted">${esc(vpn.state)}${vpn.server ? ' · ' + esc(vpn.server) : ''}</span></h3>
        <p>Automatic: used only when a channel won’t play.</p>
        <div class="row">${['auto', 'always', 'off'].map(m => `<button class="btn${vpn.mode === m ? ' on' : ''}" data-vpn="${m}">${{ auto: 'Automatic', always: 'Always on', off: 'Off' }[m]}</button>`).join('')}</div>` : ''}

      <div class="row last">
        <button class="btn" data-act="reload">Reload channels</button>
        <button class="btn" data-act="close">Close</button>
        <span class="status">${ver ? 'InkonabTV Hotel ' + esc(ver.name) + ' · ' : ''}${channels.length} channels</span>
      </div>
    </div>`;
    modal.classList.remove('hidden');
    modal.querySelectorAll('[data-vpn]').forEach(b => b.addEventListener('click', async () => {
      await P.vpnSettings({ mode: b.dataset.vpn }).catch(() => {});
      if (b.dataset.vpn === 'always') P.vpnConnect().catch(() => {});
      openSettings('[data-vpn="' + b.dataset.vpn + '"]');
    }));
    modal.querySelectorAll('[data-autoplay]').forEach(b => b.addEventListener('click', () => {
      store.set('autoplay', b.dataset.autoplay);
      openSettings('[data-autoplay="' + b.dataset.autoplay + '"]');
    }));
    const on = (act, fn) => { const b = modal.querySelector(`[data-act="${act}"]`); if (b) b.addEventListener('click', fn); };
    on('autostart', () => { settingsAway = true; P.autostartSettings().catch(() => {}); });
    on('reload', () => { closeSettings(); loadChannels().then(n => { toast(n + ' channels'); focusFirst(); }); });
    on('close', closeSettings);
    const f = (typeof focusKey === 'string' && modal.querySelector(focusKey)) || modal.querySelector('.btn');
    if (f) f.focus();
  }
  let settingsAway = false;
  // Back from Android's "Display over other apps" screen: show the new state. (The page isn't
  // always told it was hidden while another screen was on top, so listen for the app's resume too.)
  const backFromSettings = () => {
    if (!settingsAway || $('modal').classList.contains('hidden')) return;
    settingsAway = false;
    openSettings('[data-act="autostart"]');
  };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) backFromSettings(); });
  window.addEventListener('focus', backFromSettings);
  if (window.Native && Native.app) Native.app.addListener('resume', () => setTimeout(backFromSettings, 300));
  function closeSettings() {
    $('modal').classList.add('hidden');
    $('gear').focus();
  }
  $('gear').addEventListener('click', () => openSettings());

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => t.classList.remove('show'), 3200);
  }

  // native.js calls these: Back on the welcome screen exits only when pressed twice.
  window.App = {
    confirmExit() {
      if (Date.now() - exitArmed < 2500) return true;
      exitArmed = Date.now();
      toast('Press Back again to leave · Appuyez encore sur Retour pour quitter');
      return false;
    },
    openSettings,
  };

  // The TV was switched on again (MainActivity, hotel/BootReceiver): fresh channels, then the countdown.
  window.HotelStart = () => {
    if (playing || countdown) return;
    if (!$('modal').classList.contains('hidden')) closeSettings();
    loadChannels().then(n => { focusFirst(); if (n) startCountdown(); });
  };

  // ---------- start ----------
  paintStatic();
  tick();
  setInterval(tick, 10000);
  loadChannels().then(n => {
    focusFirst();
    if (n) startCountdown();
  });
  // Coming back to the app (TV woke up, Home → app): fetch the playlist again if it's been a while.
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (hiddenAt && Date.now() - hiddenAt > 30 * 60 * 1000) loadChannels().then(focusFirst);
  });
})();
