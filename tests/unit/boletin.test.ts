import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

/**
 * El boletín no se promete mientras no exista.
 *
 * El 1 de octubre se comprobó que nada lo enviaba: Production no tiene clave
 * de envío ni el dominio registros de correo, el correo de confirmación se
 * quedaba en simulado y la plantilla del resumen semanal no la llamaba nadie.
 * Mientras tanto la portada, Noticias, Pro y la cuenta prometían «un correo a
 * la semana», y el formulario guardaba la dirección y contestaba «te hemos
 * enviado un correo».
 */

const suscribir = vi.fn();
const enviar = vi.fn();
vi.mock('@lib/data/inbox', () => ({ subscribe: suscribir }));
vi.mock('@lib/email/send', () => ({ sendMail: enviar }));

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
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

const fuentes = recorrer(join(ROOT, 'src'))
  .filter((f) => /\.(ts|astro)$/.test(f))
  .map((f) => ({ rel: relative(ROOT, f).replace(/\\/g, '/'), texto: sinComentarios(readFileSync(f, 'utf8')) }));

describe('el interruptor dice la verdad', () => {
  it('no puede estar encendido mientras nada envíe el resumen semanal', async () => {
    /*
     * La plantilla existe; lo que falta es quien la use. El día que alguien
     * la llame desde una tarea programada, esta prueba deja de obligar a que
     * el interruptor esté apagado — y es ese mismo commit el que lo enciende.
     */
    const { ENVIO_SEMANAL_PROGRAMADO } = await import('@lib/boletin');
    const llamadas = fuentes.filter(
      ({ rel, texto }) => rel !== 'src/lib/email/templates.ts' && /weeklyDigestEmail\(/.test(texto)
    );
    if (llamadas.length === 0) expect(ENVIO_SEMANAL_PROGRAMADO).toBe(false);
  });

  it('apagado, ni siquiera una producción con envío habilitado lo pone en marcha', async () => {
    const { boletinEnMarcha } = await import('@lib/boletin');
    expect(boletinEnMarcha({ VERCEL_ENV: 'production', EMAIL_SEND_MODE: 'live' })).toBe(false);
  });
});

describe('sin boletín, el formulario no guarda nada', () => {
  async function post() {
    const { POST } = await import('../../src/pages/api/newsletter/subscribe');
    const body = new FormData();
    body.set('email', 'alguien@example.com');
    body.set('website', '');
    const context = {
      locals: {},
      url: new URL('https://example.test/api/newsletter/subscribe'),
      request: new Request('https://example.test/api/newsletter/subscribe', {
        method: 'POST',
        body,
        headers: { origin: 'https://example.test' },
      }),
      cookies: { get: () => undefined },
    };
    return POST(context as unknown as Parameters<typeof POST>[0]);
  }

  it('contesta que no está en marcha, sin guardar la dirección ni enviar nada', async () => {
    const respuesta = await post();
    expect(respuesta.status).toBe(503);
    const cuerpo = (await respuesta.json()) as { ok: boolean; message: string };
    expect(cuerpo.ok).toBe(false);
    expect(cuerpo.message).toMatch(/todavía no está en marcha/);
    expect(cuerpo.message).not.toMatch(/te hemos enviado/i);
    expect(suscribir).not.toHaveBeenCalled();
    expect(enviar).not.toHaveBeenCalled();
  });
});

describe('ninguna página promete el correo semanal', () => {
  const PROMESA =
    /un correo a la semana|un correo por semana|resumen semanal con lo que ha cambiado|bolet[ií]n semanal|se anunciará en el boletín|lo contaremos en el boletín/i;

  it('sólo lo dice el formulario, y sólo en la rama que se pinta con el envío en marcha', () => {
    const culpables = fuentes
      .filter(({ rel }) => rel.startsWith('src/pages/') || rel.startsWith('src/components/') || rel.startsWith('src/layouts/'))
      // A /boletin/confirmado sólo se llega con el enlace del correo de confirmación.
      .filter(({ rel }) => rel !== 'src/pages/boletin/confirmado.astro')
      .filter(({ rel, texto }) => {
        if (rel !== 'src/components/marketing/NewsletterForm.astro') return PROMESA.test(texto);
        const corte = texto.indexOf(') : (');
        return corte < 0 || PROMESA.test(texto.slice(0, corte));
      })
      .map(({ rel }) => rel);
    expect(culpables).toEqual([]);
  });

  it('el formulario decide con el interruptor, no con una constante suya', () => {
    const formulario = readFileSync(join(ROOT, 'src/components/marketing/NewsletterForm.astro'), 'utf8');
    expect(formulario).toContain('const enMarcha = boletinEnMarcha();');
    expect(formulario).toMatch(/\{!enMarcha \? \(/);
    expect(formulario).toContain('href="/rss.xml"');
  });

  it('Noticias no ofrece seguir herramientas ni avisos de un Pro que no existen', () => {
    const noticias = sinComentarios(readFileSync(join(ROOT, 'src/pages/noticias/index.astro'), 'utf8'));
    expect(noticias).not.toMatch(/Seguir una herramienta/);
    expect(noticias).not.toMatch(/Avisos inmediatos con Pro/);
  });

  it('la cuenta guarda la preferencia sin dar el envío por hecho', () => {
    const preferencias = readFileSync(join(ROOT, 'src/pages/cuenta/preferencias.astro'), 'utf8');
    expect(preferencias).toMatch(/\{!boletinEnMarcha\(\) && \(/);
    expect(preferencias).toContain('Todavía no enviamos ningún correo periódico');
  });
});

describe('sin boletín, las páginas legales no describen un tratamiento que no existe', () => {
  it('privacidad y derechos sólo hablan del boletín cuando se envía', () => {
    const privacidad = readFileSync(join(ROOT, 'src/pages/legal/privacidad.astro'), 'utf8');
    expect(privacidad).toMatch(/\{boletinEnMarcha\(\) && \(\s*<tr>\s*<th scope="row">Correo del boletín/);
    const derechos = readFileSync(join(ROOT, 'src/pages/legal/derechos.astro'), 'utf8');
    expect(derechos).toMatch(/\{boletinEnMarcha\(\) \? \(/);
    expect(derechos).toContain('no enviamos boletín, así que no hay');
  });

  it('el endpoint temporal de limpieza ya no existe', () => {
    expect(fuentes.some(({ rel }) => rel.startsWith('src/pages/api/mantenimiento/'))).toBe(false);
    expect(fuentes.some(({ texto }) => texto.includes('borrarSuscripcionesPendientes'))).toBe(false);
  });
});
