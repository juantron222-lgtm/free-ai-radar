import { z } from 'zod';
import { EvidenceScope } from './tool';

/**
 * Lo que vimos nosotros, que no es lo que dice el fabricante.
 *
 * `FieldEvidence` contesta «¿qué publica su web?». Esto contesta otra pregunta
 * distinta: «¿qué obtuvimos al usarlo?». Son dos clases de prueba y mezclarlas
 * sería el error más caro que puede cometer un sitio como éste.
 *
 * El caso concreto que hay que impedir: una generación sale sin marca de agua.
 * Eso demuestra que **en nuestra prueba, ese día, con ese modo, no apareció
 * marca**. No demuestra que el plan gratuito nunca la ponga —puede depender
 * del modelo elegido, del formato de descarga, de la región o de que la
 * cambien mañana—. Convertir lo primero en lo segundo es exactamente lo que
 * este sitio dice no hacer.
 *
 * Por eso el vocabulario de una observación es **incompatible con el
 * triestado**: nada de `yes`/`no`/`unverified`. Si alguien intenta asignar una
 * observación a `freePlan.hasWatermark`, el compilador lo para; y si lo
 * fuerza, hay una prueba que lo caza.
 */
export const OBSERVACIONES = ['aparecio', 'no_aparecio', 'no_aplica', 'no_se_pudo_ver'] as const;
export const Observacion = z.enum(OBSERVACIONES);
export type Observacion = z.infer<typeof Observacion>;

/**
 * Cómo se cuenta una observación en público.
 *
 * Todas empiezan por «En nuestra prueba» a propósito. No es una fórmula de
 * cortesía: es la acotación que impide leer una anécdota como una condición.
 */
export const OBSERVACION_LABEL: Record<Observacion, string> = {
  aparecio: 'En nuestra prueba, sí',
  no_aparecio: 'En nuestra prueba, no',
  no_aplica: 'No aplica a esta prueba',
  no_se_pudo_ver: 'No pudimos comprobarlo',
};

/**
 * Lo que costó la generación, y **cómo lo sabemos**.
 *
 * Un producto puede enseñar el cargo de esta ejecución («−2 créditos») o
 * limitarse a publicar una tarifa por modelo y dejar que el lector reste. Las
 * dos cosas se escriben parecido y valen muy distinto: la primera es una
 * lectura, la segunda es una cuenta que hemos hecho nosotros y que puede
 * estar mal —otra tarifa, un descuento, una promoción, un cargo que no se ve—.
 *
 * Por eso el origen no es un matiz redactado: es parte de la estructura, y una
 * cifra inferida no puede archivarse sin decir de qué se dedujo.
 */
export const CosteObservado = z.discriminatedUnion('origen', [
  z.object({
    origen: z.literal('mostrado'),
    /** La cifra tal como la enseñaba la interfaz. */
    texto: z.string().min(1),
  }),
  z.object({
    origen: z.literal('inferido'),
    texto: z.string().min(1),
    /** De qué se dedujo. Sin esto, una cuenta nuestra pasaría por un dato suyo. */
    base: z.string().min(1),
  }),
]);
export type CosteObservado = z.infer<typeof CosteObservado>;

/** Cómo se presenta la procedencia de una cifra de coste. */
export const ORIGEN_COSTE_LABEL: Record<CosteObservado['origen'], string> = {
  mostrado: 'Lo mostraba la interfaz',
  inferido: 'Deducido por nosotros',
};

/** Lo que se recibió, tal cual, sin redondear ni convertir. */
export const Dimensiones = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type Dimensiones = z.infer<typeof Dimensiones>;

/**
 * El activo, con su linaje.
 *
 * El original se conserva intacto —sin retoque, sin escalado, sin quitar
 * marcas— porque es la prueba. Lo que se sirve en la web es un derivado, y el
 * derivado dice de qué original viene. Si algún día alguien discute una
 * muestra, la conversación es sobre el original.
 */
