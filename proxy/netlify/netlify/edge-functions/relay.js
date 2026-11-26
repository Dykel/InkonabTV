/**
 * InkonabTV HTTPS relay — Netlify Edge Function (Deno).
 *
 * Same job as ../../../worker.js and ../../../alwaysdata/index.php: the website is HTTPS,
 * the provider sends video over plain HTTP, so this fetches it server-side and returns it
 * over HTTPS with CORS headers. HLS playlists are rewritten so every segment also goes
 * through the relay. Video data is streamed through, never buffered.
 *
 * Usage:  https://<site>.netlify.app/relay?url=<encoded stream URL>
 *
 * Only URLs on ALLOWED_HOSTS are accepted directly. URLs inside a playlist (the provider's
 * video server) are signed with the SECRET environment variable, so the relay can't be used
 * as an open proxy. Without a SECRET the relay refuses to run.
 */
const ALLOWED_HOSTS = ['inkonabtv.ottb.xyz'];
const UA = 'Mozilla/5.0 (InkonabTV Web)';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, Content-Type',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
};

// Players reload a live playlist every few seconds. Asking the provider's login address each
// time opens a new session (one-connection accounts drop the stream), so the stream address it
// redirects to is remembered for 10 minutes. Best effort: each edge instance has its own copy.
const playlistCache = new Map(); // target -> { url, at }
const CACHE_MS = 10 * 60 * 1000;

const reply = (body, status = 200, extra = {}) =>
  new Response(body, { status, headers: { ...CORS, ...extra } });

export default async (request) => {
  if (request.method === 'OPTIONS') return reply(null, 204);
  const secret = Netlify.env.get('SECRET');
  if (!secret || secret.length < 16) {
    return reply('Relay not set up: add an environment variable named SECRET (16+ random characters) in Site configuration → Environment variables, then redeploy.', 503);
  }

  const self = new URL(request.url);
  const target = self.searchParams.get('url');
  if (!target) return reply('InkonabTV relay is running.');

  let t;
  try { t = new URL(target); } catch { return reply('Bad url', 400); }
  if (!/^https?:$/.test(t.protocol)) return reply('Bad protocol', 400);

  const allowed = ALLOWED_HOSTS.includes(t.hostname) ||
    (self.searchParams.get('sig') === await sign(secret, target));
  if (!allowed) return reply('Host not allowed', 403);

  const headers = new Headers({ 'User-Agent': UA });
  const range = request.headers.get('Range');
  if (range) headers.set('Range', range);

  const isPlaylist = /\.m3u8?$/i.test(t.pathname);

  if (isPlaylist && request.method === 'GET') {
    let res, text = '', final = target;
    const cached = playlistCache.get(target);
    if (cached && Date.now() - cached.at < CACHE_MS) {
      try {
        res = await follow(cached.url, 'GET', headers);
        text = await res.text();
        final = res.finalUrl;
        console.log('playlist reuse', host(cached.url), res.status);
      } catch { res = null; }
    }
    if (!res || res.status !== 200 || !text.trimStart().startsWith('#EXTM3U')) {
      try {
        res = await follow(target, 'GET', headers);
      } catch (e) {
        console.log('upstream error', t.host, String(e));
        return reply('Relay could not reach the stream: ' + e, 502);
      }
      text = await res.text();
      final = res.finalUrl;
      console.log('playlist fresh', t.host, '->', host(final), res.status);
      if (res.status === 200) playlistCache.set(target, { url: final, at: Date.now() });
    }
    if (res.status === 200 && text.trimStart().startsWith('#EXTM3U')) {
      const base = self.origin + self.pathname;
      const wrap = async u => {
        const abs = new URL(u, final).toString();
        return `${base}?url=${encodeURIComponent(abs)}&sig=${await sign(secret, abs)}`;
      };
      const out = [];
      for (const line of text.split(/\r?\n/)) {
        const l = line.trim();
        if (!l) { out.push(line); continue; }
        if (l.startsWith('#')) {
          // Rewrite URI="..." attributes (keys, media playlists, maps).
          const m = l.match(/URI="([^"]+)"/);
          out.push(m ? l.replace(m[1], await wrap(m[1])) : l);
        } else {
          out.push(await wrap(l));
        }
      }
      return reply(out.join('\n'), 200, { 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-cache' });
    }
    playlistCache.delete(target);
    return reply(text, res.status || 502, { 'Content-Type': res.headers.get('Content-Type') || 'text/plain' });
  }

  // Video data: stream it through as it arrives, passing Range and the useful headers.
  let upstream;
  try {
    upstream = await follow(target, request.method, headers);
  } catch (e) {
    console.log('upstream error', t.host, String(e));
    return reply('Relay could not reach the stream: ' + e, 502);
  }
  console.log('data', host(upstream.finalUrl), upstream.status, range ? 'range ' + range : '');
  const out = new Headers(CORS);
  for (const h of ['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges', 'Cache-Control']) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  return new Response(request.method === 'HEAD' ? null : upstream.body, { status: upstream.status, headers: out });
};

// Follow redirects by hand (up to 5) so the final address is known for playlist rewriting.
async function follow(url, method, headers) {
  let hop = url, res;
  for (let i = 0; i < 5; i++) {
    res = await fetch(hop, { method, headers, redirect: 'manual' });
    const loc = res.status >= 300 && res.status < 400 && res.headers.get('Location');
    if (!loc) break;
    await res.body?.cancel();
    hop = new URL(loc, hop).toString();
  }
  res.finalUrl = hop;
  return res;
}

function host(u) { try { return new URL(u).host; } catch { return '?'; } }

async function sign(secret, value) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return [...new Uint8Array(mac)].slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
}

// The app calls `<relay URL>/?url=…`, so both forms are served.
export const config = { path: ['/relay', '/relay/'] };
