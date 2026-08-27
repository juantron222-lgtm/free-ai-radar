import type { Tool } from '@lib/domain/tool';
import type { Capability } from '@lib/domain/taxonomy';
import { getToolsByCategory } from './catalog';
import {
  ACCESS_FILTERS,
  FACT_FILTERS,
  capabilityFilter,
  countIn,
  ranked,
  usableFreeNow,
  localControl as localControlImpl,
  type CategoryFilter,
} from './category-page';

/**
 * Código: qué clase de producto es cada cosa, antes que cuál es mejor.
 *
 * La categoría tenía doce fichas y las doce eran `kind: 'agent'`, así que en
 * la práctica era «agentes que programan». Dentro estaban Cursor —un editor—,
 * GitHub Copilot —un autocompletado—, Bolt —que construye una aplicación desde
 * una descripción— y Aider, que vive en la terminal. Las cuatro se anuncian
 * con las mismas dos palabras.
 *
 * La separación que más decide es la última: **crear una aplicación desde una
 * idea no es trabajar sobre un repositorio que ya existe**. Son dos encargos
 * distintos y quien busca uno no quiere el otro.
 */

export type CodeType = 'ide' | 'copilot' | 'agent' | 'cli' | 'review' | 'app-builder' | 'platform';

export const CODE_TYPE_LABEL: Record<CodeType, string> = {
  ide: 'Editor con IA',
  copilot: 'Copiloto',
  agent: 'Agente de código',
  cli: 'Terminal',
  review: 'Revisión de código',
  'app-builder': 'Construye aplicaciones',
  platform: 'Plataforma',
};

export const CODE_TYPE_HINT: Record<CodeType, string> = {
  ide: 'Sustituye a tu editor.',
  copilot: 'Sugiere mientras escribes, dentro de tu editor.',
  agent: 'Abre tu repositorio y lo modifica.',
  cli: 'Se usa desde la terminal.',
  review: 'Comenta cambios y pull requests.',
  'app-builder': 'Parte de una idea y devuelve algo desplegable.',
  platform: 'Infraestructura para desarrolladores.',
};

/** Lo que una tarjeta de esta vertical puede enseñar, en orden. */
export const CODE_CAPABILITIES: readonly Capability[] = [
  'repository-editing',
  'code-generation',
  'terminal',
  'code-execution',
  'tool-use',
  'web-browsing',
  'multi-agent',
  'integrations',
  'model-download',
  'api',
];

export function codeTools(): Tool[] {
  const porSlug = new Map<string, Tool>();
  for (const tool of getToolsByCategory('codigo')) porSlug.set(tool.slug, tool);
  return [...porSlug.values()];
}

export const codeCapabilityCount = (tool: Tool): number => countIn(tool, CODE_CAPABILITIES);

/**
 * De qué tipo es cada ficha.
 *
 * Se lee, no se infiere. Cursor y Cline editan repositorios y usan la terminal
 * exactamente igual, así que las capacidades no pueden distinguirlas: lo que
 * las separa es qué son, y eso está escrito a mano en `productType`.
 */
export const codeType = (tool: Tool): CodeType | undefined => tool.productType as CodeType | undefined;

export function byType(tools: readonly Tool[], type: CodeType): Tool[] {
  return ranked(
    tools.filter((t) => codeType(t) === type),
    (t) => codeCapabilityCount(t) * 10 + (usableFreeNow(t) ? 8 : 0)
  );
}

// ---------------------------------------------------------------------------
// Bloques
// ---------------------------------------------------------------------------

export const MIN_BLOQUE = 3;

/**
 * Lo que se puede usar hoy sin pagar ni instalar.
 *
 * Con la advertencia que esta vertical enseña mejor que ninguna: lo que un
 * plan gratuito incluye puede no ser el producto que ibas buscando. Copilot
 * Free trae el autocompletado y deja fuera el agente, y eso está en los
 * límites de su tarjeta, no en una nota al pie.
 */
export function freeNow(tools: readonly Tool[]): Tool[] {
  const eligible = tools.filter((t) => usableFreeNow(t) && codeCapabilityCount(t) > 0);

  /*
   * `intraday` pesa más que `daily` porque rinde más: una cuota que vuelve
   * cada pocas horas se puede usar para trabajar una tarde entera y una
   * diaria no.
   */
  const RENEWAL: Record<string, number> = { intraday: 58, daily: 55, weekly: 48, monthly: 44 };

  return ranked(eligible, (t) => {
    const { creditReset, creditsAmount } = t.freePlan;
    const renewal = RENEWAL[creditReset];

    let score = 0;
    if (t.freeModel === 'free_real') score += 60;
    else if (renewal) score += renewal - (creditsAmount ? 0 : 12);
    else if (t.freeModel === 'freemium') score += 35;
    else score += 20;

    if (t.freePlan.requiresCreditCard === 'no') score += 8;
    if (t.startEffort === 'signup') score += 6;
    score += codeCapabilityCount(t);
    return score;
  });
}

/** Lo que arranca sin instalar nada y sin configurar un entorno. */
export const facilesParaEmpezar = (tools: readonly Tool[]): Tool[] =>
  ranked(
    tools.filter((t) => t.startEffort === 'instant' || t.startEffort === 'signup'),
    (t) => codeCapabilityCount(t) * 10 + (usableFreeNow(t) ? 8 : 0)
  );

export function localControl(tools: readonly Tool[]): { install: Tool[]; technical: Tool[] } {
  return localControlImpl(tools, CODE_CAPABILITIES);
}

/** Lo abierto de verdad, que aquí además se ejecuta en tu equipo. */
export const abiertoYLocal = (tools: readonly Tool[]): Tool[] =>
  ranked(
    tools.filter((t) => t.openSource === 'yes' && t.hosting !== 'cloud'),
    (t) => codeCapabilityCount(t) * 10
  );

// ---------------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------------

const typeFilter = (type: CodeType): CategoryFilter => ({
  id: `tipo-${type}`,
  label: CODE_TYPE_LABEL[type],
  hint: CODE_TYPE_HINT[type],
  matches: (tool: Tool) => codeType(tool) === type,
});

export const CANDIDATE_FILTERS: readonly CategoryFilter[] = [
  typeFilter('agent'),
  typeFilter('app-builder'),
  typeFilter('cli'),
  typeFilter('copilot'),
  typeFilter('ide'),
  typeFilter('review'),
  ...ACCESS_FILTERS,
  capabilityFilter('repo', 'Edita tu repositorio', 'Lee y modifica los ficheros de tu proyecto.', 'repository-editing'),
  capabilityFilter('terminal', 'Usa la terminal', 'Ejecuta órdenes en una consola.', 'terminal'),
  capabilityFilter('ejecuta', 'Ejecuta código', 'Corre lo que escribe y comprueba el resultado.', 'code-execution'),
  capabilityFilter('genera', 'Genera código', 'Escribe código desde una descripción.', 'code-generation'),
  capabilityFilter('navega', 'Navega por la web', 'Consulta páginas durante la tarea.', 'web-browsing'),
  capabilityFilter('integra', 'Se conecta con otras aplicaciones', 'Integraciones documentadas.', 'integrations'),
  ...FACT_FILTERS,
];
