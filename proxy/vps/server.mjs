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

const PORT = Number(process.env.FC_SERVER_PORT || process.env.FC_CUSTOM_LISTEN_PORT || process.env.PORT || (process.env.FC_FUNCTION_NAME ? 9000 : 8080));
const HOST = process.env.HOST || (process.env.FC_FUNCTION_NAME ? '0.0.0.0' : '127.0.0.1');

http.createServer(async (req, res) => {
  const path = (req.url || '/').split('?')[0];
  if (path !== '/relay' && path !== '/relay/') {
    res.writeHead(path === '/' ? 200 : 404, { 'Content-Type': 'text/plain' });
    return res.end('InkonabTV relay. The relay address is /relay on this site.');
  }
  // PROTO=https where the platform in front doesn't say (Alibaba Function Compute).
  const proto = process.env.PROTO || req.headers['x-forwarded-proto'] || (process.env.FC_FUNCTION_NAME ? 'https' : 'http');
  const url = `${proto}://${req.headers.host}${req.url}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);

  let out;
  try {
    out = await relay(new Request(url, { method: req.method, headers }));
  } catch (e) {
    res.writeHead(502, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
    return res.end('Relay error: ' + e);
  }
  // Which kind of client and the answer only (never the address: it holds the viewer's login).
  const ua = req.headers['user-agent'] || '';
  const client = /Tizen|SMART-TV|SmartTV/i.test(ua) ? 'samsung-tv' : /Android/i.test(ua) ? 'android' : 'browser';
  console.log('client', client, req.method, out.status);
  res.writeHead(out.status, Object.fromEntries(out.headers));
  if (!out.body || req.method === 'HEAD') return res.end();
  // Destroying the stream cancels the provider download (a live channel never ends on its own).
  const body = Readable.fromWeb(out.body);
  body.on('error', () => res.destroy());
  res.on('close', () => body.destroy());
  body.pipe(res);
}).listen(PORT, HOST, () => console.log(`InkonabTV relay on ${HOST}:${PORT}`));
