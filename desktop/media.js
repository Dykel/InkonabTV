// Sound for movies and series: most of them carry Dolby audio (AC3 / E-AC3 / DTS), which the
// app's video engine can't decode, so they play without sound. The bundled ffmpeg reads the
// provider's file once, keeps the picture as it is and turns the sound into AAC, as a
// fragmented MP4 stream the player feeds to the video element (Media Source Extensions).
//
// GET http://127.0.0.1:<port>/convert?u=<video address>&ss=<seconds>&a=<audio track>
//   → the stream from that point, timestamps kept (a seek starts a new request), with that
//     audio track (0 = the first); X-Duration: the film's length in seconds.
// GET http://127.0.0.1:<port>/tracks?u=<video address>
//   → [{ lang, codec, ch }] the film's audio tracks (for the Audio button: language choice).
const { app } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');

// Bundled with the app (resources/ffmpeg); from vendor/ffmpeg/<win|mac> when run from source.
const ffmpegPath = () => {
  const name = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const own = app.isPackaged
    ? path.join(process.resourcesPath, 'ffmpeg', name)
    : path.join(__dirname, 'vendor', 'ffmpeg', process.platform === 'win32' ? 'win' : 'mac', name);
  if (fs.existsSync(own)) return own;
  return ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg'].find(p => fs.existsSync(p)) || name;
};

// The Mac's bundled ffmpeg (OpenSSL) has no list of trusted certificates of its own, so it can't
// open any https:// film: it gets Node's (the same Mozilla list browsers use), written once to a
// file. Windows' ffmpeg uses the system's own store (schannel).
let caFile = process.platform === 'darwin' ? null : '';
const caArgs = () => {
  if (caFile === null) {
    caFile = '';
    try {
      const f = path.join(app.getPath('userData'), 'ca-certificates.pem');
      fs.writeFileSync(f, require('tls').rootCertificates.join('\n'));
      caFile = f;
    } catch (e) { console.warn('[media] certificates', e.message); }
  }
  return caFile ? ['-ca_file', caFile] : [];
};

// Providers often answer an https:// address with a redirect to their http:// stream server.
// The app follows it (Node checks the certificate) and gives ffmpeg the final address, with the
// certificate list only when that is https:// too (ffmpeg refuses options it doesn't use).
async function finalUrl(src) {
  let u = src;
  for (let hop = 0; hop < 5; hop++) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 10000);
    try {
      const r = await fetch(u, { redirect: 'manual', headers: { 'User-Agent': 'InkonabTV' }, signal: ac.signal });
      ac.abort(); // only the answer's head is needed
      const loc = r.status >= 300 && r.status < 400 && r.headers.get('location');
      if (!loc) return u;
      u = new URL(loc, u).href;
    } catch (e) {
      return u; // let ffmpeg try (and report) it
    } finally { clearTimeout(t); }
  }
  return u;
}
const input = async src => {
  const u = await finalUrl(src);
  return [...(/^https:/i.test(u) ? caArgs() : []), '-i', u];
};

let port = 0;

async function convert(req, res, q) {
  const src = q.get('u') || '';
  const ss = Math.max(0, Number(q.get('ss')) || 0);
  const a = Math.max(0, Math.floor(Number(q.get('a')) || 0));
  if (!/^https?:\/\//i.test(src)) { res.writeHead(400); return res.end(); }
  const inp = await input(src);
  if (res.destroyed) return;
  const args = ['-hide_banner', '-nostdin', '-loglevel', 'info',
    '-user_agent', 'InkonabTV',
    ...(ss > 0 ? ['-ss', String(ss)] : []), '-copyts', ...inp,
    '-map', '0:v:0', '-map', `0:a:${a}?`, '-sn', '-dn',
    '-c:v', 'copy', '-c:a', 'aac', '-ac', '2', '-b:a', '192k',
    '-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', '-frag_duration', '2000000',
    'pipe:1'];
  const ff = spawn(ffmpegPath(), args, { windowsHide: true });
  let err = '', started = false;
  const start = () => {
    if (started) return;
    started = true;
    const d = err.match(/Duration: (\d+):(\d\d):(\d\d(?:\.\d+)?)/);
    res.writeHead(200, {
      'Content-Type': 'video/mp4',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'X-Duration',
      'X-Duration': d ? String(+d[1] * 3600 + +d[2] * 60 + +d[3]) : '',
    });
    ff.stdout.pipe(res);
  };
  ff.stderr.on('data', b => {
    if (err.length < 20000) err += b;
    if (/Output #0/.test(err)) start();
  });
  ff.stdout.once('readable', start);
  ff.on('error', e => { if (!started) { started = true; res.writeHead(502); res.end(e.message); } });
  ff.on('close', code => {
    if (!started) { started = true; res.writeHead(502); res.end(err.slice(-600)); }
    else res.end();
    if (code) console.warn('[media] ffmpeg', code, err.slice(-300));
  });
  // The player moved on (seek, next film, closed): stop reading from the provider at once.
  res.on('close', () => { if (ff.exitCode === null) ff.kill('SIGKILL'); });
}

// Reads only the film's header: ffmpeg lists its streams, then stops (no output file).
async function tracks(req, res, q) {
  const src = q.get('u') || '';
  const send = list => {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(list));
  };
  if (!/^https?:\/\//i.test(src)) return send([]);
  const inp = await input(src);
  if (res.destroyed) return;
  const ff = spawn(ffmpegPath(), ['-hide_banner', '-nostdin', '-user_agent', 'InkonabTV', ...inp], { windowsHide: true });
  let err = '', sent = false;
  const finish = () => {
    if (sent) return;
    sent = true;
    clearTimeout(timer);
    if (ff.exitCode === null) ff.kill('SIGKILL');
    const list = [];
    const re = /Stream #0:\d+(?:\[[^\]]*\])?(?:\(([^)]*)\))?: Audio: (\w+)[^\n]*?, \d+ Hz, ([^,\n]+)/g;
    for (let m; (m = re.exec(err));) list.push({ lang: m[1] || '', codec: m[2], ch: m[3].trim() });
    send(list);
  };
  const timer = setTimeout(finish, 15000);
  ff.stderr.on('data', b => { if (err.length < 40000) err += b; });
  ff.on('error', finish);
  ff.on('close', finish);
  res.on('close', () => { if (ff.exitCode === null) ff.kill('SIGKILL'); });
}

function startServer() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      if (u.pathname === '/convert') return convert(req, res, u.searchParams);
      if (u.pathname === '/tracks') return tracks(req, res, u.searchParams);
      res.writeHead(404); res.end();
    });
    server.listen(0, '127.0.0.1', () => { port = server.address().port; resolve(port); });
  });
}

module.exports = { startServer, base: () => port ? `http://127.0.0.1:${port}` : '' };
