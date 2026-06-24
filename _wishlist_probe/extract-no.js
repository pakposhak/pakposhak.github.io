/* Extract the brands censused "no" from WISHLIST-CAPTURE.md, join to hosts, and write
 * re-probe batch files (rebatches/) so agents can check them for alt-named save features. */
const fs = require('fs');
const path = require('path');
const md = fs.readFileSync(path.join(__dirname, '..', 'WISHLIST-CAPTURE.md'), 'utf8');
const H = require('../_audit_tmp/brandhost.json');

const pairs = [];
md.split('\n').forEach((line) => {
  if (!line.startsWith('|') || /---/.test(line)) return;
  const cells = line.split('|').map((s) => s.trim()).filter((s) => s !== '');
  for (let i = 0; i + 1 < cells.length; i += 2) {
    const n = cells[i], s = cells[i + 1];
    if (/^(YES\*?|no)$/.test(s)) pairs.push([n, s]);
  }
});
const no = pairs.filter(([, s]) => s === 'no').map(([n]) => n);
const norm = (x) => x.replace(/\s+/g, ' ').trim().toLowerCase();
const hostKeys = Object.keys(H);
const matched = [], unmatched = [];
no.forEach((n) => {
  const k = hostKeys.find((k) => norm(k) === norm(n));
  if (k) matched.push([k, H[k]]); else unmatched.push(n);
});
console.log('parsed pairs:', pairs.length, '| YES:', pairs.filter((p) => /YES/.test(p[1])).length, '| no:', no.length);
console.log('matched hosts:', matched.length, '| unmatched:', JSON.stringify(unmatched));

fs.mkdirSync(path.join(__dirname, 'rebatches'), { recursive: true });
const N = 5, per = Math.ceil(matched.length / N);
for (let i = 0; i < N; i++) {
  const slice = matched.slice(i * per, (i + 1) * per);
  if (slice.length) fs.writeFileSync(path.join(__dirname, 'rebatches', 'rb' + i + '.txt'), slice.map(([n, h]) => n + ' | ' + h).join('\n'));
}
console.log('wrote up to', N, 'rebatches, ~' + per + ' brands each');
