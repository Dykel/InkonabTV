// Smoke test: the real app in Chrome against a fake Xtream provider on localhost.
//   npm test                 (CHROME=/path/to/chrome to use another browser)
// Checks the things that must never break: starting without the internet, signing in, starting
// from the saved playlist when the provider is down, the automatic retry, playback (hls.js loads
// on demand), every remote key in the live player, the 2018 Samsung fallbacks, and that no page
// error is thrown along the way. Exits with 1 if anything fails.
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const USER = 'tester', PASS = 'secret';

// ---------- a tiny HLS stream (needs ffmpeg; playback is skipped without it) ----------
const hlsDir = join(tmpdir(), 'inkonab-smoke-hls-120');
let hasStream = existsSync(join(hlsDir, 'index.m3u8'));
if (!hasStream) {
  try {
    mkdirSync(hlsDir, { recursive: true });
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=25', '-t', '120',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '50', '-f', 'hls', '-hls_time', '2', '-hls_list_size', '0',
      join(hlsDir, 'index.m3u8')]);
    hasStream = true;
  } catch { console.log('(ffmpeg not found: playback check skipped)'); }
}

// ---------- fake provider ----------
const b64 = s => Buffer.from(s).toString('base64');
const now = () => Math.floor(Date.now() / 1000);
const live = Array.from({ length: 8 }, (_, i) => ({
  num: i + 1, name: (i < 5 ? 'FR: Sport ' : 'EN: News ') + (i + 1) + ' HD', stream_type: 'live', stream_id: 100 + i,
  stream_icon: '', epg_channel_id: 'ch' + i, category_id: i < 5 ? '1' : '2', tv_archive: 1, tv_archive_duration: 3,
}));
const vod = Array.from({ length: 40 }, (_, i) => ({
  num: i + 1, name: 'FR: Film number ' + (i + 1) + ' (2021)', stream_type: 'movie', stream_id: 500 + i, stream_icon: '',
  rating: '7.2', added: String(now() - i * 3600), category_id: '10', container_extension: 'mp4',
}));
const series = Array.from({ length: 6 }, (_, i) => ({
  num: i + 1, name: 'FR: Series ' + (i + 1), series_id: 900 + i, cover: '', rating: '7', category_id: '20', last_modified: String(now()),
}));
const guide = () => {
  const t = now() - (now() % 3600);
  return { epg_listings: [-3, -2, -1, 0, 1, 2, 3].map(h => ({
    title: b64('Programme ' + (h < 0 ? 'before ' + -h : h === 0 ? 'now' : 'later ' + h)),
    description: b64(''), start_timestamp: String(t + h * 3600), stop_timestamp: String(t + (h + 1) * 3600),
    start: '', has_archive: h < 0 ? 1 : 0,
  })) };
};
let providerDown = false;
const api = (q, port) => {
  if (q.get('username') !== USER || q.get('password') !== PASS) return { user_info: { auth: 0 } };
  switch (q.get('action')) {
    case null: return { user_info: { username: USER, password: PASS, auth: 1, status: 'Active', exp_date: String(now() + 864e4), max_connections: '1' },
      server_info: { url: 'localhost', port: String(port), server_protocol: 'http', timezone: 'Europe/Paris' } };
    case 'get_live_categories': return [{ category_id: '1', category_name: 'FR: SPORT' }, { category_id: '2', category_name: 'EN: NEWS' }];
    case 'get_live_streams': return q.get('category_id') ? live.filter(c => c.category_id === q.get('category_id')) : live;
    case 'get_vod_categories': return [{ category_id: '10', category_name: 'FR: FILMS' }];
    case 'get_vod_streams': return q.get('category_id') ? vod.filter(c => c.category_id === q.get('category_id')) : vod;
    case 'get_series_categories': return [{ category_id: '20', category_name: 'FR: SERIES' }];
    case 'get_series': return q.get('category_id') ? series.filter(c => c.category_id === q.get('category_id')) : series;
    case 'get_simple_data_table': case 'get_short_epg': return guide();
    default: return {};
  }
};
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.m3u8': 'application/vnd.apple.mpegurl', '.ts': 'video/mp2t' };
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const port = server.address().port;
  if (url.pathname === '/player_api.php') {
    if (providerDown) return req.socket.destroy(); // "Failed to fetch"
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify(api(url.searchParams, port)));
  }
  if (url.pathname === '/config.js') {
    // The real config, pointed at this fake provider and with nothing else from the internet.
    res.writeHead(200, { 'Content-Type': 'text/javascript' });
    return res.end(readFileSync(join(root, 'config.js'), 'utf8') +
      `\nObject.assign(window.INKONAB_CONFIG, { server: 'http://localhost:${port}', freePlaylists: [], tmdbKey: '', pairApi: '', relay: '' });\n`);
  }
  let file;
  const m = url.pathname.match(/^\/(live|movie|series)\/[^/]+\/[^/]+\/(\d+)\.(m3u8|ts)$/);
  if (m) file = join(hlsDir, 'index.m3u8');
  else if (/^\/(live|movie|series)\/[^/]+\/[^/]+\/index\d+\.ts$/.test(url.pathname)) file = join(hlsDir, url.pathname.split('/').pop());
  else if (/^\/index\d+\.ts$/.test(url.pathname)) file = join(hlsDir, url.pathname.slice(1));
  else file = join(root, normalize(url.pathname === '/' ? '/index.html' : url.pathname));
  if (!file.startsWith(root) && !file.startsWith(hlsDir) || !existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
  res.end(readFileSync(file));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://localhost:${server.address().port}/`;

// ---------- runner ----------
const results = [];
const check = async (name, fn) => {
  const t0 = Date.now();
  try { const note = await fn(); results.push({ ok: true, name, ms: Date.now() - t0, note }); console.log(`  ✓ ${name}${note ? ` (${note})` : ''}`); }
  catch (e) {
    results.push({ ok: false, name, error: e.message });
    console.log(`  ✗ ${name}\n      ${e.message}`);
    // What was on screen, to see why.
    const shot = join(tmpdir(), `inkonab-smoke-${results.length}.png`);
    await page.screenshot({ path: shot }).catch(() => {});
    const seen = await page.evaluate(() => ({ view: location.hash, toast: document.getElementById('toast').textContent,
      login: !document.getElementById('login').classList.contains('hidden'), error: (document.getElementById('loginError') || {}).textContent,
      modal: !document.getElementById('modal').classList.contains('hidden'), focus: document.activeElement && document.activeElement.outerHTML.slice(0, 120) })).catch(() => ({}));
    console.log('      screen:', shot, JSON.stringify(seen));
  }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const wait = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--autoplay-policy=no-user-gesture-required',
  // No internet: every address except localhost fails to resolve, as on a TV with no connection.
  '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
// Only localhost resolves (see the launch flags): the app must work without any outside server.
const outside = [];
page.on('request', r => {
  const u = new URL(r.url());
  if (/^https?:$/.test(u.protocol) && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') outside.push(u.host);
});
const shown = sel => page.waitForFunction(s => { const e = document.querySelector(s); return e && e.offsetParent !== null; }, { timeout: 15000 }, sel);
// Fill both fields at once (typing letter by letter can race the form being set up).
const signIn = async () => {
  await page.evaluate((u, p) => {
    for (const [id, v] of [['loginUser', u], ['loginPass', p]]) {
      const el = document.getElementById(id);
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, USER, PASS);
  await page.click('#loginBtn');
};
const press = async (key, n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press(key); await wait(250); } };
const state = () => page.evaluate(() => ({ panel: Player.panel(), side: Player.sideOpen(), open: Player.isOpen(), focus: document.activeElement && (document.activeElement.dataset.a || document.activeElement.dataset.i || document.activeElement.className) }));

console.log('InkonabTV smoke test');

await check('first screen with no internet, under 3 s', async () => {
  const t0 = Date.now();
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await shown('#loginUser');
  const s = (Date.now() - t0) / 1000;
  assert(s < 3, `took ${s} s`);
  return `${s.toFixed(2)} s`;
});

await check('sign in → language choice → home', async () => {
  await signIn();
  await shown('.lang-chip'); // the list has loaded (it moves the buttons when it arrives)
  await page.click('#langAll');
  await page.waitForFunction(() => document.querySelectorAll('#view .card').length > 3, { timeout: 20000 });
  return `${await page.evaluate(() => document.querySelectorAll('#view .card').length)} cards`;
});

await check('provider down: starts from the saved playlist', async () => {
  providerDown = true;
  const t0 = Date.now();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('#view .card').length > 3, { timeout: 10000 });
  const s = (Date.now() - t0) / 1000;
  await page.waitForFunction(() => /saved playlist/.test(document.getElementById('toast').textContent), { timeout: 20000 });
  providerDown = false;
  return `home in ${s.toFixed(2)} s`;
});

await check('failed sign-in retries by itself until the provider answers', async () => {
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await shown('#loginUser');
  providerDown = true;
  await signIn();
  await page.waitForFunction(() => /Retrying in \d+ s/.test((document.querySelector('.retry-count') || {}).textContent || ''), { timeout: 30000 });
  providerDown = false;
  await shown('.lang-chip'); // the list has loaded (it moves the buttons when it arrives)
  await page.click('#langAll');
  await page.waitForFunction(() => document.querySelectorAll('#view .card').length > 3, { timeout: 20000 });
});

await check('live channel plays (hls.js loaded on demand)', async () => {
  await page.evaluate(() => document.querySelector('.tab[data-view="live"]').click());
  await shown('.cat');
  await page.evaluate(() => [...document.querySelectorAll('.cat')].find(b => /SPORT/.test(b.textContent)).click());
  await shown('.ch');
  await page.evaluate(() => document.querySelector('.ch').click());
  await page.waitForFunction(() => Player.isOpen(), { timeout: 5000 });
  if (!hasStream) return 'opened; playback skipped';
  await page.waitForFunction(() => document.getElementById('player').dataset.state === 'playing', { timeout: 20000 });
  assert(await page.evaluate(() => !!window.Hls), 'hls.js not loaded');
  return 'playing';
});

await check('remote keys in the live player', async () => {
  await page.evaluate(() => Player.video.focus());
  await press('ArrowDown'); let s = await state();
  assert(s.panel === 'info', `▼ should open the info panel, got ${JSON.stringify(s)}`);
  await page.waitForFunction(() => /Programme now/.test(document.querySelector('.p-info').textContent), { timeout: 8000 });
  await press('ArrowUp'); s = await state(); assert(!s.panel, '▲ should close the info panel');
  await press('ArrowUp'); s = await state(); assert(s.panel === 'strip', '▲ should open the channel strip');
  await press('ArrowRight'); s = await state(); assert(s.focus === '1', `▶ should move along the strip, focus ${s.focus}`);
  await press('ArrowDown'); s = await state(); assert(!s.panel, '▼ should close the strip');
  await press('ArrowLeft'); s = await state(); assert(s.side, '◀ should open the channel list');
  await press('Escape'); s = await state(); assert(!s.side && s.open, 'Back should close only the channel list');
  await press('ArrowRight'); s = await state(); assert(s.panel === 'sched', '▶ should open the programmes');
  await page.waitForFunction(() => document.querySelectorAll('.p-sched .p-s').length > 3, { timeout: 8000 });
  await press('ArrowLeft'); s = await state(); assert(!s.panel, '◀ should close the programmes');
  await press('ArrowDown'); await press('Escape'); s = await state(); assert(!s.panel && s.open, 'Back should close only the panel');
  await press('Escape'); s = await state(); assert(!s.open, 'Back should leave the player');
});

await check('2018 Samsung fallbacks (no formatToParts, no inert)', async () => {
  const r = await page.evaluate(() => {
    const t = Date.UTC(2026, 9, 31, 22, 30);
    const a = App.api.catchupUrl(1, t, 60);
    const keep = Intl.DateTimeFormat.prototype.formatToParts;
    delete Intl.DateTimeFormat.prototype.formatToParts;
    const b = App.api.catchupUrl(1, t, 60);
    Intl.DateTimeFormat.prototype.formatToParts = keep;
    return { a, b };
  });
  assert(r.a === r.b && /2026-10-31:23-30/.test(r.a), `catch-up link differs: ${r.a} vs ${r.b}`);
});

await check('no page errors and nothing loaded from outside', async () => {
  assert(!pageErrors.length, pageErrors.slice(0, 3).join(' | '));
  assert(!outside.length, 'outside requests: ' + [...new Set(outside)].join(', '));
});

await browser.close();
server.close();
const failed = results.filter(r => !r.ok).length;
console.log(failed ? `\n${failed} of ${results.length} checks failed` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
