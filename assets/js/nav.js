/* Arrow-key / TV-remote navigation: moves focus to the nearest element in the pressed direction. */
(function () {
  const FOCUSABLE = 'button:not([disabled]), a[href], input, select, [tabindex]:not([tabindex="-1"])';
  const DIRS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

  function scope() {
    const modal = document.querySelector('#modal:not(.hidden)');
    if (modal) return modal;
    const login = document.querySelector('#login:not(.hidden)');
    return login || document.querySelector('#app');
  }

  function visible(el) {
    if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function find(from, dir) {
    const root = scope();
    const all = [...root.querySelectorAll(FOCUSABLE)].filter(el => el !== from && visible(el));
    if (!from || from === document.body || !root.contains(from)) return all[0];
    const a = from.getBoundingClientRect();
    const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bestScore = Infinity;
    for (const el of all) {
      const b = el.getBoundingClientRect();
      const bx = b.left + b.width / 2, by = b.top + b.height / 2;
      let main, cross;
      if (dir === 'up') { if (b.bottom > a.top + 4) continue; main = a.top - b.bottom; cross = Math.abs(bx - ax); }
      else if (dir === 'down') { if (b.top < a.bottom - 4) continue; main = b.top - a.bottom; cross = Math.abs(bx - ax); }
      else if (dir === 'left') { if (b.right > a.left + 4) continue; main = a.left - b.right; cross = Math.abs(by - ay); }
      else { if (b.left < a.right - 4) continue; main = b.left - a.right; cross = Math.abs(by - ay); }
      // Prefer elements that overlap on the cross axis (same row / column).
      const overlap = dir === 'up' || dir === 'down'
        ? Math.min(a.right, b.right) - Math.max(a.left, b.left)
        : Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      const score = Math.max(main, 0) + cross * (overlap > 0 ? 0.3 : 2.5);
      if (score < bestScore) { bestScore = score; best = el; }
    }
    return best;
  }

  document.addEventListener('keydown', e => {
    const dir = DIRS[e.key];
    if (!dir || e.defaultPrevented || (window.Player && Player.isOpen())) return;
    const active = document.activeElement;
    if (active && active.matches('input[type="text"], input[type="search"], input[type="password"], input[type="url"], textarea')) {
      if (dir === 'left' || dir === 'right') return;
    }
    // On a TV the remote's arrows would change a dropdown's value and trap the focus there: move
    // on instead (OK opens the dropdown). Elsewhere the arrows keep changing the value.
    if (active && active.tagName === 'SELECT' && !document.documentElement.classList.contains('tv')) return;
    const next = find(active, dir);
    if (!next) return;
    e.preventDefault();
    next.focus({ preventScroll: true });
    next.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  });
})();
