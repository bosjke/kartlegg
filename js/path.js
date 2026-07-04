/* WQPath — the lesson path (prototype: Europe).
   Each unit becomes a chain of short lessons: Countries I/II (find), Flags (MC),
   Capitals (MC), then a mixed Checkpoint. Nodes unlock sequentially; stars are
   stored per node via WQSRS. A lesson is an array of round setups (segments). */
(function () {
  'use strict';

  var UNITS = [
    { id: 'norden', keys: ['NOR','SWE','DNK','FIN','ISL','EST','LVA','LTU'] },
    { id: 'vest',   keys: ['GBR','IRL','FRA','BEL','NLD','LUX','DEU','CHE','AUT','LIE'] },
    { id: 'sor',    keys: ['PRT','ESP','ITA','GRC','MLT','AND','MCO','SMR','VAT','CYP'] },
    { id: 'balkan', keys: ['SVN','HRV','BIH','SRB','MNE','KOS','MKD','ALB','BGR','ROU'] },
    { id: 'ost',    keys: ['POL','CZE','SVK','HUN','UKR','BLR','MDA','RUS','TRA'] }
  ];
  var SCOPE = { type: 'continent', value: 'Europe' };

  function recs(keys) {
    return keys.map(function (k) { return WQData.countries[k]; })
      .filter(function (r) { return r && WQData.countryFeatures[r.key]; });
  }
  function withFlags(rs) { return rs.filter(function (r) { return !!r.flag; }); }
  function withCaps(rs) {
    return rs.filter(function (r) { return r.capital && r.capital.name_en && r.capital.lat != null; });
  }
  function sample(rs, n) {
    var a = rs.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a.slice(0, n);
  }
  function seg(cat, mode, items, extra) {
    var s = { category: cat, mode: mode, scope: SCOPE, amount: null, itemsOverride: items };
    if (mode === 'mc') s.mcCount = 4;
    for (var k in (extra || {})) s[k] = extra[k];
    return s;
  }

  /* Build the flat node list once WQData is ready. */
  var _nodes = null;
  function nodes() {
    if (_nodes) return _nodes;
    _nodes = [];
    UNITS.forEach(function (u) {
      var rs = recs(u.keys);
      var half = Math.ceil(rs.length / 2);
      var chunks = [rs.slice(0, half), rs.slice(half)];
      chunks.forEach(function (chunk, ci) {
        if (!chunk.length) return;
        _nodes.push({
          id: u.id + '-land' + (ci + 1), unit: u.id, icon: '\ud83d\uddfa\ufe0f',
          labelKey: 'lesCountries', roman: ci === 0 ? 'I' : 'II',
          build: function () { return [seg('countries', 'find', chunk, { tag: 'lesson' })]; }
        });
      });
      var fl = withFlags(rs);
      if (fl.length >= 2) _nodes.push({
        id: u.id + '-flagg', unit: u.id, icon: '\ud83d\udea9', labelKey: 'flags',
        build: function () { return [seg('flags', 'mc', fl, { tag: 'lesson' })]; }
      });
      var cp = withCaps(rs);
      if (cp.length >= 2) _nodes.push({
        id: u.id + '-hoved', unit: u.id, icon: '\ud83c\udfdb\ufe0f', labelKey: 'capitals',
        build: function () { return [seg('capitals', 'mc', cp, { tag: 'lesson' })]; }
      });
      _nodes.push({
        id: u.id + '-sjekk', unit: u.id, icon: '\ud83d\udc51', labelKey: 'lesCheckpoint', checkpoint: true,
        build: function () {
          var out = [seg('countries', 'find', sample(rs, Math.min(4, rs.length)), { tag: 'lesson' })];
          if (fl.length >= 2) out.push(seg('flags', 'mc', sample(fl, Math.min(3, fl.length)), { tag: 'lesson' }));
          if (cp.length >= 2) out.push(seg('capitals', 'mc', sample(cp, Math.min(3, cp.length)), { tag: 'lesson' }));
          return out;
        }
      });
    });
    return _nodes;
  }

  function unlocked(i) {
    var ns = nodes();
    return i === 0 || WQSRS.nodeStars(ns[i - 1].id) > 0;
  }
  /* first unlocked node without stars = where you are on the path */
  function currentIndex() {
    var ns = nodes();
    for (var i = 0; i < ns.length; i++) {
      if (!WQSRS.nodeStars(ns[i].id) && unlocked(i)) return i;
    }
    return ns.length - 1;
  }

  window.WQPath = { UNITS: UNITS, nodes: nodes, unlocked: unlocked, currentIndex: currentIndex };
})();
