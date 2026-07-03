#!/usr/bin/env node
/**
 * build-data.mjs — one-time downloader + normalizer for the offline World Map Quiz.
 *
 * Downloads (into data/_raw, kept) and normalizes into:
 *   data/countries.json      normalized country records (names, capital, aliases, flags, micro flag, anchor)
 *   data/countries.geojson   country outlines (Natural Earth 50m + de-facto states from disputed areas)
 *   data/provinces.geojson   admin-1 outlines (Natural Earth 10m, name_local kept)
 *   data/cities.json         top-5 cities per country (by population)
 *   data/flags/*.svg         one flag per country
 * and sets up vendor/leaflet + vendor/turf from npm tarballs.
 *
 * Every dataset has a PRIMARY source (the one named in the project brief) and one or more
 * FALLBACK mirrors (GitHub / npm). If the primary is unreachable (offline mirror-only
 * environments, moved URLs), the script automatically resolves the equivalent file from a
 * fallback and records which source was used in data/_raw/build-report.json.
 *
 * Usage:  node scripts/build-data.mjs           (run from the project root or scripts/)
 * Env:    NE_DETAIL=10m  → use 10m country geometry instead of 50m
 *         SIMPLIFY=0.02  → optional turf.simplify tolerance for provinces (default: off)
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DATA = path.join(ROOT, 'data');
const RAW = path.join(DATA, '_raw');
const FLAGS = path.join(DATA, 'flags');
const VENDOR = path.join(ROOT, 'vendor');
for (const d of [DATA, RAW, FLAGS, VENDOR]) fs.mkdirSync(d, { recursive: true });

const report = { sources: {}, warnings: [], skipped: [], counts: {} };
const warn = (m) => { report.warnings.push(m); console.warn('  ! ' + m); };

/* ---------------------------------------------------------------- download */
function curl(u, dest, { timeout = 120 } = {}) {
  execFileSync('curl', ['-fsSL', '--retry', '2', '--retry-delay', '1',
    '--connect-timeout', '10', '--max-time', String(timeout), '-o', dest, u],
    { stdio: ['ignore', 'ignore', 'pipe'] });
}
/** Try each source in order; keep the raw file; remember which source won. */
function fetchRaw(label, rawName, sources, opts) {
  const dest = path.join(RAW, rawName);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    console.log(`= ${label}: already in data/_raw (${rawName})`);
    report.sources[label] = report.sources[label] || 'cached: ' + rawName;
    return dest;
  }
  for (const src of sources) {
    try {
      process.stdout.write(`> ${label}: ${src}\n`);
      curl(src, dest, opts);
      report.sources[label] = src;
      return dest;
    } catch (e) {
      warn(`${label}: source unreachable, trying fallback — ${src}`);
      try { fs.rmSync(dest, { force: true }); } catch {}
    }
  }
  throw new Error(`All sources failed for ${label}`);
}

/* ------------------------------------------------------------------ vendor */
function vendorFromNpm(label, tgzUrl, pick) {
  const tgz = path.join(RAW, label + '.tgz');
  if (!fs.existsSync(tgz)) curl(tgzUrl, tgz);
  const tmp = fs.mkdtempSync(path.join(RAW, 'x-'));
  execFileSync('tar', ['-xzf', tgz, '-C', tmp]);
  pick(path.join(tmp, 'package'));
  fs.rmSync(tmp, { recursive: true, force: true });
  report.sources['vendor:' + label] = tgzUrl;
}
function setupVendor() {
  const leafletDir = path.join(VENDOR, 'leaflet');
  if (!fs.existsSync(path.join(leafletDir, 'leaflet.js'))) {
    vendorFromNpm('leaflet', 'https://registry.npmjs.org/leaflet/-/leaflet-1.9.4.tgz', (pkg) => {
      fs.mkdirSync(leafletDir, { recursive: true });
      fs.cpSync(path.join(pkg, 'dist'), leafletDir, { recursive: true });
    });
    console.log('vendor/leaflet ready');
  }
  const turfDir = path.join(VENDOR, 'turf');
  if (!fs.existsSync(path.join(turfDir, 'turf.min.js'))) {
    vendorFromNpm('turf', 'https://registry.npmjs.org/@turf/turf/-/turf-6.5.0.tgz', (pkg) => {
      fs.mkdirSync(turfDir, { recursive: true });
      // locate the browser bundle wherever the package puts it
      const find = (dir) => {
        for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
          const p = path.join(dir, f.name);
          if (f.isDirectory()) { const r = find(p); if (r) return r; }
          else if (f.name === 'turf.min.js') return p;
        }
        return null;
      };
      const bundle = find(pkg);
      if (!bundle) throw new Error('turf.min.js not found in @turf/turf package');
      fs.copyFileSync(bundle, path.join(turfDir, 'turf.min.js'));
    });
    console.log('vendor/turf ready');
  }
}

