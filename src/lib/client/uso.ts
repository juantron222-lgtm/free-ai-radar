import { CONSENT_COOKIE, readConsentFromCookie } from '@lib/consent';
import { EVENTOS_CON_CONSENTIMIENTO, normalizarBusqueda, type EventoUso } from '@lib/uso';

/**
 * Avisa al contador de uso desde el navegador.
 *
 * Sólo si quien navega aceptó «Analítica»: el aviso de cookies promete pedir
 * permiso para medir búsquedas, y esto lo cumple antes de enviar nada (el
 * servidor lo vuelve a comprobar). Una misma cosa se cuenta una vez por página
 * vista: escribir y borrar no infla nada.
 */

const enviados = new Set<string>();

function leerCookie(nombre: string): string | undefined {
  const par = document.cookie.split('; ').find((c) => c.startsWith(`${nombre}=`));
  return par?.slice(nombre.length + 1);
}

export function analiticaPermitida(): boolean {
  try {
    return readConsentFromCookie(leerCookie(CONSENT_COOKIE)).analytics;
  } catch {
    return false;
  }
}

export function medir(evento: EventoUso, clave: string): void {
  if (!EVENTOS_CON_CONSENTIMIENTO.includes(evento) || !analiticaPermitida()) return;
  const id = `${evento}|${clave}`;
  if (enviados.has(id)) return;
  enviados.add(id);

  const cuerpo = JSON.stringify({ evento, clave });
  try {
    if (navigator.sendBeacon?.('/api/uso', new Blob([cuerpo], { type: 'text/plain;charset=UTF-8' }))) return;
  } catch {
    /* sigue con fetch */
  }
  void fetch('/api/uso', {
    method: 'POST',
    body: cuerpo,
    keepalive: true,
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
  }).catch(() => undefined);
}

/**
 * Una búsqueda, cuando deja de cambiar.
 *
 * El catálogo filtra mientras se escribe, así que «c», «ch», «cha»… serían
 * cinco búsquedas. Se cuenta lo que queda escrito tras una pausa de 1,5 s, o
 * en cuanto se envía, con su número de resultados.
 */
let pendiente: ReturnType<typeof setTimeout> | undefined;

export function medirBusqueda(texto: string, resultados: number, inmediata = false): void {
  clearTimeout(pendiente);
  const q = normalizarBusqueda(texto);
  if (!q) return;
  const enviar = () => medir(resultados > 0 ? 'busqueda' : 'busqueda_vacia', q);
  if (inmediata) enviar();
  else pendiente = setTimeout(enviar, 1500);
}
