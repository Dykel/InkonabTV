// Sound for movies and series: most of them carry Dolby audio (AC3 / E-AC3 / DTS), which the
// app's video engine can't decode, so they play without sound. The bundled ffmpeg reads the
// provider's file once, keeps the picture as it is and turns the sound into AAC, as a
// fragmented MP4 stream the player feeds to the video element (Media Source Extensions).
//
// GET http://127.0.0.1:<port>/convert?u=<video address>&ss=<seconds>
//   → the stream from that point, timestamps kept (a seek starts a new request);
//     X-Duration: the film's length in seconds.
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

let port = 0;

function convert(req, res, q) {
  const src = q.get('u') || '';
  const ss = Math.max(0, Number(q.get('ss')) || 0);
  if (!/^https?:\/\//i.test(src)) { res.writeHead(400); return res.end(); }
  const args = ['-hide_banner', '-nostdin', '-loglevel', 'info',
    '-user_agent', 'InkonabTV',
    ...(ss > 0 ? ['-ss', String(ss)] : []), '-copyts', '-i', src,
    '-map', '0:v:0', '-map', '0:a:0?', '-sn', '-dn',
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

function startServer() {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      if (u.pathname === '/convert') return convert(req, res, u.searchParams);
      res.writeHead(404); res.end();
    });
    server.listen(0, '127.0.0.1', () => { port = server.address().port; resolve(port); });
  });
}

module.exports = { startServer, base: () => port ? `http://127.0.0.1:${port}` : '' };
