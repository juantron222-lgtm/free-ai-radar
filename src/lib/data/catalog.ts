import rawTools from '@/data/generated/tools.json';
import { ToolRecord, hydrateTool, type Tool } from '@lib/domain/tool';
import { CATEGORIES, getCategory, type CategoryDef } from '@lib/domain/taxonomy';
import { cifrasDelCatalogo } from './cifras';
import { parecidas } from './afinidad';

/**
 * The catalogue.
 *
 * Editorial content is read at build time from the committed, deterministic
 * dataset in `src/data/generated/tools.json`. That keeps every public page
 * prerenderable and instant, and means the site keeps working if Supabase is
 * unreachable.
 *
 * The admin panel writes to Postgres; a publish step regenerates this file (see
 * `docs/architecture.md` § "Ciclo de publicación"). Reads never hit the database
 * on the public site.
 */

class CatalogError extends Error {}

function loadTools(): Tool[] {
  const parsed = ToolRecord.array().safeParse(rawTools);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 10)
      .map((i) => `  · ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new CatalogError(
      `El catálogo generado no cumple el esquema. Ejecuta "npm run data:migrate".\n${issues}`
    );
  }

  const known = new Set(parsed.data.map((t) => t.slug));
  const tools = parsed.data
    .filter((t) => t.status === 'published')
    .map((record) => {
      // A dangling alternative would render a 404 link. Fail loudly at build.
      for (const alt of record.alternatives) {
        if (!known.has(alt)) {
          throw new CatalogError(
            `"${record.slug}" apunta a la alternativa inexistente "${alt}".`
          );
        }
      }
      if (!getCategory(record.categorySlug)) {
        throw new CatalogError(
          `"${record.slug}" usa la categoría desconocida "${record.categorySlug}".`
        );
      }
      return hydrateTool(record);
    });

  /*
   * Orden alfabético, que es el único neutral.
   *
   * Aquí estaba `b.scoreTotal - a.scoreTotal`, y de ahí salía todo: las seis
   * destacadas de la portada, el orden por defecto del explorador y el de
   * cualquier lista que no reordenara. La nota sobre 100 se había quitado de
   * la vista hacía semanas y seguía decidiendo qué se ve primero, que es la
   * parte que de verdad importaba.
   *
   * Lo alfabético no insinúa nada. Cada página que quiera un orden con
   * criterio lo aplica y lo explica: las verticales tienen el suyo, y la
   * portada ahora enseña lo verificado hace menos.
   */
  return tools.sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

const TOOLS: readonly Tool[] = Object.freeze(loadTools());
const BY_SLUG = new Map(TOOLS.map((t) => [t.slug, t]));

export function getAllTools(): readonly Tool[] {
  return TOOLS;
}

export function getTool(slug: string): Tool | undefined {
  return BY_SLUG.get(slug);
}

export function getToolsByCategory(categorySlug: string): Tool[] {
  return TOOLS.filter(
    (t) => t.categorySlug === categorySlug || t.secondaryCategories.includes(categorySlug)
  );
}

export interface CategoryWithCount extends CategoryDef {
  count: number;
  topScore: number;
}

/** Only categories that actually have published tools become pages. */
export function getPopulatedCategories(): CategoryWithCount[] {
  return CATEGORIES.map((c) => {
    const tools = getToolsByCategory(c.slug);
    return { ...c, count: tools.length, topScore: tools[0]?.scoreTotal ?? 0 };
  })
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'));
}

/**
 * Alternativas a una herramienta: las elegidas a mano primero, después las que
 * hacen la misma tarea.
 *
 * El relleno era por categoría y forma de acceso, y a ChatGPT le proponía
 * Hugging Face Spaces y LM Studio. Ahora sale de `parecidas()`, que exige
 * compartir una tarea de verdad (ver `afinidad.ts`). Si no hay ninguna que
 * encaje en la misma forma de uso, se prueba sin esa exigencia —Whisper es
 * local y lo que transcribe como él vive en la nube—; y si tampoco, el bloque
 * no sale: una alternativa que no lo es resta, no suma.
 */
export function getAlternativesFor(tool: Tool, limit = 6): Tool[] {
  const explicit = tool.alternatives
    .filter((slug) => slug !== tool.slug)
    .map((slug) => BY_SLUG.get(slug))
    .filter((candidate): candidate is Tool => candidate !== undefined);

  if (explicit.length >= limit) return explicit.slice(0, limit);

  const excluir = explicit.map((t) => t.slug);
  let relleno = parecidas([tool], TOOLS, limit - explicit.length, excluir);
  if (explicit.length + relleno.length === 0) relleno = parecidas([tool], TOOLS, limit, excluir, true);

  return [...explicit, ...relleno];
}

/** Tools whose free plan we have not re-checked recently. Drives the admin queue. */
export function getStaleTools(): Tool[] {
  return TOOLS.filter((t) => t.freshness !== 'fresh').sort(
    (a, b) => b.daysSinceVerified - a.daysSinceVerified
  );
}

export function getRecentlyVerified(limit = 8): Tool[] {
  return [...TOOLS]
    .sort((a, b) => b.lastVerifiedAt.localeCompare(a.lastVerifiedAt))
    .slice(0, limit);
}

export function getRecentlyAdded(limit = 8): Tool[] {
  return [...TOOLS].sort((a, b) => b.detectedAt.localeCompare(a.detectedAt)).slice(0, limit);
}

export interface CatalogChange {
  tool: Tool;
  change: Tool['changelog'][number];
}

/** Flattened, date-sorted changelog across the whole catalogue. */
export function getCatalogChanges(limit = 30): CatalogChange[] {
  return TOOLS.flatMap((tool) => tool.changelog.map((change) => ({ tool, change })))
    .sort((a, b) => b.change.date.localeCompare(a.change.date))
    .slice(0, limit);
}

export interface CatalogStats {
  total: number;
  freeReal: number;
  noCard: number;
  openSource: number;
  local: number;
  commercialUse: number;
  categories: number;
  lastVerifiedAt: string;
}

export function getCatalogStats(): CatalogStats {
  const lastVerified = TOOLS.reduce(
    (acc, t) => (t.lastVerifiedAt > acc ? t.lastVerifiedAt : acc),
    '0000-00-00'
  );
  // Las tres cifras que se publican salen del mismo cálculo que los filtros.
  const cifras = cifrasDelCatalogo(TOOLS);
  return {
    total: TOOLS.length,
    freeReal: TOOLS.filter((t) => t.freeModel === 'free_real' || t.freeModel === 'open_source')
      .length,
    noCard: cifras.sinTarjeta.cumplen,
    openSource: cifras.openSource,
    local: TOOLS.filter((t) => t.hosting !== 'cloud').length,
    commercialUse: cifras.usoComercial.cumplen,
    categories: getPopulatedCategories().length,
    lastVerifiedAt: lastVerified,
  };
}
