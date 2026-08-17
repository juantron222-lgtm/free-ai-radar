import { defineConfig, devices } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runStateRoot } from './tests/e2e/run-state';

/**
 * The Vercel Protection Bypass secret, read from .env.local.
 *
 * Sent as a header on every request, never as a query parameter: a secret in a
 * URL ends up in referrers, in server logs and in screenshots. It is read here
 * rather than passed on the command line for the same reason.
 */
function bypassHeader(): Record<string, string> {
  if (!existsSync('.env.local')) return {};
  const line = readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith('VERCEL_PROTECTION_BYPASS='));
  const value = line?.slice('VERCEL_PROTECTION_BYPASS='.length).trim().replace(/^["']|["']$/g, '');
  return value ? { 'x-vercel-protection-bypass': value } : {};
}

const PORT = Number(process.env.E2E_PORT ?? 4321);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

/**
 * Un servidor y un estado por proyecto.
 *
 * Los seis proyectos compartían un solo servidor de desarrollo, y con él un
 * solo `.data/dev-users.json`. Eso tenía dos consecuencias distintas y las dos
 * salieron a la luz: las cuentas que creaba un motor las veían los cinco
 * siguientes —seiscientas veintiséis acumuladas cuando se midió—, y el mismo
 * proceso de Astro aguantaba dieciséis minutos y cuatrocientas cargas de
 * página seguidas. La segunda es la que producía los rojos: fallos distintos
 * en cada ejecución, en proyectos distintos, todos verdes al ejecutarlos
 * aislados. `global-setup.ts` ya documentaba esa forma de romperse.
 *
 * Cada proyecto arranca ahora en su propio puerto con su propio `FAR_DATA_DIR`.
 * Aislar el estado era lo pedido; que cada servidor viva la sexta parte del
 * tiempo es lo que de verdad quita el ruido.
 *
 * Medido antes de dar por buena la explicación fácil: con el fichero de 626
 * usuarios acumulados, un registro tardaba 61 ms de mediana. El tamaño del
 * fichero no era el problema, así que borrarlo tampoco habría sido la
 * solución.
 */
const ENGINES = [
  { name: 'chromium', device: 'Desktop Chrome' },
  { name: 'firefox', device: 'Desktop Firefox' },
  { name: 'webkit', device: 'Desktop Safari' },
  { name: 'mobile', device: 'Pixel 7' },
  { name: 'mobile-safari', device: 'iPhone 14' },
  { name: 'desktop', device: 'Desktop Chrome' },
] as const;

/** Raíz efímera del estado de esta ejecución. Ver `tests/e2e/run-state.ts`. */
const STATE_ROOT = runStateRoot();

const portFor = (index: number) => PORT + index;
const urlFor = (index: number) => `http://localhost:${portFor(index)}`;

export default defineConfig({
  testDir: './tests/e2e',
  /**
   * Against a deployment, the account specs are excluded by construction.
   *
   * They are written for the local identity store — see the `webServer` env
   * below — and a deployment runs on Supabase, where they register throwaway
   * accounts that GoTrue rate-limits and whose synthetic domains it rejects.
   * Pointing the whole suite at a preview produces a wall of red that says
   * nothing about the site, and red that means nothing is how a real failure
   * gets waved past.
   *
   * The Supabase half is covered against the real thing by
   * `node scripts/preview-account-qa.mjs`, which creates its identity through
   * the Admin API and deletes it afterwards.
   */
  ...(process.env.E2E_BASE_URL ? { testIgnore: ['**/account.spec.ts'] } : {}),
  /**
   * Serial on purpose.
   *
   * Every worker talks to the same dev server, and in local auth mode that
   * server keeps accounts and user data in a single JSON file. Running in
   * parallel makes tests race over one shared resource, which produces failures
   * that say nothing about the application. The whole suite finishes in under a
   * minute anyway.
   *
   * With Supabase configured this restriction can be lifted.
   */
  fullyParallel: false,
  workers: 1,
  /**
   * Checks the server is healthy before a single test runs. See the file for
   * the incident that made this worth a second of startup time.
   */
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 30_000,
  use: {
    baseURL: BASE_URL,
    // Only when pointing at a deployment; local runs need no bypass.
    ...(process.env.E2E_BASE_URL ? { extraHTTPHeaders: bypassHeader() } : {}),
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  /**
   * `desktop` is kept as an alias of `chromium` so existing commands and CI
   * invocations do not break; `chromium` is the name the QA skill asks for.
   *
   * WebKit earns its place: it is the only engine here that will surface `dvh`,
   * `:has()` and flex differences before an iPhone user does.
   */
  projects: ENGINES.map((engine, index) => ({
    name: engine.name,
    use: {
      ...devices[engine.device],
      // Contra un despliegue hay una sola URL; en local, una por proyecto.
      ...(process.env.E2E_BASE_URL ? {} : { baseURL: urlFor(index) }),
    },
  })),
  /**
   * Un servidor por proyecto, cada uno con su estado, y ninguno reutilizado.
   *
   * `reuseExistingServer` estaba activo fuera de CI para ahorrarse el arranque
   * al depurar una sola prueba. Con el estado por proyecto deja de ser
   * inofensivo: un servidor levantado a mano con `npm run dev` no tiene
   * `FAR_DATA_DIR`, así que escribe en el `.data/` del repositorio. Ese
   * proyecto perdería el aislamiento —y de paso ensuciaría las cuentas de
   * desarrollo de quien esté trabajando— sin que nada lo dijera.
   *
   * En falso, Playwright falla si el puerto está ocupado. Preferible: un error
   * al arrancar se lee; un servidor equivocado no se nota.
   */
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : ENGINES.map((engine, index) => ({
        /*
         * `--ignore-lock` es lo que permite que haya seis.
         *
         * Astro guarda un fichero de bloqueo para no levantar dos servidores
         * de desarrollo en el mismo proyecto, y sin él el segundo se limita a
         * decir «ya hay uno en el 4321» y salir. Playwright informa eso como
         * «Process from config.webServer exited early», que no menciona ni el
         * bloqueo ni el puerto.
         */
        command: `npm run dev -- --port ${portFor(index)} --ignore-lock`,
        url: urlFor(index),
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
          // `E2E=1` turns off the Astro dev toolbar, whose fixed overlay would
          // otherwise intercept clicks on the consent dialog.
          E2E: '1',
          EMAIL_DRY_RUN: '1',

          /*
           * Servidor en primer plano, que es el único que Playwright sabe
           * gobernar.
           *
           * Astro detecta si lo lanza un agente de IA y, en ese caso, se
           * demoniza solo. Un servidor demonizado sale de inmediato, y
           * Playwright lo informa como «exited early» sin mencionar nada de
           * esto. Además el modo background exige el fichero de bloqueo, que es
           * justo lo que `--ignore-lock` desactiva para poder tener seis.
           *
           * Fuera de ese entorno la variable no cambia nada: la detección ya
           * daba falso.
           */
          ASTRO_DEV_BACKGROUND: '0',

          /*
           * Estado propio, no el `.data/` del repositorio.
           *
           * Es lo que impide que las cuentas de un motor las vea el siguiente,
           * y lo que hace que cada ejecución empiece desde cero. `globalSetup`
           * vacía la raíz antes de empezar y `globalTeardown` la borra al
           * terminar.
           */
          FAR_DATA_DIR: join(STATE_ROOT, engine.name),

          /*
           * Force local auth mode, whatever .env.local says.
           *
           * Once the Supabase staging credentials landed in .env.local, the dev
           * server started resolving to Supabase — and this suite is written
           * for the local identity store: it creates throwaway accounts freely,
           * which against a real GoTrue means rejected synthetic domains and an
           * email rate limit measured in single digits per hour.
           *
           * The split is deliberate rather than a workaround. These specs cover
           * the *interface*: forms, redirects, session guards, consent. Supabase
           * itself is covered against the real thing by
           * `npm run http:staging`, which attacks GoTrue and PostgREST with
           * signed JWTs. Running both against staging would duplicate the
           * weaker half and make it flaky.
           */
          PUBLIC_SUPABASE_URL: '',
          PUBLIC_SUPABASE_ANON_KEY: '',
          SUPABASE_SERVICE_ROLE_KEY: '',
        },
      })),
});
