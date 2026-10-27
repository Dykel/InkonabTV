// Samsung TV (Tizen) package: the same web app, made to run on 2018+ Samsung TVs.
//   npm run tizen            → build/tizen/ (+ InkonabTV.wgt, signed when a Tizen certificate
//                              profile is set up in Tizen Studio, see README)
// - JS is rewritten for older Chromium (Tizen 4 = Chromium 56) with esbuild, plus polyfills.
// - CSS: `inset`, clamp()/min()/max(), :focus-visible and grid `gap` are rewritten into forms
//   older engines understand; tizen/tizen.css adds AVPlay styles and other fallbacks.
// - hls.js / mpegts.js / Capacitor are left out: Samsung's AVPlay plays the streams.
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { transformSync } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'build', 'tizen');
const TARGET = 'chrome56';
const VW = 1920, VH = 1080, REM = 16; // TV viewport, used to resolve clamp()/min()/max()

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'assets', 'js'), { recursive: true });
mkdirSync(join(out, 'assets', 'css'), { recursive: true });
cpSync(join(root, 'config.js'), join(out, 'config.js'));

// ---------- JS ----------
const lower = (code, file) => transformSync(code, { target: TARGET, loader: 'js', sourcefile: file, charset: 'utf8' }).code;
writeFileSync(join(out, 'config.js'), lower(readFileSync(join(root, 'config.js'), 'utf8'), 'config.js'));
writeFileSync(join(out, 'assets/js/polyfills.js'), lower(readFileSync(join(root, 'tizen/polyfills.js'), 'utf8'), 'polyfills.js'));
for (const f of readdirSync(join(root, 'assets/js'))) {
  if (!f.endsWith('.js') || f === 'native.js') continue;
  writeFileSync(join(out, 'assets/js', f), lower(readFileSync(join(root, 'assets/js', f), 'utf8'), f));
}

// ---------- CSS ----------
const toPx = v => {
  const m = String(v).trim().match(/^(-?[\d.]+)(px|rem|vw|vh)?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return { px: n, rem: n * REM, vw: n * VW / 100, vh: n * VH / 100, undefined: n }[m[2]];
};
// Split a function's arguments on top-level commas.
const args = s => {
  const parts = []; let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; } else cur += ch;
  }
  parts.push(cur.trim());
  return parts;
};
// Replace the innermost clamp()/min()/max() repeatedly with a value old engines understand.
const resolveMath = css => {
  const re = /\b(clamp|min|max)\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g;
  let prev;
  do {
    prev = css;
    css = css.replace(re, (all, fn, inner) => {
      const a = args(inner);
      const px = a.map(toPx);
      if (px.every(v => v !== null)) {
        const v = fn === 'clamp' ? Math.min(Math.max(px[0], px[1]), px[2]) : fn === 'min' ? Math.min(...px) : Math.max(...px);
        return `${Math.round(v * 100) / 100}px`;
      }
      // Percentages / calc(): keep the "preferred" value (clamp) or the first one (min/max).
      return fn === 'clamp' ? a[1] : a[0];
    });
  } while (css !== prev);
  return css;
};
const expandInset = css => css.replace(/(^|[;{\s])inset:\s*([^;}]+)/g, (all, pre, val) => {
  const v = val.replace(/!important/, '').trim().split(/\s+/);
  const imp = /!important/.test(val) ? ' !important' : '';
  const [t, r = t, b = t, l = r] = v;
  return `${pre}top: ${t}${imp}; right: ${r}${imp}; bottom: ${b}${imp}; left: ${l}${imp}`;
});
// Grid `gap` → also `grid-gap` (Chromium 57–65 only know the prefixed name for grids).
const gridGap = css => css.replace(/\{([^{}]*)\}/g, (all, body) =>
  /display:\s*grid/.test(body) && /(^|[;\s])gap:/.test(body) ? `{${body.replace(/(^|[;\s])gap:\s*([^;}]+)/, '$1grid-gap: $2; gap: $2')}}` : all);

