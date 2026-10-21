/*
 * «Tu cuenta» en vez de «Entrar», antes de pintar.
 *
 * Casi todas las páginas se sirven ya hechas y no saben si quien las mira ha
 * iniciado sesión, así que la cabecera decía «Entrar» también a quien ya
 * había entrado. El middleware deja la cookie `far_hay_sesion=1` mientras hay
 * sesión y la borra cuando se acaba; aquí sólo se mira si está y se marca
 * `<html data-sesion>`, y el CSS de la cabecera enseña el enlace que toca.
 *
 * Fichero propio y sin `defer`, como theme-init.js: la CSP es
 * `script-src 'self'` sin `unsafe-inline`, y tiene que correr antes de la
 * primera pintura para que el botón no cambie a la vista. Si no corre, se ve
 * «Entrar», que con sesión lleva a la cuenta igualmente.
 */
(function () {
  if (/(?:^|;\s*)far_hay_sesion=1(?:;|$)/.test(document.cookie)) {
    document.documentElement.setAttribute('data-sesion', '');
  }
})();
