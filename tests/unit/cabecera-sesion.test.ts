import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { SESSION_HINT_COOKIE, serializeCookie, sessionHintCookie } from '@lib/security/cookies';

/**
 * La cabecera dice «Tu cuenta» a quien ha iniciado sesión.
 *
 * Hasta el 21 de octubre de 2026 decía «Entrar» a todo el mundo: casi todas
 * las páginas se sirven ya hechas y no saben quién las mira. Ahora el
 * middleware deja una cookie que sólo dice «hay sesión», un script la mira
 * antes de pintar y el CSS enseña el enlace que toca.
 */

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const leer = (ruta: string) => readFileSync(join(ROOT, ruta), 'utf8');

/** Ejecuta public/sesion-init.js con una cookie dada y dice si marcó `<html>`. */
function marcaLaPagina(cookie: string): boolean {
  const setAttribute = vi.fn();
  const documento = { cookie, documentElement: { setAttribute } };
  new Function('document', leer('public/sesion-init.js'))(documento);
  return setAttribute.mock.calls.some(([nombre]) => nombre === 'data-sesion');
}

describe('la cookie «hay sesión»', () => {
  it('se llama igual en el servidor y en el script que la lee', () => {
    expect(SESSION_HINT_COOKIE).toBe('far_hay_sesion');
    expect(leer('public/sesion-init.js')).toContain(SESSION_HINT_COOKIE);
  });

  it('la puede leer un script, pero no lleva nada más que un 1', () => {
    const cabecera = serializeCookie(SESSION_HINT_COOKIE, '1', sessionHintCookie(60));
    expect(cabecera).toMatch(/^far_hay_sesion=1; /);
    expect(cabecera).not.toContain('HttpOnly');
    expect(cabecera).toContain('SameSite=Lax');
  });

  it('el script sólo marca la página si la cookie vale exactamente 1', () => {
    expect(marcaLaPagina('far_hay_sesion=1')).toBe(true);
    expect(marcaLaPagina('far_csrf=abc; far_hay_sesion=1; far_consent=x')).toBe(true);
    expect(marcaLaPagina('')).toBe(false);
    expect(marcaLaPagina('far_hay_sesion=10')).toBe(false);
    expect(marcaLaPagina('otra_far_hay_sesion=1')).toBe(false);
    expect(marcaLaPagina('far_session=abc')).toBe(false);
  });

  it('sólo la escribe el middleware, que la pone y la quita según la sesión', () => {
    const middleware = leer('src/middleware.ts');
    expect(middleware).toMatch(/locals\.user && !conPista/);
    expect(middleware).toMatch(/!locals\.user && conPista/);
    // Entrar, darse de alta y salir cambian la sesión en la propia petición.
    expect(leer('src/pages/api/auth/login.ts')).toContain('context.locals.user = result.user');
    expect(leer('src/pages/api/auth/signup.ts')).toContain('context.locals.user = result.user');
    expect(leer('src/pages/api/auth/logout.ts')).toContain('context.locals.user = null');
  });

  it('la política de cookies la cuenta', () => {
    expect(leer('src/pages/legal/cookies.astro')).toContain(`name: '${SESSION_HINT_COOKIE}'`);
  });
});

describe('la cabecera', () => {
  it('el script corre en <head>, antes de pintar, y se cachea como theme-init.js', () => {
    const layout = leer('src/layouts/BaseLayout.astro');
    const script = layout.indexOf('<script src="/sesion-init.js" is:inline></script>');
    expect(script).toBeGreaterThan(-1);
    expect(script).toBeLessThan(layout.indexOf('</head>'));
    expect(leer('vercel.json')).toMatch(/theme-init\.js\|sesion-init\.js/);
  });

  it('lleva «Entrar» y «Tu cuenta», y el CSS enseña sólo uno', () => {
    const cabecera = leer('src/components/site/Header.astro');
    expect(cabecera).toMatch(/href=\{ROUTES\.login\}[^>]*data-sin-sesion>Entrar</);
    expect(cabecera).toMatch(/href=\{ROUTES\.account\}[^>]*data-con-sesion>Tu cuenta</);
    expect(cabecera).toContain(':global(html[data-sesion]) [data-sin-sesion]');
    expect(cabecera).toContain(':global(html:not([data-sesion])) [data-con-sesion]');
  });
});
