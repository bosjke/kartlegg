/* Quiz engine — one generic round runner parameterized by category, mode,
   scope, prompt language and options (brief: “Notes for the builder”). */
(function () {
  'use strict';

  var t = function (k, v) { return WQI18n.t(k, v); };

  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  /* ── setup key for personal bests (category+mode+scope+amount+optioncount) ── */
  function setupKey(s) {
    if (s.tag) return 'tag:' + s.tag + '|' + s.category + '|' + s.mode;
    return [
      s.category, s.mode, s.outlineAnswer || s.capType || '-',
      s.scope.type + (s.scope.value ? ':' + s.scope.value : ''),
      s.amount == null ? '-' : s.amount,
      s.mcCount || '-'
    ].join('|');
  }

  /* ── per-item helpers ──────────────────────────────────────────────────── */
  function itemId(cat, item) {
    if (cat === 'provinces') return item.properties._id;
    if (cat === 'cities') return item.id;
    return item.key;
  }
  function labelFor(cat, item) {
    if (cat === 'endonyms') return WQI18n.endonym(item);
    if (cat === 'capitals') return WQI18n.capitalName(item);
    if (cat === 'provinces') return WQI18n.provinceName(item.properties);
    if (cat === 'cities') return WQI18n.cityName(item.countryKey, item.city);
    return WQI18n.countryName(item);      // countries, flags
  }
  function revealName(cat, item) {        // canonical spelling shown after each item
    if (cat === 'capitals') return WQI18n.capitalName(item) + ' — ' + WQI18n.countryName(item);
    return labelFor(cat, item);
  }
  /* Name of whatever shape/marker the player actually tapped (Find/Eliminate). */
  function pickedLabelFor(cat, id) {
    if (cat === 'provinces') {
      var fs = (WQData.provinces && WQData.provinces.features) || [];
      for (var i = 0; i < fs.length; i++) {
        if (fs[i].properties._id === id) return WQI18n.provinceName(fs[i].properties);
      }
      return null;
    }
    if (cat === 'cities') {
      var ix = String(id).indexOf(':');
      if (ix < 0) return null;
      var key = String(id).slice(0, ix), n = String(id).slice(ix + 1);
      var arr = WQData.cities[key] || [];
      for (var j = 0; j < arr.length; j++) {
        if (arr[j].n === n) return WQI18n.cityName(key, arr[j]);
      }
      return null;
    }
    var rec = WQData.countries[id];
    if (!rec) return null;
    if (cat === 'endonyms') return WQI18n.endonym(rec);
    return WQI18n.countryName(rec);       // countries, flags, capitals → country tapped
  }
  function capitalAliases(rec) {
    var c = rec.capital, out = [];
    if (!c) return out;
    [c.name_en, c.name_no, WQData.names.no_capitals[rec.key]].forEach(function (n) {
      if (!n) return;
      out.push(n);
      if (n.indexOf(',') !== -1) out.push(n.split(',')[0]);
      if (/\s(City|by)$/i.test(n)) out.push(n.replace(/\s(City|by)$/i, ''));
    });
    return out;
  }
  function aliasesFor(cat, item, sub) {
    if (cat === 'provinces') {
      var p = item.properties, out = [];
      (p.nl || '').split('|').forEach(function (x) { if (x.trim()) out.push(x.trim()); });
      if (p.n) out.push(p.n);
      if (p.ne) out.push(p.ne);
      return out;
    }
    if (cat === 'cities') {
      var arr = [item.city.n];
      var no = WQData.names.no_cities[item.countryKey + ':' + item.city.n];
      if (no) arr.push(no);
      return arr;
    }
    if (cat === 'capitals' && sub === 'toCapital') return capitalAliases(item);
    return item.aliases && item.aliases.length ? item.aliases : [labelFor(cat, item)];
  }

  /* ── Round ─────────────────────────────────────────────────────────────── */
  function Round(setup, ui) {
    this.s = setup;
    this.ui = ui;                    // {onFinish, onQuit}
    this.score = 0; this.correct = 0; this.attempts = 0; this.asked = 0;
    this.timer = null;
    this.done = false;
    /* 15 s per question, everywhere; the HUD chip toggles it mid-round */
    this.timerEnabled = localStorage.getItem('wq.timer.v1') !== 'off';
    this.qTimer = null; this.qRemain = 0;
    var self = this;
    var chip = document.getElementById('hud-timer');
    if (chip) chip.onclick = function () {
      self.timerEnabled = !self.timerEnabled;
      localStorage.setItem('wq.timer.v1', self.timerEnabled ? 'on' : 'off');
      if (!self.timerEnabled) self.clearQTimer();
      else if (!self.done && !self.currentResolved) self.startQTimer();
      self.renderTimerChip();
    };
  }

  Round.prototype.renderTimerChip = function () {
    var chip = document.getElementById('hud-timer');
    if (!chip) return;
    chip.textContent = '\u23f1 ' + t(this.timerEnabled ? 'timerOn' : 'timerOff');
    chip.className = this.timerEnabled ? '' : 'off';
  };
  Round.prototype.startQTimer = function () {
    this.clearQTimer();
    this.renderTimerChip();
    var track = document.getElementById('timer-track');
    var fill = document.getElementById('timer-fill');
    if (!this.timerEnabled) { if (track) track.classList.add('spent'); return; }
    var self = this;
    this.qRemain = 15;
    if (track && fill) {                       /* bar drains over 15 s */
      track.classList.remove('spent', 'urgent');
      fill.style.transition = 'none';
      fill.style.width = '100%';
      void fill.offsetWidth;                   /* reflow so the transition restarts */
      fill.style.transition = 'width 15s linear';
      fill.style.width = '0%';
    }
    this.qTimer = setInterval(function () {
      self.qRemain--;
      if (self.qRemain <= 5 && track) track.classList.add('urgent');
      if (self.qRemain <= 0) { self.clearQTimer(); self.timeUp(); }
    }, 1000);
  };
  Round.prototype.clearQTimer = function () {
    if (this.qTimer) { clearInterval(this.qTimer); this.qTimer = null; }
    var track = document.getElementById('timer-track');
    if (track) track.classList.add('spent');
  };

  /* Question expired: resolve as a miss, per mode. */
  Round.prototype.timeUp = function () {
    if (this.done || this.currentResolved) return;
    var s = this.s, cat = s.category, mode = s.mode, item = this.current;
    this.answered = true;
    var area = answerArea();
    area.querySelectorAll('button, input').forEach(function (x) { x.disabled = true; });
    if (mode === 'find' || mode === 'eliminate') {
      WQMap.clearPending();
      WQMap.markResult(itemId(cat, item), 'good');
      this.resolve(false, { mapDone: true, sub: t('timeUp') });
      return;
    }
    if (mode === 'locate') {
      var truth = cat === 'capitals' ? [item.capital.lat, item.capital.lng] : [item.city.lat, item.city.lng];
      WQMap.showLocateResult(null, L.latLng(truth[0], truth[1]));
      this.resolve(false, { points: 0, sub: t('timeUp'), mapDone: true, noAuto: true });
      return;
    }
    if (mode === 'reveal') {
      this.revealAll();
      this.resolve(false, { points: 0, sub: t('timeUp') });
      return;
    }
    if (mode === 'mc' && this._mcCorrectLabel != null) {   /* highlight the right choice */
      var correct = this._mcCorrectLabel;
      area.querySelectorAll('.mc-btn').forEach(function (b) {
        if (b.textContent === correct) b.classList.add('right'); else b.classList.add('faded');
      });
      this.resolve(false, { keepAnswers: true, sub: t('timeUp') });
      return;
    }
    this.resolve(false, { sub: t('timeUp') });             /* type / outline */
  };

  Round.prototype.isLocate = function () {
    return this.s.mode === 'locate';
  };

  Round.prototype.begin = function () {
    var s = this.s;
    this.scopeCountries = WQData.countriesInScope(s.scope);
    /* item pool */
    if (s.category === 'provinces') this.items = WQData.provincesInScope(s.scope);
    else if (s.category === 'cities') this.items = WQData.citiesInScope(s.scope);
    else {
      this.items = this.scopeCountries.filter(function (r) {
        if (s.category === 'capitals') return r.capital && r.capital.name_en && r.capital.lat != null;
        if (s.category === 'flags') return !!r.flag;
        return true;
      });
    }
    if (s.itemsOverride) this.items = s.itemsOverride.slice();   /* lessons / daily reps */
    this.items = shuffle(this.items);
    if (s.amount != null && s.amount !== 'all') this.items = this.items.slice(0, s.amount);
    this.total = this.items.length;
    this.queue = this.items.slice();
    if (s.category === 'flags' && typeof Image !== 'undefined') {
      this.items.forEach(function (r) { var im = new Image(); im.src = 'data/' + r.flag; });
    }
    this.failedIds = {};                /* eliminate: items missed at least once score 0 */
    /* max achievable score, for "10 / 20"-style displays */
    this.perItemMax = s.mode === 'reveal' ? 6 : (this.isLocate() ? 100 : 1);
    this.maxScore = this.total * this.perItemMax;

    /* one-time map scene for the round */
    this.mapNeeded = !((s.category === 'flags' && s.mode !== 'find' && s.mode !== 'eliminate') ||
                       (s.category === 'capitals' && s.mode === 'type' && s.capType === 'toCountry'));
    document.getElementById('map-wrap').classList.toggle('hidden', !this.mapNeeded);
    if (this.mapNeeded && s.mode !== 'outline') {
      this.buildScene();
      WQMap.fitScope(s.scope);            /* establishing shot: whole scope, very zoomed out */
    }
    if (this.mapNeeded) WQMap.invalidate();
    this.next();
  };

  Round.prototype.buildScene = function () {
    var s = this.s, cat = s.category, mode = s.mode;
    if (cat === 'provinces') {
      WQMap.showProvinces(WQData.provincesInScope(s.scope));
    } else if (cat === 'cities') {
      if (this.isLocate()) WQMap.showCountriesBackdrop(this.scopeCountries);
      else WQMap.showCityMarkers(WQData.citiesInScope(s.scope), this.scopeCountries);
    } else if (cat === 'capitals' && mode === 'locate') {
      WQMap.showCountriesBackdrop(this.scopeCountries);
    } else {
      WQMap.showCountries(this.scopeCountries);
    }
  };

  Round.prototype.hud = function () {
    var s = this.s;
    var progress;
    if (s.mode === 'eliminate') {
      var remaining = this.queue.length + (this.current && !this.currentResolved ? 1 : 0);
      progress = t('remaining', { i: remaining, n: this.total });
    } else {
      progress = t('question', { i: Math.min(this.asked + 1, this.total), n: this.total });
    }
    document.getElementById('hud-progress').textContent = progress;
    document.getElementById('hud-score').textContent = t('score', { s: this.score, m: this.maxScore });
  };

  Round.prototype.next = function () {
    if (this.done) return;
    this.clearTimer();
    if (!this.queue.length) { this.finish(); return; }
    this.current = this.queue.shift();
    this.currentResolved = false;
    this.hud();
    this.present();
  };

  /* ── presentation ─────────────────────────────────────────────────────── */
  function setPlate(eyebrow, prompt) {
    document.getElementById('plate-eyebrow').textContent = eyebrow || '';
    document.getElementById('plate-prompt').textContent = prompt || '';
  }
  function showFlag(rec, withCovers) {
    var media = document.getElementById('plate-media');
    var frame = document.getElementById('flag-frame');
    var img = document.getElementById('flag-img');
    var cover = document.getElementById('flag-cover');
    media.classList.remove('hidden'); frame.classList.remove('hidden');
    img.src = 'data/' + rec.flag;
    cover.innerHTML = '';
    if (withCovers) {
      for (var i = 0; i < 6; i++) {
        var c = document.createElement('div');
        c.className = 'cell';
        cover.appendChild(c);
      }
    }
  }
  function hideFlag() {
    document.getElementById('plate-media').classList.add('hidden');
    document.getElementById('flag-frame').classList.add('hidden');
  }
  function clearFeedback() {
    var fb = document.getElementById('feedback');
    fb.className = 'hidden'; fb.innerHTML = '';
  }
  function answerArea() { return document.getElementById('answer-area'); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  /* Briefly ignore taps on the answer area so a tap aimed at the previous
     screen's button (e.g. "Next") can't hit whatever now sits there
     (e.g. "Give up" in Reveal). */
  Round.prototype.guardAnswers = function (ms) {
    var area = answerArea();
    area.style.pointerEvents = 'none';
    if (this._guard) clearTimeout(this._guard);
    this._guard = setTimeout(function () { area.style.pointerEvents = ''; }, ms);
  };

  Round.prototype.present = function () {
    var s = this.s, cat = s.category, mode = s.mode, item = this.current, self = this;
    var id = itemId(cat, item);
    clearFeedback();
    hideFlag();
    answerArea().innerHTML = '';
    this.guardAnswers(450);          /* swallow leftover double-taps from the previous item */
    this.startQTimer();
    WQMap.onPendingChange = null;

    var clickKind = (cat === 'provinces') ? 'province' : (cat === 'cities') ? 'city' : 'country';

    if (mode === 'find' || mode === 'eliminate') {
      if (cat === 'flags') { setPlate(t('promptFindFlag'), ''); showFlag(item, false); }
      else {
        var ey = cat === 'countries' ? 'promptFindCountry' : cat === 'endonyms' ? 'promptFindEndonym'
               : cat === 'capitals' ? 'promptFindCapital' : cat === 'provinces' ? 'promptFindProvince' : 'promptFindCity';
        setPlate(t(ey), labelFor(cat, item));
      }
      this.mountConfirm(t('tapToConfirm'));
      WQMap.beginQuestion(clickKind, function (clickedId) { self.resolveClick(clickedId); });
      return;
    }

    if (mode === 'mc' || mode === 'type') {
      if (cat === 'flags') {
        setPlate(t('promptWhichFlag'), '');
        showFlag(item, false);
      } else if (cat === 'capitals' && mode === 'type' && s.capType === 'toCountry') {
        setPlate(t('promptTypeCountryOfCapital'), WQI18n.capitalName(item));
      } else if (cat === 'capitals' && mode === 'type') {
        setPlate(t('promptTypeCapitalOf'), WQI18n.countryName(item));
        WQMap.beginQuestion(null); WQMap.setTarget(id); WQMap.focusOn(id, { kind: 'country' });
      } else {
        var key = cat === 'endonyms' ? 'promptWhichEndonym'
                : cat === 'capitals' ? 'promptWhichCapital'
                : cat === 'provinces' ? 'promptWhichProvince'
                : cat === 'cities' ? 'promptWhichCity' : 'promptWhichHighlighted';
        setPlate(t(cat), t(key));
        WQMap.beginQuestion(null); WQMap.setTarget(id);
        WQMap.focusOn(id, { kind: cat === 'provinces' ? 'province' : 'country' });
      }
      if (mode === 'mc') this.mountMC(item);
      else this.mountType(item);
      return;
    }

    if (mode === 'outline') {
      setPlate(t('outlines'), t(cat === 'endonyms' ? 'promptOutlineEndonym' : 'promptOutline'));
      WQMap.showOutline(WQData.countryFeatures[item.key]);
      WQMap.beginQuestion(null);
      if (s.outlineAnswer === 'mc') this.mountMC(item);
      else this.mountType(item);
      return;
    }

    if (mode === 'locate') {
      var name = cat === 'capitals' ? WQI18n.capitalName(item) : WQI18n.cityName(item.countryKey, item.city);
      setPlate(t('promptLocate'), name);
      this.mountConfirm(t('tapPointConfirm'));
      WQMap.beginQuestion('point', function (latlng) { self.resolveLocate(latlng); });
      return;
    }

    if (mode === 'reveal') {
      setPlate(t('promptReveal'), '');
      showFlag(item, true);
      this.revealState = { wrong: 0, order: shuffle([0, 1, 2, 3, 4, 5]) };
      this.openRevealCell();             // 1 section visible at start
      this.mountReveal(item);
      return;
    }
  };

  /* ── answer inputs ────────────────────────────────────────────────────── */
  Round.prototype.mountConfirm = function (hint) {
    var area = answerArea();
    area.appendChild(el('div', 'hint-line', hint));
    var btn = el('button', 'big-btn', t('confirm'));
    btn.type = 'button'; btn.disabled = true;
    btn.addEventListener('click', function () { WQMap.confirmPending(); });
    area.appendChild(btn);
    WQMap.onPendingChange = function (has) { btn.disabled = !has; };
  };

  Round.prototype.mcPool = function () {
    var cat = this.s.category;
    if (cat === 'provinces') return WQData.provinces.features;
    if (cat === 'cities') return WQData.citiesInScope({ type: 'world' });
    if (cat === 'capitals') return WQData.countryList.filter(function (r) { return r.capital && r.capital.name_en; });
    return WQData.countryList;
  };
  Round.prototype.mcOptions = function (item) {
    var cat = this.s.category, n = Math.max(2, this.s.mcCount || 4);
    var correctLabel = labelFor(cat, item);
    var pool = this.mcPool();
    var contOf = function (x) {
      if (cat === 'provinces') return x.properties.c;                   // same country first
      if (cat === 'cities') return x.countryKey;
      return x.continent;
    };
    var mine = contOf(item);
    var near = [], far = [];
    shuffle(pool).forEach(function (x) {
      if (x === item) return;
      (contOf(x) === mine ? near : far).push(x);
    });
    if (cat === 'provinces' || cat === 'cities') {                      // then same continent
      var cc = WQData.countries[cat === 'provinces' ? item.properties.c : item.countryKey];
      var myCont = cc ? cc.continent : null;
      far.sort(function (a, b) {
        var ka = WQData.countries[cat === 'provinces' ? a.properties.c : a.countryKey];
        var kb = WQData.countries[cat === 'provinces' ? b.properties.c : b.countryKey];
        return ((kb && kb.continent === myCont) ? 1 : 0) - ((ka && ka.continent === myCont) ? 1 : 0);
      });
    }
    var labels = [correctLabel], seen = {};
    seen[WQNorm.normalize(correctLabel)] = true;
    near.concat(far).some(function (x) {
      var L2 = labelFor(cat, x);
      var k = WQNorm.normalize(L2);
      if (!L2 || seen[k]) return false;
      seen[k] = true; labels.push(L2);
      return labels.length >= n;
    });
    return { labels: shuffle(labels), correct: correctLabel };
  };

  Round.prototype.mountMC = function (item) {
    var self = this, opts = this.mcOptions(item);
    this._mcCorrectLabel = opts.correct;
    var grid = el('div', 'mc-grid' + (opts.labels.length <= 2 ? ' n2' : ''));
    opts.labels.forEach(function (label) {
      var b = el('button', 'mc-btn', label);
      b.type = 'button';
      b.addEventListener('click', function () {
        if (self.answered) return;
        self.answered = true;
        var correct = label === opts.correct;
        grid.querySelectorAll('button').forEach(function (x) {
          x.disabled = true;
          if (x.textContent === opts.correct) x.classList.add('right');
          else if (x === b && !correct) x.classList.add('wrong');
          else x.classList.add('faded');
        });
        self.resolve(correct, { keepAnswers: true });
      });
      grid.appendChild(b);
    });
    this.answered = false;
    answerArea().appendChild(grid);
  };

  Round.prototype.competitorAliases = function (item) {
    var s = this.s, cat = s.category, self = this;
    var pool;
    if (cat === 'provinces') pool = WQData.provincesInScope(s.scope);
    else if (cat === 'cities') pool = WQData.citiesInScope(s.scope);
    else pool = this.scopeCountries;
    var out = [];
    pool.forEach(function (x) {
      if (x === item) return;
      out.push(aliasesFor(cat, x, s.capType));
    });
    return out;
  };

  Round.prototype.mountType = function (item) {
    var self = this, s = this.s;
    var row = el('div', 'type-row');
    var input = document.createElement('input');
    input.type = 'text'; input.placeholder = t('typePlaceholder');
    input.autocapitalize = 'off'; input.autocomplete = 'off'; input.spellcheck = false;
    var btn = el('button', 'big-btn', t('submit'));
    btn.type = 'button';
    function submit() {
      var v = input.value.trim();
      if (!v || self.answered) return;
      self.answered = true;
      input.disabled = true; btn.disabled = true;
      var ok = WQNorm.matchAnswer(v, aliasesFor(s.category, item, s.capType), self.competitorAliases(item));
      self.resolve(ok, {});
    }
    btn.addEventListener('click', submit);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    row.appendChild(input); row.appendChild(btn);
    this.answered = false;
    answerArea().appendChild(row);
    setTimeout(function () { input.focus(); }, 50);
  };

  /* ── Reveal (flags, brief §6) ─────────────────────────────────────────── */
  Round.prototype.openRevealCell = function () {
    var cells = document.querySelectorAll('#flag-cover .cell');
    if (!cells.length) return 0;
    var idx = this.revealState.order.find(function (i) {
      return !cells[i].classList.contains('open');
    });
    if (idx != null) cells[idx].classList.add('open');
    var open = 0;
    cells.forEach(function (c) { if (c.classList.contains('open')) open++; });
    return open;
  };
  Round.prototype.revealAll = function () {
    document.querySelectorAll('#flag-cover .cell').forEach(function (c) { c.classList.add('open'); });
  };
  Round.prototype.mountReveal = function (item) {
    var self = this;
    var row = el('div', 'type-row');
    var input = document.createElement('input');
    input.type = 'text'; input.placeholder = t('typePlaceholder');
    input.autocapitalize = 'off'; input.autocomplete = 'off'; input.spellcheck = false;
    var btn = el('button', 'big-btn', t('submit'));
    btn.type = 'button';
    var missBtn = el('button', 'big-btn subtle', t('revealOne'));
    missBtn.type = 'button';
    var quitBtn = el('button', 'big-btn subtle', t('giveUp'));
    quitBtn.type = 'button';

    function miss() {
      self.revealState.wrong++;
      self.openRevealCell();
      if (self.revealState.wrong >= 6) { end(false); return; }
      input.value = ''; input.focus();
    }
    function end(correct) {
      if (self.answered) return;
      self.answered = true;
      input.disabled = btn.disabled = missBtn.disabled = quitBtn.disabled = true;
      self.revealAll();
      var pts = correct ? Math.max(0, 6 - self.revealState.wrong) : 0;
      self.resolve(correct, { points: pts, sub: correct ? ('+' + pts) : '' });
    }
    function submit() {
      var v = input.value.trim();
      if (!v || self.answered) return;
      var ok = WQNorm.matchAnswer(v, aliasesFor('flags', item), self.competitorAliases(item));
      if (ok) end(true); else miss();
    }
    btn.addEventListener('click', submit);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    missBtn.addEventListener('click', function () { if (!self.answered) miss(); });
    quitBtn.addEventListener('click', function () { end(false); });

    row.appendChild(input); row.appendChild(btn);
    this.answered = false;
    var area = answerArea();
    area.appendChild(row);
    var extra = el('div', 'mc-grid n2');
    extra.appendChild(missBtn); extra.appendChild(quitBtn);
    area.appendChild(extra);
    setTimeout(function () { input.focus(); }, 50);
  };

  /* ── resolution / reveal-the-answer (brief §7, every mode) ───────────── */
  Round.prototype.resolveClick = function (clickedId) {
    var item = this.current, cat = this.s.category;
    var correctId = itemId(cat, item);
    var ok = clickedId === correctId;
    WQMap.clearPending();
    WQMap.markResult(correctId, 'good');
    if (!ok) WQMap.markResult(clickedId, 'bad');
    var opts = { mapDone: true, pickedLabel: ok ? null : pickedLabelFor(cat, clickedId) };
    if (ok && this.s.mode === 'eliminate' && this.failedIds[correctId]) {
      opts.points = 0; opts.countCorrect = false;          /* cleared on retry */
      opts.sub = t('retryNoPoint');
    }
    this.resolve(ok, opts);
  };

  Round.prototype.resolveLocate = function (latlng) {
    var item = this.current, cat = this.s.category;
    var truth = cat === 'capitals'
      ? [item.capital.lat, item.capital.lng]
      : [item.city.lat, item.city.lng];
    var countryKey = cat === 'capitals' ? item.key : item.countryKey;
    var guessPt = turf.point([latlng.lng, latlng.lat]);
    var truthPt = turf.point([truth[1], truth[0]]);
    var km = Math.round(turf.distance(guessPt, truthPt, { units: 'kilometers' }));
    var proximity = Math.max(0, Math.min(50, Math.round(50 * (1 - km / 2500))));
    var inside = false;
    var feat = WQMap.countryFeature(countryKey);
    if (feat) { try { inside = turf.booleanPointInPolygon(guessPt, feat); } catch (e) {} }
    var pts = proximity + (inside ? 50 : 0);
    WQMap.showLocateResult(latlng, L.latLng(truth[0], truth[1]));
    var sub = t('distanceAway', { km: km }) + (inside ? ' · ' + t('insideBonus') : '') + ' · +' + pts;
    this.resolve(pts > 0, { points: pts, sub: sub, mapDone: true, noAuto: true, countCorrect: inside || km < 300 });
  };

  Round.prototype.resolve = function (correct, opts) {
    opts = opts || {};
    var self = this, s = this.s, item = this.current, cat = s.category;
    var id = itemId(cat, item);
    this.clearTimer();
    this.clearQTimer();
    this.currentResolved = true;
    if (window.WQSRS && item) {
      try { WQSRS.record(cat, itemId(cat, item), !!(correct && opts.countCorrect !== false)); } catch (e) {}
    }
    WQMap.lock && WQMap.lock();
    this.asked++;
    this.attempts++;
    var counted = (opts.countCorrect != null) ? opts.countCorrect : correct;
    if (counted) this.correct++;
    this.score += (opts.points != null) ? opts.points : (correct ? 1 : 0);

    /* always reveal the correct answer, right or wrong */
    if (this.mapNeeded && !opts.mapDone && s.mode !== 'outline') {
      WQMap.markResult(id, 'good');                 // always show where it was
    }
    if (cat === 'flags') { showFlag(item, false); } // complete flag, always
    var fb = document.getElementById('feedback');
    fb.className = correct ? 'good' : 'bad';
    var markText;
    if (correct) markText = '✓ ' + t('correct') + ' — ';
    else if (opts.pickedLabel) markText = '✗ ' + t('youPicked', { x: opts.pickedLabel }) + ' ';
    else markText = '✗ ' + t('wrongWas') + ' ';
    fb.innerHTML = '';
    var line = el('div', null);
    line.appendChild(el('span', 'fb-mark', markText));
    line.appendChild(el('span', 'fb-word', revealName(cat, item)));
    fb.appendChild(line);
    if (opts.sub) fb.appendChild(el('span', 'fb-sub', opts.sub));
    var pool = t(correct ? 'judgeGood' : 'judgeBad');
    if (Array.isArray(pool) && pool.length) {              /* the regime weighs in */
      var v = pool[Math.floor(Math.random() * pool.length)];
      fb.appendChild(el('span', 'fb-judge', '\u00ab' + v[0] + '\u00bb \u2014 ' + v[1]));
    }

    /* eliminate bookkeeping */
    var eliminated = false;
    if (s.mode === 'eliminate') {
      if (correct) { WQMap.markEliminated(id); eliminated = true; }
      else { this.failedIds[id] = true; this.queue.push(item); }   /* re-queued, worth 0 now */
    }

    this.hud();

    if (!opts.keepAnswers) answerArea().innerHTML = '';
    this.guardAnswers(350);
    var nextBtn = el('button', 'big-btn', t('next'));
    nextBtn.type = 'button';
    nextBtn.addEventListener('click', function () { self.next(); });
    var wrap = el('div', null); wrap.style.textAlign = 'center'; wrap.appendChild(nextBtn);
    answerArea().appendChild(wrap);

    if (opts.noAuto) return;                              /* locate: wait for Next */
    var delay = correct ? 1600 : 2600;
    if (opts.slow) delay = 3200;
    if (cat === 'flags') delay = Math.max(delay, 2400);   // let the full flag sink in
    this.timer = setTimeout(function () { self.next(); }, delay);
  };

  Round.prototype.clearTimer = function () {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  };

  Round.prototype.finish = function () {
    this.done = true;
    this.clearTimer();
    this.clearQTimer();
    var key = setupKey(this.s);
    var prevBest = WQData.getBest(key);
    var isNew = WQData.saveBest(key, this.score);
    var stats = {
      score: this.score, max: this.maxScore, correct: this.correct, total: this.total,
      attempts: this.attempts,
      accuracy: this.attempts ? Math.round(100 * this.correct / this.attempts) : 0,
      best: Math.max(this.score, prevBest == null ? -Infinity : prevBest),
      newBest: isNew, setupKey: key
    };
    if (this.ui.onFinish) this.ui.onFinish(stats);
  };

  Round.prototype.abort = function () {
    this.done = true;
    this.clearTimer();
    this.clearQTimer();
    WQMap.onPendingChange = null;
  };

  window.WQQuiz = { Round: Round, setupKey: setupKey };
})();
