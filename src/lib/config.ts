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

/**
 * Whether real email may leave this deployment.
 *
 * The same shape of bug the Stripe guard had: the old rule was
 * `!isProduction || EMAIL_DRY_RUN === '1'`, and a Vercel Preview *is*
 * `import.meta.env.PROD`. A Preview with a Resend key set and no dry-run flag
 * would have sent real mail to real inboxes — password resets, newsletter
 * confirmations — from a throwaway URL.
 *
 * Sending now requires **four independent conditions at once**, because a
 * single switch is a single mistake away from being flipped:
 *
 *   1. the declared environment is `production`;
 *   2. `EMAIL_SEND_MODE` says `live` — an explicit act, not a side effect of
 *      deploying;
 *   3. `EMAIL_DRY_RUN` is not `1`, which overrides everything else and always
 *      wins, including in production;
 *   4. the API key is present and shaped like a Resend key.
 *
 * Every other combination simulates. Simulation is the safe outcome rather
 * than an error: a password reset that logs instead of sending leaves the site
 * working, while one that throws breaks a page for a reason the visitor cannot
 * act on. Bulk campaigns are the exception and are blocked outright — see
 * `assertCampaignAllowed`.
 */
export type EmailSendDecision = { live: boolean; reason: string };

export function emailSendPolicy(
  apiKey: string,
  env: Record<string, string | undefined> = typeof process !== 'undefined' ? process.env : {}
): EmailSendDecision {
  // Checked first and unconditionally: a kill switch that something else can
  // outrank is not a kill switch.
  if ((env['EMAIL_DRY_RUN'] ?? '').trim() === '1') {
    return { live: false, reason: 'EMAIL_DRY_RUN=1' };
  }

  const where = deploymentEnv(env);
  if (where !== 'production') {
    return { live: false, reason: `entorno "${where}", no producción` };
  }

  if ((env['EMAIL_SEND_MODE'] ?? '').trim().toLowerCase() !== 'live') {
    return { live: false, reason: 'EMAIL_SEND_MODE no vale "live"' };
  }

  const key = (apiKey ?? '').trim();
  if (!key) return { live: false, reason: 'RESEND_API_KEY ausente' };
  if (!key.startsWith('re_')) {
    return { live: false, reason: 'RESEND_API_KEY no tiene forma de clave de Resend' };
  }

  return { live: true, reason: 'producción, envío habilitado explícitamente' };
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

/**
 * FASE C — TEMPORARY DIAGNOSTIC. Delete with the rest of the instrumentation.
 *
 * Reads the same variables through both routes available to us, in the exact
 * module that computes `supabase.isConfigured`, and reports booleans only.
 *
 * The two routes are not equivalent and that is the point of the comparison.
 * `astro:env/client` is resolved by Astro at **build** time and baked into the
 * output; `process.env` is read at **runtime** by the serverless function. A
 * variable that exists in one and not the other tells us precisely which layer
 * dropped it, which no amount of reading the Vercel dashboard can.
 *
 * Never returns a value, a prefix, a suffix, a length or a hash — a length is
 * a fingerprint and a hash of a short secret is reversible by guessing.
 */
export function __envDiagnostic() {
  const shape = (value: unknown) => {
    const raw = typeof value === 'string' ? value.trim() : '';
    let parsed: URL | null = null;
    try {
      parsed = raw ? new URL(raw) : null;
    } catch {
      parsed = null;
    }
    return {
      present: raw.length > 0,
      longerThan20: raw.length > 20,
      validHttpsUrl: parsed !== null && parsed.protocol === 'https:',
      hostEndsWithSupabaseCo: parsed !== null && /\.supabase\.co$/.test(parsed.hostname),
    };
  };

  // `process.env` may not exist in every runtime; ask rather than assume.
  const runtime: Record<string, string | undefined> =
    typeof process !== 'undefined' && process.env ? process.env : {};

  return {
    importMetaEnv: {
      PUBLIC_SUPABASE_URL: shape(PUBLIC_SUPABASE_URL),
      PUBLIC_SUPABASE_ANON_KEY: shape(PUBLIC_SUPABASE_ANON_KEY),
      SUPABASE_SERVICE_ROLE_KEY: shape(SUPABASE_SERVICE_ROLE_KEY),
    },
    processEnv: {
      PUBLIC_SUPABASE_URL: shape(runtime['PUBLIC_SUPABASE_URL']),
      PUBLIC_SUPABASE_ANON_KEY: shape(runtime['PUBLIC_SUPABASE_ANON_KEY']),
      SUPABASE_SERVICE_ROLE_KEY: shape(runtime['SUPABASE_SERVICE_ROLE_KEY']),
    },
    computed: {
      urlConfigured: Boolean(supabase.url),
      anonConfigured: Boolean(supabase.anonKey),
      serviceConfigured: Boolean(supabase.serviceRoleKey),
      isConfigured: supabase.isConfigured,
      canUseServiceRole: supabase.canUseServiceRole,
      resolvedAuthMode: resolveAuthMode(),
      isProductionBuild: isProduction,
      deploymentEnv: deploymentEnv(runtime),
    },
    context: {
      VERCEL_ENV: runtime['VERCEL_ENV'] ?? null,
      VERCEL_GIT_COMMIT_REF: runtime['VERCEL_GIT_COMMIT_REF'] ?? null,
      DEPLOYMENT_ENV: runtime['DEPLOYMENT_ENV'] ?? null,
      hasProcessEnv: typeof process !== 'undefined' && Boolean(process.env),
      publicVarCount: Object.keys(runtime).filter((k) => k.startsWith('PUBLIC_')).length,
      supabaseVarCount: Object.keys(runtime).filter((k) => k.startsWith('SUPABASE_')).length,
      totalVarCount: Object.keys(runtime).length,
    },
  };
}

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
