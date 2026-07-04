/* Language handling.
   UI chrome + default prompt language follow the global toggle (no/en).
   Province names are always native (name_local → name → name_en).
   Endonyms are always the country's own-language name.
   Every lookup falls back and never renders blank. */
(function () {
  'use strict';

  var STR = {
    en: {
      appTitle: 'MapOut', tagline: 'Map it out.',
      play: 'Play', back: '‹ Back', chooseCategory: 'Choose a category',
      countries: 'Countries', endonyms: 'Endonyms', capitals: 'Capitals',
      flags: 'Flags', provinces: 'Provinces', cities: 'Cities',
      chooseScope: 'Choose a scope', allCountries: 'All countries',
      wholeWorld: 'Whole world', allOf: 'All of {x}',
      chooseAmount: 'How many questions?', all: 'All',
      chooseMode: 'Choose a mode',
      find: 'Find', eliminate: 'Eliminate', mc: 'Multiple choice', type: 'Type answer',
      outlines: 'Outlines', locate: 'Locate', reveal: 'Reveal',
      options: '{n} options', capTypeToCountry: 'Country it’s in', capTypeToCapital: 'Capital of country',
      ready: 'Ready?', start: 'Start round', bestSoFar: 'Personal best for this setup: {n}',
      noBest: 'No personal best yet for this setup.',
      question: 'Question {i} of {n}', remaining: 'Remaining {i} of {n}', score: 'Score {s} / {m}',
      confirm: 'Confirm', next: 'Next ›', submit: 'Answer', giveUp: 'Give up',
      revealOne: 'Reveal a section (counts as a miss)',
      typePlaceholder: 'Type your answer…',
      correct: 'Correct', wrongWas: 'It was', youPicked: 'You tapped {x} — it was',
      distanceAway: '{km} km from the target', insideBonus: '+50 country bonus',
      roundDone: 'Round complete', totalScore: 'Total score', correctOf: 'Correct answers',
      accuracy: 'Accuracy', best: 'Personal best', newBest: 'New personal best!',
      replay: 'Replay same setup', toMenu: 'Back to menu',
      quitConfirm: 'Leave this round?',
      promptFindCountry: 'Find this country', promptFindEndonym: 'Find this country (own-language name)',
      promptFindCapital: 'Which country has this capital? Tap it', promptFindFlag: 'Whose flag? Tap the country',
      promptFindProvince: 'Find this province', promptFindCity: 'Find this city',
      promptWhichHighlighted: 'Which country is highlighted?',
      promptWhichEndonym: 'Own-language name of the highlighted country?',
      promptWhichCapital: 'Capital of the highlighted country?',
      promptWhichProvince: 'Which province is highlighted?',
      promptWhichCity: 'Which city is marked?',
      promptWhichFlag: 'Which country’s flag is this?',
      promptOutline: 'Which country has this outline?',
      promptOutlineEndonym: 'Own-language name of this outline?',
      promptTypeCountryOfCapital: 'Which country is this the capital of?',
      promptTypeCapitalOf: 'Type the capital of',
      promptLocate: 'Tap the map where this is',
      promptReveal: 'Name the country of this flag',
      tapToConfirm: 'Tap a shape, then confirm',
      tapPointConfirm: 'Tap a point, then confirm',
      timeUp: 'Time\u2019s up', timerOff: 'off', timerOn: 'on',
      retryNoPoint: 'cleared on retry \u2014 no point',
      themeDark: 'Dark', themeLight: 'Light',
      dailySession: 'Daily session', dailyExtra: 'Extra session', reviewSession: 'Smart review',
      continuePath: 'Continue', lesCountries: 'Countries', lesLesson: 'Lesson {n}', lesCheckpoint: 'Checkpoint', sessionDone: 'Session complete',
      streakLabel: 'day streak', streakDays: '{n} days in a row', xpEarned: 'XP earned',
      xpToday: '{n} / {g} XP today', pathTitle: 'Learning path \u00b7 Europe', freePlay: 'Free practice',
      countriesShort: 'countries', backToMenu: 'Back to menu',
      node_norden: 'The Nordics', node_vest: 'Western Europe', node_sor: 'Southern Europe',
      node_balkan: 'The Balkans', node_ost: 'Eastern Europe',
      judgeGood: [
        ['Magnificent. I shall rename a boulevard in your honor.', 'Generalissimo Kartov'],
        ['Correct. The Ministry of Maps applauds \u2014 once.', 'Generalissimo Kartov'],
        ['Yes. You may keep your atlas privileges.', 'Generalissimo Kartov'],
        ['Precisely so. I am\u2026 almost pleased.', 'Chancellor Atlasova'],
        ['Correct. Your statue shall face the sea.', 'Chancellor Atlasova'],
        ['Splendid. The parade may proceed.', 'Chancellor Atlasova']
      ],
      judgeBad: [
        ['WRONG. The cartographers weep in their bunker.', 'Generalissimo Kartov'],
        ['Incorrect. Your globe privileges are revoked.', 'Generalissimo Kartov'],
        ['No! Even my parrot knew this one.', 'Generalissimo Kartov'],
        ['Wrong. Report for remedial geography at dawn.', 'Chancellor Atlasova'],
        ['Incorrect. The Bureau of Borders is not amused.', 'Chancellor Atlasova'],
        ['Disappointing. I have banished interns for less.', 'Chancellor Atlasova']
      ],
      continentNames: { 'Africa': 'Africa', 'Asia': 'Asia', 'Europe': 'Europe',
        'North America': 'North America', 'South America': 'South America',
        'Oceania': 'Oceania', 'Antarctica': 'Antarctica' }
    },
    no: {
      appTitle: 'Kartlegg', tagline: 'Kart utenat.',
      play: 'Spill', back: '‹ Tilbake', chooseCategory: 'Velg kategori',
      countries: 'Land', endonyms: 'Endonymer', capitals: 'Hovedsteder',
      flags: 'Flagg', provinces: 'Provinser', cities: 'Byer',
      chooseScope: 'Velg omfang', allCountries: 'Alle land',
      wholeWorld: 'Hele verden', allOf: 'Hele {x}',
      chooseAmount: 'Hvor mange spørsmål?', all: 'Alle',
      chooseMode: 'Velg modus',
      find: 'Finn', eliminate: 'Eliminer', mc: 'Flervalg', type: 'Skriv svaret',
      outlines: 'Omriss', locate: 'Plasser', reveal: 'Avslør',
      options: '{n} alternativer', capTypeToCountry: 'Landet den ligger i', capTypeToCapital: 'Hovedstaden i landet',
      ready: 'Klar?', start: 'Start runden', bestSoFar: 'Personlig rekord for dette oppsettet: {n}',
      noBest: 'Ingen personlig rekord for dette oppsettet ennå.',
      question: 'Spørsmål {i} av {n}', remaining: 'Gjenstår {i} av {n}', score: 'Poeng {s} / {m}',
      confirm: 'Bekreft', next: 'Neste ›', submit: 'Svar', giveUp: 'Gi opp',
      revealOne: 'Avslør en rute (teller som bom)',
      typePlaceholder: 'Skriv svaret ditt…',
      correct: 'Riktig', wrongWas: 'Det var', youPicked: 'Du trykket {x} — det var',
      distanceAway: '{km} km fra målet', insideBonus: '+50 landbonus',
      roundDone: 'Runden er ferdig', totalScore: 'Totalpoeng', correctOf: 'Riktige svar',
      accuracy: 'Treffsikkerhet', best: 'Personlig rekord', newBest: 'Ny personlig rekord!',
      replay: 'Spill samme oppsett igjen', toMenu: 'Tilbake til menyen',
      quitConfirm: 'Avslutte runden?',
      promptFindCountry: 'Finn dette landet', promptFindEndonym: 'Finn dette landet (eget språk)',
      promptFindCapital: 'Hvilket land har denne hovedstaden? Trykk på det', promptFindFlag: 'Hvem sitt flagg? Trykk på landet',
      promptFindProvince: 'Finn denne provinsen', promptFindCity: 'Finn denne byen',
      promptWhichHighlighted: 'Hvilket land er markert?',
      promptWhichEndonym: 'Navnet på det markerte landet, på landets eget språk?',
      promptWhichCapital: 'Hovedstaden i det markerte landet?',
      promptWhichProvince: 'Hvilken provins er markert?',
      promptWhichCity: 'Hvilken by er markert?',
      promptWhichFlag: 'Hvilket lands flagg er dette?',
      promptOutline: 'Hvilket land har dette omrisset?',
      promptOutlineEndonym: 'Navnet på dette omrisset, på landets eget språk?',
      promptTypeCountryOfCapital: 'Hvilket land er dette hovedstaden i?',
      promptTypeCapitalOf: 'Skriv hovedstaden i',
      promptLocate: 'Trykk på kartet der dette ligger',
      promptReveal: 'Hvilket land har dette flagget?',
      tapToConfirm: 'Trykk på en form, og bekreft',
      tapPointConfirm: 'Trykk på et punkt, og bekreft',
      timeUp: 'Tiden er ute', timerOff: 'av', timerOn: 'p\u00e5',
      retryNoPoint: 'l\u00f8st p\u00e5 nytt \u2014 ingen poeng',
      themeDark: 'Mørk', themeLight: 'Lys',
      judgeGood: [
        ['Storslått. Jeg oppkaller en aveny etter deg.', 'Generalissimo Kartov'],
        ['Riktig. Kartdepartementet applauderer — én gang.', 'Generalissimo Kartov'],
        ['Ja. Du får beholde atlasprivilegiene dine.', 'Generalissimo Kartov'],
        ['Nettopp. Jeg er… nesten fornøyd.', 'Kansler Atlasova'],
        ['Riktig. Statuen din skal vende mot havet.', 'Kansler Atlasova'],
        ['Utmerket. Paraden kan begynne.', 'Kansler Atlasova']
      ],
      judgeBad: [
        ['FEIL. Kartografene gråter i bunkeren.', 'Generalissimo Kartov'],
        ['Galt. Globusprivilegiene dine er inndratt.', 'Generalissimo Kartov'],
        ['Nei! Selv papegøyen min visste dette.', 'Generalissimo Kartov'],
        ['Feil. Møt til ekstra geografitime ved daggry.', 'Kansler Atlasova'],
        ['Galt. Grensedirektoratet er ikke imponert.', 'Kansler Atlasova'],
        ['Skuffende. Jeg har forvist praktikanter for mindre.', 'Kansler Atlasova']
      ],
      continentNames: { 'Africa': 'Afrika', 'Asia': 'Asia', 'Europe': 'Europa',
        'North America': 'Nord-Amerika', 'South America': 'Sør-Amerika',
        'Oceania': 'Oseania', 'Antarctica': 'Antarktis' }
    }
  };

  var lang = localStorage.getItem('wq.lang') || 'no';

  function t(key, vars) {
    var s = (STR[lang] && STR[lang][key]) || STR.en[key] || key;
    if (typeof s === 'string' && vars) {
      Object.keys(vars).forEach(function (k) { s = s.replace('{' + k + '}', vars[k]); });
    }
    return s;
  }

  var api = {
    get lang() { return lang; },
    setLang: function (l) { lang = l === 'en' ? 'en' : 'no'; localStorage.setItem('wq.lang', lang); },
    t: t,
    continentName: function (c) { return (STR[lang].continentNames || {})[c] || c; },

    /* ── name resolution (defined fallback chains, never blank) ─────────── */
    countryName: function (rec) {
      if (lang === 'no') return rec.name_no || rec.name_native || rec.name_en || rec.key;
      return rec.name_en || rec.name_native || rec.key;
    },
    endonym: function (rec) {           // always the country's own-language name
      return rec.name_native || rec.name_en || rec.key;
    },
    capitalName: function (rec) {
      if (!rec.capital) return '';
      var c = rec.capital;
      var noName = (lang === 'no') ? (WQData.names.no_capitals[rec.key] || c.name_no) : '';
      return noName || c.name_en || '';                     // no → native/en → en
    },
    cityName: function (countryKey, city) {
      if (lang === 'no') {
        var n = WQData.names.no_cities[countryKey + ':' + city.n];
        if (n) return n;
      }
      return city.n;
    },
    provinceName: function (props) {    // native first; romanization added for non-Latin scripts
      var nl = (props.nl || '').split('|')[0].trim();
      var main = nl || props.n || props.ne || '?';
      var NON_LATIN = /[\u0370-\u03FF\u0400-\u04FF\u0530-\u058F\u0590-\u05FF\u0600-\u06FF\u0900-\u0DFF\u0E00-\u0FFF\u1100-\u11FF\u3040-\u30FF\u3130-\u318F\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF]/;
      if (NON_LATIN.test(main)) {
        var roman = props.n && !NON_LATIN.test(props.n) ? props.n
                  : props.ne && !NON_LATIN.test(props.ne) ? props.ne : null;
        if (roman && roman !== main) return main + ' \u00b7 ' + roman;
      }
      return main;
    }
  };

  window.WQI18n = api;
})();
