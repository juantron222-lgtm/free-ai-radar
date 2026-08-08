import { describe, expect, it } from 'vitest';
import { deploymentEnv, emailSendPolicy, isRealProduction, stripeKeyPolicy } from '@lib/config';

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

describe('el correo real exige las cuatro condiciones a la vez', () => {
  const KEY = 're_clave_de_prueba';

  /** The only combination that sends. */
  const LIVE = {
    DEPLOYMENT_ENV: 'production',
    EMAIL_SEND_MODE: 'live',
    RESEND_API_KEY: KEY,
  };

  it('producción + live + sin dry-run + clave válida → ENVÍA', () => {
    const decision = emailSendPolicy(KEY, LIVE);
    expect(decision.live).toBe(true);
  });

  it('development → nunca envía', () => {
    expect(emailSendPolicy(KEY, { ...LIVE, DEPLOYMENT_ENV: 'development' }).live).toBe(false);
  });

  it('preview → nunca envía', () => {
    const decision = emailSendPolicy(KEY, { ...LIVE, DEPLOYMENT_ENV: 'preview' });
    expect(decision.live).toBe(false);
    expect(decision.reason).toContain('preview');
  });

  it('staging → nunca envía', () => {
    expect(emailSendPolicy(KEY, { ...LIVE, DEPLOYMENT_ENV: 'staging' }).live).toBe(false);
  });

  it('entorno desconocido → nunca envía', () => {
    expect(emailSendPolicy(KEY, { ...LIVE, DEPLOYMENT_ENV: 'qa' }).live).toBe(false);
    expect(emailSendPolicy(KEY, { EMAIL_SEND_MODE: 'live', RESEND_API_KEY: KEY }).live).toBe(false);
  });

  it('producción SIN EMAIL_SEND_MODE=live → no envía', () => {
    const sinModo = { DEPLOYMENT_ENV: 'production', RESEND_API_KEY: KEY };
    expect(emailSendPolicy(KEY, sinModo).live).toBe(false);
    expect(emailSendPolicy(KEY, { ...sinModo, EMAIL_SEND_MODE: 'test' }).live).toBe(false);
    expect(emailSendPolicy(KEY, { ...sinModo, EMAIL_SEND_MODE: 'true' }).live).toBe(false);
  });

  it('EMAIL_DRY_RUN=1 gana SIEMPRE, incluso en producción habilitada', () => {
    const decision = emailSendPolicy(KEY, { ...LIVE, EMAIL_DRY_RUN: '1' });
    expect(decision.live).toBe(false);
    expect(decision.reason).toBe('EMAIL_DRY_RUN=1');
  });

  it('sin clave no envía, aunque todo lo demás esté', () => {
    expect(emailSendPolicy('', LIVE).live).toBe(false);
    expect(emailSendPolicy('   ', LIVE).live).toBe(false);
  });

  it('una clave con forma equivocada no envía', () => {
    // A placeholder or a key from another service must not pass for a real one.
    expect(emailSendPolicy('sk_live_algo', LIVE).live).toBe(false);
    expect(emailSendPolicy('[YOUR-KEY]', LIVE).live).toBe(false);
    expect(emailSendPolicy('pon-aqui-la-clave', LIVE).live).toBe(false);
  });

  it('EMAIL_SEND_MODE=live no distingue mayúsculas ni espacios', () => {
    expect(emailSendPolicy(KEY, { ...LIVE, EMAIL_SEND_MODE: '  LIVE ' }).live).toBe(true);
  });

  it('la razón siempre dice por qué, para no tener que adivinar', () => {
    for (const env of [
      { DEPLOYMENT_ENV: 'preview' },
      { DEPLOYMENT_ENV: 'production' },
      { ...LIVE, EMAIL_DRY_RUN: '1' },
      {},
    ]) {
      const decision = emailSendPolicy(KEY, env);
      expect(decision.reason.length, JSON.stringify(env)).toBeGreaterThan(0);
    }
  });
});

describe('el caso concreto que preocupa: una RESEND_API_KEY accidental en Preview', () => {
  it('no envía nada, ni con la clave puesta y sin dry-run', () => {
    /*
     * Exactly the shape of the accident: somebody copies the production
     * variables into Preview, forgets EMAIL_DRY_RUN, and the old rule sent
     * real password resets from a throwaway URL because a Preview compiles as
     * production.
     */
    const preview = {
      VERCEL_ENV: 'preview',
      RESEND_API_KEY: 're_una_clave_real_de_verdad',
      EMAIL_SEND_MODE: 'live',
    };
    const decision = emailSendPolicy(preview.RESEND_API_KEY, preview);
    expect(decision.live).toBe(false);
    expect(decision.reason).toContain('preview');
  });

  it('tampoco con VERCEL_ENV ausente y NODE_ENV=production', () => {
    const decision = emailSendPolicy('re_clave', {
      NODE_ENV: 'production',
      EMAIL_SEND_MODE: 'live',
    });
    expect(decision.live).toBe(false);
  });

  it('sólo una combinación de las 32 posibles envía', () => {
    // Four independent conditions: enumerate them all and count.
    const values = {
      DEPLOYMENT_ENV: ['production', 'preview'],
      EMAIL_SEND_MODE: ['live', 'off'],
      EMAIL_DRY_RUN: ['1', '0'],
      key: ['re_ok', ''],
    };

    let sending = 0;
    for (const env of values.DEPLOYMENT_ENV)
      for (const mode of values.EMAIL_SEND_MODE)
        for (const dry of values.EMAIL_DRY_RUN)
          for (const key of values.key) {
            if (
              emailSendPolicy(key, {
                DEPLOYMENT_ENV: env,
                EMAIL_SEND_MODE: mode,
                EMAIL_DRY_RUN: dry,
              }).live
            ) {
              sending += 1;
            }
          }

    expect(sending, 'más de una combinación envía correo real').toBe(1);
  });
});

describe('hoy no hay clave de Resend', () => {
  it('el entorno real no trae RESEND_API_KEY', () => {
    expect((process.env['RESEND_API_KEY'] ?? '').trim()).toBe('');
  });

  it('y aunque la trajera, este entorno no enviaría', () => {
    expect(emailSendPolicy('re_lo_que_sea', process.env).live).toBe(false);
  });
});
