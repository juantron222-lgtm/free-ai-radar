import type { ScoreComponents, Tool } from './tool';

/**
 * Free AI Radar scoring, v2.
 *
 * Design rules that the previous version broke and that the tests enforce:
 *
 * 1. **Weights sum to 1.** The weighted average of five 0–10 components is
 *    multiplied by 10, so a tool scoring 10 everywhere lands on exactly 100 and
 *    a tool scoring 0 everywhere lands on exactly 0. No free constant is added.
 * 2. **Penalties are named and never double-counted.** Each penalty answers a
 *    distinct question. `requiresCreditCard` lowers the score once, not once via
 *    the penalty and again via a hand-tuned `freeReal`.
 * 3. **Unverified is not punished.** We do not know, so we neither reward nor
 *    penalise — we surface it. Only confirmed facts move the number.
 * 4. **The breakdown is publishable.** Every adjustment carries a label, so the
 *    tool page can show precisely why a score is what it is.
 */

export const SCORE_WEIGHTS: Record<keyof ScoreComponents, number> = {
  freeReal: 0.3,
  usefulness: 0.3,
  ease: 0.15,
  transparency: 0.15,
  creatorValue: 0.1,
};

export interface ScoreAdjustment {
  label: string;
  points: number;
  reason: string;
}

export interface ScoreBreakdown {
  base: number;
  adjustments: ScoreAdjustment[];
  total: number;
}

export interface ScoreInput {
  scores: ScoreComponents;
  freeModel: Tool['freeModel'];
  freePlan: Pick<
    Tool['freePlan'],
    'requiresCreditCard' | 'hasWatermark' | 'commercialUse' | 'creditReset'
  >;
  openSource: Tool['openSource'];
}

/**
 * Penalties and bonuses, applied to the 0–100 base.
 *
 * Kept as data rather than a chain of ifs so `docs/` and the public methodology
 * page can render the exact same table the code uses.
 */
const RULES: ReadonlyArray<{
  label: string;
  reason: string;
  points: number;
  applies: (input: ScoreInput) => boolean;
}> = [
  {
    label: 'Exige tarjeta para el plan gratuito',
    reason:
      'Pedir tarjeta para acceder a lo gratuito convierte el plan en una prueba con cobro automático.',
    points: -12,
    applies: (i) => i.freePlan.requiresCreditCard === 'yes',
  },
  {
    label: 'Marca de agua en el resultado',
    reason: 'La marca de agua impide usar el resultado en trabajo real sin pagar.',
    points: -8,
    applies: (i) => i.freePlan.hasWatermark === 'yes',
  },
  {
    label: 'Sin uso comercial en el plan gratuito',
    reason: 'Si no puedes monetizar lo que produces, el plan gratuito sólo sirve para practicar.',
    points: -10,
    applies: (i) => i.freePlan.commercialUse === 'no',
  },
  {
    label: 'Uso comercial parcial',
    reason: 'Uso comercial permitido sólo con condiciones (atribución, volumen o tipo de proyecto).',
    points: -4,
    applies: (i) => i.freePlan.commercialUse === 'partial',
  },
  {
    label: 'Créditos que no se renuevan',
    reason: 'Un crédito inicial que no se repone es una prueba, no una capa gratuita.',
    points: -10,
    applies: (i) => i.freeModel === 'credits' && i.freePlan.creditReset === 'one_off',
  },
  {
    label: 'Sólo prueba temporal',
    reason: 'El acceso caduca; después hay que pagar para seguir usándolo.',
    points: -12,
    applies: (i) => i.freeModel === 'trial',
  },
  {
    label: 'Sólo demo',
    reason: 'Permite ver cómo funciona pero no producir trabajo aprovechable.',
    points: -18,
    applies: (i) => i.freeModel === 'demo',
  },
  {
    label: 'Sin capa gratuita',
    reason: 'No hay nada utilizable sin pagar.',
    points: -30,
    applies: (i) => i.freeModel === 'paid_only',
  },
  {
    label: 'Código abierto verificado',
    reason:
      'Los pesos o el código son auditables y la gratuidad no depende de una decisión comercial futura.',
    points: +6,
    applies: (i) => i.openSource === 'yes',
  },
];