/* ------------------------------------------------------------- geo helpers */
const P = (props, name) => { // case-insensitive property getter
  if (props == null) return undefined;
  if (name in props) return props[name];
  const lc = name.toLowerCase(), uc = name.toUpperCase();
  if (lc in props) return props[lc];
  if (uc in props) return props[uc];
  return undefined;
};
const round4 = (n) => Math.round(n * 1e4) / 1e4;
function roundCoords(c) {
  if (typeof c[0] === 'number') return [round4(c[0]), round4(c[1])];
  const out = [];
  let prev = null;
  for (const item of c) {
    const r = roundCoords(item);
    if (typeof r[0] === 'number') {
      if (prev && prev[0] === r[0] && prev[1] === r[1]) continue; // drop dupes after rounding
      prev = r;
    }
    out.push(r);
  }
  // keep rings valid (closed, >=4 points)
  if (typeof out[0]?.[0] === 'number' && out.length >= 3) {
    const a = out[0], b = out[out.length - 1];
    if (a[0] !== b[0] || a[1] !== b[1]) out.push([a[0], a[1]]);
  }
  return out;
}
const readJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const writeJSON = (p, obj) => fs.writeFileSync(p, JSON.stringify(obj));

/* =============================================================== 1. VENDOR */
setupVendor();
const require2 = createRequire(import.meta.url);
const turf = require2(path.join(VENDOR, 'turf', 'turf.min.js'));

/* ============================================================ 2. RAW FILES */
const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/';
const detail = process.env.NE_DETAIL === '10m' ? '10m' : '50m';

const countriesRawPath = fetchRaw('NE admin-0 countries', `ne_${detail}_admin_0_countries.geojson`,
  [`${NE}ne_${detail}_admin_0_countries.geojson`]);
const disputedRawPath = fetchRaw('NE disputed areas', 'ne_10m_admin_0_disputed_areas.geojson',
  [`${NE}ne_10m_admin_0_disputed_areas.geojson`]);
const admin1RawPath = fetchRaw('NE admin-1 provinces', 'ne_10m_admin_1_states_provinces.geojson',
  [`${NE}ne_10m_admin_1_states_provinces.geojson`]);
const placesRawPath = fetchRaw('NE populated places', 'ne_10m_populated_places_simple.geojson',
  [`${NE}ne_10m_populated_places_simple.geojson`]);

// Country metadata. Primary: restcountries v3.1 (as specified in the brief).
// Fallback: mledoze/countries on GitHub — the open dataset restcountries itself is built on.
const metaRawPath = fetchRaw('country metadata', 'country-metadata.json', [
  'https://restcountries.com/v3.1/all?fields=name,translations,capital,capitalInfo,cca2,cca3,region,subregion,latlng,flags,altSpellings,languages',
  'https://raw.githubusercontent.com/mledoze/countries/master/countries.json',
], { timeout: 45 });

// Norwegian (bokmål) country names, CLDR-based. Used when restcountries `translations.nob`
// is unavailable (the mledoze fallback has no Norwegian translations).
let noNamesPath = null;
try {
  noNamesPath = fetchRaw('Norwegian country names', 'country-names-nb.json', [
    'https://raw.githubusercontent.com/umpirsky/country-list/master/data/nb_NO/country.json',
    'https://raw.githubusercontent.com/umpirsky/country-list/master/data/nb/country.json',
    'https://raw.githubusercontent.com/umpirsky/country-list/master/data/no/country.json',
  ], { timeout: 30 });
} catch { warn('No Norwegian country-name source reachable; falling back to English names.'); }

