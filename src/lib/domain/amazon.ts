import { z } from 'zod';

/**
 * Amazon Associates, as rules the rest of the system enforces.
 *
 * Nothing here talks to Amazon. There is no key, no tag and no request: this
 * is the shape an Amazon offer has to satisfy before it can exist, so that the
 * day AutoCraw produces one the checks are already in place and have already
 * failed on purpose.
 *
 * Amazon is stricter than a generic merchant in four ways, all encoded rather
 * than remembered:
 *
 *   1. **The link must carry the associate tag.** Without it the link is not
 *      an affiliate link — it earns nothing and would still have to be
 *      labelled as advertising. Wrong in both directions at once.
 *   2. **The host must match the market.** An `amazon.es` tag on an
 *      `amazon.com` link earns nothing and sends a Spanish reader to the wrong
 *      store.
 *   3. **Cached content expires in 24 hours, and images cannot be cached at
 *      all.** This is Amazon's licence, not our preference. See CACHE below.
 *   4. **Every link needs its own disclosure**, next to it, in addition to the
 *      site-wide statement.
 */

// ---------------------------------------------------------------------------
// Disclosure
// ---------------------------------------------------------------------------

/**
 * The site-wide statement, official wording from Amazon España.
 *
 * Verified by the project owner against Amazon's own sources. It is a constant
 * and not a template: a legal disclosure that someone paraphrases is a legal
 * disclosure that no longer says what Amazon requires.
 */
export const AMAZON_DISCLOSURE_ES =
  'En calidad de Afiliado de Amazon, obtengo ingresos por las compras adscritas que cumplen los requisitos aplicables' as const;

/** The English equivalent, verbatim from §5 of the Operating Agreement. */
export const AMAZON_DISCLOSURE_EN =
  'As an Amazon Associate I earn from qualifying purchases.' as const;

/**
 * The markers Amazon España accepts next to an individual link.
 *
 * A closed list, exactly as Amazon publishes it. Inventing a fifth — "enlace
 * patrocinado", say — would look equivalent and would not be one of the
 * options Amazon named, which is the whole risk with disclosure wording.
 */
export const AMAZON_LINK_DISCLOSURES = [
  '(enlace pagado)',
  '#publicidad',
  '#publi',
  '#ColaboraciónPagada',
] as const;

export type AmazonLinkDisclosure = (typeof AMAZON_LINK_DISCLOSURES)[number];

/** Rejects anything that is not one of the four Amazon named. */
export const AmazonLinkDisclosure = z.enum(AMAZON_LINK_DISCLOSURES);

// ---------------------------------------------------------------------------
// Caching
// ---------------------------------------------------------------------------

/**
 * What kind of Amazon content a record holds, because the licence treats each
 * differently.
 */
export const AmazonContentKind = z.enum([
  /** Titles, prices, availability — anything that is not an image. */
  'ad_content',
  /** The image itself. Storing a copy is not permitted at all. */
  'image_binary',
  /** The URL that points at an image. */
  'image_url',
  /** The product identifier. */
  'asin',
]);
export type AmazonContentKind = z.infer<typeof AmazonContentKind>;

/**
 * Amazon EU's caching limits, in hours.
 *
 * `null` means unlimited, `0` means caching is not permitted at all. After the
 * maximum, fresh content has to come from the Creators API, PA-API or a Data
 * Feed — not from re-reading what we stored.
 *
 * The ASIN's "while the licence is in force" is the reason it is `null` rather
 * than a large number: it does not expire on a clock, it expires when the
 * agreement does.
 */
export const AMAZON_CACHE_MAX_HOURS: Record<AmazonContentKind, number | null> = {
  ad_content: 24,
  image_binary: 0,
  image_url: 24,
  asin: null,
};

/**
 * How often prices must refresh before a timestamp becomes mandatory.
 *
 * Amazon requires a date/time stamp whenever prices are updated less often
 * than hourly. Since nothing here refreshes hourly and nothing is likely to,
 * the practical reading is: **always show the stamp**. Encoding the threshold
 * anyway keeps the rule legible if that ever changes.
 */
