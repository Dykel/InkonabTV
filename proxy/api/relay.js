/**
 * InkonabTV HTTPS relay on Vercel (Node.js function, web-standard handler).
 *
 * Runs the Netlify Edge Function unchanged: this file only provides the `Netlify.env` it
 * reads SECRET from. The Vercel project's root is this `proxy/` folder; vercel.json maps
 * /relay and /relay/ here. See vercel.md.
 */
import relay from '../netlify/netlify/edge-functions/relay.js';

globalThis.Netlify ??= { env: { get: name => process.env[name] } };

export default { fetch: relay };
