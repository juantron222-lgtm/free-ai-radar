import type { FullConfig } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { resetRunState } from './run-state';

/** Same secret the config sends, read the same way. Never logged. */
function bypassHeaders(): Record<string, string> {
  if (!existsSync('.env.local')) return {};
  const line = readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith('VERCEL_PROTECTION_BYPASS='));
  const value = line?.slice('VERCEL_PROTECTION_BYPASS='.length).trim().replace(/^["']|["']$/g, '');
  return value ? { 'x-vercel-protection-bypass': value } : {};
}

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

  await warm(baseURL);
  return null;
}

/**
 * Compila las rutas pesadas antes de que empiece la primera prueba.
 *
 * Playwright da por listo un servidor en cuanto su URL responde, y un servidor
 * de desarrollo responde a `/` mucho antes de haber compilado el resto. Con
 * seis arrancando a la vez —uno por proyecto, para aislar el estado— las seis
 * compilaciones compiten por la máquina, y la primera navegación de la primera
 * prueba se comía los treinta segundos de tope: cuatro fallos, todos
 * `page.goto: Test timeout`, todos en el primer proyecto.
 *
 * No es un reintento ni un tope más generoso. Es hacer que «el servidor está
 * listo» signifique lo que la suite necesita que signifique, que es justo para
 * lo que existe este fichero.
 *
 * Se piden en paralelo y se ignoran los errores: aquí sólo se está calentando.
 * Si alguna ruta estuviera rota de verdad, la prueba que la usa lo dirá con un
 * mensaje que señala la ruta, no un tiempo agotado que no señala nada.
 */
async function warm(baseURL: string): Promise<void> {
  const rutas = [
    '/',
    '/cuenta/crear',
    '/cuenta/entrar',
    '/herramientas',
    '/imagen',
    '/video',
    '/audio',
    '/agentes',
    '/modelos',
    '/categorias',
    '/comparar',
    '/noticias',
    /*
     * Las dos rutas que compilan por primera vez dentro de una prueba.
     *
     * `/cuenta/favoritos` responde una redirección a quien no ha entrado, pero
     * compilarla cuesta lo mismo; y `herramientas/[slug]` es una plantilla
     * distinta de la del listado. Las pruebas de cuenta las visitan en frío, y
     * en frío con otros cinco servidores compilando a la vez es donde se agota
     * el tiempo.
     */
    '/cuenta/favoritos',
    '/herramientas/ollama',
  ];

  await Promise.all(
    rutas.map((ruta) =>
      fetch(`${baseURL}${ruta}`).catch(() => undefined)
    )
  );
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  /*
   * Against a real deployment the check below does not apply.
   *
   * It exists to catch a dev server whose module graph has gone stale, and it
   * detects that by signing up through the local identity store. A Vercel
   * deployment has neither problem and runs on Supabase, where a synthetic
   * address is rejected by GoTrue — so the check would fail for a reason that
   * says nothing about the deployment. Reachability is what matters there.
   */
  if (process.env['E2E_BASE_URL']) {
    const target = process.env['E2E_BASE_URL'];
    const headers = bypassHeaders();
    const res = await fetch(target, { headers });
    if (res.status !== 200) {
      throw new Error(
        `El despliegue en ${target} devuelve ${res.status}. ` +
          'Si es 302, falta la cabecera x-vercel-protection-bypass o el secreto no es el de este despliegue.'
      );
    }
    return;
  }

  /*
   * Estado limpio antes de la primera prueba.
   *
   * Cada proyecto tiene su propio directorio bajo esta raíz. Vaciarla aquí es
   * lo que hace determinista el arranque: ninguna prueba puede pasar porque
   * quedara una cuenta, una lista o un favorito de la ejecución anterior, que
   * es la clase de aprobado que no se nota hasta que un día falta.
   */
  resetRunState();

  /*
   * Se comprueban todos los servidores, no sólo el primero.
   *
   * Con un servidor por proyecto, revisar únicamente `projects[0]` dejaría
   * cinco sin mirar, y el sexto proyecto fallaría veinte minutos después con
   * un error que no dice que el problema era el arranque.
   */
  const urls = [
    ...new Set(
      config.projects
        .map((project) => project.use?.baseURL)
        .filter((url): url is string => typeof url === 'string' && url.length > 0)
    ),
  ];

  const targets = urls.length ? urls : [`http://localhost:${process.env['E2E_PORT'] ?? 4321}`];

  const problems = (await Promise.all(targets.map(async (url) => [url, await check(url)] as const)))
    .filter((entry): entry is readonly [string, string] => entry[1] !== null)
    .map(([url, problem]) => `  · ${url}: ${problem}`);

  if (!problems.length) return;

  throw new Error(
    [
      '',
      `${problems.length} de ${targets.length} servidores de pruebas no están en condiciones:`,
      ...problems,
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
