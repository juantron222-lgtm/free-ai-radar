import type { Capability } from '@lib/domain/taxonomy';

/**
 * De lo que alguien escribe a lo que el catálogo sabe.
 *
 * El buscador invita a escribir tareas —«Quitar fondo, transcribir audio,
 * generar vídeo…» dice su propio marcador de posición— y luego las trataba
 * como texto suelto. El resultado estaba medido: «crear una app» devolvía Suno
 * y Midjourney, «subtítulos» devolvía cero, y «crear vídeo» ponía primero una
 * herramienta de música. Buscar por parecido de letras sobre una descripción
 * no contesta «qué quiero hacer».
 *
 * Esto es un diccionario editorial de navegación, no un hecho nuevo del
 * catálogo: traduce una frase a capacidades, tipos de producto o hechos que
 * **ya existen y están verificados**. Nunca inventa una capacidad. Si una
 * intención no tiene correspondencia demostrable, no se añade: es preferible
 * un estado vacío honesto a seis resultados que no vienen a cuento.
 */

/**
 * Lo mínimo que hay que saber de una herramienta para decidir si responde.
 *
 * No es `Tool` a propósito. Estos mismos predicados corren en el navegador
 * sobre el índice comprimido, así que se declara aquí la forma exacta que
 * necesitan y no una ficha entera de 4 KB.
 */
export interface HechosIndexables {
  capabilities: readonly string[];
  categorySlug: string;
  secondaryCategories: readonly string[];
  productType?: string | null;
  hosting: string;
  freeModel: string;
  requiresCreditCard: string;
  creditReset?: string | null;
}

export interface Intencion {
  /** Cómo se llama en público. Nunca se enseña el token interno. */
  etiqueta: string;
  /** Las frases que la disparan, ya normalizadas por quien la consulta. */
  frases: readonly string[];
  /** Capacidades del catálogo que la satisfacen. */
  capacidades?: readonly Capability[];
  /** Tipos de producto que la satisfacen. */
  productos?: readonly string[];
  /**
   * Las verticales cuyo simple hecho de pertenecer ya responde, un poco.
   *
   * Sólo para las intenciones que *son* una vertical. «Voz» sin esto dejaba
   * fuera a media sección de Voz —una ficha a la que aún no le hemos anotado
   * capacidades desaparecía de la búsqueda de su propia categoría—, y eso es
   * perder recall sin ganar precisión. No se declara donde la intención es más
   * estrecha que la vertical: «crear una app» no es «todo Código».
   */
  verticales?: readonly string[];
  /** Un hecho estructurado, cuando la frase pregunta por uno. */
  hecho?: (hechos: HechosIndexables) => boolean;
  /** A dónde lleva si alguien prefiere navegar en vez de buscar. */
  ruta?: string;
}

/**
 * Sólo se ejecuta en tu equipo si el catálogo lo dice.
 *
 * `hybrid` cuenta: son las que pueden ir en local aunque también ofrezcan
 * nube. Lo que no cuenta es `cloud`, por muy «open source» que sea el
 * proyecto que hay detrás.
 */
const enLocal = (h: HechosIndexables): boolean => h.hosting !== 'cloud';

/**
 * Gratis de verdad y sin tarjeta.
 *
 * Las dos mitades son hechos estructurados y las dos exigen un sí explícito:
 * `requiresCreditCard === 'no'`, nunca `!== 'yes'`. Un «sin confirmar» no
 * entra aquí, porque quien busca «sin tarjeta» está preguntando precisamente
 * por lo que no queremos suponer.
 */
const gratisSinTarjeta = (h: HechosIndexables): boolean =>
  h.requiresCreditCard === 'no' &&
  ['free_real', 'freemium', 'credits', 'open_source', 'local'].includes(h.freeModel) &&
  h.creditReset !== 'one_off';

