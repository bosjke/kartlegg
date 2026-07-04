/* WQSRS — prototype spaced-repetition layer for Kartlegg.
   Tracks a memory strength per item, decayed by due dates; builds the daily
   session from the weakest / most overdue items; keeps streak + daily XP.
   All local (localStorage), no accounts. */
(function () {
  'use strict';

  var KEY = 'wq.srs.v1';
  /* days until next review, by strength level 0..5 */
  var INTERVALS = [0.5, 1, 3, 7, 14, 30];
  var DAY = 24 * 60 * 60 * 1000;
  var SESSION_SIZE = 12;

  var S = null;

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
           String(d.getDate()).padStart(2, '0');
  }
  function load() {
    if (S) return S;
    try { S = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { S = {}; }
    S.items = S.items || {};        /* 'countries|NOR' → {s,last,due} */
    S.streak = S.streak || { n: 0, last: null };
    S.xp = S.xp || { day: null, pts: 0 };
    S.daily = S.daily || { day: null, done: false };
    S.path = S.path || {};          /* nodeId → stars (1..3) */
    if (S.xp.day !== today()) { S.xp = { day: today(), pts: 0 }; }
    return S;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

  function record(cat, id, correct) {
    load();
    var k = cat + '|' + id;
    var it = S.items[k] || { s: 0, last: 0, due: 0 };
    it.s = correct ? Math.min(5, it.s + 1) : Math.max(0, it.s - 2);
    it.last = Date.now();
    it.due = Date.now() + INTERVALS[it.s] * DAY;
    S.items[k] = it;
    save();
  }
  function strength(cat, id) {
    load();
    var it = S.items[cat + '|' + id];
    if (!it) return null;
    /* overdue items count as weaker than their stored level */
    var overdueDays = Math.max(0, (Date.now() - it.due) / DAY);
    return Math.max(0, it.s - overdueDays / 7);
  }

  /* ── daily session ────────────────────────────────────────────────────── */
  function candidates(cat, records) {
    load();
    var now = Date.now();
    return records.map(function (r) {
      var it = S.items[cat + '|' + r.key];
      return {
        rec: r,
        seen: !!it,
        s: it ? it.s : -1,
        due: it ? it.due : Infinity,
        overdue: it ? Math.max(0, now - it.due) : 0
      };
    });
  }
  /* Segments of the day: weakest+overdue first, then new material. Returns
     an array of round setups (itemsOverride carries the exact items). */
  function buildDailySession(scope) {
    scope = scope || { type: 'continent', value: 'Europe' };
    var recs = WQData.countriesInScope(scope);
    var picks = { countries: [], flags: [], capitals: [] };
    var quota = { countries: 5, flags: 4, capitals: 3 };

    Object.keys(picks).forEach(function (cat) {
      var pool = recs.filter(function (r) {
        if (cat === 'flags') return !!r.flag;
        if (cat === 'capitals') return r.capital && r.capital.name_en && r.capital.lat != null;
        return true;
      });
      var cs = candidates(cat, pool);
      /* overdue / weak first */
      var review = cs.filter(function (c) { return c.seen && (c.overdue > 0 || c.s < 3); })
        .sort(function (a, b) { return (a.s - b.s) || (b.overdue - a.overdue); });
      var fresh = cs.filter(function (c) { return !c.seen; });
      var take = review.slice(0, quota[cat]);
      while (take.length < quota[cat] && fresh.length) {
        take.push(fresh.splice(Math.floor(Math.random() * fresh.length), 1)[0]);
      }
      /* pad with anything if the scope is small */
      var rest = cs.filter(function (c) { return take.indexOf(c) < 0; });
      while (take.length < quota[cat] && rest.length) take.push(rest.shift());
      picks[cat] = take.map(function (c) { return c.rec; });
    });

    var segs = [];
    if (picks.countries.length >= 2) {
      segs.push({ category: 'countries', mode: 'find', scope: scope, amount: null,
                  itemsOverride: picks.countries, tag: 'daily' });
    }
    if (picks.flags.length >= 2) {
      segs.push({ category: 'flags', mode: 'mc', mcCount: 4, scope: scope, amount: null,
                  itemsOverride: picks.flags, tag: 'daily' });
    }
    if (picks.capitals.length >= 2) {
      segs.push({ category: 'capitals', mode: 'mc', mcCount: 4, scope: scope, amount: null,
                  itemsOverride: picks.capitals, tag: 'daily' });
    }
    return segs;
  }

  /* ── streak / xp / path ───────────────────────────────────────────────── */
  function addXp(pts) {
    load();
    if (S.xp.day !== today()) S.xp = { day: today(), pts: 0 };
    S.xp.pts += pts;
    save();
  }
  function completeDaily() {
    load();
    var t = today();
    if (S.daily.day !== t || !S.daily.done) {
      var last = S.streak.last;
      if (last !== t) {
        var y = new Date(); y.setDate(y.getDate() - 1);
        var yest = y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' +
                   String(y.getDate()).padStart(2, '0');
        S.streak.n = (last === yest) ? S.streak.n + 1 : 1;
        S.streak.last = t;
      }
      S.daily = { day: t, done: true };
      save();
    }
    return S.streak.n;
  }
  function dailyDone() { load(); return S.daily.day === today() && S.daily.done; }
  function setNodeStars(id, stars) {
    load();
    if (!S.path[id] || stars > S.path[id]) { S.path[id] = stars; save(); }
  }

  window.WQSRS = {
    record: record,
    strength: strength,
    buildDailySession: buildDailySession,
    addXp: addXp,
    completeDaily: completeDaily,
    dailyDone: dailyDone,
    streak: function () { return load().streak.n; },
    xpToday: function () { load(); return S.xp.day === today() ? S.xp.pts : 0; },
    nodeStars: function (id) { return load().path[id] || 0; },
    setNodeStars: setNodeStars,
    _reset: function () { S = null; }
  };
})();
