# Video relay on a rented server (VPS)

Live on Kamatera (Amsterdam, Ubuntu 24.04, 1 CPU / 1 GB / 20 GB, server name `inkonab-relay`):
**https://185-229-224-187.sslip.io/relay**

Same relay code as Netlify (`../netlify/netlify/edge-functions/relay.js`), run by Node 22
(`server.mjs`) behind Caddy, which gets and renews the HTTPS certificate for the free
`<ip-with-dashes>.sslip.io` name. The SECRET lives only on the server in `/etc/inkonab-relay.env`.

Install or update from this Mac (root SSH with this Mac's key; unlock it first with
`ssh-add --apple-use-keychain ~/.ssh/id_ed25519` if it asks for the passphrase):

```bash
proxy/vps/deploy.sh 185.229.224.187
```

Check on the server: `ssh root@185.229.224.187 systemctl status inkonab-relay caddy`.

Billing: Kamatera's 30-day trial only allows hourly billing ($0.005/hour, traffic $0.01 per GB).
After the trial, switch the server to monthly ($4/month with 5,000 GB of traffic included) in
Kamatera → My Cloud → Servers → inkonab-relay.

The same script works on any Ubuntu 24.04 server (Hetzner, OVH, IONOS…).
