import type { FreeModel, Hosting, Platform, StartEffort } from '@lib/domain/taxonomy';
import type { Openness, TriState } from '@lib/domain/primitives';
import type { Freshness } from '@lib/domain/scoring';

/**
 * The minimum a record needs to be filterable.
 *
 * `Tool` satisfies it structurally, and so does the compact index the browser
 * receives — which is how server-rendered and client-side filtering stay
 * guaranteed identical without shipping the whole catalogue to the client.
 */
export interface FilterableTool {
  slug: string;
  name: string;
  categorySlug: string;
  secondaryCategories: string[];
  freeModel: FreeModel;
  platforms: readonly Platform[];
  hosting: Hosting;
  startEffort: StartEffort;
  openSource: Openness;
  freshness: Freshness;
  detectedAt: string;
  lastVerifiedAt: string;
  /** Sólo lo lee el orden por defecto, para mandar al final lo retirado. */
  verification: 'verified' | 'partially_verified' | 'pending_review' | 'outdated' | 'discontinued';
  freePlan: {
    requiresCreditCard: TriState;
    requiresSignup: TriState;
    hasWatermark: TriState;
    commercialUse: TriState;
    /** `one_off` no es acceso gratuito recurrente: el orden lo separa. */
    creditReset?: string;
  };
}

/**
 * Filter state.
 *
 * The single source of truth is the URL query string. Every filter is
 * combinable, every combination is shareable, and the same parser runs on the
 * server (for prerendered/SSR pages) and in the browser (for instant
 * re-filtering). One implementation, no divergence.
 */
export interface FilterState {
  q: string;
  categories: string[];
  freeModels: FreeModel[];
  platforms: Platform[];
  hosting: Hosting[];
  /**
   * Cuánto cuesta empezar.
   *
   * Antes filtraba por `skillLevel`, que describe al lector y no a la
   * herramienta. Con él se podía marcar «principiante» y recibir a la vez una
   * web donde escribes y generas y una aplicación Python que necesita GPU: dos
   * etiquetas defendibles por separado que juntas engañan. `startEffort` mide
   * el trabajo que exige la herramienta, que es lo que este filtro pretendía
   * preguntar desde el principio.
   */
  effort: StartEffort[];
  /** Hard requirements — each one is an AND. */
  noCard: boolean;
  noSignup: boolean;
  noWatermark: boolean;
  commercial: boolean;
  openSource: boolean;
  verifiedRecently: boolean;
  /**
   * «Enséñame sólo aquéllas cuya marca de agua hemos comprobado.»
   *
   * No es un filtro negativo y por eso existe. El dato está confirmado en una
   * de las treinta y cinco fichas donde la pregunta aplica: ofrecer «sin marca
   * de agua» ahí devuelve una ficha y esconde treinta y cuatro por un motivo
   * que es nuestro, no suyo. Esto contesta lo único que de verdad sabemos:
   * dónde hemos mirado. Deja pasar tanto el sí como el no; lo que no deja
   * pasar es lo desconocido.
   */
  watermarkKnown: boolean;
  sort: SortKey;
}

export type SortKey = 'useful' | 'recent' | 'verified' | 'name';

/**
 * El orden con el que se ve el catálogo la primera vez.
 *
 * Era «Revisadas hace menos», que es un orden de mantenimiento: le dice al
 * equipo qué tocó ayer, no al lector qué le sirve. Tras la última revisión el
 * catálogo abría con un modelo retirado, otro sin comprobar y una herramienta
 * sin plan gratuito — la peor primera fila posible para una web que se llama
 * «qué IA es gratis de verdad».
 */
export const DEFAULT_SORT: SortKey = 'useful';

/*
 * Cuatro formas de ordenar, y ninguna insinúa una nota.
 *
 * Aquí estaba «Mejor puntuación» como opción por defecto, junto a un filtro de
 * puntuación mínima. La nota sobre 100 se había retirado de la vista y seguía
 * siendo el orden con el que todo el mundo veía el catálogo por primera vez.
 *
 * «Gratis y fáciles de empezar primero» tampoco es una nota: son tres hechos
 * de la ficha en orden —qué da gratis, cuánto cuesta empezar y cuántas
 * condiciones están confirmadas— y la etiqueta nombra los dos que deciden.
 * Ver `nivelDeAcceso` y `sortTools`.
 */
export const SORT_OPTIONS: ReadonlyArray<{ key: SortKey; label: string }> = [
  { key: 'useful', label: 'Gratis y fáciles de empezar primero' },
  { key: 'verified', label: 'Revisadas hace menos' },
  { key: 'recent', label: 'Añadidas hace menos' },
  { key: 'name', label: 'Alfabético' },
];

