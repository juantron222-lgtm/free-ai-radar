/*
 * El velo que evita el destello de las 94.
 *
 * Vive en un fichero propio y no dentro de la página por una razón concreta:
 * la CSP de producción es `script-src 'self'` sin `unsafe-inline` y sin nonce,
 * así que un `<script>` en línea aquí no se ejecuta. Estuvo escrito en línea y
 * el navegador lo bloqueó en producción durante toda la Fase 7 sin que ninguna
 * prueba se enterara: en local no hay cabecera CSP.
 *
 * Tiene que correr antes de que se pinte la rejilla, así que se carga sin
 * `defer` justo encima de ella. Son doscientos bytes del mismo origen.
 *
 * El `setTimeout` es el seguro: si el módulo que filtra no llega nunca, más
 * vale enseñar de más que no enseñar nada.
 */
if (location.search) {
  document.documentElement.classList.add('far-filtrando');
  setTimeout(function () {
    document.documentElement.classList.remove('far-filtrando');
  }, 1500);
}