export const INTENCIONES: readonly Intencion[] = [
  {
    etiqueta: 'Crear una aplicación desde una idea',
    frases: ['crear una app', 'crear app', 'hacer una app', 'crear una aplicacion', 'hacer una web', 'crear una web', 'app builder', 'construir una app', 'app desde cero', 'landing'],
    productos: ['app-builder'],
    ruta: '/codigo#apps',
  },
  {
    etiqueta: 'Programar con IA',
    frases: ['programar con ia', 'escribir codigo', 'coding', 'autocompletado', 'copiloto', 'refactorizar'],
    capacidades: ['code-generation', 'repository-editing'],
    productos: ['ide', 'copilot', 'agent', 'cli'],
    ruta: '/codigo',
  },
  {
    etiqueta: 'Transcribir audio a texto',
    frases: ['transcribir', 'transcripcion', 'pasar audio a texto', 'audio a texto', 'subtitulos', 'subtitular', 'subtitulado', 'dictado'],
    capacidades: ['transcription'],
    ruta: '/audio#transcribir',
  },
  {
    etiqueta: 'Quitar el fondo de una imagen',
    frases: ['quitar fondo', 'eliminar fondo', 'borrar fondo', 'recortar fondo', 'sin fondo', 'background removal'],
    capacidades: ['background-removal'],
    ruta: '/imagen',
  },
  {
    etiqueta: 'Generar imágenes',
    frases: ['generar imagenes', 'crear imagenes', 'hacer imagenes', 'generar una imagen', 'dibujar', 'ilustrar', 'texto a imagen'],
    capacidades: ['text-to-image'],
    ruta: '/imagen',
  },
  {
    etiqueta: 'Editar una imagen',
    frases: ['editar imagen', 'retocar', 'rellenar zonas', 'ampliar encuadre', 'escalar imagen', 'mejorar resolucion'],
    capacidades: ['image-editing', 'inpainting', 'outpainting', 'upscaling'],
    ruta: '/imagen',
  },
  {
    etiqueta: 'Generar vídeo',
    frases: ['crear video', 'generar video', 'hacer un video', 'texto a video', 'imagen a video', 'animar una imagen'],
    capacidades: ['text-to-video', 'image-to-video'],
    ruta: '/video',
  },
  {
    etiqueta: 'Vídeo con una persona a cámara',
    frases: ['avatar', 'persona a camara', 'presentador', 'sincronia labial', 'doblar video'],
    capacidades: ['avatar-video', 'lip-sync', 'dubbing'],
    ruta: '/video#personas',
  },
  {
    etiqueta: 'Crear música',
    frases: ['musica', 'crear musica', 'componer', 'cancion', 'canciones', 'banda sonora', 'texto a musica'],
    capacidades: ['text-to-music'],
    ruta: '/audio#musica',
  },
  {
    etiqueta: 'Generar o clonar una voz',
    frases: ['generar voz', 'texto a voz', 'clonar voz', 'locucion', 'narracion', 'tts'],
    capacidades: ['text-to-speech', 'voice-clone'],
    ruta: '/audio#voz',
  },
  {
    etiqueta: 'Usar un agente que haga la tarea',
    frases: ['que trabaje solo', 'automatizar tareas', 'workflow', 'automatizacion'],
    capacidades: ['tool-use', 'workflow-automation', 'multi-agent'],
    ruta: '/agentes',
  },
  {
    etiqueta: 'Elegir un modelo de lenguaje',
    frases: ['modelo de lenguaje', 'razonamiento', 'chatbot'],
    capacidades: ['text-generation', 'reasoning'],
    ruta: '/modelos',
  },
  {
    etiqueta: 'Ejecutarlo en tu equipo',
    frases: ['modelo local', 'en local', 'local', 'sin internet', 'offline', 'en mi ordenador', 'pesos abiertos', 'descargar modelo'],
    hecho: enLocal,
    ruta: '/modelos#pesos',
  },
  {
    etiqueta: 'Gratis y sin tarjeta',
    frases: ['gratis sin tarjeta', 'sin tarjeta', 'sin tarjeta de credito', 'gratis de verdad', 'sin pagar', 'gratuito'],
    hecho: gratisSinTarjeta,
    ruta: '/herramientas?nocard=1',
  },
  /*
   * Y ahora las seis genéricas: las que no piden una tarea, piden una familia.
   *
   * «Vídeo» no es «generar vídeo». Quien escribe la palabra suelta está
   * navegando, no encargando, y la respuesta correcta es la vertical entera.
   * Van al final porque son las más anchas y `detectarIntenciones` prefiere la
   * frase más larga.
   */
  {
    etiqueta: 'Imagen',
    frases: ['imagen', 'imagenes', 'fotografia', 'fotos'],
    verticales: ['imagen'],
    ruta: '/imagen',
  },
  {
    etiqueta: 'Vídeo',
    frases: ['video', 'videos', 'clip', 'clips'],
    verticales: ['video'],
    ruta: '/video',
  },
  {
    etiqueta: 'Audio',
    frases: ['audio', 'sonido', 'voz', 'habla'],
    verticales: ['musica', 'voz'],
    ruta: '/audio',
  },
  {
    etiqueta: 'Código',
    frases: ['codigo', 'desarrollo', 'programacion', 'programar'],
    verticales: ['codigo'],
    ruta: '/codigo',
  },
  {
    etiqueta: 'Agentes',
    frases: ['agente', 'agentes'],
    verticales: ['agentes'],
    ruta: '/agentes',
  },
  {
    etiqueta: 'Modelos',
    frases: ['modelo', 'modelos', 'llm'],
    verticales: ['modelos'],
    ruta: '/modelos',
  },
  {
    etiqueta: 'Usarlo por API',
    frases: ['api', 'por api', 'desde codigo', 'integrar'],
    capacidades: ['api'],
    ruta: '/modelos#api',
  },
];

