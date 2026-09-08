import type { DeskStory } from '@lib/domain/newsroom';

/**
 * Qué borradores ya no esperan a nadie.
 *
 * La mesa acumulaba historias verificadas, redactadas y correctas que la puerta
 * automática no iba a dejar pasar **nunca**, no hoy. Se quedaban en «esperando
 * decisión humana» indefinidamente, y eso tiene un coste concreto: quien mira
 * la mesa tiene que releerlas cada vez para volver a concluir lo mismo. Una
 * cola en la que la mayoría de las entradas no son decisiones deja de leerse.
 *
 * Sólo dos motivos son permanentes, y conviene ser estricto con esa palabra:
 *
 *   edad     `canAutoPublish` exige 21 días o menos y la edad sólo crece. Una
 *            historia que hoy está fuera de la ventana lo estará siempre.
 *   alcance  la página es de una plataforma que no fabrica el producto del que
 *            habla. Eso es una propiedad de la fuente, no de nuestra lectura, y
 *            no va a cambiar en un reintento.
 *
 * Todo lo demás **no** es permanente y se queda en la mesa: que el artículo no
 * se haya podido leer puede arreglarse mañana, y un hueco sin confirmar puede
 * cerrarse con otra vía oficial. Confundir «hoy no» con «nunca» sería perder
 * historias por impaciencia.
 *
 * Caducar no es borrar. La historia sigue entera —su verificación, su borrador,
 * su `factTrace`— y una persona puede aprobarla igualmente si quiere: lo que
 * cambia es que deja de presentarse como una decisión pendiente.
 */

/**
 * La misma ventana que usa `canAutoPublish`.
 *
 * Está duplicada a propósito y con una prueba que falla si las dos se separan:
 * importar la constante desde el dominio de la puerta acoplaría este módulo a
 * un fichero que no debe moverse por su culpa, y dejarlas sin atar permitiría
 * marcar como caducado algo que la puerta todavía aceptaría.
 */
export const DIAS_VENTANA_AUTOPUBLICACION = 21;

/** Lo que el verificador escribe cuando la plataforma no fabrica el producto. */
const MARCA_ALCANCE = /^Alcance:/i;

export interface Caducidad {
  /** `true` cuando la puerta automática no podrá aceptarla en ninguna pasada futura. */
  permanente: boolean;
  motivos: string[];
}

/**
 * Por qué esta historia no podrá autopublicarse nunca.
 *
 * Devuelve una lista vacía cuando el bloqueo es de hoy: eso es una historia
 * ambigua y su sitio es la mesa.
 */
export function motivosPermanentes(
  story: DeskStory,
  { today, maxAgeDays = DIAS_VENTANA_AUTOPUBLICACION }: { today: string; maxAgeDays?: number }
): string[] {
  const motivos: string[] = [];

  if (story.publishedAt) {
    const dias = Math.floor(
      (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${story.publishedAt}T00:00:00Z`)) / 86_400_000
    );
    if (Number.isFinite(dias) && dias > maxAgeDays) {
      motivos.push(`publicada hace ${dias} días: fuera de la ventana de ${maxAgeDays} y sólo se aleja`);
    }
  }

  const verification = story.verification as ({ scope?: string; unconfirmed?: string[] } | null) ?? null;

  if (verification) {
    const porAlcance =
      verification.scope === 'integration' ||
      (verification.unconfirmed ?? []).some((punto) => MARCA_ALCANCE.test(punto));

    if (porAlcance) {
      motivos.push('la página acredita una integración, no el lanzamiento del fabricante');
    }
  }

  return motivos;
}

/**
 * Clasifica una historia retenida.
 *
 * Sólo tiene sentido para las que ya tienen borrador: una historia sin redactar
 * no está esperando una decisión, está esperando evidencia.
 */
export function clasificarRetencion(
  story: DeskStory,
  opciones: { today: string; maxAgeDays?: number }
): Caducidad {
  const motivos = motivosPermanentes(story, opciones);
  return { permanente: motivos.length > 0, motivos };
}

export interface RepartoMesa {
  /** Bloqueos que pueden resolverse: esto sí es una decisión humana. */
  ambiguas: DeskStory[];
  /** No podrán autopublicarse nunca. Siguen accesibles y siguen siendo aprobables. */
  caducadas: Array<{ story: DeskStory; motivos: string[] }>;
}

/**
 * Separa lo que espera una decisión de lo que ya no.
 *
 * El orden se conserva: quien mira la mesa sigue viendo primero lo que el
 * triaje puntuó más alto dentro de cada grupo.
 */
export function repartirMesa(
  stories: readonly DeskStory[],
  opciones: { today: string; maxAgeDays?: number }
): RepartoMesa {
  const ambiguas: DeskStory[] = [];
  const caducadas: Array<{ story: DeskStory; motivos: string[] }> = [];

  for (const story of stories) {
    const { permanente, motivos } = clasificarRetencion(story, opciones);
    if (permanente) caducadas.push({ story, motivos });
    else ambiguas.push(story);
  }

  return { ambiguas, caducadas };
}
