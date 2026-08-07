import { z } from 'zod';
import { HttpUrl, IsoDate } from './primitives';

/**
 * The commercial layer.
 *
 * Everything here is fed by AutoCraw, a separate agent responsible for
 * affiliate monetisation. This module exists to make the boundary between
 * *commerce* and *editorial judgement* a property of the type system rather
 * than a promise in a document.
 *
 * Three rules shape every decision below:
 *
 *   1. **Commercial data can be absent.** The site is complete without it.
 *      Nothing here is required to render a page, compute a score, or order a
 *      list. If AutoCraw stops sending, the site loses product boxes and keeps
 *      everything else.
 *
 *   2. **Commercial priority is not editorial priority.** They are different
 *      fields, on different records, read by different code paths.
 *      `commercialPriority` orders products *within a commercial slot* and has
 *      no reach outside it.
 *
 *   3. **A disclosed link or no link.** `disclosureRequired` is typed as the
 *      literal `true`. There is no way to construct an affiliate link that
 *      opts out of disclosure, because the field cannot hold any other value.
 *
 * The corresponding database grants are in
 * `supabase/migrations/0003_autocraw_affiliate.sql`; the contract as a whole is
 * documented in `docs/autocraw-affiliate-integration.md`.
 */

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/** ISO 3166-1 alpha-2. A market, not a language. */
export const MarketCode = z
  .string()
  .length(2)
  .regex(/^[A-Z]{2}$/, 'El mercado debe ser ISO 3166-1 alfa-2 en mayúsculas');

/** ISO 4217. */
export const CurrencyCode = z
  .string()
  .length(3)
  .regex(/^[A-Z]{3}$/, 'La moneda debe ser ISO 4217 en mayúsculas');

/**
 * Where a commercial record came from.
 *
 * `manual` exists so a human can add something without impersonating the
 * agent, and so the audit trail can tell the two apart.
 */
export const CommercialSource = z.enum(['autocraw', 'manual', 'import']);
export type CommercialSource = z.infer<typeof CommercialSource>;

/**
 * Lifecycle of any commercial record.
 *
 * `pending_review` is the only state AutoCraw may write. Promotion to `active`
 * is a human act — see §6 of the integration document.
 */
export const CommercialStatus = z.enum(['pending_review', 'active', 'inactive', 'rejected']);
export type CommercialStatus = z.infer<typeof CommercialStatus>;

export const COMMERCIAL_STATUS_LABEL: Record<CommercialStatus, string> = {
  pending_review: 'Pendiente de revisión',
  active: 'Activo',
  inactive: 'Inactivo',
  rejected: 'Rechazado',
};

/**
 * How old an observed price may be before we stop showing it.
 *
 * A price is a fact with a short shelf life. Showing a stale one is worse than
 * showing none: it looks like a current claim and it is not. Thirty days is
 * the point past which we would not defend it in writing.
 */
export const PRICE_MAX_AGE_DAYS = 30;

/**
 * How long a record may go unchecked before it stops being displayed at all.
 *
 * This is the mechanism that makes "the site keeps working if AutoCraw stops"
 * true in the honest sense: not that stale boxes keep rendering forever, but
 * that they age out on their own and leave the page intact.
 */
export const RECORD_MAX_AGE_DAYS = 60;

// ---------------------------------------------------------------------------
// Merchant
// ---------------------------------------------------------------------------

/**
 * A merchant is who takes the money — Amazon ES, a maker's own shop.
 *
 * `disclosureText` is required and non-empty. There is deliberately no
 * fallback: a merchant we cannot describe truthfully to the reader is a
 * merchant we cannot link to.
 */
export const AffiliateMerchant = z.object({
  id: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  name: z.string().min(1).max(120),
  /** Affiliate network or programme, e.g. "Amazon Associates". */
  programme: z.string().min(1).max(120),
  /** Registrable domain, used to verify that a link points where it claims. */
  host: z.string().min(3).max(120),
  market: MarketCode,
  /** Shown verbatim next to every link to this merchant. Never generated. */
  disclosureText: z.string().min(10).max(300),
  status: CommercialStatus,
  source: CommercialSource,
  lastCheckedAt: IsoDate,
  notes: z.string().max(1000).default(''),
});
export type AffiliateMerchant = z.infer<typeof AffiliateMerchant>;

// ---------------------------------------------------------------------------
// Product
// ---------------------------------------------------------------------------

/**
 * A product is a thing that exists in the world, independent of who sells it
 * or for how much. Prices and availability live on the offer.
 */
