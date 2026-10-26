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
      if (isText(e.target)) delete e.target.dataset.typing;
    }, true);
    document.addEventListener('keydown', e => {
      const t = e.target;
      if (e.key !== 'Enter' || !isText(t) || t.getAttribute('inputmode') !== 'none') return;
      e.preventDefault();
      e.stopPropagation();
      t.dataset.typing = '1';
      t.removeAttribute('inputmode');
      t.blur();
      setTimeout(() => { t.dataset.typing = '1'; t.focus(); }, 0);
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
    if (target.dispatchEvent(ev)) AppPlugin.exitApp();
  });
})();
