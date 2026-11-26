/**
 * Smooth live TV ("YouTube-style" adaptive HLS) for the relay server. Nothing changes in the apps.
 *
 * When a viewer asks the relay for a live channel as HLS (…/relay/?url=…/live/<user>/<pass>/<id>.m3u8),
 * the relay answers with its own HLS stream in four qualities instead of the provider's single one:
 *   0  the provider's picture as it is (copied, costs no CPU)
 *   1  480p ~1 Mb/s   2  270p ~0.4 Mb/s   3  144p ~0.17 Mb/s   (re-encoded by ffmpeg)
 * The viewer's player (hls.js, ExoPlayer, Samsung AVPlay) moves between them by itself as the
 * connection gets faster or slower, so a slow line gets a softer picture instead of freezes.
 *
 * One channel = one pull from the provider + one ffmpeg, shared by every viewer of that channel.
 * Each viewer must have a working login of their own (checked once with the provider, then
 * remembered 10 minutes): nobody watches without an account. The pull uses one watcher's login at
 * a time; when that viewer leaves, the pull moves to another viewer's login, so no account keeps
 * streaming for others after its owner stopped watching. A channel stops 15 s after its last viewer.
 *
 * When smooth TV can't help (server busy: SMOOTH_MAX channels at once, default one per CPU core;
 * ffmpeg missing; the channel failed in ffmpeg a moment ago; a .ts request; films and series) the
 * relay goes on exactly as before.
 *
 * Settings (environment): SMOOTH_MAX (0 = off), SMOOTH_HOSTS (providers, comma-separated),
 * CACHE_DIRECTORY / SMOOTH_DIR (segment folder), FFMPEG, SMOOTH_SRC_PORT (internal, 127.0.0.1 only).
 * Logins never appear in logs, file names or ffmpeg's command line (ffmpeg reads the provider
 * stream through a private address on 127.0.0.1 that only this process knows).
 */
import http from 'node:http';
import os from 'node:os';
import { spawn, spawnSync, execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, rm, readFile, stat, readdir } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';

const HOSTS = (process.env.SMOOTH_HOSTS || 'inkonabtv.ottb.xyz').split(',').map(s => s.trim()).filter(Boolean);
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const FFPROBE = process.env.FFPROBE || FFMPEG.replace(/ffmpeg$/, 'ffprobe');
const HAVE_FFMPEG = spawnSync(FFMPEG, ['-version'], { stdio: 'ignore' }).status === 0;
const MAX = Number(process.env.SMOOTH_MAX ?? (os.availableParallelism?.() || os.cpus().length || 1));
const DIR = (process.env.CACHE_DIRECTORY || process.env.SMOOTH_DIR || os.tmpdir() + '/inkonab-smooth').split(':')[0];
const SRC_PORT = Number(process.env.SMOOTH_SRC_PORT || 8081);
const UA = 'Mozilla/5.0 (InkonabTV Web)';
const SEG = 4;               // seconds per piece
const IDLE_MS = 15000;       // a viewer whose player asked nothing for this long has left
const FIRST_WAIT_MS = 6000;  // how long a playlist request waits for the first pieces
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Length' };
// The copied picture first is what Samsung's player starts with; hls.js and ExoPlayer pick by speed.
const RUNGS = [
  { name: '1', h: 480, w: 854, kbps: 900, max: 1000, buf: 1800, akbps: 96, preset: 'superfast' },
  { name: '0', copy: true, akbps: 128 },
  { name: '2', h: 270, w: 480, kbps: 320, max: 360, buf: 640, akbps: 64, preset: 'ultrafast' },
  // Very slow lines (~250 kb/s, like YouTube's 144p): softer picture, but it keeps going.
  { name: '3', h: 144, w: 256, kbps: 110, max: 130, buf: 260, akbps: 48, preset: 'ultrafast' },
];

const sessions = new Map();  // channel key -> session
const byId = new Map();      // session id -> session
const sources = new Map();   // private source token -> session
const viewers = new Map();   // viewer token -> { s, login, seen }
const logins = new Map();    // login hash -> { ok, at }
const bad = new Map();       // channel key -> until (ffmpeg failed on it: plain relay for a while)

