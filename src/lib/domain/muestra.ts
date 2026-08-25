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

  creditsSpent: z.string().min(1).optional(),
  creditsLeft: z.string().min(1).optional(),

  cardRequiredObserved: Observacion,
  watermarkObserved: Observacion,

  /** Segundos aproximados de espera. Aproximados, y por eso se dice. */
  durationSeconds: z.number().positive().optional(),

  asset: ActivoDeMuestra,

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
