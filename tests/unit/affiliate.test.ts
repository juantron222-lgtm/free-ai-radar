import { describe, expect, it } from 'vitest';
import {
  AFFILIATE_LINK_REL,
  AffiliateLink,
  AffiliateMerchant,
  AffiliateOffer,
  AutoCrawPayload,
  PLACEMENT_SLOTS,
  PlacementAssignment,
  PRICE_MAX_AGE_DAYS,
  RECORD_MAX_AGE_DAYS,
  isDisplayable,
  isPriceFresh,
  validatePayload,
} from '@lib/domain/affiliate';
import { getAllTools } from '@lib/data/catalog';
import { getCommercialStats, getPlacements, hasCommercialData } from '@lib/data/affiliate';

/**
 * The invariants, as executable claims.
 *
 * Every test here corresponds to a line in
 * `docs/autocraw-affiliate-integration.md` §3. If one of them starts failing,
 * the promise it encodes has stopped being true, and the document is wrong
 * until someone fixes the code.
 */

const NOW = new Date('2026-08-07T12:00:00Z');
const TODAY = '2026-08-07';

function daysAgo(days: number): string {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** A minimal, internally consistent payload. Individual tests break one thing. */
function payload(overrides: Partial<AutoCrawPayload> = {}): AutoCrawPayload {
  const toolSlug = getAllTools()[0]!.slug;
  return AutoCrawPayload.parse({
    contractVersion: 1,
    generatedAt: NOW.toISOString(),
    merchants: [
      {
        id: 'm1',
        slug: 'tienda-ejemplo',
        name: 'Tienda de ejemplo',
        programme: 'Programa de ejemplo',
        host: 'ejemplo.test',
        market: 'ES',
        disclosureText: 'Enlace de afiliación de ejemplo. Ganamos una comisión sin coste para ti.',
        status: 'active',
        source: 'manual',
        lastCheckedAt: TODAY,
        notes: '',
      },
    ],
    products: [
      {
        id: 'p1',
        slug: 'producto-de-ejemplo',
        title: 'Producto de ejemplo',
        summary: '',
        status: 'active',
        source: 'manual',
        lastCheckedAt: TODAY,
      },
    ],
    offers: [
      {
        id: 'o1',
        productId: 'p1',
        merchantId: 'm1',
        market: 'ES',
        observedPriceCents: 4999,
        observedCurrency: 'EUR',
        observedPriceAt: TODAY,
        availability: 'in_stock',
        status: 'active',
        source: 'manual',
        lastCheckedAt: TODAY,
      },
    ],
    links: [
      {
        id: 'l1',
        offerId: 'o1',
        url: 'https://ejemplo.test/producto',
        disclosureRequired: true,
        status: 'active',
        source: 'manual',
        lastCheckedAt: TODAY,
      },
    ],
    relations: [
      {
        id: 'r1',
        toolSlug,
        productId: 'p1',
        kind: 'complements',
        rationale: 'Una razón editorial suficientemente larga para pasar la validación.',
        commercialPriority: 50,
        status: 'active',
        source: 'manual',
        lastCheckedAt: TODAY,
      },
    ],
    placements: [
      {
        id: 'pl1',
        slot: 'tool_detail_footer',
        relationId: 'r1',
        commercialPriority: 50,
        status: 'active',
        source: 'manual',
        lastCheckedAt: TODAY,
      },
    ],
    ...overrides,
  });
}

const knownSlugs = () => new Set(getAllTools().map((tool) => tool.slug));

// ---------------------------------------------------------------------------

describe('invariante: la afiliación nunca toca lo editorial', () => {
  it('no existe ningún campo comercial en el registro de una herramienta', () => {
    // The strongest form of "affiliates never modify score": there is nowhere
    // to write it. If someone adds a commercial field to a tool, this fails.
    const forbidden = [
      'commercialPriority',
      'affiliateBoost',
      'sponsoredRank',
      'productId',
      'merchantId',
      'placementSlot',
    ];
    for (const tool of getAllTools()) {
      for (const field of forbidden) {
        expect(Object.keys(tool), `${tool.slug} expone ${field}`).not.toContain(field);
      }
    }
  });

  it('el patrocinio no puede mover una herramienta ni un puesto', () => {
    for (const tool of getAllTools()) {
      expect(tool.sponsorship.placementBoost, tool.slug).toBe(0);
    }
  });

  it('el orden editorial es idéntico con y sin datos comerciales', () => {
    /*
     * The catalogue is loaded and ordered without the commercial module ever
     * being consulted. Reading the order twice — once before touching the
     * affiliate layer and once after it has been loaded and queried — proves
     * the two are not connected by any shared state.
     */
    const before = getAllTools().map((tool) => `${tool.slug}:${tool.scoreTotal}`);

    hasCommercialData();
    getCommercialStats();
    for (const tool of getAllTools()) getPlacements('tool_detail_footer', tool.slug);

    const after = getAllTools().map((tool) => `${tool.slug}:${tool.scoreTotal}`);
    expect(after).toEqual(before);
  });

  it('una herramienta sin afiliación no queda penalizada', () => {
    // Nothing has commercial data today, so every tool is in the "no
    // affiliation" case. If having none were a penalty, scores would not span
    // the full range and the top entry would not be a tool with no links.
    const scores = getAllTools().map((tool) => tool.scoreTotal);
    expect(Math.max(...scores)).toBeGreaterThan(Math.min(...scores));

    const top = [...getAllTools()].sort((a, b) => b.scoreTotal - a.scoreTotal)[0]!;
    expect(getPlacements('tool_detail_footer', top.slug)).toEqual([]);
    expect(top.scoreTotal).toBeGreaterThan(0);
  });
});

describe('invariante: todo enlace afiliado se puede identificar', () => {
  it('el rel es siempre sponsored nofollow noopener', () => {
    expect(AFFILIATE_LINK_REL).toBe('sponsored nofollow noopener');
  });

  it('un enlace sin divulgación no se puede ni construir', () => {
    const withoutDisclosure = {
      id: 'l9',
      offerId: 'o1',
      url: 'https://ejemplo.test/x',
      disclosureRequired: false,
      status: 'active',
      source: 'autocraw',
      lastCheckedAt: TODAY,
    };
    expect(AffiliateLink.safeParse(withoutDisclosure).success).toBe(false);
  });

  it('el comerciante debe traer un texto de divulgación utilizable', () => {
    const short = { ...payload().merchants[0]!, disclosureText: 'ad' };
    const result = AffiliateMerchant.safeParse(short);
    expect(result.success).toBe(false);
  });
});

describe('invariante: AutoCraw no publica por su cuenta', () => {
  it('un alta suya marcada como activa se rechaza', () => {
    const data = payload();
    data.products[0]!.source = 'autocraw';
    data.products[0]!.status = 'active';

    const problems = validatePayload(data, knownSlugs());
    expect(problems.map((p) => p.problem).join(' ')).toContain('no puede publicar');
  });

  it('un alta suya pendiente es aceptable', () => {
    const data = payload();
    for (const row of [
      ...data.products,
      ...data.merchants,
      ...data.offers,
      ...data.links,
      ...data.relations,
      ...data.placements,
    ]) {
      row.source = 'autocraw';
      row.status = 'pending_review';
    }
    expect(validatePayload(data, knownSlugs())).toEqual([]);
  });

  it('no puede inventar una herramienta que no existe', () => {
    const data = payload();
    data.relations[0]!.toolSlug = 'herramienta-que-no-existe';
    const problems = validatePayload(data, knownSlugs());
    expect(problems.map((p) => p.problem).join(' ')).toContain('herramienta inexistente');
  });

  it('no puede inventar un slot que el código no declara', () => {
    const bad = { ...payload().placements[0]!, slot: 'portada_hero' };
    expect(PlacementAssignment.safeParse(bad).success).toBe(false);
  });
});

describe('invariante: un enlace apunta a quien dice', () => {
  it('rechaza un enlace a un dominio distinto del comerciante', () => {
    const data = payload();
    data.links[0]!.url = 'https://otra-cosa.test/producto';
    const problems = validatePayload(data, knownSlugs());
    expect(problems.map((p) => p.problem).join(' ')).toContain('pero el comerciante es');
  });

  it('acepta un subdominio del comerciante', () => {
    const data = payload();
    data.links[0]!.url = 'https://www.ejemplo.test/producto';
    expect(validatePayload(data, knownSlugs())).toEqual([]);
  });

  it('rechaza un mercado que no coincide con el del comerciante', () => {
    const data = payload();
    data.offers[0]!.market = 'FR';
    const problems = validatePayload(data, knownSlugs());
    expect(problems.map((p) => p.problem).join(' ')).toContain('no coincide con el del comerciante');
  });
});

describe('precio observado', () => {
  it('exige importe, moneda y fecha juntos o ninguno', () => {
    const base = payload().offers[0]!;
    expect(
      AffiliateOffer.safeParse({ ...base, observedCurrency: undefined }).success,
      'importe y fecha sin moneda debería fallar'
    ).toBe(false);
    expect(
      AffiliateOffer.safeParse({ ...base, observedPriceAt: undefined }).success,
      'importe y moneda sin fecha debería fallar'
    ).toBe(false);

    const noPrice = {
      ...base,
      observedPriceCents: undefined,
      observedCurrency: undefined,
      observedPriceAt: undefined,
    };
    expect(AffiliateOffer.safeParse(noPrice).success, 'sin precio debería valer').toBe(true);
  });

  it('un precio viejo deja de considerarse fresco', () => {
    const offer = AffiliateOffer.parse({
      ...payload().offers[0]!,
      observedPriceAt: daysAgo(PRICE_MAX_AGE_DAYS + 1),
    });
    expect(isPriceFresh(offer, NOW)).toBe(false);
  });

  it('un precio dentro del plazo sí lo es', () => {
    const offer = AffiliateOffer.parse({
      ...payload().offers[0]!,
      observedPriceAt: daysAgo(PRICE_MAX_AGE_DAYS - 1),
    });
    expect(isPriceFresh(offer, NOW)).toBe(true);
  });

  it('el importe se guarda en enteros: nada de coma flotante', () => {
    const base = payload().offers[0]!;
    expect(AffiliateOffer.safeParse({ ...base, observedPriceCents: 49.99 }).success).toBe(false);
  });
});

describe('invariante: la web sobrevive si AutoCraw calla', () => {
  it('hoy no hay datos comerciales y nada se rompe', () => {
    expect(hasCommercialData()).toBe(false);
    expect(getCommercialStats().placements).toBe(0);
    for (const tool of getAllTools()) {
      expect(getPlacements('tool_detail_footer', tool.slug)).toEqual([]);
      expect(getPlacements('tool_detail_sidebar', tool.slug)).toEqual([]);
    }
  });

  it('un registro que nadie comprueba deja de mostrarse solo', () => {
    const stale = { status: 'active' as const, lastCheckedAt: daysAgo(RECORD_MAX_AGE_DAYS + 1) };
    const fresh = { status: 'active' as const, lastCheckedAt: daysAgo(RECORD_MAX_AGE_DAYS - 1) };
    expect(isDisplayable(stale, NOW)).toBe(false);
    expect(isDisplayable(fresh, NOW)).toBe(true);
  });

  it('lo pendiente y lo inactivo nunca se muestran', () => {
    for (const status of ['pending_review', 'inactive', 'rejected'] as const) {
      expect(isDisplayable({ status, lastCheckedAt: TODAY }, NOW)).toBe(false);
    }
  });

  it('una versión de contrato distinta se rechaza en vez de adivinarse', () => {
    const wrong = { ...payload(), contractVersion: 2 };
    expect(AutoCrawPayload.safeParse(wrong).success).toBe(false);
  });
});

describe('límites de los slots', () => {
  it('cada slot declara un tope y es pequeño', () => {
    for (const def of Object.values(PLACEMENT_SLOTS)) {
      expect(def.maxItems, def.id).toBeGreaterThan(0);
      expect(def.maxItems, def.id).toBeLessThanOrEqual(3);
      expect(def.heading.length, def.id).toBeGreaterThan(0);
    }
  });

  it('ningún slot está en la portada ni en un listado', () => {
    // Commercial content belongs on a page someone chose to open, never on the
    // surfaces that shape discovery.
    const ids = Object.keys(PLACEMENT_SLOTS);
    for (const forbidden of ['home', 'portada', 'search', 'listing', 'ranking']) {
      expect(ids.join(' ')).not.toContain(forbidden);
    }
  });
});
