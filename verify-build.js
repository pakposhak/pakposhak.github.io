/* PakPoshak — post-build integrity checks.
 *
 * Run automatically at the end of build.ps1 (and standalone: `node verify-build.js`).
 * Every check here corresponds to a real production incident — if a check fails,
 * the build is BROKEN and must not be deployed. Exits non-zero on any failure.
 *
 * History these guard against (2026-06-30 stuck-overlay saga):
 *  - `[hidden]` overridden by a class `display:` rule  → full-screen overlay stuck on every load
 *  - UTF-8 BOM prepended to HTML                        → quirks mode / blank render on mobile
 *  - unversioned app.js src                             → updates never reached cached clients
 */
const fs = require('fs');
const path = require('path');

const base = __dirname;
const read = (f) => fs.readFileSync(path.join(base, f));
const readText = (f) => read(f).toString('utf8');

const failures = [];
const ok = [];
function check(name, cond, detail) {
  if (cond) ok.push(name);
  else failures.push(name + (detail ? '  — ' + detail : ''));
}

// 1) The `hidden` attribute must always win over author `display:` rules.
//    Without this, .ps-vis-load{display:flex} (and any future one) renders a
//    [hidden] element full-screen. THE bug that froze the app on "Finding your size".
const css = readText('style.css');
check('[hidden] global guard present', /\[hidden\]\{display:none!important\}/.test(css),
  'add  [hidden]{display:none!important}  to style.src.css');

// 2) HTML must NOT start with a UTF-8 BOM (EF BB BF) — breaks rendering on some mobiles.
for (const f of ['index.html', 'order-form.html']) {
  const b = read(f);
  check(`${f} has no BOM`, !(b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF),
    'build.ps1 must write UTF-8 without BOM');
}

// 3) HTML must reference app.js + style.css with a ?b=<build> version (one-reopen updates).
for (const f of ['index.html', 'order-form.html']) {
  const h = readText(f);
  check(`${f} versions app.js`, /app\.js\?b=20\d\d-\d\d-\d\d/.test(h), 'expected app.js?b=<build>');
  check(`${f} versions style.css`, /style\.css\?b=20\d\d-\d\d-\d\d/.test(h), 'expected style.css?b=<build>');
  check(`${f} has no leftover __PSB_BUILD__ token`, !h.includes('__PSB_BUILD__'),
    'build.ps1 substitution did not run');
}

// 4) Build/version stamps must be present and consistent.
const appjs = readText('app.js');

// 3b) The fit-size data must have been injected (placeholder string replaced with the object).
check('fit sizes injected (no placeholder left)', !appjs.includes('FITSIZES_PLACEHOLDER'),
  'build.ps1 did not replace "FITSIZES_PLACEHOLDER" from fit-sizes.json');
check('fit sizes object present', /PS_FIT_SIZES\s*=\s*\{/.test(appjs));

const mBuild = appjs.match(/PSB_BUILD\s*=\s*["']([^"']+)["']/);
check('app.js has PSB_BUILD', !!mBuild);
const sw = readText('sw.js');
check('sw.js has CACHE_VERSION', /CACHE_VERSION\s*=\s*['"]psb-v\d+['"]/.test(sw));

// 4b) The build tag baked into the HTML asset URLs must match app.js PSB_BUILD.
if (mBuild) {
  const tag = mBuild[1];
  check('index.html build tag matches app.js', readText('index.html').includes('app.js?b=' + tag),
    `index.html should reference app.js?b=${tag}`);
}

// ── report ──
console.log('PakPoshak build verification');
for (const n of ok) console.log('  [ok]   ' + n);
for (const n of failures) console.log('  [FAIL] ' + n);
if (failures.length) {
  console.error(`\nBUILD VERIFY FAILED: ${failures.length} check(s). Do NOT deploy.`);
  process.exit(1);
}
console.log(`\nAll ${ok.length} checks passed.`);
