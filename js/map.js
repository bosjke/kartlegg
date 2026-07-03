/* Map layer. Blank background, no tiles, no labels — only quiz geometry (brief §8).
   One shared canvas renderer for everything: stacked canvases swallow clicks
   meant for lower panes, so polygons and markers must share a single canvas. */
(function () {
  'use strict';

  /* Colors come from the CSS theme variables so light/dark both work.
     Refreshed at init and on every scene rebuild (theme toggles live in menus). */
  var COLORS = {};
  var BACKDROP_STYLE = { interactive: false };
  var MUTED_STYLE = { interactive: false };
  function cssVar(name, fallback) {
    try {
      var v = getComputedStyle(document.body).getPropertyValue(name).trim();
      return v || fallback;
    } catch (e) { return fallback; }
  }
  function refreshColors() {
    COLORS.landFill = cssVar('--land', '#e7dcbf');
    COLORS.landLine = cssVar('--land-line', '#0d2b3e');
    COLORS.mutedFill = cssVar('--m-muted', '#cfc3a2');
    COLORS.accent = cssVar('--accent', '#e8b84b');
    COLORS.accentLine = cssVar('--accent-line', '#8a6a1f');
    COLORS.good = cssVar('--good', '#6fbf8f');
    COLORS.bad = cssVar('--bad', '#e4572e');
    COLORS.gone = cssVar('--m-gone', '#5f7280');
    COLORS.cityFill = cssVar('--m-city', '#12374b');
    COLORS.cityLine = cssVar('--m-city-line', '#f2ead6');
    L.extend(BACKDROP_STYLE, { color: COLORS.landLine, weight: 1, fillColor: COLORS.landFill, fillOpacity: 1, opacity: 1 });
    L.extend(MUTED_STYLE, { color: COLORS.landLine, weight: 0.8, fillColor: COLORS.mutedFill, fillOpacity: 1, opacity: 0.8 });
  }
  var MICRO_RADIUS_M = 32000;                   /* fixed geographic size: Vatican's circle
                                                   pokes just past Italy's coast at any zoom */

  var WORLD_BOUNDS = [[-55, -180], [78, 180]];
  var CONTINENT_VIEWS = {
    'Africa': [[-36, -20], [38, 55]],
    'Europe': [[34, -12], [71, 45]],
    'Asia': [[-12, 25], [62, 150]],
    'North America': [[5, -170], [73, -50]],
    'South America': [[-57, -84], [14, -33]],
    'Oceania': [[-50, 110], [10, 200]],
    'Antarctica': [[-85, -180], [-60, 180]]
  };

  var map = null;
  var S = null; // per-question/round state

  function freshState() {
    return {
      kind: null,              // 'country' | 'province' | 'city' | 'point' | null
      layers: {},              // id → [leaflet layers, incl. wrap clones]
      feats: {},               // id → feature (for bounds / PIP)
      eliminated: {},          // id → true
      results: {},             // id → 'good' | 'bad'   (reveal colors)
      targetId: null,          // highlighted target (mc/type)
      pendingId: null,
      locked: true,
      onCommit: null,
      pointGuess: null, pointMarker: null, locateExtras: [],
      groups: []               // all layer groups added to the map
    };
  }

  function init() {
    if (map) return;
    refreshColors();
    map = L.map('map', {
      preferCanvas: true,
      renderer: L.canvas({ padding: 1 }),       /* pre-render around viewport; modest so fast pans stay smooth */
      attributionControl: false, zoomControl: true,
      minZoom: 2, maxZoom: 11, zoomSnap: 0.25,
      worldCopyJump: true                       /* wrap around the antimeridian */
    });
    map.setView([22, 10], 2);
    map.on('click', function (e) {
      if (!S || S.locked || S.kind !== 'point') return;
      setPointGuess(e.latlng);
    });
    S = freshState();
  }

  /* Run a view change once now and once after layout settles — the round
     screen may have just become visible, so the first pass can see a stale
     container size (the old "zoomed into 0,0" bug). */
  function afterSized(fn) {
    map.invalidateSize({ pan: false });
    fn();
    setTimeout(function () { map.invalidateSize({ pan: false }); fn(); }, 160);
  }

  /* ── geometry helpers (dateline-aware) ──────────────────────────────── */
  function eachOuterRing(geom, cb) {
    if (!geom) return;
    if (geom.type === 'Polygon') cb(geom.coordinates[0]);
    else if (geom.type === 'MultiPolygon') geom.coordinates.forEach(function (p) { cb(p[0]); });
    else if (geom.type === 'GeometryCollection') geom.geometries.forEach(function (g) { eachOuterRing(g, cb); });
  }
  function ringStats(ring) {
    var lng = ring[0][0], prev = lng;
    var minLng = lng, maxLng = lng, minLat = ring[0][1], maxLat = ring[0][1], area = 0;
    for (var i = 1; i < ring.length; i++) {
      var x = ring[i][0], y = ring[i][1];
      while (x - prev > 180) x -= 360;          /* unwrap across the antimeridian */
      while (x - prev < -180) x += 360;
      area += (prev * y - x * ring[i - 1][1]);
      prev = x;
      if (x < minLng) minLng = x; if (x > maxLng) maxLng = x;
      if (y < minLat) minLat = y; if (y > maxLat) maxLat = y;
    }
    return {
      minLng: minLng, maxLng: maxLng, minLat: minLat, maxLat: maxLat,
      area: Math.abs(area) * Math.cos(((minLat + maxLat) / 2) * Math.PI / 180),
      cLng: (minLng + maxLng) / 2, cLat: (minLat + maxLat) / 2
    };
  }
  /* Bounds of a country's "main cluster": largest polygon plus nearby ones.
     Keeps both NZ islands together but drops Chatham-style outliers, and
     keeps the Netherlands out of the Caribbean. */
  function clusterBounds(feature) {
    var polys = [];
    eachOuterRing(feature.geometry, function (ring) {
      if (ring && ring.length > 2) polys.push(ringStats(ring));
    });
    if (!polys.length) return null;
    polys.sort(function (a, b) { return b.area - a.area; });
    var main = polys[0];
    var b = { minLng: main.minLng, maxLng: main.maxLng, minLat: main.minLat, maxLat: main.maxLat };
    for (var i = 1; i < polys.length; i++) {
      var p = polys[i], c = p.cLng, shift = 0;
      while (c - main.cLng > 180) { c -= 360; shift -= 360; }
      while (c - main.cLng < -180) { c += 360; shift += 360; }
      if (Math.abs(c - main.cLng) > 25 || Math.abs(p.cLat - main.cLat) > 25) continue;
      b.minLng = Math.min(b.minLng, p.minLng + shift);
      b.maxLng = Math.max(b.maxLng, p.maxLng + shift);
      b.minLat = Math.min(b.minLat, p.minLat);
      b.maxLat = Math.max(b.maxLat, p.maxLat);
    }
    return L.latLngBounds([b.minLat, b.minLng], [b.maxLat, b.maxLng]);
  }

  function shiftCoords(c, dx) {
    if (typeof c[0] === 'number') return [c[0] + dx, c[1]];
    return c.map(function (x) { return shiftCoords(x, dx); });
  }
  function shiftedFeature(f, dx) {
    function shiftGeom(g) {
      if (g.type === 'GeometryCollection') {
        return { type: g.type, geometries: g.geometries.map(shiftGeom) };
      }
      return { type: g.type, coordinates: shiftCoords(g.coordinates, dx) };
    }
    return { type: 'Feature', properties: f.properties, geometry: shiftGeom(f.geometry) };
  }

  /* ── styling ─────────────────────────────────────────────────────────── */
  function styleFor(id, isCity) {
    var res = S.results[id];
    var fill, line = COLORS.landLine, w = isCity ? 1.5 : 1;
    if (res === 'good') { fill = COLORS.good; }
    else if (res === 'bad') { fill = COLORS.bad; }
    else if (S.eliminated[id]) { fill = COLORS.gone; }
    else if (S.pendingId === id) { fill = COLORS.accent; line = COLORS.accentLine; w = 2; }
    else if (S.targetId === id) { fill = COLORS.accent; line = COLORS.accentLine; w = 1.5; }
    else if (isCity) { fill = COLORS.cityFill; line = COLORS.cityLine; }
    else { fill = COLORS.landFill; }
    return { color: line, weight: w, fillColor: fill, fillOpacity: 1, opacity: 1 };
  }
  function restyle(id) {
    var arr = S.layers[id];
    if (!arr) return;
    arr.forEach(function (ly) {
      var isCity = !!ly.options._isCity;
      ly.setStyle(styleFor(id, isCity));
      /* never reorder layers: markers stay on top, selection is a fill change only */
    });
  }
  function restyleAll() { Object.keys(S.layers).forEach(restyle); }

  /* ── click handling (click-to-confirm, brief §6/§8) ─────────────────── */
  function onShapeTap(id) {
    if (S.locked || !S.onCommit || S.eliminated[id]) return;
    if (S.pendingId === id) { commit(); return; }        // second tap on same shape commits
    var prev = S.pendingId;
    S.pendingId = id;
    if (prev) restyle(prev);
    restyle(id);
    if (api.onPendingChange) api.onPendingChange(true);
  }
  function commit() {
    if (S.locked) return false;
    if (S.kind === 'point') {
      if (!S.pointGuess) return false;
      S.locked = true;
      if (api.onPendingChange) api.onPendingChange(false);
      S.onCommit(S.pointGuess);
      return true;
    }
    if (!S.pendingId) return false;
    S.locked = true;
    var id = S.pendingId;
    if (api.onPendingChange) api.onPendingChange(false);
    S.onCommit(id);
    return true;
  }

  function setPointGuess(latlng) {
    S.pointGuess = latlng;
    if (!S.pointMarker) {
      S.pointMarker = L.circleMarker(latlng, {
        radius: 8, color: COLORS.accentLine, weight: 2, fillColor: COLORS.accent, fillOpacity: 1
      }).addTo(map);
      S.groups.push(S.pointMarker);
    } else {
      S.pointMarker.setLatLng(latlng);
    }
    if (api.onPendingChange) api.onPendingChange(true);
  }

  /* ── building layers ────────────────────────────────────────────────── */
  function clearAll() {
    if (!map) return;
    refreshColors();                       /* pick up a theme change from the menu */
    S.locateExtras.forEach(function (l) { map.removeLayer(l); });
    S.groups.forEach(function (g) { map.removeLayer(g); });
    S = freshState();
  }

  function registerLayer(id, layer, feature) {
    (S.layers[id] = S.layers[id] || []).push(layer);
    if (feature) S.feats[id] = feature;
    layer.on('click', function (e) {
      L.DomEvent.stopPropagation(e);
      onShapeTap(id);
    });
  }

  /* Add a polygon feature, plus wrap copies at ±360° when it sits near the
     antimeridian, so the map connects seamlessly without tripling the render
     cost for shapes that could never be seen on an adjacent world copy. */
  function lngExtent(f) {
    var min = Infinity, max = -Infinity;
    eachOuterRing(f.geometry, function (ring) {
      for (var i = 0; i < ring.length; i++) {
        var x = ring[i][0];
        if (x < min) min = x;
        if (x > max) max = x;
      }
    });
    return [min, max];
  }
  function addPoly(group, f, style, id) {
    var ext = lngExtent(f);
    var offsets = (ext[1] > 60 || ext[0] < -60) ? [0, 360, -360] : [0];
    offsets.forEach(function (dx) {
      var g = dx === 0 ? f : shiftedFeature(f, dx);
      var ly = L.geoJSON(g, { style: style, interactive: style.interactive !== false });
      ly.eachLayer(function (sub) {
        if (id != null) registerLayer(id, sub, dx === 0 ? f : null);
      });
      group.addLayer(ly);
    });
  }
  /* Micro-nation circles: true geographic radius, never screen pixels. */
  function addGeoCircle(group, latlng, style, id) {
    var copies = [0];
    if (latlng[1] > 60) copies.push(-360);
    if (latlng[1] < -60) copies.push(360);
    copies.forEach(function (dx) {
      var c = L.circle([latlng[0], latlng[1] + dx], L.extend({ radius: MICRO_RADIUS_M }, style));
      c.options._isCity = false;
      if (id != null) registerLayer(id, c);
      group.addLayer(c);
    });
  }
  function addMarker(group, latlng, opts, id, isCity) {
    var copies = [0];
    if (latlng[1] > 60) copies.push(-360);
    if (latlng[1] < -60) copies.push(360);
    copies.forEach(function (dx) {
      var m = L.circleMarker([latlng[0], latlng[1] + dx], opts);
      m.options._isCity = !!isCity;
      if (id != null) registerLayer(id, m);
      group.addLayer(m);
    });
  }

  /* Territories / non-quiz land: always drawn, muted, never clickable. */
  function addTerritoryBackdrop(group) {
    (WQData.territoryList || []).forEach(function (rec) {
      var f = WQData.countryFeatures[rec.key];
      if (f) addPoly(group, f, MUTED_STYLE);
    });
  }

  /* Countries: polygons + clickable centroid circles for micro-nations. */
  function showCountries(records) {
    clearAll();
    var back = L.featureGroup();
    addTerritoryBackdrop(back);
    back.addTo(map);
    S.groups.push(back);
    var group = L.featureGroup();
    records.forEach(function (rec) {
      var f = WQData.countryFeatures[rec.key];
      if (!f) return;
      addPoly(group, f, styleFor(rec.key, false), rec.key);
    });
    /* micro circles added last → drawn on top, still tappable */
    records.forEach(function (rec) {
      if (!rec.micro || !rec.anchor) return;
      addGeoCircle(group, [rec.anchor[0], rec.anchor[1]], styleFor(rec.key, false), rec.key);
    });
    group.addTo(map);
    S.groups.push(group);
  }

  function showProvinces(features) {
    clearAll();
    var back = L.featureGroup();
    (WQData.countryList || []).forEach(function (rec) {
      var f = WQData.countryFeatures[rec.key];
      if (f) addPoly(back, f, MUTED_STYLE);
    });
    addTerritoryBackdrop(back);
    back.addTo(map);
    S.groups.push(back);
    var group = L.featureGroup();
    features.forEach(function (f) {
      addPoly(group, f, styleFor(f.properties._id, false), f.properties._id);
    });
    group.addTo(map);
    S.groups.push(group);
  }

  /* Cities: country polygons for context + unlabeled markers. */
  function showCityMarkers(cityItems, contextRecords) {
    clearAll();
    var ctx = L.featureGroup();
    addTerritoryBackdrop(ctx);
    (contextRecords || []).forEach(function (rec) {
      var f = WQData.countryFeatures[rec.key];
      if (f) addPoly(ctx, f, BACKDROP_STYLE);
    });
    ctx.addTo(map);
    S.groups.push(ctx);
    var group = L.featureGroup();
    cityItems.forEach(function (item) {
      addMarker(group, [item.city.lat, item.city.lng],
        L.extend({ radius: 6 }, styleFor(item.id, true)), item.id, true);
    });
    group.addTo(map);
    S.groups.push(group);
  }

  /* Countries only, non-interactive shapes (free-click Locate rounds). */
  function showCountriesBackdrop(records) {
    clearAll();
    var group = L.featureGroup();
    addTerritoryBackdrop(group);
    records.forEach(function (rec) {
      var f = WQData.countryFeatures[rec.key];
      if (!f) return;
      addPoly(group, f, BACKDROP_STYLE);
      S.feats[rec.key] = f;
    });
    group.addTo(map);
    S.groups.push(group);
  }

  /* Outlines mode: one isolated shape, nothing else (brief §6). */
  function showOutline(feature) {
    clearAll();                            /* also refreshes theme colors */
    var ly = L.geoJSON(feature, {
      style: L.extend({}, { color: COLORS.landLine, weight: 1.5, fillColor: COLORS.landFill, fillOpacity: 1 }),
      interactive: false
    }).addTo(map);
    S.groups.push(ly);
    var b = clusterBounds(feature);
    if (b) afterSized(function () { map.fitBounds(b.pad(0.12), { maxZoom: 7 }); });
  }

  /* ── per-question controls used by the quiz engine ──────────────────── */
  var api = {
    init: init,
    clearAll: clearAll,
    showCountries: showCountries,
    showProvinces: showProvinces,
    showCityMarkers: showCityMarkers,
    showCountriesBackdrop: showCountriesBackdrop,
    showOutline: showOutline,
    onPendingChange: null,

    /* Whole-scope establishing shot: very wide (brief + feedback). */
    fitScope: function (scope) {
      var b;
      if (!scope || scope.type === 'world') b = L.latLngBounds(WORLD_BOUNDS);
      else if (scope.type === 'continent') {
        var v = CONTINENT_VIEWS[scope.value];
        b = v ? L.latLngBounds(v) : L.latLngBounds(WORLD_BOUNDS);
      } else if (scope.type === 'country') {
        var f = WQData.countryFeatures[scope.value];
        b = f ? clusterBounds(f) : L.latLngBounds(WORLD_BOUNDS);
        if (b) b = b.pad(0.25);
      }
      if (!b) return;
      afterSized(function () { map.fitBounds(b, { padding: [10, 10], maxZoom: 7 }); });
    },

    beginQuestion: function (kind, onCommit) {   // kind null → map passive
      S.kind = kind;
      S.onCommit = onCommit || null;
      S.pendingId = null;
      S.locked = !kind;
      Object.keys(S.results).forEach(function (id) { delete S.results[id]; });
      if (S.pointMarker) { map.removeLayer(S.pointMarker); S.pointMarker = null; }
      S.pointGuess = null;
      S.locateExtras.forEach(function (l) { map.removeLayer(l); });
      S.locateExtras = [];
      restyleAll();
      if (api.onPendingChange) api.onPendingChange(false);
    },
    setTarget: function (id) {
      var prev = S.targetId;
      S.targetId = id;
      if (prev) restyle(prev);
      if (id) restyle(id);
    },
    confirmPending: commit,
    hasPending: function () { return S.kind === 'point' ? !!S.pointGuess : !!S.pendingId; },
    lock: function () { S.locked = true; },
    markResult: function (id, kind) { S.results[id] = kind; restyle(id); },
    markEliminated: function (id) { S.eliminated[id] = true; S.pendingId = null; restyle(id); },
    clearPending: function () { var p = S.pendingId; S.pendingId = null; if (p) restyle(p); },

    /* Context view for MC/Type: keep the shape small inside a wide region —
       Malta should come with all of Europe and half of Africa around it. */
    focusOn: function (id, opts) {
      opts = opts || {};
      var f = S.feats[id];
      if (f) {
        var b = clusterBounds(f);
        if (!b) return;
        var c = b.getCenter();
        var half = opts.kind === 'province' ? [9, 13] : [26, 36];
        var ctx = L.latLngBounds(
          [Math.max(-85, c.lat - half[0]), c.lng - half[1]],
          [Math.min(85, c.lat + half[0]), c.lng + half[1]]
        );
        afterSized(function () {
          var z = Math.min(map.getBoundsZoom(b.pad(0.2)), map.getBoundsZoom(ctx));
          map.setView(c, Math.max(map.getMinZoom(), z));
        });
        return;
      }
      var arr = S.layers[id];                          // point targets (city markers)
      if (arr && arr[0] && arr[0].getLatLng) {
        var ll = arr[0].getLatLng();
        afterSized(function () { map.setView(ll, 5); });
      }
    },
    countryFeature: function (key) { return S.feats[key] || WQData.countryFeatures[key]; },

    showLocateResult: function (guess, truth) {
      if (!guess) {                        /* timed out: show only where it was */
        var only = L.circleMarker(truth, {
          radius: 8, color: '#3c2c0a', weight: 2, fillColor: COLORS.good, fillOpacity: 1
        }).addTo(map);
        S.locateExtras.push(only);
        map.setView(truth, Math.max(map.getZoom(), 4));
        return;
      }
      /* keep the pair on the same world copy */
      var g = L.latLng(guess.lat, guess.lng);
      if (g.lng - truth.lng > 180) g = L.latLng(g.lat, g.lng - 360);
      if (g.lng - truth.lng < -180) g = L.latLng(g.lat, g.lng + 360);
      if (S.pointMarker) S.pointMarker.setLatLng(g);
      var pin = L.circleMarker(truth, {
        radius: 8, color: '#3c2c0a', weight: 2, fillColor: COLORS.good, fillOpacity: 1
      }).addTo(map);
      var line = L.polyline([g, truth], {
        color: COLORS.bad, weight: 2, dashArray: '6 6', opacity: 0.9
      }).addTo(map);
      S.locateExtras.push(pin, line);
      var b = L.latLngBounds([g, truth]).pad(0.4);
      map.fitBounds(b, { maxZoom: 6 });
    },
    invalidate: function () { if (map) setTimeout(function () { map.invalidateSize({ pan: false }); }, 60); }
  };

  window.WQMap = api;
})();
