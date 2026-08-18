import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Auth flows against the local development store.
 *
 * The store writes to `.data/` relative to `process.cwd()`, so each test run
 * gets its own temporary working directory and cleans up after itself. Nothing
 * here touches a real identity provider.
 */

let workDir: string;
let originalCwd: string;

/*
 * scrypt cuesta lo que tiene que costar.
 *
 * `SCRYPT_PARAMS` usa N = 16384 a propósito: derivar una clave es lento porque
 * eso es lo que protege una contraseña. Cada prueba de este fichero registra o
 * autentica al menos una vez, así que el presupuesto por defecto de 5 s se
 * agota en cuanto la máquina está ocupada — y el fallo dice «timeout», que no
 * señala a nada.
 *
 * Subirlo no tapa lentitud: si scrypt dejara de ser el cuello de botella o el
 * almacén local se volviera cuadrático, 20 s se seguirían pasando.
 */
vi.setConfig({ testTimeout: 20_000, hookTimeout: 20_000 });

beforeEach(async () => {
  originalCwd = process.cwd();
  workDir = await mkdtemp(join(tmpdir(), 'far-auth-'));
  process.chdir(workDir);
  vi.resetModules();
});

afterEach(async () => {
  process.chdir(originalCwd);
  await rm(workDir, { recursive: true, force: true });
});

const CREDENTIALS = {
  email: 'persona@ejemplo.com',
  password: 'una frase larga y memorable',
  displayName: 'Persona',
};

function emptyRequest(cookie = ''): Request {
  return new Request('https://www.freeairadar.com/', {
    headers: cookie ? { cookie } : {},
  });
}

function cookieHeaderFrom(
  cookies: Array<{ name: string; value: string; options: Record<string, unknown> }>
): string {
  return cookies.map((cookie) => `${cookie.name}=${encodeURIComponent(cookie.value)}`).join('; ');
}

describe('registro e inicio de sesión (modo local)', () => {
  it('crea una cuenta y devuelve una sesión', async () => {
    const { getAuthProvider } = await import('@lib/auth/provider');
    const auth = getAuthProvider();
    expect(auth.mode).toBe('local');

    const result = await auth.signUp(CREDENTIALS, emptyRequest());
    expect(result.ok).toBe(true);
    expect(result.user?.email).toBe(CREDENTIALS.email);

    const cookies = auth.drainCookies();
    expect(cookies.some((cookie) => cookie.name === 'far_session')).toBe(true);
  });

  it('la cookie de sesión es HttpOnly y SameSite=Lax', async () => {
    const { getAuthProvider } = await import('@lib/auth/provider');
    const auth = getAuthProvider();
    await auth.signUp(CREDENTIALS, emptyRequest());

    const session = auth.drainCookies().find((cookie) => cookie.name === 'far_session')!;
    expect(session.options['httpOnly']).toBe(true);
    expect(session.options['sameSite']).toBe('lax');
    expect(session.options['path']).toBe('/');
  });

  it('la contraseña nunca se guarda en claro', async () => {
    const { getAuthProvider } = await import('@lib/auth/provider');
    const local = await import('@lib/auth/local-store');

    await getAuthProvider().signUp(CREDENTIALS, emptyRequest());
    const stored = await local.findByEmail(CREDENTIALS.email);

    expect(stored).toBeDefined();
    expect(stored!.passwordHash).not.toContain(CREDENTIALS.password);
    expect(stored!.salt).toBeTruthy();
    expect(stored!.passwordHash.length).toBeGreaterThan(64);
  });

  it('registrar un correo existente no revela que ya existe', async () => {
    const { getAuthProvider } = await import('@lib/auth/provider');

    const first = await getAuthProvider().signUp(CREDENTIALS, emptyRequest());
    const second = await getAuthProvider().signUp(CREDENTIALS, emptyRequest());

    // Misma forma de respuesta: el formulario no sirve para enumerar cuentas.
    expect(second.ok).toBe(first.ok);
    expect(second.message).toBe(first.message);
  });

  it('inicia sesión con las credenciales correctas', async () => {
    const { getAuthProvider } = await import('@lib/auth/provider');
    await getAuthProvider().signUp(CREDENTIALS, emptyRequest());

    const auth = getAuthProvider();
    const result = await auth.signIn(
      { email: CREDENTIALS.email, password: CREDENTIALS.password },
      emptyRequest()
    );

    expect(result.ok).toBe(true);
    expect(result.user?.email).toBe(CREDENTIALS.email);
  });

  it('rechaza una contraseña incorrecta sin decir por qué', async () => {
    const { getAuthProvider } = await import('@lib/auth/provider');
    await getAuthProvider().signUp(CREDENTIALS, emptyRequest());

    const wrongPassword = await getAuthProvider().signIn(
      { email: CREDENTIALS.email, password: 'contraseña equivocada larga' },
      emptyRequest()
    );
    const unknownUser = await getAuthProvider().signIn(
      { email: 'nadie@ejemplo.com', password: 'contraseña equivocada larga' },
      emptyRequest()
    );

    expect(wrongPassword.ok).toBe(false);
    expect(unknownUser.ok).toBe(false);
    // Mensaje idéntico: no se distingue "no existe" de "contraseña mal".
    expect(wrongPassword.message).toBe(unknownUser.message);
  });

  it('recupera al usuario a partir de la cookie de sesión', async () => {
    const { getAuthProvider } = await import('@lib/auth/provider');
    const signup = getAuthProvider();
    await signup.signUp(CREDENTIALS, emptyRequest());
    const header = cookieHeaderFrom(signup.drainCookies());

    const user = await getAuthProvider().getUser(emptyRequest(header));
    expect(user?.email).toBe(CREDENTIALS.email);
  });

  it('una cookie manipulada no autentica', async () => {
    const { getAuthProvider } = await import('@lib/auth/provider');
    const user = await getAuthProvider().getUser(
      emptyRequest('far_session=cualquiercosa.firmafalsa')
    );
    expect(user).toBeNull();
  });

  it('sin cookie no hay usuario', async () => {
    const { getAuthProvider } = await import('@lib/auth/provider');
    expect(await getAuthProvider().getUser(emptyRequest())).toBeNull();
  });
});

