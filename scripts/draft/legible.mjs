/**
 * ¿Está este texto listo para un lector, o sigue siendo el borrador de la máquina?
 *
 * Vive aquí, en JavaScript plano, por el mismo motivo que `checkDraft`: la
 * aplican tanto el dominio —`canApprove`, y por tanto `canAutoPublish`— como
 * `scripts/newsroom-sync.mjs`, que corre en `prebuild` y no puede importar
 * TypeScript. Reimplementarla en los dos sitios garantizaría que un día
 * discrepasen, y la discrepancia la descubriría un lector.
 *
 * Qué detecta: que nadie haya reescrito el borrador. `autodraft.mjs` redacta un
 * texto de trabajo para que una persona lo arregle —copia el `<title>` de la
 * fuente, arma el slug con el dominio, escribe «queda pendiente la revisión
 * editorial» y pega las citas recortando por donde toque—. Eso es exactamente
 * lo que debe hacer un borrador; el fallo era que nada miraba si alguien lo
 * había tocado después.
 *
 * Qué NO hace: juzgar si el texto es bueno. Eso lo decide una persona. Esto
 * sólo impide que salga algo que demostrablemente nadie ha leído.
 */

/**
 * Cada patrón corresponde a una línea concreta de `autodraft.mjs`.
 */
const MARCAS_DE_BORRADOR = [
  {
    donde: 'slug',
    prueba: /^[a-z0-9]+-(com|ai|io|org|dev|net)-/,
    motivo: 'el slug empieza por el dominio de la fuente',
  },
  {
    donde: 'texto',
    prueba: /queda pendiente la revisión editorial/i,
    motivo: 'conserva «queda pendiente la revisión editorial»',
  },
  {
    donde: 'texto',
    prueba: /publicó esto el \d{4}-\d{2}-\d{2}/i,
    motivo: 'conserva «publicó esto el», con la fecha en ISO',
  },
  {
    donde: 'texto',
    prueba: /según la fecha que declara su propia página/i,
    motivo: 'conserva la coletilla de la fecha declarada',
  },
  /*
   * Una cita cortada se reconoce por la costura que deja `recortar()`: dos
   * puntos seguidos, puntos suspensivos, o el espacio que queda antes del punto
   * final cuando se le arranca el resto de la frase —«The Open Source AI Stack
   * .»—. También la cita que se quedó en nada.
   */
  {
    donde: 'texto',
    prueba: /«[^»]*(\.\.|…|\s\.)\s*»|«\s*[^»]{0,3}\s*»/,
    motivo: 'tiene una cita cortada o vacía',
  },
  {
    donde: 'titulo',
    prueba: /\s\|\s/,
    motivo: 'el titular lleva el separador del sitio de origen',
  },
];

/** Palabras funcionales que delatan un titular sin traducir. */
const INGLES = /\b(the|and|for|with|new|now|available|introducing|announcing|open|source|model|our|how|uses|from|closed|to)\b/gi;

/**
 * @param {{title?: string, slug?: string, summary?: string, impact?: string}} draft
 * @returns {{ok: boolean, reasons: string[]}}
 */
export function checkReaderReady(draft) {
  const reasons = [];
  const titulo = draft?.title ?? '';
  const slug = draft?.slug ?? '';
  const texto = `${draft?.summary ?? ''} ${draft?.impact ?? ''}`;

  for (const marca of MARCAS_DE_BORRADOR) {
    const sujeto = marca.donde === 'titulo' ? titulo : marca.donde === 'slug' ? slug : texto;
    if (marca.prueba.test(sujeto)) reasons.push(marca.motivo);
  }

  /*
   * Un titular en inglés no es un error de traducción: es la prueba de que se
   * copió el de la fuente. El umbral son tres palabras funcionales, para que
   * «OpenAI lanza GPT-6 Astra» —que lleva nombres propios en inglés y está en
   * español— no salte.
   */
  const funcionales = titulo.match(INGLES)?.length ?? 0;
  if (funcionales >= 3) {
    reasons.push(
      `el titular parece copiado de la fuente, sin traducir (${funcionales} palabras funcionales en inglés)`
    );
  }

  return { ok: reasons.length === 0, reasons };
}
