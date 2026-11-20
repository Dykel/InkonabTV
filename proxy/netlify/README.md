# Video relay on Netlify

Same relay as `../alwaysdata/index.php` and `../worker.js`, written as a Netlify Edge Function
(`netlify/edge-functions/relay.js`). It streams video straight through, so there is no size limit
per segment. The relay address is `https://<your-site>.netlify.app/relay`.

Netlify's drag-and-drop deploy only uploads static files, not edge functions, so deploy with the
Netlify CLI (run these in this folder, `proxy/netlify`):

```bash
npx netlify-cli login
npx netlify-cli sites:create --name inkonab-relay
npx netlify-cli link --name inkonab-relay
npx netlify-cli env:set SECRET "$(openssl rand -hex 24)"
npx netlify-cli deploy --prod
```

`sites:create` asks for a team and fails if the name is taken. Pick another name, such as
`inkonab-relay-2`, and use that same name in `link`.

Check it: `https://inkonab-relay.netlify.app/relay` should answer `InkonabTV relay is running.`
Then paste `https://inkonab-relay.netlify.app/relay` into **Settings → HTTPS relay URL** in the app
and press **Test**, or put it in `relay:` in `config.js`.

Notes:

- **SECRET** signs the segment addresses inside playlists so strangers can't use the relay as an
  open proxy. Without it the relay answers "Relay not set up". After changing it, deploy again.
- **Free plan limits:** video counts against the bandwidth in your Netlify plan. One hour of HD is
  roughly 1–3 GB, so the free plan covers a limited number of viewing hours each month. Check
  usage under **Team → Usage & billing**, and check that Netlify's terms allow video for your use.
- **Logs:** Netlify → your site → **Logs → Edge Functions**. Entries show host and status only.
  Paths contain the viewer's login, so they are never logged.
- If the provider refuses Netlify's servers (the way it refuses Cloudflare), the logs show
  `playlist fresh … 403`. In that case keep using the alwaysdata relay.