describe('recuperación de contraseña', () => {
  it('responde igual exista o no la cuenta', async () => {
    const { getAuthProvider } = await import('@lib/auth/provider');
    await getAuthProvider().signUp(CREDENTIALS, emptyRequest());

    const existing = await getAuthProvider().requestPasswordReset(
      CREDENTIALS.email,
      emptyRequest()
    );
    const missing = await getAuthProvider().requestPasswordReset(
      'nadie@ejemplo.com',
      emptyRequest()
    );

    expect(existing.ok).toBe(true);
    expect(missing.ok).toBe(true);
    expect(existing.message).toBe(missing.message);
  });

  it('rechaza un token inválido', async () => {
    const { getAuthProvider } = await import('@lib/auth/provider');
    const result = await getAuthProvider().resetPassword(
      'token-inventado-que-no-existe',
      'otra frase larga y distinta',
      emptyRequest()
    );
    expect(result.ok).toBe(false);
  });

  it('el token de recuperación se guarda hasheado, no en claro', async () => {
    const { getAuthProvider } = await import('@lib/auth/provider');
    const local = await import('@lib/auth/local-store');

    await getAuthProvider().signUp(CREDENTIALS, emptyRequest());
    await getAuthProvider().requestPasswordReset(CREDENTIALS.email, emptyRequest());

    const stored = await local.findByEmail(CREDENTIALS.email);
    expect(stored?.resetTokenHash).toBeTruthy();
    expect(stored?.resetTokenHash).toHaveLength(64);
  });
});

describe('cambio de contraseña', () => {
  it('exige la contraseña actual', async () => {
    const { getAuthProvider } = await import('@lib/auth/provider');
    const signup = await getAuthProvider().signUp(CREDENTIALS, emptyRequest());
    const userId = signup.user!.id;

    const wrong = await getAuthProvider().changePassword(
      userId,
      'la que no es, pero larga',
      'una contraseña nueva y larga'
    );
    expect(wrong.ok).toBe(false);

    const right = await getAuthProvider().changePassword(
      userId,
      CREDENTIALS.password,
      'una contraseña nueva y larga'
    );
    expect(right.ok).toBe(true);
  });

  it('tras el cambio, la contraseña antigua deja de valer', async () => {
    const { getAuthProvider } = await import('@lib/auth/provider');
    const signup = await getAuthProvider().signUp(CREDENTIALS, emptyRequest());

    await getAuthProvider().changePassword(
      signup.user!.id,
      CREDENTIALS.password,
      'una contraseña nueva y larga'
    );

    const old = await getAuthProvider().signIn(
      { email: CREDENTIALS.email, password: CREDENTIALS.password },
      emptyRequest()
    );
    const fresh = await getAuthProvider().signIn(
      { email: CREDENTIALS.email, password: 'una contraseña nueva y larga' },
      emptyRequest()
    );

    expect(old.ok).toBe(false);
    expect(fresh.ok).toBe(true);
  });
});

describe('eliminación de cuenta', () => {
  it('borra al usuario y limpia la sesión', async () => {
    const { getAuthProvider } = await import('@lib/auth/provider');
    const local = await import('@lib/auth/local-store');

    const signup = await getAuthProvider().signUp(CREDENTIALS, emptyRequest());
    const auth = getAuthProvider();
    const result = await auth.deleteAccount(signup.user!.id);

    expect(result.ok).toBe(true);
    expect(await local.findByEmail(CREDENTIALS.email)).toBeUndefined();

    const cleared = auth.drainCookies().find((cookie) => cookie.name === 'far_session');
    expect(cleared?.options['maxAge']).toBe(0);
  });
});

describe('roles', () => {
  it('una cuenta nueva nunca nace con privilegios', async () => {
    const { getAuthProvider } = await import('@lib/auth/provider');
    const result = await getAuthProvider().signUp(
      { ...CREDENTIALS, email: 'normal@ejemplo.com' },
      emptyRequest()
    );
    expect(result.user?.role).toBe('user');
    expect(result.user?.plan).toBe('free');
  });

  it('el correo de la lista ADMIN_EMAILS obtiene rol de administrador', async () => {
    const { getAuthProvider } = await import('@lib/auth/provider');
    const result = await getAuthProvider().signUp(
      { ...CREDENTIALS, email: 'admin@freeairadar.com' },
      emptyRequest()
    );
    expect(result.user?.role).toBe('admin');
  });
});