/**
 * Cuánto acceso gratuito da, en cinco escalones. Menos es antes.
 *
 *   0  Gratis de forma continuada: plan gratuito, créditos que vuelven,
 *      código abierto o ejecución en tu equipo.
 *   1  Para probar: créditos que no vuelven, prueba temporal o demo.
 *   2  Todavía no sabemos qué da gratis.
 *   3  Sin plan gratuito.
 *   4  Retirada por su fabricante.
 *
 * Cada escalón sale de un campo de la ficha, no de un juicio: por eso el orden
 * se puede explicar en una frase y comprobar abriendo cualquier ficha.
 */
export function nivelDeAcceso(tool: FilterableTool): number {
  if (tool.verification === 'discontinued') return 4;
  switch (tool.freeModel) {
    case 'free_real':
    case 'open_source':
    case 'local':
    case 'freemium':
      return 0;
    case 'credits':
      return tool.freePlan.creditReset === 'one_off' ? 1 : 0;
    case 'trial':
    case 'demo':
      return 1;
    case 'paid_only':
      return 3;
    default:
      return 2;
  }
}

/**
 * Cuánto cuesta empezar, en el orden en que se sube la cuesta.
 *
 * Sin esto, «gratis» metía en el mismo escalón a ChatGPT y a un modelo de
 * 1,6 billones de parámetros que exige un centro de datos: los dos son
 * gratuitos, y sólo uno lo puede usar quien llega. Con el orden por
 * confirmaciones, la primera fila del catálogo eran siete modelos de pesos
 * abiertos. Ahora primero va lo que se abre y se usa.
 */
const ESFUERZO: Record<string, number> = { instant: 0, signup: 1, install: 2, technical: 3 };

/** Cuántas de las tres condiciones que deciden tenemos confirmadas. */
function hechosConfirmados(tool: FilterableTool): number {
  const { requiresCreditCard, requiresSignup, commercialUse } = tool.freePlan;
  return [requiresCreditCard, requiresSignup, commercialUse].filter((v) => v !== 'unverified').length;
}

export const EMPTY_FILTERS: FilterState = {
  q: '',
  categories: [],
  freeModels: [],
  platforms: [],
  hosting: [],
  effort: [],
  noCard: false,
  noSignup: false,
  noWatermark: false,
  commercial: false,
  openSource: false,
  verifiedRecently: false,
  watermarkKnown: false,
  sort: DEFAULT_SORT,
};

const LIST_SEPARATOR = ',';

function readList(params: URLSearchParams, key: string): string[] {
  const raw = params.get(key);
  if (!raw) return [];
  return [...new Set(raw.split(LIST_SEPARATOR).map((s) => s.trim()).filter(Boolean))];
}

function readFlag(params: URLSearchParams, key: string): boolean {
  return params.get(key) === '1';
}

export function parseFilters(input: URLSearchParams | string): FilterState {
  const params = typeof input === 'string' ? new URLSearchParams(input) : input;
  const sortRaw = params.get('sort');
  const sort = SORT_OPTIONS.some((o) => o.key === sortRaw) ? (sortRaw as SortKey) : DEFAULT_SORT;

  return {
    q: (params.get('q') ?? '').trim().slice(0, 100),
    categories: readList(params, 'cat'),
    freeModels: readList(params, 'free') as FreeModel[],
    platforms: readList(params, 'plat') as Platform[],
    hosting: readList(params, 'host') as Hosting[],
    effort: readList(params, 'effort') as StartEffort[],
    noCard: readFlag(params, 'nocard'),
    noSignup: readFlag(params, 'nosignup'),
    noWatermark: readFlag(params, 'nowm'),
    commercial: readFlag(params, 'comm'),
    openSource: readFlag(params, 'oss'),
    verifiedRecently: readFlag(params, 'fresh'),
    watermarkKnown: readFlag(params, 'wmknown'),
    sort,
  };
}

/** Serialises back to a query string. Defaults are omitted to keep URLs short. */
export function serializeFilters(state: FilterState): string {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.categories.length) params.set('cat', state.categories.join(LIST_SEPARATOR));
  if (state.freeModels.length) params.set('free', state.freeModels.join(LIST_SEPARATOR));
  if (state.platforms.length) params.set('plat', state.platforms.join(LIST_SEPARATOR));
  if (state.hosting.length) params.set('host', state.hosting.join(LIST_SEPARATOR));
  if (state.effort.length) params.set('effort', state.effort.join(LIST_SEPARATOR));
  if (state.noCard) params.set('nocard', '1');
  if (state.noSignup) params.set('nosignup', '1');
  if (state.noWatermark) params.set('nowm', '1');
  if (state.commercial) params.set('comm', '1');
  if (state.openSource) params.set('oss', '1');
  if (state.verifiedRecently) params.set('fresh', '1');
  if (state.watermarkKnown) params.set('wmknown', '1');
  if (state.sort !== DEFAULT_SORT) params.set('sort', state.sort);
  return params.toString();
}

export function isDefaultFilters(state: FilterState): boolean {
  return serializeFilters(state) === '';
}

