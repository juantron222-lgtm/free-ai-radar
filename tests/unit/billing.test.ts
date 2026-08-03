import { describe, expect, it } from 'vitest';
import { PLANS, canUse, formatPrice, getPlan, planForPriceId } from '@lib/billing/plans';
import { HANDLED_EVENTS } from '@lib/billing/stripe';
import { Sponsorship } from '@lib/domain/tool';
import { MAX_ALERTS_FREE, MAX_LISTS_FREE, DEFAULT_PREFERENCES } from '@lib/data/user-data';

describe('catálogo de planes', () => {
  it('incluye un plan gratuito y al menos uno de pago', () => {
    expect(PLANS.some((plan) => plan.tier === 'free')).toBe(true);
    expect(PLANS.some((plan) => plan.tier === 'pro')).toBe(true);
  });

  it('el plan gratuito cuesta cero', () => {
    expect(getPlan('free')?.amountCents).toBe(0);
  });

  it('el anual sale más barato por mes que el mensual', () => {
    const monthly = getPlan('pro_monthly')!;
    const yearly = getPlan('pro_yearly')!;
    expect(yearly.amountCents / 12).toBeLessThan(monthly.amountCents);
  });

  it('formatea los precios en euros', () => {
    expect(formatPrice(getPlan('free')!)).toBe('Gratis');
    expect(formatPrice(getPlan('pro_monthly')!)).toMatch(/€\/mes$/);
    expect(formatPrice(getPlan('pro_yearly')!)).toMatch(/€\/año$/);
  });

  it('devuelve undefined para un plan inexistente', () => {
    expect(getPlan('pro_infinito')).toBeUndefined();
  });

  it('no resuelve un price id vacío a ningún plan', () => {
    // Sin Stripe configurado los price id están vacíos; un '' no debe
    // colar como coincidencia y activar Pro por accidente.
    expect(planForPriceId('')).toBeUndefined();
  });

  it('el plan gratuito da acceso a todo el contenido', () => {
    const free = getPlan('free')!;
    expect(free.features.join(' ')).toMatch(/catálogo completo/i);
  });
});

describe('funciones de pago', () => {
  it('las funciones Pro están cerradas al plan gratuito', () => {
    expect(canUse('instantAlerts', 'free')).toBe(false);
    expect(canUse('csvExport', 'free')).toBe(false);
  });

  it('las funciones Pro están abiertas al plan de pago', () => {
    expect(canUse('instantAlerts', 'pro')).toBe(true);
    expect(canUse('adFree', 'pro')).toBe(true);
  });

  it('los límites del plan gratuito son generosos pero finitos', () => {
    expect(MAX_LISTS_FREE).toBeGreaterThan(0);
    expect(MAX_ALERTS_FREE).toBeGreaterThan(MAX_LISTS_FREE);
  });
});

describe('separación entre negocio y criterio editorial', () => {
  it('el esquema impide cualquier impulso de posición por patrocinio', () => {
    // El contrato está en el tipo: placementBoost sólo admite 0.
    expect(Sponsorship.safeParse({ isSponsored: true, placementBoost: 5 }).success).toBe(false);
    expect(Sponsorship.safeParse({ isSponsored: true, placementBoost: 0 }).success).toBe(true);
  });

  it('un patrocinio sin valor explícito no impulsa nada', () => {
    const parsed = Sponsorship.parse({ isSponsored: true });
    expect(parsed.placementBoost).toBe(0);
  });
});

describe('webhooks de Stripe', () => {
  it('atiende los eventos del ciclo de vida de una suscripción', () => {
    expect(HANDLED_EVENTS).toContain('checkout.session.completed');
    expect(HANDLED_EVENTS).toContain('customer.subscription.updated');
    expect(HANDLED_EVENTS).toContain('customer.subscription.deleted');
    expect(HANDLED_EVENTS).toContain('invoice.payment_failed');
  });
});

describe('preferencias por defecto', () => {
  it('el correo comercial está desactivado por defecto', () => {
    // Opt-in explícito: nunca marcado de antemano.
    expect(DEFAULT_PREFERENCES.marketingOptIn).toBe(false);
  });

  it('los avisos inmediatos están desactivados por defecto', () => {
    expect(DEFAULT_PREFERENCES.instantAlerts).toBe(false);
  });
});
