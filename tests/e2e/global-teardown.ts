import { clearRunState } from './run-state';

/**
 * Borra el estado efímero de la ejecución.
 *
 * Contrapartida de la limpieza que hace `globalSetup` al empezar. Las dos
 * existen porque una sola no basta: limpiar sólo al final deja el directorio
 * lleno cuando la suite se interrumpe con Ctrl-C, y limpiar sólo al empezar
 * deja los ficheros del último motor tirados en el temporal hasta la próxima
 * vez.
 *
 * Contra un despliegue no hay nada que borrar: no se levanta ningún servidor
 * local ni se escribe estado en disco.
 */
export default function globalTeardown(): void {
  if (process.env['E2E_BASE_URL']) return;
  clearRunState();
}
