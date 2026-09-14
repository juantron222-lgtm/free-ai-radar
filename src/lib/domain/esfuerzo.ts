import type { Tool } from './tool';
import { START_EFFORT_LABEL, START_EFFORT_MEANING } from './taxonomy';

/**
 * Lo que una ficha puede prometer sobre empezar a usar una herramienta.
 *
 * `startEffort` describe cuánto cuesta llegar al primer resultado y
 * `requiresSignup` dice si hace falta cuenta, y las dos cosas se pintaban por
 * separado. Así ChatGPT y Claude enseñaban «Abres y generas» en el panel del
 * veredicto y «Exige crear cuenta» dos párrafos más abajo, en la misma
 * pantalla: la etiqueta de esfuerzo prometía justo lo que el registro
 * obligatorio desmiente.
 *
 * Por eso ninguna superficie lee `START_EFFORT_LABEL[tool.startEffort]`
 * directamente: pasan todas por aquí. La etiqueta de esfuerzo mínimo sólo sale
 * con el registro confirmado como `no`. Si pide cuenta, se dice. Si no lo
 * sabemos, se dice lo único que sí consta —que no hay que instalar nada— sin
 * prometer que tampoco haga falta cuenta.
 */
export interface EsfuerzoVisible {
  label: string;
  meaning: string;
}

export const SIN_INSTALAR: EsfuerzoVisible = {
  label: 'Sin instalar',
  meaning: 'Se usa en el navegador sin instalar nada. Si pide cuenta, no lo hemos confirmado.',
};

export function esfuerzoDe(tool: Pick<Tool, 'startEffort' | 'freePlan'>): EsfuerzoVisible {
  if (tool.startEffort === 'instant') {
    if (tool.freePlan.requiresSignup === 'yes') {
      return { label: START_EFFORT_LABEL.signup, meaning: START_EFFORT_MEANING.signup };
    }
    if (tool.freePlan.requiresSignup !== 'no') return SIN_INSTALAR;
  }
  return { label: START_EFFORT_LABEL[tool.startEffort], meaning: START_EFFORT_MEANING[tool.startEffort] };
}
