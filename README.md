# Kartlegg · MapOut — geografiquiz på et umerket kart

**Kartlegg** er en geografiquiz på et helt blankt kart — ingen navn, ingen hint, bare
grenser. Finn land på kartet, gjett hovedsteder, flagg, provinser og byer, eller plasser
steder GeoGuessr-stil. Seks kategorier, flere spillmoduser, tidspress du kan skru av, og
personlige rekorder med ★ når du klarer alt. Generalissimo Kartov dømmer hvert svar.
På norsk og engelsk (**MapOut**) — og alt fungerer uten internett.

*(The app titles itself Kartlegg in Norwegian and MapOut in English; everything below
is the original technical documentation.)*


A bilingual (Norsk / English) world-geography quiz. Everything — code, the Leaflet map
library, and all quiz data — lives inside this folder. After the one-time data download
the app makes **no network requests at runtime**.

## Run it

Browsers block `fetch()` of local files when a page is opened straight from disk, so use
any tiny static server (no build step, nothing to install if you have Python):

```
python3 -m http.server 8000        # or: ./start.sh   /   start.bat on Windows
# open http://localhost:8000
```

Works on desktop and mobile-width screens. Language choice and personal bests are kept in
`localStorage`; nothing else is persisted.

## What's inside

```
index.html            entry point
css/, js/             app (menus, quiz engine, map, scoring, i18n) — plain HTML/CSS/JS
vendor/leaflet/       local Leaflet 1.9.4 (BSD-2)
vendor/turf/          local turf.js 6.5 (MIT) — point-in-polygon + great-circle distance
data/
  countries.json      normalized country records (names en/no/native, capital, aliases, …)
  countries.geojson   country outlines (incl. de-facto states)
  provinces.geojson   admin-1 outlines with native names (name_local kept)
  cities.json         top-5 cities per country by population
  flags/*.svg         one flag per country
  names/              incremental Norwegian name batches + manifest (see below)
  _supplement.json    hand-curated records for unrecognized states (flagged for review)
  _raw/               the untouched downloaded source files + build-report.json
scripts/
  build-data.mjs      one-time downloader + normalizer (Node ≥ 18)
  coverage-report.mjs shows which names still lack Norwegian/native translations
  assets/flags/       hand-drawn approximate flags for the 5 entities with no ISO code
```

## Rebuilding the data

```
node scripts/build-data.mjs            # 50m country geometry (default)
NE_DETAIL=10m node scripts/build-data.mjs   # higher-detail option
SIMPLIFY=0.01 node scripts/build-data.mjs   # mild province simplification (used for the shipped build)
```

Raw files are cached under `data/_raw`, so re-runs are fast. Every dataset has the
primary source from the project brief plus fallback mirrors; `data/_raw/build-report.json`
records which source was actually used, all warnings, and any Natural Earth units that
were skipped for lacking an ISO identity (currently only the Siachen Glacier zone).

### Sources used by this build (primary → used fallback)

| Data | Primary (brief) | Used here | License |
|---|---|---|---|
| Country / province outlines, disputed areas, populated places | Natural Earth GeoJSON via GitHub raw | same | Public domain |
| Country metadata & names | restcountries.com v3.1 | mledoze/countries (the dataset restcountries is built on) | ODbL |
| Norwegian country names | restcountries `translations.nob` | umpirsky/country-list (CLDR `nb_NO`) | MIT |
| Flags | flagcdn.com | lipis/flag-icons (4x3 SVGs) | MIT |
| Cities | SimpleMaps World Cities Basic | Natural Earth populated places (top-5 by `pop_max`) | Public domain |

The build script tries the primary URLs first and falls back automatically when they are
unreachable, so running it on an open network will prefer the sources named in the brief.

### Unrecognized / partially recognized states

