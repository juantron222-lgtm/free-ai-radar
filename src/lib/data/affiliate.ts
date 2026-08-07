import rawPayload from '@/data/affiliate/placements.json';
import {
  AFFILIATE_LINK_REL,
  AutoCrawPayload,
  PLACEMENT_SLOTS,
  isDisplayable,
  isPriceFresh,
  validatePayload,
  type AffiliateLink,
  type AffiliateMerchant,
  type AffiliateOffer,
  type AffiliateProduct,
  type PlacementAssignment,
  type PlacementSlotId,
  type ToolProductRelation,
} from '@lib/domain/affiliate';
import { getAllTools } from './catalog';
import { logger } from '@lib/observability/logger';

/**
 * The commercial reader.
 *
 * **This module never throws.** That is the difference between it and
 * `catalog.ts`, and the difference is deliberate.
 *
 * The catalogue is the product: if it is malformed the build must fail, because
 * shipping a broken catalogue is worse than shipping nothing. Commercial data
 * is an addition: if it is malformed, absent, stale, or nonsense, the right
 * outcome is a site with no product boxes on it — not a failed build and not a
 * broken page. AutoCraw going quiet, sending garbage, or never being connected
 * at all are all the same case here, and all of them are survivable.
 *
 * Every failure is logged loudly enough to notice and quietly enough not to
 * take the site down with it.
 */

export interface ResolvedPlacement {
  slot: PlacementSlotId;
  toolSlug: string;
  relationKind: ToolProductRelation['kind'];
  rationale: string;
  product: AffiliateProduct;
  offer: AffiliateOffer;
  merchant: AffiliateMerchant;
  linkUrl: string;
  /** Always `sponsored nofollow noopener`. Not overridable. */
  rel: typeof AFFILIATE_LINK_REL;
  /** The merchant's own words, shown verbatim. Never generated. */
  disclosureText: string;
  /** Present only when observed recently enough to state as fact. */
  price?: { cents: number; currency: string; observedAt: string };
  commercialPriority: number;
}

interface Snapshot {
  placements: ResolvedPlacement[];
  /** Non-fatal problems, surfaced in the admin panel rather than the build. */
  problems: string[];
}

const EMPTY: Snapshot = Object.freeze({ placements: [], problems: [] });

