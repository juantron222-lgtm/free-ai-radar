import type { FullConfig } from '@playwright/test';

/**
 * A smoke check that runs before the suite and fails fast when the server is
 * not fit to be tested against.
 *
 * This exists because of a real incident: a dev server that had been running
 * for hours had a corrupted Vite module graph, so sessions silently stopped
 * sticking. `reuseExistingServer` handed the suite that server, and twelve
 * account tests failed over three and a half minutes with errors that looked
 * exactly like an authentication bug. The application was fine.
 *
 * A round trip through sign-up takes about a second and tells the difference:
 * if the session does not survive one redirect here, nothing downstream is
 * worth interpreting, and the message says where to look.
 */

async function check(baseURL: string): Promise<string | null> {
  const jar = new Map<string, string>();
  const cookies = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');

  const absorb = (response: Response) => {
    for (const raw of response.headers.getSetCookie?.() ?? []) {
      const pair = raw.split(';')[0] ?? '';
      const index = pair.indexOf('=');
      if (index > 0) jar.set(pair.slice(0, index), pair.slice(index + 1));
    }
  };

  let response: Response;
  try {
    response = await fetch(`${baseURL}/cuenta/crear`, { headers: { cookie: cookies() } });
  } catch (error) {
    return `no responde: ${error instanceof Error ? error.message : String(error)}`;
  }

  if (!response.ok) return `/cuenta/crear devuelve ${response.status}`;
  absorb(response);

  const csrf = (await response.text()).match(/name="_csrf"\s+value="([^"]+)"/)?.[1];
  if (!csrf) return 'el formulario de registro no trae token CSRF';

  const signUp = await fetch(`${baseURL}/api/auth/signup`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      cookie: cookies(),
      origin: baseURL,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      email: `smoke-${Date.now()}@ejemplo.test`,
      password: 'una frase larga para las pruebas',
      _csrf: csrf,
    }),
  });

  if (signUp.status >= 400) return `el registro devuelve ${signUp.status}`;
  absorb(signUp);
  if (!jar.has('far_session')) return 'el registro no deja cookie de sesión';

  const account = await fetch(`${baseURL}/cuenta`, {
    headers: { cookie: cookies() },
    redirect: 'manual',
  });

  if (account.status !== 200) {
    return `la sesión no sobrevive: /cuenta devuelve ${account.status}`;
  }

  return null;
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL =
    process.env['E2E_BASE_URL'] ??
    config.projects[0]?.use?.baseURL ??
    `http://localhost:${process.env['E2E_PORT'] ?? 4321}`;

  const problem = await check(baseURL);
  if (!problem) return;

  throw new Error(
    [
      '',
      `El servidor de pruebas en ${baseURL} no está en condiciones: ${problem}.`,
      '',
      'Casi siempre es un servidor de desarrollo reutilizado que lleva demasiado',
      'tiempo vivo y ha perdido su grafo de módulos. Párelo y repita:',
      '',
      '  npx astro dev stop',
      '',
      'Si el problema persiste con un servidor recién arrancado, entonces sí es',
      'un fallo de la aplicación y merece depurarse.',
      '',
    ].join('\n')
  );
}