// Cities. Primary: SimpleMaps World Cities Basic CSV (CC BY 4.0), as specified.
// Fallback: Natural Earth populated places (public domain), already downloaded above.
let simpleMapsCsv = null;
try {
  simpleMapsCsv = fetchRaw('SimpleMaps world cities', 'simplemaps_worldcities_basic.zip', [
    'https://simplemaps.com/static/data/world-cities/basic/simplemaps_worldcities_basicv1.77.zip',
    'https://simplemaps.com/static/data/world-cities/basic/simplemaps_worldcities_basicv1.76.zip',
  ], { timeout: 60 });
} catch { warn('SimpleMaps not reachable; using Natural Earth populated places for cities (public domain).'); }

/* ===================================================== 3. COUNTRY METADATA */
const metaRaw = readJSON(metaRawPath);
const noNames = noNamesPath ? readJSON(noNamesPath) : {};

// Normalize restcountries-v3.1 records and mledoze records into one shape.
function normMeta(r) {
  const nativeObj = r.name?.nativeName || r.name?.native || {};
  const langOrder = Object.keys(r.languages || nativeObj);
  let nativeCommon = nativeObj.nob?.common || ''; // prefer bokmål where it exists
  for (const l of langOrder) { if (nativeCommon) break; if (nativeObj[l]?.common) nativeCommon = nativeObj[l].common; }
  if (!nativeCommon) { const k = Object.keys(nativeObj)[0]; if (k) nativeCommon = nativeObj[k].common || ''; }
  const nativeAll = [...new Set(Object.values(nativeObj).flatMap(v => [v?.common, v?.official]).filter(Boolean))];
  return {
    cca2: (r.cca2 || '').toUpperCase(),
    cca3: (r.cca3 || '').toUpperCase(),
    nameEn: r.name?.common || '',
    nameOfficial: r.name?.official || '',
    nameNo: r.translations?.nob?.common || noNames[(r.cca2 || '').toUpperCase()] || '',
    nameNative: nativeCommon,
    capital: Array.isArray(r.capital) ? r.capital[0] : (r.capital || ''),
    capLatLng: r.capitalInfo?.latlng || null,
    latlng: r.latlng || null,
    region: r.region || '',
    subregion: r.subregion || '',
    alt: [...(r.altSpellings || []), ...nativeAll],
  };
}
const metaList = metaRaw.map(normMeta);
const byCca3 = Object.fromEntries(metaList.filter(m => m.cca3).map(m => [m.cca3, m]));
const byCca2 = Object.fromEntries(metaList.filter(m => m.cca2).map(m => [m.cca2, m]));

/* Hand-curated extras -------------------------------------------------- */
const NE_TO_CCA3 = { KOS: 'UNK', PSX: 'PSE', SAH: 'ESH', SDS: 'SSD' }; // NE code → dataset cca3
const NO_NAME_FIX = { PSX: 'Palestina', SAH: 'Vest-Sahara', KOS: 'Kosovo', TWN: 'Taiwan' };
const ALIAS_EXTRA = {
  USA: ['United States', 'United States of America', 'USA', 'US', 'America', 'Amerika', 'De forente stater'],
  GBR: ['UK', 'United Kingdom', 'Great Britain', 'Britain', 'Storbritannia'],
  NLD: ['Holland', 'Nederland'], CZE: ['Czechia', 'Czech Republic', 'Tsjekkia'],
  MKD: ['North Macedonia', 'Macedonia', 'Nord-Makedonia', 'Makedonia'],
  COD: ['DR Congo', 'DRC', 'Democratic Republic of the Congo', 'Congo-Kinshasa', 'Kongo-Kinshasa', 'DR Kongo'],
  COG: ['Republic of the Congo', 'Congo', 'Congo-Brazzaville', 'Kongo-Brazzaville', 'Kongo'],
  CIV: ["Ivory Coast", "Côte d'Ivoire", 'Elfenbenskysten'], MMR: ['Myanmar', 'Burma'],
  SWZ: ['Eswatini', 'Swaziland'], TLS: ['East Timor', 'Timor-Leste', 'Øst-Timor'],
  CPV: ['Cape Verde', 'Cabo Verde', 'Kapp Verde'],
  ARE: ['UAE', 'United Arab Emirates', 'Emiratene', 'De forente arabiske emirater'],
  KOR: ['South Korea', 'Sør-Korea', 'Republic of Korea'], PRK: ['North Korea', 'Nord-Korea', 'DPRK'],
  TUR: ['Turkey', 'Türkiye', 'Tyrkia'], VAT: ['Vatican', 'Vatican City', 'Vatikanet', 'Vatikanstaten', 'Holy See'],
  FSM: ['Micronesia', 'Mikronesia', 'Mikronesiaføderasjonen'],
  PSX: ['Palestine', 'Palestina', 'State of Palestine'], TWN: ['Taiwan', 'Republic of China', 'Chinese Taipei'],
  SAH: ['Western Sahara', 'Vest-Sahara', 'Sahrawi Arab Democratic Republic', 'SADR'],
  KOS: ['Kosovo', 'Republic of Kosovo'],
};

