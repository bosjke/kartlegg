/* Answer normalization + tolerant matching.
   Rules (see build brief §6):
   - lower-case, strip diacritics
   - periods removed; "St." / "St" expands to "Saint" (token level, before spaces go)
   - all spaces and common punctuation removed  ("United States of America" → unitedstatesofamerica)
   - small-typo tolerance via edit distance, guarded so that e.g. "iraq" never matches Iran. */
(function () {
  'use strict';

  var TOKEN_MAP = { st: 'saint', ste: 'sainte', 'mt': 'mount', '&': 'and' };

  function normalize(s) {
    s = String(s == null ? '' : s).toLowerCase();
    s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');       // strip diacritics
    s = s.replace(/[.,;:'"!?()\u2018\u2019\u201c\u201d\u00b4`\u2010-\u2015-]/g, ' '); // punctuation → space
    var tokens = s.split(/\s+/).filter(Boolean).map(function (t) {
      return TOKEN_MAP[t] || t;
    });
    return tokens.join('');                                        // remove all spaces
  }

  function levenshtein(a, b, max) {
    if (a === b) return 0;
    var la = a.length, lb = b.length;
    if (Math.abs(la - lb) > max) return max + 1;
    var prev = new Array(lb + 1), cur = new Array(lb + 1), i, j;
    for (j = 0; j <= lb; j++) prev[j] = j;
    for (i = 1; i <= la; i++) {
      cur[0] = i;
      var best = i;
      for (j = 1; j <= lb; j++) {
        var cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (cur[j] < best) best = cur[j];
      }
      if (best > max) return max + 1;
      var t = prev; prev = cur; cur = t;
    }
    return prev[lb];
  }

  function tolerance(len) {
    if (len >= 9) return 2;
    if (len >= 5) return 1;
    return 0;               // short names must be exact (Iran vs Iraq, Chad, Cuba…)
  }

  /* Distance from input to the closest alias in a list (already normalized aliases). */
  function bestDistance(input, aliases, cap) {
    var best = cap + 1;
    for (var i = 0; i < aliases.length; i++) {
      var d = levenshtein(input, aliases[i], cap);
      if (d < best) best = d;
      if (best === 0) break;
    }
    return best;
  }

  /**
   * Tolerant answer check.
   * @param input        raw user input
   * @param aliases      raw alias strings of the correct item
   * @param competitors  array of alias-arrays of OTHER items in the same pool (may be [])
   * @returns true if input matches the item and no competitor matches at least as well.
   */
  function matchAnswer(input, aliases, competitors) {
    var q = normalize(input);
    if (!q) return false;
    var normAliases = aliases.map(normalize).filter(Boolean);
    if (normAliases.indexOf(q) !== -1) return true;               // exact
    var tol = tolerance(q.length);
    if (tol === 0) return false;
    var d = bestDistance(q, normAliases, tol);
    if (d > tol) return false;
    if (competitors) {
      for (var i = 0; i < competitors.length; i++) {
        var other = competitors[i].map(normalize).filter(Boolean);
        if (other.indexOf(q) !== -1) return false;                // exactly another item
        if (bestDistance(q, other, tol) <= d) return false;       // ambiguous → not accepted
      }
    }
    return true;
  }

  window.WQNorm = { normalize: normalize, levenshtein: levenshtein, matchAnswer: matchAnswer };
})();
