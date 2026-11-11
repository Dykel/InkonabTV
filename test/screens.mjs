// Layout check: the real app against a fake provider at phone, tablet, foldable, car and TV sizes.
//   npm run screens            (OUT=folder for the screenshots; default: a temp folder)
// For each size it opens every main screen and fails if anything is wider than the screen
// (sideways scroll) or a button is cut off. Screenshots are saved to look at by eye.
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = process.env.OUT || join(tmpdir(), 'inkonab-screens');
mkdirSync(OUT, { recursive: true });
const USER = 'tester', PASS = 'secret';
const only = process.argv.slice(2);

// Sizes in CSS pixels (= Android dp in the WebView).
const SIZES = [
  { name: 'phone-small', width: 320, height: 640, touch: true },
  { name: 'phone', width: 393, height: 852, touch: true },
  { name: 'phone-land', width: 852, height: 393, touch: true },
  { name: 'phone-land-small', width: 640, height: 360, touch: true },
  { name: 'fold', width: 673, height: 841, touch: true },
  { name: 'tablet7', width: 600, height: 960, touch: true },
  { name: 'tablet7-land', width: 960, height: 600, touch: true },
  { name: 'tablet10', width: 800, height: 1280, touch: true },
  { name: 'tablet10-land', width: 1280, height: 800, touch: true },
  { name: 'car-wide', width: 1280, height: 480, touch: true },
  { name: 'car', width: 1024, height: 768, touch: true },
  { name: 'laptop', width: 1280, height: 720, touch: false },
  { name: 'tv', width: 960, height: 540, touch: false },
].filter(s => !only.length || only.includes(s.name));

// ---------- fake provider (same data shape as test/smoke.mjs) ----------
const b64 = s => Buffer.from(s).toString('base64');
const now = () => Math.floor(Date.now() / 1000);
const live = Array.from({ length: 30 }, (_, i) => ({
  num: i + 1, name: (i < 15 ? 'FR: Sport ' : 'EN: News Channel International ') + (i + 1) + ' HD', stream_type: 'live', stream_id: 100 + i,
  stream_icon: '', epg_channel_id: 'ch' + i, category_id: i < 15 ? '1' : '2', tv_archive: 1, tv_archive_duration: 3,
}));
const vod = Array.from({ length: 40 }, (_, i) => ({
  num: i + 1, name: 'FR: Film number ' + (i + 1) + ' with a rather long title (2021)', stream_type: 'movie', stream_id: 500 + i, stream_icon: '',
  rating: '7.2', added: String(now() - i * 3600), category_id: '10', container_extension: 'mp4',
}));
const series = Array.from({ length: 12 }, (_, i) => ({
  num: i + 1, name: 'FR: Series ' + (i + 1), series_id: 900 + i, cover: '', rating: '7', category_id: '20', last_modified: String(now()),
  plot: 'A family moves to a small town where nothing is what it seems.',
}));
const guide = () => {
  const t = now() - (now() % 3600);
  return { epg_listings: [-3, -2, -1, 0, 1, 2, 3].map(h => ({
    title: b64('Programme ' + (h < 0 ? 'before ' + -h : h === 0 ? 'now' : 'later ' + h)),
    description: b64('What happens in this programme, in a sentence or two.'), start_timestamp: String(t + h * 3600), stop_timestamp: String(t + (h + 1) * 3600),
    start: '', has_archive: h < 0 ? 1 : 0,
  })) };
};
const seriesInfo = id => ({
  info: { name: 'FR: Series ' + (id - 899), plot: 'A family moves to a small town where nothing is what it seems.', genre: 'Drama', rating: '7' },
  episodes: { 1: Array.from({ length: 8 }, (_, i) => ({ id: String(id * 100 + i), episode_num: i + 1, title: 'Episode ' + (i + 1), container_extension: 'mp4', info: { duration_secs: 2700, plot: 'Episode summary.' } })),
    2: Array.from({ length: 6 }, (_, i) => ({ id: String(id * 100 + 50 + i), episode_num: i + 1, title: 'Episode ' + (i + 1), container_extension: 'mp4', info: {} })) },
});
const api = (q, port) => {
  if (q.get('username') !== USER || q.get('password') !== PASS) return { user_info: { auth: 0 } };
  switch (q.get('action')) {
    case null: return { user_info: { username: USER, password: PASS, auth: 1, status: 'Active', exp_date: String(now() + 864e4), max_connections: '1' },
      server_info: { url: 'localhost', port: String(port), server_protocol: 'http', timezone: 'Europe/Paris' } };
    case 'get_live_categories': return [{ category_id: '1', category_name: 'FR: SPORT' }, { category_id: '2', category_name: 'EN: NEWS' }];
    case 'get_live_streams': return q.get('category_id') ? live.filter(c => c.category_id === q.get('category_id')) : live;
    case 'get_vod_categories': return [{ category_id: '10', category_name: 'FR: FILMS' }];
    case 'get_vod_streams': return q.get('category_id') ? vod.filter(c => c.category_id === q.get('category_id')) : vod;
    case 'get_vod_info': return { info: { name: 'Film', plot: 'A long plot summary that goes on for a few lines so the layout has text to wrap around the poster.', genre: 'Drama', duration: '01:45:00', rating: '7.2' }, movie_data: { stream_id: q.get('vod_id'), container_extension: 'mp4' } };
    case 'get_series_categories': return [{ category_id: '20', category_name: 'FR: SERIES' }];
    case 'get_series': return q.get('category_id') ? series.filter(c => c.category_id === q.get('category_id')) : series;
    case 'get_series_info': return seriesInfo(Number(q.get('series_id')));
    case 'get_simple_data_table': case 'get_short_epg': return guide();
    default: return {};
  }
};
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const port = server.address().port;
  if (url.pathname === '/player_api.php') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify(api(url.searchParams, port)));
  }
  if (url.pathname === '/config.js') {
    res.writeHead(200, { 'Content-Type': 'text/javascript' });
    return res.end(readFileSync(join(root, 'config.js'), 'utf8') +
      `\nObject.assign(window.INKONAB_CONFIG, { server: 'http://localhost:${port}', freePlaylists: [], tmdbKey: '', pairApi: '', relay: '' });\n`);
  }
  const file = join(root, normalize(url.pathname === '/' ? '/index.html' : url.pathname));
  if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(readFileSync(file));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://localhost:${server.address().port}/`;

