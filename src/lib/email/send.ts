import { createHash } from 'node:crypto';
import { Resend } from 'resend';
import { email as emailConfig, emailSendPolicy } from '@lib/config';
import { logger } from '@lib/observability/logger';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /**
   * Transactional mail is sent on the basis of a user action (verification,
   * reset). Marketing mail requires an explicit opt-in and always carries an
   * unsubscribe header. Mixing them is both bad practice and unlawful in the
   * EU, so the type is part of the message, not a convention.
   */
  kind: 'transactional' | 'marketing';
  template: string;
  /** RFC 8058 one-click unsubscribe. Mandatory for marketing. */
  listUnsubscribeUrl?: string;
  replyTo?: string;
}

export interface MailResult {
  ok: boolean;
  id?: string;
  error?: string;
  /** True when nothing was actually sent (no API key, or dev mode). */
  simulated: boolean;
}

let client: Resend | null = null;

function getClient(): Resend | null {
  if (!emailConfig.isConfigured) return null;
  client ??= new Resend(emailConfig.apiKey);
  return client;
}

/** Recipients are never logged in the clear. */
function hashRecipient(address: string): string {
  return createHash('sha256').update(address.toLowerCase()).digest('hex').slice(0, 16);
}

/**
 * Sends a message, or simulates it.
 *
 * Simulation is the default without `RESEND_API_KEY`: the message is validated,
 * rendered and logged (with the recipient hashed), so the whole pipeline can be
 * exercised and tested without a single real delivery. `EMAIL_DRY_RUN=1` forces
 * simulation even when a key is present — used by CI and by anyone who does not
 * want a stray campaign going out during development.
 */
export async function sendMail(message: MailMessage): Promise<MailResult> {
  /*
   * One decision, taken once, before anything else.
   *
   * The previous version asked `!isProduction || EMAIL_DRY_RUN === '1'`, and a
   * Vercel Preview is `import.meta.env.PROD` — so a Preview with a Resend key
   * would have sent real password resets from a throwaway URL.
   */
  const decision = emailSendPolicy(emailConfig.apiKey);
  const resend = decision.live ? getClient() : null;

  if (message.kind === 'marketing' && !message.listUnsubscribeUrl) {
    throw new Error(
      `La plantilla "${message.template}" es comercial y debe incluir listUnsubscribeUrl.`
    );
  }

  if (!resend) {
    logger.info('email.simulated', {
      template: message.template,
      kind: message.kind,
      to: hashRecipient(message.to),
      subject: message.subject,
      reason: decision.reason,
    });
    return { ok: true, simulated: true };
  }

  try {
    const headers: Record<string, string> = {};
    if (message.listUnsubscribeUrl) {
      headers['List-Unsubscribe'] = `<${message.listUnsubscribeUrl}>`;
      headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
    }

    const { data, error } = await resend.emails.send({
      from: emailConfig.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      headers,
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
    });

    if (error) {
      logger.error('email.failed', {
        template: message.template,
        to: hashRecipient(message.to),
        error: error.message,
      });
      return { ok: false, error: error.message, simulated: false };
    }

    logger.info('email.sent', {
      template: message.template,
      kind: message.kind,
      to: hashRecipient(message.to),
      id: data?.id,
    });
    return { ok: true, id: data?.id, simulated: false };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'error desconocido';
    logger.error('email.exception', { template: message.template, error: detail });
    return { ok: false, error: detail, simulated: false };
  }
}

/**
 * Guard used by the campaign endpoint.
 *
 * Bulk sending is the one case that throws rather than simulating. A
 * transactional email that quietly logs leaves the site working; a newsletter
 * campaign that quietly logs looks like it went out and did not, and somebody
 * finds out a week later.
 */
export function assertCampaignAllowed(): void {
  const decision = emailSendPolicy(emailConfig.apiKey);
  if (!decision.live) {
    throw new Error(
      `Los envíos masivos están bloqueados: ${decision.reason}. ` +
        'Requieren producción declarada, EMAIL_SEND_MODE=live, EMAIL_DRY_RUN distinto de 1 y una RESEND_API_KEY válida.'
    );
  }
}