const hash = (...p) => createHash('sha256').update(p.join('\n')).digest('hex').slice(0, 16);
const token = () => randomBytes(16).toString('hex');
const log = (...a) => console.log('smooth', ...a);
export const smoothOn = () => HAVE_FFMPEG && MAX > 0;

// A live channel asked as HLS on one of the providers: …/live/<user>/<pass>/<id>.m3u8
function parse(target) {
  let u;
  try { u = new URL(target); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || !HOSTS.includes(u.hostname)) return null;
  const m = u.pathname.match(/^\/live\/([^/]+)\/([^/]+)\/(\d+)\.m3u8$/i);
  if (!m) return null;
  return {
    origin: u.origin, user: decodeURIComponent(m[1]), pass: decodeURIComponent(m[2]), id: m[3],
    src: `${u.origin}/live/${m[1]}/${m[2]}/${m[3]}.ts`,
    who: hash(u.origin, decodeURIComponent(m[1])),
  };
}

// Is this a working account on that provider? (player_api answers user_info.auth = 1)
async function loginOk(L) {
  const k = hash(L.origin, L.user, L.pass);
  const c = logins.get(k);
  if (c && Date.now() - c.at < (c.ok ? 10 : 1) * 60e3) return c.ok;
  let ok = false;
  try {
    const q = `${L.origin}/player_api.php?username=${encodeURIComponent(L.user)}&password=${encodeURIComponent(L.pass)}`;
    const r = await fetch(q, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) });
    const j = await r.json();
    ok = Number(j?.user_info?.auth) === 1 && !/expired|banned|disabled/i.test(j?.user_info?.status || '');
  } catch {}
  logins.set(k, { ok, at: Date.now() });
  return ok;
}

// ffmpeg reads the provider through here, so the login stays out of its command line.
http.createServer(async (req, res) => {
  const s = sources.get((req.url || '').split('/').pop());
  const owner = s && viewers.get(s.owner);
  if (!s || !owner) { res.writeHead(404); return res.end(); }
  const ctl = new AbortController();
  let gone = false;
  res.on('close', () => { gone = true; ctl.abort(); });
  // A provider connection that ends is fetched again at once and ffmpeg keeps reading one unbroken
  // stream (restarting ffmpeg costs a full core for seconds and stalls the viewers). Only whole
  // 188-byte MPEG-TS packets are passed on, so a cut never leaves half a packet.
  // But accounts allow one stream: a cut usually means the same account just started watching on
  // another device (the provider drops the older connection). Taking the stream back would make
  // that device freeze over and over, so after a cut the pull moves to another viewer's login, and
  // with nobody else, a second cut within 3 minutes stops the channel (the other device wins).
  let rest = Buffer.alloc(0), quick = 0;
  for (let n = 0; !gone && !s.closed; n++) {
    const t0 = Date.now();
    try {
      const who = viewers.get(s.owner) || owner;
      const up = await fetch(who.login.src, { headers: { 'User-Agent': UA }, signal: ctl.signal });
      s.srcStatus = up.status;
      if (!up.ok || !up.body) {
        await up.body?.cancel().catch(() => {});
        if (!res.headersSent) { res.writeHead(up.status === 200 ? 502 : up.status); return res.end(); }
        break;
      }
      if (!res.headersSent) res.writeHead(200, { 'Content-Type': 'video/mp2t' });
      else s.reconnects = (s.reconnects || 0) + 1;
      rest = Buffer.alloc(0);
      let synced = false;
      for await (const chunk of up.body) {
        if (gone) break;
        s.bytes += chunk.length;
        let b = rest.length ? Buffer.concat([rest, chunk]) : Buffer.from(chunk);
        if (!synced) { // start each connection on a packet start (sync byte 0x47)
          const i = b.indexOf(0x47);
          if (i < 0) { rest = Buffer.alloc(0); continue; }
          b = b.subarray(i); synced = true;
        }
        const whole = b.length - (b.length % 188);
        rest = b.subarray(whole);
        if (whole && !res.write(b.subarray(0, whole))) await new Promise(r => res.once('drain', r));
      }
    } catch { if (gone) break; }
    if (gone || s.closed) break;
    s.cuts = (s.cuts || []).filter(t => Date.now() - t < 3 * 60e3).concat(Date.now());
    if (viewersOf(s).length > 1) nextOwner(s, true);
    else if (s.cuts.length >= 2) { stop(s, 'account in use on another device'); break; }
    // Given up when the provider keeps refusing (several drops within a few seconds each).
    quick = Date.now() - t0 < 5000 ? quick + 1 : 0;
    if (quick >= 4) break;
    await new Promise(r => setTimeout(r, 1000));
  }
  if (!res.headersSent) res.writeHead(502);
  res.end();
}).listen(SRC_PORT, '127.0.0.1').on('error', e => log('source port', e.code));