function resolve(now: Date): Snapshot {
  const parsed = AutoCrawPayload.safeParse(rawPayload);

  if (!parsed.success) {
    const detail = parsed.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    logger.warn('affiliate.payload_invalid', { detail });
    return { placements: [], problems: [`La instantánea comercial no cumple el contrato: ${detail}`] };
  }

  const payload = parsed.data;

  // The tool slugs are the only thing the commercial layer reads from the
  // editorial one, and it reads them to check itself, never to change them.
  const knownSlugs = new Set(getAllTools().map((tool) => tool.slug));
  const problems = validatePayload(payload, knownSlugs).map(
    (problem) => `${problem.entity} ${problem.id}: ${problem.problem}`
  );

  /*
   * A payload with referential problems is rejected whole rather than
   * partially applied. Half a commercial snapshot is not a smaller version of
   * the same thing — it is a state nobody designed, where a link can outlive
   * the offer that explained it.
   */
  if (problems.length > 0) {
    logger.warn('affiliate.payload_rejected', { count: problems.length, first: problems[0] });
    return { placements: [], problems };
  }

  const byId = <T extends { id: string }>(rows: T[]) => new Map(rows.map((row) => [row.id, row]));
  const merchants = byId(payload.merchants);
  const products = byId(payload.products);
  const relations = byId(payload.relations);

  const linksByOffer = new Map<string, AffiliateLink>();
  for (const link of payload.links) {
    if (isDisplayable(link, now)) linksByOffer.set(link.offerId, link);
  }

  const resolved: ResolvedPlacement[] = [];

  for (const placement of payload.placements) {
    if (!isDisplayable(placement, now)) continue;
    if (!isWithinWindow(placement, now)) continue;

    const relation = relations.get(placement.relationId);
    if (!relation || !isDisplayable(relation, now)) continue;

    const product = products.get(relation.productId);
    if (!product || !isDisplayable(product, now)) continue;

    // Pick the cheapest fresh-priced offer, then any usable one. Cheapest is a
    // reader-serving tie-break, not a commercial one — the commercial ordering
    // happens later and only inside the slot.
    const candidates = payload.offers
      .filter((offer) => offer.productId === product.id)
      .filter((offer) => isDisplayable(offer, now))
      .filter((offer) => linksByOffer.has(offer.id))
      .filter((offer) => {
        const merchant = merchants.get(offer.merchantId);
        return merchant !== undefined && isDisplayable(merchant, now);
      })
      .sort((a, b) => {
        const aFresh = isPriceFresh(a, now);
        const bFresh = isPriceFresh(b, now);
        if (aFresh !== bFresh) return aFresh ? -1 : 1;
        return (a.observedPriceCents ?? Infinity) - (b.observedPriceCents ?? Infinity);
      });

    const offer = candidates[0];
    if (!offer) continue;

    const merchant = merchants.get(offer.merchantId);
    const link = linksByOffer.get(offer.id);
    if (!merchant || !link) continue;

    resolved.push({
      slot: placement.slot,
      toolSlug: relation.toolSlug,
      relationKind: relation.kind,
      rationale: relation.rationale,
      product,
      offer,
      merchant,
      linkUrl: link.url,
      rel: AFFILIATE_LINK_REL,
      disclosureText: merchant.disclosureText,
      // A price that is no longer fresh is dropped, not shown with a caveat.
      // "€39 (hace tres meses)" is not a price, it is a memory.
      ...(isPriceFresh(offer, now) && offer.observedPriceCents !== undefined
        ? {
            price: {
              cents: offer.observedPriceCents,
              currency: offer.observedCurrency!,
              observedAt: offer.observedPriceAt!,
            },
          }
        : {}),
      commercialPriority: placement.commercialPriority,
    });
  }

  return { placements: resolved, problems };
}

function isWithinWindow(placement: PlacementAssignment, now: Date): boolean {
  const today = now.toISOString().slice(0, 10);
  if (placement.startsOn && placement.startsOn > today) return false;
  if (placement.endsOn && placement.endsOn < today) return false;
  return true;
}

let snapshot: Snapshot | null = null;

function load(): Snapshot {
  if (snapshot) return snapshot;
  try {
    snapshot = resolve(new Date());
  } catch (error) {
    // Belt and braces. Nothing above should throw, but this module's whole
    // purpose is that the site does not depend on that being true.
    logger.warn('affiliate.load_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    snapshot = EMPTY;
  }
  return snapshot;
}

/**
 * Commercial content for one slot on one tool page.
 *
 * Returns `[]` whenever there is nothing to show, which is the normal case
 * today and stays the normal case if AutoCraw is never connected.
 */
export function getPlacements(slot: PlacementSlotId, toolSlug: string): ResolvedPlacement[] {
  const def = PLACEMENT_SLOTS[slot];
  return load()
    .placements.filter((item) => item.slot === slot && item.toolSlug === toolSlug)
    .sort(
      (a, b) =>
        b.commercialPriority - a.commercialPriority ||
        a.product.title.localeCompare(b.product.title, 'es')
    )
    .slice(0, def.maxItems);
}

/** Whether any commercial content exists at all. Used by the admin panel. */
export function hasCommercialData(): boolean {
  return load().placements.length > 0;
}

/** Non-fatal contract problems, for the admin panel. Never shown to readers. */
export function getCommercialProblems(): readonly string[] {
  return load().problems;
}

export function getCommercialStats(): {
  placements: number;
  tools: number;
  problems: number;
  withPrice: number;
} {
  const { placements, problems } = load();
  return {
    placements: placements.length,
    tools: new Set(placements.map((item) => item.toolSlug)).size,
    problems: problems.length,
    withPrice: placements.filter((item) => item.price !== undefined).length,
  };
}
