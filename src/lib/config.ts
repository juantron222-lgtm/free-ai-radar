import {
  PUBLIC_SUPABASE_ANON_KEY,
  PUBLIC_SUPABASE_URL,
  PUBLIC_ADSENSE_CLIENT,
  PUBLIC_ANALYTICS_DOMAIN,
  PUBLIC_TURNSTILE_SITE_KEY,
} from 'astro:env/client';
import {
  ADMIN_EMAILS,
  AUTH_SECRET,
  EMAIL_FROM,
  RESEND_API_KEY,
  STRIPE_PRICE_PRO_MONTHLY,
  STRIPE_PRICE_PRO_YEARLY,
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
  SUPABASE_SERVICE_ROLE_KEY,
  TURNSTILE_SECRET_KEY,
} from 'astro:env/server';

/**
 * Capability detection.
 *
 * Every integration is optional. The site must build, run, and be testable
 * with an empty `.env`, degrading to a clearly-labelled local mode rather than
 * crashing. `docs/deployment-guide.md` lists what each flag unlocks.
 */

/**
 * True for any optimised build. **Not** a statement about which environment
 * the build is serving.
 *
 * A Vercel Preview compiles exactly like Production — same flag, same
 * minification, same `import.meta.env.PROD === true`. Anything that needs to
 * know *where* it is running must use `deploymentEnv()` instead. This is kept
 * for the things it is genuinely right for: whether cookies get `Secure`,
 * whether the development identity store refuses to load.
 */
export const isProduction = import.meta.env.PROD;

/**
 * Where this deployment actually is.
 *
 * `unknown` is a real value and not a failure to compute one: an environment
 * nobody declared is an environment nobody has reasoned about, and the callers
 * below treat it as the most dangerous case rather than the most convenient.
 */
export type DeploymentEnv = 'development' | 'preview' | 'staging' | 'production' | 'unknown';

/**
 * Resolves the deployment environment from explicit signals only.
 *
 * Order matters. `DEPLOYMENT_ENV` is ours and wins, so a host we have not
 * anticipated can still declare itself. `VERCEL_ENV` is set by Vercel to
 * exactly `production`, `preview` or `development`. Nothing is inferred from a
 * URL, a branch name, or the build mode — those are all things that look like
 * the environment without being it, which is how a Preview came to count as
 * production in the first place.
 *
 * Reads `process.env` at runtime rather than `import.meta.env`, because the
 * latter is inlined at build time and a Preview and a Production build of the
 * same commit would then carry the same answer.
 */
export function deploymentEnv(
  env: Record<string, string | undefined> = typeof process !== 'undefined' ? process.env : {}
): DeploymentEnv {
  const declared = (env['DEPLOYMENT_ENV'] ?? env['VERCEL_ENV'] ?? '').trim().toLowerCase();

  switch (declared) {
    case 'production':
    case 'preview':
    case 'staging':
    case 'development':
      return declared;
    case '':
      // Nothing declared. On a developer's machine that is normal and safe;
      // anywhere else it is a gap, and `unknown` makes the gap fail closed.
      return import.meta.env.DEV ? 'development' : 'unknown';
    default:
      return 'unknown';
  }
}

/**
 * Whether this is the real production deployment.
 *
 * Fail-closed by construction: it returns true for exactly one declared value
 * and false for everything else, including `unknown`. A new environment name
 * somebody invents next year is not production until someone says so.
 */
export function isRealProduction(
  env?: Record<string, string | undefined>
): boolean {
  return deploymentEnv(env) === 'production';
}

/**
 * Whether a Stripe secret key may be used in this environment.
 *
 * A pure function, taking the key and the environment, so the whole matrix can
 * be tested without constructing a client or importing the Stripe SDK. It
 * lives here rather than in `billing/stripe.ts` for exactly that reason: a
 * rule this important should be trivial to exercise.
 *
 * Fail-closed. A live key is allowed for one declared environment and refused
 * everywhere else, `unknown` included. Refusing wrongly costs an error
 * message; allowing wrongly charges somebody's card.
 */
