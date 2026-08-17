import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * El estado efímero de una ejecución de la suite.
 *
 * Cada proyecto de Playwright levanta su propio servidor de desarrollo con su
 * propio `FAR_DATA_DIR` debajo de esta raíz, de modo que las cuentas que crea
 * Firefox no las vea Chromium. Antes los seis compartían `.data/` en el
 * repositorio y el fichero de identidades crecía sin límite: 626 usuarios
 * cuando se midió, ninguno borrado nunca.
 *
 * Vive en el directorio temporal del sistema y no en el repositorio a
 * propósito. Un directorio de pruebas dentro del árbol de trabajo acaba
 * apareciendo en un `git status` a deshora, o peor, en un commit.
 *
 * **El identificador es del proceso, no del reloj.** `PLAYWRIGHT_RUN_ID` lo fija
 * el arranque; si no está, se usa el PID del proceso que lee la configuración.
 * Con una marca de tiempo, la configuración y el `globalSetup` —que se evalúan
 * en momentos distintos— podrían calcular rutas distintas y limpiar un
 * directorio que no es el que se está usando.
 */
export function runStateRoot(): string {
  const id = process.env['PLAYWRIGHT_RUN_ID'] ?? String(process.pid);
  return join(tmpdir(), 'far-e2e', id);
}

/** El directorio de estado de un proyecto concreto. */
export function projectStateDir(project: string): string {
  return join(runStateRoot(), project);
}

/**
 * Deja la raíz vacía y recién creada.
 *
 * Inicialización determinista: la suite empieza siempre desde cero, sin
 * cuentas, sin listas y sin favoritos de una ejecución anterior. Que una prueba
 * pase por casualidad porque quedaba algo de la vez pasada es peor que un
 * fallo, porque no se nota.
 */
export function resetRunState(): void {
  const root = runStateRoot();
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
}

/** Borra todo lo que la ejecución haya escrito. */
export function clearRunState(): void {
  rmSync(runStateRoot(), { recursive: true, force: true });
}