export function countActiveFilters(state: FilterState): number {
  return (
    (state.q ? 1 : 0) +
    state.categories.length +
    state.freeModels.length +
    state.platforms.length +
    state.hosting.length +
    state.effort.length +
    (state.noCard ? 1 : 0) +
    (state.noSignup ? 1 : 0) +
    (state.noWatermark ? 1 : 0) +
    (state.commercial ? 1 : 0) +
    (state.openSource ? 1 : 0) +
    (state.verifiedRecently ? 1 : 0) +
    (state.watermarkKnown ? 1 : 0) +
    0
  );
}

/**
 * Applies every active filter as an AND, then sorts.
 *
 * Note on tri-state fields: a hard requirement like "sin tarjeta" only matches
 * `'no'`. An unverified field never satisfies a requirement — we will not pass
 * off an unknown as a guarantee.
 */
export function applyFilters<T extends FilterableTool>(
  tools: readonly T[],
  state: FilterState
): T[] {
  const result = tools.filter((tool) => {
    if (state.categories.length) {
      const inCategory =
        state.categories.includes(tool.categorySlug) ||
        tool.secondaryCategories.some((c) => state.categories.includes(c));
      if (!inCategory) return false;
    }
    if (state.freeModels.length && !state.freeModels.includes(tool.freeModel)) return false;
    if (
      state.platforms.length &&
      !state.platforms.some((p) => (tool.platforms as readonly string[]).includes(p))
    ) {
      return false;
    }
    if (state.hosting.length && !state.hosting.includes(tool.hosting)) return false;
    if (state.effort.length && !state.effort.includes(tool.startEffort)) return false;

    if (state.noCard && tool.freePlan.requiresCreditCard !== 'no') return false;
    if (state.noSignup && tool.freePlan.requiresSignup !== 'no') return false;
    if (state.noWatermark && tool.freePlan.hasWatermark !== 'no') return false;
    if (state.commercial && tool.freePlan.commercialUse !== 'yes') return false;
    if (state.openSource && tool.openSource !== 'yes') return false;
    if (state.verifiedRecently && tool.freshness !== 'fresh') return false;
    /*
     * Confirmado quiere decir confirmado en cualquiera de los dos sentidos.
     * Lo desconocido sigue fuera, incluido lo que sabemos que el fabricante no
     * publica: saber que alguien calla no es saber la respuesta.
     */
    if (state.watermarkKnown && tool.freePlan.hasWatermark === 'unverified') return false;

    return true;
  });

  return sortTools(result, state.sort);
}

export function sortTools<T extends FilterableTool>(tools: T[], sort: SortKey): T[] {
  const sorted = [...tools];
  switch (sort) {
    case 'name':
      return sorted.sort((a, b) => a.name.localeCompare(b.name, 'es'));
    case 'recent':
      return sorted.sort(
        (a, b) => b.detectedAt.localeCompare(a.detectedAt) || a.name.localeCompare(b.name, 'es')
      );
    case 'verified':
      return sorted.sort(
        (a, b) => b.lastVerifiedAt.localeCompare(a.lastVerifiedAt) || a.name.localeCompare(b.name, 'es')
      );
    case 'useful':
    default:
      /*
       * Primero cuánto dan gratis; luego cuánto cuesta empezar; dentro de eso,
       * cuánto sabemos; y sólo después, lo reciente. Una herramienta gratuita
       * con sus tres condiciones confirmadas va delante de otra igual de
       * gratuita con dos huecos, porque a la primera se puede ir sin sorpresas.
       */
      return sorted.sort(
        (a, b) =>
          nivelDeAcceso(a) - nivelDeAcceso(b) ||
          (ESFUERZO[a.startEffort] ?? 4) - (ESFUERZO[b.startEffort] ?? 4) ||
          hechosConfirmados(b) - hechosConfirmados(a) ||
          b.lastVerifiedAt.localeCompare(a.lastVerifiedAt) ||
          a.name.localeCompare(b.name, 'es')
      );
  }
}

/**
 * Describes the current filter set in Spanish, for the results heading and the
 * `<title>` of a filtered view.
 */
export function describeFilters(
  state: FilterState,
  categoryName: (slug: string) => string
): string {
  const parts: string[] = [];
  if (state.categories.length) parts.push(state.categories.map(categoryName).join(' y '));
  if (state.openSource) parts.push('open source');
  if (state.hosting.includes('local')) parts.push('que funcionan en local');
  if (state.noCard) parts.push('sin tarjeta');
  if (state.noSignup) parts.push('sin registro');
  if (state.noWatermark) parts.push('sin marca de agua');
  if (state.commercial) parts.push('con uso comercial');
  if (state.watermarkKnown) parts.push('con la marca de agua comprobada');
  if (!parts.length) return 'Todas las herramientas';
  return `Herramientas ${parts.join(', ')}`;
}