export const AMAZON_HOURLY_REFRESH_MINUTES = 60;

/**
 * The notice that must accompany any Amazon price or availability.
 *
 * Required by the licence, so it is a constant rather than something a
 * template writes each time.
 */
export const AMAZON_PRICE_NOTICE =
  'El precio y la disponibilidad son los del momento indicado y pueden cambiar. Esa información en el momento de la compra es la que se aplica.' as const;

export interface AmazonCacheProblem {
  problem: string;
}

/**
 * Whether a piece of Amazon content is still within its permitted cache life.
 *
 * Hours, not days. The generic commercial layer expires prices after thirty
 * days, which is far too generous here and — worse — was expressed as a
 * *date*, so it could not have enforced a 24-hour rule even if it had wanted
 * to. Amazon needs an instant.
 */
export function checkAmazonCache(
  kind: AmazonContentKind,
  observedAt: string | undefined,
  now: Date = new Date()
): AmazonCacheProblem[] {
  const limit = AMAZON_CACHE_MAX_HOURS[kind];

  if (limit === 0) {
    return [
      {
        problem:
          'La licencia de Amazon no permite almacenar la imagen. Se enlaza a la que sirve Amazon; no se guarda una copia.',
      },
    ];
  }

  if (limit === null) return [];

  if (!observedAt) {
    return [{ problem: 'Falta el instante de obtención, así que no se puede saber si ha caducado.' }];
  }

  const observed = Date.parse(observedAt);
  if (Number.isNaN(observed)) {
    return [{ problem: 'El instante de obtención no es una fecha y hora válidas.' }];
  }

  if (observed > now.getTime() + 60_000) {
    return [{ problem: 'El instante de obtención está en el futuro.' }];
  }

  const hours = (now.getTime() - observed) / 3_600_000;
  if (hours > limit) {
    return [
      {
        problem: `Contenido de Amazon obtenido hace ${hours.toFixed(1)} h; el máximo es ${limit} h. Hay que pedirlo de nuevo a la API, no reutilizar lo almacenado.`,
      },
    ];
  }

  return [];
}

/** Convenience for the common case: is this Amazon content still usable? */
export function isAmazonContentFresh(
  kind: AmazonContentKind,
  observedAt: string | undefined,
  now: Date = new Date()
): boolean {
  return checkAmazonCache(kind, observedAt, now).length === 0;
}

/**
 * Whether a price needs its timestamp shown next to it.
 *
 * True whenever the refresh interval is longer than an hour, which in practice
 * is always.
 */
export function needsPriceTimestamp(refreshIntervalMinutes: number): boolean {
  return refreshIntervalMinutes > AMAZON_HOURLY_REFRESH_MINUTES;
}

// ---------------------------------------------------------------------------
// Markets and links
// ---------------------------------------------------------------------------

/** Markets we could serve, and the host each one uses. */
export const AMAZON_MARKETS = {
  ES: 'amazon.es',
  FR: 'amazon.fr',
  DE: 'amazon.de',
  IT: 'amazon.it',
  PT: 'amazon.es', // Amazon has no .pt storefront; Portugal buys through .es.
  US: 'amazon.com',
  UK: 'amazon.co.uk',
} as const satisfies Record<string, string>;

export type AmazonMarket = keyof typeof AMAZON_MARKETS;

/**
 * An associate tag: letters, digits and hyphens, ending in a market number.
 *
 * Validated loosely on purpose — the exact suffix rules are Amazon's to
 * change, and rejecting a valid tag would be worse than accepting an odd one
 * that then simply earns nothing.
 */
export const AmazonAssociateTag = z
  .string()
  .min(3)
  .max(40)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*-\d{2}$/i, 'Formato de etiqueta de afiliado no reconocido');

export interface AmazonLinkProblem {
  problem: string;
}

