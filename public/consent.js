/*
 * Free AI Radar — consent runtime.
 *
 * Contract:
 *   1. Nothing that is not strictly necessary runs before a decision exists.
 *   2. Google Consent Mode v2 defaults are set to "denied" for every signal
 *      BEFORE any Google tag could load, then updated on consent.
 *   3. Scripts are declared in HTML as <script type="text/plain"
 *      data-consent="analytics" data-src="..."> and only promoted to real
 *      scripts once their category is granted.
 *   4. Revoking a category removes its cookies and reloads, so a withdrawal is
 *      as effective as never having consented.
 *
 * External file, no inline code: keeps CSP at `script-src 'self'`.
 */
(function () {
  var VERSION = 2;
  var COOKIE = 'far_consent';
  var STORAGE_KEY = 'far-consent';
  var CATEGORIES = ['necessary', 'analytics', 'personalization', 'advertising'];

  var DENY_ALL = {
    necessary: true,
    analytics: false,
    personalization: false,
    advertising: false,
  };

  // ---- Consent Mode v2 defaults, set as early as this file executes --------
  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = window.gtag || gtag;

  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    functionality_storage: 'denied',
    personalization_storage: 'denied',
    security_storage: 'granted',
    wait_for_update: 500,
  });

  // ---- Storage -------------------------------------------------------------

  function readCookie(name) {
    var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  }

  function writeCookie(name, value, days) {
    var expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie =
      name +
      '=' +
      encodeURIComponent(value) +
      '; expires=' +
      expires +
      '; path=/; SameSite=Lax' +
      (location.protocol === 'https:' ? '; Secure' : '');
  }

  function loadRecord() {
    var raw = readCookie(COOKIE);
    if (!raw) {
      try {
        raw = localStorage.getItem(STORAGE_KEY);
      } catch (e) {
        raw = null;
      }
    }
    if (!raw) return null;
    try {
      var parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== VERSION || !parsed.state) return null;
      return parsed;
    } catch (e) {
      return null;
    }
  }

  function saveRecord(state) {
    var record = {
      version: VERSION,
      state: state,
      decidedAt: new Date().toISOString(),
    };
    var serialized = JSON.stringify(record);
    // 6 months: long enough not to nag, short enough to re-ask periodically.
    writeCookie(COOKIE, serialized, 182);
    try {
      localStorage.setItem(STORAGE_KEY, serialized);
    } catch (e) {
      /* Cookie alone is sufficient. */
    }
    return record;
  }

  // ---- Applying consent ----------------------------------------------------

  function applyConsent(state) {
    gtag('consent', 'update', {
      ad_storage: state.advertising ? 'granted' : 'denied',
      ad_user_data: state.advertising ? 'granted' : 'denied',
      ad_personalization: state.advertising ? 'granted' : 'denied',
      analytics_storage: state.analytics ? 'granted' : 'denied',
      functionality_storage: state.personalization ? 'granted' : 'denied',
      personalization_storage: state.personalization ? 'granted' : 'denied',
      security_storage: 'granted',
    });

    activateScripts(state);

    document.documentElement.setAttribute(
      'data-consent',
      CATEGORIES.filter(function (c) {
        return state[c];
      }).join(' ')
    );

    window.dispatchEvent(new CustomEvent('far:consent', { detail: state }));
  }

  /**
   * Promotes parked <script type="text/plain" data-consent="..."> tags into
   * real, executing scripts. Each tag is promoted at most once.
   */
  function activateScripts(state) {
    var parked = document.querySelectorAll('script[type="text/plain"][data-consent]');
    for (var i = 0; i < parked.length; i++) {
      var node = parked[i];
      var category = node.getAttribute('data-consent');
      if (!state[category]) continue;

      var script = document.createElement('script');
      for (var a = 0; a < node.attributes.length; a++) {
        var attr = node.attributes[a];
        if (attr.name === 'type' || attr.name === 'data-consent' || attr.name === 'data-src') {
          continue;
        }
        script.setAttribute(attr.name, attr.value);
      }
      var src = node.getAttribute('data-src');
      if (src) script.src = src;
      else script.textContent = node.textContent;

      node.parentNode.replaceChild(script, node);
    }
  }

  /** Best-effort cleanup of cookies dropped by a category being withdrawn. */
  function clearNonEssentialCookies() {
    var keep = { far_consent: 1, far_session: 1, far_csrf: 1 };
    var all = document.cookie.split('; ');
    for (var i = 0; i < all.length; i++) {
      var name = all[i].split('=')[0];
      if (!name || keep[name]) continue;
      var host = location.hostname;
      document.cookie = name + '=; Max-Age=0; path=/';
      document.cookie = name + '=; Max-Age=0; path=/; domain=' + host;
      document.cookie = name + '=; Max-Age=0; path=/; domain=.' + host;
    }
  }

  // ---- UI ------------------------------------------------------------------

  var root = document.getElementById('consent-root');

  function readSelection() {
    var state = { necessary: true };
    for (var i = 0; i < CATEGORIES.length; i++) {
      var id = CATEGORIES[i];
      if (id === 'necessary') continue;
      var input = root.querySelector('[data-consent-category="' + id + '"]');
      state[id] = !!(input && input.checked);
    }
    return state;
  }

  function writeSelection(state) {
    for (var i = 0; i < CATEGORIES.length; i++) {
      var id = CATEGORIES[i];
      var input = root.querySelector('[data-consent-category="' + id + '"]');
      if (input && !input.disabled) input.checked = !!state[id];
    }
  }

  var lastFocused = null;

  function openBanner(showOptions) {
    if (!root) return;
    lastFocused = document.activeElement;
    root.hidden = false;
    var options = document.getElementById('consent-options');
    var save = root.querySelector('[data-consent-save]');
    var customize = root.querySelector('[data-consent-customize]');
    if (showOptions && options) {
      options.hidden = false;
      if (save) save.hidden = false;
      if (customize) customize.hidden = true;
    }
    var first = root.querySelector('[data-consent-accept-all]');
    if (first) first.focus();
    document.addEventListener('keydown', onKeydown, true);
  }

  function closeBanner() {
    if (!root) return;
    root.hidden = true;
    document.removeEventListener('keydown', onKeydown, true);
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  /** Focus trap + Escape. Escape is treated as "no decision", not as consent. */
  function onKeydown(event) {
    if (event.key === 'Escape') {
      // Only dismissable once a decision already exists; otherwise the dialog
      // stays, because "closed without choosing" must not read as acceptance.
      if (loadRecord()) closeBanner();
      return;
    }
    if (event.key !== 'Tab') return;

    var focusable = root.querySelectorAll(
      'button:not([hidden]), input:not([disabled]), a[href]'
    );
    var visible = [];
    for (var i = 0; i < focusable.length; i++) {
      if (focusable[i].offsetParent !== null) visible.push(focusable[i]);
    }
    if (!visible.length) return;

    var first = visible[0];
    var last = visible[visible.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function decide(state, hadConsent) {
    var previous = loadRecord();
    saveRecord(state);
    applyConsent(state);
    closeBanner();

    // Withdrawing a previously granted category: purge and reload so already
    // loaded third-party code stops running immediately.
    if (previous) {
      for (var i = 0; i < CATEGORIES.length; i++) {
        var id = CATEGORIES[i];
        if (previous.state[id] && !state[id]) {
          clearNonEssentialCookies();
          location.reload();
          return;
        }
      }
    }
    void hadConsent;
  }

  if (root) {
    root.querySelector('[data-consent-accept-all]').addEventListener('click', function () {
      decide({
        necessary: true,
        analytics: true,
        personalization: true,
        advertising: true,
      });
    });

    root.querySelector('[data-consent-reject-all]').addEventListener('click', function () {
      decide({
        necessary: true,
        analytics: false,
        personalization: false,
        advertising: false,
      });
    });

    var customizeBtn = root.querySelector('[data-consent-customize]');
    var saveBtn = root.querySelector('[data-consent-save]');

    customizeBtn.addEventListener('click', function () {
      var options = document.getElementById('consent-options');
      options.hidden = false;
      saveBtn.hidden = false;
      customizeBtn.hidden = true;
      var firstInput = options.querySelector('input:not([disabled])');
      if (firstInput) firstInput.focus();
    });

    saveBtn.addEventListener('click', function () {
      decide(readSelection());
    });

    // Clicking the backdrop is not a decision; it only closes when one exists.
    var backdrop = root.querySelector('[data-consent-backdrop]');
    if (backdrop) {
      backdrop.addEventListener('click', function () {
        if (loadRecord()) closeBanner();
      });
    }
  }

  // Footer / cookie-policy entry point: always able to reopen and change.
  document.addEventListener('click', function (event) {
    var trigger = event.target.closest && event.target.closest('[data-open-consent]');
    if (!trigger) return;
    event.preventDefault();
    var record = loadRecord();
    if (record) writeSelection(record.state);
    openBanner(true);
  });

  // ---- Boot ---------------------------------------------------------------

  var existing = loadRecord();
  if (existing) {
    applyConsent(existing.state);
  } else {
    applyConsent(DENY_ALL);
    openBanner(false);
  }

  window.farConsent = {
    get: function () {
      var record = loadRecord();
      return record ? record.state : DENY_ALL;
    },
    open: function () {
      var record = loadRecord();
      if (record) writeSelection(record.state);
      openBanner(true);
    },
  };
})();
