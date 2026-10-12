/**
 * ¿Sigue diciendo la página lo que citamos?
 *
 * Núcleo puro del vigilante de citas (scripts/vigilante-citas.mjs). Cada hecho
 * del catálogo descansa en una frase literal de una página oficial; si esa
 * frase deja de estar, o cambia una cifra dentro de ella, el hecho puede
 * haber dejado de ser verdad sin que nadie se entere. Así se perdieron los
 * «5 $ al mes» de v0 y los 1.200 créditos de Synthesia: la página cambió y la
 * ficha siguió diciendo lo de siempre.
 *
 * Las citas no siempre son una frase seguida. Muchas juntan trozos de una
 * tabla o de una tarjeta de precios con « · », marcan omisiones con «[…]» y
 * llevan notas nuestras entre corchetes («[Tabla …]», «[tachado]»). Por eso
 * la cita se parte en fragmentos y se busca cada uno por separado: si están
 * todos, la cita sigue en pie; si falta alguno, se dice cuál.
 *
 * Lo que este módulo NO decide es si el hecho cambió. Una cita que ya no
 * aparece es un aviso para que una persona abra la página, no una corrección.
 */

/** Ruido tipográfico que no cambia lo que dice una frase. */
export function normalizar(texto) {
  return String(texto)
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF\u2060]/g, '')
    // Todas las comillas valen lo mismo: una cita no deja de serlo porque la
    // página escriba “Free User” y nosotros 'Free User'.
    .replace(/[\u2018\u2019\u201A\u2032\u201C\u201D\u201E\u2033\u00AB\u00BB"']/g, "'")
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u00A0\u202F\t\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Lo que separa trozos de una cita compuesta. */
const SEPARADORES = [
  /\[[^\]]*\]/g, // notas nuestras y omisiones: [Tabla …], [tachado], […]
  /\s+·\s+/g, // trozos de tarjeta o de tabla
  /\s+[-–—]\s+/g, // «Remix app — Plan: …»
  /\s*\.\.\.\s*|\s*…\s*/g, // omisiones sin corchetes
  /\t+|\s+\|\s+/g, // celdas, también las que citamos separadas con «|»
  /:\s+/g, // «Input price: Free of charge», donde la página tenía dos celdas
  /(?<=[.!?])\s+(?=\p{Lu})/gu, // frases seguidas que en la página van en bloques distintos
];

const CORTE = '\u0000';

/**
 * Los fragmentos que tienen que aparecer en la página.
 *
 * Se quitan los signos sueltos de los extremos y se descartan los trozos con
 * menos de cuatro letras o cifras, que coincidirían con cualquier cosa.
 */
export function fragmentosDeCita(cita) {
  /*
   * Dentro de nuestras notas, lo que va entre «» es texto de la página
   * («[Tabla «Compare features across plans»: …]»): se rescata para buscarlo.
   */
  const deNotas = [...String(cita).matchAll(/\[[^\]]*\]/g)].flatMap((m) =>
    [...m[0].matchAll(/«([^»]+)»/g)].map((q) => q[1])
  );
  let texto = [String(cita), ...deNotas].join(CORTE);
  for (const sep of SEPARADORES) texto = texto.replace(sep, CORTE);
  return texto
    .split(CORTE)
    .map((f) => normalizar(f).replace(/^[\s.,;:!?¿¡«»"'()]+|[\s.,;:!?¿¡«»"'()]+$/g, ''))
    // Al menos cuatro letras o cifras: «$0 /mo» coincide con cualquier cosa y,
    // al revés, la página lo parte en líneas distintas y da falsas alarmas.
    .filter((f) => (f.match(/[\p{L}\p{N}]/gu) ?? []).length >= 4);
}

/**
 * Compara una cita con el texto de su página.
 *
 * @returns {{ estado: 'intacta' | 'parcial' | 'desaparecida', fragmentos: string[], faltan: string[] }}
 */
export function comprobarCita(cita, textoDePagina) {
  /*
   * Sin espacios: al leer una página, el navegador pega a veces dos bloques
   * («next day!You can», «You'veseenwhatitcando») o los separa con saltos de
   * línea donde la cita lleva un espacio. Lo que decide si la frase está son
   * sus letras, cifras y signos, no dónde caen los blancos.
   */
  const pagina = normalizar(textoDePagina).replace(/\s+/g, '');
  const fragmentos = fragmentosDeCita(cita);
  const faltan = fragmentos.filter((f) => !pagina.includes(f.replace(/\s+/g, '')));
  const estado =
    faltan.length === 0 ? 'intacta' : faltan.length === fragmentos.length ? 'desaparecida' : 'parcial';
  return { estado, fragmentos, faltan };
}

/**
 * ¿Se pudo leer de verdad la página?
 *
 * Un muro anti-robots o una página de error harían que todas sus citas
 * parecieran desaparecidas. Se juzga sobre el texto visible: el oculto (JSON
 * de la propia página) puede contener «just a moment...» sin ser un muro. Eso no es un cambio del fabricante: es que no la
 * hemos visto, y el informe lo dice así.
 */
export function paginaLegible({ status, texto }) {
  if (!status || status >= 400) return { legible: false, motivo: `HTTP ${status ?? 'sin respuesta'}` };
  const t = normalizar(texto);
  if (t.length < 400) return { legible: false, motivo: 'casi sin texto' };
  // Los muros de verdad son páginas cortas; en una larga, esas frases son otra cosa.
  if (t.length < 5000 && /verify you are human|are you a robot|access denied|just a moment\.\.\.|enable javascript and cookies|attention required/.test(t)) {
    return { legible: false, motivo: 'muro anti-robots' };
  }
  return { legible: true };
}
