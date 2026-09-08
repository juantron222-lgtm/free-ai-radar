// @ts-check
import { defineConfig, envField } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import vercel from '@astrojs/vercel';

const SITE = process.env.PUBLIC_SITE_URL || 'https://www.freeairadar.com';

/**
 * Hybrid rendering: everything is prerendered by default (fast, cacheable,
 * SEO-friendly). Routes that need a request context — account area, admin,
 * API endpoints — opt out with `export const prerender = false`.
 */
export default defineConfig({
  site: SITE,
  output: 'static',
  adapter: vercel({
    imageService: false,
    webAnalytics: { enabled: false },
  }),
  trailingSlash: 'never',
  build: {
    format: 'directory',
    inlineStylesheets: 'auto',
  },
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover',
  },
  devToolbar: {
    // The toolbar renders a fixed overlay that swallows pointer events at the
    // bottom of the viewport, which is exactly where the consent dialog sits.
    // Off during end-to-end runs so the tests drive the real UI.
    enabled: process.env.E2E !== '1',
  },
  /**
   * Every v1 URL keeps working. These are 301s, so accumulated link equity
   * transfers to the new Spanish-language paths instead of being thrown away.
   */
  redirects: {
    '/tools': { status: 301, destination: '/herramientas' },
    '/tools/[slug]': { status: 301, destination: '/herramientas/[slug]' },
    '/about': { status: 301, destination: '/sobre-el-proyecto' },
    '/methodology': { status: 301, destination: '/metodologia' },
    '/privacy': { status: 301, destination: '/legal/privacidad' },
    '/creators': { status: 301, destination: '/colecciones/para-creadores' },
    '/comfyui-sin-gpu': { status: 301, destination: '/guias/comfyui-sin-gpu' },
    // "Cambios" became "Últimas noticias". The site's own release log moved to
    // /transparencia/cambios-del-radar, but the old URL served tool changes,
    // so that is where its readers should land.
    '/cambios': { status: 301, destination: '/noticias' },
    '/changelog': { status: 301, destination: '/noticias' },
    // Imagen se rehízo como página propia. Una sola URL canónica: la vieja
    // conserva sus enlaces entrantes en vez de competir con la nueva.
    '/categorias/imagen': { status: 301, destination: '/imagen' },
    '/categorias/video': { status: 301, destination: '/video' },
    // Música y voz se unifican en una sola experiencia. Las dos viejas
    // conservan sus enlaces entrantes apuntando al mismo sitio.
    '/categorias/agentes': { status: 301, destination: '/agentes' },
    '/categorias/musica': { status: 301, destination: '/audio' },
    '/categorias/voz': { status: 301, destination: '/audio' },
  },
  vite: {
    plugins: [tailwindcss()],
    build: {
      // Keep every script an external file so the CSP can stay `script-src 'self'`.
      assetsInlineLimit: 0,
    },
  },
  env: {
    schema: {
      // ---- Public (safe to ship to the browser) ----
      PUBLIC_SITE_URL: envField.string({
        context: 'client',
        access: 'public',
        default: SITE,
      }),
      PUBLIC_SUPABASE_URL: envField.string({
        context: 'client',
        access: 'public',
        optional: true,
      }),
      PUBLIC_SUPABASE_ANON_KEY: envField.string({
        context: 'client',
        access: 'public',
        optional: true,
      }),
      PUBLIC_ANALYTICS_DOMAIN: envField.string({
        context: 'client',
        access: 'public',
        optional: true,
      }),
      PUBLIC_ADSENSE_CLIENT: envField.string({
        context: 'client',
        access: 'public',
        optional: true,
      }),
      PUBLIC_TURNSTILE_SITE_KEY: envField.string({
        context: 'client',
        access: 'public',
        optional: true,
      }),

      // ---- Server-only secrets ----
      SUPABASE_SERVICE_ROLE_KEY: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
      }),
      STRIPE_SECRET_KEY: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
      }),
      STRIPE_WEBHOOK_SECRET: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
      }),
      STRIPE_PRICE_PRO_MONTHLY: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
      }),
      STRIPE_PRICE_PRO_YEARLY: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
      }),
      RESEND_API_KEY: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
      }),
      EMAIL_FROM: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
      }),
      TURNSTILE_SECRET_KEY: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
      }),
      AUTH_SECRET: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
      }),
      ADMIN_EMAILS: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
      }),

      /*
       * Newsroom. Ambas opcionales: sin ellas el pipeline sigue funcionando en
       * local contra ficheros, que es como se desarrolla y como corren los
       * tests. Lo que no hacen es degradarse en silencio en producción — el
       * disparador rechaza toda petición si CRON_SECRET no está puesto.
       */
      CRON_SECRET: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
      }),
      NEWSROOM_DEPLOY_HOOK: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
      }),
    },
    validateSecrets: false,
  },
});
