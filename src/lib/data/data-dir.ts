import { join, resolve } from 'node:path';

/**
 * Dónde guarda el modo local su estado.
 *
 * En desarrollo hay tres almacenes en ficheros JSON —identidades, datos de
 * usuario y bandeja de entrada— y los tres vivían bajo `.data/` calculado por
 * separado en cada módulo. Tres copias de «dónde vive el estado» son tres
 * copias que se separan, y ésta es la quinta vez que este proyecto se topa con
 * esa forma: antes fueron la lectura del entorno, el arranque de esquema en
 * PGlite, los parámetros de conexión y la paleta de temas.
 *
 * `FAR_DATA_DIR` existe para las pruebas de extremo a extremo, no para
 * producción. La suite levanta un servidor por proyecto de Playwright y le da a
 * cada uno su propio directorio, de modo que las cuentas que crea Firefox no
 * las vea Chromium. Producción nunca define la variable, y el almacén local se
 * niega a arrancar cuando `import.meta.env.PROD` es cierto, así que esto no
 * puede convertirse en un interruptor de producción por descuido.
 *
 * Es una ruta absoluta a propósito: el servidor de desarrollo y los scripts no
 * siempre comparten directorio de trabajo, y una ruta relativa haría que dos
 * procesos creyeran hablar del mismo sitio sin hacerlo.
 */
export const DATA_DIR: string = process.env['FAR_DATA_DIR']
  ? resolve(process.env['FAR_DATA_DIR'])
  : join(process.cwd(), '.data');

/** Un fichero dentro del almacén local. */
export function dataFile(name: string): string {
  return join(DATA_DIR, name);
}