function startFfmpeg(s) {
  const append = s.gen > 0; // a restart goes on in the same playlists (marked as a break)
  const enc = RUNGS.filter(r => !r.copy);
  // Measured on the 1-core relay with real 1080p 50 fps football: ~75 % of the core, first piece
  // after ~6 s. The smaller qualities keep every other frame (~25 fps) plus every keyframe:
  // keyframes are where all qualities are cut, so none may be dropped (a plain fps=25 dropped
  // them and made 30-second pieces). One scale from 1080p to 480p, the others from 480p.
  const [big, ...small] = enc;
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-fflags', '+genpts+discardcorrupt',
    '-skip_loop_filter', 'all', // the decoded picture only feeds the smaller qualities
    '-i', `http://127.0.0.1:${SRC_PORT}/src/${s.src}`,
    '-filter_complex', `[0:v:0]select='eq(pict_type\\,I)+not(mod(n\\,2))',scale=-2:'min(${big.h},ih)':flags=fast_bilinear,format=yuv420p,` +
      `split=${enc.length}[o0]${small.map((_, i) => `[t${i}]`).join('')};` +
      small.map((r, i) => `[t${i}]scale=-2:'min(${r.h},ih)':flags=fast_bilinear[o${i + 1}]`).join(';')];
  let e = 0;
  RUNGS.forEach(r => args.push('-map', r.copy ? '0:v:0' : `[o${e++}]`, '-map', '0:a:0'));
  e = 0;
  RUNGS.forEach((r, i) => {
    if (r.copy) args.push(`-c:v:${i}`, 'copy');
    // Keyframes exactly where the copied picture has them (and nowhere else): every quality is
    // cut at the same moments, so switching between them never jumps.
    else args.push(`-c:v:${i}`, 'libx264', `-b:v:${i}`, r.kbps + 'k', `-maxrate:v:${i}`, r.max + 'k', `-bufsize:v:${i}`, r.buf + 'k',
      // zerolatency + one thread: no look-ahead and no thread overhead on the 1-core server
      // (real football sample: 67 % → 58 % of the core with all qualities on ultrafast).
      `-preset:v:${i}`, r.preset, `-tune:v:${i}`, 'zerolatency', `-threads:v:${i}`, '1', `-profile:v:${i}`, 'main', `-g:v:${i}`, '600', `-x264-params:v:${i}`, 'scenecut=0:open-gop=0',
      `-force_key_frames:v:${i}`, 'source', `-fps_mode:v:${i}`, 'passthrough');
  });
  RUNGS.forEach((r, i) => args.push(`-b:a:${i}`, r.akbps + 'k'));
  args.push('-c:a', 'aac', '-ac', '2',
    '-f', 'hls', '-hls_time', String(SEG), '-hls_list_size', '20', '-hls_delete_threshold', '4',
    '-hls_flags', 'delete_segments+independent_segments+temp_file+omit_endlist' + (append ? '+append_list+discont_start' : ''),
    '-hls_segment_filename', `${s.dir}/%v/s%d.ts`,
    '-var_stream_map', RUNGS.map((r, i) => `v:${i},a:${i},name:${r.name}`).join(' '),
    `${s.dir}/%v/index.m3u8`);
  const p = s.proc = spawn(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let err = '';
  p.stderr.on('data', d => { err = (err + d).slice(-400); });
  const t0 = Date.now();
  p.on('exit', code => {
    if (s.proc !== p) return; // replaced on purpose
    s.proc = null;
    if (s.closed) return;
    const early = Date.now() - t0 < 20000;
    s.fails = s.fails.filter(t => Date.now() - t < 60e3).concat(early ? [Date.now()] : []);
    log('ffmpeg ended', s.id, 'code', code, 'source', s.srcStatus || '-', early ? 'early' : '', err.replace(/https?:\/\/\S+/g, '<url>').trim().split('\n').pop() || '');
    // Again with the next viewer's login when the stream broke (provider cut, login refused);
    // given up after repeated quick failures: the channel goes back to the plain relay.
    if (s.fails.length >= 3) {
      bad.set(s.key, Date.now() + 2 * 60e3);
      return stop(s, 'failing');
    }
    if (early && s.srcStatus && s.srcStatus !== 200) nextOwner(s, true);
    if (!s.closed) { s.gen++; startFfmpeg(s); }
  });
}