/* =========================================================== 4. GEOMETRIES */
console.log('Reading Natural Earth files…');
const neCountries = readJSON(countriesRawPath);
const neDisputed = readJSON(disputedRawPath);

const supplement = readJSON(path.join(DATA, '_supplement.json'));
const suppByKey = Object.fromEntries(supplement.map(s => [s.key, s]));

const records = {};          // key (NE ADM0_A3 or supplement key) → country record
const outFeatures = [];      // countries.geojson features

function addRecord(key, meta, feature, suppl) {
  const geometry = feature.geometry;
  let areaKm2 = 0, anchor = null;
  try {
    areaKm2 = turf.area(feature) / 1e6;
    const pt = turf.pointOnFeature(feature).geometry.coordinates;
    anchor = [round4(pt[1]), round4(pt[0])]; // [lat,lng]
  } catch { warn(`geometry helpers failed for ${key}`); }

  let continent = P(feature.properties, 'CONTINENT') || suppl?.continent || '';
  if (continent === 'Seven seas (open ocean)') continent = 'Antarctica';

  const nameEn = suppl?.name_en || meta?.nameEn || P(feature.properties, 'ADMIN') || key;
  const nameNo = suppl?.name_no || NO_NAME_FIX[key] || meta?.nameNo || '';
  const nameNative = suppl?.name_native || meta?.nameNative || '';
  const iso2 = suppl?.iso2 !== undefined ? suppl.iso2 : (meta?.cca2 ? meta.cca2.toLowerCase() : null);

  const aliases = new Set();
  for (const a of [nameEn, nameNo, nameNative, meta?.nameOfficial,
    ...(meta?.alt || []), ...(ALIAS_EXTRA[key] || []), ...(suppl?.aliases || [])]) {
    if (a && String(a).trim()) aliases.add(String(a).trim());
  }

  let capName = suppl?.capital?.name_en || meta?.capital || '';
  let capNo = suppl?.capital?.name_no || '';
  let capLL = suppl?.capital ? [suppl.capital.lat, suppl.capital.lng] : (meta?.capLatLng || null);

  records[key] = {
    key, iso2,
    name_en: nameEn, name_no: nameNo, name_native: nameNative,
    continent, subregion: meta?.subregion || suppl?.subregion || '',
    latlng: meta?.latlng || anchor, anchor,
    capital: capName ? { name_en: capName, name_no: capNo, lat: capLL ? capLL[0] : null, lng: capLL ? capLL[1] : null } : null,
    aliases: [...aliases],
    flag: iso2 ? `flags/${iso2}.svg` : (suppl?.flag || null),
    micro: areaKm2 > 0 && areaKm2 < 3500,
    area_km2: Math.round(areaKm2),
    unrecognized: !!suppl || ['KOS', 'PSX', 'TWN', 'SAH'].includes(key),
    supplement: !!suppl,
  };
  outFeatures.push({ type: 'Feature',
    properties: { k: key, n: nameEn, c: continent },
    geometry: { type: geometry.type, coordinates: roundCoords(geometry.coordinates) } });
}