/** Lo que hay que quitarle a una frase para poder compararla. */
export function normalizarConsulta(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Las palabras que llevan el significado.
 *
 * Se cae el andamiaje del castellano —artículos, preposiciones, «quiero»— para
 * que «crear una app», «crear la app» y «crear app» sean la misma pregunta y no
 * haya que declarar las tres. `sin` se queda: es lo único que distingue «con
 * tarjeta» de «sin tarjeta», que es justo la pregunta. `ia` y `ai` también se
 * caen porque están en casi todas las consultas y no separan nada.
 */
const ANDAMIAJE = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas', 'y', 'o', 'u',
  'para', 'con', 'que', 'al', 'en', 'por', 'mi', 'me', 'quiero', 'necesito', 'busco',
  'algo', 'the', 'a', 'of', 'to', 'for', 'and', 'or', 'ia', 'ai',
]);

export function palabrasClave(input: string): string[] {
  return normalizarConsulta(input)
    .split(' ')
    .filter((w) => w.length > 0 && !ANDAMIAJE.has(w));
}

/**
 * ¿Aparece esta frase, entera y por palabras, dentro de la consulta?
 *
 * Por palabras y no por subcadena a propósito. «api» dentro de «rapidapi» o
 * «local» dentro de «localizar» dispararían una intención que nadie ha pedido,
 * y una intención mal disparada es peor que ninguna: filtra el catálogo entero
 * por un hecho que no venía en la pregunta.
 */
function contieneFrase(palabras: readonly string[], frase: string): boolean {
  const buscadas = palabrasClave(frase);
  if (!buscadas.length) return false;
  if (buscadas.length > palabras.length) return false;

  for (let i = 0; i <= palabras.length - buscadas.length; i++) {
    if (buscadas.every((w, j) => palabras[i + j] === w)) return true;
  }
  return false;
}

/**
 * Qué intenciones reconoce una consulta.
 *
 * Gana la frase más larga, no la primera declarada: «crear una app» tiene que
 * ganar a «crear una web» sólo si encaja mejor, y «modelo local» a «modelo».
 * Devuelve todas las que encajan porque una consulta puede llevar dos
 * —«transcribir gratis sin tarjeta» son dos cosas— y las dos deben aplicarse.
 */
