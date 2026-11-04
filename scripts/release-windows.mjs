// Windows app release for the in-app updater (desktop/updater.js): copies the installer to
// release/windows/inkonabtv.exe (built there) and writes release/windows/windows.json next to it.
// Publish the installer as a GitHub release (tag windows-v<version>) and upload windows.json to
// the update site (config.js → updateUrl) — the installer is too big for the site itself.
// Release notes: release/windows-notes.txt (one line per change), if present.
// Run with `npm run release:windows` in desktop/ (builds the installer first).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const versionName = JSON.parse(readFileSync(join(root, 'desktop/package.json'), 'utf8')).version;
const versionCode = versionName.split('.').map(Number).reduce((n, x) => n * 100 + (x || 0), 0); // as updater.js
const out = join(root, 'release/windows');
const built = join(out, 'inkonabtv.exe');
if (!existsSync(built)) throw new Error('Build the installer first: npm run release:windows (in desktop/)');

const name = 'inkonabtv.exe';
const bytes = readFileSync(built);
const notesFile = join(root, 'release/windows-notes.txt');
const notes = existsSync(notesFile) ? readFileSync(notesFile, 'utf8').trim() : '';
const tag = `windows-v${versionName}`;
const info = {
  versionCode, versionName,
  url: `https://github.com/Dykel/InkonabTV/releases/download/${tag}/${name}`,
  sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length, notes,
};
writeFileSync(join(out, 'windows.json'), JSON.stringify(info, null, 2) + '\n');
console.log(`InkonabTV for Windows ${versionName} (code ${versionCode}), ${(bytes.length / 1048576).toFixed(1)} MB`);
console.log(`1. GitHub release ${tag} with release/windows/${name}:`);
console.log(`   gh release create ${tag} "release/windows/${name}" --title "InkonabTV for Windows ${versionName}" --notes-file release/windows-notes.txt`);
console.log(`2. Upload release/windows/windows.json to the update site, next to version.json.`);
