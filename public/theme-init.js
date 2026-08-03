/*
 * Applies the stored colour-scheme preference before first paint.
 *
 * Loaded as an external, render-blocking script in <head> rather than inlined,
 * so the Content-Security-Policy can stay `script-src 'self'` with no
 * 'unsafe-inline' and no per-response nonce. It is ~400 bytes and cached
 * immutably, so the cost is one cheap round trip on the first visit only.
 */
(function () {
  try {
    var stored = localStorage.getItem('far-theme');
    if (stored === 'light' || stored === 'dark') {
      document.documentElement.setAttribute('data-theme', stored);
    }
  } catch (e) {
    /* Private mode or blocked storage: fall back to the OS preference. */
  }
})();
