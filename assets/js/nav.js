/* Arrow-key / TV-remote navigation: moves focus to the nearest element in the pressed direction. */
(function () {
  const FOCUSABLE = 'button:not([disabled]), a[href], input, select, [tabindex]:not([tabindex="-1"])';
  const DIRS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

  function scope() {
    // The code keypad sits on top of everything, including an open Settings window.
    const keypad = document.querySelector('.pin-dlg');
    if (keypad) return keypad;
    const modal = document.querySelector('#modal:not(.hidden)');
    if (modal) return modal;
    const login = document.querySelector('#login:not(.hidden)');
    return login || document.querySelector('#app');
  }

  function visible(el) {
    if (el.closest('[inert]')) return false; // hidden slides etc.; older TVs ignore inert themselves
    if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function find(from, dir) {
    const root = scope();
    // ◀ ▶ on the menu stay on the menu (the Movies / Series banner sits under it and took the focus).
    const bar = (dir === 'left' || dir === 'right') && from && from.closest && from.closest('.topbar');
    // Settings is a form: ▲ ▼ land on the first control of the next row (the guide link field, not
    // its Check button; Add playlist, not Add from phone).
    if ((dir === 'up' || dir === 'down') && root.matches('.modal.settings') && from && root.contains(from)) {
      const a = from.getBoundingClientRect();
      const cands = [...root.querySelectorAll(FOCUSABLE)].filter(el => el !== from && visible(el)).map(el => [el, el.getBoundingClientRect()])
        .filter(([, b]) => dir === 'up' ? b.bottom <= a.top + 4 : b.top >= a.bottom - 4);
      if (cands.length) {
        const gap = ([, b]) => dir === 'up' ? a.top - b.bottom : b.top - a.bottom;
        const near = Math.min(...cands.map(gap));
        const row = cands.filter(c => gap(c) <= near + 12);
        row.sort((x, y) => x[1].left - y[1].left);
        return row[0][0];
      }
    }
    // ◀ ▶ in a row of covers stay in that row: at its end nothing happens (it used to jump to
    // another row, e.g. from a one-item Continue Watching row up to Latest added).
    const row = (dir === 'left' || dir === 'right') && from && from.closest && from.closest('.row-scroll');
    const all = [...(bar || row || root).querySelectorAll(FOCUSABLE)].filter(el => el !== from && visible(el));
    if (!from || from === document.body || !root.contains(from)) return all[0];
    // ▼ from the search box goes to the first result (it took the one under the box's middle).
    if (dir === 'down' && from.id === 'q') {
      const first = all.find(el => el.closest('#results'));
      if (first) return first;
    }
    const a = from.getBoundingClientRect();
    const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bestScore = Infinity;
    // ▲ in a scrolled page goes up through the page, not to the menu bar that floats over it
    // (a row half under the bar was farther than the bar's Home / Settings buttons).
    const skipBar = dir === 'up' && root.id === 'app' && window.scrollY > 10 && !(from.closest && from.closest('.topbar'))
      && all.some(el => !el.closest('.topbar') && el.getBoundingClientRect().bottom <= a.top + 4);
    for (const el of all) {
      if (skipBar && el.closest('.topbar')) continue;
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
      // Settings is a form: ▲ ▼ go row by row, or a control at the other side of a row gets skipped.
      const score = (dir === 'up' || dir === 'down') && root.matches('.modal.settings')
        ? Math.max(main, 0) + cross * 0.02
        : Math.max(main, 0) + cross * (overlap > 0 ? 0.3 : 2.5);
      if (score < bestScore) { bestScore = score; best = el; }
    }
    // ◀ back into the category list lands on the category being shown, not on whichever one is level
    // with the channel (Live TV, Movies, Series).
    // ▶ into the channel list starts at its top (the channel being watched when it's in sight), not
    // at the row that happened to be level with the category.
    const chs = best && (dir === 'left' || dir === 'right') && best.closest('#chList');
    if (chs && !chs.contains(from)) {
      const lr = chs.getBoundingClientRect();
      const seen = [...chs.querySelectorAll('.ch')].filter(c => { const r = c.getBoundingClientRect(); return r.height && r.top >= lr.top - 2 && r.bottom <= Math.min(lr.bottom, innerHeight) + 2; });
      const on = seen.find(c => c.classList.contains('playing') || c.classList.contains('active'));
      if (on || seen[0]) return on || seen[0];
    }
    const list = best && (dir === 'left' || dir === 'right') && best.closest('#catList');
    if (list && !list.contains(from)) {
      const on = list.querySelector('.cat.active');
      if (on && visible(on)) return on;
    }
    return best;
  }

  // Android TV: moving onto a text field opened the on-screen keyboard at once, and the keyboard then
  // took every ▼ (Settings got stuck on the playlist link). A field reached with the arrows stays
  // keyboard-less until OK, like on Samsung (tizen.js); the arrows keep moving on from it.
  const isText = el => el && el.matches && el.matches('input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea');
  const quietFields = () => { const c = document.documentElement.classList; return c.contains('tv') && c.contains('native-android'); };
  // Read-only until OK (the TV keyboard ignores inputmode="none").
  const quiet = el => { if (el.readOnly) return; el.setAttribute('data-im', ''); el.readOnly = true; };
  const unquiet = el => {
    if (!el.hasAttribute('data-im')) return;
    el.removeAttribute('data-im');
    el.readOnly = false;
  };
  document.addEventListener('focusout', e => { if (isText(e.target)) unquiet(e.target); }, true);
  document.addEventListener('keydown', e => {
    const t = e.target;
    if (e.key !== 'Enter' || !isText(t) || !t.hasAttribute('data-im')) return;
    e.preventDefault();
    e.stopPropagation();
    unquiet(t);
    t.blur();
    setTimeout(() => t.focus(), 30); // focused again with its keyboard
  }, true);

  document.addEventListener('keydown', e => {
    const dir = DIRS[e.key];
    if (!dir || e.defaultPrevented || (window.Player && Player.isOpen())) return;
    const active = document.activeElement;
    if (active && active.matches('input[type="text"], input[type="search"], input[type="password"], input[type="url"], textarea')) {
      // Typing (keyboard opened with OK): ◀ ▶ move the cursor. Only passing through: they move on.
      if ((dir === 'left' || dir === 'right') && !active.hasAttribute('data-im')) return;
    }
    // On a TV the remote's arrows would change a dropdown's value and trap the focus there: move
    // on instead (OK opens the dropdown). Elsewhere the arrows keep changing the value.
    if (active && active.tagName === 'SELECT' && !document.documentElement.classList.contains('tv')) return;
    const next = find(active, dir);
    if (!next) return;
    e.preventDefault();
    if (quietFields() && isText(next)) quiet(next);
    next.focus({ preventScroll: true });
    // Back to the menu: the page goes back to its top (the banner was left half under the bar).
    if (next.closest('.topbar') && !(active && active.closest && active.closest('.topbar'))) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    // Keep what has the focus out from under the floating menu bar.
    const topbar = document.querySelector('.topbar');
    const pad = topbar && getComputedStyle(topbar).position === 'fixed' && !next.closest('#modal') ? Math.round(topbar.getBoundingClientRect().bottom) + 16 : 0;
    document.documentElement.style.scrollPaddingTop = pad + 'px';
    next.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  });
})();