const wait = ms => new Promise(r => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'] });

// Anything sticking out sideways, and buttons cut off by the screen edge.
const measure = page => page.evaluate(() => {
  const W = innerWidth, H = innerHeight, out = [];
  const doc = document.scrollingElement;
  if (doc.scrollWidth > W + 1) out.push(`page scrolls sideways (${doc.scrollWidth} > ${W})`);
  const visible = el => { const s = getComputedStyle(el); return s.display !== 'none' && s.visibility !== 'hidden' && el.offsetParent !== null; };
  const scrollsX = el => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if ((o === 'auto' || o === 'scroll') && p.scrollWidth > p.clientWidth) return true; } return false; };
  const top = [...document.querySelectorAll('#modal:not(.hidden), #player:not(.hidden)')].pop();
  const scope = top || document;
  for (const el of scope.querySelectorAll('button, a, input, select, .btn, .tab, .chip')) {
    if (!visible(el) || scrollsX(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.bottom < 0 || r.top > H) continue;
    if (r.right > W + 1 || r.left < -1) out.push(`cut off: ${(el.id ? '#' + el.id : el.className || el.tagName).toString().slice(0, 40)} "${(el.textContent || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 25)}" x ${Math.round(r.left)}–${Math.round(r.right)} of ${W}`);
  }
  // Text that overflows its own box without being clipped on purpose.
  for (const el of scope.querySelectorAll('h1, h2, h3, .sheet-title, .hero-title, p')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > W + 1 && !scrollsX(el)) out.push(`text past the edge: ${el.tagName}.${el.className} "${el.textContent.trim().slice(0, 25)}"`);
  }
  return [...new Set(out)];
});

let failures = 0;
for (const size of SIZES) {
  const page = await browser.newPage();
  await page.setViewport({ width: size.width, height: size.height, isMobile: size.touch, hasTouch: size.touch, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const shot = async (label, action) => {
    try { await action(); } catch (e) { console.log(`  ${size.name} ${label}: couldn't open (${e.message.split('\n')[0]})`); return; }
    await wait(700);
    const issues = await measure(page);
    await page.screenshot({ path: join(OUT, `${size.name}-${label}.png`) });
    console.log(`  ${issues.length ? '✗' : '✓'} ${size.name} ${size.width}×${size.height} ${label}${issues.length ? '\n      ' + issues.join('\n      ') : ''}`);
    failures += issues.length;
  };
  const closeModal = () => page.evaluate(() => { if (!document.getElementById('modal').classList.contains('hidden')) App.closeModal(); });
  const view = v => async () => { await closeModal(); await page.evaluate(v => { location.hash = v; }, v); await wait(800); };

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  // First launch: the tour, each screen checked for overflow, then Skip to sign in.
  await page.waitForSelector('#tourNext', { visible: true });
  for (let i = 1; i <= 5; i++) await shot('tour-' + i, async () => { if (i > 1) await page.click('#tourNext'); });
  await page.click('#tourSkip');
  await page.waitForSelector('#loginUser', { visible: true });
  await shot('signin', async () => {});
  await page.evaluate((u, p) => {
    for (const [id, v] of [['loginUser', u], ['loginPass', p]]) { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }
    document.getElementById('loginBtn').click();
  }, USER, PASS);
  await page.waitForSelector('.lang-chip', { visible: true, timeout: 20000 });
  await shot('languages', async () => {});
  await page.click('#langAll');
  await page.waitForFunction(() => document.querySelectorAll('#view .card').length > 3, { timeout: 20000 });
  await shot('home', async () => {});
  await shot('live', view('live'));
  await shot('guide', view('guide'));
  await shot('movies', view('movies'));
  await shot('series', view('series'));
  await shot('movie', async () => { await view('movies')(); await page.evaluate(() => document.querySelector('#view .card').click()); await page.waitForSelector('#modal:not(.hidden)'); });
  await shot('show', async () => { await view('series')(); await page.evaluate(() => document.querySelector('#view .card').click()); await page.waitForSelector('#modal:not(.hidden)'); await wait(800); });
  await shot('search', async () => { await closeModal(); await page.evaluate(() => App.openSearch()); });
  await shot('settings', async () => { await closeModal(); await page.evaluate(() => App.openSettings()); });
  if (errors.length) { console.log(`  ✗ ${size.name} page errors: ${errors.join(' | ')}`); failures += errors.length; }
  await page.close();
}
await browser.close();
server.close();
console.log(`\nScreenshots: ${OUT}\n${failures ? failures + ' problem(s)' : 'No layout problems found'}`);
process.exit(failures ? 1 : 0);
