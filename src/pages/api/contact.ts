import type { APIRoute } from 'astro';
import { z } from 'zod';
import { guard, json, validationResponse } from '@lib/api/respond';
import { addContactMessage } from '@lib/data/inbox';
import { sendMail } from '@lib/email/send';
import { SITE } from '@lib/seo/site';
import { logger } from '@lib/observability/logger';

export const prerender = false;

const ContactSchema = z.object({
  name: z.string().trim().min(1, 'Escribe tu nombre.').max(80),
  email: z.string().trim().toLowerCase().email('El correo no parece válido.'),
  subject: z.string().min(1).max(40),
  message: z.string().trim().min(20, 'Cuéntanos un poco más.').max(2000),
});

const THANKS = 'Mensaje recibido. Te contestamos a ese correo.';

/*
 * Si no se ha guardado, se dice. Antes la página contestaba «Mensaje recibido»
 * pasara lo que pasara, y en producción el mensaje no llegaba a ninguna parte.
 */
const NOT_SAVED =
  'No hemos podido guardar tu mensaje. Vuelve a intentarlo dentro de un rato; no se ha perdido nada de lo que escribiste en esta página.';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const POST: APIRoute = async (context) => {
  const check = await guard(context, { rateLimit: 'contact', honeypot: 'website' });
  if (!check.ok) return check.response!;
  if (check.trapped) return json({ ok: true, message: THANKS });

  const form = check.form!;
  const parsed = ContactSchema.safeParse({
    name: form.get('name'),
    email: form.get('email'),
    subject: form.get('subject'),
    message: form.get('message'),
  });

  if (!parsed.success) return validationResponse(parsed.error);

  if (!(await addContactMessage(parsed.data))) {
    return json({ ok: false, message: NOT_SAVED }, 503);
  }

  // The visitor's address goes in Reply-To, never in From: sending as them
  // would fail SPF/DKIM and get the whole domain classified as a spoofer.
  await sendMail({
    to: SITE.email,
    kind: 'transactional',
    template: 'contact-forward',
    subject: `[Contacto · ${parsed.data.subject}] ${parsed.data.name}`,
    replyTo: parsed.data.email,
    html: `<p><strong>De:</strong> ${escapeHtml(parsed.data.name)} &lt;${escapeHtml(parsed.data.email)}&gt;</p>
<p><strong>Tema:</strong> ${escapeHtml(parsed.data.subject)}</p>
<hr>
<p>${escapeHtml(parsed.data.message).replace(/\n/g, '<br>')}</p>`,
    text: `De: ${parsed.data.name} <${parsed.data.email}>
Tema: ${parsed.data.subject}

${parsed.data.message}`,
  });

  logger.info('contact.received', { subject: parsed.data.subject });

  return json({ ok: true, message: THANKS });
};