export interface Deteccion {
  intencion: Intencion;
  /** Las palabras de la consulta que esta intención explica. */
  palabras: string[];
  /**
   * Si esta intención puede *excluir* resultados o sólo puntuarlos.
   *
   * Una intención cuyas palabras están contenidas en las de otra más larga
   * deja de restringir. «Crear vídeo» reconoce dos cosas: la tarea («crear
   * vídeo») y la familia («vídeo»). Si las dos filtrasen, una herramienta de
   * Imagen que además genera vídeo se caería por estar en la vertical
   * equivocada, cuando hace exactamente lo que se ha pedido. Y al revés:
   * «clonar voz» reconoce la tarea y la familia Audio, y ahí la que manda es
   * la tarea —Whisper está en Voz y no clona nada—.
   *
   * La regla es la misma en los dos casos: manda la frase más específica; la
   * más ancha se queda como señal de orden.
   */
  restringe: boolean;
}

export function detectar(consulta: string): Deteccion[] {
  const palabras = palabrasClave(consulta);
  if (!palabras.length) return [];

  const encontradas: Array<{ intencion: Intencion; palabras: string[] }> = [];

  for (const intencion of INTENCIONES) {
    let mejor: string[] = [];
    for (const frase of intencion.frases) {
      if (!contieneFrase(palabras, frase)) continue;
      const suyas = palabrasClave(frase);
      if (suyas.length > mejor.length) mejor = suyas;
    }
    if (mejor.length) encontradas.push({ intencion, palabras: mejor });
  }

  encontradas.sort((a, b) => b.palabras.length - a.palabras.length);

  return encontradas.map((e) => {
    const contenidaEnOtra = encontradas.some(
      (otra) =>
        otra !== e &&
        otra.palabras.length > e.palabras.length &&
        e.palabras.every((w) => otra.palabras.includes(w))
    );
    return { ...e, restringe: !contenidaEnOtra };
  });
}

export function detectarIntenciones(consulta: string): Intencion[] {
  return detectar(consulta).map((d) => d.intencion);
}

/**
 * Cuánto responde una herramienta a una intención, de 0 a 1.
 *
 * Graduado y no binario porque si no, no lo es. «Programar con IA» lo cumplen
 * cuarenta fichas: los editores, los copilotos, las terminales y también todo
 * modelo de lenguaje que sepa generar código. Con un sí/no, las cuarenta
 * empatan y el desempate alfabético acaba decidiendo la página entera —«Aider,
 * Amazon Q, Bolt.new, Claude…»—, que es neutral y a la vez inútil.
 *
 * El orden de la escala es el de la especificidad:
 *
 *   1,00  El hecho estructurado. No admite grados: o no pide tarjeta o sí.
 *   1,00  El tipo de producto. Un editor con IA *es* la respuesta a «programar».
 *   0,50  Una capacidad verificada. Sabe hacerlo, entre otras cosas.
 *   +0,15 por cada capacidad adicional de la misma intención, hasta 0,90.
 *   0,35  Estar en esa vertical. Lo más débil que sigue siendo cierto.
 *
 * Así un constructor de aplicaciones va por delante de un modelo que además
 * escribe código, y una herramienta que hace texto-a-vídeo *e* imagen-a-vídeo
 * por delante de una que sólo hace una de las dos. Sigue sin haber nota: esto
 * mide encaje con lo preguntado, no calidad.
 */
export function fuerza(hechos: HechosIndexables, intencion: Intencion): number {
  if (intencion.hecho) return intencion.hecho(hechos) ? 1 : 0;

  if (intencion.productos?.includes(hechos.productType ?? '')) return 1;

  const coincidencias =
    intencion.capacidades?.filter((c) => hechos.capabilities.includes(c)).length ?? 0;
  if (coincidencias > 0) return Math.min(0.9, 0.5 + 0.15 * (coincidencias - 1));

  const enVertical = intencion.verticales?.some(
    (v) => hechos.categorySlug === v || hechos.secondaryCategories.includes(v)
  );
  return enVertical ? 0.35 : 0;
}

/** ¿Esta herramienta responde a esta intención? */
export function satisface(hechos: HechosIndexables, intencion: Intencion): boolean {
  return fuerza(hechos, intencion) > 0;
}
