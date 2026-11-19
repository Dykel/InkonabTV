/* Profiles: several viewers on one account, each with their own favourites, Continue Watching,
   groups, reminders and multiview. A kids profile shows only kids and family categories, never
   adult content, and leaving it asks for the parental PIN. Switching reloads the app (the playlist
   comes back from the device at once), so every list is built again for that profile. */
(function () {
  const COLORS = ['#fbc50c', '#4cc38a', '#4ea8ff', '#ff7a59', '#b48cff', '#ff5c93', '#36c2c2', '#e0e0e0'];
  // Kids and family categories, in the playlist languages the app knows.
  const KIDS = /\b(kids?|enfants?|jeunesse|junior|juniors|cartoons?|toons?|dessins? animes?|anime?s?|animation|animados?|animati|family|famille|familial|familia|famiglia|disney|pixar|dreamworks|nickelodeon|nick jr|baby|bebe|ninos?|ninas?|infantil|infantis|kinder|kinderfilme|bambini|ragazzi|criancas|kika|gulli|boing|teletoon|piwi|tiji|cartoonito)\b/;
  const KIDS_GENRE = /\b(animation|family|famille|familial|kids|enfants|anime)\b/;
  const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9+]+/g, ' ');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const T = s => (window.T ? window.T(s) : s);

  const Profiles = {
    // [{ id, name, color, kids }]; the main profile has id '' and always exists.
    list() {
      const saved = Store.get('profiles', null);
      const list = Array.isArray(saved) && saved.length ? saved : [];
      if (!list.some(p => p.id === '')) list.unshift({ id: '', name: T('Main'), color: COLORS[0], kids: false });
      return list;
    },
    save(list) { Store.set('profiles', list); },
    current() { return this.list().find(p => p.id === Store.profile) || this.list()[0]; },
    get kids() { return !!this.current().kids; },

    // Content rules for a kids profile.
    kidsCategory(name) { return KIDS.test(fold(name)); },
    kidsItem(item, catOk) {
      if (!item || item.adult) return false;
      if (catOk) return true;
      return KIDS_GENRE.test(fold(item.genre)) && !/\b(horror|horreur|thriller|erotic|erotique)\b/.test(fold(item.genre));
    },

    // ---------- switching ----------
    async use(id) {
      const cur = this.current(), next = this.list().find(p => p.id === id);
      if (!next || next.id === cur.id) return App.closeModal();
      // A kids profile is left with the parental PIN only.
      if (cur.kids && !next.kids) {
        if (!Settings.adultPin) { App.toast(T('Set a parental PIN in Settings first')); return; }
        if (!(await App.askPin('check'))) return;
      }
      try { localStorage.setItem('itv.profile', JSON.stringify(id)); } catch {}
      sessionStorage.setItem('itv.profileChosen', '1');
      location.reload();
    },

    // ---------- "Who's watching?" ----------
    // At start, when there is more than one profile (once per app start).
    askAtStart() {
      const list = this.list();
      if (list.length < 2 || sessionStorage.getItem('itv.profileChosen')) return;
      sessionStorage.setItem('itv.profileChosen', '1');
      this.open(true);
    },

    // The profile sheet: choose who is watching, add or manage profiles.
    open(start = false) {
      const list = this.list(), cur = this.current();
      const kidsNow = cur.kids;
      App.openModal(`<button class="round-btn close" data-close aria-label="Close">✕</button>
        <h2 class="sheet-title">${esc(T(start ? 'Who’s watching?' : 'Profiles'))}</h2>
        <div class="prof-grid">
          ${list.map(p => `<button class="prof${p.id === cur.id ? ' on' : ''}" data-p="${esc(p.id)}">
            <span class="prof-face" style="--c:${esc(p.color)}">${esc((p.name || '?')[0].toUpperCase())}${p.kids ? '<small>KIDS</small>' : ''}</span>
            <span class="prof-name">${esc(p.name)}</span></button>`).join('')}
          ${kidsNow || list.length >= 6 ? '' : `<button class="prof add" data-add><span class="prof-face">+</span><span class="prof-name">${esc(T('Add profile'))}</span></button>`}
        </div>
        ${kidsNow ? '' : `<div class="set-row prof-actions"><button class="btn ghost" data-manage>${esc(T('Manage profiles'))}</button></div>`}`, 'profiles');
      const m = $('#modal');
      m.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => this.use(b.dataset.p)));
      const add = $('[data-add]', m);
      if (add) add.addEventListener('click', () => this.edit(null));
      const man = $('[data-manage]', m);
      if (man) man.addEventListener('click', () => this.manage());
      $('[data-close]', m).addEventListener('click', () => App.closeModal());
      ($('.prof.on', m) || $('.prof', m)).focus();
    },

    manage() {
      const list = this.list();
      App.openModal(`<button class="round-btn close" data-close aria-label="Close">✕</button>
        <h2 class="sheet-title">${esc(T('Manage profiles'))}</h2>
        <div class="org-list">${list.map(p => `
          <div class="org-row"><span class="prof-face sm" style="--c:${esc(p.color)}">${esc((p.name || '?')[0].toUpperCase())}</span>
            <span class="org-name">${esc(p.name)}${p.kids ? ' <span class="chip">Kids</span>' : ''}</span>
            <button class="btn ghost sm" data-edit="${esc(p.id)}">${esc(T('Edit'))}</button></div>`).join('')}</div>
        <div class="set-row prof-actions"><button class="btn ghost" data-back>${esc(T('Back'))}</button></div>`, 'profiles');
      const m = $('#modal');
      m.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => this.edit(b.dataset.edit)));
      $('[data-back]', m).addEventListener('click', () => this.open());
      $('[data-close]', m).addEventListener('click', () => App.closeModal());
      $('[data-edit]', m).focus();
    },

    // Add (id null) or edit a profile: name, colour, kids.
    edit(id) {
      const list = this.list(), p = id == null ? null : list.find(x => x.id === id);
      let color = p ? p.color : COLORS[list.length % COLORS.length];
      App.openModal(`<button class="round-btn close" data-close aria-label="Close">✕</button>
        <h2 class="sheet-title">${esc(T(p ? 'Edit profile' : 'Add profile'))}</h2>
        <label class="set"><span>${esc(T('Name'))}</span><input class="field" id="profName" maxlength="20" value="${esc(p ? p.name : '')}" placeholder="${esc(T('Name'))}"></label>
        <div class="prof-colors">${COLORS.map(c => `<button class="prof-color${c === color ? ' on' : ''}" data-c="${c}" style="--c:${c}" aria-label="${c}"></button>`).join('')}</div>
        ${p && p.id === '' ? '' : `<label class="set toggle"><span>${esc(T('Kids profile'))}<small>${esc(T('Only kids and family categories, never adult content. Leaving it asks for the parental PIN.'))}</small></span><input type="checkbox" id="profKids" ${p && p.kids ? 'checked' : ''}></label>`}
        <div class="set-row prof-actions"><button class="btn primary" data-save>${esc(T('Save'))}</button>
          ${p && p.id !== '' ? `<button class="btn ghost" data-del>${esc(T('Delete profile'))}</button>` : ''}
          <button class="btn ghost" data-back>${esc(T('Cancel'))}</button></div>`, 'profiles');
      const m = $('#modal');
      m.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => {
        color = b.dataset.c;
        m.querySelectorAll('[data-c]').forEach(x => x.classList.toggle('on', x === b));
      }));
      $('[data-back]', m).addEventListener('click', () => (p ? this.manage() : this.open()));
      $('[data-close]', m).addEventListener('click', () => App.closeModal());
      $('[data-save]', m).addEventListener('click', async () => {
        const name = $('#profName', m).value.trim();
        if (!name) { App.toast(T('Enter a name')); $('#profName', m).focus(); return; }
        const kidsBox = $('#profKids', m), kids = !!(kidsBox && kidsBox.checked);
        // A kids profile needs a parental PIN to be left again.
        if (kids && !Settings.adultPin && !(await App.askPin('create'))) return;
        if (p) Object.assign(p, { name, color, kids });
        else list.push({ id: 'p' + Date.now().toString(36), name, color, kids });
        this.save(list);
        // The profile in use changed to or from kids: its lists are built again.
        if (p && p.id === Store.profile && p.kids !== this.current().kids) location.reload();
        if (p && p.id === Store.profile) App.paintProfile();
        App.toast(T('Profile saved'));
        this.open();
      });
      const del = $('[data-del]', m);
      if (del) del.addEventListener('click', () => {
        if (!confirmTwice(del)) return;
        this.save(list.filter(x => x.id !== p.id));
        Store.dropProfile(p.id);
        if (p.id === Store.profile) { try { localStorage.setItem('itv.profile', '""'); } catch {} location.reload(); return; }
        App.toast(T('Profile deleted'));
        this.manage();
      });
      $('#profName', m).focus();
    },
  };

  // Delete asks once more on the same button (no browser dialog on TVs).
  function confirmTwice(btn) {
    if (btn.dataset.sure) return true;
    btn.dataset.sure = '1';
    btn.textContent = T('Press again to delete');
    setTimeout(() => { delete btn.dataset.sure; btn.textContent = T('Delete profile'); }, 4000);
    return false;
  }
  const $ = (s, r = document) => r.querySelector(s);

  window.Profiles = Profiles;
})();
