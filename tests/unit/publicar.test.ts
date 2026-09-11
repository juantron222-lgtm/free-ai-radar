import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { revalidar, veredicto } from '../../scripts/newsroom-publicar.mjs';

/**
 * El último paso del publicador tuvo dos fallos, y el primero tapaba al segundo.
 *
 * 1. Lanzaba la suite con `npx.cmd` sin shell. En Node 24 sobre Windows eso
 *    falla con EINVAL antes de arrancar, `status` vuelve `null`, y el script lo
 *    leía como «rechazada»: rechazó todas las noticias durante un día sin
 *    ejecutar ni una prueba.
 * 2. Escribía la semilla y probaba sin regenerar `generated/news.json`, que es
 *    lo que la suite lee. Cualquier noticia nueva suspendía por un desfase de
 *    16 contra 15 que no tenía nada que ver con ella.
 *
 * Se prueba contra procesos de verdad: un repositorio de mentira en una carpeta
 * temporal, con dos programas pequeños donde viven `newsroom-sync.mjs` y el
 * punto de entrada de vitest. Un doble de `spawnSync` no habría visto el primer
 * fallo, que consistía precisamente en que el proceso no llegaba a arrancar.
 */

type Lanzador = NonNullable<Parameters<typeof revalidar>[0]['lanzarProceso']>;

const SEMILLA = 'src/data/news/news.json';
const GENERADO = 'src/data/generated/news.json';
const SYNC = 'scripts/newsroom-sync.mjs';
const VITEST = 'node_modules/vitest/vitest.mjs';

/* Lo que hace `newsroom-sync.mjs --seed`: el generado pasa a ser la semilla. */
const SYNC_QUE_REGENERA = [
  "import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';",
  "mkdirSync('src/data/generated', { recursive: true });",
  "writeFileSync('src/data/generated/news.json', readFileSync('src/data/news/news.json', 'utf-8'));",
].join('\n');

const SYNC_QUE_FALLA = "console.error('SyntaxError: Unexpected end of JSON input'); process.exit(1);";

/*
 * Lo que comprobaba el test del cargador que suspendía: que el generado tenga
 * tantas noticias como la semilla.
 */
const SUITE_QUE_CUENTA = [
  "import { readFileSync } from 'node:fs';",
  "const cuantas = (ruta) => JSON.parse(readFileSync(ruta, 'utf-8')).length;",
  "const generado = cuantas('src/data/generated/news.json');",
  "const semilla = cuantas('src/data/news/news.json');",
  'if (generado !== semilla) {',
  "  console.error('AssertionError: expected ' + generado + ' to be ' + semilla);",
  '  process.exit(1);',
  '}',
].join('\n');

const SUITE_QUE_SUSPENDE =
  "console.error('AssertionError: summary: String must contain at most 600 character(s)'); process.exit(1);";

/* Lo que devolvía `spawnSync('npx.cmd', …)` sin shell: ni proceso ni código. */
const SIN_ARRANCAR = {
  status: null,
  signal: null,
  stdout: '',
  stderr: '',
  error: Object.assign(new Error('spawnSync npx.cmd EINVAL'), { code: 'EINVAL' }),
};

interface Llamada {
  orden: string;
  args: string[];
  opciones: object;
  /** El generado en el instante de lanzar, que es lo que la suite va a leer. */
  generado: string | null;
}

let raiz = '';
let llamadas: Llamada[] = [];

afterEach(() => {
  if (raiz) rmSync(raiz, { recursive: true, force: true });
  raiz = '';
  llamadas = [];
});

const ruta = (relativa: string) => join(raiz, relativa);
const leer = (relativa: string) => readFileSync(ruta(relativa), 'utf-8');
const escribir = (relativa: string, contenido: string) => {
  mkdirSync(dirname(ruta(relativa)), { recursive: true });
  writeFileSync(ruta(relativa), contenido, 'utf-8');
};
const json = (valor: unknown) => `${JSON.stringify(valor, null, 2)}\n`;
const ficheros = () => ({ semilla: leer(SEMILLA), generado: leer(GENERADO) });

/** El repositorio de mentira. Con `null`, ese programa no está instalado. */
function montar({
  sync = SYNC_QUE_REGENERA,
  suite = SUITE_QUE_CUENTA,
  conGenerado = true,
}: { sync?: string | null; suite?: string | null; conGenerado?: boolean } = {}) {
  raiz = mkdtempSync(join(tmpdir(), 'publicar-'));
  const dos = json([{ slug: 'una' }, { slug: 'otra' }]);
  escribir(SEMILLA, dos);
  if (conGenerado) escribir(GENERADO, dos);
  if (sync !== null) escribir(SYNC, sync);
  if (suite !== null) escribir(VITEST, suite);
}

/** Lo que hace el publicador justo antes de revalidar. Devuelve la semilla de antes. */
function escribirNoticia() {
  const anterior = leer(SEMILLA);
  escribir(SEMILLA, json([...JSON.parse(anterior), { slug: 'nueva' }]));
  return anterior;
}

/** `spawnSync` de verdad, apuntando con qué se le llama. */
const espia: Lanzador = (orden, args, opciones) => {
  llamadas.push({
    orden,
    args,
    opciones: { ...opciones },
    generado: existsSync(ruta(GENERADO)) ? leer(GENERADO) : null,
  });
  return spawnSync(orden, args, opciones);
};

