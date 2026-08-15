import type { Page } from '@playwright/test';

/** Must match `CONSENT_VERSION` in `src/lib/consent.ts`. */
const CONSENT_VERSION = 2;

/**
 * Records a "reject all" decision before the page loads.
 *
 * The consent dialog is modal and covers the viewport by design, so tests whose
 * subject is something else would otherwise spend their setup clicking through
 * it. Seeding the stored decision reproduces the state of a returning visitor
 * who already declined — which is the precondition those tests actually want.
 *
 * The dialog's own behaviour (appearing before any decision, reject being as
 * easy as accept, persistence) is covered by the `consentimiento` suite, which
 * drives the real UI.
 */
export async function seedConsent(page: Page): Promise<void> {
  const record = JSON.stringify({
    version: CONSENT_VERSION,
    state: {
      necessary: true,
      analytics: false,
      personalization: false,
      advertising: false,
    },
    decidedAt: new Date().toISOString(),
  });

  await page.addInitScript((value: string) => {
    try {
      window.localStorage.setItem('far-consent', value);
    } catch {
      /* Storage blocked: the cookie below is enough. */
    }
    document.cookie = `far_consent=${encodeURIComponent(value)}; path=/; SameSite=Lax`;
  }, record);
}

/**
 * Guiones de terceros que fallan fuera de producción, y no son defectos nuestros.
 *
 *   - `vercel.live` es la barra de previsualización que Vercel inyecta en cada
 *     Preview; nuestra CSP `script-src 'self'` la bloquea, que es la política
 *     funcionando.
 *   - `va.vercel-scripts.com` es Web Analytics. En local y en Preview pide
 *     `script.debug.js` y Vercel responde **403**, porque ese fichero sólo se
 *     sirve a despliegues reconocidos.
 *
 * Ninguno de los dos ocurre en producción y ninguno se puede arreglar desde
 * aquí. Todo lo demás sigue rompiendo la prueba.
 */
const TERCEROS = /vercel\.live|va\.vercel-scripts\.com|behind a redirect, which is disallowed/i;

/**
 * Un error de consola sin URL no se puede atribuir leyéndolo.
 *
 * WebKit resume cualquier recurso que falla como «Failed to load resource: the
 * server responded with a status of 403 ()» — sin decir cuál. Chromium y
 * Firefox sí nombran el fichero, así que el filtro por texto los cubría y a
 * WebKit no: el 403 de Web Analytics entraba como si fuera un fallo del sitio,
 * y llevaba semanas poniendo en rojo dos pruebas de dos navegadores.
 *
 * La solución no es ensanchar el patrón —no hay nada que emparejar— sino mirar
 * qué peticiones fallaron de verdad. Si en esta página sólo cayeron guiones de
 * terceros, el error anónimo es de ellos.
 */
export function isThirdPartyNoise(text: string, fallos: FailedRequests): boolean {
  if (TERCEROS.test(text)) return true;

  const anonima = /failed to load resource/i.test(text) && !/https?:\/\//i.test(text);
  if (!anonima) return false;

  /*
   * Sólo se perdona si lo único que falló fue de fuera.
   *
   * Sin esta segunda condición, un recurso propio roto quedaría tapado en
   * cuanto Web Analytics fallara en la misma página — y un filtro que esconde
   * fallos reales es peor que la prueba roja que pretendía arreglar.
   */
  return fallos.terceros.length > 0 && fallos.propios.length === 0;
}

export interface FailedRequests {
  /** Peticiones a otros dominios que fallaron. */
  terceros: string[];
  /** Peticiones al propio sitio que fallaron. Estas nunca se perdonan. */
  propios: string[];
}

/** Registra qué peticiones fallaron y de quién eran. Ver `isThirdPartyNoise`. */
export function trackThirdPartyFailures(page: Page, origin: string): FailedRequests {
  const fallos: FailedRequests = { terceros: [], propios: [] };
  const anotar = (url: string) => {
    (url.startsWith(origin) ? fallos.propios : fallos.terceros).push(url);
  };
  page.on('requestfailed', (request) => anotar(request.url()));
  page.on('response', (response) => {
    if (response.status() >= 400) anotar(response.url());
  });
  return fallos;
}
