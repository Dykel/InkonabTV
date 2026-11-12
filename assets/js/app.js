/* InkonabTV — views, routing and UI glue. */
(function () {
  const CFG = window.INKONAB_CONFIG;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const CHUNK = 48;
  const ADULT = /\b(xxx|adult|adults|18\+|\+18|porn)\b/i;

  const ICONS = {
    play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" fill="currentColor"/></svg>',
    info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 11v6M12 7.5v.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z" fill="currentColor"/></svg>',
    trailer: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="m10 9 5 3-5 3Z" fill="currentColor"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    restart: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  // ---------- helpers ----------
  const LOCALE = (window.I18N && I18N.locale) || 'en-US';
  const T = window.T || (s => s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Names for the language / country codes providers put in front of category names, in the
  // interface language: 'l:xx' is a language, 'r:XX' a country (both named by Intl), anything else
  // a plain English name (translated by i18n.js).
  const PLAYLIST_LANGS = {
    FR: 'l:fr', EN: 'l:en', UK: 'r:GB', USA: 'r:US', US: 'r:US', CAN: 'r:CA', QC: 'Québec', ESP: 'l:es', ES: 'l:es', DE: 'l:de',
    NL: 'l:nl', BE: 'r:BE', IT: 'l:it', PT: 'l:pt', BR: 'r:BR', ARA: 'l:ar', AR: 'l:ar', TR: 'l:tr', PL: 'l:pl', SE: 'r:SE',
    NO: 'r:NO', DK: 'r:DK', FI: 'r:FI', SCAN: 'Scandinavia', IS: 'r:IL', ISR: 'r:IL', GR: 'l:el', RO: 'l:ro', BG: 'l:bg', RU: 'l:ru',
    CZ: 'r:CZ', HU: 'l:hu', HR: 'r:HR', SL: 'r:SI', AL: 'l:sq', EXYU: 'Ex-Yugoslavia', AT: 'r:AT', CH: 'r:CH', CY: 'r:CY', MT: 'r:MT',
    IR: 'l:fa', KU: 'l:ku', AF: 'r:AF', PK: 'r:PK', IN: 'r:IN', PH: 'r:PH', ID: 'r:ID', CN: 'l:zh', JP: 'l:ja', AS: 'Asia',
    AU: 'r:AU', NZ: 'r:NZ', SO: 'l:so', MU: 'Music', AFRICAN: 'Africa', CG: 'r:ME', LV: 'Latin America', LA: 'Latvia / Latino',
    EU: 'Europe', GLOBAL: 'International', MULTI: 'Multi-language', SPT: 'Sports',
  };
  // Playlist language code (FR, ESP, UK…) → the audio language it means (ISO 639-1), or ''.
  const REGION_AUDIO = { UK: 'en', USA: 'en', US: 'en', CAN: 'en', AU: 'en', NZ: 'en', QC: 'fr', BR: 'pt', SE: 'sv', NO: 'no', DK: 'da',
    FI: 'fi', IS: 'he', ISR: 'he', CZ: 'cs', HR: 'hr', SL: 'sl', AT: 'de', CH: 'de', CY: 'el', MT: 'mt', PK: 'ur', IN: 'hi', PH: 'tl', ID: 'id', LV: 'es' };
  const audioOf = code => {
    const c = String(code || '').toUpperCase(), v = PLAYLIST_LANGS[c] || '';
    return v.startsWith('l:') ? v.slice(2) : REGION_AUDIO[c] || '';
  };
  // A track's language (fr, fre, fra, French…) → ISO 639-1.
  const ISO3 = { fre: 'fr', fra: 'fr', eng: 'en', spa: 'es', ger: 'de', deu: 'de', ita: 'it', por: 'pt', dut: 'nl', nld: 'nl', ara: 'ar',
    tur: 'tr', rus: 'ru', pol: 'pl', hin: 'hi', gre: 'el', ell: 'el', fin: 'fi', bul: 'bg', alb: 'sq', sqi: 'sq', heb: 'he', swe: 'sv',
    nor: 'no', dan: 'da', cze: 'cs', ces: 'cs', hrv: 'hr', slv: 'sl', ron: 'ro', rum: 'ro', hun: 'hu', per: 'fa', fas: 'fa', chi: 'zh', zho: 'zh', jpn: 'ja' };
  const trackLang = l => { const x = String(l || '').toLowerCase().split(/[-_]/)[0]; return ISO3[x] || (x.length === 2 ? x : ''); };
  const namers = {};
  const playlistLang = code => {
    const v = PLAYLIST_LANGS[code];
    if (!v) return code;
    const m = /^([lr]):(.+)$/.exec(v);
    if (!m) return v;
    try {
      const type = m[1] === 'l' ? 'language' : 'region';
      const n = namers[type] || (namers[type] = new Intl.DisplayNames([LOCALE, 'en'], { type }));
      const name = n.of(m[2]) || code;
      return name.charAt(0).toLocaleUpperCase(LOCALE) + name.slice(1);
    } catch { return code; }
  };
  // "server.tv:8080" / "http://server.tv:8080/player_api.php?…" → "http://server.tv:8080".
  const normServer = v => {
    v = String(v || '').trim();
    if (!v) return '';
    try { const u = new URL(/^\w+:\/\//.test(v) ? v : 'http://' + v); return u.origin + u.pathname.replace(/\/(player_api|get|xmltv)\.php$/, '').replace(/\/+$/, ''); } catch { return ''; }
  };
  const hm = t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  // Length in seconds. Some panels put minutes in duration_secs ("122" for a 2-hour film), so
  // the "02:02:00" form wins when they disagree.
  const durSecs = info => {
    const m = String((info && info.duration) || '').match(/^(\d+):(\d\d):(\d\d)$/);
    const hms = m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0;
    return hms || Number(info && info.duration_secs) || 0;
  };
  const fmtDur = secs => { secs = Math.round(secs); const h = Math.floor(secs / 3600), m = Math.round((secs % 3600) / 60); return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m} min`; };

  // Tags the provider puts in names, e.g. "FR - Title (2026) (VOSTFR) [4K-Q]".
  const TAG_NAMES = [
    [/^4K(-Q)?$|^UHD$/i, '4K'], [/^(\d{3,4})p$/i, m => m[1] + 'p'],
    [/^VOSTFR$/i, 'VOSTFR'], [/^MULTI[ -]?AUDIO$/i, 'Multi-audio'], [/^(?:[A-Z]+ )?MULTI[ -]?SUB$/i, 'Multi-sub'], [/^MULTI$/i, 'Multi'],
    [/^(?:([A-Z]+) )?ENG[ -]SUB$/i, m => (m[1] ? m[1][0] + m[1].slice(1).toLowerCase() + ' · ' : '') + 'English subs'],
    [/^FHD$/i, '1080p'], [/^H\.?265$|^HEVC$/i, 'H265'],
    [/^L ?Q$/i, 'Low quality'], [/^HQ$/i, 'HQ'], [/^CAM$/i, 'CAM'], [/^REC$/i, 'Recording'], [/^Бг Аудио$/i, 'Bulgarian audio'],
  ];
  const tagName = t => {
    for (const [re, out] of TAG_NAMES) { const m = t.trim().match(re); if (m) return typeof out === 'function' ? out(m) : out; }
    return '';
  };
  const QUALITY_RANK = { '4K': 0, '1080p': 1, '720p': 2, '480p': 3 };

  function parseName(raw) {
    let s = String(raw || '').trim();
    let lang = '', year = '';
    const tags = [];
    const m = s.match(/^([A-Z]{2,4}(?:-[A-Z]{2})?)\s*[-|:]\s+/);
    if (m) { lang = m[1]; s = s.slice(m[0].length); }
    s = s.replace(/\[([^\]]*)(?:\]|$)/g, (_, t) => { t.split(/[/|,]/).map(tagName).forEach(x => x && tags.push(x)); return ''; });
    s = s.replace(/\(([^)]*)\)/g, (all, t) => {
      if (/^\d{4}$/.test(t)) { year = year || t; return ''; }
      const tag = tagName(t);
      if (tag) { tags.push(tag); return ''; }
      return /^[A-Z]{2}$/.test(t) ? '' : all; // two-letter country of origin, e.g. (GB)
    });
    s = s.replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').trim();
    const quality = tags.find(t => t in QUALITY_RANK) || '';
    return { title: s || String(raw || ''), lang, year, quality, tags: [...new Set(tags.filter(t => t !== quality))] };
  }

  // Live names look like "FR: TF1 [4K-Q]", "SP: BEIN SPORTS 1 LQ [1080p]".
  function parseChannel(raw) {
    let s = String(raw || '').trim();
    const tags = [];
    s = s.replace(/\[([^\]]*)(?:\]|$)/g, (_, t) => { t.split(/[/|,]/).map(tagName).forEach(x => x && tags.push(x)); return ''; });
    s = s.replace(/(^|\s)(H\.?265|HEVC|LQ|4K|UHD|FHD)(?=\s|$)/gi, (_, sp, w) => { tags.push(tagName(w)); return sp; });
    const label = s.replace(/\s{2,}/g, ' ').trim() || String(raw || '');
    const quality = tags.find(t => t in QUALITY_RANK) || '';
    return { label, quality, tags: [...new Set(tags.filter(t => t && t !== quality))] };
  }
  // Categories are split by quality ("FR: FRANCE [4K-Q]", "FR: FRANCE [720p]"); merge them.
  const liveCatKey = name => String(name || '').replace(/\[\s*(?:\d{3,4}p|4K(?:-Q)?|UHD|FHD|HD|SD|H\.?265|HEVC)\s*\]/gi, '').replace(/\s{2,}/g, ' ').trim();
  // Which copy of a channel plays first, and the order of the fallbacks when one fails:
  // 1080p, 720p, 480p, then 4K (heavy on a slow connection); H265 and low quality last.
  const liveRank = c => ({ '1080p': 0, '720p': 1, '480p': 2, '4K': 3 }[c.quality] ?? 4) + (c.tags.includes('H265') ? 3 : 0) + (c.tags.includes('Low quality') ? 6 : 0);

  const LANG_NAMES = { QFR: 'French (Canada)', EX: 'Ex-Yugoslav', IN: 'Indian', SOM: 'Somali', PK: 'Pakistani', MA: 'Moroccan', AL: 'Albanian' };
  let langNamer;
  function langName(code) {
    if (!code) return 'Original';
    if (LANG_NAMES[code]) return LANG_NAMES[code];
    try { langNamer = langNamer || new Intl.DisplayNames(['en'], { type: 'language' }); return langNamer.of(code.toLowerCase()) || code; } catch { return code; }
  }

  // Genres. Films and series: TMDB's genre ids, plus whatever the provider's category name or genre
  // field says ("FR: ACTION", "Comédie"), in the app's languages. Series-only TMDB genres are folded
  // into the film ones. Live channels aren't in TMDB, so they go by category and channel names.
  const words = s => fold(s).replace(/[^a-z0-9+]+/g, ' ').trim();
  const GENRES = [
    [28, 'Action', /\b(action|accion|azione)\b|\bart(s)? martiaux\b|\bmartial/], [12, 'Adventure', /adventure|aventur|avventur|abenteuer/],
    [16, 'Animation', /\banim(e|es|ation|acion|azione|ados?|ated)\b|\bmanga\b|dessins? animes?|cartoons?\b|zeichentrick/],
    [35, 'Comedy', /comed|komod|commedia|humou?r/], [80, 'Crime', /\bcrime|policier|\bpolar\b|\bkrimi|policiaco|poliziesco|\bmafia\b|\bgangster/],
    [99, 'Documentary', /\bdocu|\bdoku|\bdoc\b/], [18, 'Drama', /\bdrama|\bdrame|\bdramma/],
    [10751, 'Family', /\bfamil|\bkids?\b|enfants?\b|jeunesse|infantil|\bkinder(en)?\b|bambini|children/], [14, 'Fantasy', /\bfantas/],
    [36, 'History', /\bhistor|\bhistoire|\bstoric|\bgeschichte\b/], [27, 'Horror', /\bhorr|epouvante|\bterror|grusel|\borrore\b/],
    [10402, 'Music', /\bmusi[ckq]|\bconcerts?\b/], [9648, 'Mystery', /\bmyst|\bmisterio\b|\bmistero\b/],
    [10749, 'Romance', /\broman[ct]|liebesfilm/], [878, 'Science Fiction', /sci ?fi\b|science ?fiction|\bsf\b|fantascienza|ciencia ficcion/],
    [53, 'Thriller', /\bthriller|\bsuspense/], [10752, 'War', /\bwar\b|\bguerre\b|\bguerra\b|kriegsfilm/], [37, 'Western', /\bwestern/],
    [10763, 'News', /\bnews\b/], [10764, 'Reality', /\breality\b|tele ?realite/], [10766, 'Soap', /\bsoaps?\b|telenovela/], [10767, 'Talk', /\btalk ?shows?\b/],
  ].map(([id, name, re]) => ({ id, name, re }));
  const TV_GENRES = { 10759: [28, 12], 10762: [10751], 10765: [878, 14], 10768: [10752] };
  const genreIds = ids => [...new Set(ids.flatMap(g => TV_GENRES[g] || [g]))].filter(g => GENRES.some(x => x.id === g));
  const textGenres = s => { const t = words(s); return t ? GENRES.filter(g => g.re.test(t)).map(g => g.id) : []; };
  const LIVE_GENRES = [
    ['sports', 'Sports', /\bsports?\b|\bspor\b|deportes?\b|\bbein\b(?! (cinema|movies?|od|series|box|drama|gourmet|documentary))|\bespn\b|eurosports?\b|\bmysport|\bdazn\b|\bfoot(ball)?\b|\bfutbol\b|\bsoccer\b|\bbaloncesto\b|\bligue\b|\bliga\b|\bleague\b|\bepl\b|\bchampionship\b|\bworld cup\b|\bequipe\b|\bppv\b|\bstaige\b|\bnba\b|\bnfl\b|\bnhl\b|\bmlb\b|\bncaa[a-z]*\b|\bf1\b|moto ?gp\b|\bufc\b|\btennis\b|\bgolf\b/],
    ['news', 'News', /\bnews\b|\binfos?\b|\bactu|nachrichten|noticias|notizie|\bcnn\b|\bbfm|\blci\b|\bcnews\b|franceinfo|france ?24|al ?jazeera|euronews|\bmsnbc\b/],
    ['kids', 'Kids', /\bkids?\b|jeunesse|enfants?\b|infantil|\bkinder\b|bambini|\bkinderen\b|disney(?!\+? (ppv|events?\b))|cartoon|nickelodeon|\bnick\b|\bgulli\b|\btiji\b|boomerang|\bpiwi\b|teletoon|baby ?tv|spacetoon|\bmbc ?3\b/],
    ['movies', 'Movies', /\bcinemas?\b|\bcine\b|\bfilms?\b|\bmovies?\b|\bpeliculas?\b|\bhbo\b|\bocs\b|\bmbc ?(2|max|action|bollywood)\b/],
    ['music', 'Music', /\bmusi[ckq]|\bmtv\b|\bmezzo\b|\btrace\b|\bnrj hits\b|\bmcm\b|\bvh1\b/],
    ['docs', 'Documentaries', /\bdocu|\bdoku|discovery|nat ?geo|national geographic|\bplanete\b|\bhistory\b|animal planet|ushuaia/],
    ['faith', 'Religion', /\bquran\b|\bcoran\b|\bislam|\bcatholi|\bchristian|\bgospel\b|\bbible\b/],
  ].map(([key, name, re]) => ({ key, name, re }));

  // ---------- search ranking ----------
  // As the big search engines do it (Algolia, Elasticsearch, Netflix…), offline on the device:
  // - names are folded (accents, case, punctuation) and noise words dropped ("FR:", "4K", "the");
  // - one word index per playlist, so a search scans the distinct words, not every title;
  // - typos allowed by word length: none under 4 letters, 1 up to 7, 2 from 8 (a swap counts as 1);
  // - sound-alike spellings (ph/f, qu/k, eau/o, silent endings) count as 1 typo;
  // - the last word typed matches as a beginning (search as you type); "spiderman" = "spider man";
  // - ranking in tiers: more words matched, fewer typos, exact words, title starts with the
  //   search, then popularity and what the viewer watches.
  const NOISE = new Set(['fr', 'en', 'vf', 'vff', 'vfq', 'vo', 'vost', 'vostfr', 'multi', 'sd', 'hd', 'fhd', 'uhd', 'hdr', '4k', '8k', '1080p', '720p', 'hevc',
    'the', 'a', 'an', 'of', 'and', 'le', 'la', 'les', 'l', 'un', 'une', 'de', 'du', 'des', 'd', 'et', 'el', 'los', 'las', 'il', 'lo', 'der', 'die', 'das']);
  // CANAL+ = canal plus; 9-1-1, 9/11 = 911.
  const toks = s => words(String(s || '').replace(/\+/g, ' plus ').replace(/(\d)[-/.](?=\d)/g, '$1')).split(' ').filter(t => t && !NOISE.has(t));
  const typoBudget = n => (n < 4 ? 0 : n < 8 ? 1 : 2);
  // Optimal string alignment distance (Damerau-Levenshtein with adjacent swaps); stops early
  // and returns max + 1 once the distance must be above `max`.
  function editDistance(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev2 = null, prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let low = i;
      for (let j = 1; j <= b.length; j++) {
        let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
        cur.push(v);
        if (v < low) low = v;
      }
      if (low > max) return max + 1;
      prev2 = prev; prev = cur;
    }
    return prev[b.length];
  }
  // A rough French/English sound key: words spelled differently but said alike get the same key.
  const soundKey = t => t.replace(/ph/g, 'f').replace(/gh/g, '').replace(/eau|au/g, 'o').replace(/ou/g, 'u').replace(/[ae]i/g, 'e').replace(/qu|ck|c(?![eiy])/g, 'k')
    .replace(/c/g, 's').replace(/y/g, 'i').replace(/z/g, 's').replace(/w/g, 'v').replace(/h/g, '').replace(/(.)\1+/g, '$1')
    .replace(/(er|ez|et)$/, 'e').replace(/(.{3,})[estxd]$/, '$1');
  // Word index of a list: built once per list (the lists are kept while the playlist is the same).
  const searchIndexes = new WeakMap();
  function searchIndex(list, nameOf) {
    let ix = searchIndexes.get(list);
    if (ix) return ix;
    const byWord = new Map(), compact = [], first = [];
    list.forEach((item, n) => {
      const t = toks(nameOf(item));
      compact.push(t.join(''));
      first.push(t[0] || '');
      for (const w of new Set(t)) { let set = byWord.get(w); if (!set) byWord.set(w, set = []); set.push(n); }
    });
    const vocab = [...byWord.keys()];
    ix = { list, byWord, vocab, sounds: vocab.map(soundKey), compact, first };
    searchIndexes.set(list, ix);
    return ix;
  }
  // [{ item, score, full }] best first; full: every word typed matched (else one was left out). boost(item) adds up to ~60 (popularity, favourites, watched).
  function rankSearch(ix, term, boost = () => 0) {
    let q = toks(term);
    if (!q.length) q = words(term).split(' ').filter(Boolean);
    if (!q.length) return [];
    const per = new Map(); // item index → { words: [{typos, exact}] }
    q.forEach((w, k) => {
      const last = k === q.length - 1;
      // Numbers must match as typed (911 is not 91), as on the big search engines.
      const num = /\d/.test(w);
      const budget = num ? 0 : typoBudget(w.length), sw = !num && w.length >= 3 ? soundKey(w) : null;
      ix.vocab.forEach((v, vi) => {
        let typos = -1, exact = false;
        if (v === w) { typos = 0; exact = true; }
        else if (v.startsWith(w) && (last || w.length >= 3)) typos = 0;
        else if (budget) {
          let d = editDistance(w, v, budget);
          // Still typing the last word, with a typo in it: compare with the word's beginning.
          if (d > budget && last && v.length > w.length) d = editDistance(w, v.slice(0, w.length), budget);
          if (d <= budget) typos = d;
        }
        if (typos < 0 && sw && sw === ix.sounds[vi]) typos = 1;
        if (typos < 0) return;
        for (const n of ix.byWord.get(v)) {
          let e = per.get(n);
          if (!e) per.set(n, e = { words: [] });
          const old = e.words[k];
          if (!old || typos < old.typos || (typos === old.typos && exact && !old.exact)) e.words[k] = { typos, exact };
        }
      });
    });
    // Words typed joined or apart: "spiderman" / "spider man".
    const joined = q.join(''), jb = /\d/.test(joined) ? 0 : typoBudget(joined.length);
    if (joined.length >= 5) ix.compact.forEach((c, n) => {
      if (per.has(n) && per.get(n).words.filter(Boolean).length === q.length) return;
      const d = c.startsWith(joined) ? 0 : editDistance(joined, c.slice(0, joined.length), jb);
      if (d <= jb) per.set(n, { words: q.map(() => ({ typos: d, exact: false })) });
    });
    const need = q.length >= 3 ? q.length - 1 : q.length;
    const out = [];
    for (const [n, e] of per) {
      const hit = e.words.filter(Boolean);
      if (hit.length < need) continue;
      const typos = hit.reduce((a, h) => a + h.typos, 0), exact = hit.filter(h => h.exact).length;
      const item = ix.list[n];
      const starts = e.words[0] && ix.first[n] && (ix.first[n] === q[0] || ix.first[n].startsWith(q[0])) ? 1 : 0;
      out.push({ item, full: hit.length === q.length, score: hit.length * 1000 - typos * 120 + exact * 25 + starts * 40 + boost(item) - ix.compact[n].length * 0.2 });
    }
    return out.sort((a, b) => b.score - a.score);
  }
  // Every word typed is in the person's name (typos allowed as above): "brad pit" = Brad Pitt.
  function nameMatches(name, term) {
    const q = toks(term), n = toks(name);
    return q.length > 0 && q.every((w, k) => n.some(v => v === w || (k === q.length - 1 && v.startsWith(w)) || editDistance(w, v, typoBudget(w.length)) <= typoBudget(w.length)));
  }

  // Keep one entry per title (versions are grouped by TMDB id, see App.group).
  const uniq = list => { const seen = new Set(); return list.filter(i => !seen.has(i.gkey) && seen.add(i.gkey)); };

  function firstImage(v) {
    if (Array.isArray(v)) return v[0] || '';
    if (typeof v === 'string' && v.startsWith('[')) { try { return JSON.parse(v.replace(/'/g, '"'))[0] || ''; } catch { return ''; } }
    return v || '';
  }

  // Normalise Xtream VOD / series entries into one card model.
  function fromVod(v) {
    const n = parseName(v.name);
    return { kind: 'movie', id: v.stream_id, name: n.title, raw: v.name, lang: n.lang, year: n.year, quality: n.quality, tags: n.tags,
      img: v.stream_icon || '', added: Number(v.added) || 0, rating: parseFloat(v.rating) || 0, tmdb: v.tmdb || v.tmdb_id || '',
      ext: v.container_extension || 'mp4', genre: v.genre || '', cat: String(v.category_id), adult: Number(v.is_adult) === 1, key: fold(v.name) };
  }
  function fromSeries(s) {
    const n = parseName(s.name);
    return { kind: 'series', id: s.series_id, name: n.title, raw: s.name, lang: n.lang, year: n.year || (s.releaseDate || '').slice(0, 4), quality: n.quality, tags: n.tags,
      img: s.cover || '', added: Number(s.last_modified) || 0, rating: parseFloat(s.rating) || 0, tmdb: s.tmdb || '',
      plot: s.plot || '', genre: s.genre || '', backdrop: firstImage(s.backdrop_path), cat: String(s.category_id),
      adult: false, key: fold(s.name) };
  }

  const App = {
    api: null,
    data: {},
    view: 'home',
    esc, hm,

    // ---------- boot / auth ----------
    async boot() {
      document.title = CFG.appName;
      $$('[data-logo]').forEach(img => { img.src = CFG.logo; img.alt = CFG.appName; });
      Player.init();
      this.bindChrome();
      this.tickDate();
      setInterval(() => this.tickDate(), 60000);

      this.watchNetwork();

      const creds = Store.get('creds');
      // The tour shows the first time the app opens, before signing in; people already
      // signed in have used the app, so it is marked as seen (Settings → Help replays it).
      if (creds && !Store.get('tourSeen')) Store.set('tourSeen', 1);
      if (!creds) return Store.get('tourSeen') || CFG.hotel ? this.showLogin() : this.showTour(() => this.showLogin());
      this.showSplash(true);
      try {
        // Signed in before: open at once with the saved playlist; the server is checked after.
        await this.connect(creds, { quick: true });
        this.start();
      } catch (err) {
        this.showLogin();
        this.loginFailed(err, creds, 0);
      } finally {
        this.showSplash(false);
      }
    },

    // creds: { u, p, s? } for an Xtream account (s: server, player mode only) or { m } for an M3U link.
    // `quick`: use the saved sign-in without waiting for the server (checkServer does it after).
    async connect(creds, { quick } = {}) {
      const api = creds.m ? new M3UPlaylist(creds.m) : new Xtream(creds.s || Settings.server, creds.u, creds.p);
      const saved = quick && api.savedLogin && api.savedLogin();
      if (saved) {
        api.info = saved;
        api.offline = null; // not checked yet
      } else {
        try { await api.login(); }
        catch (err) {
          if (!this.unreachable(err) || !(await this.vpnRescue())) throw err;
          await this.loginThroughVpn(api);
        }
      }
      if (api.setLangs) api.setLangs(Store.get(this.langKey(api)));
      this.api = api;
      this.data = {};
    },

    // The server didn't answer (as opposed to a wrong account or an empty playlist).
    unreachable: err => !/^Wrong username|^Account |empty$/.test(err.message),

    // VPN version: the server can't be reached, so connect the free VPN (unless it's set to Off)
    // and say whether it worked. The app's own traffic goes through it, sign-in included.
    // The "optimising your internet" screen stays up until loginThroughVpn has finished
    // (`quiet`: no screen, for the background playlist update).
    // The free VPN: Android app (Native.player) or Windows app (desktop/vpn.js), same calls.
    vpnApi() { return window.Native ? Native.player : window.Desktop && Desktop.vpn; },

    async vpnRescue(quiet) {
      const P = this.vpnApi();
      if (!P || CFG.vpn === false) return false;
      const v = await P.vpnStatus().catch(() => null);
      if (!v || !v.available || v.mode === 'off' || v.state === 'connected') return false;
      if (!quiet) this.vpnWait(true);
      const r = await P.vpnConnect().catch(() => null);
      if (!(r && r.ok) && !quiet) { this.vpnWait(false); this.toast('No free server answered'); }
      return !!(r && r.ok);
    },

    // Sign in through the VPN that just connected. The tunnel can need a few seconds before the
    // server answers, so each server gets 3 tries; a server that never reaches the provider is
    // swapped for the next one (3 servers at most).
    async loginThroughVpn(api) {
      const P = this.vpnApi();
      const wait = ms => new Promise(r => setTimeout(r, ms));
      this.vpnWait(true);
      try {
        for (let server = 0; server < 3; server++) {
          for (let i = 0; i < 3; i++) {
            await wait(1500 * (i + 1));
            try { return await api.login({ strict: true }); }
            catch (err) { if (!this.unreachable(err)) throw err; }
          }
          const r = await P.vpnSwitch().catch(() => null);
          if (!(r && r.ok)) break;
        }
        throw new Error('Failed to fetch');
      } finally { this.vpnWait(false); }
    },

    // Full-screen "optimising your internet" message while the VPN connects, with the step it's
    // on (from the VPN's status updates).
    vpnWait(on) {
      let el = $('#vpnWait');
      if (!on) { if (el) el.remove(); if (this.vpnWaitOff) this.vpnWaitOff(); this.vpnWaitOff = null; return; }
      if (el) return;
      el = document.createElement('div');
      el.id = 'vpnWait';
      // Full screen only while signing in; once the app is open it's a small note, and everything stays usable.
      const signingIn = !$('#login').classList.contains('hidden');
      el.className = 'vpn-wait' + (signingIn ? '' : ' quiet');
      el.setAttribute('role', signingIn ? 'alert' : 'status');
      el.innerHTML = `<div class="vpn-wait-box"><div class="loader"><span></span></div>
        <h2>We’re optimising your internet connection</h2>
        <p>Please wait, this can take up to a minute.</p>
        <small id="vpnWaitStep">Looking for the fastest route…</small></div>`;
      document.body.appendChild(el);
      const step = v => {
        const d = (v && v.detail) || '';
        const t = /^Slow server/.test(d) ? 'Finding a faster route…' : /testing speed/.test(d) ? 'Testing the speed…'
          : v && v.state === 'connected' ? 'Connected · signing you in…' : 'Looking for the fastest route…';
        const s = $('#vpnWaitStep');
        if (s && s.textContent !== t) s.textContent = t;
      };
      const h = this.vpnApi().addListener('vpn', step);
      this.vpnWaitOff = () => Promise.resolve(h).then(x => x && x.remove && x.remove());
    },

    // After opening: check the account with the server (it was opened from the saved sign-in, or
    // the server didn't answer at sign-in), connecting the VPN if needed, then update the saved
    // playlist in the background when it was last checked more than 10 minutes ago.
    async checkServer() {
      const api = this.api;
      if (api.offline !== false && !api.isM3U) {
        try { await api.login({ strict: true }); }
        catch (err) {
          if (this.api !== api) return;
          if (!this.unreachable(err)) return this.signedOut(err.message);
          let ok = await this.vpnRescue();
          if (ok) ok = await this.loginThroughVpn(api).then(() => true, () => false);
          if (!ok) {
            // Keep the saved playlist on screen and check again every 30 s until the server answers.
            if (!api.warned) this.toast('Server not reachable · showing your saved playlist');
            api.warned = true;
            return setTimeout(() => this.api === api && this.checkServer(), 30000);
          }
        }
      }
      if (this.api === api) setTimeout(() => this.api === api && this.refreshInBackground(api), 3000);
      if (this.api === api && api.primeGuide) setTimeout(() => this.api === api && api.primeGuide(), 20000);
      setTimeout(() => this.checkUpdate(false), 30000);
      setTimeout(() => this.checkExpiry(), 12000);
    },

    // Update the saved playlist when it was last checked more than 10 minutes ago. VPN version:
    // if the server doesn't answer, connect the VPN quietly and try once more.
    async refreshInBackground(api) {
      const t = api.savedAt();
      if (t == null || Date.now() - t <= 10 * 60e3) return;
      await api.refreshAll();
      if (this.api !== api || !api.refreshFailed || !(await this.vpnRescue(true))) return;
      await new Promise(r => setTimeout(r, 3000));
      if (this.api === api) await api.refreshAll();
    },

    // The server refused the saved account (password changed, subscription ended): back to sign-in.
    signedOut(message) {
      this.api = null;
      this.data = {};
      this.closeModal();
      $('#app').classList.add('hidden');
      this.showLogin(message);
    },

    // ---------- playlist languages (CFG.langPicker) ----------
    // The languages chosen for an account: an array of codes ([] = all), undefined = not asked yet.
    langKey: api => 'langs.' + api.server + '|' + api.username,
    langPickerOn() { return CFG.langPicker === true && !!(this.api && this.api.langSummary); },

    // Shows the language list; resolves once saved. `first`: right after sign-in, before anything
    // big is downloaded, with no way to close it other than choosing.
    pickLangs(first, summary) {
      return new Promise(async resolve => {
        const m = this.openModal(`${first ? '' : this.closeBtn()}
          <h2 class="sheet-title">Choose your languages</h2>
          <p class="muted lang-intro">Only the languages you choose are downloaded and shown, which keeps the app fast. New channels, movies and series in them are added by themselves when the playlist updates.</p>
          <div class="lang-grid" id="langGrid"><div class="loader"><span></span></div></div>
          <div class="set-actions"><button class="btn ghost" id="langAll">All languages</button><button class="btn primary" id="langSave">Save</button></div>`, 'settings langs');
        if (first) this.modalLocked = true;
        const done = codes => {
          this.modalLocked = false;
          Store.set(this.langKey(this.api), codes);
          this.closeModal();
          resolve(codes);
        };
        // The buttons work at once, even while the list is still loading.
        $('#langAll', m).addEventListener('click', () => done([]));
        $('#langSave', m).addEventListener('click', () => {
          const codes = $$('.lang-chip.on', m).map(b => b.dataset.code);
          if (!codes.length) return this.toast('Choose at least one language, or All languages');
          done(codes);
        });
        let list;
        try { list = summary || await this.api.langSummary(); }
        catch { $('#langGrid', m).innerHTML = '<p class="login-error">Can’t read the playlist. Check your connection.</p>'; }
        const prev = new Set(Store.get(this.langKey(this.api)) || []);
        if (list) {
          const total = e => e.live + e.movie + e.series;
          list.sort((a, b) => (a.code === '') - (b.code === '') || total(b) - total(a));
          const parts = e => [e.live && `<i>Live</i> ${e.live}`, e.movie && `<i>Movies</i> ${e.movie}`, e.series && `<i>Series</i> ${e.series}`].filter(Boolean).join(' · ');
          $('#langGrid', m).innerHTML = list.map(e => `<button class="lang-chip${prev.has(e.code) ? ' on' : ''}" data-code="${esc(e.code)}" aria-pressed="${prev.has(e.code)}">
              <b>${esc(e.code ? playlistLang(e.code) : 'Other')}</b><small>${esc(e.code ? e.code + ' · ' : '')}${parts(e)}</small></button>`).join('');
          $('#langGrid', m).addEventListener('click', ev => {
            const b = ev.target.closest('.lang-chip');
            if (!b) return;
            b.classList.toggle('on');
            b.setAttribute('aria-pressed', b.classList.contains('on'));
          });
        }
        $(list ? '.lang-chip' : '#langAll', m).focus();
      });
    },

    // A new choice: forget the downloaded playlist and load only the chosen languages.
    async applyLangs(codes) {
      this.api.setLangs(codes);
      this.api.cache.clear();
      this.api.saved = new Map();
      await Disk.clear();
      this.data = {};
      this.epgCache = null;
      this.route();
    },

    loginError(err, creds) {
      if (err.message !== 'Failed to fetch' && !/^Playlist \d/.test(err.message)) return err.message;
      return creds && creds.m ? 'Can’t load the playlist. Check the link and your connection.' : 'Can’t reach the server. Check your connection.';
    },

    showSplash(on) { $('#splash').classList.toggle('hidden', !on); },

    // Sign-in modes: "xtream" (username/password; plus the server address in player mode),
    // "m3u" (player mode) and "remote" (filled in from a phone, when CFG.pairApi is set).
    loginModes() {
      return ['xtream', ...(CFG.playerMode ? ['m3u'] : []), ...(CFG.pairApi ? ['remote'] : [])];
    },

    showLogin(error) {
      $('#app').classList.add('hidden');
      $('#login').classList.remove('hidden');
      $('#loginError').textContent = error || '';
      this.renderFree($('#freeLogin'));
      if (CFG.playerMode) {
        $('#loginSub').textContent = 'Add your playlist';
        $('#loginNote').hidden = false;
      }
      const modes = this.loginModes();
      $('#loginModes').hidden = modes.length < 2;
      $('#loginForm').classList.toggle('wide', modes.length > 1);
      $$('.login-mode').forEach(b => { b.hidden = !modes.includes(b.dataset.mode); });
      if (!$('#loginModes').dataset.bound) {
        $('#loginModes').dataset.bound = '1';
        $('#loginModes').addEventListener('click', e => { const b = e.target.closest('.login-mode'); if (b) this.setLoginMode(b.dataset.mode, true); });
      }
      const creds = Store.get('creds');
      if (creds) {
        if (creds.m) $('#loginM3u').value = creds.m;
        if (creds.u) $('#loginUser').value = creds.u;
        if (creds.s) $('#loginServer').value = creds.s;
      }
      this.setLoginMode(creds && creds.m && modes.includes('m3u') ? 'm3u' : 'xtream');
    },

    setLoginMode(mode, fromClick) {
      this.loginMode = mode;
      $$('.login-mode').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
      const show = { server: mode === 'xtream' && !!CFG.playerMode, xtream: mode === 'xtream', m3u: mode === 'm3u', remote: mode === 'remote', form: mode !== 'remote' };
      $$('#loginForm [data-for]').forEach(el => { el.hidden = !show[el.dataset.for]; });
      $('#loginForm').classList.toggle('has-pair', mode === 'remote');
      if (fromClick) $('#loginError').textContent = '';
      if (mode === 'remote') this.startPair(); else this.stopPair();
      if (fromClick) return;
      const first = mode === 'm3u' ? '#loginM3u'
        : [CFG.playerMode && '#loginServer', '#loginUser', '#loginPass'].filter(Boolean).find(sel => !$(sel).value) || '#loginPass';
      setTimeout(() => $(mode === 'remote' ? '.login-mode.active' : first).focus(), 50);
    },

    // What the form holds, or an error message.
    formCreds() {
      if (this.loginMode === 'm3u') {
        const m = $('#loginM3u').value.trim();
        if (!m) return 'Enter the playlist link.';
        // An Xtream "get.php" playlist link: sign in to the account itself (movies, series, guide).
        try {
          const u = new URL(/^\w+:\/\//.test(m) ? m : 'http://' + m);
          const user = u.searchParams.get('username'), pass = u.searchParams.get('password');
          if (/\/get\.php$/.test(u.pathname) && user && pass) return { s: u.origin, u: user, p: pass };
          return { m: u.toString() };
        } catch { return 'Enter the playlist link.'; }
      }
      const u = $('#loginUser').value.trim(), p = $('#loginPass').value;
      if (!CFG.playerMode) return u && p ? { u, p } : 'Enter your username and password.';
      const s = normServer($('#loginServer').value);
      return s && u && p ? { s, u, p } : 'Enter the server address, username and password.';
    },

    async submitLogin(e) {
      e.preventDefault();
      const c = this.formCreds();
      if (typeof c === 'string') { $('#loginError').textContent = c; return; }
      await this.signIn(c);
    },

    async signIn(c, attempt = 0) {
      this.cancelRetry();
      const btn = $('#loginBtn');
      btn.disabled = true; btn.textContent = 'Signing in…';
      $('#loginError').textContent = '';
      try {
        await this.connect(c);
        Store.del('creds');
        Store.set('creds', c, !$('#loginRemember').checked);
        $('#loginPass').value = '';
        this.stopPair();
        this.start();
      } catch (err) {
        this.loginFailed(err, c, attempt);
        if (this.loginMode === 'remote') this.setLoginMode(c.m ? 'm3u' : 'xtream');
      } finally {
        btn.disabled = false; btn.textContent = 'Sign in';
      }
    },

    // Shows why sign-in failed; when the server just didn't answer, signs in again by itself
    // after a countdown, until it works or the viewer changes something.
    loginFailed(err, c, attempt) {
      const box = $('#loginError');
      box.textContent = this.loginError(err, c);
      if (!this.unreachable(err)) return;
      const count = document.createElement('span');
      count.className = 'retry-count';
      box.append(' ', count);
      this.autoRetry(count, attempt, () => this.signIn(c, attempt + 1));
    },

    // "Failed to fetch": count down ("Retrying in 10 s") in `el`, then run `fn`. The wait grows
    // with each failure (10 s, 20 s, then every 30 s). Stops when `el` leaves the page.
    autoRetry(el, attempt, fn) {
      this.cancelRetry();
      let left = Math.min(30, 10 * (attempt + 1));
      const tick = () => {
        if (!el.isConnected) return this.cancelRetry();
        if (left <= 0) { this.cancelRetry(); fn(); return; }
        el.textContent = `Retrying in ${left} s`;
        left--;
      };
      tick();
      this.retryTimer = setInterval(tick, 1000);
    },
    cancelRetry() { clearInterval(this.retryTimer); this.retryTimer = null; },

    // ---------- remote setup: the TV shows a code, someone fills the account in from a phone ----------
    // CFG.pairApi is the pairing worker (proxy/pair-worker.js); CFG.setupUrl the page that sends to it.
    // opts.box: element holding .pair-url / .pair-code / .pair-qr / .pair-note (the sign-in screen by
    // default); opts.onData(d): what to do with what the phone sent (sign in by default).
    async startPair(opts = {}) {
      this.stopPair();
      const run = this.pairRun = {};
      const box = opts.box || $('#loginForm .pair');
      const el = c => box.querySelector('.pair-' + c);
      const note = el('note');
      el('url').textContent = CFG.setupUrl.replace(/^https?:\/\//, '');
      el('code').textContent = '…';
      el('qr').removeAttribute('src');
      note.textContent = 'Getting a code…';
      let pair;
      try {
        const r = await fetch(CFG.pairApi.replace(/\/+$/, '') + '/pair', { method: 'POST' });
        if (!r.ok) throw new Error(r.status);
        pair = await r.json();
      } catch {
        if (run !== this.pairRun) return;
        note.textContent = 'Remote setup isn’t available right now. Try again later.';
        run.timer = setTimeout(() => run === this.pairRun && this.startPair(opts), 20000);
        return;
      }
      if (run !== this.pairRun) return;
      el('code').textContent = pair.code.slice(0, 3) + '-' + pair.code.slice(3);
      note.textContent = 'or scan the QR code. The code works once and changes every 15 minutes.';
      try {
        const qr = qrcode(0, 'M');
        qr.addData(CFG.setupUrl + '#' + pair.code);
        qr.make();
        el('qr').src = qr.createDataURL(6, 0);
      } catch {}
      const until = Date.now() + (pair.ttl || 900) * 1000 - 5000;
      const poll = async () => {
        if (run !== this.pairRun) return;
        if (Date.now() > until) return this.startPair(opts);
        try {
          const r = await fetch(`${CFG.pairApi.replace(/\/+$/, '')}/pair/${pair.code}?token=${encodeURIComponent(pair.token)}`, { cache: 'no-store' });
          if (r.status === 200) {
            const d = await r.json();
            if (run !== this.pairRun) return;
            this.pairRun = null;
            if (opts.onData) return opts.onData(d);
            const c = d.m ? { m: d.m } : { s: CFG.playerMode ? normServer(d.s) : undefined, u: d.u, p: d.p };
            if (c.m) $('#loginM3u').value = c.m; else { $('#loginUser').value = c.u || ''; if (c.s) $('#loginServer').value = c.s; }
            note.textContent = 'Received — signing in…';
            return this.signIn(c);
          }
        } catch {}
        run.timer = setTimeout(poll, 3000);
      };
      poll();
    },

    stopPair() {
      if (this.pairRun) clearTimeout(this.pairRun.timer);
      this.pairRun = null;
    },

    // ---------- extra playlists (the viewer's own M3U links, shown on top of Live TV) ----------
    async addExtraPlaylist(name, url) {
      url = String(url || '').trim();
      if (!/^\w+:\/\//.test(url)) url = 'http://' + url;
      name = String(name || '').trim().slice(0, 40) || 'My playlist';
      const list = await M3U.load(url);
      if (!list.length) throw new Error('This playlist is empty');
      Settings.extraPlaylists = [...(Settings.extraPlaylists || []).filter(p => p.url !== url && p.name !== name), { name, url }];
      Settings.save();
      this.extraChanged();
      this.toast('Playlist added: ' + name);
    },

    removeExtraPlaylist(i) {
      Settings.extraPlaylists = (Settings.extraPlaylists || []).filter((p, n) => n !== i);
      Settings.save();
      this.extraChanged();
    },

    extraChanged() {
      this.free = null;
      delete this.data.liveCatalog;
      this.redrawLater = true;
    },

    // Settings section: list, add by hand, or add from a phone with a code.
    bindExtraPlaylists(m) {
      const list = $('#xpList', m), note = $('#xpError', m);
      const paint = () => {
        const xs = Settings.extraPlaylists || [];
        list.innerHTML = xs.length ? xs.map((p, i) => `<div class="kv link"><span>${esc(p.name)}</span><code>${esc(p.url)}</code>
          <button class="round-btn sm" data-xp-del="${i}" aria-label="Remove">${ICONS.close}</button></div>`).join('')
          : '<p class="muted small-note">No extra playlists yet.</p>';
      };
      paint();
      list.addEventListener('click', e => {
        const b = e.target.closest('[data-xp-del]');
        if (!b) return;
        this.removeExtraPlaylist(Number(b.dataset.xpDel));
        paint();
        $('#xpAdd', m).focus();
      });
      const add = async (name, url) => {
        note.textContent = 'Checking the playlist…';
        try {
          await this.addExtraPlaylist(name, url);
          note.textContent = '';
          $('#xpName', m).value = ''; $('#xpUrl', m).value = '';
          paint();
        } catch (err) {
          note.textContent = err.message === 'This playlist is empty' ? err.message : 'Can’t load the playlist. Check the link and your connection.';
        }
      };
      $('#xpAdd', m).addEventListener('click', () => {
        if (!$('#xpUrl', m).value.trim()) { note.textContent = 'Enter the playlist link.'; return; }
        add($('#xpName', m).value, $('#xpUrl', m).value);
      });
      const phone = $('#xpPhone', m);
      if (phone) phone.addEventListener('click', () => {
        const box = $('#xpPair', m);
        box.hidden = false;
        this.startPair({
          box,
          onData: d => {
            box.hidden = true;
            if (!d.m) { note.textContent = 'Send an M3U playlist link from the phone.'; return; }
            add(d.name, d.m);
          },
        });
      });
    },

    // ---------- network lost / back ----------
    // TVs report "offline" when they shouldn't (a VPN changing server, a Wi-Fi blip) and can miss
    // "online" afterwards, so the event only starts a real check. A small note appears when the
    // internet truly doesn't answer and nothing is playing, and goes as soon as it answers again.
    watchNetwork() {
      const box = document.createElement('div');
      box.className = 'net-down';
      box.hidden = true;
      box.setAttribute('role', 'status');
      box.textContent = T('No connection · reconnecting…');
      document.body.appendChild(box);
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const answers = async () => {
        const c = new AbortController(), t = setTimeout(() => c.abort(), 6000);
        try { await fetch('https://api.themoviedb.org/', { mode: 'no-cors', cache: 'no-store', signal: c.signal }); return true; }
        catch { return false; }
        finally { clearTimeout(t); }
      };
      const up = () => {
        if (box.hidden) return;
        box.hidden = true;
        this.toast('Connection restored');
        if (Player.isOpen() && Player.el.dataset.state === 'error') Player.play({ ...Player.item, tried: null });
        else if (this.api && $('#view .empty #retry')) this.route();
      };
      let checking = false;
      const check = async () => {
        if (checking) return;
        checking = true;
        await wait(8000); // a VPN changing server is back by then
        for (let fails = 0; fails < 2; fails++) { if (await answers()) { checking = false; return up(); } await wait(3000); }
        // Really down: say so unless a video is on screen, and keep checking until it's back.
        while (!(await answers())) {
          const playing = Player.busy() && !(Player.isOpen() && Player.el.dataset.state === 'error');
          box.hidden = playing || !!$('#vpnWait'); // the VPN note already says what's happening
          await wait(10000);
        }
        checking = false;
        up();
      };
      window.addEventListener('offline', check);
      window.addEventListener('online', up);
      if (navigator.onLine === false) check();
    },

    // ---------- parental PIN ----------
    // Resolves true when the right PIN is entered (or a new one is created twice), false on cancel.
    // Parental PIN, or with account = true the code that protects the login details.
    accountCode() { return Settings.accountPin || '1234'; },
    askPin(mode, account = false) {
      return new Promise(resolve => {
        const steps = account
          ? (mode === 'create' ? ['Create a new 4-digit code', 'Enter the code again'] : [mode === 'change' ? 'Enter your current code' : 'Enter the access code'])
          : (mode === 'create' ? ['Create a 4-digit PIN', 'Enter the PIN again'] : [mode === 'change' ? 'Enter your current PIN' : 'Enter your parental PIN']);
        let step = 0, digits = '', first = '';
        const back = document.activeElement;
        const dlg = document.createElement('div');
        dlg.className = 'pin-dlg';
        dlg.innerHTML = `<div class="pin-card" role="dialog" aria-modal="true">
          <h3 class="pin-title"></h3><p>Use the number keys or the keypad below.</p>
          <div class="pin-dots"><i></i><i></i><i></i><i></i></div><p class="pin-err"></p>
          <div class="pin-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button type="button" data-d="${n}">${n}</button>`).join('')}
            <button type="button" data-d="del" aria-label="Delete">⌫</button><button type="button" data-d="0">0</button><button type="button" data-d="cancel" aria-label="Cancel">✕</button></div>
          <button type="button" class="btn ghost" data-d="cancel">Cancel</button></div>`;
        document.body.appendChild(dlg);
        const paint = () => {
          $('.pin-title', dlg).textContent = steps[step];
          $$('.pin-dots i', dlg).forEach((d, i) => d.classList.toggle('on', i < digits.length));
        };
        const done = ok => {
          document.removeEventListener('keydown', onKey, true);
          dlg.remove();
          if (back && back.isConnected) back.focus();
          resolve(ok);
        };
        const fail = msg => { $('.pin-err', dlg).textContent = msg; digits = ''; paint(); };
        const press = d => {
          if (d === 'cancel') return done(false);
          if (d === 'del') { digits = digits.slice(0, -1); return paint(); }
          if (digits.length >= 4) return;
          if (!digits) $('.pin-err', dlg).textContent = '';
          digits += d;
          paint();
          if (digits.length < 4) return;
          setTimeout(() => {
            if (mode !== 'create') return digits === (account ? this.accountCode() : Settings.adultPin) ? done(true) : fail(account ? 'Wrong code' : 'Wrong PIN');
            if (step === 0) { first = digits; step = 1; digits = ''; $('.pin-err', dlg).textContent = ''; return paint(); }
            if (digits !== first) { step = 0; return fail(account ? 'The codes don’t match' : 'The PINs don’t match'); }
            Settings[account ? 'accountPin' : 'adultPin'] = digits;
            Settings.save();
            this.toast(account ? 'Code saved' : 'PIN saved');
            done(true);
          }, 150);
        };
        const onKey = e => {
          if (/^[0-9]$/.test(e.key)) { e.preventDefault(); e.stopImmediatePropagation(); press(e.key); }
          else if (e.key === 'Escape' || e.key === 'BrowserBack' || e.key === 'GoBack') { e.preventDefault(); e.stopImmediatePropagation(); done(false); }
          else if (e.key === 'Backspace' && !e.target.matches('input')) { e.preventDefault(); e.stopImmediatePropagation(); press('del'); }
        };
        document.addEventListener('keydown', onKey, true);
        dlg.addEventListener('click', e => { const b = e.target.closest('[data-d]'); if (b) press(b.dataset.d); });
        paint();
        $('[data-d="1"]', dlg).focus();
      });
    },

    logout() {
      Store.del('creds');
      delete Settings.accountPin; // forgotten code: signing out resets it, and clears the login
      Settings.save();
      // Genres belong to the titles, not the account: a new login doesn't look them up again.
      Disk.clear().then(() => this.genreStore && Disk.set('genres.v1', this.genreStore));
      this.api = null;
      this.data = {};
      this.closeModal();
      location.hash = '';
      this.showLogin();
    },

    // Saved playlists were refreshed in the background and something changed: rebuild only the
    // changed sections, forget what the provider removed, and redraw the page if it shows one of
    // them (later, if a dialog or the player is open).
    async onCatalogRefreshed(e) {
      this.homeRowsLater(30000);
      const d = (e && e.detail) || { sections: { live: true, movie: true, series: true } };
      const drop = { live: ['live', 'liveCats', 'liveCatalog'], movie: ['vod', 'movieCats', 'moviePicks'], series: ['series', 'seriesCats', 'seriesPicks'] };
      for (const s of Object.keys(d.sections)) for (const k of drop[s] || []) delete this.data[k];
      if (d.sections.live) this.epgCache = null;
      try { await this.pruneRemoved(); } catch (err) { console.warn('[refresh]', err); }
      const shows = { home: true, live: d.sections.live, guide: d.sections.live, movies: d.sections.movie, series: d.sections.series }[this.view];
      if (shows) {
        if (Player.isOpen() || !$('#modal').classList.contains('hidden')) this.redrawLater = true;
        else this.redraw();
      }
      this.toast(d.added != null ? `Playlist updated: ${d.added} new, ${d.removed} removed, ${d.changed} changed` : 'Playlist updated');
    },

    // Drop favorites, history, Continue Watching and My List entries whose channel or title is gone.
    // A list that comes back empty (a provider glitch) removes nothing.
    async pruneRemoved() {
      const [cat, vod, series] = await Promise.all([this.liveCatalog(), this.loadVod().catch(() => []), this.loadSeries().catch(() => [])]);
      const fav = Store.get('fav', {});
      const keep = (list, set) => (set.size ? (list || []).filter(k => set.has(k)) : list);
      const movieKeys = new Set(vod.map(i => i.gkey)), seriesKeys = new Set(series.map(i => i.gkey));
      Object.assign(fav, { live: keep(fav.live, cat.byKey), movie: keep(fav.movie, movieKeys), series: keep(fav.series, seriesKeys) });
      Store.set('fav', fav);
      if (cat.byKey.size) Store.set('recentLive', this.recentLive().filter(k => cat.byKey.has(k)));
      const movieIds = new Set(vod.map(i => String(i.id))), seriesIds = new Set(series.map(i => String(i.id)));
      Store.set('cw', this.cw().filter(e =>
        e.kind === 'movie' ? !movieIds.size || movieIds.has(String(e.id))
          : e.kind === 'episode' ? !seriesIds.size || seriesIds.has(String(e.seriesId)) : true));
      // The channel playing now zaps through the new list.
      const it = Player.isOpen() && Player.item;
      if (it && it.kind === 'live' && it.list) {
        const groups = await this.liveGroups();
        const g = groups.find(x => x.key === it.groupKey);
        if (g) {
          const cur = it.list[it.index];
          it.list = g.channels;
          it.index = cur ? g.channels.findIndex(c => c.gkey === cur.gkey) : -1;
        }
      }
    },

    // Redraw the current page, keeping the focus on the same item when it still exists.
    async redraw() {
      this.redrawLater = false;
      const a = document.activeElement;
      const attrs = a && a.closest && $('#view').contains(a) ? [...a.attributes].filter(x => x.name.startsWith('data-')) : [];
      const y = window.scrollY;
      await this.route();
      window.scrollTo(0, y);
      const sel = attrs.map(x => `[${x.name}="${CSS.escape(x.value)}"]`).join('');
      const back = sel && $('#view ' + sel);
      if (back) back.focus({ preventScroll: true });
    },

    async start() {
      if (!this.catalogHooked) {
        this.catalogHooked = true;
        window.addEventListener('inkonab:catalog', e => this.onCatalogRefreshed(e));
        // Long sessions (a TV left on): refresh the saved playlists every 6 hours.
        setInterval(() => this.api && this.api.refreshAll(), 6 * 3600e3);
      }
      $('#login').classList.add('hidden');
      $('#app').classList.remove('hidden');
      $('#avatar').textContent = (this.api.username[0] || '?').toUpperCase();
      // First sign-in with a multi-language playlist: choose the languages before downloading it.
      // A playlist without language codes (or with only one) loads whole, as before.
      if (this.langPickerOn() && Store.get(this.langKey(this.api)) == null) {
        $('#view').innerHTML = '<div class="loader"><span></span></div>';
        const list = await this.api.langSummary().catch(() => null);
        if (list && list.filter(e => e.code).length >= 2) await this.pickLangs(true, list);
        else if (list) Store.set(this.langKey(this.api), []);
        this.api.setLangs(Store.get(this.langKey(this.api)));
      }
      this.route();
      this.checkServer();
      this.homeRowsLater(20000);
      this.syncReminders().then(() => this.watchReminders());
      // Opened from a TV home screen tile before the app was ready: go there now.
      if (this.pendingLink) { const u = this.pendingLink; this.pendingLink = null; setTimeout(() => this.openLink(u), 600); }
    },

    bindChrome() {
      $('#loginForm').addEventListener('submit', e => this.submitLogin(e));
      // Typing stops the automatic sign-in retry (the details are being changed).
      $('#loginForm').addEventListener('input', () => {
        if (!this.retryTimer) return;
        this.cancelRetry();
        $$('#loginError .retry-count').forEach(e => e.remove());
      });
      $$('[data-view]').forEach(b => b.addEventListener('click', () => { location.hash = b.dataset.view; }));
      $('#searchBtn').addEventListener('click', () => this.openSearch());
      $('#settingsBtn').addEventListener('click', () => this.openSettings());
      $('#avatar').addEventListener('click', () => this.openSettings());
      window.addEventListener('hashchange', () => this.api && this.route());
      $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') this.closeModal(); });

      // Broken poster → show the title placeholder underneath.
      document.addEventListener('error', e => {
        const t = e.target;
        if (t.tagName === 'IMG' && !t.dataset.failed) { t.dataset.failed = '1'; t.classList.add('broken'); }
      }, true);

      document.addEventListener('keydown', e => this.backFromMenu(e), true); // before nav.js
      document.addEventListener('keydown', e => {
        if (Player.isOpen()) return;
        const back = e.key === 'Escape' || e.key === 'BrowserBack' || e.key === 'GoBack' ||
          (e.key === 'Backspace' && !e.target.matches('input, textarea'));
        if (!back) return;
        if (!$('#modal').classList.contains('hidden')) { e.preventDefault(); this.closeModal(); }
        // Inside a screen, Back first goes up to the menu (this screen's tab), where Search and
        // Settings are; the list keeps its place, so ▼ goes straight back to it. From the menu,
        // Back goes Home, and on Home to the exit warning.
        else if (this.api && !$('#app').classList.contains('hidden') && !e.target.closest('.topbar')) { e.preventDefault(); this.focusMenu(); }
        else if (this.api && this.view !== 'home') { e.preventDefault(); location.hash = 'home'; }
      });
    },

    focusMenu() {
      const from = document.activeElement;
      this.menuReturn = from && from.closest('#view') ? { el: from, view: this.view } : null;
      const tab = $(`.topbar [data-view="${this.view}"]`) || $('.topbar .home-btn');
      if (tab) tab.focus({ preventScroll: true });
    },

    // ---------- TV home screen ----------
    // Android TV (the app's rows and Play Next) and Samsung Smart Hub Preview: channels watched
    // lately, films and episodes to resume, and what was added lately. A tile opens the app on
    // it. Adult categories never go there, whatever the setting.
    // The TV can show them (Android TV or Samsung); Settings → TV home screen turns them off.
    homeRowsAvail() {
      return !CFG.hotel && document.documentElement.classList.contains('tv')
        && !!((window.Native && Native.player.homeRows) || window.TizenHome);
    },
    homeRowsOn() { return this.homeRowsAvail() && !Settings.noHomeRows; },
    // Off: the rows are emptied (the TV hides empty rows) and Play Next is cleared. On again: they
    // come back where they were, with no new question to add them.
    async setHomeRows(on) {
      Settings.noHomeRows = !on;
      Settings.save();
      this.homeSent = null;
      clearTimeout(this.homeTimer);
      this.homeTimer = 0;
      if (on) return this.homeRowsLater(500);
      const none = { live: [], resume: [], movies: [], series: [] };
      try {
        if (window.Native && Native.player.homeRows) await Native.player.homeRows({ rows: JSON.stringify(none) });
        else if (window.TizenHome) this.tizenPreview(none);
      } catch (e) { console.warn('[home rows]', e); }
    },
    // Updates within `ms`, or sooner if one is already planned (progress saved every few seconds
    // while playing must not keep pushing it back).
    homeRowsLater(ms = 8000) {
      if (!this.homeRowsOn() || !this.api) return;
      const due = Date.now() + ms;
      if (this.homeTimer && this.homeDue <= due) return;
      clearTimeout(this.homeTimer);
      this.homeDue = due;
      this.homeTimer = setTimeout(() => { this.homeTimer = 0; this.pushHomeRows().catch(e => console.warn('[home rows]', e)); }, ms);
    },
    homeLink(a) { return 'inkonabtv://open?a=' + encodeURIComponent(JSON.stringify(a)); },
    async homeRowsData() {
      const cat = await this.liveCatalog();
      const byKey = new Map();
      for (const g of cat.groups) {
        if (ADULT.test(g.name || '')) continue;
        for (const c of g.channels) if (c.gkey && !byKey.has(c.gkey)) byKey.set(c.gkey, { c, g });
      }
      // Watched lately first, then favorites, then the rest of the group watched last.
      const recent = this.recentLive();
      const keys = [...recent, ...this.favs('live')];
      const lastGroup = byKey.get(recent[0]);
      if (lastGroup) keys.push(...lastGroup.g.channels.map(c => c.gkey));
      else keys.push(...cat.groups.filter(g => !ADULT.test(g.name || '')).slice(0, 1).flatMap(g => g.channels.map(c => c.gkey)));
      const live = [...new Set(keys)].map(k => byKey.get(k)).filter(Boolean).slice(0, 20).map(({ c, g }) => ({
        id: 'live:' + c.gkey, title: c.label, sub: g.name || '', img: c.stream_icon || '', link: this.homeLink({ t: 'live', g: c.gkey }),
      }));
      const resume = this.cw().filter(e => e.dur > 0 && e.pos > 0).slice(0, 15).map(e => ({
        id: e.key, title: e.title || '', sub: e.subtitle || '', img: e.img || '', link: this.homeLink({ t: 'cw', k: e.key }),
        pos: Math.round(e.pos * 1000), dur: Math.round(e.dur * 1000), at: e.t || Date.now(), episode: e.kind === 'episode', kind: e.kind,
      }));
      const latest = async kind => {
        const [all, cats] = await Promise.all([kind === 'movie' ? this.loadVod() : this.loadSeries(), this.loadCats(kind)]);
        const bad = new Set(cats.filter(c => ADULT.test(c.category_name || '')).map(c => String(c.category_id)));
        return uniq(all.filter(i => !i.adult && !bad.has(String(i.cat)))).sort((a, b) => b.added - a.added).slice(0, 20);
      };
      const [films, shows] = await Promise.all([latest('movie').catch(() => []), latest('series').catch(() => [])]);
      const tile = (i, t) => ({ id: t + ':' + i.id, title: i.name, sub: [i.year, i.lang].filter(Boolean).join(' · '), img: i.img || '', link: this.homeLink({ t, id: i.id }) });
      return {
        live, resume,
        movies: [...resume.filter(r => r.kind === 'movie'), ...films.map(i => tile(i, 'movie'))],
        series: [...resume.filter(r => r.kind === 'episode'), ...shows.map(i => tile(i, 'series'))],
      };
    },
    async pushHomeRows() {
      const rows = await this.homeRowsData();
      const json = JSON.stringify(rows);
      if (json === this.homeSent) return; // nothing changed
      this.homeSent = json;
      if (window.Native && Native.player.homeRows) await Native.player.homeRows({ rows: json });
      else if (window.TizenHome) this.tizenPreview(rows);
    },
    // Samsung allows a preview update at most every 10 minutes: a newer one waits its turn.
    tizenPreview(rows) {
      const gap = 10 * 60e3, last = Number(Store.get('previewAt', 0)) || 0, wait = last + gap - Date.now();
      this.previewRows = rows;
      if (wait > 0) {
        if (!this.previewTimer) this.previewTimer = setTimeout(() => { this.previewTimer = 0; this.tizenPreview(this.previewRows); }, wait);
        return;
      }
      Store.set('previewAt', Date.now());
      TizenHome.set(rows);
    },
    // inkonabtv://open?a={"t":"live"|"cw"|"movie"|"series", …} or ?row=live|movies|series, or nothing (the home row: just open)
    async openLink(url) {
      let q;
      try { q = new URL(url); } catch (e) { return; }
      if (q.protocol !== 'inkonabtv:') return;
      if (!this.api || $('#app').classList.contains('hidden')) { this.pendingLink = url; return; }
      // Android can hand over the same link twice (launch link and new-link event): once is enough.
      if (this.lastLink === url && Date.now() - this.lastLinkAt < 5000) return;
      this.lastLink = url;
      this.lastLinkAt = Date.now();
      // The TV was just turned on (Settings → Open InkonabTV when the TV turns on): last channel.
      if (q.searchParams.get('resume')) {
        const last = this.recentLive()[0];
        if (!last) return;
        const cat = await this.liveCatalog();
        for (const g of cat.groups) {
          const i = g.channels.findIndex(c => c.gkey === last);
          if (i >= 0) return this.playChannel(g.channels, i, g);
        }
        return;
      }
      const row = q.searchParams.get('row');
      if (row) { this.closeModal(); location.hash = ['live', 'movies', 'series'].includes(row) ? row : 'home'; return; }
      if (!q.searchParams.get('a')) return; // the row itself: just open the app
      let a;
      try { a = JSON.parse(q.searchParams.get('a') || '{}'); } catch (e) { return; }
      this.closeModal();
      if (a.t === 'live') {
        const cat = await this.liveCatalog();
        for (const g of cat.groups) {
          const i = g.channels.findIndex(c => c.gkey === a.g);
          if (i >= 0) return this.playChannel(g.channels, i, g);
        }
        return this.toast('This channel is no longer in your playlist');
      }
      if (a.t === 'cw') {
        const e = this.cwGet(a.k);
        if (e) return this.playEntry(e);
      }
      if (a.t === 'movie' || a.t === 'series') {
        const all = a.t === 'movie' ? await this.loadVod() : await this.loadSeries();
        const it = all.find(i => String(i.id) === String(a.id));
        if (it) return a.t === 'movie' ? this.openMovie(it, true) : this.openSeries(it);
      }
      this.toast('This title is no longer in your playlist');
    },

    // ---------- first-run tour ----------
    // Five short screens, worded for the device: TV remote, touch screen, or mouse and keyboard.
    // No catalogue pictures: drawings only. `next` runs when it closes (Get started, Skip or Back).
    showTour(next) {
      const html = document.documentElement;
      const how = html.classList.contains('tv') ? 'tv' : window.Desktop || !matchMedia('(pointer: coarse)').matches ? 'desk' : 'touch';
      const vpn = (window.Native || window.Desktop && /^(win32|darwin)$/.test(Desktop.platform)) && CFG.vpn !== false && !CFG.hotel;
      const key = (k, t) => `<li><kbd>${k}</kbd><span>${t}</span></li>`;
      const backKey = '<svg viewBox="0 0 24 24" aria-label="Back"><path d="M9 7 4 12l5 5M4 12h11a5 5 0 0 1 0 10h-2" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      // Drawn, not font symbols: older TV fonts have no ▦ or ↻.
      const gridKey = '<svg viewBox="0 0 24 24"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" fill="currentColor"/></svg>';
      const againKey = '<svg viewBox="0 0 24 24"><path d="M19 12a7 7 0 1 1-2.05-4.95M19 4v4h-4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      const art = {
        remote: `<svg viewBox="0 0 120 150"><rect x="30" y="4" width="60" height="142" rx="26" fill="var(--glass-strong)" stroke="var(--line-strong)" stroke-width="2"/>
          <circle cx="60" cy="52" r="24" fill="none" stroke="var(--text)" stroke-width="2" opacity=".5"/>
          <path d="M60 33l-5 6h10zM60 71l-5-6h10zM41 52l6-5v10zM79 52l-6-5v10z" fill="var(--text)"/>
          <circle cx="60" cy="52" r="10" fill="var(--accent)"/><text x="60" y="56" font-size="9" font-weight="700" text-anchor="middle" fill="var(--accent-ink)">OK</text>
          <circle cx="44" cy="96" r="9" fill="var(--accent)"/><path d="M47 93h-5l2-2m-2 2 2 2m-2-2h4a3 3 0 0 1 0 6" fill="none" stroke="var(--accent-ink)" stroke-width="1.6" stroke-linecap="round"/>
          <circle cx="76" cy="96" r="9" fill="none" stroke="var(--line-strong)" stroke-width="2"/><rect x="48" y="118" width="24" height="5" rx="2.5" fill="var(--line-strong)"/></svg>`,
        screen: `<svg viewBox="0 0 160 120"><rect x="6" y="10" width="148" height="92" rx="12" fill="var(--glass-strong)" stroke="var(--line-strong)" stroke-width="2"/>
          <rect x="16" y="20" width="128" height="14" rx="7" fill="var(--tab)"/><rect x="20" y="24" width="22" height="6" rx="3" fill="var(--accent)"/><circle cx="128" cy="27" r="4" fill="var(--text)" opacity=".6"/><circle cx="138" cy="27" r="4" fill="var(--text)" opacity=".6"/>
          <rect x="16" y="44" width="34" height="48" rx="6" fill="var(--line-strong)"/><rect x="56" y="44" width="34" height="48" rx="6" fill="var(--line-strong)"/><rect x="96" y="44" width="34" height="48" rx="6" fill="var(--line-strong)"/>
          <rect x="62" y="104" width="36" height="8" rx="2" fill="var(--line-strong)"/></svg>`,
        live: `<svg viewBox="0 0 160 120"><rect x="6" y="12" width="148" height="90" rx="12" fill="var(--glass-strong)" stroke="var(--line-strong)" stroke-width="2"/>
          <path d="m60 4 20 10 20-10" fill="none" stroke="var(--text)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity=".7"/>
          <rect x="16" y="22" width="40" height="70" rx="6" fill="var(--tab)"/><rect x="22" y="30" width="28" height="6" rx="3" fill="var(--accent)"/><rect x="22" y="44" width="28" height="5" rx="2.5" fill="var(--line-strong)"/><rect x="22" y="56" width="28" height="5" rx="2.5" fill="var(--line-strong)"/><rect x="22" y="68" width="28" height="5" rx="2.5" fill="var(--line-strong)"/>
          <path d="M98 44v24l20-12z" fill="var(--accent)"/><circle cx="140" cy="26" r="4" fill="var(--danger)"/></svg>`,
        films: `<svg viewBox="0 0 160 120"><rect x="14" y="22" width="40" height="60" rx="7" fill="var(--tab)" transform="rotate(-8 34 52)"/><rect x="60" y="14" width="40" height="60" rx="7" fill="var(--line-strong)"/><rect x="106" y="22" width="40" height="60" rx="7" fill="var(--tab)" transform="rotate(8 126 52)"/>
          <path d="m80 34 3 6.2 6.8 1-4.9 4.8 1.2 6.8L80 49.6l-6.1 3.2 1.2-6.8-4.9-4.8 6.8-1z" fill="var(--accent)"/>
          <rect x="30" y="94" width="100" height="8" rx="4" fill="var(--tab)"/><rect x="30" y="94" width="62" height="8" rx="4" fill="var(--accent)"/></svg>`,
        safe: `<svg viewBox="0 0 160 120"><path d="M80 8 120 22v30c0 28-17 46-40 58-23-12-40-30-40-58V22z" fill="var(--glass-strong)" stroke="var(--line-strong)" stroke-width="2"/>
          <rect x="64" y="52" width="32" height="26" rx="5" fill="var(--accent)"/><path d="M70 52v-7a10 10 0 0 1 20 0v7" fill="none" stroke="var(--accent)" stroke-width="4"/><circle cx="80" cy="64" r="3.5" fill="var(--accent-ink)"/></svg>`,
      };
      const ways = {
        tv: [key('▲ ▼ ◀ ▶', 'Move around'), key('OK', 'Open or play'), key(backKey, 'Jump to the menu at the top: Search and Settings are there')],
        touch: [key('☰', 'Use the menu at the top to switch between Live TV, TV Guide, Movies and Series'), key('⚙', 'Search and Settings are at the top right'), key('↔', 'Swipe a row sideways to see more')],
        desk: [key('☰', 'Use the menu at the top to switch between Live TV, TV Guide, Movies and Series'), key('⚙', 'Search and Settings are at the top right'), key('Esc', 'Esc closes a page')],
      }[how];
      const live = how === 'tv'
        ? [key('◀', 'Channel list'), key('▲', 'Other channels in this group'), key('▶', 'Programmes and replays'), key('OK', 'What’s on now'), key('CH + −', 'Next or previous channel')]
        : [key('▶', 'Tap a channel to watch it'), key(gridKey, 'The TV Guide shows what’s on now and next'), key('★', 'Add channels to Favorites to find them first')];
      const slides = [
        { art: `<img src="${esc(CFG.logo)}" alt="">`, title: 'Welcome', text: 'Live TV, the TV guide, movies and series from your own playlist, all in one app.' },
        { art: how === 'tv' ? art.remote : art.screen, title: 'Getting around', list: ways },
        { art: art.live, title: 'Live TV', list: live },
        { art: art.films, title: 'Movies and series', list: [key(gridKey, 'Browse by category or genre'), key('★', 'My List keeps the titles you want to watch'), key('▶', 'Continue Watching on Home picks up where you stopped')] },
        { art: art.safe, title: 'Private and reliable', list: [key('1234', 'Your login details stay hidden in Settings until you enter your code: 1234, until you change it'),
          key(againKey, 'Live TV reconnects by itself after a network problem'), ...(vpn ? [key('VPN', 'If a channel won’t play, the free VPN finds another route by itself')] : [])] },
      ];
      const m = this.openModal(`
        <div class="tour-slides">${slides.map((s, i) => `<section class="tour-slide${i ? '' : ' on'}" aria-hidden="${i ? 'true' : 'false'}">
          <div class="tour-art${i ? '' : ' logo'}">${s.art}</div>
          <h2>${s.title}</h2>${s.text ? `<p>${s.text}</p>` : ''}${s.list ? `<ul class="tour-list">${s.list.join('')}</ul>` : ''}</section>`).join('')}</div>
        <div class="tour-foot">
          <button class="btn ghost" id="tourSkip">Skip</button>
          <div class="tour-dots" aria-hidden="true">${slides.map((_, i) => `<i${i ? '' : ' class="on"'}></i>`).join('')}</div>
          <div class="tour-nav"><button class="btn ghost" id="tourPrev" hidden>Previous</button><button class="btn primary" id="tourNext">Next</button></div>
        </div>`, 'tour');
      this.modalOnClose = () => { Store.set('tourSeen', 1); if (next) next(); };
      let at = 0;
      const els = $$('.tour-slide', m), dots = $$('.tour-dots i', m), prev = $('#tourPrev', m), nextBtn = $('#tourNext', m);
      const go = k => {
        if (k >= slides.length) return this.closeModal();
        at = Math.max(0, k);
        els.forEach((el, i) => { el.classList.toggle('on', i === at); el.setAttribute('aria-hidden', i === at ? 'false' : 'true'); });
        dots.forEach((d, i) => d.classList.toggle('on', i === at));
        prev.hidden = at === 0;
        nextBtn.textContent = at === slides.length - 1 ? 'Get started' : 'Next';
        if (document.activeElement === prev && prev.hidden) nextBtn.focus({ preventScroll: true });
      };
      nextBtn.addEventListener('click', () => go(at + 1));
      prev.addEventListener('click', () => go(at - 1));
      $('#tourSkip', m).addEventListener('click', () => this.closeModal());
      let x0 = null;
      m.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
      m.addEventListener('touchend', e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 60) go(at + (dx < 0 ? 1 : -1)); });
      nextBtn.focus({ preventScroll: true });
    },

    // ▼ from the menu after Back: straight back to the item the viewer left (still on screen).
    backFromMenu(e) {
      const r = this.menuReturn;
      if (e.key !== 'ArrowDown' || !r || Player.isOpen() || !document.activeElement.closest('.topbar')) return;
      this.menuReturn = null;
      if (r.view !== this.view || !r.el.isConnected || !$('#modal').classList.contains('hidden')) return;
      const box = r.el.getBoundingClientRect();
      if (!box.width || box.bottom < 0 || box.top > innerHeight) return;
      e.preventDefault();
      r.el.focus({ preventScroll: true });
    },

    tickDate() {
      $('#date').textContent = new Date().toLocaleDateString(LOCALE, { weekday: 'long', month: 'long', day: 'numeric' });
    },

    // Back on the last screen: the first press only warns, a second one within 2.5 s goes ahead.
    confirmExit(msg = 'Press Back again to exit') {
      const now = Date.now();
      if (now - (this.backAt || 0) < 2500) { this.backAt = 0; $('#toast').classList.remove('show'); return true; }
      this.backAt = now;
      this.toast(msg);
      return false;
    },

    toast(msg) {
      const t = $('#toast');
      t.textContent = msg;
      t.classList.add('show');
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
    },

    // ---------- routing ----------
    route() {
      const view = (location.hash.slice(1) || 'home').split('/')[0];
      this.view = ['home', 'live', 'guide', 'movies', 'series'].includes(view) ? view : 'home';
      $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === this.view));
      $('.home-btn').classList.toggle('active', this.view === 'home');
      document.body.dataset.view = this.view;
      window.scrollTo(0, 0);
      const main = $('#view');
      main.innerHTML = '<div class="loader"><span></span></div>';
      this.cancelRetry();
      const render = { home: this.renderHome, live: this.renderLive, guide: this.renderGuide, movies: this.renderMovies, series: this.renderSeries }[this.view];
      setTimeout(() => this.detectGenres().catch(() => {}), 8000); // once, after the first page is up
      return render.call(this, main).then(() => { this.routeFails = 0; }).catch(err => {
        console.error(err);
        main.innerHTML = `<div class="empty"><h3>Couldn’t load this page</h3><p>${esc(err.message)}</p><p class="retry-count"></p><button class="btn" id="retry">Try again</button></div>`;
        // A failed download stays failed in this.data: start the page's data afresh.
        const again = () => { this.data = {}; this.route(); };
        $('#retry').addEventListener('click', again);
        // The server didn't answer: try again by itself after a countdown.
        if (this.unreachable(err)) {
          this.routeFails = (this.routeFails || 0) + 1;
          this.autoRetry($('.retry-count', main), this.routeFails - 1, again);
        }
      });
    },

    onPlayerClosed() {
      this.syncReminders();
      if (this.detailRefresh && !$('#modal').classList.contains('hidden')) this.detailRefresh();
      if (this.redrawLater && $('#modal').classList.contains('hidden')) this.redraw();
      else if (this.view === 'home') this.renderContinue();
    },

    // ---------- data ----------
    loadVod() {
      return this.data.vod || (this.data.vod = this.api.vodStreams().then(list => this.group(list.map(fromVod).sort((a, b) => b.added - a.added))));
    },
    loadSeries() {
      return this.data.series || (this.data.series = this.api.seriesList().then(list => this.group(list.map(fromSeries).sort((a, b) => b.added - a.added))));
    },

    // Link every copy of the same title (other languages, 4K, MKV/MP4…) through item.versions,
    // best first: info language, French, English, then by resolution.
    group(list) {
      const order = [Settings.tmdbLang.split('-')[0].toUpperCase(), 'FR', 'QFR', 'EN', ''];
      const langRank = i => { const r = order.indexOf(i.lang); return r < 0 ? order.length : r; };
      const rank = i => langRank(i) * 10 + (QUALITY_RANK[i.quality] ?? 5) + (i.tags.includes('Low quality') || i.tags.includes('CAM') ? 5 : 0);
      const groups = new Map();
      for (const i of list) {
        i.gkey = i.tmdb && i.tmdb !== '0' ? 't' + i.tmdb : 'n' + fold(i.name) + i.year;
        let g = groups.get(i.gkey);
        if (!g) groups.set(i.gkey, (g = []));
        g.push(i);
      }
      for (const g of groups.values()) {
        g.sort((a, b) => rank(a) - rank(b) || b.added - a.added);
        for (const i of g) i.versions = g;
      }
      return list;
    },
    // ---------- genres ----------
    // this.genreStore: { 'm' or 's' + gkey: [genre ids] }, kept on disk: each title is looked up once.
    loadGenres() {
      return this.genreLoad || (this.genreLoad = Disk.get('genres.v1').then(g => (this.genreStore = g || {})));
    },
    genreKey: i => i.kind[0] + i.gkey,
    async genreCats(kind) {
      const names = this.data.catNames || (this.data.catNames = {}); // this.data is per account
      if (!names[kind]) names[kind] = Object.fromEntries((await this.loadCats(kind)).map(c => [String(c.category_id), c.category_name]));
      await Promise.all([this.loadGenres(), this.loadGenreNames()]);
    },
    // Genres follow the Info language in Settings: TMDB's names, else the app's own table.
    async loadGenreNames() {
      const lang = Settings.tmdbLang;
      if (this.genreNames && this.genreNames.lang === lang) return;
      const map = await Promise.race([TMDB.genreNames(lang), new Promise(r => setTimeout(() => r(null), 2500))]); // never hold up the page
      if (map) this.genreNames = { lang, map };
    },
    infoName(name) { return (window.I18N.tr && I18N.tr(name, Settings.tmdbLang.split('-')[0])) || T(name); },
    genreName(g) { return (this.genreNames && this.genreNames.map[g.id]) || this.infoName(g.name); },
    // Needs genreCats(kind) first. Every copy of a title counts: one may be in "FR: ACTION".
    genresOf(i) {
      if (!i.kw) i.kw = [...new Set((i.versions || [i]).flatMap(v => [...textGenres(this.data.catNames[i.kind][v.cat]), ...textGenres(v.genre)]))];
      const found = this.genreStore[this.genreKey(i)];
      return found && found.length ? [...new Set([...i.kw, ...found])] : i.kw;
    },
    // Up to two genres for a cover, TMDB's own order first. Empty until the data is ready.
    coverGenres(i) {
      if (!this.genreStore || !this.data.catNames || !this.data.catNames[i.kind]) return '';
      const ids = this.genresOf(i), tmdb = this.genreStore[this.genreKey(i)] || [];
      return [...tmdb, ...ids].filter((g, n, all) => all.indexOf(g) === n).slice(0, 2)
        .map(g => this.genreName(GENRES.find(x => x.id === g))).join(' · ');
    },
    coverGenreHtml(i) { const g = this.coverGenres(i); return g ? `<span class="cover-genre">${esc(g)}</span>` : ''; },
    // Looks up, newest first and a few at a time, the titles not known yet; pauses during playback
    // so video keeps the connection and the TV's CPU. The genre lists fill in as it goes.
    async detectGenres() {
      // Once per account: a run for another account stops at its next title.
      if (this.genreApi === this.api || !CFG.tmdbKey || !this.api) return;
      this.genreApi = this.api;
      const api = this.api, wait = ms => new Promise(r => setTimeout(r, ms));
      const store = await this.loadGenres();
      const [vod, series, topM, topS] = await Promise.all([this.loadVod().catch(() => []), this.loadSeries().catch(() => []), TMDB.top('movie'), TMDB.top('tv')]);
      for (const [letter, top] of [['m', topM], ['s', topS]]) for (const [id, t] of top) if (t.g) store[letter + 't' + id] = genreIds(t.g);
      // Titles whose provider genre field is usable (most series) need no lookup.
      const queue = [...uniq(this.allowed(vod)), ...uniq(series)].sort((a, b) => b.added - a.added)
        .filter(i => !store[this.genreKey(i)] && !i.versions.some(v => textGenres(v.genre).length));
      let failed = 0, saved = Date.now(), fresh = 0;
      const flush = () => { Disk.set('genres.v1', store); saved = Date.now(); fresh = 0; if (this.onGenres) this.onGenres(); };
      // The free VPN is slow: through it, one title at a time and only now and then.
      let vpnOn = false, vpnAt = 0;
      const vpnBusy = async () => {
        if (Date.now() - vpnAt > 5000) {
          vpnAt = Date.now();
          const P = (window.Native && Native.player) || (window.Desktop && Desktop.vpn);
          const v = P && P.vpnStatus ? await P.vpnStatus().catch(() => null) : null;
          vpnOn = !!v && (v.state === 'connected' || v.state === 'connecting');
        }
        return vpnOn;
      };
      const worker = async n => {
        while (queue.length && failed < 8 && this.api === api) {
          if (Player.busy()) { await wait(3000); continue; }
          if (await vpnBusy()) {
            if (n) { await wait(5000); continue; }
            await wait(1000);
            if (Player.busy()) continue;
          }
          const i = queue.shift();
          try {
            const ids = await TMDB.genres(i.kind === 'movie' ? 'movie' : 'tv', i.tmdb, i.name, i.year);
            store[this.genreKey(i)] = genreIds(ids);
            failed = 0; fresh++;
            if (Date.now() - saved > 15000) flush();
          } catch (e) {
            if (e.busy) { queue.unshift(i); await wait(10000); } else failed++;
          }
        }
      };
      flush();
      await Promise.all([worker(0), worker(1), worker(2), worker(3)]);
      if (fresh) flush();
    },

    loadLive() {
      // Channels named "✶⋆✶ … ✶⋆✶" are the provider's section dividers, not real channels.
      // Copies of the same channel in other qualities share c.versions (best first).
      return this.data.live || (this.data.live = this.api.liveStreams().then(list => {
        const out = list
          .filter(c => !String(c.name || '').trim().startsWith('✶⋆✶'))
          .map(c => { const p = parseChannel(c.name); return { ...c, ...p, key: fold(c.name), gkey: fold(p.label), adult: Number(c.is_adult) === 1 }; });
        const groups = new Map();
        for (const c of out) { let g = groups.get(c.gkey); if (!g) groups.set(c.gkey, (g = [])); g.push(c); }
        for (const g of groups.values()) {
          g.sort((a, b) => liveRank(a) - liveRank(b));
          for (const c of g) c.versions = g;
        }
        return out;
      }));
    },
    async loadCats(kind) {
      const key = kind + 'Cats';
      if (!this.data[key]) {
        const fn = { live: 'liveCategories', movie: 'vodCategories', series: 'seriesCategories' }[kind];
        this.data[key] = this.api[fn]();
      }
      let cats = await this.data[key];
      if (this.api.langAllowed) cats = cats.filter(c => this.api.langAllowed(c.category_name));
      return Settings.showAdult ? cats : cats.filter(c => !ADULT.test(c.category_name));
    },
    allowed(list) { return Settings.showAdult ? list : list.filter(i => !i.adult); },

    // Catalog titles that TMDB currently ranks highly, one copy per title.
    // byDate: newest release first. byPop: most watched (TMDB popularity) first.
    tmdbPicks(kind) {
      const key = kind + 'Picks';
      if (this.data[key]) return this.data[key];
      return (this.data[key] = (async () => {
        const [all, top] = await Promise.all([kind === 'movie' ? this.loadVod() : this.loadSeries(), TMDB.top(kind === 'movie' ? 'movie' : 'tv')]);
        // Show each title's best version (see group()).
        const picks = uniq(this.allowed(all).filter(i => top.has(String(i.tmdb)))).map(i => i.versions[0]);
        const meta = i => top.get(String(i.tmdb));
        return {
          byDate: [...picks].sort((a, b) => meta(b).date.localeCompare(meta(a).date) || meta(b).pop - meta(a).pop),
          byPop: [...picks].sort((a, b) => meta(b).pop - meta(a).pop),
        };
      })().catch(() => ({ byDate: [], byPop: [] })));
    },

    // ---------- free playlists — available signed in or not ----------
    // Built-in ones (config.js freePlaylists: MBC PLAY in InkonabTV+, none elsewhere; Settings can
    // hide them) and the viewer's own extra M3U playlists (Settings → Extra playlists). Each is a
    // group pinned on top of Live TV.
    loadFree() {
      if (!this.free) {
        const builtin = Settings.hideBuiltin ? [] : (CFG.freePlaylists || []).map(p => ({ ...p, builtin: true }));
        const lists = [...builtin, ...(Settings.extraPlaylists || [])];
        this.free = Promise.all(lists.map(p =>
          M3U.load(p.url).then(list => list.map((c, i) => {
            const ch = { num: i + 1, name: c.name, label: c.name, stream_icon: c.logo, url: c.url, radio: c.radio, source: p.name, builtin: !!p.builtin,
              quality: '', tags: [], key: fold(c.name), gkey: 'free:' + p.name + ':' + fold(c.name) };
            ch.versions = [ch];
            return ch;
          })).catch(err => { console.warn('[free playlist]', p.url, err); return []; })
        )).then(lists => lists.flat());
      }
      return this.free;
    },

    // ---------- live catalog: every group, shared by the Live page and both players ----------
    // Groups: free playlists first, then provider categories (quality-split ones merged).
    liveCatalog() {
      if (!this.data.liveCatalog) {
        this.data.liveCatalog = (async () => {
          const free = await this.loadFree();
          const groups = [...new Set(free.map(c => c.source))].map(src => {
            const channels = free.filter(c => c.source === src);
            return { key: '@free:' + src, name: src, free: true, builtin: channels[0].builtin, channels };
          });
          let catName = {};
          if (this.api) {
            const [channels, cats] = await Promise.all([this.loadLive(), this.loadCats('live')]);
            const merged = new Map();
            for (const c of cats) {
              const key = liveCatKey(c.category_name);
              let m = merged.get(key);
              if (!m) merged.set(key, (m = { key, name: key, ids: new Set() }));
              m.ids.add(String(c.category_id));
            }
            const catOf = Object.fromEntries([...merged.values()].flatMap(m => [...m.ids].map(id => [id, m.key])));
            catName = Object.fromEntries(cats.map(c => [String(c.category_id), c.category_name]));
            const perCat = {};
            for (const c of this.allowed(channels)) {
              const k = catOf[String(c.category_id)];
              if (k) (perCat[k] || (perCat[k] = [])).push(c);
            }
            for (const m of merged.values()) if (perCat[m.key]) groups.push({ key: m.key, name: m.name, channels: uniq(perCat[m.key]) });
          }
          const byKey = new Map();
          for (const g of groups) for (const c of g.channels) if (!byKey.has(c.gkey)) byKey.set(c.gkey, c);
          // Groups by genre for the Live TV page: the category's name decides, else the channel's.
          const genres = LIVE_GENRES.map(g => ({ ...g, name: this.infoName(g.name), key: '@genre:' + g.key, genre: g.key, special: true, channels: [], seen: new Set() }));
          for (const grp of groups) {
            if (/\bradio\b/.test(words(grp.name))) continue;
            const named = grp.free ? [] : genres.filter(g => g.re.test(words(grp.name)));
            for (const c of grp.channels) {
              const text = words(c.label);
              if (c.radio || /event has not begun|\bno event\b/.test(text)) continue; // empty pay-per-view slots
              for (const g of named.length ? named : genres.filter(x => x.re.test(text))) {
                if (!g.seen.has(c.gkey)) { g.seen.add(c.gkey); g.channels.push(c); }
              }
            }
          }
          return { groups, catName, byKey, genres: genres.filter(g => g.channels.length) };
        })();
      }
      return this.data.liveCatalog;
    },

    // Catalog groups plus the viewer's Favorites, own groups and Recently watched, pinned first;
    // then the viewer's organising (hidden categories and channels, their order) is applied.
    async liveGroups(all = false) {
      const cat = await this.liveCatalog();
      const pick = keys => keys.map(k => cat.byKey.get(k)).filter(Boolean);
      const fav = pick(this.favs('live')), recent = pick(this.recentLive());
      const mine = this.myGroups().map(m => ({ key: '@my:' + m.id, name: m.name, special: true, mine: true, channels: pick(m.keys) }));
      const groups = [
        ...(fav.length ? [{ key: '@fav', name: 'Favorites', special: true, channels: fav }] : []),
        ...mine.filter(g => all || g.channels.length),
        ...(recent.length ? [{ key: '@recent', name: 'Recently watched', special: true, channels: recent }] : []),
        ...cat.groups,
      ];
      return all ? groups : this.organised(groups, 'live');
    },

    // Organise screen: kind 'live' | 'movie' | 'series'; groupKey: a Live TV category's channels.
    // Each row: Hide/Show, ▲, ▼ (+ Channels for Live TV categories, + group for channels).
    async openOrganise(kind, groupKey = null) {
      const o = this.org(kind);
      let rows, title;
      if (kind === 'live' && groupKey) {
        const g = (await this.liveGroups(true)).find(x => x.key === groupKey);
        if (!g) return;
        title = g.name;
        const ho = (o.chHidden || {})[groupKey] || [], or = (o.chOrder || {})[groupKey] || [];
        const shown = this.arrange(g.channels, c => c.gkey, or, []);
        rows = shown.map(c => ({ key: c.gkey, name: c.label, off: ho.includes(c.gkey), channel: true, mine: g.mine }));
      } else if (kind === 'live') {
        title = 'Live TV';
        const groups = this.arrange(await this.liveGroups(true), g => g.key, o.order, []);
        rows = groups.map(g => ({ key: g.key, name: (g.key === '@fav' ? '★ ' : '') + g.name, n: g.channels.length, off: (o.hidden || []).includes(g.key), group: true, mine: g.mine }));
      } else {
        title = kind === 'movie' ? 'Movies' : 'Series';
        const [all, cats] = await Promise.all([kind === 'movie' ? this.loadVod() : this.loadSeries(), this.loadCats(kind)]);
        const n = {};
        for (const i of this.allowed(all)) n[i.cat] = (n[i.cat] || 0) + 1;
        rows = this.arrange(cats.filter(c => n[c.category_id]), c => String(c.category_id), o.order, [])
          .map(c => ({ key: String(c.category_id), name: c.category_name, n: n[c.category_id], off: (o.hidden || []).includes(String(c.category_id)) }));
      }
      const back = groupKey ? '<button class="btn ghost" id="orgBack">← Categories</button>' : '';
      const newGroup = kind === 'live' && !groupKey ? '<button class="btn ghost" id="orgNew">＋ New group</button>' : '';
      const row = (r, i) => `<div class="org-row${r.off ? ' off' : ''}" data-i="${i}">
          <span class="org-name">${esc(r.name)}${r.n != null ? ` <small>${r.n}</small>` : ''}</span>
          ${r.mine && r.channel ? '<button class="btn ghost sm" data-act="remove">Remove</button>' : `<button class="btn ghost sm" data-act="hide">${r.off ? 'Show' : 'Hide'}</button>`}
          <button class="btn ghost sm" data-act="up" aria-label="Move up">▲</button>
          <button class="btn ghost sm" data-act="down" aria-label="Move down">▼</button>
          ${r.group ? '<button class="btn ghost sm" data-act="ch">Channels</button>' : ''}
          ${r.channel && !r.mine ? '<button class="btn ghost sm" data-act="add">＋ Group</button>' : ''}
          ${r.group && r.mine ? '<button class="btn ghost sm" data-act="rename">Rename</button><button class="btn ghost sm" data-act="delete">Delete</button>' : ''}
        </div>`;
      const m = this.openModal(`${this.closeBtn()}<h2 class="sheet-title">${esc(T('Organise'))} · ${esc(T(title))}</h2>
        <p class="muted small-note">${groupKey ? 'Hide channels you never watch and put the others in your order.' : 'Hide categories you never use and put the others in your order. Hidden ones come back here.'}</p>
        <div class="set-row vpn-actions">${back}${newGroup}<button class="btn ghost" id="orgReset">Reset</button></div>
        <div class="org-list">${rows.map(row).join('')}</div>`, 'settings organise');
      const list = $('.org-list', m);
      const save = () => {
        const keys = rows.map(r => r.key), off = rows.filter(r => r.off).map(r => r.key);
        const cur = this.org(kind);
        if (groupKey) {
          cur.chOrder = { ...(cur.chOrder || {}), [groupKey]: keys };
          cur.chHidden = { ...(cur.chHidden || {}), [groupKey]: off };
        } else { cur.order = keys; cur.hidden = off; }
        this.saveOrg(kind, cur);
      };
      const redrawRows = (focusRow, act) => {
        list.innerHTML = rows.map(row).join('');
        const r = list.children[focusRow];
        const b = r && ($(`[data-act="${act}"]`, r) || $('button', r));
        if (b) { b.focus({ preventScroll: true }); b.scrollIntoView({ block: 'nearest' }); }
      };
      list.addEventListener('click', async e => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        const i = Number(b.closest('.org-row').dataset.i), r = rows[i], act = b.dataset.act;
        if (act === 'hide') { r.off = !r.off; save(); return redrawRows(i, 'hide'); }
        if (act === 'up' && i > 0) { [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]]; save(); return redrawRows(i - 1, 'up'); }
        if (act === 'down' && i < rows.length - 1) { [rows[i + 1], rows[i]] = [rows[i], rows[i + 1]]; save(); return redrawRows(i + 1, 'down'); }
        if (act === 'ch') return this.openOrganise('live', r.key);
        if (act === 'add') return this.addToGroup(r.key, () => this.openOrganise(kind, groupKey));
        if (act === 'remove') {
          const id = groupKey.slice(4);
          this.saveMyGroups(this.myGroups().map(g => g.id === id ? { ...g, keys: g.keys.filter(k => k !== r.key) } : g));
          rows.splice(i, 1);
          return redrawRows(Math.min(i, rows.length - 1), 'remove');
        }
        if (act === 'rename') {
          const name = await this.askText('Rename group', r.name);
          if (!name) return this.openOrganise(kind);
          this.saveMyGroups(this.myGroups().map(g => '@my:' + g.id === r.key ? { ...g, name } : g));
          return this.openOrganise(kind);
        }
        if (act === 'delete') {
          this.saveMyGroups(this.myGroups().filter(g => '@my:' + g.id !== r.key));
          rows.splice(i, 1);
          save();
          return redrawRows(Math.min(i, rows.length - 1), 'delete');
        }
      });
      // Remote: ▲ ▼ keep to the same button (Hide, ▲, ▼, Channels…) from row to row; ◀ ▶ stay
      // in the row. ▲ on the first row goes up to the buttons above the list.
      list.addEventListener('keydown', e => {
        const b = e.target.closest('.org-row button');
        if (!b || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
        const r = b.closest('.org-row'), btns = [...r.querySelectorAll('button')], at = btns.indexOf(b);
        let to = null;
        if (e.key === 'ArrowLeft') to = btns[at - 1] || b;
        else if (e.key === 'ArrowRight') to = btns[at + 1] || b;
        else {
          const next = e.key === 'ArrowUp' ? r.previousElementSibling : r.nextElementSibling;
          if (!next) { if (e.key === 'ArrowUp') to = $('.set-row button', m); else to = b; }
          else to = $(`[data-act="${b.dataset.act}"]`, next) || $('button', next);
        }
        e.preventDefault();
        e.stopPropagation();
        if (to) { to.focus({ preventScroll: true }); to.scrollIntoView({ block: 'nearest' }); }
      });
      const backBtn = $('#orgBack', m);
      if (backBtn) backBtn.addEventListener('click', () => this.openOrganise('live'));
      const nb = $('#orgNew', m);
      if (nb) nb.addEventListener('click', async () => {
        const name = await this.askText('New group', '');
        if (name) this.saveMyGroups([...this.myGroups(), { id: Date.now().toString(36), name, keys: [] }]);
        this.openOrganise('live');
      });
      $('#orgReset', m).addEventListener('click', () => {
        const cur = this.org(kind);
        if (groupKey) { if (cur.chOrder) delete cur.chOrder[groupKey]; if (cur.chHidden) delete cur.chHidden[groupKey]; }
        else { delete cur.order; delete cur.hidden; }
        this.saveOrg(kind, cur);
        this.openOrganise(kind, groupKey);
      });
      ($('.org-row button', m) || $('button', m)).focus({ preventScroll: true });
    },

    // Puts a channel in one of the viewer's own groups (or a new one).
    addToGroup(gkey, after) {
      const groups = this.myGroups();
      const m = this.openModal(`${this.closeBtn()}<h2 class="sheet-title">${esc(T('Add to a group'))}</h2>
        <div class="pick-list">${groups.map((g, i) => `<button class="cat" data-g="${i}">${esc(g.name)} <span>${g.keys.length}</span></button>`).join('')}
          <button class="cat special" data-g="new">＋ ${esc(T('New group'))}</button></div>`, 'settings');
      m.querySelector('.pick-list').addEventListener('click', async e => {
        const b = e.target.closest('[data-g]');
        if (!b) return;
        let list = this.myGroups(), g;
        if (b.dataset.g === 'new') {
          const name = await this.askText('New group', '');
          if (!name) return after && after();
          g = { id: Date.now().toString(36), name, keys: [] };
          list = [...list, g];
        } else g = list[Number(b.dataset.g)];
        if (!g.keys.includes(gkey)) g.keys = [...g.keys, gkey];
        this.saveMyGroups(list.map(x => x.id === g.id ? g : x));
        this.toast(T('Added to') + ' ' + g.name);
        if (after) after(); else this.closeModal();
      });
      $('.pick-list button', m).focus();
    },

    // A one-line question (group names). Resolves with the text, or '' when cancelled.
    askText(title, value) {
      return new Promise(resolve => {
        const m = this.openModal(`${this.closeBtn()}<h2 class="sheet-title">${esc(T(title))}</h2>
          <form class="ask-text"><input class="field" id="askText" maxlength="40" autocomplete="off" value="${esc(value || '')}">
          <div class="set-row vpn-actions"><button class="btn" type="submit">Save</button></div></form>`, 'settings');
        let done = false;
        this.modalOnClose = () => { if (!done) resolve(''); };
        $('form', m).addEventListener('submit', e => {
          e.preventDefault();
          done = true;
          resolve($('#askText', m).value.trim());
        });
        $('#askText', m).focus();
      });
    },

    // ---------- programme reminders ----------
    // [{ id, gkey, ch, title, start, end }]. On Android the list also lives on the native side,
    // so the app's own player can announce a programme while it plays.
    reminders() { return (Store.get('reminders', []) || []).filter(r => r.end > Date.now()); },
    hasReminder(gkey, start) { return this.reminders().some(r => r.gkey === gkey && r.start === start); },
    saveReminders(list) {
      Store.set('reminders', list);
      if (window.Native && Native.player.reminders) Native.player.reminders({ json: JSON.stringify(list) }).catch(() => {});
    },
    // The Android player may have set or removed some while it was open: take its list.
    async syncReminders() {
      if (!(window.Native && Native.player.reminders)) return;
      const r = await Native.player.reminders({}).catch(() => null);
      if (!r) return;
      try { Store.set('reminders', JSON.parse(r.json)); Store.set('remFired', JSON.parse(r.fired)); } catch (e) {}
    },
    toggleReminder(ch, prog) {
      const list = this.reminders(), gkey = ch.gkey;
      const had = list.some(r => r.gkey === gkey && r.start === prog.start);
      const next = had ? list.filter(r => !(r.gkey === gkey && r.start === prog.start))
        : [...list, { id: gkey + ':' + prog.start, gkey, ch: ch.label || ch.name || '', title: prog.title, start: prog.start, end: prog.end }];
      this.saveReminders(next);
      this.toast(had ? T('Reminder removed') : `🔔 ${T('Reminder set')}: ${prog.title} · ${this.dayLabel(prog.start)} ${hm(prog.start)}`);
      return !had;
    },
    // Every 15 s while the app is open (the Android player does it while it plays).
    watchReminders() {
      if (this.remindTimer) return;
      this.remindTimer = setInterval(() => this.checkReminders(), 15000);
    },
    checkReminders() {
      if (Player.nativeOpen) return;
      const now = Date.now(), fired = new Set(Store.get('remFired', []) || []);
      const due = this.reminders().find(r => r.start <= now + 30000 && r.start > now - 5 * 60000 && !fired.has(r.id));
      if (!due) return;
      fired.add(due.id);
      Store.set('remFired', [...fired].slice(-200));
      if (window.Native && Native.player.reminders) Native.player.reminders({ fired: JSON.stringify([...fired].slice(-200)) }).catch(() => {});
      const watch = () => this.openChannelByKey(due.gkey);
      if (Player.isOpen()) return Player.remindBanner(due, watch);
      const m = this.openModal(`<h2 class="sheet-title">🔔 ${esc(due.title)}</h2>
        <p class="muted">${esc(T('Starts now on'))} ${esc(due.ch)}</p>
        <div class="set-row vpn-actions"><button class="btn" id="remWatch">${esc(T('Watch'))}</button><button class="btn ghost" data-close>${esc(T('Later'))}</button></div>`, 'settings');
      $('[data-close]', m).addEventListener('click', () => this.closeModal());
      $('#remWatch', m).addEventListener('click', () => { this.closeModal(); watch(); });
      $('#remWatch', m).focus();
    },
    async openChannelByKey(gkey) {
      const groups = await this.liveGroups();
      for (const g of groups) {
        const i = g.channels.findIndex(c => c.gkey === gkey);
        if (i >= 0) return this.playChannel(g.channels, i, g);
      }
      this.toast('This channel is no longer in your playlist');
    },

    // ---------- backup and restore ----------
    // Favorites, My List, own groups, organising, Continue watching, recently watched channels,
    // reminders and settings. Never the sign-in details, the server address or the parental PIN.
    backupKeys: ['fav', 'cw', 'recentLive', 'myGroups', 'org.live', 'org.movie', 'org.series', 'reminders'],
    backupData() {
      const data = {};
      for (const k of this.backupKeys) { const v = Store.get(k, null); if (v != null) data[k] = v; }
      const { save, showAdult, adultPin, server, relay, ...settings } = Settings;
      data.settings = settings;
      return { app: 'InkonabTV', v: 1, at: new Date().toISOString(), data };
    },
    restoreData(b) {
      if (!b || b.app !== 'InkonabTV' || !b.data) throw new Error('This file isn’t an InkonabTV backup');
      for (const k of this.backupKeys) if (k in b.data) Store.set(k, b.data[k]);
      if (b.data.settings) {
        const { adultPin, server, relay, showAdult, save, ...keep } = b.data.settings;
        Object.assign(Settings, keep);
        Settings.save();
      }
    },
    backupName() { return 'inkonabtv-backup-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.json'; },
    async saveBackup() {
      const json = JSON.stringify(this.backupData());
      if (window.Native && Native.player.backupSave) {
        const r = await Native.player.backupSave({ json, name: this.backupName() }).catch(() => null);
        return this.toast(!r ? 'Couldn’t save the backup' : r.usb ? 'Backup saved on the USB drive' : 'Backup saved on this device');
      }
      // Web, Windows and Mac: a file to keep.
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      a.download = this.backupName();
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      this.toast('Backup saved');
    },
    async restoreBackup() {
      const apply = text => {
        try { this.restoreData(JSON.parse(text)); } catch (e) { return this.toast(e.message && /backup/.test(e.message) ? e.message : 'This file isn’t an InkonabTV backup'); }
        this.toast('Backup restored');
        this.closeModal();
        setTimeout(() => location.reload(), 900);
      };
      if (window.Native && Native.player.backupList) {
        const r = await Native.player.backupList().catch(() => ({ list: [] }));
        const list = r.list || [];
        if (!list.length) return this.toast('No backup found. Plug in the USB drive that has one.');
        const m = this.openModal(`${this.closeBtn()}<h2 class="sheet-title">${esc(T('Restore a backup'))}</h2>
          <p class="muted small-note">${esc(T('Your favorites, groups, lists and settings are replaced by the backup’s.'))}</p>
          <div class="pick-list">${list.map((b, i) => `<button class="cat" data-b="${i}">${esc(new Date(b.time).toLocaleString(LOCALE, { dateStyle: 'medium', timeStyle: 'short' }))} <span>${esc(T(b.usb ? 'USB drive' : 'This device'))}</span></button>`).join('')}</div>`, 'settings');
        m.querySelector('.pick-list').addEventListener('click', async e => {
          const b = e.target.closest('[data-b]');
          if (!b) return;
          const f = await Native.player.backupRead({ path: list[Number(b.dataset.b)].path }).catch(() => null);
          if (!f) return this.toast('Couldn’t read the backup');
          apply(f.json);
        });
        $('.pick-list button', m).focus();
        return;
      }
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.onchange = () => { const f = input.files && input.files[0]; if (f) f.text().then(apply); };
      input.click();
    },

    // ---------- organising: hide and reorder categories and channels, own groups ----------
    // Saved per list ('live', 'movie', 'series'): { hidden: [keys], order: [keys],
    // chHidden: { groupKey: [channel keys] }, chOrder: { groupKey: [channel keys] } }.
    org(kind) { return Store.get('org.' + kind, null) || {}; },
    saveOrg(kind, o) { Store.set('org.' + kind, o); this.redrawLater = true; if (kind === 'live') this.homeRowsLater(); },
    myGroups() { return Store.get('myGroups', []); },
    saveMyGroups(list) { Store.set('myGroups', list); this.redrawLater = true; this.homeRowsLater(); },
    // list in the viewer's order, without the hidden. Something new since (a new group, a new
    // category from the provider) stays next to what comes before it in the natural order.
    arrange(list, keyOf, order = [], hidden = []) {
      const off = new Set(hidden), at = new Map(order.map((k, i) => [k, i]));
      let last = -1;
      return list.map((x, i) => {
        const k = keyOf(x);
        if (at.has(k)) { last = at.get(k); return [x, last]; }
        return [x, last + 0.5 + i * 1e-6];
      }).filter(([x]) => !off.has(keyOf(x))).sort((a, b) => a[1] - b[1]).map(([x]) => x);
    },
    organised(groups, kind) {
      const o = this.org(kind);
      return this.arrange(groups, g => g.key, o.order, o.hidden).map(g => {
        const ho = (o.chHidden || {})[g.key], or = (o.chOrder || {})[g.key];
        return ho || or ? { ...g, channels: this.arrange(g.channels, c => c.gkey, or, ho) } : g;
      });
    },

    // Play list[index]; group = {key, name} is what the player's channel list opens on.
    playChannel(list, index, group = {}, version) {
      const ch = list[index];
      const v = version || ch.versions[0];
      Player.open({
        kind: 'live', id: v.stream_id, url: v.url, radio: v.radio, img: v.stream_icon, title: ch.label,
        subtitle: group.name || ch.source || '', version: v, list, index, groupKey: group.key,
      });
    },

    // Called by both players when live playback ends: reopen Live TV on what was watched.
    afterLive(groupKey, gkey) {
      if (groupKey && !groupKey.startsWith('@now')) this.liveCat = groupKey;
      this.liveFocus = gkey;
      if (this.view === 'live') this.route();
    },

    // A titled row of channel tiles; click plays that channel with the row as its zapping list.
    channelRow(title, list, group, note = '') {
      if (!list.length) return '';
      const [a, ...b] = T(title).split(' ');
      return `<section class="row free-row" data-group="${esc(group.key)}"><h2><b>${esc(a)}</b> ${esc(b.join(' '))}${note ? ` <small class="free-note">${esc(note)}</small>` : ''}</h2>
        <div class="row-scroll">${list.map((c, i) => `
          <button class="tile${c.radio ? ' is-radio' : ''}" data-ch="${i}">
            <span class="tile-logo">${c.stream_icon ? `<img loading="lazy" src="${esc(c.stream_icon)}" alt="">` : ''}<span class="ph">${esc(c.label)}</span><span class="play">${ICONS.play}</span></span>
            <span class="tile-name">${this.isFav('live', c.gkey) ? '<span class="fav-star">★</span>' : ''}${esc(c.label)}${c.radio ? ' <span class="chip">Radio</span>' : ''}</span>
          </button>`).join('')}</div></section>`;
    },

    bindChannelRows(slot, rows) {
      slot.onclick = e => {
        const b = e.target.closest('[data-ch]');
        const sec = b && b.closest('[data-group]');
        const row = sec && rows.find(r => r.group.key === sec.dataset.group);
        if (row) this.playChannel(row.list, Number(b.dataset.ch), row.group);
      };
    },

    // Free playlists (sign-in screen and Home), plus Favorite / Recent channels on Home.
    async renderFree(slot, withMine = false) {
      const groups = withMine ? await this.liveGroups().catch(() => []) : (await this.liveCatalog()).groups.filter(g => g.free);
      if (!slot.isConnected) return;
      const rows = groups.filter(g => g.free || (withMine && g.special)).map(g => ({ group: g, list: g.channels }));
      slot.innerHTML = rows.map(r => this.channelRow(
        r.group.key === '@fav' ? 'Favorite channels' : r.group.key === '@recent' ? 'Recently watched channels' : r.group.name,
        r.list, r.group, r.group.free ? (r.group.builtin ? 'Free · Live TV & radio' : 'Your playlist') : '')).join('');
      this.bindChannelRows(slot, rows);
    },

    // ---------- favorites & recently watched ----------
    // fav: { movie: [gkey], series: [gkey], live: [gkey] } — gkeys cover every version of a title/channel.
    favs(kind) { return (Store.get('fav', {})[kind]) || []; },
    isFav(kind, key) { return !!key && this.favs(kind).includes(key); },
    setFav(kind, key, on) {
      const all = Store.get('fav', {});
      const list = (all[kind] || []).filter(k => k !== key);
      if (on) list.unshift(key);
      all[kind] = list.slice(0, 500);
      Store.set('fav', all);
    },
    toggleFav(kind, key, name) {
      const on = !this.isFav(kind, key);
      this.setFav(kind, key, on);
      this.homeRowsLater();
      this.toast(on ? `★ ${name || 'Added'} — added to ${kind === 'live' ? 'Favorites' : 'My List'}` : `Removed from ${kind === 'live' ? 'Favorites' : 'My List'}`);
      return on;
    },
    recentLive() { return Store.get('recentLive', []); },
    pushRecent(gkey) {
      if (!gkey) return;
      Store.set('recentLive', [gkey, ...this.recentLive().filter(k => k !== gkey)].slice(0, 30));
      this.homeRowsLater();
    },

    // Remote number keys: find a channel by its number, preferring the group being watched.
    async findChannelByNum(num, list) {
      const want = String(num);
      const inList = (list || []).findIndex(c => String(c.num) === want);
      if (inList >= 0) return { list, index: inList };
      for (const g of (await this.liveCatalog()).groups) {
        const i = g.channels.findIndex(c => String(c.num) === want);
        if (i >= 0) return { list: g.channels, index: i, group: g };
      }
      return null;
    },

    // ---------- continue watching ----------
    cw() { return Store.get('cw', []); },
    cwGet(key) { return this.cw().find(e => e.key === key); },
    cwSave(entry, pos, dur) {
      let list = this.cw().filter(e => e.key !== entry.key);
      if (pos / dur < 0.95) list.unshift({ ...entry, pos, dur, t: Date.now() });
      Store.set('cw', list.slice(0, 30));
      this.homeRowsLater(60000); // progress is saved often while playing: once a minute is plenty
    },
    cwRemove(key) { Store.set('cw', this.cw().filter(e => e.key !== key)); this.homeRowsLater(); },

    // A film's other versions (other language or quality), for the player to try when this one
    // won't play, before the VPN.
    versionLabel(v) { return [v.lang, v.quality, ...(v.tags || [])].filter(Boolean).join(' · ') || 'Other version'; },
    altVersions(item) {
      const alts = (item.versions || []).filter(v => String(v.id) !== String(item.id))
        .map(v => ({ id: v.id, ext: v.ext || 'mp4', label: this.versionLabel(v), lang: v.lang || '' }));
      return alts.length ? { label: this.versionLabel(item), alts } : {};
    },
    // The same episode (season and number) in the series' other versions. Slow answers (4 s) are
    // left out; the provider's answers are cached, so it costs nothing the next time.
    async episodeAlts(item) {
      const others = (item.versions || []).filter(v => String(v.id) !== String(item.id));
      if (!others.length || !this.api) return () => [];
      const cut = p => Promise.race([p, new Promise(r => setTimeout(() => r(null), 4000))]);
      const infos = await Promise.all(others.map(v => cut(this.api.seriesInfo(v.id).catch(() => null)).then(d => ({ v, d }))));
      return ep => infos.flatMap(({ v, d }) => {
        const hit = asArray(d && d.episodes && d.episodes[ep.season]).find(e => String(e.episode_num) === String(ep.episode_num));
        return hit ? [{ id: hit.id, ext: hit.container_extension || 'mp4', label: this.versionLabel(v), lang: v.lang || '' }] : [];
      });
    },

    // ---------- audio language from the playlist languages ----------
    // The audio languages of the playlist languages chosen (Settings → Playlist languages):
    // one → films and episodes start in it; several → asked before a title that comes in more
    // than one of them (a series remembers the answer).
    audioLangs() {
      if (!this.api || !this.langPickerOn()) return [];
      return [...new Set((Store.get(this.langKey(this.api)) || []).map(audioOf).filter(Boolean))];
    },
    async pickAudio(entry) {
      const chosen = this.audioLangs();
      if (!chosen.length) return { entry, lang: '' };
      const versions = [{ id: entry.id, ext: entry.ext, label: entry.label, lang: entry.lang }, ...(entry.alts || [])];
      const verLang = v => audioOf(v.lang);
      const useVersion = lang => {
        const v = versions.find(x => verLang(x) === lang);
        if (!v || String(v.id) === String(entry.id)) return entry;
        // That language's version plays first; the others stay as fall-backs.
        return { ...entry, id: v.id, ext: v.ext, label: v.label, lang: v.lang, alts: versions.filter(x => x !== v) };
      };
      if (chosen.length === 1) return { entry: useVersion(chosen[0]), lang: chosen[0] };
      const offered = chosen.filter(l => versions.some(v => verLang(v) === l));
      const remember = entry.seriesId ? 'audio:' + entry.seriesId : '';
      const saved = remember && (Store.get('audioPick', {}) || {})[remember];
      if (saved && chosen.includes(saved)) return { entry: useVersion(saved), lang: saved };
      // One version only: it plays in its own language when that's one of the chosen ones.
      if (offered.length === 1 && versions.length === 1) return { entry, lang: offered[0] };
      const ask = offered.length >= 2 ? offered : chosen;
      const name = l => { try { const n = new Intl.DisplayNames([LOCALE, 'en'], { type: 'language' }).of(l); return n.charAt(0).toLocaleUpperCase(LOCALE) + n.slice(1); } catch { return l.toUpperCase(); } };
      return new Promise(resolve => {
        let done = false;
        const m = this.openModal(`${this.closeBtn()}<h2 class="sheet-title">${esc(T('Audio language'))}</h2>
          <p class="muted">${esc(entry.title)}${entry.kind === 'episode' ? ' · ' + esc(entry.subtitle.split(' — ')[0]) : ''}</p>
          <div class="pick-list">${ask.map(l => `<button class="cat" data-l="${l}">${esc(name(l))}${versions.some(v => verLang(v) === l) ? '' : ` <span>${esc(T('if the file has it'))}</span>`}</button>`).join('')}</div>`, 'settings');
        this.modalOnClose = () => { if (!done) resolve(null); };
        $('.pick-list', m).addEventListener('click', e => {
          const b = e.target.closest('[data-l]');
          if (!b) return;
          done = true;
          const lang = b.dataset.l;
          if (remember) Store.set('audioPick', { ...(Store.get('audioPick', {}) || {}), [remember]: lang });
          this.closeModal();
          resolve({ entry: useVersion(lang), lang });
        });
        ($(`[data-l="${Store.get('audioLast', '')}"]`, m) || $('.pick-list button', m)).focus();
      }).then(r => { if (r) Store.set('audioLast', r.lang); return r; });
    },

    // queue: the episodes after this one. at: which of [entry, ...queue] the progress is for.
    async playEntry(entry, resume = true, queue = []) {
      // Resuming: the version and language already chosen, without asking again.
      const only = this.audioLangs().length === 1 ? this.audioLangs()[0] : '';
      const pick = resume && entry.pos > 5 ? { entry, lang: entry.audioLang || only || audioOf(entry.lang) } : await this.pickAudio(entry);
      if (!pick) return; // the question was closed: nothing plays
      entry = { ...pick.entry, audioLang: pick.lang };
      // The same language for the following episodes: their version in it, when there is one.
      const pickVer = e => {
        const v = (e.alts || []).find(x => audioOf(x.lang) === pick.lang);
        return pick.lang && v && audioOf(e.lang) !== pick.lang ? { ...e, id: v.id, ext: v.ext, label: v.label, lang: v.lang, alts: [{ id: e.id, ext: e.ext, label: e.label, lang: e.lang }, ...e.alts.filter(x => x !== v)] } : e;
      };
      queue = queue.map(pickVer);
      const all = [entry, ...queue]; // Continue watching keeps the version that plays
      Player.open({
        kind: entry.kind, id: entry.id, ext: entry.ext, title: entry.title, subtitle: entry.subtitle, audioLang: pick.lang,
        resumeAt: resume ? entry.pos : 0, label: entry.label, alts: entry.alts,
        queue: queue.map(e => ({ kind: e.kind, id: e.id, ext: e.ext, title: e.title, subtitle: e.subtitle, label: e.label, alts: e.alts })),
        onProgress: (pos, dur, at = 0) => all[at] && this.cwSave(all[at], pos, dur),
        onFinished: at => all[at] && this.cwRemove(all[at].key),
        onEnded: entry.onEnded,
      });
    },

    // ---------- shared UI ----------
    card(item) {
      const series = item.kind === 'series';
      const versions = item.versions || [item];
      const langs = [...new Set(versions.map(v => v.lang).filter(Boolean))];
      const has4k = versions.some(v => v.quality === '4K');
      const sub = [item.year, langs.slice(0, 3).join(' · ') + (langs.length > 3 ? ` +${langs.length - 3}` : '')].filter(Boolean).join('  •  ');
      const genre = this.coverGenreHtml(item);
      return `<button class="card${series ? ' is-series' : ''}" data-kind="${item.kind}" data-id="${item.id}">
        <span class="poster${genre ? ' has-genre' : ''}">
          <span class="ph">${esc(item.name)}</span>
          ${item.img ? `<img loading="lazy" src="${esc(item.img)}" alt="">` : ''}
          ${series ? '<span class="badge">Series</span>' : ''}
          ${has4k ? '<span class="q">4K</span>' : ''}
          ${this.isFav(item.kind, item.gkey) ? '<span class="fav-badge" title="In My List">★</span>' : ''}
          ${versions.length > 1 ? `<span class="vcount">${versions.length} versions</span>` : ''}
          ${genre}
          <span class="play">${ICONS.play}</span>
        </span>
        <span class="card-title">${esc(item.name)}</span>
        ${sub ? `<span class="card-sub">${esc(sub)}</span>` : ''}
      </button>`;
    },

    bindCards(root, lookup, onFocus) {
      root.addEventListener('click', e => {
        const c = e.target.closest('.card');
        if (!c) return;
        const item = lookup(c.dataset.kind, c.dataset.id);
        if (item) item.kind === 'series' ? this.openSeries(item) : this.openMovie(item);
      });
      if (onFocus) {
        const f = debounce(c => { const item = lookup(c.dataset.kind, c.dataset.id); if (item) onFocus(item); }, 220);
        root.addEventListener('focusin', e => { const c = e.target.closest('.card'); if (c) f(c); });
        root.addEventListener('mouseover', e => { const c = e.target.closest('.card'); if (c) f(c); });
      }
    },

    row(title, items, extraClass = '') {
      if (!items.length) return '';
      const [a, ...b] = T(title).split(' ');
      return `<section class="row ${extraClass}"><h2><b>${esc(a)}</b> ${esc(b.join(' '))}</h2>
        <div class="row-scroll">${items.map(i => this.card(i)).join('')}</div></section>`;
    },

    setBackdrop(url) {
      const bg = $('#bg');
      const layers = $$('.bg-img', bg);
      const [cur, next] = layers[0].classList.contains('on') ? layers : [layers[1], layers[0]];
      if (!url) { cur.classList.remove('on'); return; }
      if (cur.dataset.url === url) return;
      const img = new Image();
      img.onload = () => {
        next.style.backgroundImage = `url("${url}")`;
        next.dataset.url = url;
        next.classList.add('on');
        cur.classList.remove('on');
      };
      img.src = url;
    },

    // ---------- home ----------
    async renderHome(main) {
      const [vod, series] = await Promise.all([this.loadVod(), this.loadSeries(), this.genreCats('movie'), this.genreCats('series')]);
      const movies = uniq(this.allowed(vod)), shows = uniq(series);
      // Two movies, then one series, so both show up even when one side is updated more often.
      const latest = [];
      for (let i = 0; latest.length < 30 && i < 30; i++) {
        latest.push(...movies.slice(i * 2, i * 2 + 2));
        if (shows[i]) latest.push(shows[i]);
      }
      const topRated = movies.slice(0, 3000).filter(m => m.rating >= 7.5).slice(0, 30);
      const recentSeries = shows.slice(0, 30);
      // My List: favorite movies and series, newest first.
      const byG = new Map([...movies, ...shows].map(i => [i.kind + i.gkey, i]));
      const myList = Store.get('fav', {});
      const mine = [...(myList.series || []).map(k => byG.get('series' + k)), ...(myList.movie || []).map(k => byG.get('movie' + k))].filter(Boolean);
      const index = new Map([...latest, ...topRated, ...recentSeries, ...mine].map(i => [i.kind + i.id, i]));

      main.innerHTML = `
        <section class="hero" id="hero">
          <div class="hero-info">
            <div class="hero-genre"></div>
            <h1 class="hero-title"></h1>
            <div class="hero-meta"></div>
            <p class="hero-plot"></p>
            <div class="hero-actions">
              <button class="btn primary" data-hero="play">${ICONS.play}<span>Watch now</span></button>
              <button class="btn ghost" data-hero="info">${ICONS.info}<span>More info</span></button>
            </div>
          </div>
        </section>
        <div class="rows">
          ${this.row('Latest added', latest, 'first')}
          <div id="cwSlot"></div>
          ${this.row('My List', mine)}
          <div id="freeSlot"></div>
          <div id="popSlot"></div>
          ${this.row('Top rated', topRated)}
          ${this.row('New episodes', recentSeries)}
        </div>`;

      const lookup = (k, id) => index.get(k + id);
      this.bindCards($('.rows', main), lookup, item => this.setHero(item));
      $('[data-hero="play"]', main).addEventListener('click', () => this.heroItem && (this.heroItem.kind === 'series' ? this.openSeries(this.heroItem) : this.openMovie(this.heroItem, true)));
      $('[data-hero="info"]', main).addEventListener('click', () => this.heroItem && (this.heroItem.kind === 'series' ? this.openSeries(this.heroItem) : this.openMovie(this.heroItem)));
      this.renderContinue();
      this.renderFree($('#freeSlot', main), true);
      if (latest[0]) this.setHero(latest[0]);

      // TMDB-ranked rows arrive a moment later so they never hold up the page.
      Promise.all([this.tmdbPicks('movie'), this.tmdbPicks('series')]).then(([mp, sp]) => {
        const slot = $('#popSlot', main);
        if (!slot) return;
        const pm = mp.byPop.slice(0, 30), ps = sp.byPop.slice(0, 30);
        for (const i of [...pm, ...ps]) index.set(i.kind + i.id, i);
        slot.innerHTML = this.row('Most watched movies', pm) + this.row('Most watched series', ps);
      });
      const first = $('.row.first .card', main);
      if (first && !$('#modal:not(.hidden)')) first.focus({ preventScroll: true });
    },

    renderContinue() {
      const slot = $('#cwSlot');
      if (!slot) return;
      const list = this.cw();
      if (!list.length) { slot.innerHTML = ''; return; }
      slot.innerHTML = `<section class="row cw"><h2><b>Continue</b> Watching</h2><div class="row-scroll">
        ${list.map(e => `<button class="wide" data-key="${esc(e.key)}">
          <span class="wide-img">${e.backdrop || e.img ? `<img loading="lazy" src="${esc(e.backdrop || e.img)}" alt="">` : ''}<span class="play">${ICONS.play}</span></span>
          <span class="wide-text"><b>${esc(e.title)}</b><small>${esc(e.subtitle || '')} · ${fmtDur(e.dur - e.pos)} left</small></span>
          <span class="bar"><i style="width:${Math.min(100, (e.pos / e.dur) * 100).toFixed(1)}%"></i></span>
        </button>`).join('')}</div></section>`;
      slot.querySelector('.row-scroll').addEventListener('click', e => {
        const b = e.target.closest('.wide');
        const entry = b && this.cwGet(b.dataset.key);
        if (entry) this.playEntry(entry);
      });
    },

    async setHero(item) {
      this.heroItem = item;
      const hero = $('#hero');
      if (!hero) return;
      const put = (genre, title, logo, meta, plot) => {
        $('.hero-genre', hero).textContent = genre || (item.kind === 'series' ? 'Series' : 'Movie');
        $('.hero-title', hero).innerHTML = logo ? `<img class="hero-logo" src="${esc(logo)}" alt="${esc(title)}">` : esc(title);
        $('.hero-meta', hero).innerHTML = meta;
        $('.hero-plot', hero).textContent = plot || '';
      };
      const chips = (year, rating, extra) => [
        item.lang && `<span class="chip">${esc(item.lang)}</span>`,
        item.quality && `<span class="chip">${esc(item.quality)}</span>`,
        year && `<span>${esc(year)}</span>`,
        rating && `<span class="rate">${ICONS.star}${esc(rating)}</span>`,
        extra && `<span>${esc(extra)}</span>`,
      ].filter(Boolean).join('');

      put(item.genre && item.genre.split(/[,/]/).slice(0, 2).join(', '), item.name, '', chips(item.year, item.rating ? item.rating.toFixed(1) : ''), item.plot);
      this.setBackdrop(item.backdrop || '');
      hero.classList.remove('in'); void hero.offsetWidth; hero.classList.add('in');

      const t = await TMDB.details(item.kind === 'series' ? 'tv' : 'movie', item.tmdb);
      if (this.heroItem !== item || !t) return;
      put(t.genres.slice(0, 2).join(', '), t.title || item.name, t.logo, chips(t.year || item.year, t.rating, t.runtime ? fmtDur(t.runtime * 60) : ''), t.overview || item.plot);
      this.setBackdrop(t.backdrop || item.backdrop || '');
    },

    // ---------- movies / series browse ----------
    renderMovies(main) { return this.renderBrowse(main, 'movie'); },
    renderSeries(main) { return this.renderBrowse(main, 'series'); },

    async renderBrowse(main, kind) {
      this.setBackdrop('');
      const [all, cats, picks] = await Promise.all([kind === 'movie' ? this.loadVod() : this.loadSeries(), this.loadCats(kind), this.tmdbPicks(kind)]);
      await this.genreCats(kind);
      const hiddenCats = new Set(this.org(kind).hidden || []);
      const items = this.allowed(all).filter(i => !hiddenCats.has(String(i.cat)));
      const perCat = {};
      for (const i of items) (perCat[i.cat] || (perCat[i.cat] = new Set())).add(i.gkey);
      const counts = Object.fromEntries(Object.entries(perCat).map(([k, v]) => [k, v.size]));
      const ob = this.org(kind);
      const usable = this.arrange(cats.filter(c => counts[c.category_id]), c => String(c.category_id), ob.order, ob.hidden);
      const byId = new Map(items.map(i => [i.kind + i.id, i]));
      const label = kind === 'movie' ? 'Movies' : 'Series';
      const latest = uniq(items);
      const byGkey = new Map(latest.map(i => [i.gkey, i]));
      const mine = () => this.favs(kind).map(k => byGkey.get(k)).filter(Boolean);
      const virtual = { '': latest, '@top': picks.byDate, '@popular': picks.byPop };
      const titles = { '': `<b>Latest</b> ${label.toLowerCase()}`, '@top': `<b>Top</b> picks`, '@popular': `<b>Most</b> watched`, '@fav': `<b>My</b> List` };
      const wanted = this.wantGenre; this.wantGenre = 0; // chosen from Search
      const startCat = picks.byDate.length && !wanted ? '@top' : '';

      main.innerHTML = `
        <section class="slider" id="slider" aria-roledescription="carousel"></section>
        <div class="browse">
          <aside class="cats">
            <input class="field" type="search" placeholder="Filter categories" id="catFilter">
            <div class="cat-list" id="catList">
              <button class="cat special org-open" data-org="${kind}" data-name="">✎ Organise</button>
              <button class="cat special" data-cat="@fav">★ My List <span>${mine().length}</span></button>
              ${picks.byDate.length ? `
              <button class="cat special" data-cat="@top">Top picks <span>${picks.byDate.length}</span></button>
              <button class="cat special" data-cat="@popular">Most watched <span>${picks.byPop.length}</span></button>` : ''}
              <button class="cat" data-cat="">Latest added <span>${latest.length}</span></button>
              ${usable.map(c => `<button class="cat" data-cat="${esc(c.category_id)}" data-name="${esc(fold(c.category_name))}">${esc(c.category_name)} <span>${counts[c.category_id]}</span></button>`).join('')}
            </div>
          </aside>
          <section class="grid-wrap">
            <div class="grid-head">
              <h2 id="gridTitle"></h2>
              <select class="field sort" id="sort">
                <option value="auto">Default order</option><option value="added">Recently added</option><option value="year">Release year</option><option value="name">A – Z</option><option value="za">Z – A</option><option value="rating">Top rated</option>
              </select>
            </div>
            <div class="genre-cards" id="genres" hidden></div>
            <div class="grid" id="grid"></div>
            <div class="sentinel" id="sentinel"></div>
          </section>
        </div>`;

      let current = items, shown = 0;
      const grid = $('#grid', main);
      const sortSel = $('#sort', main), genreRow = $('#genres', main);
      let genre = String(wanted || '');
      // The row grows while titles are being looked up; left alone while the viewer is on it.
      const paintGenres = () => {
        if (!genreRow.isConnected || genreRow.contains(document.activeElement)) return;
        const n = {};
        for (const i of latest) for (const g of this.genresOf(i)) n[g] = (n[g] || 0) + 1;
        const list = GENRES.filter(g => n[g.id] || String(g.id) === genre).map(g => ({ ...g, label: this.genreName(g) })).sort((x, y) => x.label.localeCompare(y.label));
        const tile = (id, label) => `<button class="genre-card${id === genre ? ' active' : ''}" data-g="${id}">${esc(label)}</button>`;
        genreRow.innerHTML = tile('', this.infoName('All genres')) + list.map(g => tile(String(g.id), g.label)).join('');
        genreRow.hidden = !list.length;
      };
      paintGenres();
      if (genre) { const b = $('.genre-card.active', genreRow); if (b) genreRow.scrollLeft = b.offsetLeft - 20; }
      // Covers already on screen get their genres as they're found.
      const paintCovers = () => $$('.poster:not(.has-genre)', grid).forEach(p => {
        const c = p.closest('.card'), item = byId.get(c.dataset.kind + c.dataset.id), html = item && this.coverGenreHtml(item);
        if (html) { p.classList.add('has-genre'); $('.play', p).insertAdjacentHTML('beforebegin', html); }
      });
      this.onGenres = () => { if (grid.isConnected) { paintGenres(); paintCovers(); } };
      const more = () => {
        const slice = current.slice(shown, shown + CHUNK);
        grid.insertAdjacentHTML('beforeend', slice.map(i => this.card(i)).join(''));
        shown += slice.length;
      };
      const show = (cat, name) => {
        let list = cat === '@fav' ? mine() : cat in virtual ? virtual[cat] : uniq(items.filter(i => i.cat === cat));
        const g = Number(genre);
        if (g) list = list.filter(i => this.genresOf(i).includes(g));
        const s = sortSel.value;
        // A–Z on the title itself: "- YAGA" files under Y, accents don't matter.
        const title = i => i._sortName || (i._sortName = fold(i.name).replace(/^[^a-z0-9]+/, ''));
        if (s === 'name') list = [...list].sort((a, b) => title(a).localeCompare(title(b)));
        else if (s === 'za') list = [...list].sort((a, b) => title(b).localeCompare(title(a)));
        else if (s === 'rating') list = [...list].sort((a, b) => b.rating - a.rating);
        else if (s === 'added') list = [...list].sort((a, b) => b.added - a.added);
        else if (s === 'year') list = [...list].sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0) || b.added - a.added);
        current = list; shown = 0; grid.innerHTML = '';
        $('#gridTitle', main).innerHTML = titles[cat] || esc(name);
        if (!list.length) grid.innerHTML = `<div class="empty"><p>${cat === '@fav' ? 'Nothing in My List yet. Open a title and choose “☆ My List” to add it here.' : 'Nothing here yet.'}</p></div>`;
        more();
      };

      $('#catList', main).addEventListener('click', e => {
        const org = e.target.closest('[data-org]');
        if (org) return this.openOrganise(org.dataset.org);
        const b = e.target.closest('.cat');
        if (!b) return;
        $$('.cat', main).forEach(c => c.classList.toggle('active', c === b));
        this.browseCat = b.dataset.cat;
        show(b.dataset.cat, b.firstChild.textContent.trim());
      });
      // The order chosen is kept for next time (one for movies, one for series).
      const sortKey = 'sort' + (kind === 'movie' ? 'Movies' : 'Series');
      if (Settings[sortKey] && $(`option[value="${Settings[sortKey]}"]`, sortSel)) sortSel.value = Settings[sortKey];
      sortSel.addEventListener('change', () => {
        Settings[sortKey] = sortSel.value; Settings.save();
        const b = $('.cat.active', main);
        show(b.dataset.cat, b.firstChild.textContent.trim());
      });
      genreRow.addEventListener('click', e => {
        const card = e.target.closest('.genre-card');
        if (!card) return;
        genre = card.dataset.g;
        $$('.genre-card', genreRow).forEach(c => c.classList.toggle('active', c === card));
        // Top picks are a short list: a genre is looked for in the whole catalog.
        let b = $('.cat.active', main);
        if (genre && /^@(top|popular)$/.test(b.dataset.cat)) {
          b.classList.remove('active');
          b = $('.cat[data-cat=""]', main);
          b.classList.add('active');
        }
        show(b.dataset.cat, b.firstChild.textContent.trim());
      });
      $('#catFilter', main).addEventListener('input', e => {
        const q = fold(e.target.value);
        $$('.cat[data-name]', main).forEach(c => { c.hidden = q && !c.dataset.name.includes(q); });
      });
      this.bindCards(grid, (k, id) => byId.get(k + id));

      new IntersectionObserver(es => { if (es[0].isIntersecting && shown < current.length) more(); }, { rootMargin: '800px' })
        .observe($('#sentinel', main));
      const first = $(`.cat[data-cat="${startCat}"]`, main);
      first.classList.add('active');
      show(startCat, '');
      first.focus({ preventScroll: true });
      this.renderSlider($('#slider', main), kind, picks.byDate);
    },

    // Banner carousel: newest TMDB top titles that are in the catalog, with their TMDB backdrops.
    async renderSlider(host, kind, picks) {
      const type = kind === 'movie' ? 'movie' : 'tv';
      const cands = picks.slice(0, 14);
      const details = await Promise.all(cands.map(i => TMDB.details(type, i.tmdb)));
      const slides = cands.map((item, k) => ({ item, t: details[k] })).filter(s => s.t && s.t.backdrop).slice(0, 8);
      if (!host.isConnected) return;
      if (!slides.length) { host.remove(); return; }
      host.innerHTML = `
        <div class="slides">${slides.map(({ item, t }, k) => `
          <div class="slide${k === 0 ? ' on' : ''}"${k === 0 ? '' : ' inert'} data-bg="${esc(t.backdrop.replace('/w1280/', '/original/'))}">
            <div class="slide-info">
              <div class="slide-kicker">${esc(t.genres.slice(0, 2).join(', ') || (kind === 'movie' ? 'Movie' : 'Series'))}</div>
              <h2 class="slide-title">${t.logo ? `<img src="${esc(t.logo)}" alt="${esc(t.title)}">` : esc(t.title || item.name)}</h2>
              <div class="hero-meta">${[t.year && `<span>${esc(t.year)}</span>`, t.rating && `<span class="rate">${ICONS.star}${esc(t.rating)}</span>`,
                ...[...new Set(item.versions.map(v => v.lang).filter(Boolean))].slice(0, 4).map(l => `<span class="chip">${esc(l)}</span>`),
                item.versions.some(v => v.quality === '4K') && '<span class="chip">4K</span>'].filter(Boolean).join('')}</div>
              <p class="slide-plot">${esc(t.overview || '')}</p>
              <div class="hero-actions">
                <button class="btn primary" data-k="${k}" data-s="play">${ICONS.play}<span>${kind === 'movie' ? 'Watch now' : 'Episodes'}</span></button>
                <button class="btn ghost" data-k="${k}" data-s="info">${ICONS.info}<span>More info</span></button>
              </div>
            </div>
          </div>`).join('')}</div>
        ${slides.length > 1 ? `
        <button class="round-btn slide-nav prev" aria-label="Previous"><svg viewBox="0 0 24 24"><path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <button class="round-btn slide-nav next" aria-label="Next"><svg viewBox="0 0 24 24"><path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <div class="dots">${slides.map((_, k) => `<button class="dot${k === 0 ? ' on' : ''}" data-dot="${k}" aria-label="Slide ${k + 1}"></button>`).join('')}</div>` : ''}`;

      let at = 0;
      const els = $$('.slide', host), dots = $$('.dot', host);
      // Full-size pictures: only the slide on screen and its two neighbours stay in memory.
      const paint = () => els.forEach((el, i) => {
        const d = (i - at + els.length) % els.length;
        const want = d <= 1 || d === els.length - 1;
        if (want && !el.style.backgroundImage) el.style.backgroundImage = `url('${el.dataset.bg}')`;
        else if (!want && el.style.backgroundImage) el.style.backgroundImage = '';
      });
      paint();
      const go = k => {
        at = (k + slides.length) % slides.length;
        paint();
        // The attribute (not the property): 2018–2021 TVs don't know `inert`, and nav.js skips [inert].
        els.forEach((el, i) => { el.classList.toggle('on', i === at); if (i === at) el.removeAttribute('inert'); else el.setAttribute('inert', ''); });
        dots.forEach((d, i) => d.classList.toggle('on', i === at));
      };
      host.addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.dot) go(Number(b.dataset.dot));
        else if (b.classList.contains('prev')) go(at - 1);
        else if (b.classList.contains('next')) go(at + 1);
        else if (b.dataset.s) {
          const item = slides[b.dataset.k].item;
          kind === 'movie' ? this.openMovie(item, b.dataset.s === 'play') : this.openSeries(item);
        }
      });
      const timer = setInterval(() => {
        if (!host.isConnected) return clearInterval(timer);
        if (document.hidden || Player.isOpen() || host.matches(':hover') || host.contains(document.activeElement) || !$('#modal').classList.contains('hidden')) return;
        go(at + 1);
      }, 7000);
    },

    // ---------- live ----------
    async renderLive(main) {
      this.setBackdrop('');
      const [base, cat] = await Promise.all([this.liveGroups(), this.liveCatalog()]);
      // TV and wider: genres are a row of pills. Phones: they stay in the swipeable category row.
      const phone = matchMedia('(max-width: 860px)').matches, pinned = g => g.free || g.special;
      const groups = phone ? [...base.filter(pinned), ...cat.genres, ...base.filter(g => !pinned(g))] : base;
      const genrePills = phone ? [] : cat.genres;
      const byKey = new Map([...groups, ...cat.genres].map(g => [g.key, g]));
      const catName = cat.catName;

      main.innerHTML = `
        <div class="live">
          <aside class="cats">
            <input class="field" type="search" placeholder="Filter categories" id="catFilter">
            <div class="cat-list" id="catList">
              <button class="cat special org-open" data-org="live" data-name="">✎ Organise</button>
              ${groups.map(g => `<button class="cat${g.free || g.special ? ' special' : ''}"${g.genre ? ' data-genre' : ''} data-cat="${esc(g.key)}" data-name="${esc(fold(T(g.name) + ' ' + g.name))}">${g.key === '@fav' ? '★ ' : ''}${esc(g.name)} <span>${g.channels.length}</span></button>`).join('')}
            </div>
          </aside>
          <section class="channels">
            <div class="grid-head"><h2 id="chTitle"></h2><input class="field" type="search" placeholder="Find channel" id="chFilter"></div>
            <div class="genre-cards" id="liveGenres"${genrePills.length ? '' : ' hidden'}>
              <button class="genre-card" data-cat="">${esc(this.infoName('All genres'))}</button>
              ${genrePills.map(g => `<button class="genre-card" data-cat="${esc(g.key)}">${esc(g.name)}</button>`).join('')}
            </div>
            <div class="ch-list" id="chList"></div>
            <div class="sentinel" id="chEnd"></div>
          </section>
          <aside class="guide" id="guide"><div class="guide-empty">Select a channel to see what’s on.</div></aside>
        </div>`;

      const qualities = ch => [...new Set(ch.versions.map(v => v.quality || 'SD'))];
      let current = [], group = null;
      const chList = $('#chList', main);
      const rowHtml = (c, i) => `
          <button class="ch" data-i="${i}">
            <span class="ch-num">${esc(c.num)}</span>
            <span class="ch-logo">${c.stream_icon ? `<img loading="lazy" src="${esc(c.stream_icon)}" alt="">` : ''}</span>
            <span class="ch-name">${esc(c.label)}</span>
            ${this.isFav('live', c.gkey) ? '<span class="fav-star" title="Favorite">★</span>' : ''}
            <span class="ch-q">${c.url ? (c.radio ? '<span class="chip">Radio</span>' : '') : qualities(c).map(t => `<span class="chip">${esc(t)}</span>`).join('')}</span>
            ${c.versions.some(v => Number(v.tv_archive)) ? '<span class="chip">Catch-up</span>' : ''}
          </button>`;
      // Rows are added as the list scrolls: a genre can hold thousands of channels.
      let shownCh = 0;
      const moreChannels = (upTo = 0) => {
        const end = Math.max(shownCh + 300, upTo + 50);
        chList.insertAdjacentHTML('beforeend', current.slice(shownCh, end).map((c, i) => rowHtml(c, shownCh + i)).join(''));
        shownCh = Math.min(end, current.length);
      };
      new IntersectionObserver(es => { if (es[0].isIntersecting && shownCh < current.length) moreChannels(); }, { rootMargin: '800px' })
        .observe($('#chEnd', main));
      const renderChannels = (key, q = '') => {
        group = byKey.get(key);
        current = group.channels.filter(c => !q || c.versions.some(v => v.key.includes(q)));
        $('#chTitle', main).textContent = group.name;
        shownCh = 0;
        chList.innerHTML = current.length ? '' : '<div class="empty"><p>No channels.</p></div>';
        moreChannels();
      };
      // A category, or a genre pill (which looks across every category). "All genres" goes back
      // to the category that was showing.
      const pills = $('#liveGenres', main);
      let lastCat = null;
      const pick = b => {
        const isCat = b.classList.contains('cat');
        if (!isCat && !b.dataset.cat) return pick(lastCat || $('.cat', main));
        if (isCat) lastCat = b;
        $$('.cat', main).forEach(c => c.classList.toggle('active', c === b));
        $$('.genre-card', pills).forEach(c => c.classList.toggle('active', isCat ? !c.dataset.cat : c === b));
        $('#chFilter', main).value = '';
        this.liveCat = b.dataset.cat;
        renderChannels(b.dataset.cat);
      };

      $('#catList', main).addEventListener('click', e => {
        const org = e.target.closest('[data-org]');
        if (org) return this.openOrganise('live');
        const b = e.target.closest('.cat'); if (b) pick(b);
      });
      pills.addEventListener('click', e => { const b = e.target.closest('.genre-card'); if (b) pick(b); });
      $('#catFilter', main).addEventListener('input', e => {
        const q = fold(e.target.value);
        $$('.cat', main).forEach(c => { c.hidden = q && !c.dataset.name.includes(q); });
      });
      $('#chFilter', main).addEventListener('input', debounce(e => {
        if (group) renderChannels(group.key, fold(e.target.value));
      }, 150));

      const play = (index, version) => this.playChannel(current, index, group, version);

      const guide = $('#guide', main);
      const favBtn = ch => `<button class="btn ghost sm fav-btn" data-fav>${this.isFav('live', ch.gkey) ? '★ In Favorites' : '☆ Add to Favorites'}</button>`;
      const bindFav = (ch, index) => {
        const b = $('[data-fav]', guide);
        b && b.addEventListener('click', () => {
          this.toggleFav('live', ch.gkey, ch.label);
          b.outerHTML = favBtn(ch);
          bindFav(ch, index);
          const row = chList.querySelector(`[data-i="${index}"]`);
          if (row) row.outerHTML = rowHtml(ch, index);
          $('[data-fav]', guide).focus();
        });
      };
      const showGuide = debounce(async index => {
        const ch = current[index];
        const head = `<div class="guide-head">${ch.stream_icon ? `<img src="${esc(ch.stream_icon)}" alt="">` : ''}<h3>${esc(ch.label)}</h3></div>${favBtn(ch)}`;
        if (ch.url) {
          guide.innerHTML = `${head}<div class="guide-empty">${ch.radio ? 'Live radio' : 'Live TV'} from ${esc(ch.source)} — free, no guide information.</div>`;
          bindFav(ch, index);
          return;
        }
        const epgSource = ch.versions.find(v => v.epg_channel_id) || ch.versions[0];
        guide.innerHTML = `${head}
          ${ch.versions.length > 1 ? `<div class="guide-vers"><h4>Versions <span class="muted">${ch.versions.length}</span></h4>
            ${ch.versions.map((v, vi) => `<button class="gver" data-v="${vi}">
              <span class="chip">${esc(v.quality || 'SD')}</span>${v.tags.map(t => `<span class="chip">${esc(t)}</span>`).join('')}
              <small>${esc(catName[String(v.category_id)] || '')}</small>${ICONS.play}</button>`).join('')}</div>` : ''}
          <div class="loader small"><span></span></div>`;
        bindFav(ch, index);
        $$('.gver', guide).forEach(b => b.addEventListener('click', () => play(index, ch.versions[b.dataset.v])));
        // Catch-up channels: the full guide, so recent programmes can be replayed.
        const hasArchive = ch.versions.some(v => Number(v.tv_archive));
        let epg = [];
        try { epg = hasArchive ? await this.epgFor(ch) : await this.api.shortEpg(epgSource.stream_id, 8); } catch {}
        if (!guide.isConnected || this.guideFor !== ch) return;
        const now = Date.now();
        const past = hasArchive ? epg.filter(e => e.end <= now && this.canReplay(ch, e)).slice(-4) : [];
        const rows = [...past, ...epg.filter(e => e.end > now).slice(0, 8)];
        $('.loader', guide).outerHTML = rows.length ? `<ol class="epg">${rows.map(e => {
          const live = e.start <= now && e.end > now, replay = e.end <= now;
          const pct = live ? ((now - e.start) / (e.end - e.start)) * 100 : 0;
          const inner = `<time>${replay ? esc(this.dayLabel(e.start)) + ' · ' : ''}${hm(e.start)} – ${hm(e.end)}</time><b>${replay ? '⟲ ' : ''}${esc(e.title)}</b>
            ${live ? `<span class="bar"><i style="width:${pct.toFixed(1)}%"></i></span>` : ''}
            ${e.description ? `<p>${esc(e.description)}</p>` : ''}`;
          return replay ? `<li class="past"><button class="epg-replay" data-replay="${rows.indexOf(e)}">${inner}<span class="chip">Replay</span></button></li>`
            : `<li class="${live ? 'now' : ''}">${inner}</li>`;
        }).join('')}</ol>${hasArchive ? '<a class="guide-more" href="#guide">Open the TV Guide for the full week ›</a>' : ''}` : '<div class="guide-empty">No guide information for this channel.</div>';
        $$('[data-replay]', guide).forEach(b => b.addEventListener('click', () => this.playCatchup(ch, rows[Number(b.dataset.replay)])));
        const nowRow = $('.epg li.now', guide);
        if (nowRow) nowRow.scrollIntoView({ block: 'nearest' });
      }, 350);

      chList.addEventListener('focusin', e => { const b = e.target.closest('.ch'); if (b) { this.guideFor = current[b.dataset.i]; showGuide(Number(b.dataset.i)); } });
      chList.addEventListener('click', e => { const b = e.target.closest('.ch'); if (b) play(Number(b.dataset.i)); });

      // Reopen on the group (and channel) watched last.
      const start = (this.liveCat && $(`[data-cat="${CSS.escape(this.liveCat)}"]`, main)) || $('.cat:not([data-genre]):not([data-org])', main) || $('.cat:not([data-org])', main);
      if (!start) return;
      pick(start);
      start.scrollIntoView({ block: 'nearest' });
      const at = this.liveFocus ? current.findIndex(c => c.gkey === this.liveFocus) : -1;
      this.liveFocus = null;
      if (at >= shownCh) moreChannels(at);
      const target = at >= 0 ? chList.querySelector(`[data-i="${at}"]`) : start;
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: 'center' });
    },

    // ---------- EPG & catch-up ----------
    // The stream whose guide we read: the catch-up copy when there is one (its guide marks
    // which programmes can be replayed), otherwise one with a guide id.
    epgStream(ch) {
      if (ch.url) return null;
      return ch.versions.find(v => Number(v.tv_archive)) || ch.versions.find(v => v.epg_channel_id) || null;
    },

    // Cached for 20 minutes, at most 6 requests at a time.
    epgFor(ch) {
      // With the viewer's own guide link, channels the provider has no guide for can have one.
      const v = this.epgStream(ch) || (Settings.epgUrl && !ch.url && ch.versions && ch.versions[0]);
      if (!v || !this.api) return Promise.resolve([]);
      const cache = this.epgCache || (this.epgCache = new Map());
      const hit = cache.get(v.stream_id);
      if (hit && Date.now() - hit.t < 20 * 60e3) return hit.p;
      const p = this.epgLimit(() => this.api.epgTable(v.stream_id)).catch(() => []);
      cache.delete(v.stream_id); // keeps the newest last; the oldest goes first below
      cache.set(v.stream_id, { t: Date.now(), p });
      if (cache.size > 400) cache.delete(cache.keys().next().value);
      return p;
    },

    epgLimit(job) {
      this.epgQueue = this.epgQueue || [];
      this.epgActive = this.epgActive || 0;
      return new Promise((resolve, reject) => {
        const run = () => {
          this.epgActive++;
          job().then(resolve, reject).finally(() => {
            this.epgActive--;
            const next = this.epgQueue.shift();
            if (next) next();
          });
        };
        if (this.epgActive < 6) run(); else this.epgQueue.push(run);
      });
    },

    canReplay(ch, prog) {
      return !!prog && prog.archive && prog.end <= Date.now() && ch.versions.some(v => Number(v.tv_archive));
    },

    playCatchup(ch, prog) { Player.open(this.catchupItem(ch, prog)); },

    catchupItem(ch, prog) {
      const v = ch.versions.find(x => Number(x.tv_archive));
      const minutes = (prog.end - prog.start) / 60000 + 2;
      return {
        kind: 'catchup', url: this.api.catchupUrl(v.stream_id, prog.start, minutes), relay: true,
        title: prog.title, subtitle: `${ch.label} · ${this.dayLabel(prog.start)} ${hm(prog.start)}–${hm(prog.end)} · Replay`,
        img: ch.stream_icon,
      };
    },

    dayLabel(t) {
      const d = new Date(t), today = new Date();
      const diff = Math.round((new Date(d.toDateString()) - new Date(today.toDateString())) / 864e5);
      if (diff === 0) return 'Today';
      if (diff === -1) return 'Yesterday';
      if (diff === 1) return 'Tomorrow';
      return d.toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' });
    },

    // What happens when a programme is chosen: live now → watch, past + archive → replay.
    playProgramme(list, index, group, prog) {
      const ch = list[index], now = Date.now();
      if (!prog || (prog.start <= now && prog.end > now)) return this.playChannel(list, index, group);
      if (prog.end <= now) {
        if (this.canReplay(ch, prog)) return this.playCatchup(ch, prog);
        return this.toast(ch.versions.some(v => Number(v.tv_archive)) ? 'This programme is no longer in the replay archive' : 'Replay isn’t available on this channel');
      }
      this.futureProgramme(ch, prog);
    },

    // A programme still to come: a reminder, or (InkonabTV+) a recording on the USB drive.
    async futureProgramme(ch, prog) {
      const rec = window.Native && Native.player.recordings ? await Native.player.recordings().catch(() => null) : null;
      if (!rec || !rec.available) return this.toggleReminder(ch, prog);
      const has = this.hasReminder(ch.gkey, prog.start);
      const m = this.openModal(`${this.closeBtn()}<h2 class="sheet-title">${esc(prog.title)}</h2>
        <p class="muted">${esc(ch.label)} · ${esc(this.dayLabel(prog.start))} ${hm(prog.start)} – ${hm(prog.end)}</p>
        <div class="set-row vpn-actions"><button class="btn" id="fpRemind">${has ? '🔕 ' + esc(T('Remove reminder')) : '🔔 ' + esc(T('Reminder'))}</button>
        <button class="btn ghost" id="fpRec">⏺ ${esc(T('Record'))}</button></div>
        ${rec.usb ? '' : `<p class="muted small-note">${esc(T('Recordings go on a USB drive or memory stick: plug one into the TV box.'))}</p>`}`, 'settings');
      $('#fpRemind', m).addEventListener('click', () => { this.closeModal(); this.toggleReminder(ch, prog); });
      $('#fpRec', m).addEventListener('click', async () => {
        this.closeModal();
        this.recordProgramme(ch, prog);
      });
      $('#fpRemind', m).focus();
    },

    // Records a channel from start to end (two minutes either side) on the USB drive.
    async recordProgramme(ch, prog) {
      const v = ch.versions ? ch.versions[0] : ch;
      const url = v.url || (this.api && this.api.streamUrl('live', v.stream_id, 'ts'));
      if (!url) return this.toast('Can’t record this channel');
      const r = await Native.player.record({ title: prog.title, ch: ch.label || ch.name || '', url,
        start: prog.start - 2 * 60000, end: prog.end + 2 * 60000 }).catch(() => null);
      this.toast(r && r.ok ? `⏺ ${T('Recording set')}: ${prog.title} · ${this.dayLabel(prog.start)} ${hm(prog.start)}` : T((r && r.why) || 'Can’t record this channel'));
    },

    // Settings → Recordings (InkonabTV+): what's planned, running and saved on the USB drive.
    async openRecordings() {
      const r = await Native.player.recordings().catch(() => null);
      if (!r) return;
      const list = [...(r.list || [])].sort((a, b) => b.start - a.start);
      const size = b => b > 1e9 ? (b / 1e9).toFixed(1) + ' GB' : b >= 1e6 ? Math.round(b / 1e6) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB';
      const label = { scheduled: 'Planned', recording: '⏺ Recording', done: 'Saved', failed: 'Failed', stopped: 'Stopped' };
      const m = this.openModal(`${this.closeBtn()}<h2 class="sheet-title">${esc(T('Recordings'))}</h2>
        <p class="muted small-note">${esc(T(r.usb ? 'Saved on the USB drive, in Android/data/tv.inkonab.app.full/files/Recordings.' : 'Plug a USB drive or memory stick into the TV box to record.'))}</p>
        <div class="org-list">${list.length ? list.map((x, i) => `<div class="org-row" data-i="${i}">
          <span class="org-name">${esc(x.title || x.ch)} <small>${esc(x.ch)} · ${esc(this.dayLabel(x.start + 2 * 60000))} ${hm(x.start + 2 * 60000)} · ${esc(T(label[x.status] || x.status))}${x.bytes ? ' · ' + size(x.bytes) : ''}</small></span>
          ${x.file && (x.status === 'done' || x.status === 'stopped') ? '<button class="btn ghost sm" data-act="play">▶ Play</button>' : ''}
          ${x.status === 'recording' || x.status === 'scheduled' ? `<button class="btn ghost sm" data-act="stop">${esc(T(x.status === 'recording' ? 'Stop' : 'Cancel'))}</button>` : ''}
          <button class="btn ghost sm" data-act="delete">${esc(T('Delete'))}</button></div>`).join('') : `<p class="muted">${esc(T('No recordings yet. In the TV Guide, choose a programme still to come, or press OK on a channel and choose ⏺ Record.'))}</p>`}</div>`, 'settings organise');
      $('.org-list', m).addEventListener('click', async e => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        const x = list[Number(b.closest('.org-row').dataset.i)];
        if (b.dataset.act === 'play') {
          this.closeModal();
          return Player.open({ kind: 'movie', id: 'rec:' + x.id, url: 'file://' + x.file, title: x.title || x.ch, subtitle: x.ch + ' · ' + T('Recording') });
        }
        await Native.player.recordStop({ id: x.id, delete: b.dataset.act === 'delete' }).catch(() => {});
        setTimeout(() => this.openRecordings(), 400);
      });
      const first = $('.org-row button', m) || $('[data-close]', m);
      if (first) first.focus();
    },

    // ---------- TV guide grid ----------
    async renderGuide(main) {
      this.setBackdrop('');
      const groups = (await this.liveGroups()).filter(g => !g.free);
      if (!groups.length) { main.innerHTML = '<div class="empty"><h3>No channels</h3></div>'; return; }
      // The last group watched, else the first one whose channels have a guide.
      const hasGuide = g => g.channels.some(c => c.versions && c.versions.some(v => v.epg_channel_id));
      let group = groups.find(g => g.key === (this.guideCat || this.liveCat)) || groups.find(g => !g.special && hasGuide(g)) || groups.find(g => !g.special) || groups[0];
      const PX = 6;                      // pixels per minute
      const CELL = 260;                  // channel column width
      const maxBack = Math.max(1, ...group.channels.flatMap(c => c.versions.map(v => Number(v.tv_archive_duration) || 0)));
      let day = this.guideDay || 0;      // 0 = today, -1 = yesterday…

      main.innerHTML = `
        <div class="guide-page">
          <div class="gp-top">
            <div class="gp-info" id="gpInfo"><p class="muted">Move through the guide to see programme details. OK plays live programmes and replays past ones marked ⟲.</p></div>
            <div class="gp-controls">
              <button class="btn ghost" id="gpGroup"></button>
              <div class="gp-days" id="gpDays"></div>
              <button class="btn ghost" id="gpNow">Now</button>
            </div>
          </div>
          <div class="gp-grid" id="gpGrid" style="--px:${PX}px;--cell:${CELL}px"></div>
        </div>`;

      const grid = $('#gpGrid', main), info = $('#gpInfo', main);
      const days = [];
      for (let d = -Math.min(7, maxBack); d <= 1; d++) days.push(d);

      const paintControls = () => {
        $('#gpGroup', main).innerHTML = `${esc(group.key === '@fav' ? '★ ' + group.name : group.name)} <span class="muted">▾</span>`;
        $('#gpDays', main).innerHTML = days.map(d => `<button class="gp-day${d === day ? ' active' : ''}" data-day="${d}">${esc(this.dayLabel(Date.now() + d * 864e5))}</button>`).join('');
      };

      let observer;
      const render = () => {
        paintControls();
        const dayStart = new Date(new Date().toDateString()).getTime() + day * 864e5;
        const dayEnd = dayStart + 864e5;
        const width = 1440 * PX;
        const x = t => ((Math.max(dayStart, Math.min(dayEnd, t)) - dayStart) / 60000) * PX;
        const hours = Array.from({ length: 48 }, (_, i) => `<span style="left:${i * 30 * PX}px">${hm(dayStart + i * 30 * 60000)}</span>`).join('');
        grid.innerHTML = `
          <div class="gp-head"><div class="gp-corner">${esc(this.dayLabel(dayStart))}</div><div class="gp-ruler" style="width:${width}px">${hours}</div></div>
          <div class="gp-body">
          ${group.channels.map((c, i) => `
            <div class="gp-row" data-i="${i}">
              <div class="gp-ch"><span class="ch-num">${esc(c.num)}</span><span class="ch-logo">${c.stream_icon ? `<img loading="lazy" src="${esc(c.stream_icon)}" alt="">` : ''}</span><span class="gp-name">${esc(c.label)}</span>${c.versions.some(v => Number(v.tv_archive)) ? '<span class="gp-cu" title="Catch-up">⟲</span>' : ''}</div>
              <div class="gp-track" style="width:${width}px"><span class="gp-loading"></span></div>
            </div>`).join('')}
          <div class="gp-nowline" hidden></div>
          </div>`;

        const nowLine = $('.gp-nowline', grid);
        const placeNow = () => {
          const t = Date.now();
          nowLine.hidden = !(t >= dayStart && t < dayEnd);
          nowLine.style.left = `${(($('.gp-ch', grid) || {}).offsetWidth || CELL) + x(t)}px`;
        };
        placeNow();
        clearInterval(this.guideTimer);
        this.guideTimer = setInterval(() => { if (!grid.isConnected) return clearInterval(this.guideTimer); placeNow(); }, 60000);

        const fill = async row => {
          const i = Number(row.dataset.i), ch = group.channels[i];
          const list = await this.epgFor(ch);
          const track = $('.gp-track', row);
          if (!track || !grid.isConnected) return;
          const now = Date.now();
          const progs = list.filter(p => p.end > dayStart && p.start < dayEnd);
          row.progs = progs;
          track.innerHTML = progs.length ? progs.map((p, k) => {
            const state = p.end <= now ? 'past' : p.start <= now ? 'now' : 'future';
            const replay = this.canReplay(ch, p);
            const bell = state === 'future' && this.hasReminder(ch.gkey, p.start);
            return `<button class="prog ${state}${replay ? ' replay' : ''}" data-k="${k}" style="left:${x(p.start)}px;width:${Math.max(x(p.end) - x(p.start) - 3, 24)}px">
              <b>${replay ? '⟲ ' : bell ? '🔔 ' : ''}${esc(p.title)}</b><small>${hm(p.start)} – ${hm(p.end)}</small></button>`;
          }).join('') : `<button class="prog none" data-k="-1" style="left:0;width:${width - 4}px"><b>${ch.url ? 'Free channel' : 'No guide information'}</b><small>OK to watch live</small></button>`;
        };

        if (observer) observer.disconnect();
        observer = new IntersectionObserver(entries => {
          for (const e of entries) if (e.isIntersecting && !e.target.filled) { e.target.filled = true; fill(e.target); }
        }, { root: grid, rootMargin: '600px 0px' });
        $$('.gp-row', grid).forEach(r => observer.observe(r));

        // Start around now (today) or the evening (other days).
        const focusT = day === 0 ? Date.now() - 30 * 60000 : dayStart + 19 * 3600e3;
        grid.scrollLeft = Math.max(0, x(focusT));
        grid.scrollTop = 0;
      };

      const progAt = b => {
        const row = b.closest('.gp-row'), i = Number(row.dataset.i), k = Number(b.dataset.k);
        return { i, ch: group.channels[i], prog: k >= 0 && row.progs ? row.progs[k] : null };
      };
      const showInfo = debounce(b => {
        const { ch, prog } = progAt(b);
        const now = Date.now();
        const badge = !prog ? '<span class="chip">Live</span>'
          : prog.start <= now && prog.end > now ? `<span class="badge on-air">● Live now</span> <span class="bar gp-bar"><i style="width:${(((now - prog.start) / (prog.end - prog.start)) * 100).toFixed(1)}%"></i></span>`
          : prog.end <= now ? (this.canReplay(ch, prog) ? '<span class="badge replay">⟲ Replay — press OK</span>' : '<span class="chip">Ended</span>')
          : this.hasReminder(ch.gkey, prog.start) ? '<span class="chip">🔔 Reminder set — OK to change</span>' : '<span class="chip">Upcoming — OK for a reminder or recording</span>';
        info.innerHTML = `
          <div class="gp-info-ch">${ch.stream_icon ? `<img src="${esc(ch.stream_icon)}" alt="">` : ''}<span>${esc(ch.num)} · ${esc(ch.label)}</span></div>
          <h2>${esc(prog ? prog.title : ch.label)}</h2>
          <div class="gp-info-meta">${prog ? `${esc(this.dayLabel(prog.start))} · ${hm(prog.start)} – ${hm(prog.end)} · ${Math.round((prog.end - prog.start) / 60000)} min` : ''} ${badge}</div>
          <p>${esc(prog ? prog.description : '')}</p>`;
      }, 120);

      grid.addEventListener('focusin', e => { const b = e.target.closest('.prog'); if (b) showInfo(b); });
      grid.addEventListener('click', e => {
        const b = e.target.closest('.prog');
        if (!b) return;
        const { i, prog } = progAt(b);
        this.playProgramme(group.channels, i, group, prog);
        // A reminder set or removed: the bell on the programme and the info follow.
        if (prog && prog.start > Date.now()) {
          const t = $('b', b), on = this.hasReminder(group.channels[i].gkey, prog.start);
          if (t) t.textContent = (on ? '🔔 ' : '') + prog.title;
          showInfo(b);
        }
      });
      $('#gpDays', main).addEventListener('click', e => {
        const b = e.target.closest('[data-day]');
        if (!b) return;
        day = this.guideDay = Number(b.dataset.day);
        render();
        $(`[data-day="${day}"]`, main).focus();
      });
      $('#gpNow', main).addEventListener('click', () => {
        day = this.guideDay = 0;
        render();
        setTimeout(() => { const n = $('.gp-row .prog.now', grid) || $('.gp-row .prog', grid); n && n.focus({ preventScroll: true }); }, 400);
      });
      $('#gpGroup', main).addEventListener('click', () => {
        const m = this.openModal(`${this.closeBtn()}<h2 class="sheet-title">Choose a group</h2>
          <div class="pick-list">${groups.map((g, i) => `<button class="cat${g.special ? ' special' : ''}${g === group ? ' active' : ''}" data-g="${i}">${esc((g.key === '@fav' ? '★ ' : '') + g.name)} <span>${g.channels.length}</span></button>`).join('')}</div>`, 'settings');
        m.querySelector('.pick-list').addEventListener('click', e => {
          const b = e.target.closest('[data-g]');
          if (!b) return;
          group = groups[Number(b.dataset.g)];
          this.guideCat = group.key;
          this.closeModal();
          render();
          $('#gpGroup', main).focus();
        });
        ($('.pick-list .active', m) || $('.pick-list .cat', m)).focus();
      });

      render();
      // Land on what's on now for the first channel.
      setTimeout(() => {
        const n = $('.gp-row .prog.now', grid) || $('.gp-row .prog', grid);
        (n || $('#gpGroup', main)).focus({ preventScroll: true });
      }, 900);
    },

    // ---------- modal ----------
    openModal(html, cls = '') {
      const m = $('#modal');
      // Switching from one details page to another keeps the original focus target.
      if (!m.contains(document.activeElement)) this.modalReturn = document.activeElement;
      this.detailRefresh = null;
      this.modalOnClose = null;
      m.className = 'modal ' + cls;
      m.innerHTML = `<div class="sheet">${html}</div>`;
      m.scrollTop = 0;
      const close = $('[data-close]', m);
      close && close.addEventListener('click', () => this.closeModal());
      document.body.classList.add('modal-open');
      return m;
    },
    closeModal() {
      const m = $('#modal');
      if (m.classList.contains('hidden') || this.modalLocked) return;
      m.classList.add('hidden');
      m.innerHTML = '';
      document.body.classList.remove('modal-open');
      if (this.modalReturn && this.modalReturn.isConnected) this.modalReturn.focus({ preventScroll: true });
      if ($('#login').classList.contains('hidden')) this.stopPair();
      if (this.redrawLater && !Player.isOpen()) this.redraw();
      const after = this.modalOnClose;
      this.modalOnClose = null;
      if (after) after();
    },
    closeBtn: () => `<button class="round-btn close" data-close aria-label="Close">${ICONS.close}</button>`,

    detailShell(item) {
      return `${this.closeBtn()}
        <div class="detail-bg"></div>
        <div class="detail-body">
          <div class="detail-poster"><span class="ph">${esc(item.name)}</span>${item.img ? `<img src="${esc(item.img)}" alt="">` : ''}</div>
          <div class="detail-info">
            <div class="detail-chips">${[item.kind === 'series' ? '<span class="badge">Series</span>' : '', item.lang && `<span class="chip">${esc(langName(item.lang))}</span>`, ...[item.quality, ...(item.tags || [])].filter(Boolean).map(t => `<span class="chip">${esc(t)}</span>`), item.kind === 'movie' && item.ext ? `<span class="chip">${esc(item.ext.toUpperCase())}</span>` : ''].filter(Boolean).join('')}</div>
            <h1 class="detail-title">${esc(item.name)}</h1>
            <div class="detail-meta"></div>
            <p class="detail-plot">${esc(item.plot || '')}</p>
            <div class="detail-actions"></div>
            <div class="detail-extra"></div>
          </div>
        </div>`;
    },

    fillDetail(m, item, t, info) {
      const genres = (t && t.genres.length ? t.genres : String(info.genre || item.genre || '').split(/[,/]/).map(s => s.trim()).filter(Boolean)).slice(0, 3);
      const year = (t && t.year) || item.year || String(info.releasedate || info.releaseDate || '').slice(0, 4);
      const rating = (t && t.rating) || (item.rating ? item.rating.toFixed(1) : '');
      const secs = durSecs(info) || (t && t.runtime * 60) || 0;
      $('.detail-meta', m).innerHTML = [year && `<span>${esc(year)}</span>`, secs && `<span>${fmtDur(secs)}</span>`, rating && `<span class="rate">${ICONS.star}${esc(rating)}</span>`, genres.length && `<span>${esc(genres.join(' · '))}</span>`].filter(Boolean).join('');
      if (t && t.logo) $('.detail-title', m).innerHTML = `<img class="detail-logo" src="${esc(t.logo)}" alt="${esc(t.title)}">`;
      const plot = (t && t.overview) || info.plot || info.description || item.plot;
      if (plot) $('.detail-plot', m).textContent = plot;
      const bg = (t && t.backdrop) || firstImage(info.backdrop_path) || item.backdrop;
      if (bg) $('.detail-bg', m).style.backgroundImage = `url("${bg}")`;
      const cast = t && t.cast.length ? t.cast : [];
      const extra = [];
      if (cast.length) extra.push(`<h3>Cast</h3><div class="cast">${cast.map(c => `<div class="person"><span class="face">${c.photo ? `<img loading="lazy" src="${esc(c.photo)}" alt="">` : esc(c.name[0])}</span><b>${esc(c.name)}</b><small>${esc(c.role || '')}</small></div>`).join('')}</div>`);
      else if (info.cast) extra.push(`<h3>Cast</h3><p class="muted">${esc(info.cast)}</p>`);
      if (info.director) extra.push(`<p class="muted"><b>Director</b> ${esc(info.director)}</p>`);
      $('.detail-extra', m).insertAdjacentHTML('afterbegin', extra.join(''));
      return { trailer: (t && t.trailer) || info.youtube_trailer || '', backdrop: bg || '' };
    },

    // Every copy of this title: language, resolution, tags, file format and category. onPick(version).
    async renderVersions(m, item, onPick) {
      const versions = item.versions || [item];
      const cats = await this.loadCats(item.kind).catch(() => []);
      const extra = $('.detail-extra', m);
      if (!extra) return;
      const catName = Object.fromEntries(cats.map(c => [String(c.category_id), c.category_name]));
      const box = document.createElement('section');
      box.className = 'versions-box';
      box.innerHTML = `<h3>${versions.length > 1 ? `Versions <span class="muted">${versions.length}</span>` : 'Version'}</h3>
        <div class="versions">${versions.map(v => {
          const saved = item.kind === 'movie' && this.cwGet('movie:' + v.id);
          const chips = [v.quality, ...v.tags, item.kind === 'movie' && v.ext ? v.ext.toUpperCase() : ''].filter(Boolean);
          const state = v === item && item.kind === 'series' ? 'Showing' : saved ? `Resume · ${fmtDur(saved.dur - saved.pos)} left` : '';
          return `<button class="ver${v === item ? ' current' : ''}" data-vid="${esc(v.id)}">
            <span class="ver-lang"><b>${esc(v.lang || '—')}</b><span>${esc(langName(v.lang))}</span></span>
            <span class="ver-tags">${chips.map(c => `<span class="chip">${esc(c)}</span>`).join('')}</span>
            <span class="ver-cat">${esc(catName[v.cat] || '')}</span>
            <span class="ver-go">${state ? `<small>${esc(state)}</small>` : ''}${ICONS.play}</span>
          </button>`;
        }).join('')}</div>`;
      box.addEventListener('click', e => {
        const b = e.target.closest('.ver');
        const v = b && versions.find(x => String(x.id) === b.dataset.vid);
        if (v) onPick(v);
      });
      extra.prepend(box);
    },

    // "☆ My List" toggle on a details page; refreshes the poster star wherever the card is shown.
    myListBtn(m, item) {
      const b = document.createElement('button');
      b.className = 'btn ghost fav-btn';
      const paint = () => { b.innerHTML = this.isFav(item.kind, item.gkey) ? '<span>★ In My List</span>' : '<span>☆ My List</span>'; };
      paint();
      b.addEventListener('click', () => {
        this.toggleFav(item.kind, item.gkey, item.name);
        paint();
        $$(`.card[data-kind="${item.kind}"][data-id="${item.id}"]`).forEach(c => { c.outerHTML = this.card(item); });
      });
      $('.detail-actions', m).appendChild(b);
    },

    trailerBtn(m, key) {
      if (!key) return;
      const b = document.createElement('button');
      b.className = 'btn ghost';
      b.innerHTML = `${ICONS.trailer}<span>Trailer</span>`;
      b.addEventListener('click', () => {
        const layer = document.createElement('div');
        layer.className = 'trailer';
        layer.innerHTML = `${this.closeBtn()}<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(key)}?autoplay=1&rel=0" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe>`;
        $('.sheet', m).appendChild(layer);
        const c = $('[data-close]', layer);
        c.addEventListener('click', ev => { ev.stopPropagation(); layer.remove(); b.focus(); });
        c.focus();
      });
      $('.detail-actions', m).appendChild(b);
    },

    async openMovie(item, autoplay = false) {
      const m = this.openModal(this.detailShell(item), 'detail');
      $('.detail-actions', m).innerHTML = '<div class="loader small"><span></span></div>';
      $('[data-close]', m).focus();
      const [info, t] = await Promise.all([
        this.api.vodInfo(item.id).catch(() => ({})),
        TMDB.details('movie', item.tmdb),
      ]);
      if (!m.contains($('.detail-actions', m))) return;
      const i = (info && info.info) || {};
      const md = (info && info.movie_data) || {};
      if (!t && i.tmdb_id) Object.assign(item, { tmdb: i.tmdb_id });
      const t2 = t || (i.tmdb_id ? await TMDB.details('movie', i.tmdb_id) : null);
      const extra = this.fillDetail(m, item, t2, i);

      const entry = {
        key: 'movie:' + item.id, kind: 'movie', id: item.id, ext: md.container_extension || item.ext,
        title: (t2 && t2.title) || item.name, subtitle: [item.year, item.lang].filter(Boolean).join(' · ') || 'Movie',
        img: (t2 && t2.poster) || item.img, backdrop: extra.backdrop, lang: item.lang || '',
        ...this.altVersions(item),
      };
      const actions = $('.detail-actions', m);
      // Drawn again when the player closes, so it offers Resume at the new position.
      const paint = () => {
        const saved = this.cwGet(entry.key);
        actions.innerHTML = saved
          ? `<button class="btn primary" data-a="resume">${ICONS.play}<span>Resume · ${fmtDur(saved.dur - saved.pos)} left</span></button>
             <button class="btn ghost" data-a="start">${ICONS.restart}<span>From start</span></button>`
          : `<button class="btn primary" data-a="start">${ICONS.play}<span>Play</span></button>`;
        this.trailerBtn(m, extra.trailer);
        this.myListBtn(m, item);
      };
      paint();
      this.detailRefresh = () => { paint(); $('.btn.primary', actions).focus(); };
      actions.addEventListener('click', e => {
        const a = e.target.closest('[data-a]');
        if (!a) return;
        const saved = this.cwGet(entry.key);
        this.playEntry({ ...entry, pos: saved ? saved.pos : 0 }, a.dataset.a === 'resume');
      });
      this.renderVersions(m, item, v => {
        const key = 'movie:' + v.id;
        const prev = this.cwGet(key);
        this.playEntry({
          ...entry, key, id: v.id, ext: v === item ? entry.ext : v.ext,
          subtitle: [v.year || item.year, langName(v.lang), v.quality].filter(Boolean).join(' · '),
          pos: prev ? prev.pos : 0,
        }, true);
      });
      const primary = $('.btn.primary', actions);
      primary.focus();
      if (autoplay) primary.click();
    },

    async openSeries(item) {
      const m = this.openModal(this.detailShell(item), 'detail');
      $('.detail-actions', m).innerHTML = '<div class="loader small"><span></span></div>';
      $('[data-close]', m).focus();
      const [data, t] = await Promise.all([
        this.api.seriesInfo(item.id).catch(() => null),
        TMDB.details('tv', item.tmdb),
      ]);
      if (!m.contains($('.detail-actions', m))) return;
      const info = (data && data.info) || {};
      const extra = this.fillDetail(m, item, t, info);
      const eps = (data && data.episodes) || {};
      const seasons = Object.keys(eps).sort((a, b) => Number(a) - Number(b));
      const title = (t && t.title) || item.name;
      const actions = $('.detail-actions', m);
      if (!seasons.length) {
        // No answer at all (connection lost) is not the same as a series without episodes.
        actions.innerHTML = data ? '<p class="muted">No episodes available yet.</p>'
          : `<p class="muted">Couldn’t load the episodes. Check your connection.</p><button class="btn primary" data-a="retry"><span>Try again</span></button>`;
        const retry = $('[data-a="retry"]', actions);
        if (retry) { retry.addEventListener('click', () => this.openSeries(item)); retry.focus(); }
        this.trailerBtn(m, extra.trailer);
        this.myListBtn(m, item);
        this.renderVersions(m, item, v => { if (v !== item) this.openSeries(v); });
        return;
      }

      // Provider titles look like "DE - Show (2026) [1080p] - S01E01 - Real title"; keep only the real title.
      const epName = t => {
        const s = String(t || '');
        const m = s.match(/S\d+\s*E\d+\s*(?:[-–:]\s*(.*))?$/i);
        return (m ? m[1] || '' : s).trim();
      };
      const flat = seasons.flatMap(s => asArray(eps[s]).map(e => ({ ...e, season: s, title: epName(e.title) })));
      const alts = this.episodeAlts(item); // started now: ready by the time Play is pressed
      let altOf = () => [];
      alts.then(f => { altOf = f; });
      const epEntry = ep => ({
        key: 'episode:' + ep.id, kind: 'episode', id: ep.id, ext: ep.container_extension || 'mp4', title,
        subtitle: `S${ep.season} · E${ep.episode_num}${ep.title ? ' — ' + ep.title : ''}`,
        img: item.img, backdrop: (ep.info && ep.info.movie_image) || extra.backdrop, seriesId: item.id,
        label: this.versionLabel(item), alts: altOf(ep), lang: item.lang || '',
      });
      const playEp = (ep, resume) => {
        const entry = epEntry(ep);
        const saved = this.cwGet(entry.key);
        const next = flat[flat.indexOf(ep) + 1];
        entry.pos = saved ? saved.pos : 0;
        entry.onEnded = next ? () => { this.cwRemove(entry.key); playEp(next, false); } : null;
        // The Android player plays the following episodes itself, one after another.
        this.playEntry(entry, resume, flat.slice(flat.indexOf(ep) + 1).map(epEntry));
      };

      // Resume the most recently watched episode, otherwise start at the beginning. Drawn again
      // when the player closes.
      const paint = () => {
        const last = this.cw().find(e => e.seriesId == item.id);
        const resumeEp = last && flat.find(e => String(e.id) === String(last.id));
        const startEp = resumeEp || flat[0];
        actions.innerHTML = `<button class="btn primary" data-a="play">${ICONS.play}<span>${resumeEp ? 'Resume ' + epEntry(resumeEp).subtitle.split(' — ')[0] : 'Play S' + startEp.season + ' · E' + startEp.episode_num}</span></button>`;
        $('[data-a="play"]', actions).addEventListener('click', () => playEp(startEp, !!resumeEp));
        this.trailerBtn(m, extra.trailer);
        this.myListBtn(m, item);
      };
      paint();
      this.detailRefresh = () => { paint(); if (!m.querySelector('.episodes').contains(document.activeElement)) $('.btn.primary', actions).focus(); };

      const ex = $('.detail-extra', m);
      ex.insertAdjacentHTML('afterbegin', `
        <div class="seasons">${seasons.map((s, i) => `<button class="season${i === 0 ? ' active' : ''}" data-s="${esc(s)}">Season ${esc(s)}</button>`).join('')}</div>
        <div class="episodes" id="episodes"></div>`);
      const list = $('#episodes', m);
      const renderSeason = s => {
        const items = flat.filter(e => e.season === s);
        list.innerHTML = items.map(ep => {
          const saved = this.cwGet('episode:' + ep.id);
          const img = ep.info && ep.info.movie_image;
          const secs = ep.info && durSecs(ep.info);
          return `<button class="ep" data-id="${esc(ep.id)}">
            <span class="ep-img">${img ? `<img loading="lazy" src="${esc(img)}" alt="">` : ''}<span class="play">${ICONS.play}</span>
              ${saved ? `<span class="bar"><i style="width:${((saved.pos / saved.dur) * 100).toFixed(1)}%"></i></span>` : ''}</span>
            <span class="ep-text"><b>${esc(ep.episode_num)}. ${esc(ep.title || 'Episode ' + ep.episode_num)}</b>
              <small>${secs ? fmtDur(secs) : ''}</small>
              ${ep.info && ep.info.plot ? `<p>${esc(ep.info.plot)}</p>` : ''}</span>
          </button>`;
        }).join('');
      };
      $('.seasons', m).addEventListener('click', e => {
        const b = e.target.closest('.season');
        if (!b) return;
        $$('.season', m).forEach(x => x.classList.toggle('active', x === b));
        renderSeason(b.dataset.s);
      });
      list.addEventListener('click', e => {
        const b = e.target.closest('.ep');
        if (!b) return;
        const ep = flat.find(x => String(x.id) === b.dataset.id);
        playEp(ep, true);
      });
      this.renderVersions(m, item, v => { if (v !== item) this.openSeries(v); });
      // Open on the season of the episode to resume.
      const last = this.cw().find(e => e.seriesId == item.id);
      const resumeEp = last && flat.find(e => String(e.id) === String(last.id));
      const firstSeason = resumeEp ? resumeEp.season : seasons[0];
      $$('.season', m).forEach(x => x.classList.toggle('active', x.dataset.s === firstSeason));
      renderSeason(firstSeason);
      $('.btn.primary', actions).focus();
    },

    // ---------- search ----------
    // Personal and popularity signals for ranking (each a small nudge inside a relevance tier).
    searchBoost() {
      const fav = new Set([...this.favs('movie'), ...this.favs('series'), ...this.favs('live')]);
      const recent = new Set(this.recentLive());
      const watched = new Set(this.cw().flatMap(e => [e.title, e.seriesName, e.series].filter(Boolean).map(t => words(t))));
      return i => (fav.has(i.gkey) ? 40 : 0) + (recent.has(i.gkey) ? 30 : 0) + (watched.has(words(i.name)) ? 20 : 0)
        + Math.min(15, Number(i.rating) || 0) + (i.added ? Math.max(0, 10 - (Date.now() / 1000 - i.added) / 864000) : 0);
    },
    openSearch() {
      const m = this.openModal(`${this.closeBtn()}
        <div class="search-box"><input class="field big" id="q" type="search" placeholder="Search movies, series and channels" autocomplete="off"></div>
        <div id="results"><p class="muted center">Start typing to search.</p></div>`, 'search');
      const q = $('#q', m);
      q.focus();
      const res = $('#results', m);
      let byId = new Map();
      // Samsung TVs: every search redraws dozens of posters, too much to do on each letter typed
      // with the remote. Wait for a pause and 3 letters (or Enter / Done with 2), and show fewer.
      const samsung = document.documentElement.classList.contains('tizen');
      const limit = samsung ? 18 : 36;
      const search = async now => {
        const term = fold(q.value.trim());
        if (term.length < (samsung && !now ? 3 : 2)) { res.innerHTML = '<p class="muted center">Start typing to search.</p>'; return; }
        res.innerHTML = '<div class="loader small"><span></span></div>';
        const [vod, series, live, free, liveCat] = await Promise.all([this.loadVod(), this.loadSeries(), this.loadLive(), this.loadFree(), this.liveCatalog(), this.genreCats('movie'), this.genreCats('series')]);
        if (fold(q.value.trim()) !== term) return;
        // Typing a genre ("comedy", "comédie", "sport") offers that genre as a filter.
        const isGenre = g => term.length >= 3 && (fold(g.name).includes(term) || fold(this.genreName(g)).includes(term) || g.re.test(words(term)));
        const hits = GENRES.filter(isGenre);
        const genreBtn = (go, label, where) => `<button class="season" data-go-genre="${go}">${esc(label)} · ${esc(T(where))}</button>`;
        const inKind = (list, kind, label) => hits.filter(g => list.some(i => this.genresOf(i).includes(g.id))).map(g => genreBtn(kind + ':' + g.id, this.genreName(g), label));
        const genreBtns = [
          ...inKind(uniq(this.allowed(vod)), 'movie', 'Movies'), ...inKind(uniq(series), 'series', 'Series'),
          ...liveCat.genres.filter(isGenre).map(g => genreBtn('live:' + g.genre, g.name, 'Live TV')),
        ];
        // Ranked as typed (typos and sound-alikes allowed), then titles TMDB knows under the words
        // typed in any language ("Other Mommy" finds "Malfaisante"), added when TMDB answers.
        const raw = q.value.trim();
        const boost = this.searchBoost();
        const ranked = (list, nameOf) => rankSearch(searchIndex(list, nameOf), raw, boost);
        const pick = (hits, allow) => uniq(hits.map(h => h.item).filter(allow));
        const okFilm = new Set(this.allowed(vod)), okLive = new Set(this.allowed(live));
        let mvHits = ranked(vod, i => i.name), svHits = ranked(series, i => i.name);
        let lvHits = ranked(live, c => c.label || c.name), frHits = ranked(free, c => c.label || c.name);
        // A word may be left out only when nothing anywhere matches all of them.
        if ([mvHits, svHits, lvHits, frHits].some(l => l.some(h => h.full))) [mvHits, svHits, lvHits, frHits] = [mvHits, svHits, lvHits, frHits].map(l => l.filter(h => h.full));
        const lv = pick(lvHits, c => okLive.has(c)).concat(pick(frHits, () => true)).slice(0, samsung ? 12 : 24);
        // TMDB still being asked (other-language titles, actors): an empty page waits for it.
        let asking = raw.length >= 3 && !!CFG.tmdbKey;
        // people: [{ name, items }] — an actor's (or director's) films and series in the playlist.
        const render = (mvRank, svRank, people = []) => {
        const mv = pick(mvRank, i => okFilm.has(i)).slice(0, limit), sv = pick(svRank, () => true).slice(0, limit);
        byId = new Map([...mv, ...sv, ...people.flatMap(p => p.items)].map(i => [i.kind + i.id, i]));
        // The person first when the search is their name and no title matches it as well.
        const strongTitle = [...mvRank, ...svRank].some(h => h.full && h.score >= toks(raw).length * 1000);
        const peopleHtml = people.map(p => `<h3>${esc(p.name)}</h3><div class="grid">${p.items.map(i => this.card(i)).join('')}</div>`).join('');
        res.innerHTML = (mv.length || sv.length || lv.length || genreBtns.length || people.length) ? [
          genreBtns.length && `<h3>Genres</h3><div class="seasons">${genreBtns.join('')}</div>`,
          !strongTitle && peopleHtml,
          lv.length && `<h3>Channels</h3><div class="ch-grid">${lv.map((c, i) => `<button class="ch" data-live="${i}"><span class="ch-logo">${c.stream_icon ? `<img loading="lazy" src="${esc(c.stream_icon)}" alt="">` : ''}</span><span class="ch-name">${esc(c.label)}</span><span class="ch-q">${(c.url ? (c.radio ? ['Radio'] : []) : [...new Set(c.versions.map(v => v.quality || 'SD'))]).map(t => `<span class="chip">${esc(t)}</span>`).join('')}</span></button>`).join('')}</div>`,
          mv.length && `<h3>Movies</h3><div class="grid">${mv.map(i => this.card(i)).join('')}</div>`,
          sv.length && `<h3>Series</h3><div class="grid">${sv.map(i => this.card(i)).join('')}</div>`,
          strongTitle && peopleHtml,
        ].filter(Boolean).join('') : asking ? `<div class="loader small"><span></span></div><p class="muted center">${esc(T('Looking for other titles and names…'))}</p>` : '<p class="muted center">No results.</p>';
        res.onclick = e => {
          const go = e.target.closest('[data-go-genre]');
          if (go) {
            const [kind, id] = go.dataset.goGenre.split(':');
            if (kind === 'live') this.liveCat = '@genre:' + id; else this.wantGenre = Number(id);
            const view = kind === 'live' ? 'live' : kind === 'movie' ? 'movies' : 'series';
            this.closeModal();
            if (this.view === view) this.route(); else location.hash = view;
            return;
          }
          const ch = e.target.closest('[data-live]');
          if (ch) this.playChannel(lv, Number(ch.dataset.live), { key: '@now:search', name: 'Search' });
        };
        if (samsung) $$('img', res).forEach(img => { img.decoding = 'async'; });
        };
        render(mvHits, svHits);
        // Other-language titles from TMDB: a title it finds joins the results as if every word
        // matched with one typo, so exact matches in the playlist's own names stay first.
        const settle = () => { if (asking && fold(q.value.trim()) === term) { asking = false; render(mvHits, svHits); } };
        if (asking) TMDB.search(raw).then(found => {
          if (fold(q.value.trim()) !== term) return;
          if (!found.length) return settle();
          const add = (hits, list, type) => {
            const have = new Set(hits.map(h => h.item));
            const nWords = Math.max(1, toks(raw).length);
            const extra = [];
            found.forEach((f, r) => {
              if (f.type !== type) return;
              for (const item of list) if (item.tmdb === f.id && !have.has(item)) { have.add(item); extra.push({ item, full: true, score: nWords * 1000 - 120 - r * 5 + boost(item) }); }
            });
            return extra.length ? [...hits, ...extra].sort((a, b) => b.score - a.score) : null;
          };
          const m2 = add(mvHits, vod, 'movie'), s2 = add(svHits, series, 'tv');
          if (m2 || s2) { const wasAsking = asking; asking = false; render(m2 || mvHits, s2 || svHits); asking = wasAsking; }
          // Actors and directors: their films and series in the playlist, best known first.
          // Actors and directors only (TMDB also lists companies and crew as people).
          const persons = found.filter(f => f.type === 'person' && /^(Acting|Directing)$/.test(f.job) && nameMatches(f.name, raw)).slice(0, 2);
          if (!persons.length) { asking = false; if (!m2 && !s2) settle(); return; }
          const byTmdb = new Map();
          for (const i of uniq(this.allowed(vod))) if (i.tmdb) byTmdb.set('movie:' + i.tmdb, i);
          for (const i of uniq(series)) if (i.tmdb) byTmdb.set('tv:' + i.tmdb, i);
          Promise.all(persons.map(p => TMDB.credits(p.id).then(cr => ({
            name: p.name + ' · ' + T(p.job === 'Directing' ? 'Director' : 'Actor'),
            items: [...new Set(cr.map(c => byTmdb.get(c.type + ':' + c.id)).filter(Boolean))].slice(0, limit),
          })))).then(people => {
            people = people.filter(p => p.items.length);
            if (fold(q.value.trim()) !== term) return;
            asking = false;
            render(m2 || mvHits, s2 || svHits, people);
          }, () => settle());
        }, () => settle());
      };
      const run = debounce(search, samsung ? 1000 : 250);
      q.addEventListener('input', () => run());
      if (samsung) q.addEventListener('keydown', e => { if (e.key === 'Enter' || e.keyCode === 65376) search(true); }); // 65376: the TV keyboard's Done
      this.bindCards(res, (k, id) => byId.get(k + id));
    },

    ago(t) {
      if (!t) return 'Not saved yet';
      const min = Math.round((Date.now() - t) / 60000);
      if (min < 1) return 'Just now';
      if (min < 60) return `${min} min ago`;
      const h = Math.round(min / 60);
      return h < 48 ? `${h} hour${h > 1 ? 's' : ''} ago` : new Date(t).toLocaleString(LOCALE, { dateStyle: 'medium', timeStyle: 'short' });
    },

    // ---------- app updates (InkonabTV+ sideload and the Windows app: CFG.updateUrl) ----------
    // The download site has inkonabtv.apk and version.json ({ versionCode, versionName, sha256,
    // notes }, written by scripts/release-plus.mjs); for Windows, windows.json with the
    // installer's address (scripts/release-windows.mjs). Checked once a day, or from Settings.
    updater() { return window.Native ? Native.player : window.Desktop && Desktop.updater; },

    // Subscription ending within a week: tell the viewer, at most once a day, when nothing is open.
    checkExpiry() {
      if (!this.api || !this.api.info) return;
      const end = Number((this.api.info.user_info || {}).exp_date) * 1000;
      const days = Math.ceil((end - Date.now()) / 864e5);
      if (!end || days < 0 || days > 7) return;
      const today = new Date().toDateString();
      if (Store.get('expNotice') === today) return;
      if (Player.busy() || !$('#modal').classList.contains('hidden')) { setTimeout(() => this.checkExpiry(), 60000); return; }
      Store.set('expNotice', today);
      const date = new Date(end).toLocaleDateString(LOCALE, { year: 'numeric', month: 'long', day: 'numeric' });
      const text = days === 0 ? 'Your subscription ends today.' : days === 1 ? `Your subscription ends tomorrow, on ${date}.` : `Your subscription ends in ${days} days, on ${date}.`;
      const m = this.openModal(`${this.closeBtn()}
        <h2 class="sheet-title">Your subscription ends soon</h2>
        <p>${esc(text)}</p>
        <p class="muted">Contact your provider to renew it and keep watching.</p>
        <div class="set-actions"><button class="btn primary" id="expOk">OK</button></div>`, 'settings upd');
      $('#expOk', m).addEventListener('click', () => this.closeModal());
      $('#expOk', m).focus();
    },

    async checkUpdate(manual) {
      const P = this.updater();
      if (!CFG.updateUrl || !P || !P.appVersion || this.updating) return;
      const me = await P.appVersion().catch(() => null);
      if (!me || !me.updater) return;
      if (!manual && Date.now() - (Store.get('updChecked') || 0) < 864e5) return;
      const base = CFG.updateUrl.replace(/\/?$/, '/');
      let v;
      try {
        const r = await P.updateInfo({ url: base + (me.info || 'version.json') + '?t=' + Date.now() });
        if (!r.ok) throw new Error(r.text);
        v = JSON.parse(r.text);
      } catch {
        if (manual) this.toast('Can’t reach the update site. Try again later.');
        return;
      }
      Store.set('updChecked', Date.now());
      if (!(Number(v.versionCode) > Number(me.code))) { if (manual) this.toast(`${me.product || 'InkonabTV+'} ${me.name} is the latest version`); return; }
      if (!manual && Store.get('updLater') === v.versionCode) return;
      if (!manual && (Player.isOpen() || !$('#modal').classList.contains('hidden'))) { Store.set('updChecked', 0); return; } // ask when nothing is open
      this.updateDialog(v, me, base);
    },

    updateDialog(v, me, base) {
      const P = this.updater(), product = me.product || 'InkonabTV+';
      const m = this.openModal(`${this.closeBtn()}
        <h2 class="sheet-title">${esc(product)} ${esc(v.versionName || '')} is available</h2>
        <p class="muted">You have ${esc(me.name)}.</p>
        ${v.notes ? `<ul class="upd-notes">${String(v.notes).split(/\n|·/).map(n => n.trim()).filter(Boolean).map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
        <p class="upd-status muted" id="updStatus"></p>
        <div class="set-actions" id="updActions"><button class="btn ghost" id="updLater">Later</button><button class="btn primary" id="updNow">Update now</button></div>`, 'settings upd');
      const status = $('#updStatus', m), actions = $('#updActions', m);
      $('#updLater', m).addEventListener('click', () => { Store.set('updLater', v.versionCode); this.closeModal(); });
      // InkonabTV+ on Android: the way to update by hand if the installer doesn't go through.
      const help = () => {
        const old = $('.upd-help', m);
        if (old) old.remove();
        if (CFG.downloaderCode && window.Native) status.insertAdjacentHTML('afterend', `<p class="muted upd-help">${esc(T(`If the update doesn’t install, open the Downloader app and enter code ${CFG.downloaderCode}.`))}</p>`);
      };
      const start = async () => {
        const now = await P.appVersion().catch(() => me);
        if (!now.canInstall) {
          status.textContent = 'First allow InkonabTV+ to install updates: on the next screen turn on the switch for InkonabTV+, then press Back.';
          actions.innerHTML = '<button class="btn primary" id="updAllow">Open settings</button>';
          $('#updAllow', m).addEventListener('click', () => {
            P.updateSettings();
            // The switch turned on (Android TV shows it as a side panel, so watch for it rather
            // than for the app coming back): carry on with the download.
            clearInterval(this.updWatch);
            const until = Date.now() + 5 * 60e3;
            this.updWatch = setInterval(async () => {
              const open = m.isConnected && !m.classList.contains('hidden') && $('#updAllow', m);
              if (!open || Date.now() > until) return clearInterval(this.updWatch);
              const v2 = await P.appVersion().catch(() => null);
              if (v2 && v2.canInstall) { clearInterval(this.updWatch); start(); }
            }, 1500);
          });
          $('#updAllow', m).focus();
          return;
        }
        this.updating = true;
        actions.innerHTML = '<div class="upd-bar"><i id="updFill"></i></div>';
        status.textContent = 'Downloading…';
        const h = await P.addListener('update', e => {
          const pct = e.total > 0 ? Math.round(e.done / e.total * 100) : 0;
          $('#updFill', m) && ($('#updFill', m).style.width = pct + '%');
          status.textContent = `Downloading… ${pct}% (${(e.done / 1048576).toFixed(1)} MB)`;
        });
        const r = await P.updateDownload({ url: v.url || base + 'inkonabtv.apk', sha256: v.sha256 || '' }).catch(e => ({ ok: false, detail: e.message }));
        h && h.remove && h.remove();
        this.updating = false;
        if (r.ok) {
          status.textContent = me.installNote || 'Downloaded. Choose Install on the next screen — your sign-in and playlist are kept.';
          actions.innerHTML = `<button class="btn primary" id="updInstall">${esc(me.installLabel || 'Install')}</button>`;
          help();
          $('#updInstall', m).addEventListener('click', () => P.updateInstall());
          $('#updInstall', m).focus();
        } else {
          status.textContent = 'The update couldn’t be installed: ' + (r.detail || 'download failed') + '.';
          help();
          actions.innerHTML = '<button class="btn ghost" id="updClose">Close</button><button class="btn primary" id="updRetry">Try again</button>';
          $('#updClose', m).addEventListener('click', () => this.closeModal());
          $('#updRetry', m).addEventListener('click', start);
          $('#updRetry', m).focus();
        }
      };
      $('#updNow', m).addEventListener('click', start);
      $('#updNow', m).focus();
    },

    // ---------- free VPN (Android and Windows apps) ----------
    bindVpnSettings(m) {
      const P = this.vpnApi();
      const paint = v => {
        const el = $('#vpnState', m);
        if (!el) return;
        const label = { connected: `Connected · ${v.server || ''}${v.speed ? ' · ' + (v.speed / 1000).toFixed(1) + ' Mbps' : ''}`, connecting: v.detail || 'Connecting…', failed: v.detail || 'Failed', disconnected: 'Off' }[v.state] || v.state;
        el.textContent = label;
        el.className = v.state === 'connected' ? 'ok' : v.state === 'failed' ? 'bad' : '';
        $('#vpnGood', m).textContent = v.remembered ? v.remembered + (v.need ? ' · used for provider channels' : '') : 'None yet — found automatically when a channel needs it';
        $('#vpnMode', m).value = v.mode;
        $('#vpnCountry', m).value = v.country || '';
      };
      P.vpnStatus().then(paint).catch(() => {});
      if (!this.vpnListener) this.vpnListener = P.addListener('vpn', v => { if ($('#vpnState')) paint(v); });
      $('#vpnMode', m).addEventListener('change', e => P.vpnSettings({ mode: e.target.value }).then(v => {
        paint(v);
        if (v.mode === 'always' && v.state !== 'connected') P.vpnConnect().then(paint).catch(err => this.toast(err.message || 'VPN not allowed'));
      }));
      $('#vpnCountry', m).addEventListener('change', e => P.vpnSettings({ country: e.target.value }).then(paint));
      $('#vpnConnect', m).addEventListener('click', () => {
        this.toast('Connecting to a free VPN server…');
        P.vpnConnect().then(v => { paint(v); this.toast(v.ok ? 'VPN connected · ' + v.server : 'No free server answered'); })
          .catch(err => this.toast(err.message || 'VPN not allowed'));
      });
      $('#vpnOff', m).addEventListener('click', () => P.vpnDisconnect().then(paint));
      $('#vpnForget', m).addEventListener('click', () => P.vpnSettings({ forget: true }).then(v => { paint(v); this.toast('Forgot the remembered VPN server'); }));
    },

    // ---------- settings ----------
    openSettings() {
      const ui = (this.api && this.api.info && this.api.info.user_info) || {};
      const exp = Number(ui.exp_date) ? new Date(Number(ui.exp_date) * 1000).toLocaleDateString(LOCALE, { year: 'numeric', month: 'long', day: 'numeric' }) : 'Never';
      const langs = [['en-US', 'English'], ['fr-FR', 'Français'], ['es-ES', 'Español'], ['de-DE', 'Deutsch'], ['it-IT', 'Italiano'], ['pt-PT', 'Português'], ['nl-NL', 'Nederlands'], ['ar-SA', 'العربية'], ['tr-TR', 'Türkçe']];
      if (!langs.some(l => l[0] === Settings.tmdbLang)) langs.unshift([Settings.tmdbLang, Settings.tmdbLang]);
      // Login details stay out of the page until the access code is entered.
      const secrets = { playlist: this.api.url, server: this.api.server, user: this.api.username, m3u: this.api.m3uUrl(), epg: this.api.epgUrl() };
      const dots = '••••••••';
      const m = this.openModal(`${this.closeBtn()}
        <h2 class="sheet-title">Settings</h2>
        <section class="set-group">
          <h3>Account</h3>
          ${this.api.isM3U ? `<div class="kv link"><span>Playlist</span><code data-secret="playlist">${dots}</code></div>` : `
          ${CFG.playerMode ? `<div class="kv link"><span>Server</span><code data-secret="server">${dots}</code></div>` : ''}
          <div class="kv"><span>Username</span><b data-secret="user">${dots}</b></div>
          <div class="kv"><span>Status</span><b class="ok">${esc(ui.status || 'Active')}</b></div>
          <div class="kv"><span>Expires</span><b>${esc(exp)}</b></div>
          <div class="kv"><span>Connections</span><b>${esc(ui.active_cons ?? '–')} / ${esc(ui.max_connections ?? '–')}</b></div>`}
          <p class="muted small-note" id="codeNote"${Settings.accountPin ? ' hidden' : ''}>Your login details are hidden. The code is 1234 until you change it, so change it to keep them private.</p>
          <div class="set-row vpn-actions"><button class="btn ghost" id="showLogin">Show login details</button><button class="btn ghost" id="changeCode">Change code</button></div>
        </section>
        <section class="set-group">
          <h3>Playback</h3>
          <label class="set"${window.Native || window.TizenTV ? ' hidden' : ''}><span>HTTPS relay URL<small>Needed to play video when this site is opened over HTTPS. See README.</small></span>
            <span class="set-row"><input class="field" id="setRelay" type="url" placeholder="https://inkonab-relay.you.workers.dev" value="${esc(Settings.relay)}"><button class="btn ghost" id="testRelay">Test</button></span></label>
          <label class="set"><span>Live stream format<small>HLS works best in browsers; try MPEG-TS if a channel won’t start.</small></span>
            <select class="field" id="setFormat"><option value="m3u8">HLS (.m3u8)</option><option value="ts">MPEG-TS (.ts)</option></select></label>
          <label class="set"><span>Info language<small>Language for summaries and titles from TMDB.</small></span>
            <select class="field" id="setLang">${langs.map(([v, n]) => `<option value="${v}">${esc(n)}</option>`).join('')}</select></label>
          <label class="set"${this.api.isM3U ? ' hidden' : ''}><span>Catch-up time correction<small>If replays start at the wrong time, shift them here.</small></span>
            <select class="field" id="setShift">${[-2, -1, 0, 1, 2].map(h => `<option value="${h}">${h === 0 ? 'None (server time)' : (h > 0 ? '+' : '−') + Math.abs(h) + ' hour' + (Math.abs(h) > 1 ? 's' : '')}</option>`).join('')}</select></label>
          ${window.Native && Native.player.autostart && !CFG.hotel && CFG.autostart !== false ? `<label class="set toggle" id="autoStartRow" hidden><span>Open InkonabTV when the TV turns on<small>Starts on the channel you watched last.</small></span><input type="checkbox" id="setAutoStart"></label>` : ''}
          ${this.homeRowsAvail() ? `<label class="set toggle"><span>Show on the TV's home screen<small>Live channels, movies and series to resume and the newest ones, as rows on the TV's home screen. One click opens them.</small></span><input type="checkbox" id="setHomeRows"></label>` : ''}
          <label class="set"><span>TV guide link (XMLTV)<small>Optional: a guide of your own (.xml or .xml.gz) for channels whose guide is missing or wrong. Channels are matched by name.</small></span>
            <span class="set-row"><input class="field" id="setEpg" type="url" inputmode="url" placeholder="https://…/guide.xml.gz" autocapitalize="none" spellcheck="false" value="${esc(Settings.epgUrl || '')}"><button class="btn ghost" id="testEpg">Check</button></span></label>
          <div class="kv" id="epgState"${Settings.epgUrl ? '' : ' hidden'}><span>Guide link</span><b>…</b></div>
          <label class="set toggle"><span>Show adult categories<small>Protected by your parental PIN. Hidden again each time the app starts.</small></span><input type="checkbox" id="setAdult"></label>
          <div class="kv"><span>Parental PIN</span><b id="pinState">${Settings.adultPin ? 'Set' : 'Not set'}</b></div>
          ${Settings.adultPin ? '<div class="set-row vpn-actions"><button class="btn ghost" id="pinChange">Change PIN</button></div>' : ''}
        </section>
        ${(window.Native || window.Desktop && /^(win32|darwin)$/.test(Desktop.platform)) && CFG.vpn !== false ? `<section class="set-group" id="vpnGroup">
          <h3>Free VPN</h3>
          <label class="set"><span>When to use it<small>Only InkonabTV's traffic goes through it — the rest of the device is untouched.</small></span>
            <select class="field" id="vpnMode"><option value="auto">Automatic — when a channel won’t play</option><option value="always">Always on</option><option value="off">Off</option></select></label>
          <label class="set"><span>Preferred server country<small>Free VPN Gate servers are mostly in Japan and Korea.</small></span>
            <select class="field" id="vpnCountry"><option value="">Best available</option><option value="JP">Japan</option><option value="KR">South Korea</option><option value="US">United States</option><option value="TH">Thailand</option><option value="VN">Vietnam</option><option value="RU">Russia</option></select></label>
          <div class="kv"><span>Status</span><b id="vpnState">…</b></div>
          <div class="kv"><span>Remembered server</span><b id="vpnGood">—</b></div>
          <div class="set-row vpn-actions"><button class="btn ghost" id="vpnConnect">Connect now</button><button class="btn ghost" id="vpnOff">Disconnect</button><button class="btn ghost" id="vpnForget">Forget server</button></div>
          <p class="muted small-note">Servers come from the VPN Gate academic project and are run by volunteers: they can be slow, and their operators could see unencrypted traffic. Use it to unblock channels, not for privacy.</p>
        </section>` : ''}
        ${this.langPickerOn() ? `<section class="set-group">
          <h3>Playlist languages</h3>
          <div class="kv"><span>Shown</span><b id="langState">${esc(((Store.get(this.langKey(this.api)) || []).map(c => c ? playlistLang(c) : 'Other').join(', ')) || 'All languages')}</b></div>
          <p class="muted small-note">Only the chosen languages are downloaded and shown. New categories in them are added when the playlist updates.</p>
          <div class="set-row vpn-actions"><button class="btn ghost" id="langChange">Change languages</button></div>
        </section>` : ''}
        <section class="set-group">
          <h3>Playlist on this device</h3>
          <div class="kv"><span>Last updated</span><b id="plUpdated">${esc(this.ago(this.api.savedAt()))}</b></div>
          <p class="muted small-note">Movies, series and channels are saved on this device so the app opens instantly. They refresh by themselves in the background every 6 hours.</p>
          <div class="set-row vpn-actions"><button class="btn ghost" id="plRefresh">Refresh now</button></div>
        </section>
        ${(window.Native || window.Desktop) && CFG.updateUrl ? `<section class="set-group" id="updGroup" hidden>
          <h3>App updates</h3>
          <div class="kv"><span>This version</span><b id="updVersion">…</b></div>
          <p class="muted small-note">The app checks for a new version once a day.</p>
          <div class="set-row vpn-actions"><button class="btn ghost" id="updCheck">Check for updates</button></div>
        </section>` : ''}
        <section class="set-group" id="xpGroup">
          <h3>Extra playlists</h3>
          ${(CFG.freePlaylists || []).length ? `<label class="set toggle"><span>Show ${esc(CFG.freePlaylists.map(p => p.name).join(' and '))}<small>Free TV and radio channels built into the app, on top of Live TV and on Home.</small></span><input type="checkbox" id="setBuiltin"></label>` : ''}
          <p class="muted small-note">Add M3U playlists of your own, for example free TV channels. Each one shows as a group on top of Live TV and as a row on Home.</p>
          <div id="xpList"></div>
          <label class="set"><span>Name</span><input class="field" id="xpName" maxlength="40" placeholder="My channels" autocapitalize="none" spellcheck="false"></label>
          <label class="set"><span>Playlist link (M3U)</span><input class="field" id="xpUrl" type="url" inputmode="url" placeholder="https://example.com/playlist.m3u" autocapitalize="none" spellcheck="false"></label>
          <p class="login-error" id="xpError" role="alert"></p>
          <div class="set-row vpn-actions"><button class="btn ghost" id="xpAdd">Add playlist</button>${CFG.pairApi ? '<button class="btn ghost" id="xpPhone">Add from phone</button>' : ''}</div>
          <div class="pair" id="xpPair" hidden>
            <img class="pair-qr" alt="">
            <div class="pair-text"><p>On your phone or computer, open</p><b class="pair-url"></b><p>choose “Extra playlist” and enter this code:</p>
              <div class="pair-code">…</div><p class="muted pair-note"></p></div>
          </div>
        </section>
        <section class="set-group" id="recGroup" hidden>
          <h3>Recordings</h3>
          <p class="muted small-note">Record live channels on a USB drive or memory stick: press OK on a channel and choose ⏺ Record, or pick a programme still to come in the TV Guide.</p>
          <div class="set-row vpn-actions"><button class="btn ghost" id="recOpen">Recordings</button></div>
        </section>
        ${document.documentElement.classList.contains('tizen') ? '' : `<section class="set-group">
          <h3>Backup and restore</h3>
          <p class="muted small-note">${window.Native ? 'Keeps your favorites, groups, lists and settings on a USB drive (or this device) to bring back after a reinstall or on another TV box.' : 'Keeps your favorites, groups, lists and settings in a file, to bring back later or on another device.'} Your sign-in details are not included.</p>
          <div class="set-row vpn-actions"><button class="btn ghost" id="bkSave">Save a backup</button><button class="btn ghost" id="bkRestore">Restore a backup</button><button class="btn ghost" id="orgLive">✎ Organise lists</button></div>
        </section>`}
        <section class="set-group">
          <h3>Help</h3>
          <p class="muted small-note">See how to get around the app, with the remote or by touch.</p>
          <div class="set-row vpn-actions"><button class="btn ghost" id="tourAgain">Show the tour</button></div>
          ${CFG.tmdbKey ? '<p class="muted small-note">Posters, summaries, cast and search in other languages: this product uses the TMDB API but is not endorsed or certified by TMDB.</p>' : ''}
        </section>
        <section class="set-group">
          <h3>Playlist links</h3>
          <div class="kv link"><span>M3U</span><code data-secret="m3u">${dots}</code><button class="round-btn sm" data-copy="m3u" aria-label="Copy M3U link" hidden>${ICONS.copy}</button></div>
          ${secrets.epg ? `<div class="kv link"><span>EPG</span><code data-secret="epg">${dots}</code><button class="round-btn sm" data-copy="epg" aria-label="Copy EPG link" hidden>${ICONS.copy}</button></div>` : ''}
          ${CFG.privacyUrl ? `<div class="kv link"><span>Privacy policy</span><code>${esc(CFG.privacyUrl.replace(/^https?:\/\//, ''))}</code></div>` : ''}
        </section>
        <div class="set-actions">
          <button class="btn ghost" id="clearCw">Clear Continue Watching</button>
          <button class="btn danger" id="logout">Sign out</button>
        </div>`, 'settings');

      $('#setFormat', m).value = Settings.liveFormat;
      $('#setLang', m).value = Settings.tmdbLang;
      $('#setAdult', m).checked = Settings.showAdult;
      $('#setShift', m).value = String(Settings.catchupShift || 0);
      $('#setShift', m).addEventListener('change', e => save('catchupShift', Number(e.target.value)));
      const save = (k, v) => { Settings[k] = v; Settings.save(); };
      $('#setRelay', m).addEventListener('change', e => save('relay', e.target.value.trim()));
      $('#setFormat', m).addEventListener('change', e => save('liveFormat', e.target.value));
      const resetPicks = () => { delete this.data.moviePicks; delete this.data.seriesPicks; delete this.data.liveCatalog; };
      $('#setLang', m).addEventListener('change', e => { save('tmdbLang', e.target.value); TMDB.cache.clear(); resetPicks(); this.redrawLater = true; });
      $('#setAdult', m).addEventListener('change', async e => {
        const box = e.target, on = box.checked;
        // Turning adult categories on needs the parental PIN (created the first time).
        if (on) {
          box.checked = false;
          if (!(await this.askPin(Settings.adultPin ? 'check' : 'create'))) return;
          box.checked = true;
          $('#pinState', m).textContent = 'Set';
        }
        Settings.showAdult = on;
        resetPicks();
        this.route();
      });
      const autoBox = $('#setAutoStart', m);
      if (autoBox) {
        Native.player.autostart({}).then(r => {
          if (!r.available) return;
          $('#autoStartRow', m).hidden = false;
          autoBox.checked = r.on && r.allowed;
        }).catch(() => {});
        autoBox.addEventListener('change', async e => {
          const on = e.target.checked;
          const r = await Native.player.autostart({ on }).catch(() => null);
          if (!r || !on) return;
          if (r.allowed) return this.toast('InkonabTV will open when the TV turns on');
          // Android asks for "Display over other apps" before an app may open itself at start.
          const p = await Native.player.autostartPermission().catch(() => ({ opened: false }));
          if (p.opened) {
            this.toast('Allow "Display over other apps" for InkonabTV, then come back');
            // Back from Android's page (it covers only part of the screen, so the page never
            // hides): keep the switch on only if it was allowed.
            const App_ = Native.app;
            let done = false;
            const back = () => {
              if (done) return;
              done = true;
              Native.player.autostart({}).then(x => { autoBox.checked = x.on && x.allowed; if (!x.allowed) Native.player.autostart({ on: false }); });
            };
            if (App_ && App_.addListener) App_.addListener('resume', back).then(h => { const off = () => h.remove(); setTimeout(off, 10 * 60e3); });
            window.addEventListener('focus', back, { once: true });
          } else {
            autoBox.checked = false;
            Native.player.autostart({ on: false });
            this.toast('This TV doesn’t let apps open by themselves when it starts');
          }
        });
      }
      // Own guide link: saved as typed; Check reads it and says how many channels it covers.
      const epgIn = $('#setEpg', m), epgState = $('#epgState', m);
      const checkEpg = async () => {
        if (!Settings.epgUrl) { epgState.hidden = true; return; }
        epgState.hidden = false;
        $('b', epgState).textContent = T('Reading the guide…');
        const x = await OwnGuide.load(this.api).catch(e => ({ error: e }));
        if (!epgState.isConnected) return;
        $('b', epgState).textContent = x && !x.error ? `${x.byStream.size} ${T('channels covered')}` : T('Couldn’t read this link');
      };
      epgIn.addEventListener('change', () => {
        Settings.epgUrl = epgIn.value.trim();
        Settings.save();
        this.api.ownP = null;
        this.epgCache = null;
        this.data.guideCache = null;
        checkEpg();
      });
      $('#testEpg', m).addEventListener('click', () => { Settings.epgUrl = epgIn.value.trim(); Settings.save(); this.api.ownP = null; this.epgCache = null; checkEpg(); });
      if (Settings.epgUrl && this.api.ownReady) $('b', epgState).textContent = `${this.api.ownReady.byStream.size} ${T('channels covered')}`;
      else if (Settings.epgUrl) checkEpg();
      if (window.Native && Native.player.recordings) Native.player.recordings().then(r => {
        if (!r || !r.available || !m.isConnected) return;
        const g = $('#recGroup', m);
        if (g) { g.hidden = false; $('#recOpen', g).addEventListener('click', () => this.openRecordings()); }
      }).catch(() => {});
      const bk = $('#bkSave', m);
      if (bk) {
        bk.addEventListener('click', () => this.saveBackup());
        $('#bkRestore', m).addEventListener('click', () => this.restoreBackup());
        $('#orgLive', m).addEventListener('click', () => this.openOrganise('live'));
      }
      const homeBox = $('#setHomeRows', m);
      if (homeBox) {
        homeBox.checked = !Settings.noHomeRows;
        homeBox.addEventListener('change', e => {
          this.setHomeRows(e.target.checked);
          this.toast(e.target.checked ? 'Shown on the TV home screen' : 'Removed from the TV home screen');
        });
      }
      const builtinBox = $('#setBuiltin', m);
      if (builtinBox) {
        builtinBox.checked = !Settings.hideBuiltin;
        builtinBox.addEventListener('change', e => { save('hideBuiltin', !e.target.checked); this.extraChanged(); });
      }
      $('#showLogin', m).addEventListener('click', async () => {
        if (!(await this.askPin('check', true))) return;
        $$('[data-secret]', m).forEach(e => { e.textContent = secrets[e.dataset.secret]; });
        $$('[data-copy]', m).forEach(b => { b.hidden = false; });
        $('#showLogin', m).hidden = true;
        $('#changeCode', m).focus();
      });
      $('#changeCode', m).addEventListener('click', async () => {
        if (await this.askPin('change', true) && await this.askPin('create', true)) $('#codeNote', m).hidden = true;
      });
      const pinChange = $('#pinChange', m);
      if (pinChange) pinChange.addEventListener('click', async () => { if (await this.askPin('change')) await this.askPin('create'); });
      $('#testRelay', m).addEventListener('click', async () => {
        save('relay', $('#setRelay', m).value.trim());
        if (!Settings.relay) return this.toast('Enter a relay URL first');
        try {
          const r = await fetch(relayUrl(this.api.apiUrl ? this.api.apiUrl({}) : this.api.url));
          const d = await r.json();
          this.toast(d && d.user_info ? 'Relay works ✓' : 'Relay answered, but not with your account');
        } catch { this.toast('Relay not reachable'); }
      });
      $$('[data-copy]', m).forEach(b => b.addEventListener('click', () => { if (b.hidden) return; navigator.clipboard && navigator.clipboard.writeText(secrets[b.dataset.copy]); this.toast('Copied'); }));
      $('#clearCw', m).addEventListener('click', () => { Store.set('cw', []); this.toast('Cleared'); this.renderContinue(); });
      $('#logout', m).addEventListener('click', () => this.logout());
      $('#tourAgain', m).addEventListener('click', () => this.showTour());
      $('#plRefresh', m).addEventListener('click', async e => {
        const b = e.currentTarget;
        b.disabled = true; b.textContent = 'Updating…';
        const changed = await this.api.refreshAll();
        b.disabled = false; b.textContent = 'Refresh now';
        $('#plUpdated', m).textContent = this.ago(this.api.savedAt());
        if (this.api.refreshFailed) this.toast('Couldn’t reach the server — keeping the saved playlist');
        else if (!changed) this.toast('Your playlist is up to date');
        else if (this.view !== 'home') this.route();
      });
      const langChange = $('#langChange', m);
      if (langChange) langChange.addEventListener('click', async () => {
        const before = JSON.stringify(Store.get(this.langKey(this.api)) || []);
        const codes = await this.pickLangs(false);
        if (JSON.stringify(codes) !== before) await this.applyLangs(codes);
      });
      this.bindExtraPlaylists(m);
      if ($('#vpnGroup', m)) this.bindVpnSettings(m);
      if ($('#updGroup', m)) this.updater().appVersion().then(v => {
        if (!v.updater) return;
        $('#updGroup', m).hidden = false;
        $('#updVersion', m).textContent = `${v.product || 'InkonabTV+'} ${v.name}`;
        $('#updCheck', m).addEventListener('click', () => this.checkUpdate(true));
      }).catch(() => {});
      $('[data-close]', m).focus();
    },
  };

  window.App = App;
  App.trackLang = trackLang;
  App.rankSearch = (list, term, nameOf = i => i.name) => rankSearch(searchIndex(list, nameOf), term).map(h => h.item); // for tests
  document.addEventListener('DOMContentLoaded', () => App.boot());

  // Windows and Mac apps: the VPN badge in the top bar, as on Android (native.js).
  if (window.Desktop && /^(win32|darwin)$/.test(Desktop.platform) && CFG.vpn !== false) document.addEventListener('DOMContentLoaded', () => {
    const pill = $('#vpnPill');
    if (!pill) return;
    const paint = v => {
      if (!v || !v.available) return pill.classList.add('hidden');
      const country = (v.server || '').split(' · ')[0];
      pill.className = 'vpn-pill ' + v.state;
      pill.innerHTML = v.state === 'connected' ? `<i></i>VPN · ${esc(country)}` : v.state === 'connecting' ? '<i></i>VPN connecting…' : '<i></i>VPN off';
      pill.title = v.state === 'connected' ? 'Connected to ' + v.server : v.detail || '';
      if (v.mode === 'off' && v.state !== 'connected') pill.classList.add('hidden');
    };
    Desktop.vpn.vpnStatus().then(paint).catch(() => {});
    Desktop.vpn.addListener('vpn', paint);
    pill.addEventListener('click', () => App.openSettings());
  });
})();
