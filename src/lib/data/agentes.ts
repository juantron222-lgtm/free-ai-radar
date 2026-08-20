import type { Tool } from '@lib/domain/tool';
import type { Capability } from '@lib/domain/taxonomy';
import { getAllTools } from './catalog';
import {
  ACCESS_FILTERS,
  FACT_FILTERS,
  capabilityFilter,
  countIn,
  has,
  ranked,
  usableFreeNow,
  type CategoryFilter,
} from './category-page';

/**
 * Agentes: qué tipo de agente estás mirando, antes que cuál es mejor.
 *
 * Esta vertical no se puede construir como las anteriores. En imagen o audio,
 * dos fichas del mismo bloque hacen el mismo trabajo y se pueden comparar. Aquí
 * no: Manus recibe un encargo y actúa; CrewAI es una biblioteca de Python con
 * la que programas el tuyo. Ponerlas en la misma lista ordenada sería contestar
 * una pregunta que nadie ha hecho.
 *
 * Lo que separa esas dos cosas es `kind`, y es lo primero que dice la tarjeta.
 */

// ---------------------------------------------------------------------------
// Qué cuenta como agente
// ---------------------------------------------------------------------------

/**
 * Comportamientos, no adjetivos.
 *
 * La palabra «agente» está en la portada de casi todo, así que no puede ser el
 * criterio. Estas once capacidades describen cosas que una fuente oficial
 * demuestra o no demuestra, y son las que dan acceso a esta página. La vieja
 * capacidad `agents` —que significaba «esto tiene que ver con agentes»— no
 * cuenta: tres fichas la llevan sin que nadie haya comprobado nada.
 */
export const AGENT_CAPABILITIES: readonly Capability[] = [
  'tool-use',
  'web-browsing',
  'computer-use',
  'code-execution',
  'terminal',
  'repository-editing',
  'multi-agent',
  'workflow-automation',
  'research',
  'memory',
  'integrations',
];

/** Los tres tipos de entrada que esta página admite por sí solos. */
const AGENT_KINDS = new Set(['agent', 'platform', 'framework']);

/**
 * Un modelo no entra nunca, ni declarándolo.
 *
 * Que un modelo pueda participar en un sistema agéntico no lo convierte en algo
 * que alguien pueda usar. Los modos agénticos los tienen los productos, y por
 * eso este veto no admite excepción editorial: es la única regla de esta página
 * que no se puede levantar desde el dato.
 */
const NUNCA = new Set(['model']);

export const agentCapabilityCount = (tool: Tool): number => countIn(tool, AGENT_CAPABILITIES);

/**
 * El catálogo de esta página.
 *
 * Dos condiciones a la vez, y la segunda es la que hace el trabajo: `kind`
 * correcto —una plataforma de alojar modelos también es `platform`— y al menos
 * un comportamiento agéntico citado por una fuente oficial.
 */
export function agentTools(): Tool[] {
  return getAllTools().filter((tool) => {
    if (NUNCA.has(tool.kind)) return false;
    if (agentCapabilityCount(tool) === 0) return false;
    /*
     * Y una puerta editorial para lo que no es agente pero tiene un modo que sí.
     *
     * Gemini es un asistente; su Deep Research es un modo con página de ayuda
     * propia y límite diario que una persona usa hoy. Dejarlo fuera por el
     * `kind` de su ficha habría sido un sesgo mío, no una regla: la auditoría
     * de huecos existía justo para encontrar eso. Lo que no puede pasar es que
     * entre solo, así que la llave es `secondaryCategories` —escrita a mano,
     * ficha por ficha— y no una capacidad que cualquiera acumula.
     */
    return AGENT_KINDS.has(tool.kind) || tool.secondaryCategories.includes('agentes');
  });
}

// ---------------------------------------------------------------------------
// Los seis tipos
// ---------------------------------------------------------------------------

export type AgentType = 'listo' | 'codigo' | 'investigacion' | 'plataforma' | 'framework';

/** Lo que la tarjeta dice antes que ninguna otra cosa. */
export const AGENT_TYPE_LABEL: Record<AgentType, string> = {
  listo: 'Listo para usar',
  codigo: 'Agente de código',
  investigacion: 'Investigación y web',
  plataforma: 'Para construir agentes',
  framework: 'Framework para programar',
};

export const AGENT_TYPE_HINT: Record<AgentType, string> = {
  listo: 'Le das un encargo y actúa.',
  codigo: 'Trabaja sobre repositorios y terminal.',
  investigacion: 'Busca, navega y sintetiza en varios pasos.',
  plataforma: 'Sirve para crear tus propios agentes, sin programar.',
  framework: 'Infraestructura: se programa.',
};

/**
 * De qué tipo es cada ficha.
 *
 * `kind` decide las dos ramas que no admiten duda: una biblioteca es un
 * framework y una plataforma es una plataforma.
 *
 * Dentro de los agentes, lo que separa «de código» de «listo para usar» es la
 * categoría de la ficha, no sus capacidades. Inferirlo de las capacidades
 * ponía a Manus entre los agentes de código porque su caja de arena tiene una
 * terminal — y Manus no toca tu repositorio: te entrega un resultado. La
 * categoría es un juicio editorial escrito en el dato, y aquí acierta donde la
 * inferencia fallaba.
 */
