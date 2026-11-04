// App updates for Windows, like InkonabTV+ on Android: the page (app.js → checkUpdate) reads
// windows.json from the update site ({ versionCode, versionName, url, sha256, size, notes },
// written by scripts/release-windows.mjs), and asks. The installer is downloaded, checked against
// its SHA-256, then run quietly: Windows asks to allow it, it replaces this version (sign-in,
// playlist and settings are kept) and opens the app again.
const { app } = require('electron');
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const codeOf = v => v.split('.').map(Number).reduce((n, x) => n * 100 + (x || 0), 0); // 1.0.11 → 10011
let downloaded = '';

function appVersion() {
  return {
    updater: app.isPackaged && process.platform === 'win32',
    canInstall: true,
    name: app.getVersion(),
    code: codeOf(app.getVersion()),
    product: 'InkonabTV for Windows',
    info: 'windows.json',
  };
}

async function updateInfo({ url }) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000), cache: 'no-store' });
    return { ok: r.ok, text: await r.text() };
  } catch (e) {
    return { ok: false, text: e.message };
  }
}

async function updateDownload({ url, sha256 }, progress) {
  if (!/^https:\/\//i.test(url || '')) return { ok: false, detail: 'bad address' };
  const file = path.join(app.getPath('temp'), 'InkonabTV-Setup-update.exe');
  try {
    const r = await fetch(url, { redirect: 'follow' });
    if (!r.ok) throw new Error('download failed (' + r.status + ')');
    const total = Number(r.headers.get('content-length')) || 0;
    const hash = crypto.createHash('sha256');
    const out = fs.createWriteStream(file);
    let done = 0, last = 0;
    for await (const chunk of r.body) {
      hash.update(chunk);
      if (!out.write(chunk)) await new Promise(res => out.once('drain', res));
      done += chunk.length;
      if (Date.now() - last > 300) { last = Date.now(); progress({ done, total }); }
    }
    await new Promise((res, rej) => out.end(err => err ? rej(err) : res()));
    progress({ done, total: total || done });
    if (sha256 && hash.digest('hex') !== sha256.toLowerCase()) {
      fs.rmSync(file, { force: true });
      throw new Error('the download is damaged');
    }
    downloaded = file;
    return { ok: true };
  } catch (e) {
    return { ok: false, detail: e.message };
  }
}

// Runs the downloaded installer quietly (the same switches electron-builder's own updater uses)
// and closes the app so its files can be replaced; the installer opens it again.
function updateInstall() {
  if (!downloaded || !fs.existsSync(downloaded)) return { ok: false };
  spawn(downloaded, ['--updated', '/S', '--force-run'], { detached: true, stdio: 'ignore' }).unref();
  setTimeout(() => app.quit(), 500);
  return { ok: true };
}

module.exports = { appVersion, updateInfo, updateDownload, updateInstall };