let css = readFileSync(join(root, 'assets/css/app.css'), 'utf8');
css = css.replace(/:focus-visible/g, ':focus'); // the remote is the only input on a TV
css = gridGap(expandInset(resolveMath(css)));
css += '\n' + readFileSync(join(root, 'tizen/tizen.css'), 'utf8');
writeFileSync(join(out, 'assets/css/app.css'), css);

// ---------- index.html ----------
let page = readFileSync(join(root, 'index.html'), 'utf8');
page = page
  .replace(/\s*<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/(hls\.js|mpegts\.js)[^"]*"><\/script>/g, '')
  .replace(/\s*<script src="assets\/js\/vendor\/capacitor\.js"><\/script>/, '')
  .replace(/\s*<script src="assets\/js\/native\.js"><\/script>/, '')
  .replace(/\s*<link rel="manifest"[^>]*>/, '')
  .replace('<script src="config.js"></script>',
    '<script src="assets/js/polyfills.js"></script>\n  <script src="$WEBAPIS/webapis/webapis.js"></script>\n  <script src="config.js"></script>')
  .replace('<script src="assets/js/api.js"></script>', '<script src="assets/js/tizen.js"></script>\n  <script src="assets/js/api.js"></script>');
writeFileSync(join(out, 'index.html'), page);

// ---------- config.xml + icon ----------
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
writeFileSync(join(out, 'config.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<widget xmlns="http://www.w3.org/ns/widgets" xmlns:tizen="http://tizen.org/ns/widgets" id="http://inkonab.tv/InkonabTV" version="${pkg.version}" viewmodes="maximized">
    <tizen:application id="InkonabTV1.InkonabTV" package="InkonabTV1" required_version="2.3"/>
    <content src="index.html"/>
    <feature name="http://tizen.org/feature/screen.size.normal.1080.1920"/>
    <icon src="icon.png"/>
    <name>InkonabTV</name>
    <description>InkonabTV — Live TV, movies and series</description>
    <tizen:profile name="tv-samsung"/>
    <tizen:privilege name="http://tizen.org/privilege/internet"/>
    <tizen:privilege name="http://tizen.org/privilege/tv.inputdevice"/>
    <tizen:privilege name="http://developer.samsung.com/privilege/network.public"/>
    <tizen:privilege name="http://developer.samsung.com/privilege/avplay"/>
    <tizen:setting screen-orientation="landscape" context-menu="disable" background-support="disable" encryption="disable" install-location="auto" hwkey-event="enable"/>
    <access origin="*" subdomains="true"/>
</widget>
`);
copyFileSync(join(root, 'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png'), join(out, 'icon.png'));
console.log('Samsung TV app built in build/tizen');

// ---------- package (.wgt) ----------
const tizen = join(process.env.TIZEN_STUDIO || join(homedir(), 'tizen-studio'), 'tools/ide/bin/tizen');
if (existsSync(tizen)) {
  // Certificate profile: $TIZEN_PROFILE, else one named like "InkonabTV" (any case), else the active one.
  const listing = execFileSync(tizen, ['security-profiles', 'list'], { encoding: 'utf8' });
  const rows = listing.split('\n').map(l => l.trim().match(/^(\S+)\s+(O|X)?\s*$/)).filter(Boolean).filter(m => m[1] !== '[Profile');
  const pick = process.env.TIZEN_PROFILE || (rows.find(m => /^inkonab/i.test(m[1])) || rows.find(m => m[2] === 'O') || [])[1];
  if (!pick) {
    console.log('Not packaged: create a Samsung certificate profile first (README → Samsung TV).');
  } else {
    execFileSync(tizen, ['package', '-t', 'wgt', '-s', pick, '--', out], { stdio: 'inherit' });
    console.log(`Signed package: build/tizen/InkonabTV.wgt (certificate profile "${pick}")`);
  }
} else {
  console.log('Tizen Studio not found: install it to sign and install the package (README → Samsung TV).');
}
