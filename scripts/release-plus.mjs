// InkonabTV+ release for the in-app updater: copies the signed sideload APK to
// release/plus/inkonabtv.apk and writes release/plus/version.json next to it. Upload both files
// to the update site (config.js → updateUrl), replacing the old ones.
// Release notes: release/plus-notes.txt (one line per change), if present.
// Run with `npm run release:plus` (builds the APK first).
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const gradle = readFileSync(join(root, 'android/app/build.gradle'), 'utf8');
const versionCode = Number(gradle.match(/versionCode (\d+)/)[1]);
const versionName = gradle.match(/versionName "([^"]+)"/)[1];
const apk = join(root, 'android/app/build/outputs/apk/full/release/app-full-release.apk');
if (!existsSync(apk)) throw new Error('Build the sideload APK first: npm run release:plus');

const out = join(root, 'release/plus');
mkdirSync(out, { recursive: true });
copyFileSync(apk, join(out, 'inkonabtv.apk'));
copyFileSync(apk, join(root, `release/InkonabTV-plus-${versionName}.apk`));
const bytes = readFileSync(apk);
const notesFile = join(root, 'release/plus-notes.txt');
const notes = existsSync(notesFile) ? readFileSync(notesFile, 'utf8').trim() : '';
const info = { versionCode, versionName, sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length, notes };
writeFileSync(join(out, 'version.json'), JSON.stringify(info, null, 2) + '\n');
console.log(`InkonabTV+ ${versionName} (code ${versionCode}), ${(bytes.length / 1048576).toFixed(1)} MB`);
console.log(`Upload both files from release/plus/ to the update site:\n  inkonabtv.apk\n  version.json`);
