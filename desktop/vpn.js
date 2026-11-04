// Free VPN for InkonabTV on Windows: the volunteer OpenVPN servers of the VPN Gate academic
// project (https://www.vpngate.net), like the Android app.
//
// The bundled OpenVPN client (resources/openvpn: openvpn.exe + its DLLs; the TAP-Windows driver is installed by the setup) needs
// administrator rights to create the network adapter, so Windows asks once per connection.
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
let mgmtPort = 0;

const dir = () => path.join(app.getPath('userData'), 'vpn');
const binDir = () => app.isPackaged
  ? path.join(process.resourcesPath, 'openvpn')
  : path.join(__dirname, 'vendor', 'openvpn', 'win');
const exe = () => path.join(binDir(), 'openvpn.exe');

function available() {
  return process.platform === 'win32' && fs.existsSync(exe());
}

function status() {
  return { available: available(), state, server: current };
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
windows-driver tap-windows6
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

async function connect() {
  if (!available()) return status();
  if (state === 'connected' || state === 'connecting') return status();
  state = 'connecting';
  try {
    const list = (await servers()).slice(0, MAX_SERVERS);
    if (!list.length) throw new Error('no servers');
    mgmtPort = await freePort();
    fs.mkdirSync(dir(), { recursive: true });
    const conf = path.join(dir(), 'inkonabtv.ovpn');
    const log = path.join(dir(), 'openvpn.log');
    fs.writeFileSync(conf, buildConfig(list));
    try { fs.unlinkSync(log); } catch {}

    // Start OpenVPN as administrator (Windows shows its "Allow" prompt).
    const q = s => `'${s.replace(/'/g, "''")}'`;
    const ps = `Start-Process -FilePath ${q(exe())} -ArgumentList ${q(`--config "${conf}" --log "${log}"`)} -WorkingDirectory ${q(binDir())} -Verb RunAs -WindowStyle Hidden`;
    await new Promise((resolve, reject) => {
      const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true });
      p.on('exit', code => code === 0 ? resolve() : reject(new Error('Windows did not allow the VPN')));
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
        current = s ? { country: s.country, ip: s.ip } : { country: '', ip: peer ? peer[1] : '' };
        state = 'connected';
        return status();
      }
      if (/Exiting due to fatal error|SIGTERM\[soft,connection-retry\]|All connections have been connect-retry-max/.test(text)) break;
    }
    await disconnect();
    state = 'failed';
  } catch (e) {
    console.warn('[vpn]', e.message);
    state = 'failed';
  }
  return status();
}

async function disconnect() {
  if (mgmtPort) await mgmt('signal SIGTERM');
  mgmtPort = 0;
  current = null;
  if (state !== 'failed') state = 'off';
  return status();
}

module.exports = { status, connect, disconnect };
