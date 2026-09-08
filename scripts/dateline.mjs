/**
 * La fecha que el fabricante imprime, cuando no publica ninguna que se pueda leer.
 *
 * El caso que obliga a esto: Anthropic no pone `article:published_time`, ni
 * `datePublished`, ni `<time datetime>` en ninguna parte. Tampoco Groq, Recraft,
 * LlamaIndex ni Cursor. Lo que sí hacen los cinco es escribir la fecha pegada al
 * titular, donde la lee cualquier persona. Sin esta lectura, el radar veía sus
 * artículos sin fecha, la ventana de 45 días los descartaba enteros y uno de los
 * tres fabricantes más importantes del sector aportaba exactamente cero noticias.
 *
 * Esto no rebaja la verificación, y conviene ser preciso sobre por qué. La regla
 * del proyecto es que toda afirmación tenga detrás una cita literal de la página
 * del fabricante. Una fecha impresa junto al titular **es** esa cita —de hecho es
 * la que ve el lector, mientras que una etiqueta `meta` no la ve nadie—. Lo que
 * cambia es de dónde se lee, no cuánto se exige.
 *
 * Es deliberadamente estricta, porque una fecha equivocada es peor que ninguna:
 * `canAutoPublish` mide la edad de la historia, así que inventarle frescura a
 * algo viejo sería colar por la puerta de atrás lo que la puerta principal
 * rechaza. De ahí las cuatro restricciones de abajo.
 */

/**
 * Hasta dónde se busca.
 *
 * Una fecha de portada vive junto al titular. Más allá empieza el cuerpo del
 * artículo, donde «en enero de 2024 lanzamos...» es una frase, no una fecha de
 * publicación. Medido sobre los cinco fabricantes que motivaron esto, la suya
 * aparece entre el carácter 172 y el 2314; 4000 deja margen sin llegar al cuerpo.
 */
export const VENTANA_CABECERA = 4000;

/** Más viejo que esto y lo que se ha leído no es una fecha de publicación. */
const ANOS_MAXIMOS = 10;

const MESES = {
  jan: 1, ene: 1,
  feb: 2,
  mar: 3,
  apr: 4, abr: 4,
  may: 5, mayo: 5,
  jun: 6,
  jul: 7,
  aug: 8, ago: 8,
  sep: 9, sept: 9,
  oct: 10,
  nov: 11,
  dec: 12, dic: 12,
};

/*
 * Sólo formatos que no se pueden malinterpretar.
 *
 * `03/04/2026` no está y no va a estar: es 3 de abril para media Europa y 4 de
 * marzo para Estados Unidos, y el sitio publica sobre fabricantes de los dos
 * sitios. Un mes escrito con letras no tiene ese problema.
 */
const NOMBRE = '(?:jan|ene|feb|mar|apr|abr|may|mayo|jun|jul|aug|ago|sept|sep|oct|nov|dec|dic)[a-zé]*\\.?';
const PATRONES = [
  /* Jul 24, 2026 · July 24 2026 */
  new RegExp(`\\b(${NOMBRE})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(20\\d\\d)\\b`, 'i'),
  /* 24 de julio de 2026 · 24 July 2026 */
  new RegExp(`\\b(\\d{1,2})\\s+(?:de\\s+)?(${NOMBRE})\\s*(?:de\\s+)?,?\\s*(20\\d\\d)\\b`, 'i'),
  /* 2026-07-24 */
  /\b(20\d\d)-(\d{2})-(\d{2})\b/,
];

function dosDigitos(n) {
  return String(n).padStart(2, '0');
}

/**
 * La primera fecha inequívoca de la cabecera, con el texto exacto que la
 * sostiene.
 *
 * Devuelve `null` mucho más a menudo de lo que acierta, y así debe ser: no
 * encontrar fecha deja la historia fuera de la ventana, que es un resultado
 * conservador. Adivinarla mal la mete dentro.
 */
export function fechaVisible(texto, { hoy = new Date(), ventana = VENTANA_CABECERA } = {}) {
  /*
   * Los espacios se colapsan aquí y no en quien llama.
   *
   * La ventana se midió sobre texto normalizado, así que aplicarla a un texto
   * con saltos de línea y sangrías del HTML original mide otra cosa: la fecha de
   * Anthropic está en el carácter 172 del texto legible y más allá del 4000 del
   * mismo texto sin colapsar. Una ventana que depende de cómo limpie quien
   * llama no es una ventana, es una lotería — y esta versión llegó a producción
   * mía sin encontrar una sola fecha por exactamente eso.
   */
  const cabecera = String(texto ?? '').replace(/\s+/g, ' ').slice(0, ventana);

  /* Se prueban todos los patrones y gana el que aparezca antes en la página. */
  let mejor = null;

  for (const patron of PATRONES) {
    const m = cabecera.match(patron);
    if (!m) continue;
    if (mejor && m.index >= mejor.index) continue;

    let anio;
    let mes;
    let dia;

    if (/^\d{4}$/.test(m[1])) {
      [, anio, mes, dia] = m.map(Number);
    } else if (/^\d/.test(m[1])) {
      dia = Number(m[1]);
      mes = MESES[m[2].toLowerCase().replace(/[.]/g, '').slice(0, 4)] ?? MESES[m[2].toLowerCase().slice(0, 3)];
      anio = Number(m[3]);
    } else {
      mes = MESES[m[1].toLowerCase().replace(/[.]/g, '').slice(0, 4)] ?? MESES[m[1].toLowerCase().slice(0, 3)];
      dia = Number(m[2]);
      anio = Number(m[3]);
    }

    if (!mes || !dia || !anio || dia > 31) continue;

    const valor = `${anio}-${dosDigitos(mes)}-${dosDigitos(dia)}`;
    const fecha = new Date(`${valor}T00:00:00Z`);

    /* Una fecha que no existe —31 de febrero— se normaliza sola y deja de coincidir. */
    if (Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== valor) continue;

    /*
     * Ni del futuro ni de hace una década. Lo primero suele ser una fecha de
     * un evento por venir; lo segundo, un número suelto que casó por accidente.
     * Ninguno de los dos es la fecha de este artículo.
     */
    const dias = (fecha.getTime() - hoy.getTime()) / 86_400_000;
    if (dias > 1 || dias < -365 * ANOS_MAXIMOS) continue;

    mejor = { index: m.index, value: valor, quote: m[0].trim() };
  }

  return mejor ? { value: mejor.value, quote: mejor.quote } : null;
}
