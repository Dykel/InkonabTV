// App updates for Windows and Mac, like InkonabTV+ on Android: the page (app.js → checkUpdate)
// reads windows.json / mac.json from the update site ({ versionCode, versionName, url, sha256,
// size, notes }, written by scripts/release-desktop.mjs), and asks. The installer is downloaded
// and checked against its SHA-256. Windows: run quietly (Windows asks to allow it), it replaces
// this version and opens the app again. Mac: the disk image opens to drag the app over the old one.
// Sign-in, playlist and settings are kept either way.
const { app, shell } = require('electron');
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const mac = process.platform === 'darwin';
const codeOf = v => v.split('.').map(Number).reduce((n, x) => n * 100 + (x || 0), 0); // 1.0.11 → 10011
let downloaded = '';

function appVersion() {
  return {
    updater: app.isPackaged && !process.windowsStore && (process.platform === 'win32' || mac), // the Store updates its own copy
    canInstall: true,
    name: app.getVersion(),
    code: codeOf(app.getVersion()),
    product: mac ? 'InkonabTV for Mac' : 'InkonabTV for Windows',
    info: mac ? 'mac.json' : 'windows.json',
    installNote: mac
      ? 'Downloaded. InkonabTV closes and the installer opens: drag InkonabTV to Applications and choose Replace — your sign-in and playlist are kept.'
      : 'Downloaded. InkonabTV closes, installs the update and opens again (Windows asks you to allow it) — your sign-in and playlist are kept.',
    installLabel: mac ? 'Open the installer' : 'Install and restart',
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
  const file = path.join(app.getPath('temp'), mac ? 'InkonabTV-update.dmg' : 'InkonabTV-Setup-update.exe');
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

// Windows: runs the downloaded installer quietly (the same switches electron-builder's own
// updater uses) and closes the app so its files can be replaced; the installer opens it again.
// Mac: opens the disk image and closes the app.
function updateInstall() {
  if (!downloaded || !fs.existsSync(downloaded)) return { ok: false };
  if (mac) {
    shell.openPath(downloaded).then(() => setTimeout(() => app.quit(), 800));
    return { ok: true };
  }
  spawn(downloaded, ['--updated', '/S', '--force-run'], { detached: true, stdio: 'ignore' }).unref();
  setTimeout(() => app.quit(), 500);
  return { ok: true };
}

module.exports = { appVersion, updateInfo, updateDownload, updateInstall };
