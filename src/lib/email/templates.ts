import { SITE, SITE_URL } from '@lib/seo/site';
import type { MailMessage } from './send';

/**
 * Email templates.
 *
 * Constraints that shape every template here:
 *   · table-based, inline-styled, max 600px — the only layout that survives
 *     Outlook and Gmail alike;
 *   · light and dark handled with `prefers-color-scheme` plus safe defaults,
 *     because Gmail strips most of it;
 *   · every message ships an HTML and a plain-text part;
 *   · no remote images, no tracking pixels, no web fonts.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface ShellOptions {
  preheader: string;
  heading: string;
  bodyHtml: string;
  cta?: { label: string; url: string };
  footerHtml?: string;
}

function shell({ preheader, heading, bodyHtml, cta, footerHtml }: ShellOptions): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(heading)}</title>
<style>
  @media (prefers-color-scheme: dark) {
    .body { background:#0c0e11 !important; }
    .card { background:#14171c !important; border-color:#262b33 !important; }
    .ink { color:#e7e9ec !important; }
    .muted { color:#9aa2b1 !important; }
  }
  @media (max-width:620px) {
    .card { width:100% !important; border-radius:0 !important; }
    .pad { padding:24px !important; }
  }
</style>
</head>
<body class="body" style="margin:0;padding:0;background:#fbfaf7;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fbfaf7;">
  <tr><td align="center" style="padding:32px 12px;">
    <table role="presentation" class="card" width="600" cellpadding="0" cellspacing="0" border="0"
      style="width:600px;max-width:600px;background:#ffffff;border:1px solid #e3e1da;border-radius:14px;">
      <tr><td class="pad" style="padding:32px 36px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <p style="margin:0 0 24px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#0a7150;">
          Free AI Radar
        </p>
        <h1 class="ink" style="margin:0 0 16px;font-size:24px;line-height:1.25;color:#16181d;font-weight:700;">
          ${escapeHtml(heading)}
        </h1>
        <div class="muted" style="font-size:15px;line-height:1.6;color:#5a6070;">
          ${bodyHtml}
        </div>
        ${
          cta
            ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 8px;">
                 <tr><td style="border-radius:8px;background:#0a7150;">
                   <a href="${escapeHtml(cta.url)}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
                     ${escapeHtml(cta.label)}
                   </a>
                 </td></tr>
               </table>
               <p class="muted" style="margin:8px 0 0;font-size:12px;color:#82889a;word-break:break-all;">
                 Si el botón no funciona, copia este enlace: ${escapeHtml(cta.url)}
               </p>`
            : ''
        }
      </td></tr>
      <tr><td class="pad" style="padding:20px 36px 28px;border-top:1px solid #e3e1da;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <p class="muted" style="margin:0;font-size:12px;line-height:1.6;color:#82889a;">
          ${footerHtml ?? `Te escribimos desde <a href="${SITE_URL}" style="color:#0a7150;">${SITE.name}</a>, un proyecto editorial independiente.`}
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Transactional
// ---------------------------------------------------------------------------

export function welcomeEmail(input: { to: string; displayName?: string }): MailMessage {
  const name = input.displayName ? `, ${input.displayName}` : '';
  return {
    to: input.to,
    kind: 'transactional',
    template: 'welcome',
    subject: 'Tu cuenta en Free AI Radar está lista',
    html: shell({
      preheader: 'Guarda herramientas, crea listas y recibe avisos cuando cambie un plan gratuito.',
      heading: `Bienvenido${name}`,
      bodyHtml: `
        <p style="margin:0 0 12px;">Ya puedes guardar herramientas, crear listas y activar avisos para enterarte cuando un plan gratuito cambie.</p>
        <p style="margin:0 0 12px;">Lo que hacemos aquí es simple: verificamos herramienta por herramienta qué es gratis de verdad, con qué límites y a qué coste real. Sin puntuaciones compradas.</p>`,
      cta: { label: 'Ir a mi cuenta', url: `${SITE_URL}/cuenta` },
    }),
    text: `Bienvenido${name}.

Tu cuenta en Free AI Radar está lista. Ya puedes guardar herramientas, crear listas y activar avisos para enterarte cuando un plan gratuito cambie.

Ir a tu cuenta: ${SITE_URL}/cuenta

— Free AI Radar`,
  };
}

export function verifyEmail(input: { to: string; verifyUrl: string }): MailMessage {
  return {
    to: input.to,
    kind: 'transactional',
    template: 'verify-email',
    subject: 'Confirma tu correo en Free AI Radar',
    html: shell({
      preheader: 'Un clic y terminamos.',
      heading: 'Confirma tu correo',
      bodyHtml: `<p style="margin:0 0 12px;">Pulsa el botón para confirmar que esta dirección es tuya. El enlace caduca en 24 horas.</p>
        <p style="margin:0;">Si no has creado ninguna cuenta, puedes ignorar este mensaje.</p>`,
      cta: { label: 'Confirmar mi correo', url: input.verifyUrl },
    }),
    text: `Confirma tu correo en Free AI Radar.

Abre este enlace para confirmar tu dirección (caduca en 24 horas):
${input.verifyUrl}

Si no has creado ninguna cuenta, ignora este mensaje.`,
  };
}

export function passwordResetEmail(input: { to: string; resetUrl: string }): MailMessage {
  return {
    to: input.to,
    kind: 'transactional',
    template: 'password-reset',
    subject: 'Restablecer tu contraseña',
    html: shell({
      preheader: 'Enlace válido durante una hora.',
      heading: 'Restablecer tu contraseña',
      bodyHtml: `<p style="margin:0 0 12px;">Alguien ha pedido restablecer la contraseña de esta cuenta. El enlace es válido durante una hora y sólo se puede usar una vez.</p>
        <p style="margin:0;"><strong>Si no has sido tú</strong>, ignora este correo: tu contraseña no cambiará.</p>`,
      cta: { label: 'Elegir contraseña nueva', url: input.resetUrl },
    }),
    text: `Restablecer tu contraseña en Free AI Radar.

Abre este enlace (válido una hora, un solo uso):
${input.resetUrl}

Si no has sido tú, ignora este correo: tu contraseña no cambiará.`,
  };
}

export function emailChangedEmail(input: { to: string; newEmail: string }): MailMessage {
  return {
    to: input.to,
    kind: 'transactional',
    template: 'email-changed',
    subject: 'Se ha cambiado el correo de tu cuenta',
    html: shell({
      preheader: 'Aviso de seguridad.',
      heading: 'Se ha cambiado el correo de tu cuenta',
      bodyHtml: `<p style="margin:0 0 12px;">La dirección de tu cuenta se ha cambiado a <strong>${escapeHtml(input.newEmail)}</strong>.</p>
        <p style="margin:0;">Si no has sido tú, responde a este correo cuanto antes.</p>`,
    }),
    text: `La dirección de tu cuenta de Free AI Radar se ha cambiado a ${input.newEmail}.

Si no has sido tú, responde a este correo cuanto antes.`,
  };
}

export function newsletterConfirmEmail(input: { to: string; confirmUrl: string }): MailMessage {
  return {
    to: input.to,
    kind: 'transactional',
    template: 'newsletter-confirm',
    subject: 'Confirma tu suscripción al boletín',
    html: shell({
      preheader: 'Sólo te escribiremos si confirmas.',
      heading: 'Confirma tu suscripción',
      bodyHtml: `<p style="margin:0 0 12px;">Un clic y empezarás a recibir el resumen semanal: qué planes gratuitos han cambiado, cuáles han empezado a pedir tarjeta y qué merece la pena.</p>
        <p style="margin:0;">Si no has sido tú quien lo ha pedido, ignora este mensaje. No te escribiremos.</p>`,
      cta: { label: 'Sí, quiero recibirlo', url: input.confirmUrl },
    }),
    text: `Confirma tu suscripción al boletín de Free AI Radar:
${input.confirmUrl}

Si no lo has pedido tú, ignora este mensaje: no te escribiremos.`,
  };
}

// ---------------------------------------------------------------------------
// Marketing (always with one-click unsubscribe)
// ---------------------------------------------------------------------------

export interface DigestItem {
  name: string;
  url: string;
  summary: string;
}

export function weeklyDigestEmail(input: {
  to: string;
  unsubscribeUrl: string;
  changes: DigestItem[];
  picks: DigestItem[];
}): MailMessage {
  const list = (items: DigestItem[]) =>
    items
      .map(
        (item) => `<tr><td style="padding:0 0 14px;">
          <a href="${escapeHtml(item.url)}" style="font-size:15px;font-weight:600;color:#16181d;text-decoration:none;">${escapeHtml(item.name)}</a>
          <div style="font-size:14px;color:#5a6070;line-height:1.5;">${escapeHtml(item.summary)}</div>
        </td></tr>`
      )
      .join('');

  const bodyHtml = `
    ${
      input.changes.length
        ? `<h2 style="margin:0 0 12px;font-size:16px;color:#16181d;">Ha cambiado</h2>
           <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${list(input.changes)}</table>`
        : ''
    }
    ${
      input.picks.length
        ? `<h2 style="margin:20px 0 12px;font-size:16px;color:#16181d;">Merece la pena</h2>
           <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${list(input.picks)}</table>`
        : ''
    }`;

  return {
    to: input.to,
    kind: 'marketing',
    template: 'weekly-digest',
    subject: 'Lo que ha cambiado esta semana en la IA gratuita',
    listUnsubscribeUrl: input.unsubscribeUrl,
    html: shell({
      preheader: 'Planes recortados, tarjetas nuevas y hallazgos de la semana.',
      heading: 'Tu resumen semanal',
      bodyHtml,
      footerHtml: `Recibes esto porque te suscribiste en ${SITE.name}.
        <a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#0a7150;">Darte de baja con un clic</a>.`,
    }),
    text: `Tu resumen semanal de Free AI Radar

${input.changes.length ? `HA CAMBIADO\n${input.changes.map((c) => `- ${c.name}: ${c.summary}\n  ${c.url}`).join('\n')}\n` : ''}
${input.picks.length ? `MERECE LA PENA\n${input.picks.map((p) => `- ${p.name}: ${p.summary}\n  ${p.url}`).join('\n')}\n` : ''}
Darte de baja: ${input.unsubscribeUrl}`,
  };
}

export function alertEmail(input: {
  to: string;
  unsubscribeUrl: string;
  toolName: string;
  toolUrl: string;
  changeSummary: string;
}): MailMessage {
  return {
    to: input.to,
    kind: 'marketing',
    template: 'change-alert',
    subject: `${input.toolName}: ha cambiado su plan gratuito`,
    listUnsubscribeUrl: input.unsubscribeUrl,
    html: shell({
      preheader: input.changeSummary,
      heading: `${input.toolName} ha cambiado`,
      bodyHtml: `<p style="margin:0 0 12px;">${escapeHtml(input.changeSummary)}</p>
        <p style="margin:0;">Tienes esta herramienta en seguimiento, por eso te avisamos.</p>`,
      cta: { label: 'Ver la ficha actualizada', url: input.toolUrl },
      footerHtml: `Recibes este aviso porque sigues a ${escapeHtml(input.toolName)}.
        <a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#0a7150;">Dejar de recibir avisos</a>.`,
    }),
    text: `${input.toolName} ha cambiado.

${input.changeSummary}

Ver la ficha: ${input.toolUrl}

Dejar de recibir avisos: ${input.unsubscribeUrl}`,
  };
}

export const ALL_TEMPLATES = [
  'welcome',
  'verify-email',
  'password-reset',
  'email-changed',
  'newsletter-confirm',
  'weekly-digest',
  'change-alert',
] as const;
