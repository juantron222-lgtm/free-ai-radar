import type { Tool } from '@lib/domain/tool';
import type { FilterableTool } from './filters';
import { hechosDe, normalize, type SearchDoc } from './index';
import { CAPABILITY_LABEL, PRODUCT_TYPE_LABEL } from '@lib/domain/taxonomy';
import { TOOL_KIND_LABEL } from '@lib/domain/tool';

/**
 * The payload the browser receives for instant filtering and search.
 *
 * Kept deliberately small: only what `applyFilters` and `search` need, with
 * the searchable text pre-normalised so the client does no accent-stripping
 * work at keystroke time.
 *
 * Las capacidades viajan además en crudo (`caps`) porque los predicados de
 * intención preguntan por hechos, no por texto: «gratis sin tarjeta» se decide
 * mirando `requiresCreditCard === 'no'`, no buscando la palabra «tarjeta».
 */
export interface ClientIndexEntry extends FilterableTool {
  /** Pre-normalised, weight-ordered search fields. */
  f: [name: string, alias: string, intent: string, product: string, vertical: string, text: string];
  /** Capacidades verificadas, en token. Sólo las leen los predicados. */
  caps: readonly string[];
  /** Tipo de producto, en token. */
  pt: string | null;
  /** Cuándo vuelven los créditos: `one_off` no es gratis recurrente. */
  cr: string | null;
  /**
   * El nombre de la vertical **como se escribe**, con acentos y mayúsculas.
   *
   * El autocompletado enseñaba `entry.f[4]`, que es texto de índice: sin
   * acentos y en minúsculas. Debajo de «Suno AI» ponía «musica ia» en vez de
   * «Música IA». El índice es para comparar, no para leer.
   */
  vert: string;
}

export function buildClientIndex(
  tools: readonly Tool[],
  categoryName: (slug: string) => string
): ClientIndexEntry[] {
  return tools.map((tool) => ({
    slug: tool.slug,
    name: tool.name,
    categorySlug: tool.categorySlug,
    secondaryCategories: tool.secondaryCategories,
    freeModel: tool.freeModel,
    platforms: tool.platforms,
    hosting: tool.hosting,
    startEffort: tool.startEffort,
    openSource: tool.openSource,
    freshness: tool.freshness,
    detectedAt: tool.detectedAt,
    lastVerifiedAt: tool.lastVerifiedAt,
    freePlan: {
      requiresCreditCard: tool.freePlan.requiresCreditCard,
      requiresSignup: tool.freePlan.requiresSignup,
      hasWatermark: tool.freePlan.hasWatermark,
      commercialUse: tool.freePlan.commercialUse,
    },
    f: [
      normalize(tool.name),
      normalize(tool.alternativeNames.join(' ')),
      normalize(tool.capabilities.map((c) => CAPABILITY_LABEL[c] ?? '').join(' ')),
      normalize(
        [tool.productType ? PRODUCT_TYPE_LABEL[tool.productType] : '', TOOL_KIND_LABEL[tool.kind] ?? '']
          .filter(Boolean)
          .join(' ')
      ),
      normalize(
        [categoryName(tool.categorySlug), ...tool.secondaryCategories.map(categoryName)].join(' ')
      ),
      normalize(
        [
          tool.tagline,
          tool.descriptionShort,
          tool.useCases.join(' '),
          tool.tags.join(' '),
          tool.badges.join(' '),
        ].join(' ')
      ),
    ],
    vert: categoryName(tool.categorySlug),
    caps: tool.capabilities,
    pt: tool.productType ?? null,
    cr: tool.freePlan.creditReset ?? null,
  }));
}

/** Rebuilds `SearchDoc`s from the compact index, client-side. */
export function docsFromIndex(entries: readonly ClientIndexEntry[]): SearchDoc[] {
  return entries.map((entry) => ({
    slug: entry.slug,
    name: entry.name,
    tagline: entry.f[5],
    category: entry.categorySlug,
    haystack: entry.f.join(' '),
    fields: {
      name: entry.f[0],
      alias: entry.f[1],
      intent: entry.f[2],
      product: entry.f[3],
      vertical: entry.f[4],
      text: entry.f[5],
    },
    hechos: {
      capabilities: entry.caps,
      categorySlug: entry.categorySlug,
      secondaryCategories: entry.secondaryCategories,
      productType: entry.pt,
      hosting: entry.hosting,
      freeModel: entry.freeModel,
      requiresCreditCard: entry.freePlan.requiresCreditCard,
      creditReset: entry.cr,
    },
  }));
}

/*
 * `hechosDe` se reexporta para que el servidor y el cliente construyan los
 * mismos hechos desde el mismo sitio. Si un día divergen, divergen aquí y no
 * en dos ficheros que nadie compara.
 */
export { hechosDe };
