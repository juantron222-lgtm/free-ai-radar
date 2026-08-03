import type { Page } from '@playwright/test';

/** Must match `CONSENT_VERSION` in `src/lib/consent.ts`. */
const CONSENT_VERSION = 2;

/**
 * Records a "reject all" decision before the page loads.
 *
 * The consent dialog is modal and covers the viewport by design, so tests whose
 * subject is something else would otherwise spend their setup clicking through
 * it. Seeding the stored decision reproduces the state of a returning visitor
 * who already declined — which is the precondition those tests actually want.
 *
 * The dialog's own behaviour (appearing before any decision, reject being as
 * easy as accept, persistence) is covered by the `consentimiento` suite, which
 * drives the real UI.
 */
export async function seedConsent(page: Page): Promise<void> {
  const record = JSON.stringify({
    version: CONSENT_VERSION,
    state: {
      necessary: true,
      analytics: false,
      personalization: false,
      advertising: false,
    },
    decidedAt: new Date().toISOString(),
  });

  await page.addInitScript((value: string) => {
    try {
      window.localStorage.setItem('far-consent', value);
    } catch {
      /* Storage blocked: the cookie below is enough. */
    }
    document.cookie = `far_consent=${encodeURIComponent(value)}; path=/; SameSite=Lax`;
  }, record);
}