Kosovo, Palestine, Taiwan and Western Sahara come straight from Natural Earth + the
metadata join. Northern Cyprus, Somaliland, Abkhazia, South Ossetia and Transnistria have
no restcountries/ISO metadata, so `data/_supplement.json` provides hand-curated names,
capitals and continents (each entry carries a `review` note). Their geometry comes from
Natural Earth admin-0 or the disputed-areas layer. Their flags (`scripts/assets/flags/`)
are simplified hand-drawn approximations (e.g. Somaliland's calligraphy and
Transnistria's emblem are omitted) — clearly marked for later review/replacement.

## Incremental names ("done in portions")

Norwegian capital/city names arrive in batches under `data/names/`, listed in
`data/names/index.json`. Drop in a new batch file, add it to the manifest — no code
changes. Missing names always fall back (Norwegian → native → English) and never render
blank. Check progress with:

```
node scripts/coverage-report.mjs          # summary
node scripts/coverage-report.mjs --list   # exact missing entries (paste-ready keys)
```

Province labels always use Natural Earth's native `name_local`, falling back to `name`
then `name_en`.

## Implementation notes / small deviations

- **Endonyms · Type answer** accepts the full alias list (native name, romanizations from
  `altSpellings` such as *Nihon/Nippon*, and other known names), since requiring exact
  native-script input would be unplayable on most keyboards. The reveal always shows the
  endonym.
- **Reveal scoring**: 6 − wrongAttempts (min 0); after the 6th miss with the full flag
  visible the item ends at 0. The complete flag + country name is always shown before
  advancing.
- **Locate scoring**: `clamp(50·(1 − km/2500), 0..50)` proximity + 50 if the tap lands
  inside the correct country (turf point-in-polygon); distance is true haversine km from
  lat/lng, never pixels.
- Typo tolerance is guarded: short names (≤4 letters) must be exact and an input that is
  at least as close to another item in the pool is rejected — so "Iraq" never matches Iran.
- Micro-nations (area < 3500 km²) get an extra clickable centroid circle with a fixed
  geographic radius (32 km), so it scales with the map — sized so Vatican City's circle
  pokes just past Italy's coast.
- **Country list**: only sovereign states (UN members + Vatican) plus the unrecognized /
  de-facto states (Kosovo, Palestine, Taiwan, Western Sahara, Northern Cyprus, Somaliland,
  Abkhazia, South Ossetia, Transnistria) are quizzable — 203 in total. Dependencies,
  overseas territories and Antarctica are still drawn on the map, muted and
  non-interactive. Re-run `node scripts/patch-quizzable.mjs` after rebuilding data.
- **Cities · Locate** is GeoGuessr-style: you tap the location freely and are scored by
  distance — there are no candidate markers to pick from. Locate never auto-advances;
  you review the distance line and tap Next.
- All scores display as `points / max` (max = items × per-item maximum: 1 normally,
  6 in Reveal, 100 in Locate).
- The map wraps across the antimeridian: shapes near the dateline are drawn at ±360°
  too, so the Bering Strait and the Pacific are seamless in every direction.
- Wrong taps in Find/Eliminate name what you actually tapped ("You tapped X — it was Y").
- Selecting a shape never reorders map layers, so micro-nation circles always stay on top.
- MC / Type keep the highlighted country deliberately small inside a wide continental
  view (Malta comes with all of Europe and half of Africa) so shape ≠ giveaway is on
  the outline modes only.
- **Flags use their official aspect ratios** (Montenegro 1:2, Qatar 11:28, Switzerland
  square, Nepal's true shape) via `hampusborgos/country-flags` (public domain). The five
  hand-drawn de-facto-state approximations were stretched to their official ratios.
  If you ever replace flag files, run `node scripts/fix-flag-dimensions.mjs` — it stamps
  the intrinsic width/height the display CSS relies on.
- **Light/dark theme** toggle on the start screen; dark is the default. The map reads
  its palette from the CSS theme variables.
- **15-second timer** on every question by default, shown as a draining bar directly
  above the answer buttons (turns red under 5 s). The HUD chip (⏱ on/off) toggles it
  mid-round and the choice persists. A timeout counts as a miss and reveals the answer.
- **Eliminate scores first tries only**: a wrong tap re-queues the item and it is worth
  0 when you eventually clear it — so 46 countries with 3 misses ends 43/46. The
  "correct" stat counts first-try eliminations too.
- Every verdict comes with a line from the regime — fictional characters Generalissimo
  Kartov and Chancellor Atlasova judge each answer.
- Menus show your personal best (`12/20`) on every option you've played, with a ★ at
  100%; each menu screen highlights one primary choice.
- Common short names are accepted in Type answer (e.g. "Bosnia", "Trinidad",
  "Saint Vincent"); edit `EXTRA_ALIASES` in `scripts/patch-quizzable.mjs` to add more.
- Provinces written in non-Latin scripts show their romanization too
  (山东 · Shandong, Приморский край · Primorskiy); typing the romanized name counts.
