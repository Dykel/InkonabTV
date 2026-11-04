// Desktop app release for the in-app updater (desktop/updater.js). Windows: release/windows/
// inkonabtv.exe + windows.json; Mac: release/mac/inkonabtv.dmg + mac.json (both built there).
// Publish the installer as a GitHub release (tag windows-v<version> / mac-v<version>) and upload
// the .json to the update site (config.js → updateUrl), next to version.json — the installers
// are too big for the site itself.
// Release notes: release/windows-notes.txt / release/mac-notes.txt (one line per change).
// Run with `npm run release:windows` or `npm run release:mac` in desktop/ (builds first).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const mac = process.argv[2] === 'mac';
const os = mac ? 'mac' : 'windows';
const root = join(import.meta.dirname, '..');
const versionName = JSON.parse(readFileSync(join(root, 'desktop/package.json'), 'utf8')).version;
const versionCode = versionName.split('.').map(Number).reduce((n, x) => n * 100 + (x || 0), 0); // as updater.js
const out = join(root, 'release', os);
const name = mac ? 'inkonabtv.dmg' : 'inkonabtv.exe';
const built = join(out, name);
if (!existsSync(built)) throw new Error(`Build the installer first: npm run release:${os} (in desktop/)`);

const bytes = readFileSync(built);
const notesFile = join(root, `release/${os}-notes.txt`);
const notes = existsSync(notesFile) ? readFileSync(notesFile, 'utf8').trim() : '';
const tag = `${os}-v${versionName}`;
const info = {
  versionCode, versionName,
  url: `https://github.com/Dykel/InkonabTV/releases/download/${tag}/${name}`,
  sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length, notes,
};
writeFileSync(join(out, `${os}.json`), JSON.stringify(info, null, 2) + '\n');
const product = mac ? 'InkonabTV for Mac' : 'InkonabTV for Windows';
console.log(`${product} ${versionName} (code ${versionCode}), ${(bytes.length / 1048576).toFixed(1)} MB`);
console.log(`1. GitHub release ${tag} with release/${os}/${name}:`);
console.log(`   gh release create ${tag} "release/${os}/${name}" --title "${product} ${versionName}" --notes-file release/${os}-notes.txt`);
console.log(`2. Upload release/${os}/${os}.json to the update site, next to version.json.`);
