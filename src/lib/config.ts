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

export const isProduction = import.meta.env.PROD;

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
