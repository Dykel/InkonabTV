// InkonabTV remote setup (Cloudflare Worker + Durable Object, free plan).
//
//   TV     POST /pair                       → { code, token, ttl }   (shows the code on screen)
//   phone  PUT  /pair/<code>  {s,u,p}|{m, name?, extra?}  → 204 (404: wrong/expired code, 409: already used)
//   TV     GET  /pair/<code>?token=<token>  → 204 while waiting, 200 + the account once sent
//
// The account is kept only until the TV collects it (then deleted) and never longer than
// 15 minutes. Only the TV that asked for the code (it holds the token) can read it.
// Deploy: see README → "Remote setup".

const TTL = 15 * 60;
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L
const MAX_BODY = 4096;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
};
const reply = (status, body) => new Response(body == null ? null : JSON.stringify(body), {
  status, headers: { ...cors, ...(body == null ? {} : { 'Content-Type': 'application/json' }) },
});
const random = (n, chars) => {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(bytes, b => chars[b % chars.length]).join('');
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'pair') return reply(404, { error: 'not found' });
    const room = code => env.PAIR.get(env.PAIR.idFromName(code));

    if (request.method === 'POST' && parts.length === 1) {
      for (let i = 0; i < 5; i++) {
        const code = random(6, ALPHABET);
        const token = random(32, 'abcdefghijklmnopqrstuvwxyz0123456789');
        const r = await room(code).fetch('https://do/init', { method: 'POST', body: JSON.stringify({ token }) });
        if (r.status === 201) return reply(200, { code, token, ttl: TTL });
      }
      return reply(503, { error: 'busy, try again' });
    }

    const code = String(parts[1] || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (parts.length !== 2 || code.length !== 6) return reply(404, { error: 'wrong code' });

    if (request.method === 'PUT') {
      const text = await request.text();
      if (text.length > MAX_BODY) return reply(413, { error: 'too large' });
      let d;
      try { d = JSON.parse(text); } catch { return reply(400, { error: 'bad json' }); }
      const data = d && typeof d.m === 'string' && d.m
        ? { m: d.m, ...(typeof d.name === 'string' && d.name ? { name: d.name.slice(0, 40) } : {}), ...(d.extra === true ? { extra: true } : {}) }
        : d && typeof d.u === 'string' && typeof d.p === 'string' && d.u && d.p ? { s: typeof d.s === 'string' ? d.s : '', u: d.u, p: d.p } : null;
      if (!data) return reply(400, { error: 'missing account' });
      const r = await room(code).fetch('https://do/data', { method: 'PUT', body: JSON.stringify(data) });
      return reply(r.status);
    }

    if (request.method === 'GET') {
      const r = await room(code).fetch('https://do/take?token=' + encodeURIComponent(url.searchParams.get('token') || ''));
      return r.status === 200 ? reply(200, await r.json()) : reply(r.status);
    }
    return reply(405, { error: 'method not allowed' });
  },
};

// One small room per code.
export class Pair {
  constructor(state) { this.storage = state.storage; }

  async fetch(request) {
    const url = new URL(request.url);
    const rec = await this.storage.get('rec');
    const live = rec && rec.exp > Date.now();

    if (url.pathname === '/init') {
      if (live) return new Response(null, { status: 409 });
      const { token } = await request.json();
      const exp = Date.now() + TTL * 1000;
      await this.storage.put('rec', { token, exp, data: null });
      await this.storage.setAlarm(exp);
      return new Response(null, { status: 201 });
    }
    if (!live) return new Response(null, { status: 404 });

    if (url.pathname === '/data') {
      if (rec.data) return new Response(null, { status: 409 });
      rec.data = await request.json();
      await this.storage.put('rec', rec);
      return new Response(null, { status: 204 });
    }
    if (url.pathname === '/take') {
      if (url.searchParams.get('token') !== rec.token) return new Response(null, { status: 403 });
      if (!rec.data) return new Response(null, { status: 204 });
      await this.storage.deleteAll();
      return new Response(JSON.stringify(rec.data), { status: 200 });
    }
    return new Response(null, { status: 404 });
  }

  async alarm() { await this.storage.deleteAll(); }
}
