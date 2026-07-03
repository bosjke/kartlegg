/* Boot: load local data files, then show the start screen.
   No network requests leave this folder at runtime. */
(function () {
  'use strict';
  /* The on-screen keyboard resizes the layout (interactive-widget=resizes-content);
     Leaflet must be told so the map reflows instead of leaving dead space. */
  window.addEventListener('resize', function () { if (window.WQMap) WQMap.invalidate(); });
  WQData.load().then(function () {
    WQUI.showStart();
  }).catch(function (err) {
    console.error(err);
    document.getElementById('loading-text').classList.add('hidden');
    document.getElementById('loading-error').classList.remove('hidden');
  });
})();
