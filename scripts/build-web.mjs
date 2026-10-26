// Copies the web app (the same files GitHub Pages serves) into build/www for the Android app.
import { cpSync, rmSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'build', 'www');
const files = ['index.html', 'config.js', 'manifest.webmanifest', 'assets'];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const f of files) cpSync(join(root, f), join(out, f), { recursive: true });
console.log('Web app copied to build/www');
