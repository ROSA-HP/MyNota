// Runs before React to avoid a flash of the wrong theme or text direction.
// Keep in sync with src/lib/preferences.ts (storage keys and values).
;(function () {
  try {
    var root = document.documentElement
    var theme = localStorage.getItem('mynota.theme') || 'system'
    var dark =
      theme === 'dark' ||
      (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    root.dataset.theme = dark ? 'dark' : 'light'
    var lang = localStorage.getItem('mynota.lang')
    if (lang === 'en' || lang === 'ar' || lang === 'de') {
      root.lang = lang
      root.dir = lang === 'ar' ? 'rtl' : 'ltr'
    }
  } catch (e) {
    /* storage unavailable: defaults apply */
  }
})()
