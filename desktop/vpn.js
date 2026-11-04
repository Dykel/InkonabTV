// Free VPN for InkonabTV on Windows and Mac: the volunteer OpenVPN servers of the VPN Gate
// academic project (https://www.vpngate.net), like the Android app.
//
// The bundled OpenVPN client needs administrator rights to create the network adapter, so the
// computer asks once per connection (Windows: Allow; Mac: your password).
// Windows: resources/openvpn = openvpn.exe + its DLLs (the TAP-Windows driver is installed by the
// setup). Mac: resources/openvpn/openvpn, Tunnelblick's signed OpenVPN 2.6 build.
// One OpenVPN process tries the best servers in turn (one prompt, not one per server). While
// connected it carries the computer's internet traffic; it stops when the app closes.
const { app } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');

const API = 'https://www.vpngate.net/api/iphone/';
const MAX_SERVERS = 8;

let state = 'off'; // off | connecting | connected | failed
let current = null; // { country, ip }
let detail = '';
let mgmtPort = 0;
let onChange = () => {};

// Settings → Free VPN (as on Android): mode auto | always | off, preferred country, and the
// last server that worked (tried first next time).
let prefs = null;
const prefsFile = () => path.join(dir(), 'settings.json');
function settings() {
  if (!prefs) {
    try { prefs = JSON.parse(fs.readFileSync(prefsFile(), 'utf8')); } catch { prefs = {}; }
    prefs = { mode: 'auto', country: '', remembered: null, ...prefs };
  }
  return prefs;
}
function save() {
  fs.mkdirSync(dir(), { recursive: true });
  fs.writeFileSync(prefsFile(), JSON.stringify(prefs));
}
function changed(d) {
  if (d !== undefined) detail = d;
  onChange(status());
}

const dir = () => path.join(app.getPath('userData'), 'vpn');
const mac = process.platform === 'darwin';
const binDir = () => app.isPackaged
  ? path.join(process.resourcesPath, 'openvpn')
  : path.join(__dirname, 'vendor', 'openvpn', mac ? 'mac' : 'win');
const exe = () => path.join(binDir(), mac ? 'openvpn' : 'openvpn.exe');

function available() {
  return (process.platform === 'win32' || mac) && fs.existsSync(exe());
}

const label = s => s ? [s.country, s.ip].filter(Boolean).join(' · ') : '';

// Same shape as the Android app's VPN status, so app.js shows it the same way.
function status() {
  const p = settings();
  return {
    available: available(), state: state === 'off' ? 'disconnected' : state, ok: state === 'connected',
    server: label(current), country: p.country, mode: p.mode, remembered: label(p.remembered),
    detail: state === 'connecting' || state === 'failed' ? detail : '',
  };
}

function setSettings(o = {}) {
  const p = settings();
  if (o.mode && /^(auto|always|off)$/.test(o.mode)) p.mode = o.mode;
  if (typeof o.country === 'string') p.country = o.country.toUpperCase().slice(0, 2);
  if (o.forget) p.remembered = null;
  save();
  changed();
  return status();
}

// VPN Gate's list: CSV after a "*vpn_servers" line, last column = base64 OpenVPN config.
let cache = null, cachedAt = 0;
async function servers() {
  if (cache && Date.now() - cachedAt < 30 * 60 * 1000) return cache;
  const saved = path.join(dir(), 'vpngate.csv');
  let csv;
  try {
    const r = await fetch(API, { signal: AbortSignal.timeout(15000) });
    csv = await r.text();
    fs.mkdirSync(dir(), { recursive: true });
    fs.writeFileSync(saved, csv);
  } catch (e) {
    if (!fs.existsSync(saved)) throw e;
    csv = fs.readFileSync(saved, 'utf8');
  }
  const list = [];
  for (const line of csv.split(/\r?\n/)) {
    if (!line || line.startsWith('*') || line.startsWith('#')) continue;
    const f = line.split(',');
    if (f.length < 15 || !f[14]) continue;
    const config = Buffer.from(f[14], 'base64').toString('utf8');
    const remote = config.match(/^\s*remote\s+(\S+)\s+(\d+)/m);
    const proto = config.match(/^\s*proto\s+(\w+)/m);
    if (!remote) continue;
    list.push({ ip: f[1], score: Number(f[2]) || 0, country: f[5], code: f[6], config,
      remote: remote[1], port: remote[2], proto: proto ? proto[1] : 'udp' });
  }
  list.sort((a, b) => b.score - a.score);
  cache = list; cachedAt = Date.now();
  return list;
}

