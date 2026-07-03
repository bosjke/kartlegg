#!/usr/bin/env node
/* Coverage report for the incremental naming effort (brief §10).
   Shows which countries/provinces/cities still lack Norwegian / native names.
   Usage: node scripts/coverage-report.mjs [--list]                            */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const listMode = process.argv.includes('--list');

const countries = read('data/countries.json');
const cities = read('data/cities.json');
const manifest = read('data/names/index.json');
const merge = (files) => {
  const out = {};
  for (const f of files || []) {
    try { Object.assign(out, read(path.join('data', f))); } catch { console.warn('missing batch:', f); }
  }
  delete out.comment;
  return out;
};
const noCapitals = merge(manifest.no_capitals);
const noCities = merge(manifest.no_cities);

const recs = Object.values(countries);
const pct = (a, b) => b ? Math.round(100 * a / b) + '%' : '—';

/* country names */
const noName = recs.filter(r => !r.name_no);
const noNative = recs.filter(r => !r.name_native);
console.log(`Country names (no):      ${recs.length - noName.length}/${recs.length}  (${pct(recs.length - noName.length, recs.length)})`);
console.log(`Country endonyms:        ${recs.length - noNative.length}/${recs.length}  (${pct(recs.length - noNative.length, recs.length)})`);
if (listMode && noName.length) console.log('  missing no:', noName.map(r => r.key).join(', '));

/* capitals */
const withCap = recs.filter(r => r.capital && r.capital.name_en);
const capNo = withCap.filter(r => noCapitals[r.key] || r.capital.name_no);
console.log(`Capital names (no):      ${capNo.length}/${withCap.length}  (${pct(capNo.length, withCap.length)})  ← batches in data/names/`);
if (listMode) console.log('  still English:', withCap.filter(r => !(noCapitals[r.key] || r.capital.name_no)).map(r => `${r.key}:${r.capital.name_en}`).join(', '));

/* cities */
let cityTotal = 0, cityNo = 0; const missCities = [];
for (const [k, arr] of Object.entries(cities)) {
  for (const c of arr) {
    cityTotal++;
    if (noCities[`${k}:${c.n}`]) cityNo++; else missCities.push(`${k}:${c.n}`);
  }
}
console.log(`City names (no):         ${cityNo}/${cityTotal}  (${pct(cityNo, cityTotal)})`);
if (listMode) console.log('  still English/native:', missCities.slice(0, 80).join(', '), missCities.length > 80 ? `… +${missCities.length - 80} more` : '');

/* provinces: native name_local coverage */
const prov = read('data/provinces.geojson').features;
const withLocal = prov.filter(f => f.properties.nl && f.properties.nl.trim());
console.log(`Province native names:   ${withLocal.length}/${prov.length}  (${pct(withLocal.length, prov.length)})  (fallback: name → name_en, never blank)`);
if (listMode) {
  const perC = {};
  for (const f of prov) if (!f.properties.nl) perC[f.properties.c] = (perC[f.properties.c] || 0) + 1;
  console.log('  missing name_local per country:', Object.entries(perC).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, n]) => `${k}:${n}`).join(', '), '…');
}