export function computeScoreBreakdown(input: ScoreInput): ScoreBreakdown {
  const base =
    (Object.keys(SCORE_WEIGHTS) as Array<keyof ScoreComponents>).reduce(
      (acc, key) => acc + clamp(input.scores[key], 0, 10) * SCORE_WEIGHTS[key],
      0
    ) * 10;

  const adjustments = RULES.filter((rule) => rule.applies(input)).map((rule) => ({
    label: rule.label,
    points: rule.points,
    reason: rule.reason,
  }));

  const raw = adjustments.reduce((acc, a) => acc + a.points, base);

  return {
    base: round1(base),
    adjustments,
    total: Math.round(clamp(raw, 0, 100)),
  };
}

export function computeScore(input: ScoreInput): number {
  return computeScoreBreakdown(input).total;
}

export type ScoreBand = 'excellent' | 'good' | 'fair' | 'poor';

export function scoreBand(score: number): ScoreBand {
  if (score >= 80) return 'excellent';
  if (score >= 65) return 'good';
  if (score >= 45) return 'fair';
  return 'poor';
}

export const SCORE_BAND_LABEL: Record<ScoreBand, string> = {
  excellent: 'Recomendada',
  good: 'Sólida',
  fair: 'Con reservas',
  poor: 'No compensa',
};

/**
 * A verified fact goes stale. After 120 days we stop presenting the free-plan
 * data as current and ask the reader to help us re-check it.
 */
export const STALE_AFTER_DAYS = 120;
export const VERY_STALE_AFTER_DAYS = 240;

export type Freshness = 'fresh' | 'stale' | 'very_stale';

export function freshnessOf(lastVerifiedAt: string, now: Date = new Date()): Freshness {
  const days = daysBetween(lastVerifiedAt, now);
  if (days >= VERY_STALE_AFTER_DAYS) return 'very_stale';
  if (days >= STALE_AFTER_DAYS) return 'stale';
  return 'fresh';
}

export function daysBetween(isoDate: string, now: Date = new Date()): number {
  const then = Date.parse(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(then)) return Number.POSITIVE_INFINITY;
  return Math.floor((now.getTime() - then) / 86_400_000);
}

/**
 * Auto-generated badges. Derived on read so a stored badge can never contradict
 * the record it describes.
 */
export function deriveTags(tool: Pick<Tool, 'freeModel' | 'freePlan' | 'openSource' | 'hosting' | 'scoreTotal' | 'scores'>): string[] {
  const tags = new Set<string>();

  if (tool.freePlan.requiresCreditCard === 'no') tags.add('Sin tarjeta');
  if (tool.freePlan.requiresSignup === 'no') tags.add('Sin registro');
  if (tool.freePlan.hasWatermark === 'no') tags.add('Sin marca de agua');
  if (tool.freePlan.commercialUse === 'yes') tags.add('Uso comercial');
  if (tool.openSource === 'yes') tags.add('Open source');
  if (tool.hosting === 'local' || tool.hosting === 'hybrid') tags.add('Funciona en local');
  if (tool.freeModel === 'free_real') tags.add('Gratis real');
  if (tool.scores.ease >= 8) tags.add('Fácil de empezar');
  if (tool.scores.creatorValue >= 8) tags.add('Para creadores');
  if (tool.scoreTotal >= 80) tags.add('Recomendada');
  if (tool.freePlan.requiresCreditCard === 'yes') tags.add('Pide tarjeta');
  if (tool.freeModel === 'trial' || tool.freeModel === 'demo') tags.add('Acceso limitado');

  return [...tags];
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
