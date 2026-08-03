import { stripe as stripeConfig } from '@lib/config';

/**
 * Plan catalogue.
 *
 * Prices are **not** hardcoded in components. They come from here, and here
 * they come from environment variables (Stripe price ids) with a documented
 * fallback for display. In production the amounts shown on the pricing page are
 * read from Stripe itself (`syncPlansFromStripe`), so the page can never
 * advertise a price that differs from what Checkout will charge.
 */

export interface Plan {
  id: 'free' | 'pro_monthly' | 'pro_yearly';
  tier: 'free' | 'pro';
  name: string;
  tagline: string;
  /** Cents. Only used for display; Stripe is the source of truth when live. */
  amountCents: number;
  currency: 'eur';
  interval: 'month' | 'year' | null;
  stripePriceId: string;
  features: string[];
  limits: string[];
  highlighted?: boolean;
}

export const PLANS: readonly Plan[] = [
  {
    id: 'free',
    tier: 'free',
    name: 'Gratis',
    tagline: 'Todo el contenido, para siempre.',
    amountCents: 0,
    currency: 'eur',
    interval: null,
    stripePriceId: '',
    features: [
      'Catálogo completo y todas las fichas',
      'Búsqueda y filtros combinables',
      'Comparador de hasta 4 herramientas',
      'Favoritos y hasta 3 listas',
      'Hasta 5 avisos de cambio',
      'Boletín semanal',
    ],
    limits: ['Los avisos llegan en el resumen semanal, no al instante.'],
  },
  {
    id: 'pro_monthly',
    tier: 'pro',
    name: 'Radar Pro',
    tagline: 'Para quien depende de que el plan gratuito siga siendo gratuito.',
    amountCents: 500,
    currency: 'eur',
    interval: 'month',
    stripePriceId: stripeConfig.priceMonthly,
    highlighted: true,
    features: [
      'Avisos inmediatos, no semanales',
      'Seguimiento de cambios de precio y de plan',
      'Listas y comparaciones guardadas sin límite',
      'Historial completo de cambios de cada herramienta',
      'Filtros avanzados y exportación a CSV',
      'Informes por categoría',
      'Sin anuncios',
    ],
    limits: [],
  },
  {
    id: 'pro_yearly',
    tier: 'pro',
    name: 'Radar Pro anual',
    tagline: 'Dos meses menos al año.',
    amountCents: 5000,
    currency: 'eur',
    interval: 'year',
    stripePriceId: stripeConfig.priceYearly,
    features: ['Todo lo de Radar Pro', 'Equivale a 4,17 € al mes'],
    limits: [],
  },
] as const;

export function getPlan(id: string): Plan | undefined {
  return PLANS.find((plan) => plan.id === id);
}

export function planForPriceId(priceId: string): Plan | undefined {
  return PLANS.find((plan) => plan.stripePriceId && plan.stripePriceId === priceId);
}

export function formatPrice(plan: Plan): string {
  if (plan.amountCents === 0) return 'Gratis';
  const amount = (plan.amountCents / 100).toLocaleString('es-ES', {
    style: 'currency',
    currency: plan.currency.toUpperCase(),
    minimumFractionDigits: plan.amountCents % 100 === 0 ? 0 : 2,
  });
  return plan.interval === 'year' ? `${amount}/año` : `${amount}/mes`;
}

/**
 * Features gated behind the paid tier.
 *
 * Centralised so a gate is never re-implemented inline and so the pricing page
 * and the enforcement code cannot drift apart.
 */
export const PRO_FEATURES = {
  instantAlerts: 'Avisos inmediatos',
  unlimitedLists: 'Listas ilimitadas',
  savedComparisons: 'Comparaciones guardadas',
  fullHistory: 'Historial completo de cambios',
  csvExport: 'Exportación a CSV',
  adFree: 'Sin anuncios',
} as const;

export type ProFeature = keyof typeof PRO_FEATURES;

export function canUse(feature: ProFeature, plan: 'free' | 'pro'): boolean {
  void feature;
  return plan === 'pro';
}