for (const f of neCountries.features) {
  const key = String(P(f.properties, 'ADM0_A3') || '').toUpperCase();
  if (!key) continue;
  if (key === 'ATA') { // Antarctica: keep as background-ish country, still playable
    addRecord(key, byCca3.ATA || byCca2.AQ, f, null); continue;
  }
  let meta = byCca3[NE_TO_CCA3[key] || key];
  if (!meta) {
    const iso2 = String(P(f.properties, 'ISO_A2_EH') || P(f.properties, 'ISO_A2') || '').toUpperCase();
    if (iso2 && iso2 !== '-99') meta = byCca2[iso2];
  }
  const suppl = suppByKey[key] || null;
  if (!meta && !suppl) {
    report.skipped.push({ key, name: P(f.properties, 'ADMIN') });
    continue; // NE oddities without ISO identity (bases, rocks, no-man's-lands)
  }
  addRecord(key, meta, f, suppl);
}

/* De-facto states that are only present in the disputed-areas layer -------- */
const NEED_FROM_DISPUTED = { ABK: 'Abkhazia', SOS: 'South Ossetia', TRA: 'Transnistria', SOL: 'Somaliland', CYN: 'Cyprus' };
for (const [key, needle] of Object.entries(NEED_FROM_DISPUTED)) {
  if (records[key]) continue; // already came in via admin-0
  const suppl = suppByKey[key];
  if (!suppl) continue;
  const match = neDisputed.features.filter(f => {
    const n = `${P(f.properties, 'NAME') || ''} ${P(f.properties, 'BRK_NAME') || ''} ${P(f.properties, 'NAME_LONG') || ''}`;
    return n.toLowerCase().includes((suppl.match || needle).toLowerCase());
  });
  if (!match.length) { warn(`could not find geometry for ${key} (${needle}) in disputed areas`); continue; }
  // merge multiple pieces into one MultiPolygon
  const polys = [];
  for (const f of match) {
    if (f.geometry.type === 'Polygon') polys.push(f.geometry.coordinates);
    else if (f.geometry.type === 'MultiPolygon') polys.push(...f.geometry.coordinates);
  }
  addRecord(key, null, { type: 'Feature', properties: match[0].properties,
    geometry: { type: 'MultiPolygon', coordinates: polys } }, suppl);
}

const REQUIRED = ['KOS', 'PSX', 'TWN', 'SAH', 'CYN', 'ABK', 'SOS', 'TRA', 'SOL'];
for (const k of REQUIRED) if (!records[k]) warn(`REQUIRED entity missing after build: ${k}`);

/* ================================================== 5. CAPITALS AND CITIES */
console.log('Reading populated places…');
const places = readJSON(placesRawPath);
const cityBuckets = {};
for (const f of places.features) {
  const p = f.properties;
  const key = String(P(p, 'ADM0_A3') || P(p, 'SOV_A3') || '').toUpperCase();
  if (!records[key]) continue;
  const name = P(p, 'NAME') || P(p, 'NAMEASCII');
  if (!name) continue;
  const [lng, lat] = f.geometry.coordinates;
  const fc = String(P(p, 'FEATURECLA') || '');
  (cityBuckets[key] = cityBuckets[key] || []).push({
    n: name, lat: round4(lat), lng: round4(lng),
    pop: Number(P(p, 'POP_MAX')) || 0,
    cap: fc === 'Admin-0 capital' || Number(P(p, 'ADM0CAP')) === 1,
  });
}
const cities = {};
for (const [key, arr] of Object.entries(cityBuckets)) {
  arr.sort((a, b) => b.pop - a.pop);
  cities[key] = arr.slice(0, 5);
  // capital coordinates: prefer the NE capital point, matched loosely by name
  const rec = records[key];
  const squash = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (rec?.capital && (rec.capital.lat == null)) {
    const capPt = arr.find(c => c.cap)
      || arr.find(c => squash(c.n) === squash(rec.capital.name_en))
      || arr.find(c => squash(c.n) && squash(rec.capital.name_en).includes(squash(c.n)))
      || null;
    if (capPt) { rec.capital.lat = capPt.lat; rec.capital.lng = capPt.lng; if (!rec.capital.name_en) rec.capital.name_en = capPt.n; }
    else if (rec.latlng) { rec.capital.lat = rec.latlng[0]; rec.capital.lng = rec.latlng[1]; warn(`capital coords approximated by country centre for ${key}`); }
  }
  if (rec && !rec.capital) { // metadata had no capital: fall back to the NE capital point if any
    const capPt = arr.find(c => c.cap);
    if (capPt) rec.capital = { name_en: capPt.n, name_no: '', lat: capPt.lat, lng: capPt.lng };
  }
}
report.counts.citiesCountries = Object.keys(cities).length;
writeJSON(path.join(DATA, 'cities.json'), cities);

