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
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
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
