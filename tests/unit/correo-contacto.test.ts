import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

/**
 * Por dónde se nos escribe, y que lo que se escribe llegue.
 *
 * El 1 de octubre de 2026 se comprobó que hola@freeairadar.com no podía
 * recibir correo —el dominio no tenía MX— y que seis páginas, entre ellas la
 * de ejercer tus derechos, lo daban como vía de contacto. Y el formulario de
 * contacto contestaba «Mensaje recibido» sin guardar el mensaje en ninguna
 * parte. Estas pruebas fijan las dos correcciones.
 */

const guardar = vi.fn();
vi.mock('@lib/data/inbox', () => ({ addContactMessage: guardar }));
vi.mock('@lib/email/send', () => ({ sendMail: vi.fn(async () => ({ ok: true, simulated: true })) }));

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const leer = (ruta: string) => readFileSync(join(ROOT, ruta), 'utf8');
const sinComentarios = (texto: string) =>
  texto
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

function recorrer(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    return statSync(ruta).isDirectory() ? recorrer(ruta) : [ruta];
  });
}

const vistas = ['src/pages', 'src/components', 'src/layouts']
  .flatMap((d) => recorrer(join(ROOT, d)))
  .filter((f) => /\.(astro|ts)$/.test(f))
  .map((f) => ({ rel: relative(ROOT, f).replace(/\\/g, '/'), texto: sinComentarios(readFileSync(f, 'utf8')) }));

describe('hola@ no se da como vía de contacto mientras no recibe', () => {
  it('sigue marcado como pendiente de configurar', async () => {
    /*
     * Se pone a `true` cuando el reenvío esté configurado y un correo de
     * prueba enviado a hola@ haya llegado al buzón de destino. Esta prueba
     * cambia en el mismo commit, con la fecha de esa comprobación.
     */
    const { correoOperativo } = await import('@lib/seo/site');
    expect(correoOperativo()).toBe(false);
  });

  it('ninguna página escribe la dirección a mano', () => {
    const conLiteral = vistas.filter(({ texto }) => texto.includes('hola@freeairadar.com')).map(({ rel }) => rel);
    expect(conLiteral).toEqual([]);
  });

  it('todo mailto a la dirección del sitio está detrás del interruptor', () => {
    const sinGuarda = vistas
      .filter(({ texto }) => texto.includes('mailto:${SITE.email}'))
      .filter(({ texto }) => !/correoOperativo\(\)/.test(texto))
      .map(({ rel }) => rel);
    expect(sinGuarda).toEqual([]);
  });

  it('las páginas legales mandan al formulario a través del mismo componente', () => {
    for (const ruta of ['src/pages/legal/privacidad.astro', 'src/pages/legal/derechos.astro', 'src/pages/legal/terminos.astro']) {
      expect(leer(ruta), ruta).toContain('<EnlaceContacto');
    }
  });

  it('los datos estructurados no publican la dirección', async () => {
    const { organizationSchema } = await import('@lib/seo/structured-data');
    expect(organizationSchema()).not.toHaveProperty('email');
  });
});

describe('el formulario de contacto no finge haber recibido', () => {
  async function post() {
    const { POST } = await import('../../src/pages/api/contact');
    const { issueToken, CSRF_COOKIE, CSRF_FIELD } = await import('@lib/security/csrf');
    const token = issueToken();
    const body = new FormData();
    body.set(CSRF_FIELD, token);
    body.set('name', 'Ana');
    body.set('email', 'ana@example.com');
    body.set('subject', 'otro');
    body.set('message', 'Un mensaje con más de veinte caracteres.');
    body.set('website', '');
    const context = {
      locals: {},
      url: new URL('https://example.test/api/contact'),
      request: new Request('https://example.test/api/contact', {
        method: 'POST',
        body,
        headers: { origin: 'https://example.test' },
      }),
      cookies: { get: (nombre: string) => (nombre === CSRF_COOKIE ? { value: token } : undefined) },
      clientAddress: '127.0.0.1',
    };
    return POST(context as unknown as Parameters<typeof POST>[0]);
  }

  it('si no se ha podido guardar, lo dice', async () => {
    guardar.mockResolvedValueOnce(false);
    const respuesta = await post();
    const cuerpo = (await respuesta.json()) as { ok: boolean; message: string };
    expect(respuesta.status).toBe(503);
    expect(cuerpo.ok).toBe(false);
    expect(cuerpo.message).not.toMatch(/recibido/i);
  });

  it('si se ha guardado, contesta sin prometer plazos', async () => {
    guardar.mockResolvedValueOnce(true);
    const respuesta = await post();
    const cuerpo = (await respuesta.json()) as { ok: boolean; message: string };
    expect(respuesta.status).toBe(200);
    expect(cuerpo.message).toMatch(/Mensaje recibido/);
    expect(cuerpo.message).not.toMatch(/días/);
  });
});

describe('los mensajes se leen en un sitio que sólo ve un administrador', () => {
  it('la página se niega con cualquiera que no sea admin, también con un editor', () => {
    const pagina = leer('src/pages/admin/contacto.astro');
    expect(pagina).toMatch(/if \(Astro\.locals\.user\?\.role !== 'admin'\) \{\s*return new Response\('No encontrado', \{ status: 404 \}\);/);
    expect(pagina).toContain("export const prerender = false;");
  });

  it('la tabla no tiene ninguna puerta para el navegador', () => {
    const sql = leer('supabase/migrations/0016_contact_messages.sql');
    expect(sql).toMatch(/alter table public\.contact_messages enable row level security;/);
    expect(sql).toMatch(/revoke all on public\.contact_messages from anon, authenticated;/);
    expect(sql).not.toMatch(/create policy/i);
  });

  it('la privacidad dice que se guardan, sin prometer un plazo que nada cumple', () => {
    const privacidad = sinComentarios(leer('src/pages/legal/privacidad.astro'));
    expect(privacidad).toContain('Nombre, correo y mensaje del formulario de contacto');
    expect(privacidad).toContain('Mientras haga falta para atenderte');
  });
});