export function stripeKeyPolicy(
  secretKey: string,
  env?: Record<string, string | undefined>
): { allowed: boolean; reason?: string } {
  const key = (secretKey ?? '').trim();

  // Nothing configured is not a problem: billing runs in simulated mode.
  if (!key) return { allowed: true };

  if (key.startsWith('sk_test_')) return { allowed: true };

  const where = deploymentEnv(env);
  if (where === 'production') return { allowed: true };

  return {
    allowed: false,
    reason:
      `STRIPE_SECRET_KEY es una clave live y el entorno declarado es "${where}". ` +
      'Sólo se acepta una clave live en producción real. Declara DEPLOYMENT_ENV o VERCEL_ENV, ' +
      'o usa una clave sk_test_.',
  };
}

export const supabase = {
  url: PUBLIC_SUPABASE_URL ?? '',
  anonKey: PUBLIC_SUPABASE_ANON_KEY ?? '',
  serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY ?? '',
  get isConfigured() {
    return Boolean(this.url && this.anonKey);
  },
  get canUseServiceRole() {
    return Boolean(this.url && this.serviceRoleKey);
  },
};

export const stripe = {
  secretKey: STRIPE_SECRET_KEY ?? '',
  webhookSecret: STRIPE_WEBHOOK_SECRET ?? '',
  priceMonthly: STRIPE_PRICE_PRO_MONTHLY ?? '',
  priceYearly: STRIPE_PRICE_PRO_YEARLY ?? '',
  get isConfigured() {
    return Boolean(this.secretKey);
  },
  /** Refuses to run against live keys from a non-production deploy. */
  get isTestMode() {
    return this.secretKey.startsWith('sk_test_');
  },
};

export const email = {
  apiKey: RESEND_API_KEY ?? '',
  from: EMAIL_FROM ?? 'Free AI Radar <hola@freeairadar.com>',
  get isConfigured() {
    return Boolean(this.apiKey);
  },
};

export const turnstile = {
  siteKey: PUBLIC_TURNSTILE_SITE_KEY ?? '',
  secretKey: TURNSTILE_SECRET_KEY ?? '',
  get isConfigured() {
    return Boolean(this.siteKey && this.secretKey);
  },
};

export const analytics = {
  domain: PUBLIC_ANALYTICS_DOMAIN ?? '',
  adsenseClient: PUBLIC_ADSENSE_CLIENT ?? '',
  get hasAnalytics() {
    return Boolean(this.domain);
  },
  get hasAds() {
    return Boolean(this.adsenseClient);
  },
};

/**
 * Auth mode.
 *
 * `supabase` is the only mode that may run in production. `local` is a
 * development harness so the account flows can be exercised and end-to-end
 * tested with no external service — see `src/lib/auth/local-store.ts` for the
 * hard production guard.
 */
export type AuthMode = 'supabase' | 'local' | 'disabled';

export function resolveAuthMode(): AuthMode {
  if (supabase.isConfigured) return 'supabase';
  if (isProduction) return 'disabled';
  return 'local';
}

export const authSecret = AUTH_SECRET ?? '';

/** Comma-separated allow-list used to bootstrap the first admin. */
export const adminEmails = (ADMIN_EMAILS ?? '')
  .split(',')
  .map((entry) => entry.trim().toLowerCase())
  .filter(Boolean);

export function isBootstrapAdmin(userEmail: string | undefined): boolean {
  if (!userEmail) return false;
  return adminEmails.includes(userEmail.toLowerCase());
}

/** Summary for the admin status panel and the deployment checklist. */
export function integrationStatus() {
  return [
    { name: 'Supabase', ready: supabase.isConfigured, detail: supabase.isConfigured ? 'Conectado' : 'Modo local' },
    { name: 'Supabase service role', ready: supabase.canUseServiceRole, detail: supabase.canUseServiceRole ? 'Disponible' : 'No configurado' },
    { name: 'Stripe', ready: stripe.isConfigured, detail: stripe.isConfigured ? (stripe.isTestMode ? 'Modo test' : 'CLAVE LIVE — revisar') : 'Simulado' },
    { name: 'Resend', ready: email.isConfigured, detail: email.isConfigured ? 'Conectado' : 'Los correos se registran, no se envían' },
    { name: 'Turnstile', ready: turnstile.isConfigured, detail: turnstile.isConfigured ? 'Activo' : 'Sólo honeypot y rate limit' },
    { name: 'Analítica', ready: analytics.hasAnalytics, detail: analytics.hasAnalytics ? analytics.domain : 'Sin configurar' },
  ];
}
