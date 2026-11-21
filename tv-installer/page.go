package main

// The installer's page (served on 127.0.0.1 only). Plain HTML, no outside files.
const pageHTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>InkonabTV for Samsung TV - Installer</title>
<style>
  :root { --bg:#0f1115; --card:#181b22; --line:#2a2f3a; --text:#eef0f4; --dim:#a2a9b6; --accent:#f5c518; --ok:#3fb950; --bad:#f85149; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 760px; margin: 0 auto; padding: 28px 16px 48px; }
  h1 { font-size: 26px; margin: 0 0 4px; } h1 b { color: var(--accent); }
  .sub { color: var(--dim); margin: 0 0 24px; }
  .step { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 18px 20px; margin: 0 0 14px; display: grid; grid-template-columns: 40px 1fr; gap: 4px 14px; }
  .num { width: 34px; height: 34px; border-radius: 50%; background: var(--accent); color: #111; font-weight: 700; display: grid; place-items: center; }
  .step h2 { font-size: 18px; margin: 4px 0 6px; }
  .step p, .step li { color: var(--dim); margin: 4px 0; } .step ol { margin: 4px 0; padding-left: 20px; }
  .step b, .step strong { color: var(--text); }
  .path { color: var(--text); background: #222733; border-radius: 6px; padding: 1px 7px; white-space: nowrap; }
  .big { font-size: 28px; font-weight: 700; letter-spacing: .5px; color: var(--accent); }
  .row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
  input { flex: 1 1 220px; font-size: 20px; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--line); background: #0c0e12; color: var(--text); }
  button { font-size: 18px; font-weight: 700; padding: 10px 22px; border-radius: 8px; border: 0; background: var(--accent); color: #111; cursor: pointer; }
  button[disabled] { opacity: .5; cursor: default; } button.ghost { background: #2a2f3a; color: var(--text); font-size: 15px; padding: 6px 14px; }
  #log { margin-top: 14px; padding: 12px 14px; background: #0c0e12; border-radius: 8px; border: 1px solid var(--line); font: 14px/1.6 ui-monospace, Consolas, monospace; white-space: pre-wrap; display: none; }
  .msg { margin-top: 12px; padding: 12px 14px; border-radius: 8px; display: none; }
  .msg.ok { background: rgba(63,185,80,.15); border: 1px solid var(--ok); }
  .msg.bad { background: rgba(248,81,73,.12); border: 1px solid var(--bad); }
  .help { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px 20px; margin-top: 20px; color: var(--dim); }
  a { color: var(--accent); }
  .duid { font: 700 22px ui-monospace, Consolas, monospace; color: var(--text); }
</style>
</head>
<body>
<main>
  <h1>InkonabTV <b>for Samsung TV</b></h1>
  <p class="sub">Installer <span id="ver"></span> for testing on a Samsung Smart TV (2018 or newer). Follow the steps once; next time just do step 4.</p>

  <section class="step"><div class="num">1</div><div>
    <h2>Same network</h2>
    <p>Connect the <b>TV</b> and <b>this computer</b> to the same Wi-Fi or router.</p>
  </div></section>

  <section class="step"><div class="num">2</div><div>
    <h2>Find the TV's IP address</h2>
    <p>On the TV: <span class="path">Settings</span> → <span class="path">General</span> (or <span class="path">Connection</span>) → <span class="path">Network</span> → <span class="path">Network Status</span> → <span class="path">IP Settings</span>.</p>
    <p>Write down the <b>IP address</b>, for example <b>192.168.1.25</b>.</p>
  </div></section>

  <section class="step"><div class="num">3</div><div>
    <h2>Turn on Developer mode on the TV</h2>
    <ol>
      <li>Open <span class="path">Apps</span> on the TV.</li>
      <li>On the remote, press <b>1 2 3 4 5</b> (with the number keys, or the on-screen number pad). A <b>Developer mode</b> window opens.</li>
      <li>Switch Developer mode <b>On</b>.</li>
      <li>In <b>Host PC IP</b>, type this computer's address:<br><span class="big" id="pcip">…</span></li>
      <li>Press <b>OK</b>, then <b>restart the TV</b>: hold the Power button until it turns off and back on.</li>
    </ol>
    <p>The TV trusts one computer at a time: if you install from another computer later, put that computer's address here.</p>
  </div></section>

  <section class="step"><div class="num">4</div><div>
    <h2>Install InkonabTV</h2>
    <p>Type the TV's IP address (step 2) and press <b>Install</b>. It takes about 30 seconds and opens the app on the TV.</p>
    <form id="f" class="row" autocomplete="off">
      <input id="tv" name="tv" inputmode="decimal" placeholder="TV IP address, e.g. 192.168.1.25" required>
      <button id="go" type="submit">Install</button>
    </form>
    <div id="log"></div>
    <div id="msg" class="msg"></div>
  </div></section>

  <div class="help">
    <b>Need help?</b> Contact <b id="hname">Dykel Away</b> on Facebook: <a id="hlink" href="#" target="_blank" rel="noopener">open Facebook</a>.
    Say what the installer showed (a screenshot helps).
  </div>
</main>
<script>
const $ = s => document.querySelector(s);
let helpURL = '#', helpName = 'Dykel Away', timer = null;
fetch('info').then(r => r.json()).then(i => {
  $('#ver').textContent = 'v' + i.version;
  $('#pcip').textContent = i.pcIP || '(see this computer\'s network settings)';
  if (i.lastTV) $('#tv').value = i.lastTV;
  helpURL = i.helpURL; helpName = i.helpName;
  $('#hname').textContent = helpName; $('#hlink').href = helpURL;
});
setInterval(() => fetch('status').catch(() => {}), 1000); // keeps the installer running while this page is open

$('#f').addEventListener('submit', async e => {
  e.preventDefault();
  const tv = $('#tv').value.trim();
  $('#msg').style.display = 'none';
  const r = await fetch('install', { method: 'POST', body: new URLSearchParams({ tv }) });
  if (!r.ok) { show('bad', await r.text()); return; }
  $('#go').disabled = true; $('#log').style.display = 'block'; $('#log').textContent = '';
  timer = setInterval(poll, 700);
});

async function poll() {
  const s = await (await fetch('status')).json();
  $('#log').textContent = (s.lines || []).join('\n');
  if (!s.done) return;
  clearInterval(timer); $('#go').disabled = false;
  if (s.ok) return show('ok', '<b>Done!</b> InkonabTV is installed and open on the TV. You can close this page.');
  if (s.unknownTV && s.duid) {
    return show('bad', '<b>' + esc(s.error) + '</b><br>Send this TV ID to <b>' + esc(helpName) + '</b> on ' +
      '<a href="' + helpURL + '" target="_blank" rel="noopener">Facebook</a> to get it added:<br>' +
      '<span class="duid" id="duid">' + esc(s.duid) + '</span> <button class="ghost" type="button" onclick="copyDuid()">Copy</button><br>' +
      'You\'ll get a new installer that works on this TV.');
  }
  show('bad', '<b>Not installed.</b> ' + esc(s.error) + '<br>Still stuck? Contact <b>' + esc(helpName) + '</b> on <a href="' + helpURL + '" target="_blank" rel="noopener">Facebook</a>.');
}
function show(kind, html) { const m = $('#msg'); m.className = 'msg ' + kind; m.innerHTML = html; m.style.display = 'block'; }
function esc(t) { return String(t || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function copyDuid() { navigator.clipboard.writeText($('#duid').textContent).then(() => show('ok', 'TV ID copied. Paste it in a message to ' + esc(helpName) + ' on <a href="' + helpURL + '" target="_blank" rel="noopener">Facebook</a>.')); }
</script>
</body>
</html>`
