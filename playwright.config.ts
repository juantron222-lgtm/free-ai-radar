import { defineConfig, devices } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

/**
 * The Vercel Protection Bypass secret, read from .env.local.
 *
 * Sent as a header on every request, never as a query parameter: a secret in a
 * URL ends up in referrers, in server logs and in screenshots. It is read here
 * rather than passed on the command line for the same reason.
 */
function bypassHeader(): Record<string, string> {
  if (!existsSync('.env.local')) return {};
  const line = readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith('VERCEL_PROTECTION_BYPASS='));
  const value = line?.slice('VERCEL_PROTECTION_BYPASS='.length).trim().replace(/^["']|["']$/g, '');
  return value ? { 'x-vercel-protection-bypass': value } : {};
}

const PORT = Number(process.env.E2E_PORT ?? 4321);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  /**
   * Against a deployment, the account specs are excluded by construction.
   *
   * They are written for the local identity store — see the `webServer` env
   * below — and a deployment runs on Supabase, where they register throwaway
   * accounts that GoTrue rate-limits and whose synthetic domains it rejects.
   * Pointing the whole suite at a preview produces a wall of red that says
   * nothing about the site, and red that means nothing is how a real failure
   * gets waved past.
   *
   * The Supabase half is covered against the real thing by
   * `node scripts/preview-account-qa.mjs`, which creates its identity through
   * the Admin API and deletes it afterwards.
   */
  ...(process.env.E2E_BASE_URL ? { testIgnore: ['**/account.spec.ts'] } : {}),
  /**
   * Serial on purpose.
   *
   * Every worker talks to the same dev server, and in local auth mode that
   * server keeps accounts and user data in a single JSON file. Running in
   * parallel makes tests race over one shared resource, which produces failures
   * that say nothing about the application. The whole suite finishes in under a
   * minute anyway.
   *
   * With Supabase configured this restriction can be lifted.
   */
  fullyParallel: false,
  workers: 1,
  /**
   * Checks the server is healthy before a single test runs. See the file for
   * the incident that made this worth a second of startup time.
   */
  globalSetup: './tests/e2e/global-setup.ts',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 30_000,
  use: {
    baseURL: BASE_URL,
    // Only when pointing at a deployment; local runs need no bypass.
    ...(process.env.E2E_BASE_URL ? { extraHTTPHeaders: bypassHeader() } : {}),
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  /**
   * `desktop` is kept as an alias of `chromium` so existing commands and CI
   * invocations do not break; `chromium` is the name the QA skill asks for.
   *
   * WebKit earns its place: it is the only engine here that will surface `dvh`,
   * `:has()` and flex differences before an iPhone user does.
   */
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run dev -- --port ${PORT}`,
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          // `E2E=1` turns off the Astro dev toolbar, whose fixed overlay would
          // otherwise intercept clicks on the consent dialog.
          E2E: '1',
          EMAIL_DRY_RUN: '1',

          /*
           * Force local auth mode, whatever .env.local says.
           *
           * Once the Supabase staging credentials landed in .env.local, the dev
           * server started resolving to Supabase — and this suite is written
           * for the local identity store: it creates throwaway accounts freely,
           * which against a real GoTrue means rejected synthetic domains and an
           * email rate limit measured in single digits per hour.
           *
           * The split is deliberate rather than a workaround. These specs cover
           * the *interface*: forms, redirects, session guards, consent. Supabase
           * itself is covered against the real thing by
           * `npm run http:staging`, which attacks GoTrue and PostgREST with
           * signed JWTs. Running both against staging would duplicate the
           * weaker half and make it flaky.
           */
          PUBLIC_SUPABASE_URL: '',
          PUBLIC_SUPABASE_ANON_KEY: '',
          SUPABASE_SERVICE_ROLE_KEY: '',
        },
      },
});
