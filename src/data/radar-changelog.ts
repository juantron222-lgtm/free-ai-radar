/**
 * The site's own changelog — what changed in Free AI Radar, not in the tools.
 *
 * This is deliberately a hand-written module rather than an ingested dataset:
 * every entry is something we did on purpose and can vouch for. It is kept
 * away from the primary nav because a reader arrives wanting to know what
 * changed in the *tools*; that is `/noticias`. This page exists so that the
 * method itself is auditable — if we change how a score is computed, that has
 * to be visible somewhere a reader can find it.
 *
 * Rules for adding an entry:
 *   - Only record changes a reader could notice or that affect how we judge.
 *     Refactors, dependency bumps and typo fixes do not belong here.
 *   - `impact` says what it means for someone reading the site, in one line.
 *   - Never backdate. If it shipped today, it is dated today.
 */

export type RadarChangeKind =
  | 'metodologia'
  | 'catalogo'
  | 'funcionalidad'
  | 'transparencia'
  | 'correccion'
  | 'privacidad';

export interface RadarChange {
  /** ISO date, YYYY-MM-DD. The day the change went live. */
  date: string;
  kind: RadarChangeKind;
  title: string;
  /** What changed, factually. */
  detail: string;
  /** What it means for a reader. Omit when the change is purely internal. */
  impact?: string;
}

export const RADAR_CHANGE_KIND_LABEL: Record<RadarChangeKind, string> = {
  metodologia: 'Metodología',
  catalogo: 'Catálogo',
  funcionalidad: 'Funcionalidad',
  transparencia: 'Transparencia',
  correccion: 'Corrección',
  privacidad: 'Privacidad',
};

/** Newest first. */
export const RADAR_CHANGELOG: readonly RadarChange[] = [
  {
    date: '2026-08-07',
    kind: 'funcionalidad',
    title: 'Las noticias sustituyen al registro de cambios en el menú',
    detail:
      'El menú principal pasa a llevar a «Últimas noticias» (/noticias), con novedades de los fabricantes fechadas y con fuente. El registro de cambios de la propia web se mueve a esta página.',
    impact:
      'Lo que se ve primero es lo que cambia en las herramientas, no lo que cambia en este sitio.',
  },
  {
    date: '2026-08-07',
    kind: 'transparencia',
    title: 'Ninguna noticia se publica sin fuente del propio fabricante',
    detail:
      'El sistema editorial rechaza en tiempo de compilación cualquier noticia publicada cuyas fuentes no incluyan al menos una del dominio del fabricante. Las noticias con datos aún sin confirmar se marcan como parciales y listan exactamente qué falta por confirmar.',
    impact:
      'Si una noticia dice «parcial», puedes ver qué parte no está confirmada en lugar de tener que suponerlo.',
  },
  {
    date: '2026-08-07',
    kind: 'catalogo',
    title: 'Cada ficha declara qué es y cuánto se ha verificado',
    detail:
      'Las fichas incorporan tipo de entrada (modelo, aplicación, agente, framework, plataforma, interfaz, API o proyecto open source) y estado de verificación, con fecha de próxima revisión. Se estrenan las secciones /modelos y /agentes.',
    impact:
      'Un modelo y la aplicación que lo usa dejan de mezclarse: son cosas distintas y su gratuidad se decide en sitios distintos.',
  },
  {
    date: '2026-08-07',
    kind: 'metodologia',
    title: 'Un dato sin verificar ya no cuenta como un «sí»',
    detail:
      'Los hechos del plan gratuito (registro, tarjeta, marca de agua, uso comercial) admiten cuatro estados: sí, no, parcial y sin verificar. Un dato «sin verificar» nunca satisface un filtro ni suma en la puntuación.',
    impact:
      'Si filtras por «sin tarjeta», no aparecerá nada cuyo fabricante no lo diga con claridad.',
  },
  {
    date: '2026-08-07',
    kind: 'transparencia',
    title: 'El patrocinio no puede alterar una puntuación',
    detail:
      'La separación entre dinero y criterio editorial deja de ser una promesa y pasa a estar impuesta por el propio modelo de datos: el margen de posicionamiento pagado está acotado a cero, de modo que un patrocinio no puede mover una herramienta en un listado ordenado por puntuación.',
    impact:
      'Un contenido patrocinado se etiqueta como tal y aparece donde le corresponde por sus datos, no más arriba.',
  },
  {
    date: '2026-08-07',
    kind: 'privacidad',
    title: 'Nada se carga antes de que aceptes',
    detail:
      'La analítica y cualquier script de terceros quedan inertes hasta que se da el consentimiento, y la decisión se puede cambiar en cualquier momento desde el pie de página.',
    impact: 'Si no aceptas, no se ejecuta. No es una declaración: es cómo está montada la página.',
  },
];

export function getRadarChangelog(limit?: number): readonly RadarChange[] {
  const sorted = [...RADAR_CHANGELOG].sort((a, b) => b.date.localeCompare(a.date));
  return limit ? sorted.slice(0, limit) : sorted;
}
