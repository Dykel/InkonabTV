/**
 * InkonabTV HTTPS relay — Cloudflare Worker.
 *
 * The provider sends video from a plain-HTTP address, which browsers refuse to
 * load inside an HTTPS page (GitHub Pages). This worker fetches it server-side
 * and returns it over HTTPS with CORS headers. HLS playlists are rewritten so
 * every segment also goes through the relay.
 *
 * Usage:  https://<worker>/?url=<encoded stream URL>
 *
 * Only URLs on ALLOWED_HOSTS are accepted directly. URLs that appear inside a
 * playlist (other hosts / IPs the provider redirects to) are signed with
 * SECRET so the relay can't be used as an open proxy.
 */
const ALLOWED_HOSTS = ['inkonabtv.ottb.xyz'];

export default {
  async fetch(request, env) {
    const secret = (env && env.SECRET) || 'change-me-' + ALLOWED_HOSTS.join(',');
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const self = new URL(request.url);
    const target = self.searchParams.get('url');
    if (!target) return new Response('InkonabTV relay is running.', { headers: cors });

    let t;
    try { t = new URL(target); } catch { return new Response('Bad url', { status: 400, headers: cors }); }
    if (!/^https?:$/.test(t.protocol)) return new Response('Bad protocol', { status: 400, headers: cors });

    const allowed = ALLOWED_HOSTS.includes(t.hostname) ||
      (self.searchParams.get('sig') === await sign(secret, target));
    if (!allowed) return new Response('Host not allowed', { status: 403, headers: cors });

    const headers = new Headers({ 'User-Agent': 'Mozilla/5.0 (InkonabTV Web)' });
    const range = request.headers.get('Range');
    if (range) headers.set('Range', range);

    const upstream = await fetch(t.toString(), { method: request.method, headers, redirect: 'follow' });
    const type = upstream.headers.get('Content-Type') || '';
    const isPlaylist = /mpegurl/i.test(type) || /\.m3u8?($|\?)/i.test(t.pathname) || /\.m3u8?($|\?)/i.test(new URL(upstream.url).pathname);

    if (isPlaylist && request.method === 'GET' && upstream.ok) {
      const text = await upstream.text();
      if (text.trimStart().startsWith('#EXTM3U')) {
        const base = upstream.url;
        const wrap = async u => {
          const abs = new URL(u, base).toString();
          return `${self.origin}/?url=${encodeURIComponent(abs)}&sig=${await sign(secret, abs)}`;
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
        return new Response(out.join('\n'), {
          status: 200,
          headers: { ...cors, 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-cache' },
        });
      }
      return new Response(text, { status: upstream.status, headers: { ...cors, 'Content-Type': type } });
    }

    const out = new Headers(cors);
    for (const h of ['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges', 'Cache-Control']) {
      const v = upstream.headers.get(h);
      if (v) out.set(h, v);
    }
    return new Response(upstream.body, { status: upstream.status, headers: out });
  },
};

async function sign(secret, value) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return [...new Uint8Array(mac)].slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
}
