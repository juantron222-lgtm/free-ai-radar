import { describe, expect, it } from 'vitest';
import { deploymentEnv, isRealProduction, stripeKeyPolicy } from '@lib/config';

/**
 * Where a deployment thinks it is, and who is allowed to charge a card there.
 *
 * The bug these exist for: the Stripe guard asked `import.meta.env.PROD`,
 * which is true for a Vercel Preview. A Preview therefore counted as
 * production and would have accepted a live secret key — the single most
 * expensive mistake available in this codebase, because its consequence is a
 * real charge on somebody's real card.
 *
 * Every case below is written from the same principle: refusing wrongly costs
 * an error message, allowing wrongly costs money.
 */

describe('el entorno de despliegue se declara, no se adivina', () => {
  it('DEPLOYMENT_ENV manda sobre VERCEL_ENV', () => {
    expect(deploymentEnv({ DEPLOYMENT_ENV: 'staging', VERCEL_ENV: 'production' })).toBe('staging');
  });

  it('reconoce los tres valores que pone Vercel', () => {
    expect(deploymentEnv({ VERCEL_ENV: 'production' })).toBe('production');
    expect(deploymentEnv({ VERCEL_ENV: 'preview' })).toBe('preview');
    expect(deploymentEnv({ VERCEL_ENV: 'development' })).toBe('development');
  });

  it('acepta staging, que Vercel no usa pero nosotros sí', () => {
    expect(deploymentEnv({ DEPLOYMENT_ENV: 'staging' })).toBe('staging');
  });

  it('no distingue mayúsculas ni espacios sobrantes', () => {
    expect(deploymentEnv({ VERCEL_ENV: '  Production  ' })).toBe('production');
  });

  it('un valor que nadie ha declarado es "unknown", no una suposición', () => {
    expect(deploymentEnv({ VERCEL_ENV: 'prod' })).toBe('unknown');
    expect(deploymentEnv({ DEPLOYMENT_ENV: 'produccion' })).toBe('unknown');
    expect(deploymentEnv({ VERCEL_ENV: 'qa' })).toBe('unknown');
  });

  it('no infiere el entorno de una URL ni de una rama', () => {
    // These are all things that look like the environment without being it,
    // which is exactly how a Preview came to count as production.
    expect(
      deploymentEnv({
        VERCEL_URL: 'www.freeairadar.com',
        VERCEL_GIT_COMMIT_REF: 'main',
        NODE_ENV: 'production',
      })
    ).not.toBe('production');
  });
});

describe('isRealProduction', () => {
  it('sólo es cierto para "production" declarado', () => {
    expect(isRealProduction({ VERCEL_ENV: 'production' })).toBe(true);
    expect(isRealProduction({ DEPLOYMENT_ENV: 'production' })).toBe(true);
  });

  it('es falso para todo lo demás', () => {
    for (const env of [
      { VERCEL_ENV: 'preview' },
      { VERCEL_ENV: 'development' },
      { DEPLOYMENT_ENV: 'staging' },
      { VERCEL_ENV: 'qa' },
      { NODE_ENV: 'production' },
      {},
    ]) {
      expect(isRealProduction(env), JSON.stringify(env)).toBe(false);
    }
  });
});

describe('una clave live de Stripe sólo vale en producción real', () => {
  const LIVE = 'sk_live_abc123';
  const TEST = 'sk_test_abc123';

  it('development + sk_live_ → FALLA', () => {
    const verdict = stripeKeyPolicy(LIVE, { VERCEL_ENV: 'development' });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain('"development"');
  });

  it('preview + sk_live_ → FALLA', () => {
    // The case that existed before this change: a Vercel Preview compiles as
    // production, so the old guard let a live key through.
    const verdict = stripeKeyPolicy(LIVE, { VERCEL_ENV: 'preview' });
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain('"preview"');
  });

  it('staging + sk_live_ → FALLA', () => {
    expect(stripeKeyPolicy(LIVE, { DEPLOYMENT_ENV: 'staging' }).allowed).toBe(false);
  });

  it('entorno desconocido + sk_live_ → FALLA', () => {
    expect(stripeKeyPolicy(LIVE, { VERCEL_ENV: 'qa' }).allowed).toBe(false);
    expect(stripeKeyPolicy(LIVE, {}).allowed).toBe(false);
  });

  it('producción real + sk_live_ → permitido', () => {
    expect(stripeKeyPolicy(LIVE, { VERCEL_ENV: 'production' }).allowed).toBe(true);
    expect(stripeKeyPolicy(LIVE, { DEPLOYMENT_ENV: 'production' }).allowed).toBe(true);
  });

  it('una clave de test vale en cualquier entorno', () => {
    for (const env of [
      { VERCEL_ENV: 'development' },
      { VERCEL_ENV: 'preview' },
      { DEPLOYMENT_ENV: 'staging' },
      { VERCEL_ENV: 'production' },
      { VERCEL_ENV: 'inventado' },
      {},
    ]) {
      expect(stripeKeyPolicy(TEST, env).allowed, JSON.stringify(env)).toBe(true);
    }
  });

  it('sin clave no hay nada que impedir: la facturación va simulada', () => {
    expect(stripeKeyPolicy('', { VERCEL_ENV: 'preview' }).allowed).toBe(true);
    expect(stripeKeyPolicy('   ', {}).allowed).toBe(true);
  });

  it('una clave restringida live tampoco pasa fuera de producción', () => {
    expect(stripeKeyPolicy('rk_live_abc', { VERCEL_ENV: 'preview' }).allowed).toBe(false);
  });

  it('NODE_ENV=production no basta: hay que declararlo', () => {
    // The whole point: something that merely looks like production is not it.
    expect(stripeKeyPolicy(LIVE, { NODE_ENV: 'production' }).allowed).toBe(false);
  });

  it('el motivo nombra el entorno detectado, para no tener que adivinar', () => {
    expect(stripeKeyPolicy(LIVE, { VERCEL_ENV: 'preview' }).reason).toMatch(/DEPLOYMENT_ENV|VERCEL_ENV/);
  });
});

describe('hoy no hay ninguna clave de Stripe', () => {
  it('el entorno real no trae STRIPE_SECRET_KEY', () => {
    // If this fails, somebody added a key without saying so.
    expect((process.env['STRIPE_SECRET_KEY'] ?? '').trim()).toBe('');
  });
});