/* ========================================================== 6. ADMIN-1 SET */
console.log('Reading admin-1 provinces (big file)…');
const admin1 = readJSON(admin1RawPath);
const simplifyTol = Number(process.env.SIMPLIFY || 0);
const provFeatures = [];
for (const f of admin1.features) {
  if (!f.geometry) continue;
  const p = f.properties;
  const c = String(P(p, 'adm0_a3') || '').toUpperCase();
  if (!records[c]) continue;
  let geom = f.geometry;
  if (simplifyTol > 0) {
    try { geom = turf.simplify(f, { tolerance: simplifyTol, highQuality: false, mutate: false }).geometry; } catch {}
  }
  provFeatures.push({ type: 'Feature',
    properties: {
      c,
      nl: P(p, 'name_local') || '',
      n: P(p, 'name') || '',
      ne: P(p, 'name_en') || '',
    },
    geometry: { type: geom.type, coordinates: roundCoords(geom.coordinates) } });
}
report.counts.provinces = provFeatures.length;
writeJSON(path.join(DATA, 'provinces.geojson'), { type: 'FeatureCollection', features: provFeatures });

/* ================================================================ 7. FLAGS */
console.log('Downloading flags…');
const flagSources = (cc) => [
  `https://flagcdn.com/${cc}.svg`,                                            // primary (brief)
  `https://raw.githubusercontent.com/lipis/flag-icons/main/flags/4x3/${cc}.svg`, // fallback mirror (MIT)
  `https://raw.githubusercontent.com/hampusborgos/country-flags/main/svg/${cc}.svg`,
];
let flagSourceNote = null;
const flagQueue = Object.values(records).filter(r => r.iso2).map(r => r.iso2);
let done = 0;
for (const cc of [...new Set(flagQueue)]) {
  const dest = path.join(FLAGS, `${cc}.svg`);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) { done++; continue; }
  let ok = false;
  for (const src of flagSources(cc)) {
    try { curl(src, dest, { timeout: 30 }); ok = true; if (!flagSourceNote) { flagSourceNote = src; report.sources['flags'] = src.replace(cc + '.svg', '{cc}.svg'); } break; }
    catch { try { fs.rmSync(dest, { force: true }); } catch {} }
  }
  if (!ok) { warn(`no flag found for ${cc}`); const r = Object.values(records).find(x => x.iso2 === cc); if (r) r.flag = null; }
  if (++done % 40 === 0) console.log(`  flags: ${done}/${flagQueue.length}`);
}
// hand-drawn supplement flags (approximations, flagged for review in _supplement.json)
for (const s of supplement) {
  if (!s.flag) continue;
  const src = path.join(HERE, 'assets', s.flag);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(DATA, s.flag));
  else warn(`supplement flag asset missing: ${s.flag}`);
}

/* ============================================================== 8. OUTPUTS */
report.counts.countries = Object.keys(records).length;
writeJSON(path.join(DATA, 'countries.json'), records);
writeJSON(path.join(DATA, 'countries.geojson'), { type: 'FeatureCollection', features: outFeatures });
writeJSON(path.join(RAW, 'build-report.json'), report);

console.log('\nDone.');
console.log(`  countries: ${report.counts.countries}   provinces: ${report.counts.provinces}   city-countries: ${report.counts.citiesCountries}`);
console.log(`  skipped NE units without identity: ${report.skipped.length} (see data/_raw/build-report.json)`);
console.log(`  warnings: ${report.warnings.length}`);
