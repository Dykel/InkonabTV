// Copies the web player (the files the website serves) into desktop/www.
// --store: the Microsoft Store version's config, a pure player like the Google Play version
// (no built-in server, free playlists, VPN or self-updates).
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const out = join(here, 'www');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const f of ['index.html', 'config.js', 'manifest.webmanifest', 'icon.svg', 'logo1.svg', 'assets', 'icons'])
  cpSync(join(root, f), join(out, f), { recursive: true });
console.log('Web player copied to desktop/www');

if (process.argv.includes('--store')) {
  const cfg = readFileSync(join(out, 'config.js'), 'utf8')
    .replace(/^(\s*server:\s*)'[^']*'/m, "$1''")
    .replace(/^(\s*updateUrl:\s*)'[^']*'/m, "$1''")
    .replace(/^(\s*freePlaylists:\s*)\[[\s\S]*?\n\s*\]/m, '$1[]');
  writeFileSync(join(out, 'config.js'), cfg +
    "\n// Microsoft Store version (written by desktop/copy-web.mjs --store).\nObject.assign(window.INKONAB_CONFIG, { playerMode: true, server: '', freePlaylists: [], vpn: false, updateUrl: '' });\n");
  console.log('Microsoft Store config written');
}
