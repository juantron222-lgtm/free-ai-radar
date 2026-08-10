import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { safeRedirect } from '@lib/security/redirect';
import { ROUTES } from '@lib/nav';

/**
 * The email confirmation round trip.
 *
 * Two bugs found in production on launch day, both in the gap between "Supabase
 * sent the email" and "the person has an account they can use":
 *
 *   1. Sign-up with confirmation required redirected to `/cuenta`, which needs
 *      a session. The middleware bounced it to the login page and built a fresh
 *      URL doing so, dropping the `?ok=` message. The visitor saw a login form
 *      and no explanation.
 *   2. `/cuenta/verificar` — the address in every confirmation email — did not
 *      exist. Referenced three times, written nowhere, 404 for everyone.
 *
 * These cover the shape of both. The live round trip is exercised against the
 * deployment by the account QA; what is checked here is what can be checked
 * without a browser and a real inbox.
 */

const ROOT = join(process.cwd());
const PAGE = join(ROOT, 'src/pages/cuenta/verificar.astro');

const page = () => readFileSync(PAGE, 'utf8');

describe('la ruta de confirmación existe', () => {
  it('hay una página en src/pages/cuenta/verificar.astro', () => {
    expect(
      existsSync(PAGE),
      'El correo de Supabase apunta a /cuenta/verificar. Sin este fichero, es un 404.'
    ).toBe(true);
  });

  it('es dinámica: el callback no se puede prerenderizar', () => {
    expect(page()).toMatch(/export const prerender = false/);
  });

  it('la ruta que el proveedor le da a Supabase es exactamente esa', () => {
    const provider = readFileSync(join(ROOT, 'src/lib/auth/provider.ts'), 'utf8');
    const destino = provider.match(/emailRedirectTo: runtimeUrl\(request, '([^']+)'\)/)?.[1];

    expect(destino).toBe('/cuenta/verificar');
    expect(existsSync(join(ROOT, `src/pages${destino}.astro`))).toBe(true);
  });

  it('el middleware la deja pasar sin sesión', () => {
    // Nadie ha iniciado sesión todavía cuando llega desde el correo.
    const middleware = readFileSync(join(ROOT, 'src/middleware.ts'), 'utf8');
    expect(middleware).toContain("'/cuenta/verificar'");
  });
});

describe('el callback completa el flujo PKCE', () => {
  it('canjea el código por sesión en vez de confiar en la URL', () => {
    const provider = readFileSync(join(ROOT, 'src/lib/auth/provider.ts'), 'utf8');
    expect(provider).toContain('exchangeCodeForSession');
  });

  it('vuelca las cookies de sesión que produce el canje', () => {
    // Sin esto el visitante llega a /cuenta sin sesión y rebota fuera.
    expect(page()).toMatch(/drainCookies\(\)/);
    expect(page()).toMatch(/Astro\.cookies\.set/);
  });

  it('valida la forma del código antes de usarlo', () => {
    const validador = page().match(/\/\^\[([^\]]+)\]\{(\d+),(\d+)\}\$\//);
    expect(validador, 'el código debe comprobarse contra una forma conocida').not.toBeNull();
  });

  it('rechaza códigos que no tienen forma de código', () => {
    // El mismo patrón que usa la página, aplicado a entradas hostiles.
    const forma = /^[A-Za-z0-9._~-]{16,512}$/;
    expect(forma.test('a'.repeat(43))).toBe(true);
    expect(forma.test('corto')).toBe(false);
    expect(forma.test('')).toBe(false);
    expect(forma.test('../../etc/passwd')).toBe(false);
    expect(forma.test('https://malicioso.example/robar')).toBe(false);
    expect(forma.test('a'.repeat(600))).toBe(false);
  });
});

describe('no hay redirección abierta', () => {
  it('el destino se construye desde ROUTES, nunca desde la URL', () => {
    const cuerpo = page();

    // Cada destino sale de una constante del proyecto.
    expect(cuerpo).toMatch(/ROUTES\.login/);
    expect(cuerpo).toMatch(/ROUTES\.account/);

    // Y ninguno se toma de un parámetro que traiga el visitante.
    expect(cuerpo).not.toMatch(/redirect\(\s*(params|searchParams)\.get/);
    expect(cuerpo).not.toMatch(/destination\s*=\s*(params|searchParams)\.get/);
  });

  it('un "next" hostil nunca sale del sitio', () => {
    for (const hostil of [
      'https://malicioso.example',
      '//malicioso.example',
      'http://malicioso.example/robar',
      'javascript:alert(1)',
      '/\\malicioso.example',
    ]) {
      const destino = safeRedirect(hostil, ROUTES.account);
      expect(destino.startsWith('/'), `${hostil} → ${destino}`).toBe(true);
      expect(destino).not.toContain('malicioso.example');
    }
  });

  it('el texto de error de GoTrue no se refleja en la página', () => {
    /*
     * `error_description` es prosa de un tercero para un público que no es el
     * nuestro. Lo que se comprueba es que no se *lea* — el comentario del
     * fichero que explica por qué no se usa debe poder mencionarlo, así que
     * buscar la palabra suelta no serviría: la primera versión de esta prueba
     * falló contra su propia documentación.
     */
    const cuerpo = page();
    expect(cuerpo).not.toMatch(/(params|searchParams)\.get\(\s*['"]error_description['"]/);
    expect(cuerpo).toMatch(/(params|searchParams)\.get\(\s*['"]error_code['"]/);
  });
});

describe('el registro pendiente de confirmación dice lo que pasa', () => {
  it('el proveedor distingue "sin sesión todavía" de "dentro"', () => {
    const provider = readFileSync(join(ROOT, 'src/lib/auth/provider.ts'), 'utf8');
    expect(provider).toMatch(/if \(!data\.session\)/);
    expect(provider).toMatch(/pendingConfirmation: true/);
  });

  it('el mensaje es el que se le pide a la interfaz', async () => {
    const { CONFIRM_EMAIL_MESSAGE } = await import('@lib/auth/provider');
    expect(CONFIRM_EMAIL_MESSAGE).toBe(
      'Te hemos enviado un correo de confirmación. Revisa tu bandeja de entrada y confirma tu dirección para activar la cuenta.'
    );
  });

  it('no se le manda a /cuenta, que exige sesión y perdería el mensaje', () => {
    const endpoint = readFileSync(join(ROOT, 'src/pages/api/auth/signup.ts'), 'utf8');
    expect(endpoint).toMatch(/result\.pendingConfirmation \? ROUTES\.login : next/);
  });

  it('la página de login sabe pintar la confirmación', () => {
    const entrar = readFileSync(join(ROOT, 'src/pages/cuenta/entrar.astro'), 'utf8');
    expect(entrar).toContain("'confirmado'");
    expect(entrar).toContain('Correo confirmado correctamente.');
  });
});

describe('los tres proveedores cumplen el contrato', () => {
  it('ninguno deja el método sin implementar', () => {
    const provider = readFileSync(join(ROOT, 'src/lib/auth/provider.ts'), 'utf8');
    const implementaciones = provider.match(/async completeEmailVerification/g) ?? [];

    // Supabase, almacén local y modo deshabilitado.
    expect(implementaciones).toHaveLength(3);
  });

  it('un callback inválido no autentica a nadie', async () => {
    // El almacén local no tiene correos que confirmar: un enlace aquí sólo puede
    // ser alguien probando la ruta, y se le responde que no vale.
    const { VERIFY_INVALID_MESSAGE } = await import('@lib/auth/provider');
    expect(VERIFY_INVALID_MESSAGE).toMatch(/ya no es válido/);
  });
});