// The original picture's size and codec, read from its first piece: players (hls.js) leave out a
// quality whose playlist line doesn't say it is video. Guessed when it takes too long.
const GUESS = { w: 1920, h: 1080, codecs: 'avc1.640028,mp4a.40.2' };
async function probe(s) {
  for (const t0 = Date.now(); Date.now() - t0 < FIRST_WAIT_MS && !s.closed; await new Promise(r => setTimeout(r, 250))) {
    const text = await readFile(`${s.dir}/0/index.m3u8`, 'utf8').catch(() => '');
    const seg = (text.match(/^s\d+\.ts$/m) || [])[0];
    if (!seg) continue;
    const out = await new Promise(r => execFile(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,profile,level,width,height',
      '-of', 'json', `${s.dir}/0/${seg}`], { timeout: 4000 }, (e, so) => r(e ? '' : so)));
    try {
      const v = JSON.parse(out).streams[0];
      const hex = n => Number(n).toString(16).padStart(2, '0');
      const prof = { Baseline: '42', 'Constrained Baseline': '42', Main: '4d', High: '64' }[v.profile] || '64';
      const vc = v.codec_name === 'h264' ? `avc1.${prof}00${hex(v.level > 0 ? v.level : 40)}`
        : v.codec_name === 'hevc' ? `hvc1.1.6.L${v.level > 0 ? v.level : 120}.90` : '';
      // Its bit rate from the piece's size (pieces of a live channel vary: 30 % margin).
      const dur = Number((text.match(/#EXTINF:([\d.]+)/) || [])[1]) || SEG;
      const bw = Math.round((await stat(`${s.dir}/0/${seg}`)).size * 8 / dur * 1.3);
      if (v.width && v.height) return { w: v.width, h: v.height, codecs: vc ? vc + ',mp4a.40.2' : '', bw };
    } catch {}
    break;
  }
  return GUESS;
}

// Registered at once (two quick requests for a channel share one start), its folders made after.
function start(key) {
  const s = { id: token(), key, src: token(), dir: `${DIR}/${token()}`, owner: null, proc: null, gen: 0,
    bytes: 0, t0: Date.now(), fails: [], ready: false, closed: false, info: null, infoVal: null };
  sessions.set(key, s); byId.set(s.id, s); sources.set(s.src, s);
  s.made = Promise.all(RUNGS.map(r => mkdir(`${s.dir}/${r.name}`, { recursive: true })));
  log('channel start', s.id, 'channels', sessions.size + '/' + MAX);
  return s;
}

function stop(s, why) {
  if (s.closed) return;
  s.closed = true;
  if (s.proc) { const p = s.proc; s.proc = null; p.kill('SIGKILL'); }
  sessions.delete(s.key); byId.delete(s.id); sources.delete(s.src);
  for (const [vt, v] of viewers) if (v.s === s) viewers.delete(vt);
  rm(s.dir, { recursive: true, force: true }).catch(() => {});
  log('channel stop', s.id, why, Math.round((Date.now() - s.t0) / 1000) + 's', 'provider reconnects', s.reconnects || 0);
}

const viewersOf = s => [...viewers].filter(([, v]) => v.s === s);

// The pull moves to a viewer still watching. `refused`: the owner's login didn't work.
function nextOwner(s, refused = false) {
  const left = viewersOf(s).filter(([vt]) => !(refused && vt === s.owner));
  if (!left.length) return stop(s, 'no viewers');
  const was = s.owner;
  s.owner = left.find(([vt]) => vt !== was)?.[0] || left[0][0];
  if (s.owner !== was) log('pull moves to another viewer', s.id);
  return s.owner !== was;
}

// Every 3 s: viewers who left are dropped, the pull follows them, empty channels stop.
setInterval(() => {
  const now = Date.now();
  for (const [vt, v] of viewers) if (now - v.seen > IDLE_MS) viewers.delete(vt);
  for (const s of [...sessions.values()]) {
    if (!viewersOf(s).length) { stop(s, 'no viewers'); continue; }
    if (!viewers.has(s.owner) && nextOwner(s) && s.proc && !s.closed) {
      const p = s.proc; s.proc = null; p.kill('SIGKILL'); s.gen++; startFfmpeg(s);
    }
  }
  for (const [k, t] of bad) if (t < now) bad.delete(k);
  for (const [k, c] of logins) if (now - c.at > 10 * 60e3) logins.delete(k);
}, 3000).unref();

// One account watches one stream: this login's smooth channels (but `keep`) end now, which frees
// its one connection at the provider for what it asks next.
function dropLogin(who, keep) {
  for (const [vt, v] of viewers) if (v.login.who === who && v.s.key !== keep) {
    viewers.delete(vt);
    const s = v.s;
    if (s.owner !== vt || s.closed) continue;
    if (!viewersOf(s).length) stop(s, 'viewer watches something else');
    else if (nextOwner(s) && s.proc && !s.closed) { const p = s.proc; s.proc = null; p.kill('SIGKILL'); s.gen++; startFfmpeg(s); }
  }
}

/** Any other stream asked through the relay (plain live, film, episode, replay): its login's
 * smooth channel ends, so the two don't fight over the account's one connection. */
export function relayOther(target) {
  let u;
  try { u = new URL(target); } catch { return; }
  if (!HOSTS.includes(u.hostname)) return;
  const m = u.pathname.match(/^\/(?:live|movie|series|timeshift)\/([^/]+)\//i);
  if (m && viewers.size) dropLogin(hash(u.origin, decodeURIComponent(m[1])), null);
}

/** Relay request for a live channel as HLS: answer with the smooth stream. False = not handled. */
export async function relayLive(req, res, target) {
  if (!smoothOn() || req.method !== 'GET') return false;
  const L = parse(target);
  if (!L) return false;
  const key = hash(L.origin, L.id);
  if (bad.has(key)) return false;
  dropLogin(L.who, key);
  let s = sessions.get(key);
  if (s && viewers.get(s.owner)?.login.who !== L.who && !(await loginOk(L))) return false; // joining: own login must work
  if (!s) {
    if (sessions.size >= MAX) return false; // busy: plain relay
    s = start(key);
  }
  await s.made;
  if (s.closed) return false;
  let vt = [...viewers].find(([, v]) => v.s === s && v.login.who === L.who)?.[0];
  if (!vt) { vt = token(); viewers.set(vt, { s, login: L, seen: Date.now() }); }
  viewers.get(vt).seen = Date.now();
  if (!s.owner || !viewers.has(s.owner)) s.owner = vt;
  if (!s.proc && !s.closed) startFfmpeg(s);
  // Answered at once (players give up on a channel that takes too long to start): the original
  // picture's size is guessed until its first piece has been measured, for the next viewers.
  s.info ||= probe(s).then(v => { s.infoVal = v; });
  const info = s.infoVal || GUESS;

  const proto = req.headers['x-forwarded-proto'] || 'http';
  const base = `${proto}://${req.headers.host}/smooth/${s.id}/${vt}`;
  const secs = (Date.now() - s.t0) / 1000;
  const copyBw = secs > 30 && s.bytes > 0 ? Math.round(s.bytes * 8 / secs * 1.15) : info.bw || 5000000;
  const lines = ['#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-INDEPENDENT-SEGMENTS'];
  for (const r of RUNGS) {
    lines.push(r.copy ? `#EXT-X-STREAM-INF:BANDWIDTH=${copyBw},RESOLUTION=${info.w}x${info.h}${info.codecs ? `,CODECS="${info.codecs}"` : ''}`
      : `#EXT-X-STREAM-INF:BANDWIDTH=${(r.max + r.akbps + 15) * 1000},RESOLUTION=${r.w}x${r.h},CODECS="avc1.4d401f,mp4a.40.2"`);
    lines.push(`${base}/${r.name}/index.m3u8`);
  }
  res.writeHead(200, { ...CORS, 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-cache' });
  res.end(lines.join('\n') + '\n');
  return true;
}

/** /smooth/<channel>/<viewer>/<quality>/<file>: the qualities' playlists and pieces. */
export async function serveSmooth(req, res) {
  const path = (req.url || '').split('?')[0];
  if (path === '/smooth/status') {
    res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ on: smoothOn(), channels: sessions.size, max: MAX, viewers: viewers.size }));
  }
  const m = path.match(/^\/smooth\/([0-9a-f]{32})\/([0-9a-f]{32})\/(\d)\/(index\.m3u8|s\d+\.ts)$/);
  const s = m && byId.get(m[1]), v = m && viewers.get(m[2]);
  if (req.method === 'OPTIONS') { res.writeHead(204, { ...CORS, 'Access-Control-Allow-Headers': 'Range' }); return res.end(); }
  if (!s || !v || v.s !== s || !RUNGS.some(r => r.name === m[3])) { res.writeHead(404, CORS); return res.end(); }
  v.seen = Date.now();
  const file = `${s.dir}/${m[3]}/${m[4]}`;
  if (m[4] === 'index.m3u8') {
    let text = '';
    for (const t0 = Date.now(); Date.now() - t0 < FIRST_WAIT_MS && !s.closed; await new Promise(r => setTimeout(r, 250))) {
      text = await readFile(file, 'utf8').catch(() => '');
      if (/#EXTINF/.test(text)) break;
    }
    if (/#EXTINF/.test(text)) {
      if (!s.ready) log('first pieces after', ((Date.now() - s.t0) / 1000).toFixed(1) + 's', s.id);
      s.ready = true;
    }
    // Not ready yet: an empty live playlist, which players simply ask for again.
    else text = `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:${SEG}\n#EXT-X-MEDIA-SEQUENCE:0\n`;
    res.writeHead(200, { ...CORS, 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-cache' });
    return res.end(text);
  }
  const rs = createReadStream(file);
  rs.on('open', () => { res.writeHead(200, { ...CORS, 'Content-Type': 'video/mp2t', 'Cache-Control': 'max-age=60' }); rs.pipe(res); });
  rs.on('error', () => { if (!res.headersSent) { res.writeHead(404, CORS); res.end(); } else res.destroy(); });
}

// Pieces left over from a previous run (the folder itself belongs to the system: kept).
await mkdir(DIR, { recursive: true }).catch(() => {});
for (const f of await readdir(DIR).catch(() => [])) await rm(`${DIR}/${f}`, { recursive: true, force: true }).catch(() => {});
log(smoothOn() ? `on: up to ${MAX} channels at once` : HAVE_FFMPEG ? 'off (SMOOTH_MAX=0)' : 'off: ffmpeg not installed');
