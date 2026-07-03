/* Screens and navigation: start → categories → setup → mode → ready → round → end. */
(function () {
  'use strict';

  var t = function (k, v) { return WQI18n.t(k, v); };
  var AMOUNTS = [10, 25, 50, 100, 150];
  var MODES = {
    countries: ['find', 'eliminate', 'mc', 'type', 'outline'],
    endonyms:  ['find', 'eliminate', 'mc', 'type', 'outline'],
    capitals:  ['find', 'eliminate', 'mc', 'type', 'locate'],
    flags:     ['find', 'eliminate', 'mc', 'type', 'reveal'],
    provinces: ['find', 'eliminate', 'mc', 'type'],
    cities:    ['locate', 'eliminate', 'mc', 'type']  /* locate = tap the spot, geoguessr-style */
  };
  var SCOPE_AMOUNT_CATS = { countries: 1, endonyms: 1, capitals: 1, flags: 1 };

  var state = {};
  var currentRound = null;

  /* ── theme (dark default) ─────────────────────────────────────────────── */
  var theme = localStorage.getItem('wq.theme') === 'light' ? 'light' : 'dark';
  function applyTheme(th) {
    theme = th === 'light' ? 'light' : 'dark';
    document.body.dataset.theme = theme;
    localStorage.setItem('wq.theme', theme);
  }
  applyTheme(theme);

  /* ── tiny DOM helpers ─────────────────────────────────────────────────── */
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function menuBtn(label, note, onClick, cls) {
    var b = el('button', 'menu-btn' + (cls ? ' ' + cls : ''));
    b.type = 'button';
    var l = el('span', 'b-label', label);
    b.appendChild(l);
    if (note != null) b.appendChild(el('span', 'b-note', String(note)));
    b.addEventListener('click', onClick);
    return b;
  }
  function root() { return document.getElementById('menu-root'); }
  function screen(name) {
    ['loading', 'menu', 'round'].forEach(function (s) {
      document.getElementById('screen-' + s).classList.toggle('hidden', s !== name);
    });
  }
  function header(container, eyebrow, title, onBack) {
    if (onBack) {
      var row = el('div', 'back-row');
      var b = el('button', 'ghost-btn', t('back'));
      b.type = 'button';
      b.addEventListener('click', onBack);
      row.appendChild(b);
      container.appendChild(row);
    }
    if (eyebrow) container.appendChild(el('p', 'eyebrow', eyebrow));
    if (title) container.appendChild(el('h2', 'title', title));
  }

  /* ── item availability helpers ────────────────────────────────────────── */
  function poolSize(category, scope) {
    var list = WQData.countriesInScope(scope);
    if (category === 'capitals') return list.filter(function (r) { return r.capital && r.capital.name_en && r.capital.lat != null; }).length;
    if (category === 'flags') return list.filter(function (r) { return !!r.flag; }).length;
    if (category === 'provinces') {
      var n = 0; list.forEach(function (r) { n += (WQData.provincesByCountry[r.key] || []).length; });
      return n;
    }
    if (category === 'cities') {
      var m = 0; list.forEach(function (r) { m += (WQData.cities[r.key] || []).length; });
      return m;
    }
    return list.length;
  }

  /* ── screens ──────────────────────────────────────────────────────────── */
  function showStart() {
    screen('menu');
    var r = root(); r.innerHTML = '';
    r.classList.add('center');
    r.appendChild(el('div', 'brand-rose'));
    r.appendChild(el('p', 'eyebrow', t('tagline')));
    r.appendChild(el('h1', 'title', t('appTitle')));
    var toggle = el('div', 'lang-toggle');
    ['no', 'en'].forEach(function (l) {
      var b = el('button', WQI18n.lang === l ? 'on' : '', l === 'no' ? 'Norsk' : 'English');
      b.type = 'button';
      b.addEventListener('click', function () { WQI18n.setLang(l); showStart(); });
      toggle.appendChild(b);
    });
    r.appendChild(toggle);
    var themeToggle = el('div', 'lang-toggle');
    [['dark', t('themeDark')], ['light', t('themeLight')]].forEach(function (pair) {
      var b = el('button', theme === pair[0] ? 'on' : '', pair[1]);
      b.type = 'button';
      b.addEventListener('click', function () { applyTheme(pair[0]); showStart(); });
      themeToggle.appendChild(b);
    });
    r.appendChild(themeToggle);
    var list = el('div', 'menu-list');
    list.appendChild(menuBtn(t('play'), null, showCategories, 'primary'));
    r.appendChild(list);
  }

  function showCategories() {
    state = {};
    screen('menu');
    var r = root(); r.innerHTML = ''; r.classList.remove('center');
    header(r, t('appTitle'), t('chooseCategory'), showStart);
    var list = el('div', 'menu-list');
    ['countries', 'endonyms', 'capitals', 'flags', 'provinces', 'cities'].forEach(function (cat, ci) {
      list.appendChild(menuBtn(t(cat), null, function () {
        state.category = cat;
        if (cat === 'provinces' || cat === 'cities') {
          if (cat === 'provinces' && !WQData.provinces) {
            r.innerHTML = '';
            header(r, t(cat), '…');
            WQData.loadProvinces().then(showRegionDrilldown);
          } else if (cat === 'cities') {
            showRegionDrilldown();
          } else {
            showRegionDrilldown();
          }
        } else {
          showScope();
        }
      }, ci === 0 ? 'primary' : null));
    });
    r.appendChild(list);
  }

  /* scope + amount (Countries, Endonyms, Capitals, Flags) */
  function showScope() {
    var r = root(); r.innerHTML = '';
    header(r, t(state.category), t('chooseScope'), showCategories);
    var list = el('div', 'menu-list');
    list.appendChild(menuBtn(t('allCountries'), poolSize(state.category, { type: 'world' }), function () {
      state.scope = { type: 'world' };
      showAmount();
    }, 'primary'));
    WQData.continents.forEach(function (c) {
      var n = poolSize(state.category, { type: 'continent', value: c });
      if (!n) return;
      list.appendChild(menuBtn(WQI18n.continentName(c), n, function () {
        state.scope = { type: 'continent', value: c };
        showAmount();
      }));
    });
    r.appendChild(list);
  }

  function showAmount() {
    var r = root(); r.innerHTML = '';
    var n = poolSize(state.category, state.scope);
    header(r, t(state.category), t('chooseAmount'), showScope);
    var grid = el('div', 'grid-2');
    AMOUNTS.filter(function (a) { return a < n; }).forEach(function (a) {
      grid.appendChild(menuBtn(String(a), null, function () {
        state.amount = a; showMode();
      }, 'small'));
    });
    grid.appendChild(menuBtn(t('all'), n, function () {
      state.amount = 'all'; showMode();
    }, 'small primary'));
    r.appendChild(grid);
  }

  /* region drill-down, no amount (Provinces, Cities) */
  function showRegionDrilldown() {
    var r = root(); r.innerHTML = '';
    header(r, t(state.category), t('chooseScope'), showCategories);
    var list = el('div', 'menu-list');
    list.appendChild(menuBtn(t('wholeWorld'), poolSize(state.category, { type: 'world' }), function () {
      state.scope = { type: 'world' }; state.amount = null; showMode();
    }, 'primary'));
    WQData.continents.forEach(function (c) {
      var n = poolSize(state.category, { type: 'continent', value: c });
      if (!n) return;
      list.appendChild(menuBtn(WQI18n.continentName(c), n + ' ›', function () {
        showCountryDrilldown(c);
      }));
    });
    r.appendChild(list);
  }

  function showCountryDrilldown(continent) {
    var r = root(); r.innerHTML = '';
    header(r, t(state.category), WQI18n.continentName(continent), showRegionDrilldown);
    var list = el('div', 'menu-list');
    list.appendChild(menuBtn(t('allOf', { x: WQI18n.continentName(continent) }),
      poolSize(state.category, { type: 'continent', value: continent }), function () {
        state.scope = { type: 'continent', value: continent }; state.amount = null; showMode();
      }));
    WQData.countriesInScope({ type: 'continent', value: continent })
      .slice()
      .sort(function (a, b) { return WQI18n.countryName(a).localeCompare(WQI18n.countryName(b)); })
      .forEach(function (rec) {
        var n = poolSize(state.category, { type: 'country', value: rec.key });
        if (!n) return;
        list.appendChild(menuBtn(WQI18n.countryName(rec), n, function () {
          state.scope = { type: 'country', value: rec.key }; state.amount = null; showMode();
        }, 'small'));
      });
    r.appendChild(list);
  }

  /* modes */
  function showMode() {
    var r = root(); r.innerHTML = '';
    var backTo = SCOPE_AMOUNT_CATS[state.category] ? showAmount : showRegionDrilldown;
    header(r, t(state.category), t('chooseMode'), backTo);
    var list = el('div', 'menu-list');
    MODES[state.category].forEach(function (m, mi) {
      var needsSub = m === 'mc' || m === 'outline' || (m === 'type' && state.category === 'capitals');
      var note = needsSub ? null
        : bestNoteFor(candidate({ mode: m, mcCount: null, outlineAnswer: null, capType: null }));
      list.appendChild(menuBtn(t(m), note, function () {
        state.mode = m;
        state.mcCount = null; state.outlineAnswer = null; state.capType = null;
        if (m === 'mc') showMcCount(showReady);
        else if (m === 'outline') showOutlineAnswer();
        else if (m === 'type' && state.category === 'capitals') showCapTypeSub();
        else showReady();
      }, mi === 0 ? 'primary' : null));
    });
    r.appendChild(list);
  }

  function showMcCount(after) {
    var r = root(); r.innerHTML = '';
    header(r, t('mc'), t('options', { n: '2 / 4 / 6 / 8' }), showMode);
    var max = poolSize(state.category, state.scope);
    var grid = el('div', 'grid-2');
    [2, 4, 6, 8].forEach(function (n) {
      if (n > max) return;
      var note = state.mode === 'mc' ? bestNoteFor(candidate({ mcCount: n })) : null;
      grid.appendChild(menuBtn(t('options', { n: n }), note, function () {
        state.mcCount = n; after();
      }, n === 4 ? 'small primary' : 'small'));
    });
    r.appendChild(grid);
  }

  function showOutlineAnswer() {
    var r = root(); r.innerHTML = '';
    header(r, t('outlines'), t('chooseMode'), showMode);
    var list = el('div', 'menu-list');
    list.appendChild(menuBtn(t('mc'), null, function () {
      state.outlineAnswer = 'mc';
      showMcCount(showReady);
    }, 'primary'));
    list.appendChild(menuBtn(t('type'), bestNoteFor(candidate({ outlineAnswer: 'type' })), function () {
      state.outlineAnswer = 'type'; showReady();
    }));
    r.appendChild(list);
  }

  function showCapTypeSub() {
    var r = root(); r.innerHTML = '';
    header(r, t('type'), t('chooseMode'), showMode);
    var list = el('div', 'menu-list');
    list.appendChild(menuBtn(t('capTypeToCapital'), bestNoteFor(candidate({ capType: 'toCapital' })), function () {
      state.capType = 'toCapital'; showReady();
    }, 'primary'));
    list.appendChild(menuBtn(t('capTypeToCountry'), bestNoteFor(candidate({ capType: 'toCountry' })), function () {
      state.capType = 'toCountry'; showReady();
    }));
    r.appendChild(list);
  }

  /* ready + best (brief §7: show current best on the setup screen) */
  function summaryText() {
    var parts = [t(state.category), t(state.mode)];
    if (state.outlineAnswer) parts.push(t(state.outlineAnswer === 'mc' ? 'mc' : 'type'));
    if (state.capType) parts.push(t(state.capType === 'toCountry' ? 'capTypeToCountry' : 'capTypeToCapital'));
    if (state.mcCount) parts.push(t('options', { n: state.mcCount }));
    if (state.scope.type === 'world') parts.push(SCOPE_AMOUNT_CATS[state.category] ? t('allCountries') : t('wholeWorld'));
    else if (state.scope.type === 'continent') parts.push(WQI18n.continentName(state.scope.value));
    else parts.push(WQI18n.countryName(WQData.countries[state.scope.value]));
    if (state.amount != null) parts.push(state.amount === 'all' ? t('all') : String(state.amount));
    return parts.join(' · ');
  }

  function maxScoreFor(st) {
    st = st || state;
    var n = poolSize(st.category, st.scope);
    if (st.amount != null && st.amount !== 'all') n = Math.min(n, st.amount);
    var perItem = st.mode === 'reveal' ? 6 : st.mode === 'locate' ? 100 : 1;
    return n * perItem;
  }
  /* "12/20" note for a menu button, "★ 20/20" at 100% — null if never played */
  function bestNoteFor(st) {
    var best = WQData.getBest(WQQuiz.setupKey(st));
    if (best == null) return null;
    var max = maxScoreFor(st);
    return (best >= max ? '\u2605 ' : '') + best + '/' + max;
  }
  function candidate(extra) {
    var st = { category: state.category, mode: state.mode, scope: state.scope,
               amount: state.amount, mcCount: state.mcCount,
               outlineAnswer: state.outlineAnswer, capType: state.capType };
    Object.keys(extra || {}).forEach(function (k) { st[k] = extra[k]; });
    return st;
  }

  function showReady() {
    var r = root(); r.innerHTML = '';
    header(r, t(state.category), t('ready'), showMode);
    r.appendChild(el('p', 'dim', summaryText()));
    var best = WQData.getBest(WQQuiz.setupKey(state));
    var note = el('div', 'best-note');
    if (best != null) {
      var mx = maxScoreFor();
      note.innerHTML = t('bestSoFar', { n: '<strong>' + (best >= mx ? '\u2605 ' : '') + best + ' / ' + mx + '</strong>' });
    }
    else note.textContent = t('noBest');
    r.appendChild(note);
    var list = el('div', 'menu-list');
    list.appendChild(menuBtn(t('start'), null, startRound, 'primary'));
    r.appendChild(list);
  }

  /* ── round / end ──────────────────────────────────────────────────────── */
  function startRound() {
    screen('round');
    WQMap.init();
    var setup = {
      category: state.category, mode: state.mode, scope: state.scope,
      amount: state.amount, mcCount: state.mcCount,
      outlineAnswer: state.outlineAnswer, capType: state.capType
    };
    currentRound = new WQQuiz.Round(setup, { onFinish: showEnd });
    currentRound.begin();
  }

  function showEnd(stats) {
    currentRound = null;
    screen('menu');
    var r = root(); r.innerHTML = '';
    header(r, t(state.category), t('roundDone'));
    r.appendChild(el('p', 'dim', summaryText()));
    if (stats.newBest) r.appendChild(el('div', 'newbest', '★ ' + t('newBest')));
    var rows = [
      [t('totalScore'), stats.score + ' / ' + stats.max],
      [t('correctOf'), stats.correct + ' / ' + stats.total],
      [t('accuracy'), stats.accuracy + ' %'],
      [t('best'), (stats.best >= stats.max ? '\u2605 ' : '') + stats.best + ' / ' + stats.max]
    ];
    rows.forEach(function (row) {
      var d = el('div', 'stat-block');
      d.appendChild(el('span', null, row[0]));
      d.appendChild(el('span', 'v', String(row[1])));
      r.appendChild(d);
    });
    var list = el('div', 'menu-list');
    list.appendChild(menuBtn(t('replay'), null, startRound, 'primary'));
    list.appendChild(menuBtn(t('toMenu'), null, showCategories));
    r.appendChild(list);
  }

  document.getElementById('hud-quit').addEventListener('click', function () {
    if (!currentRound) { showCategories(); screen('menu'); return; }
    if (confirm(t('quitConfirm'))) {
      currentRound.abort(); currentRound = null;
      showCategories();
    }
  });

  window.WQUI = { showStart: showStart };
})();
