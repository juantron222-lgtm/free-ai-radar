import { beforeEach, describe, expect, it } from 'vitest';
import { safeRedirect } from '@lib/security/redirect';
import { CSRF_COOKIE, issueToken, isValidToken, verifyCsrf } from '@lib/security/csrf';
import { RATE_LIMITS, checkRateLimit, resetRateLimits } from '@lib/security/rate-limit';
import { PasswordSchema, EmailSchema, passwordStrength } from '@lib/auth/password';
import { readConsentFromCookie, CONSENT_VERSION, DENY_ALL } from '@lib/consent';

describe('safeRedirect', () => {
  it('acepta rutas internas', () => {
    expect(safeRedirect('/cuenta/favoritos')).toBe('/cuenta/favoritos');
    expect(safeRedirect('/herramientas?q=ollama')).toBe('/herramientas?q=ollama');
  });

  it('rechaza URLs absolutas a otro dominio', () => {
    expect(safeRedirect('https://malicioso.example/phish')).toBe('/cuenta');
  });

  it('rechaza las rutas protocol-relative', () => {
    expect(safeRedirect('//malicioso.example')).toBe('/cuenta');
    expect(safeRedirect('///malicioso.example')).toBe('/cuenta');
  });

  it('rechaza esquemas peligrosos', () => {
    expect(safeRedirect('javascript:alert(1)')).toBe('/cuenta');
    expect(safeRedirect('/\tjavascript:alert(1)')).toBe('/cuenta');
    expect(safeRedirect('data:text/html,<script>')).toBe('/cuenta');
  });

  it('rechaza el escape con barra invertida', () => {
    expect(safeRedirect('/\\malicioso.example')).toBe('/cuenta');
    expect(safeRedirect('\\\\malicioso.example')).toBe('/cuenta');
  });

  it('no rebota hacia un endpoint de la API', () => {
    expect(safeRedirect('/api/account/delete')).toBe('/cuenta');
  });

  it('cae al valor por defecto cuando no hay destino', () => {
    expect(safeRedirect(null)).toBe('/cuenta');
    expect(safeRedirect(undefined, '/inicio')).toBe('/inicio');
    expect(safeRedirect('')).toBe('/cuenta');
  });
});

