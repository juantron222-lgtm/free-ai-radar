/*
 * Progressive enhancement for the auth forms.
 *
 * Every form here posts to a real endpoint and works with JavaScript disabled.
 * This script upgrades the experience: inline field errors, a password reveal
 * toggle and a live strength meter — without ever becoming load-bearing.
 *
 * External file so the CSP can stay `script-src 'self'`.
 */
(function () {
  // ---- Password reveal ----------------------------------------------------
  document.addEventListener('click', function (event) {
    var toggle = event.target.closest && event.target.closest('[data-toggle-password]');
    if (!toggle) return;

    var input = document.getElementById(toggle.getAttribute('data-toggle-password'));
    if (!input) return;

    var revealing = input.type === 'password';
    input.type = revealing ? 'text' : 'password';
    var label = toggle.querySelector('.sr-only');
    if (label) label.textContent = revealing ? 'Ocultar contraseña' : 'Mostrar contraseña';
    toggle.setAttribute('aria-pressed', String(revealing));
  });

  // ---- Strength meter -----------------------------------------------------
  var LABELS = ['Muy débil', 'Débil', 'Aceptable', 'Buena', 'Excelente'];

  function strength(password) {
    if (!password) return 0;
    var score = 0;
    if (password.length >= 12) score++;
    if (password.length >= 16) score++;
    if (new Set(password).size >= 10) score++;
    if (/\s/.test(password.trim()) || /[^\p{L}\p{N}]/u.test(password)) score++;
    return Math.min(4, score);
  }

  var meterInput = document.querySelector('[data-strength-for]');
  if (meterInput) {
    var target = document.getElementById(meterInput.getAttribute('data-strength-for'));
    var bar = document.querySelector('[data-strength-bar]');
    var text = document.querySelector('[data-strength-label]');

    if (target && bar && text) {
      target.addEventListener('input', function () {
        var score = strength(target.value);
        bar.setAttribute('data-score', String(score));
        bar.style.setProperty('--strength', String(score));
        text.textContent = target.value ? LABELS[score] : '';
      });
    }
  }

  // ---- Inline submission --------------------------------------------------
  var forms = document.querySelectorAll('[data-auth-form]');

  for (var i = 0; i < forms.length; i++) {
    (function (form) {
      var result = form.querySelector('[data-form-result]');
      var submit = form.querySelector('button[type="submit"]');

      form.addEventListener('submit', async function (event) {
        event.preventDefault();

        clearErrors(form);
        if (result) result.hidden = true;

        var originalLabel = submit ? submit.textContent : '';
        if (submit) {
          submit.disabled = true;
          submit.textContent = 'Un momento…';
        }

        try {
          var response = await fetch(form.action, {
            method: 'POST',
            headers: { Accept: 'application/json' },
            body: new FormData(form),
            redirect: 'follow',
          });

          var payload = await response.json();

          if (payload.ok) {
            var next = payload.data && payload.data.next;
            if (next) {
              window.location.assign(next);
              return;
            }
            show(result, 'ok', payload.message);
            form.reset();
          } else {
            if (payload.errors) applyErrors(form, payload.errors);
            show(result, 'error', payload.message);
            focusFirstError(form, payload.errors);
          }
        } catch (error) {
          show(result, 'error', 'No hemos podido conectar. Inténtalo de nuevo.');
        } finally {
          if (submit) {
            submit.disabled = false;
            submit.textContent = originalLabel;
          }
        }
      });
    })(forms[i]);
  }

  function show(node, tone, message) {
    if (!node) return;
    node.hidden = false;
    node.setAttribute('data-tone', tone);
    node.textContent = message;
  }

  function clearErrors(form) {
    var slots = form.querySelectorAll('[data-error-for]');
    for (var i = 0; i < slots.length; i++) {
      slots[i].hidden = true;
      slots[i].textContent = '';
      var field = form.querySelector('#' + slots[i].getAttribute('data-error-for'));
      if (field) field.removeAttribute('aria-invalid');
    }
  }

  function applyErrors(form, errors) {
    for (var name in errors) {
      var slot = form.querySelector('[data-error-for="' + name + '"]');
      if (!slot) continue;
      slot.hidden = false;
      slot.textContent = errors[name];
      var field = form.querySelector('#' + name);
      if (field) field.setAttribute('aria-invalid', 'true');
    }
  }

  function focusFirstError(form, errors) {
    if (!errors) return;
    for (var name in errors) {
      var field = form.querySelector('#' + name);
      if (field) {
        field.focus();
        return;
      }
    }
  }
})();
