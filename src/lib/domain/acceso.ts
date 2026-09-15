import type { Tool } from './tool';

/**
 * Si una herramienta tiene un acceso gratuito que se pueda llamar así.
 *
 * «IA gratis sin marca de agua» incluía Claude Code, que no tiene plan
 * gratuito: su dato de marca de agua es cierto, pero la promesa del título no.
 * Y «IA gratis para creadores» incluía una prueba. Una prueba, una demo, un
 * producto sólo de pago o uno cuyo acceso no conocemos no son «gratis».
 *
 * Vive en el dominio porque lo usan las colecciones, las alternativas y el
 * comparador, y ninguno de los tres debe importar a los otros.
 */
const SIN_ACCESO_GRATUITO: ReadonlySet<Tool['freeModel']> = new Set(['paid_only', 'unknown', 'trial', 'demo']);

export const tieneAccesoGratuito = (tool: Pick<Tool, 'freeModel'>): boolean =>
  !SIN_ACCESO_GRATUITO.has(tool.freeModel);
