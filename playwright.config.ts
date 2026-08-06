import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 4321);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
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
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 30_000,
  use: {
    baseURL: BASE_URL,
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
        },
      },
});