export const AffiliateProduct = z.object({
  id: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  title: z.string().min(1).max(200),
  /** One line, factual. Not marketing copy — we do not write ads. */
  summary: z.string().max(400).default(''),
  brand: z.string().max(120).optional(),
  category: z.string().max(120).optional(),
  /** ASIN, GTIN, EAN. Free-form because merchants disagree about identifiers. */
  externalId: z.string().max(64).optional(),
  imageUrl: HttpUrl.optional(),
  status: CommercialStatus,
  source: CommercialSource,
  lastCheckedAt: IsoDate,
});
export type AffiliateProduct = z.infer<typeof AffiliateProduct>;

// ---------------------------------------------------------------------------
// Offer
// ---------------------------------------------------------------------------

/**
 * An offer is one merchant selling one product in one market, at a price we
 * observed on a given day.
 *
 * Price is optional on purpose. A product with no observed price is still
 * useful; a product with a *guessed* price is a lie with a number attached.
 * `refine` below makes the three price fields inseparable: you provide all of
 * them or none.
 */
export const AffiliateOffer = z
  .object({
    id: z.string().min(1),
    productId: z.string().min(1),
    merchantId: z.string().min(1),
    market: MarketCode,

    /** Integer minor units. Floats do not belong anywhere near money. */
    observedPriceCents: z.number().int().nonnegative().optional(),
    observedCurrency: CurrencyCode.optional(),
    /** The day the price was seen. Not the day the row was written. */
    observedPriceAt: IsoDate.optional(),

    availability: z.enum(['in_stock', 'out_of_stock', 'unknown']).default('unknown'),
    status: CommercialStatus,
    source: CommercialSource,
    lastCheckedAt: IsoDate,
  })
  .refine(
    (offer) => {
      const parts = [offer.observedPriceCents, offer.observedCurrency, offer.observedPriceAt];
      const present = parts.filter((part) => part !== undefined).length;
      return present === 0 || present === 3;
    },
    {
      message:
        'Un precio observado necesita importe, moneda y fecha. O están los tres o no está ninguno.',
      path: ['observedPriceCents'],
    }
  );
export type AffiliateOffer = z.infer<typeof AffiliateOffer>;

// ---------------------------------------------------------------------------
// Link
// ---------------------------------------------------------------------------

/**
 * The trackable URL for an offer.
 *
 * `disclosureRequired` is `z.literal(true)`. It is not a default, not a
 * convention and not a lint rule: the type has exactly one inhabitant, so
 * `{ disclosureRequired: false }` does not type-check and does not parse. The
 * database mirrors it with a check constraint, because the type system stops
 * at the network boundary and the rule does not.
 */
export const AffiliateLink = z.object({
  id: z.string().min(1),
  offerId: z.string().min(1),
  url: HttpUrl,
  /** Never rendered. Kept so a human can audit what the tag actually is. */
  trackingTag: z.string().max(120).optional(),
  disclosureRequired: z.literal(true),
  status: CommercialStatus,
  source: CommercialSource,
  lastCheckedAt: IsoDate,
});
export type AffiliateLink = z.infer<typeof AffiliateLink>;

/** The rel attribute every affiliate link must carry. Not configurable. */
export const AFFILIATE_LINK_REL = 'sponsored nofollow noopener' as const;

// ---------------------------------------------------------------------------
// Relations and placement
// ---------------------------------------------------------------------------

export const ProductRelationKind = z.enum([
  'requires', // the tool needs this to work at all (a GPU, a microphone)
  'complements', // makes the tool meaningfully better
  'alternative_hardware', // a way to do the job without the tool
  'learning', // a book or course about the field
]);
export type ProductRelationKind = z.infer<typeof ProductRelationKind>;

export const PRODUCT_RELATION_LABEL: Record<ProductRelationKind, string> = {
  requires: 'Necesario para usarla',
  complements: 'Complementa a la herramienta',
  alternative_hardware: 'Alternativa por hardware',
  learning: 'Para aprender',
};

/**
 * Which product goes with which tool.
 *
 * `commercialPriority` orders products inside a commercial slot. It is scoped
 * to this record by design: there is no field on `Tool` it can reach, and no
 * ranking function reads this table. See `tests/unit/affiliate.test.ts`, which
 * asserts that the editorial ordering of the catalogue is byte-identical with
 * and without commercial data present.
 */
export const ToolProductRelation = z.object({
  id: z.string().min(1),
  toolSlug: z.string().min(1),
  productId: z.string().min(1),
  kind: ProductRelationKind,
  /**
   * Why this product belongs next to this tool, in the editor's words.
   * Required: a relation nobody can justify in a sentence is an advert.
   */
  rationale: z.string().min(10).max(400),
  /** 0–100. Commercial ordering only. Never touches score or ranking. */
  commercialPriority: z.number().int().min(0).max(100).default(0),
  status: CommercialStatus,
  source: CommercialSource,
  lastCheckedAt: IsoDate,
});
export type ToolProductRelation = z.infer<typeof ToolProductRelation>;