export const ActivoDeMuestra = z.object({
  /** Ruta local del original, tal como se descargó. */
  original: z.string().regex(/^\/muestras\/originales\/[a-z0-9-]+\.[a-z0-9]+$/),
  /** Bytes del original, para poder decir cuánto pesa lo que archivamos. */
  originalBytes: z.number().int().positive(),
  /**
   * El hash del original, en SHA-256.
   *
   * Es lo que convierte «conservamos el original» en algo comprobable por
   * quien quiera. Si alguien discute una muestra dentro de un año, este número
   * dice si el fichero que sirve la web es el mismo que salió del generador o
   * si alguien lo tocó por el camino.
   */
  originalSha256: z.string().regex(/^[a-f0-9]{64}$/),
  /** Ruta local de la versión que se sirve. */
  web: z.string().regex(/^\/muestras\/web\/[a-z0-9-]+\.(webp|png|jpg)$/),
  webBytes: z.number().int().positive(),
  /** Las dimensiones de la versión servida, para reservar el hueco. */
  webDimensiones: Dimensiones,
  /**
   * Qué se le hizo al original para obtener el derivado.
   *
   * Sólo puede ser reescalado y recompresión. Cualquier otra cosa —recorte,
   * corrección de color, retoque— dejaría de ser el mismo resultado, y esta
   * lista está para que se vea que no la hay.
   */
  derivacion: z.string().min(1),
});
export type ActivoDeMuestra = z.infer<typeof ActivoDeMuestra>;

/**
 * Lo que enseñaba la pantalla, fotografiado.
 *
 * Una muestra prueba qué salió del generador. Esto prueba otra cosa: qué decía
 * la interfaz mientras generábamos —el contador de créditos, el aviso de
 * cuota, el botón que pedía tarjeta—. Son datos que no dejan rastro en el
 * archivo resultante y que se pierden en cuanto se cierra la pestaña.
 *
 * Y son, sobre todo, **una lectura de un instante**. Que un contador dijera
 * «0 / 12 esta semana» no convierte doce en la cuota oficial del producto:
 * puede ser otro nivel de plan, una promoción o un cambio de ayer. Por eso
 * `textoVisible` guarda la frase literal y `respalda` dice qué sostiene, sin
 * ampliarlo ni un milímetro.
 */
export const EvidenciaAuxiliar = z.object({
  tipo: z.literal('captura_interfaz'),
  ruta: z.string().regex(/^\/muestras\/auxiliar\/[a-z0-9-]+\.(png|jpg|webp)$/),
  bytes: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  dimensiones: Dimensiones,
  capturadaEl: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z)$/),
  /** La frase que se lee en la captura, transcrita sin interpretar. */
  textoVisible: z.string().min(1),
  /** Qué sostiene exactamente. Nunca «el plan es así»: siempre «mostraba». */
  respalda: z.string().min(1),
  /**
   * Qué se recortó de la pantalla y por qué.
   *
   * Una captura de navegador arrastra cosas que no son la prueba y que no
   * deberían publicarse: la barra de marcadores, el correo de la cuenta, el
   * nombre de quien hizo la prueba. Recortar es legítimo; hacerlo en silencio
   * no, porque un recorte también puede quitar lo que incomoda. Si el archivo
   * archivado no es la pantalla entera, aquí se dice qué queda y qué se fue.
   */
  recorte: z.string().min(1).optional(),
});
export type EvidenciaAuxiliar = z.infer<typeof EvidenciaAuxiliar>;

/**
 * Una captura que no acompaña a ninguna muestra.
 *
 * Hay cosas que sólo enseña la interfaz y que no tienen generación detrás. El
 * caso que obligó a esto: Clipdrop responde al intento de generar con un aviso
 * de que la generación es exclusiva de Pro. No hay muestra —justamente porque
 * no se puede generar— y sin embargo esa pantalla es la mejor prueba que
 * existe de la condición, porque el HTML de la página no la contiene.
 *
 * Vale lo mismo para lo que un producto sólo enseña con la sesión iniciada: la
 * tarifa por modelo de Krea no está en ninguna URL pública.
 *
 * Sigue sin ser documentación contractual. Es lo que vimos en pantalla ese
 * día, con esa cuenta, y `respalda` marca hasta dónde llega.
 */
export const CapturaDeInterfaz = EvidenciaAuxiliar.extend({
  id: z.string().min(1),
  toolSlug: z.string().min(1),
  /** Dónde se tomó, para poder volver a mirarlo. */
  url: z.string().url(),
});
export type CapturaDeInterfaz = z.infer<typeof CapturaDeInterfaz>;