export function agentType(tool: Tool): AgentType {
  if (tool.kind === 'framework') return 'framework';
  if (tool.kind === 'platform') return 'plataforma';
  if (tool.categorySlug === 'codigo' || tool.secondaryCategories.includes('codigo')) return 'codigo';
  /*
   * Investigación exige `research`, no `web-browsing`.
   *
   * Tener navegador no convierte a nadie en agente de investigación: Manus
   * navega, y lo que hace es cumplir un encargo. `research` describe el bucle
   * entero —planificar, buscar, leer, ver lo que falta, volver— y lo documentan
   * cuatro fichas, tres de ellas abiertas. La primera ronda dio cero y la
   * auditoría enseñó por qué: había mirado productos alojados, que son justo
   * los que no dejan leer su documentación.
   */
  if (has(tool, 'research')) return 'investigacion';
  return 'listo';
}

export function byType(tools: readonly Tool[], type: AgentType): Tool[] {
  return ranked(
    tools.filter((t) => agentType(t) === type),
    (t) => agentCapabilityCount(t) * 10 + (usableFreeNow(t) ? 8 : 0)
  );
}

// ---------------------------------------------------------------------------
// Bloques
// ---------------------------------------------------------------------------

/**
 * Lo que se puede probar hoy sin pagar ni instalar.
 *
 * Mismo listón que en las demás verticales, con una diferencia que aquí pesa:
 * lo que se agota no son mensajes, son ejecuciones, y una sola tarea puede
 * consumir muchas. Por eso una renovación diaria vale más que una cifra
 * mensual grande.
 */
export function freeNow(tools: readonly Tool[]): Tool[] {
  const eligible = tools.filter((t) => usableFreeNow(t) && agentCapabilityCount(t) > 0);

  const RENEWAL: Record<string, number> = { daily: 55, weekly: 48, monthly: 44 };

  return ranked(eligible, (t) => {
    const { creditReset, creditsAmount } = t.freePlan;
    const renewal = RENEWAL[creditReset];

    let score = 0;
    if (t.freeModel === 'free_real') score += 60;
    else if (renewal) score += renewal - (creditsAmount ? 0 : 10);
    else if (t.freeModel === 'freemium') score += 35;
    else score += 20;

    if (t.freePlan.requiresCreditCard === 'no') score += 8;
    if (t.startEffort === 'instant' || t.startEffort === 'signup') score += 10;
    score += agentCapabilityCount(t);
    return score;
  });
}

/** Lo que corre en tu equipo: sin cuotas, con la factura en tu propia clave. */
export function local(tools: readonly Tool[]): Tool[] {
  return ranked(
    tools.filter((t) => t.hosting === 'local' || t.hosting === 'hybrid'),
    (t) => (t.openSource === 'yes' ? 20 : 0) + agentCapabilityCount(t) * 5
  );
}

/**
 * Cuántas fichas hacen falta para levantar un bloque.
 *
 * Misma regla editorial que en el resto del catálogo: por debajo de tres, la
 * capacidad sigue estando disponible como filtro pero no se le pone título.
 */
export const MIN_BLOQUE = 3;

// ---------------------------------------------------------------------------
// Filtros de Agentes
// ---------------------------------------------------------------------------

/**
 * El tipo, como filtro y no sólo como etiqueta.
 *
 * Es lo primero que alguien quiere acotar aquí —«enséñame sólo lo que puedo
 * usar sin programar»— y funciona aunque el tipo no llegue a tener bloque.
 * Si un tipo tiene una sola ficha, `decideFilters` lo esconderá y dirá por qué:
 * es la misma regla, aplicada a otra cosa.
 */
function typeFilter(id: string, type: AgentType): CategoryFilter {
  return {
    id,
    label: AGENT_TYPE_LABEL[type],
    hint: AGENT_TYPE_HINT[type],
    matches: (t) => agentType(t) === type,
  };
}

export const CANDIDATE_FILTERS: readonly CategoryFilter[] = [
  ...ACCESS_FILTERS,
  typeFilter('t-listo', 'listo'),
  typeFilter('t-codigo', 'codigo'),
  typeFilter('t-investigacion', 'investigacion'),
  typeFilter('t-plataforma', 'plataforma'),
  typeFilter('t-framework', 'framework'),
  capabilityFilter('terminal', 'Terminal', 'Ejecuta órdenes del sistema.', 'terminal'),
  capabilityFilter('repos', 'Edita repositorios', 'Modifica ficheros de un proyecto.', 'repository-editing'),
  capabilityFilter('ejecuta', 'Ejecuta código', 'Corre lo que escribe y comprueba el resultado.', 'code-execution'),
  capabilityFilter('web', 'Navega por la web', 'Busca y lee páginas por su cuenta.', 'web-browsing'),
  capabilityFilter('ordenador', 'Maneja el ordenador', 'Controla la interfaz de un equipo.', 'computer-use'),
  capabilityFilter('herramientas', 'Usa herramientas', 'Llama a herramientas externas, MCP incluido.', 'tool-use'),
  capabilityFilter('subagentes', 'Reparte en subagentes', 'Delega partes del trabajo en otros agentes.', 'multi-agent'),
  capabilityFilter('flujos', 'Automatiza flujos', 'Encadena pasos y desencadenantes.', 'workflow-automation'),
  capabilityFilter('conecta', 'Se conecta con otras aplicaciones', 'Actúa sobre servicios de terceros.', 'integrations'),
  capabilityFilter('memoria', 'Memoria', 'Conserva contexto entre sesiones.', 'memory'),
  capabilityFilter('investiga', 'Investigación multietapa', 'Busca, lee y sintetiza en varios pasos.', 'research'),
  /*
   * De los hechos comunes, sólo los dos que aquí significan algo.
   *
   * «Sin marca de agua» no se pregunta de un agente que edita un repositorio:
   * la respuesta es «no» en todos, y un filtro que selecciona el catálogo
   * entero ocupa sitio sin decidir nada.
   */
  ...FACT_FILTERS.filter((f) => f.id !== 'sin-marca'),
];