/**
 * The named surfaces where commercial content may appear.
 *
 * A closed list, held here rather than in the database, so that adding a
 * commercial surface to the site is a code change that goes through review —
 * not a row AutoCraw could insert.
 */
export const PLACEMENT_SLOT_IDS = [
  'tool_detail_sidebar',
  'tool_detail_footer',
  'guide_inline',
  'collection_footer',
] as const;

export const PlacementSlotId = z.enum(PLACEMENT_SLOT_IDS);
export type PlacementSlotId = z.infer<typeof PlacementSlotId>;

export interface PlacementSlotDef {
  id: PlacementSlotId;
  label: string;
  /** Hard ceiling on how many products may appear. Enforced at render. */
  maxItems: number;
  /** Heading shown above the block. Always names it as commercial. */
  heading: string;
}

export const PLACEMENT_SLOTS: Record<PlacementSlotId, PlacementSlotDef> = {
  tool_detail_sidebar: {
    id: 'tool_detail_sidebar',
    label: 'Ficha — lateral',
    maxItems: 2,
    heading: 'Material relacionado',
  },
  tool_detail_footer: {
    id: 'tool_detail_footer',
    label: 'Ficha — pie',
    maxItems: 3,
    heading: 'Material relacionado',
  },
  guide_inline: {
    id: 'guide_inline',
    label: 'Guía — dentro del texto',
    maxItems: 2,
    heading: 'Material relacionado',
  },
  collection_footer: {
    id: 'collection_footer',
    label: 'Colección — pie',
    maxItems: 3,
    heading: 'Material relacionado',
  },
};

/** A slot's contents: which relations may render there, and in what order. */
export const PlacementAssignment = z.object({
  id: z.string().min(1),
  slot: PlacementSlotId,
  relationId: z.string().min(1),
  /** 0–100, commercial. Ties break by product title, never by tool score. */
  commercialPriority: z.number().int().min(0).max(100).default(0),
  startsOn: IsoDate.optional(),
  endsOn: IsoDate.optional(),
  status: CommercialStatus,
  source: CommercialSource,
  lastCheckedAt: IsoDate,
});
export type PlacementAssignment = z.infer<typeof PlacementAssignment>;

// ---------------------------------------------------------------------------
// Click events — aggregated only
// ---------------------------------------------------------------------------

/**
 * Clicks, counted per day per link per slot. Nothing else.
 *
 * There is no user id here and no session id, and that is not an oversight we
 * might revisit: an aggregate cannot leak an individual's browsing, so the
 * privacy question never has to be answered again downstream. It also means
 * this table needs no RLS policy for user isolation, because there is nothing
 * to isolate.
 */
export const AffiliateClickDaily = z.object({
  day: IsoDate,
  linkId: z.string().min(1),
  slot: PlacementSlotId,
  market: MarketCode,
  clicks: z.number().int().nonnegative(),
});
export type AffiliateClickDaily = z.infer<typeof AffiliateClickDaily>;

// ---------------------------------------------------------------------------
// The bundle AutoCraw sends, and the rules it must satisfy
// ---------------------------------------------------------------------------

/**
 * One complete ingestion payload.
 *
 * Deliberately a whole snapshot rather than a stream of deltas: a snapshot can
 * be validated as a unit, diffed against what is live, and rejected without
 * leaving the catalogue half-updated.
 */
export const AutoCrawPayload = z.object({
  /** Contract version. A mismatch is rejected, never coerced. */
  contractVersion: z.literal(1),
  generatedAt: z.string().datetime(),
  merchants: z.array(AffiliateMerchant).default([]),
  products: z.array(AffiliateProduct).default([]),
  offers: z.array(AffiliateOffer).default([]),
  links: z.array(AffiliateLink).default([]),
  relations: z.array(ToolProductRelation).default([]),
  placements: z.array(PlacementAssignment).default([]),
});
export type AutoCrawPayload = z.infer<typeof AutoCrawPayload>;

export interface ValidationProblem {
  entity: string;
  id: string;
  problem: string;
}

/**
 * Referential and policy checks that a schema cannot express.
 *
 * Runs on ingestion *and* on read. Running it twice is intentional: ingestion
 * validates what arrives, and the render path refuses to trust that ingestion
 * happened under the same rules it does. A payload that fails is rejected
 * whole — see `docs/autocraw-affiliate-integration.md` §7.
 *
 * `knownToolSlugs` is passed in rather than imported so that this function
 * stays free of any dependency on the catalogue: the commercial layer may read
 * editorial slugs, and that is the entire extent of the coupling.
 */
