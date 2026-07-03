/* Loads the local data files (no network beyond this folder) and builds indexes. */
(function () {
  'use strict';

  var CONTINENT_ORDER = ['Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania', 'Antarctica'];

  var D = {
    countries: null,          // key → record
    countryFeatures: null,    // key → GeoJSON feature
    countryList: [],          // records, stable order
    continents: [],           // present continents in fixed order
    cities: null,             // key → [{n,lat,lng,pop,cap}]
    names: { no_capitals: {}, no_cities: {} },
    provinces: null,          // lazy: FeatureCollection
    provincesByCountry: null, // key → [features]
  };

  function getJSON(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error(url + ' → HTTP ' + r.status);
      return r.json();
    });
  }

  D.load = function () {
    return Promise.all([
      getJSON('data/countries.json'),
      getJSON('data/countries.geojson'),
      getJSON('data/cities.json'),
      getJSON('data/names/index.json').catch(function () { return null; })
    ]).then(function (res) {
      D.countries = res[0];
      D.cities = res[2];
      D.countryFeatures = {};
      res[1].features.forEach(function (f) { D.countryFeatures[f.properties.k] = f; });
      /* Quizzable = sovereign states + the unrecognized/de-facto states.
         Dependencies & Antarctica (territory: true) are only drawn as
         muted, non-interactive backdrop. */
      var all = Object.keys(D.countries)
        .map(function (k) { return D.countries[k]; })
        .filter(function (r) { return !!D.countryFeatures[r.key]; })
        .sort(function (a, b) { return a.name_en.localeCompare(b.name_en); });
      D.countryList = all.filter(function (r) { return !r.territory; });
      D.territoryList = all.filter(function (r) { return !!r.territory; });
      var present = {};
      D.countryList.forEach(function (r) { present[r.continent] = true; });
      D.continents = CONTINENT_ORDER.filter(function (c) { return present[c]; });

      /* incremental name batches — missing files are fine */
      var manifest = res[3];
      if (!manifest) return;
      var jobs = [];
      ['no_capitals', 'no_cities'].forEach(function (kind) {
        (manifest[kind] || []).forEach(function (file) {
          jobs.push(getJSON('data/' + file).then(function (batch) {
            Object.keys(batch).forEach(function (k) {
              if (k !== 'comment') D.names[kind][k] = batch[k];
            });
          }).catch(function () { /* batch missing → fallback chain handles it */ }));
        });
      });
      return Promise.all(jobs);
    });
  };

  D.loadProvinces = function () {
    if (D.provinces) return Promise.resolve(D.provinces);
    return getJSON('data/provinces.geojson').then(function (fc) {
      D.provinces = fc;
      D.provincesByCountry = {};
      fc.features.forEach(function (f, i) {
        f.properties._id = 'p' + i;
        var c = f.properties.c;
        (D.provincesByCountry[c] = D.provincesByCountry[c] || []).push(f);
      });
      return fc;
    });
  };

  /* ── scope helpers ──────────────────────────────────────────────────── */
  D.countriesInScope = function (scope) {
    if (!scope || scope.type === 'world') return D.countryList.slice();
    if (scope.type === 'continent') {
      return D.countryList.filter(function (r) { return r.continent === scope.value; });
    }
    if (scope.type === 'country') {
      return D.countryList.filter(function (r) { return r.key === scope.value; });
    }
    return [];
  };

  D.provincesInScope = function (scope) {
    var keys = {};
    D.countriesInScope(scope).forEach(function (r) { keys[r.key] = true; });
    return D.provinces.features.filter(function (f) { return keys[f.properties.c]; });
  };

  D.citiesInScope = function (scope) {
    var out = [];
    D.countriesInScope(scope).forEach(function (r) {
      (D.cities[r.key] || []).forEach(function (c) {
        out.push({ countryKey: r.key, city: c, id: r.key + ':' + c.n });
      });
    });
    return out;
  };

  /* ── personal bests ─────────────────────────────────────────────────── */
  var BEST_KEY = 'wq.best.v1';
  function readBests() {
    try { return JSON.parse(localStorage.getItem(BEST_KEY)) || {}; } catch (e) { return {}; }
  }
  D.getBest = function (setupKey) { var b = readBests(); return b[setupKey]; };
  D.saveBest = function (setupKey, score) {
    var b = readBests();
    var prev = b[setupKey];
    if (prev == null || score > prev) { b[setupKey] = score; localStorage.setItem(BEST_KEY, JSON.stringify(b)); return true; }
    return false;
  };

  window.WQData = D;
})();