/**
 * Whether a URL is a usable Amazon affiliate link for a given market.
 *
 * Returns every problem rather than the first, because a link with a wrong
 * host *and* a missing tag should say both — fixing one and rediscovering the
 * other is how a short task becomes three.
 */
export function checkAmazonLink(
  url: string,
  market: AmazonMarket,
  expectedTag: string
): AmazonLinkProblem[] {
  const problems: AmazonLinkProblem[] = [];

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return [{ problem: 'La URL no es válida.' }];
  }

  if (parsed.protocol !== 'https:') {
    problems.push({ problem: 'El enlace debe ser https.' });
  }

  const host = AMAZON_MARKETS[market];
  const hostname = parsed.hostname.replace(/^www\./, '');
  if (hostname !== host) {
    problems.push({
      problem: `El enlace apunta a ${hostname}, pero el mercado ${market} usa ${host}.`,
    });
  }

  const tag = parsed.searchParams.get('tag');
  if (!tag) {
    problems.push({
      problem:
        'El enlace no lleva el parámetro tag. Sin él no es un enlace de afiliado: no genera comisión y aun así habría que etiquetarlo como publicidad.',
    });
  } else if (tag !== expectedTag) {
    problems.push({ problem: `El enlace lleva la etiqueta ${tag} en vez de la configurada.` });
  }

  return problems;
}

/**
 * Refuses a merchant without a disclosure statement.
 *
 * Accepts Amazon's official wording in either language, and refuses anything
 * that looks like a placeholder. It does **not** accept a paraphrase: for a
 * merchant whose slug says Amazon, the text has to be one of the two Amazon
 * publishes.
 */
export function requireDisclosure(text: string | undefined | null, isAmazon = false): string {
  const value = (text ?? '').trim();

  if (value.length < 10) {
    throw new Error(
      'Amazon exige mostrar una declaración de afiliación. Cópiala del panel de Afiliados: no la escribas de memoria.'
    );
  }

  if (/\[|\]|TODO|PENDIENTE|XXX/i.test(value)) {
    throw new Error('La declaración de afiliación sigue siendo un marcador de posición.');
  }

  if (isAmazon) {
    const official = [AMAZON_DISCLOSURE_ES, AMAZON_DISCLOSURE_EN].map((t) =>
      t.replace(/\.$/, '').toLowerCase()
    );
    if (!official.includes(value.replace(/\.$/, '').toLowerCase())) {
      throw new Error(
        'La declaración de Amazon debe ser su redacción oficial, no una versión propia. Una paráfrasis deja de decir lo que Amazon exige.'
      );
    }
  }

  return value;
}

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

export interface AmazonReadiness {
  ready: boolean;
  missing: string[];
  present: string[];
}

/**
 * What is still missing before Amazon can be connected.
 *
 * Reports which names are set, never their values.
 */
export function amazonReadiness(env: Record<string, string | undefined>): AmazonReadiness {
  const required = [
    'AMAZON_ASSOCIATE_TAG',
    'AMAZON_MARKET',
    'AMAZON_DISCLOSURE_TEXT',
    'AMAZON_PAAPI_ACCESS_KEY',
    'AMAZON_PAAPI_SECRET_KEY',
  ];

  const present = required.filter((name) => (env[name] ?? '').trim().length > 0);
  const missing = required.filter((name) => !present.includes(name));

  return { ready: missing.length === 0, missing, present };
}

/**
 * The hard gate on publishing anything from Amazon.
 *
 * Throws unless every credential is configured. Called on the render path, so
 * an Amazon placement cannot appear on a page merely because a row said
 * `active` — displaying Amazon content without an authorised account is a
 * licence breach regardless of what our own database thinks.
 */
export function assertAmazonPublishable(env: Record<string, string | undefined>): void {
  const readiness = amazonReadiness(env);
  if (readiness.ready) return;

  throw new Error(
    `No se puede publicar contenido de Amazon: falta ${readiness.missing.join(', ')}. ` +
      'Mostrar contenido de Amazon sin una cuenta de Afiliados autorizada incumple su licencia.'
  );
}