export function validatePayload(
  payload: AutoCrawPayload,
  knownToolSlugs: ReadonlySet<string>
): ValidationProblem[] {
  const problems: ValidationProblem[] = [];
  const merchants = new Map(payload.merchants.map((m) => [m.id, m]));
  const products = new Map(payload.products.map((p) => [p.id, p]));
  const offers = new Map(payload.offers.map((o) => [o.id, o]));
  const relations = new Map(payload.relations.map((r) => [r.id, r]));

  const report = (entity: string, id: string, problem: string) =>
    problems.push({ entity, id, problem });

  for (const offer of payload.offers) {
    if (!products.has(offer.productId)) {
      report('offer', offer.id, `producto inexistente: ${offer.productId}`);
    }
    if (!merchants.has(offer.merchantId)) {
      report('offer', offer.id, `comerciante inexistente: ${offer.merchantId}`);
    }
    const merchant = merchants.get(offer.merchantId);
    if (merchant && merchant.market !== offer.market) {
      report(
        'offer',
        offer.id,
        `el mercado (${offer.market}) no coincide con el del comerciante (${merchant.market})`
      );
    }
  }

  for (const link of payload.links) {
    const offer = offers.get(link.offerId);
    if (!offer) {
      report('link', link.id, `oferta inexistente: ${link.offerId}`);
      continue;
    }

    const merchant = merchants.get(offer.merchantId);
    if (!merchant) continue;

    // A link must point at the merchant it claims. Without this, a valid-looking
    // record could route a reader anywhere at all.
    let host: string;
    try {
      host = new URL(link.url).hostname;
    } catch {
      report('link', link.id, `URL ilegible: ${link.url}`);
      continue;
    }
    if (host !== merchant.host && !host.endsWith(`.${merchant.host}`)) {
      report('link', link.id, `apunta a ${host}, pero el comerciante es ${merchant.host}`);
    }
  }

  for (const relation of payload.relations) {
    if (!products.has(relation.productId)) {
      report('relation', relation.id, `producto inexistente: ${relation.productId}`);
    }
    // The commercial layer may reference a tool. It may never create one.
    if (!knownToolSlugs.has(relation.toolSlug)) {
      report('relation', relation.id, `herramienta inexistente: ${relation.toolSlug}`);
    }
  }

  for (const placement of payload.placements) {
    if (!relations.has(placement.relationId)) {
      report('placement', placement.id, `relación inexistente: ${placement.relationId}`);
    }
    if (placement.startsOn && placement.endsOn && placement.endsOn < placement.startsOn) {
      report('placement', placement.id, 'la fecha de fin es anterior a la de inicio');
    }
  }

  // Nothing arrives active. Promotion is a human act, so a payload that tries
  // to publish itself is a contract violation, not a permission problem.
  for (const [entity, rows] of [
    ['merchant', payload.merchants],
    ['product', payload.products],
    ['offer', payload.offers],
    ['link', payload.links],
    ['relation', payload.relations],
    ['placement', payload.placements],
  ] as const) {
    for (const row of rows) {
      if (row.source === 'autocraw' && row.status === 'active') {
        report(entity, row.id, 'AutoCraw no puede publicar: el alta entra como pendiente');
      }
    }
  }

  return problems;
}

// ---------------------------------------------------------------------------
// Display rules
// ---------------------------------------------------------------------------

function ageInDays(iso: string, now: Date): number {
  const then = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(then)) return Number.POSITIVE_INFINITY;
  return Math.floor((now.getTime() - then) / 86_400_000);
}

/** True when an observed price is recent enough to state as a fact. */
export function isPriceFresh(offer: AffiliateOffer, now: Date = new Date()): boolean {
  if (!offer.observedPriceAt) return false;
  return ageInDays(offer.observedPriceAt, now) <= PRICE_MAX_AGE_DAYS;
}

/**
 * Whether a commercial record may be shown at all.
 *
 * Age is checked here rather than at ingestion because the passage of time is
 * not an event anyone sends us. This is what makes the layer fail safe: if
 * AutoCraw goes quiet, records stop displaying by themselves within
 * `RECORD_MAX_AGE_DAYS`, and no page breaks when they do.
 */
export function isDisplayable(
  record: { status: CommercialStatus; lastCheckedAt: string },
  now: Date = new Date()
): boolean {
  if (record.status !== 'active') return false;
  return ageInDays(record.lastCheckedAt, now) <= RECORD_MAX_AGE_DAYS;
}
