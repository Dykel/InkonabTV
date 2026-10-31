/* Android app glue (Capacitor). Does nothing on the website. */
(function () {
  const C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;

  const NativePlayer = C.registerPlugin('NativePlayer');
  const AppPlugin = C.registerPlugin('App');
  window.Native = { player: NativePlayer, app: AppPlugin };
  document.documentElement.classList.add('native', 'native-' + C.getPlatform());

  // TVs report a ~960px-wide screen; lay the page out at 1600px (the desktop design) and scale it down.
  NativePlayer.info().then(info => {
    if (!info.tv) return;
    document.documentElement.classList.add('tv');
    document.querySelector('meta[name="viewport"]').setAttribute('content', 'width=1600');
    tvKeyboard();
  }).catch(() => {});

  // On TV, moving onto a text field must not pop up the on-screen keyboard (it would trap the remote).
  // The keyboard opens only when OK is pressed on the field, like native TV apps.
  function tvKeyboard() {
    const isText = el => el && el.matches && el.matches('input:not([type="checkbox"]):not([type="radio"]), textarea');
    document.addEventListener('focusin', e => {
      if (isText(e.target) && !e.target.dataset.typing) e.target.setAttribute('inputmode', 'none');
    }, true);
    document.addEventListener('focusout', e => {
      // The WebView briefly blurs and refocuses a field when OK is pressed: keep it editable then.
      if (isText(e.target) && Date.now() > (Number(e.target.dataset.hold) || 0)) delete e.target.dataset.typing;
    }, true);
    // The web engine needs a moment to register the attribute change before Android will show
    // the keyboard for the field (tested: immediately = ignored, 400 ms = shown).
    const openKeyboard = t => {
      const editable = () => { t.dataset.typing = '1'; t.removeAttribute('inputmode'); };
      t.dataset.hold = String(Date.now() + 1500);
      editable();
      if (document.activeElement !== t) t.focus();
      // Re-apply after the WebView's own OK handling, then ask Android for the keyboard.
      setTimeout(() => {
        if (document.activeElement !== t) t.focus();
        editable();
        setTimeout(() => { if (document.activeElement === t) NativePlayer.showKeyboard().catch(() => {}); }, 400);
      }, 150);
    };
    // Called by MainActivity when OK is pressed (the WebView doesn't pass it on for text fields).
    window.InkonabTV = {
      okPressed() {
        const t = document.activeElement;
        if (!isText(t)) return false;
        openKeyboard(t);
        return true;
      },
      // ▲/▼ on a field that is still editable (keyboard closed with Back): the WebView moves the
      // focus itself; make the field we leave remote-friendly again (no keyboard on next visit).
      arrow() {
        const t = document.activeElement;
        if (!isText(t) || t.getAttribute('inputmode') === 'none') return false;
        delete t.dataset.typing;
        t.dataset.hold = '0';
        t.setAttribute('inputmode', 'none');
        return true;
      },
    };
    document.addEventListener('keydown', e => {
      const t = e.target;
      if (e.key !== 'Enter' || !isText(t)) return;
      // OK on a field: open the keyboard.
      if (t.getAttribute('inputmode') === 'none') {
        e.preventDefault();
        e.stopPropagation();
        openKeyboard(t);
        return;
      }
      // Next/Done on the keyboard in Username: go to Password and keep typing.
      if (t.id === 'loginUser') {
        e.preventDefault();
        e.stopPropagation();
        const pass = document.getElementById('loginPass');
        pass.dataset.typing = '1';
        openKeyboard(pass);
      }
    }, true);
    // A field focused before we knew this is a TV (sign-in screen): re-focus it so the rule applies.
    const a = document.activeElement;
    if (isText(a)) { a.blur(); a.focus(); }
  }

  // VPN status badge in the top bar (green when connected, amber while connecting).
  const pill = document.getElementById('vpnPill');
  const paintVpn = v => {
    if (!pill || !v) return;
    const country = (v.server || '').split(' · ')[0];
    pill.className = 'vpn-pill ' + v.state;
    pill.innerHTML = v.state === 'connected' ? `<i></i>VPN · ${country}` : v.state === 'connecting' ? '<i></i>VPN connecting…' : '<i></i>VPN off';
    pill.title = v.state === 'connected' ? 'Connected to ' + v.server : v.detail || '';
    if (v.mode === 'off' && v.state !== 'connected') pill.classList.add('hidden');
  };
  NativePlayer.vpnStatus().then(paintVpn).catch(() => {});
  NativePlayer.addListener('vpn', paintVpn);
  if (pill) pill.addEventListener('click', () => window.App && App.openSettings());

  // Remote / phone Back: same as Escape in the web app (close dialog, go Home); exit from Home or sign-in.
  AppPlugin.addListener('backButton', () => {
    const target = document.activeElement || document.body;
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    if (target.dispatchEvent(ev) && (!window.App || App.confirmExit())) AppPlugin.exitApp();
  });
})();
