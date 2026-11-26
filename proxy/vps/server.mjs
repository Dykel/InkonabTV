/**
 * InkonabTV HTTPS relay on a small rented server (VPS).
 *
 * Runs the Netlify Edge Function unchanged under Node 22: this file turns Node's HTTP requests
 * into web Requests, passes SECRET as `Netlify.env`, and streams the answer back. Caddy sits in
 * front for HTTPS (see Caddyfile and setup.sh here). Listens on 127.0.0.1:8080 by default.
 * Also runs Alibaba Cloud Function Compute (../alibaba), with HOST=0.0.0.0 PORT=9000.
 */
import http from 'node:http';
import { Readable } from 'node:stream';

// SECRET from the environment, or from a `secret` file next to this one (Alibaba console upload).
import { readFileSync } from 'node:fs';
const fileSecret = (() => { try { return readFileSync(new URL('./secret', import.meta.url), 'utf8').trim(); } catch { return ''; } })();
globalThis.Netlify ??= { env: { get: name => process.env[name] || (name === 'SECRET' ? fileSecret : undefined) } };
const { default: relay } = await import('./relay.js');
// Smooth live TV: live channels asked as HLS get several qualities (smooth.mjs).
const { relayLive, relayOther, serveSmooth } = await import('./smooth.mjs');

const PORT = Number(process.env.FC_SERVER_PORT || process.env.FC_CUSTOM_LISTEN_PORT || process.env.PORT || (process.env.FC_FUNCTION_NAME ? 9000 : 8080));
const HOST = process.env.HOST || (process.env.FC_FUNCTION_NAME ? '0.0.0.0' : '127.0.0.1');

http.createServer(async (req, res) => {
  const path = (req.url || '/').split('?')[0];
  if (path.startsWith('/smooth/')) return serveSmooth(req, res).catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); });
  if (path !== '/relay' && path !== '/relay/') {
    res.writeHead(path === '/' ? 200 : 404, { 'Content-Type': 'text/plain' });
    return res.end('InkonabTV relay. The relay address is /relay on this site.');
  }
  // PROTO=https where the platform in front doesn't say (Alibaba Function Compute).
  const proto = process.env.PROTO || req.headers['x-forwarded-proto'] || (process.env.FC_FUNCTION_NAME ? 'https' : 'http');
  const url = `${proto}://${req.headers.host}${req.url}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);

  const target0 = new URL(url).searchParams.get('url') || '';
  try { if (await relayLive(req, res, target0)) return; relayOther(target0); } catch (e) { console.log('smooth error', e.message); }

  let out;
  try {
    out = await relay(new Request(url, { method: req.method, headers }));
  } catch (e) {
    res.writeHead(502, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
    return res.end('Relay error: ' + e);
  }
  // Which client, what kind of request, the answer and how much was sent; never the address
  // (it holds the viewer's login).
  const ua = req.headers['user-agent'] || '';
  const client = /Tizen|SMART-TV|SmartTV/i.test(ua) ? 'samsung-tv' : /Android/i.test(ua) ? 'android' : 'browser';
  const target = new URL(url).searchParams.get('url') || '';
  const kind = /player_api/.test(target) ? 'api' : /xmltv/.test(target) ? 'guide' : /get\.php/.test(target) ? 'm3u'
    : /\.m3u8/.test(target) ? 'hls-playlist' : /\/live\//.test(target) ? 'live' : /\/movie\//.test(target) ? 'movie'
    : /\/series\//.test(target) ? 'episode' : /\.ts(\?|$)/.test(target) ? 'segment' : 'other';
  const t0 = Date.now();
  let sent = 0;
  const done = why => console.log('client', client, kind, req.method, out.status, (out.headers.get('content-type') || '-').split(';')[0],
    Math.round(sent / 1024) + 'KB', ((Date.now() - t0) / 1000).toFixed(1) + 's', why);
  res.writeHead(out.status, Object.fromEntries(out.headers));
  if (!out.body || req.method === 'HEAD') { done('no-body'); return res.end(); }
  // Destroying the stream cancels the provider download (a live channel never ends on its own).
  const body = Readable.fromWeb(out.body);
  body.on('data', c => { sent += c.length; });
  body.on('error', e => { done('upstream-error ' + (e.code || e.message)); res.destroy(); });
  body.on('end', () => done('ended'));
  res.on('close', () => { if (!body.readableEnded) done('viewer-closed'); body.destroy(); });
  body.pipe(res);
}).listen(PORT, HOST, () => console.log(`InkonabTV relay on ${HOST}:${PORT}`));