/** Lo lanzado, como se escribiría a mano: fichero de entrada y argumentos. */
const lanzados = () =>
  llamadas.map((l) =>
    [relative(raiz, l.args[0] ?? '').replace(/\\/g, '/'), ...l.args.slice(1)].join(' ')
  );

const escribirYRevalidar = (lanzarProceso: Lanzador = espia) =>
  revalidar({ semillaAnterior: escribirNoticia(), raiz, lanzarProceso });

describe('fallo 1 · la suite tiene que llegar a arrancar', () => {
  it('se lanza con este mismo Node y el fichero de entrada, sin npx ni shell', () => {
    montar();

    const revision = escribirYRevalidar();

    expect(revision.veredicto).toBe('aprobada');
    expect(llamadas).toHaveLength(2);
    for (const llamada of llamadas) {
      expect(llamada.orden).toBe(process.execPath);
      expect(llamada.opciones).not.toHaveProperty('shell');
      expect(llamada.opciones).toMatchObject({ cwd: raiz });
    }
  });

  it.each([
    { caso: 'npx.cmd sin shell en Node 24 sobre Windows', proceso: SIN_ARRANCAR, esperado: 'no-ejecutada' },
    { caso: 'un proceso terminado por una señal', proceso: { status: null, signal: 'SIGTERM' }, esperado: 'no-ejecutada' },
    { caso: 'una suite que suspende', proceso: { status: 1 }, esperado: 'rechazada' },
    { caso: 'una suite que pasa', proceso: { status: 0 }, esperado: 'aprobada' },
  ])('$caso: $esperado', ({ proceso, esperado }) => {
    expect(veredicto(proceso)).toBe(esperado);
  });

  it('si la suite no arranca, dice que no ha podido y deja los dos ficheros como estaban', () => {
    montar();
    const antes = ficheros();
    /* La regeneración corre de verdad; el lanzamiento de la suite reproduce el EINVAL. */
    const suiteSinArrancar: Lanzador = (orden, args, opciones) =>
      args[0]?.endsWith('vitest.mjs') ? SIN_ARRANCAR : espia(orden, args, opciones);

    const revision = escribirYRevalidar(suiteSinArrancar);

    expect(revision.veredicto).toBe('no-ejecutada');
    expect(revision.motivo).toBe('spawnSync npx.cmd EINVAL');
    expect(ficheros()).toEqual(antes);
  });

  it('sin vitest instalado, tampoco la da por suspendida', () => {
    /* Es lo que pasa en una copia de trabajo sin `node_modules`. */
    montar({ suite: null });
    const antes = ficheros();

    const revision = escribirYRevalidar();

    expect(revision.veredicto).toBe('no-ejecutada');
    expect(revision.motivo).toMatch(/^no se encuentra .*vitest\.mjs$/);
    expect(lanzados()).toEqual([`${SYNC} --seed`]);
    expect(ficheros()).toEqual(antes);
  });
});

describe('fallo 2 · la suite lee el generado, no la semilla', () => {
  it('sin regenerar, una noticia válida suspende: es el desfase de 16 contra 15', () => {
    /*
     * La comprobación de que la maqueta reproduce el fallo. Sin ella, que la
     * prueba siguiente pase no demostraría nada.
     */
    montar();
    escribirNoticia();

    const suite = spawnSync(process.execPath, [ruta(VITEST)], { cwd: raiz, encoding: 'utf-8' });

    expect(suite.status).toBe(1);
    expect(suite.stderr).toContain('expected 2 to be 3');
  });

  it('regenera antes de probar, así que la misma noticia pasa', () => {
    montar();

    const revision = escribirYRevalidar();

    expect(lanzados()).toEqual([`${SYNC} --seed`, `${VITEST} run tests/unit/news.test.ts`]);
    /* Cuando arranca la suite, el generado ya lleva la noticia. */
    expect(llamadas.at(-1)?.generado).toContain('"nueva"');
    expect(revision.veredicto).toBe('aprobada');
    /* Lo aprobado no se deshace: la noticia queda en los dos ficheros. */
    expect(ficheros().semilla).toContain('"nueva"');
    expect(ficheros().generado).toContain('"nueva"');
  });

  it('si la suite suspende, vuelven la semilla y el generado', () => {
    montar({ suite: SUITE_QUE_SUSPENDE });
    const antes = ficheros();

    const revision = escribirYRevalidar();

    expect(llamadas.at(-1)?.generado).toContain('"nueva"');
    expect(revision.veredicto).toBe('rechazada');
    expect(revision.salida).toContain('at most 600 character(s)');
    expect(ficheros()).toEqual(antes);
  });

  it('si no se puede regenerar, no llega a probar ni lo llama suspender', () => {
    montar({ sync: SYNC_QUE_FALLA });
    const antes = ficheros();

    const revision = escribirYRevalidar();

    expect(lanzados()).toEqual([`${SYNC} --seed`]);
    expect(revision.veredicto).toBe('no-ejecutada');
    expect(revision.motivo).toBe('newsroom-sync.mjs terminó con código 1');
    expect(ficheros()).toEqual(antes);
  });

  it('si no había generado, no deja uno con la noticia rechazada', () => {
    montar({ suite: SUITE_QUE_SUSPENDE, conGenerado: false });
    const semillaAntes = leer(SEMILLA);

    const revision = escribirYRevalidar();

    expect(revision.veredicto).toBe('rechazada');
    expect(leer(SEMILLA)).toBe(semillaAntes);
    expect(existsSync(ruta(GENERADO))).toBe(false);
  });
});
