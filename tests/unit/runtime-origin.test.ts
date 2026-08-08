import { describe, expect, it } from 'vitest';
import { runtimeOrigin, runtimeUrl, __isTrustedOrigin } from '@lib/runtime-origin';
import { SITE_URL } from '@lib/seo/site';

/**
 * Where a redirect lands, and where a password reset link points.
 *
 * Two separate concerns were being answered with the same value. Canonical
 * origin is what the sitemap and `<link rel=canonical>` should say — always
 * production, even from a preview. Runtime origin is where the visitor
 * actually is. Conflating them is invisible in production, where the two
 * strings match, and breaks as soon as there is a second deployment.
 */

const req = (url: string) => new Request(url);

describe('un login iniciado en un Preview vuelve al mismo Preview', () => {
  it('conserva el anfitrión del despliegue', () => {
    const preview = 'https://free-ai-radar-abc123-juan.vercel.app';
    expect(runtimeOrigin(req(`${preview}/cuenta/entrar`))).toBe(preview);
  });

  it('el enlace de verificación apunta al Preview, no a producción', () => {
    const preview = 'https://free-ai-radar-abc123-juan.vercel.app';
    const link = runtimeUrl(req(`${preview}/cuenta/crear`), '/cuenta/verificar');
    expect(link).toBe(`${preview}/cuenta/verificar`);
    expect(link).not.toContain('freeairadar.com');
  });

  it('en producción sigue siendo el dominio real', () => {
    expect(runtimeOrigin(req(`${SITE_URL}/cuenta/entrar`))).toBe(SITE_URL);
  });

  it('en local sigue siendo localhost', () => {
    expect(runtimeOrigin(req('http://localhost:4321/cuenta'))).toBe('http://localhost:4321');
  });
});

describe('inyección de cabecera Host', () => {
  /*
   * The attack this defends against: request a password reset while forging
   * the host, and the victim receives a genuine token pointing at the
   * attacker's server. A reset link is exactly the payload that attack wants.
   */
  it('un anfitrión desconocido NO se usa: cae al canónico', () => {
    expect(runtimeOrigin(req('https://malicioso.example/cuenta/recuperar'))).toBe(SITE_URL);
  });

  it('un dominio que sólo contiene vercel.app no cuela', () => {
    expect(__isTrustedOrigin('https://vercel.app.malicioso.example')).toBe(false);
    expect(__isTrustedOrigin('https://novercel.app')).toBe(false);
    expect(__isTrustedOrigin('https://algo-vercel.app.evil.test')).toBe(false);
  });

  it('un preview real de Vercel sí se acepta', () => {
    expect(__isTrustedOrigin('https://cualquier-cosa.vercel.app')).toBe(true);
    expect(__isTrustedOrigin('https://a-b-c-123.vercel.app')).toBe(true);
  });

  it('un preview por http no se acepta', () => {
    expect(__isTrustedOrigin('http://algo.vercel.app')).toBe(false);
  });

  it('un enlace de restablecimiento nunca sale de la lista permitida', () => {
    const link = runtimeUrl(
      req('https://atacante.example/cuenta/recuperar'),
      '/cuenta/nueva-contrasena?token=abc'
    );
    expect(link.startsWith(SITE_URL)).toBe(true);
    expect(link).not.toContain('atacante.example');
  });

  it('una petición ilegible cae al canónico en vez de romper', () => {
    expect(runtimeOrigin(undefined)).toBe(SITE_URL);
  });
});

describe('canónico y runtime son cosas distintas', () => {
  it('el canónico no depende de la petición', () => {
    // SITE_URL is a constant: no request can move it. That is the point.
    expect(SITE_URL).toContain('freeairadar.com');
  });

  it('desde un preview, canónico y runtime difieren', () => {
    const preview = 'https://free-ai-radar-xyz.vercel.app';
    expect(runtimeOrigin(req(preview))).not.toBe(SITE_URL);
  });

  it('en producción coinciden, que es por lo que el fallo era invisible', () => {
    expect(runtimeOrigin(req(SITE_URL))).toBe(SITE_URL);
  });
});
