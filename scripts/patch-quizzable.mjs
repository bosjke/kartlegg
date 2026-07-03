/* Marks each record in data/countries.json as quizzable or territory.
   Quizzable = UN members + Vatican + the unrecognized/de-facto states
   (Kosovo, Palestine, Taiwan, Western Sahara, N. Cyprus, Somaliland,
   Abkhazia, S. Ossetia, Transnistria). Everything else (dependencies,
   overseas territories, Antarctica) gets territory: true and is drawn
   on the map only as non-interactive backdrop.
   Usage: node scripts/patch-quizzable.mjs */
import fs from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname;
const countriesPath = ROOT + 'data/countries.json';

const meta = JSON.parse(fs.readFileSync(ROOT + 'data/_raw/country-metadata.json', 'utf8'));
const byIso2 = {};
for (const m of meta) byIso2[m.cca2.toUpperCase()] = m;

const countries = JSON.parse(fs.readFileSync(countriesPath, 'utf8'));

/* Fix continent oddities from NE's "Seven seas (open ocean)" bucket. */
const CONTINENT_FIX = { SYC: 'Africa', MUS: 'Africa', MDV: 'Asia' };
for (const [k, cont] of Object.entries(CONTINENT_FIX)) {
  if (countries[k]) countries[k].continent = cont;
}

/* Some NE sub-units share a sovereign's ISO2 (e.g. "Indian Ocean Territories"
   carries au). Per ISO2, only one record may claim the metadata match:
   exact ADM0_A3 == cca3 wins, otherwise the largest by area. */
const groups = {};
for (const key of Object.keys(countries)) {
  const r = countries[key];
  if (!r.iso2) continue;
  const iso = String(r.iso2).toUpperCase();
  (groups[iso] = groups[iso] || []).push(r);
}
const claims = {}; // iso2 → winning key
for (const [iso, recs] of Object.entries(groups)) {
  const m = byIso2[iso];
  if (!m) continue;
  const exact = recs.find(r => r.key === m.cca3);
  const win = exact || recs.slice().sort((a, b) => (b.area_km2 || 0) - (a.area_km2 || 0))[0];
  claims[iso] = win.key;
}

let quiz = 0, terr = 0;
const terrNames = [];
for (const key of Object.keys(countries)) {
  const r = countries[key];
  const iso = r.iso2 ? String(r.iso2).toUpperCase() : null;
  const m = iso && claims[iso] === key ? byIso2[iso] : null;
  const ok = !!r.unrecognized || (m && (m.independent === true || m.unMember === true));
  if (ok) { delete r.territory; quiz++; }
  else { r.territory = true; terr++; terrNames.push(key + ':' + r.name_en); }
}

/* Common short forms people actually type. */
const EXTRA_ALIASES = {
  BIH: ['Bosnia'], TTO: ['Trinidad'], VCT: ['Saint Vincent'], KNA: ['Saint Kitts'],
  ATG: ['Antigua'], STP: ['Sao Tome'], ARE: ['Emirates']
};
for (const [k, extra] of Object.entries(EXTRA_ALIASES)) {
  const r = countries[k];
  if (!r) continue;
  r.aliases = r.aliases || [];
  for (const a of extra) if (!r.aliases.includes(a)) r.aliases.push(a);
}

fs.writeFileSync(countriesPath, JSON.stringify(countries));
console.log('quizzable:', quiz, ' territories:', terr);
console.log('territories:', terrNames.join(', '));
