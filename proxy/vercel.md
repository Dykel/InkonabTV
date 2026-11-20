# Video relay on Vercel

Live at **https://inkonab-relay.vercel.app/relay** (Vercel project `inkonab-relay`).

It runs the same code as the Netlify relay (`netlify/netlify/edge-functions/relay.js`):
`api/relay.js` only passes it the `SECRET` environment variable. The Vercel project's root is
this `proxy/` folder: `vercel.json` maps `/relay` and `/relay/` to the function, and
`.vercelignore` keeps everything else here (alwaysdata, Cloudflare, `.env.local`) from being uploaded.

Deploy again after changing the relay code (this folder is linked to the project already):

```bash
cd proxy && npx vercel@latest deploy --prod --yes
```

- **SECRET** is set for Production and Preview as a sensitive variable (nobody can read it back).
  To change it: `npx vercel@latest env rm SECRET production`, add a new one with
  `npx vercel@latest env add SECRET production --sensitive`, then deploy again.
- **Free (Hobby) plan:** for personal, non-commercial use, with a monthly bandwidth allowance.
  Check usage in the Vercel dashboard.
- **Logs:** Vercel → inkonab-relay → **Logs**. They show host and status only.
- If the provider refuses Vercel's servers, the logs show `playlist fresh … 403`. In that case
  use the alwaysdata or Netlify relay.