export const EditorialSample = z.object({
  id: z.string().min(1),
  toolSlug: z.string().min(1),

  /**
   * Cuándo, con hora.
   *
   * Sin hora no vale: los planes gratuitos de imagen cambian de una semana a
   * otra y una cuota diaria se agota a media tarde. La fecha sola convertiría
   * una prueba fechada en una afirmación indefinida.
   */
  generatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z)$/),

  /** Por qué puerta se entró. Mismo vocabulario que la evidencia documental. */
  accessSurface: EvidenceScope,
  accessUrl: z.string().url(),

  /** El prompt, literal y completo. Sin resumir. */
  prompt: z.string().min(1),
  /**
   * En qué se tuvo que desviar del prompt común, y por qué.
   *
   * Los productos no ofrecen los mismos controles, así que fingir que las seis
   * ejecuciones son idénticas sería falso. Lo honesto es anotar la desviación
   * al lado del resultado.
   */
  promptDeviation: z.string().min(1).optional(),

  model: z.string().min(1).optional(),
  aspectRatio: z.string().min(1).optional(),
  /** Lo que devolvió el servicio, medido en el fichero, no lo que prometía. */
  dimensions: Dimensiones.optional(),

  creditsSpent: CosteObservado.optional(),
  creditsLeft: z.string().min(1).optional(),

  cardRequiredObserved: Observacion,
  watermarkObserved: Observacion,

  /** Segundos aproximados de espera. Aproximados, y por eso se dice. */
  durationSeconds: z.number().positive().optional(),

  asset: ActivoDeMuestra,

  /**
   * Capturas de la interfaz tomadas durante la prueba.
   *
   * Van con la muestra porque describen la misma ejecución, y separadas del
   * activo porque no son el resultado: son el contexto en el que se obtuvo.
   */
  auxiliar: z.array(EvidenciaAuxiliar).default([]),

  notes: z.string().min(1).optional(),
});
export type EditorialSample = z.infer<typeof EditorialSample>;

/**
 * Lo que una muestra puede y no puede decir sobre una condición.
 *
 * Se usa en la propia interfaz, junto al resultado. No es un descargo legal:
 * es la diferencia entre un dato y una anécdota, escrita donde se lee.
 */
export const AVISO_MUESTRA =
  'Una muestra no determina qué herramienta es mejor. Sirve para enseñar qué obtuvimos realmente bajo estas condiciones.';

export const AVISO_OBSERVADO =
  'Lo observado en una prueba no sustituye a las condiciones oficiales: describe una ejecución concreta, con su fecha, su modo y su cuota.';

/**
 * ¿Contradice esta muestra lo que la ficha publica?
 *
 * No corrige nada por su cuenta: sólo lo señala. Una prueba puede contradecir
 * un dato documental por muchas razones legítimas —un modo distinto, un
 * cambio reciente, una región— y decidir cuál gana es trabajo editorial, no
 * de una función.
 */
export interface Contradiccion {
  campo: string;
  documentado: string;
  observado: string;
}

export function contradicciones(
  muestra: EditorialSample,
  documentado: { hasWatermark: string; requiresCreditCard: string }
): Contradiccion[] {
  const encontradas: Contradiccion[] = [];

  if (documentado.hasWatermark === 'no' && muestra.watermarkObserved === 'aparecio') {
    encontradas.push({
      campo: 'freePlan.hasWatermark',
      documentado: 'La ficha dice que no pone marca de agua',
      observado: 'En nuestra prueba apareció una marca',
    });
  }
  if (documentado.hasWatermark === 'yes' && muestra.watermarkObserved === 'no_aparecio') {
    encontradas.push({
      campo: 'freePlan.hasWatermark',
      documentado: 'La ficha dice que pone marca de agua',
      observado: 'En nuestra prueba no apareció ninguna',
    });
  }
  if (documentado.requiresCreditCard === 'no' && muestra.cardRequiredObserved === 'aparecio') {
    encontradas.push({
      campo: 'freePlan.requiresCreditCard',
      documentado: 'La ficha dice que no pide tarjeta',
      observado: 'En nuestra prueba nos la pidió',
    });
  }

  return encontradas;
}
