// Copies the web player (the files the website serves) into desktop/www.
import { cpSync, rmSync, mkdirSync } from 'node:fs';
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
