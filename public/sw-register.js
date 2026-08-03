/*
 * Service worker registration + update prompt.
 *
 * External rather than inline so the CSP stays `script-src 'self'`.
 *
 * The worker never calls skipWaiting() on its own: a page mid-session must not
 * suddenly start being served by a different version. Instead we surface a
 * quiet, dismissible bar and let the reader decide when to reload.
 */
(function () {
  if (!('serviceWorker' in navigator)) return;

  /*
   * Only reload when the reader explicitly asked for the update.
   *
   * The worker calls clients.claim() on activate, which fires
   * `controllerchange` on the very first visit. Reloading on that event
   * unconditionally meant every new visitor got a surprise page reload — and if
   * it landed mid-form-submission, their input was lost.
   */
  var updateRequested = false;

  window.addEventListener('load', function () {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then(function (registration) {
        registration.addEventListener('updatefound', function () {
          var installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', function () {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateBar(registration);
            }
          });
        });
      })
      .catch(function (error) {
        console.warn('No se pudo registrar el service worker:', error);
      });

    var refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!updateRequested || refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  });

  function requestUpdate(registration) {
    updateRequested = true;
    if (registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  }

  function showUpdateBar(registration) {
    if (document.getElementById('sw-update-bar')) return;

    var bar = document.createElement('div');
    bar.id = 'sw-update-bar';
    bar.setAttribute('role', 'status');
    bar.className = 'sw-update-bar';

    var text = document.createElement('span');
    text.textContent = 'Hay una versión nueva del radar.';

    var reload = document.createElement('button');
    reload.type = 'button';
    reload.className = 'btn btn-primary btn-sm';
    reload.textContent = 'Actualizar';
    reload.addEventListener('click', function () {
      requestUpdate(registration);
    });

    var dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'btn btn-ghost btn-sm';
    dismiss.textContent = 'Ahora no';
    dismiss.addEventListener('click', function () {
      bar.remove();
    });

    bar.appendChild(text);
    bar.appendChild(reload);
    bar.appendChild(dismiss);
    document.body.appendChild(bar);
  }
})();