describe('CSRF', () => {
  it('emite tokens válidos y distintos', () => {
    const a = issueToken();
    const b = issueToken();
    expect(a).not.toBe(b);
    expect(isValidToken(a)).toBe(true);
  });

  it('rechaza una firma manipulada', () => {
    const token = issueToken();
    const [nonce] = token.split('.');
    expect(isValidToken(`${nonce}.firmafalsa`)).toBe(false);
  });

  it('rechaza basura', () => {
    expect(isValidToken('')).toBe(false);
    expect(isValidToken('sin-punto')).toBe(false);
    expect(isValidToken(undefined)).toBe(false);
  });

  const site = 'https://www.freeairadar.com';

  it('acepta cookie y campo coincidentes con origen correcto', () => {
    const token = issueToken();
    expect(
      verifyCsrf({
        cookieToken: token,
        submittedToken: token,
        origin: site,
        referer: null,
        siteOrigin: site,
      }).ok
    ).toBe(true);
  });

  it('rechaza cuando el token enviado no coincide con la cookie', () => {
    const result = verifyCsrf({
      cookieToken: issueToken(),
      submittedToken: issueToken(),
      origin: site,
      referer: null,
      siteOrigin: site,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('token-mismatch');
  });

  it('rechaza un origen ajeno aunque el token sea válido', () => {
    const token = issueToken();
    const result = verifyCsrf({
      cookieToken: token,
      submittedToken: token,
      origin: 'https://malicioso.example',
      referer: null,
      siteOrigin: site,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('origin-mismatch');
  });

  it('rechaza cuando falta el token', () => {
    expect(
      verifyCsrf({
        cookieToken: undefined,
        submittedToken: 'algo',
        origin: site,
        referer: null,
        siteOrigin: site,
      }).ok
    ).toBe(false);
  });

  it('la cookie tiene el nombre esperado', () => {
    expect(CSRF_COOKIE).toBe('far_csrf');
  });
});

describe('rate limiting', () => {
  beforeEach(() => resetRateLimits());

  it('permite hasta el límite y bloquea después', () => {
    const { limit } = RATE_LIMITS.signIn;

    for (let i = 0; i < limit; i++) {
      expect(checkRateLimit('signIn', 'ip-a').allowed).toBe(true);
    }
    const blocked = checkRateLimit('signIn', 'ip-a');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it('aísla identidades distintas', () => {
    const { limit } = RATE_LIMITS.signIn;
    for (let i = 0; i <= limit; i++) checkRateLimit('signIn', 'ip-a');
    expect(checkRateLimit('signIn', 'ip-b').allowed).toBe(true);
  });

  it('aísla endpoints distintos', () => {
    const { limit } = RATE_LIMITS.signIn;
    for (let i = 0; i <= limit; i++) checkRateLimit('signIn', 'ip-a');
    expect(checkRateLimit('newsletter', 'ip-a').allowed).toBe(true);
  });

  it('los endpoints de autenticación son más estrictos que los de lectura', () => {
    expect(RATE_LIMITS.signIn.limit).toBeLessThan(RATE_LIMITS.api.limit);
    expect(RATE_LIMITS.passwordReset.limit).toBeLessThan(RATE_LIMITS.api.limit);
  });
});

describe('política de contraseñas', () => {
  it('exige longitud mínima', () => {
    expect(PasswordSchema.safeParse('corta1').success).toBe(false);
  });

  it('acepta una frase larga sin símbolos', () => {
    expect(PasswordSchema.safeParse('el radar detecta humo publicitario').success).toBe(true);
  });

  it('rechaza contraseñas de listas filtradas', () => {
    expect(PasswordSchema.safeParse('contrasena123').success).toBe(false);
  });

  it('rechaza cadenas repetitivas aunque sean largas', () => {
    expect(PasswordSchema.safeParse('aaaaaaaaaaaaaaaaaaaa').success).toBe(false);
  });

  it('normaliza el correo a minúsculas', () => {
    const parsed = EmailSchema.safeParse('  UsuariO@Ejemplo.COM ');
    expect(parsed.success && parsed.data).toBe('usuario@ejemplo.com');
  });

  it('la fuerza crece con la longitud', () => {
    expect(passwordStrength('')).toBe(0);
    expect(passwordStrength('contraseñalarga y variada 42!')).toBeGreaterThan(
      passwordStrength('aaaaaaaaaaaa')
    );
  });
});

describe('consentimiento', () => {
  it('sin cookie, todo denegado', () => {
    expect(readConsentFromCookie(undefined)).toEqual(DENY_ALL);
  });

  it('una cookie corrupta deniega, no concede', () => {
    expect(readConsentFromCookie('no-es-json')).toEqual(DENY_ALL);
  });

  it('una versión antigua invalida el consentimiento anterior', () => {
    const old = encodeURIComponent(
      JSON.stringify({
        version: CONSENT_VERSION - 1,
        state: { necessary: true, analytics: true, personalization: true, advertising: true },
        decidedAt: new Date().toISOString(),
      })
    );
    expect(readConsentFromCookie(old)).toEqual(DENY_ALL);
  });

  it('lee correctamente un consentimiento vigente', () => {
    const cookie = encodeURIComponent(
      JSON.stringify({
        version: CONSENT_VERSION,
        state: { necessary: true, analytics: true, personalization: false, advertising: false },
        decidedAt: new Date().toISOString(),
      })
    );
    expect(readConsentFromCookie(cookie)).toEqual({
      necessary: true,
      analytics: true,
      personalization: false,
      advertising: false,
    });
  });

  it('«necessary» siempre queda activo', () => {
    const cookie = encodeURIComponent(
      JSON.stringify({
        version: CONSENT_VERSION,
        state: { necessary: false, analytics: false, personalization: false, advertising: false },
        decidedAt: new Date().toISOString(),
      })
    );
    expect(readConsentFromCookie(cookie).necessary).toBe(true);
  });
});