// One config: the shared VPN Gate settings and certificates from the best server, then a
// <connection> block per server so OpenVPN moves on by itself when one doesn't answer.
function buildConfig(list) {
  const base = list[0].config
    .split(/\r?\n/)
    .filter(l => !/^\s*(remote|proto|resolv-retry|nobind|persist-tun|persist-key|#)/.test(l) || /^\s*</.test(l))
    .join('\n');
  const conns = list.map(s => `<connection>\nremote ${s.remote} ${s.port}\nproto ${s.proto}\nconnect-timeout 10\nserver-poll-timeout 10\n</connection>`).join('\n');
  return `${base}
nobind
${mac ? '' : 'windows-driver tap-windows6'}
redirect-gateway def1
data-ciphers AES-128-CBC:AES-256-GCM:AES-128-GCM:CHACHA20-POLY1305
data-ciphers-fallback AES-128-CBC
connect-retry-max 1
management 127.0.0.1 ${mgmtPort}
verb 3
${conns}
`;
}

function mgmt(command) {
  return new Promise(resolve => {
    if (!mgmtPort) return resolve('');
    const sock = net.connect(mgmtPort, '127.0.0.1');
    let out = '';
    sock.setTimeout(3000, () => sock.destroy());
    sock.on('connect', () => sock.write(command + '\n'));
    sock.on('data', d => { out += d; if (/^(SUCCESS|ERROR|END)/m.test(out)) sock.end(); });
    sock.on('close', () => resolve(out));
    sock.on('error', () => resolve(''));
  });
}

function freePort() {
  return new Promise(resolve => {
    const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
}

// skip: server addresses not to use (vpnSwitch: the one that didn't reach the provider).
async function connect(skip = []) {
  if (!available()) return status();
  if (state === 'connected' || state === 'connecting') return status();
  state = 'connecting';
  changed('Looking for the fastest route…');
  try {
    const p = settings();
    let all = (await servers()).filter(s => !skip.includes(s.remote));
    const inCountry = p.country ? all.filter(s => s.code === p.country) : [];
    if (inCountry.length) all = inCountry;
    const known = p.remembered && all.find(s => s.ip === p.remembered.ip);
    const list = (known ? [known, ...all.filter(s => s !== known)] : all).slice(0, MAX_SERVERS);
    if (!list.length) throw new Error('no servers');
    mgmtPort = await freePort();
    fs.mkdirSync(dir(), { recursive: true });
    const conf = path.join(dir(), 'inkonabtv.ovpn');
    const log = path.join(dir(), 'openvpn.log');
    fs.writeFileSync(conf, buildConfig(list));
    try { fs.unlinkSync(log); } catch {}

    // Start OpenVPN as administrator: Windows shows its "Allow" prompt, the Mac asks for the
    // password (OpenVPN then runs in the background until the app tells it to stop).
    await new Promise((resolve, reject) => {
      let p;
      if (mac) {
        const sh = s => `'${s.replace(/'/g, `'\\''`)}'`;
        const cmd = `${sh(exe())} --config ${sh(conf)} --log ${sh(log)} --cd ${sh(binDir())} --daemon`;
        const as = s => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
        p = spawn('osascript', ['-e', `do shell script ${as(cmd)} with prompt "InkonabTV needs your permission to start the free VPN." with administrator privileges`]);
      } else {
        const q = s => `'${s.replace(/'/g, "''")}'`;
        const ps = `Start-Process -FilePath ${q(exe())} -ArgumentList ${q(`--config "${conf}" --log "${log}"`)} -WorkingDirectory ${q(binDir())} -Verb RunAs -WindowStyle Hidden`;
        p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true });
      }
      p.on('exit', code => code === 0 ? resolve() : reject(new Error(mac ? 'The Mac did not allow the VPN' : 'Windows did not allow the VPN')));
      p.on('error', reject);
    });

    // Wait for "Initialization Sequence Completed" (each server gets ~10 s).
    const deadline = Date.now() + (list.length * 12 + 10) * 1000;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 1000));
      const text = fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '';
      if (/Initialization Sequence Completed/.test(text)) {
        const peer = [...text.matchAll(/(?:TCP|UDP)[^\n]*\[AF_INET\]([\d.]+):\d+/g)].pop();
        const s = peer && list.find(x => x.remote === peer[1]);
        current = s ? { country: s.country, ip: s.ip, remote: s.remote } : { country: '', ip: peer ? peer[1] : '', remote: peer ? peer[1] : '' };
        state = 'connected';
        if (s) { p.remembered = { country: s.country, ip: s.ip }; save(); }
        changed('');
        return status();
      }
      if (/Exiting due to fatal error|SIGTERM\[soft,connection-retry\]|All connections have been connect-retry-max/.test(text)) break;
    }
    await stop();
    state = 'failed';
    changed('No free server answered');
  } catch (e) {
    console.warn('[vpn]', e.message);
    state = 'failed';
    changed(/allow/.test(e.message) ? e.message : 'No free server answered');
  }
  return status();
}

async function stop() {
  if (mgmtPort) await mgmt('signal SIGTERM');
  mgmtPort = 0;
  current = null;
}

async function disconnect() {
  await stop();
  state = 'off';
  changed('');
  return status();
}

// The connected server doesn't reach the provider: move to another one.
async function switchServer() {
  const skip = current && current.remote ? [current.remote] : [];
  await disconnect();
  await new Promise(r => setTimeout(r, 1000));
  return connect(skip);
}

module.exports = { status, connect, disconnect, switchServer, settings: setSettings, onChange: fn => { onChange = fn; } };
