import { z } from 'zod';

/**
 * Amazon Associates, as a set of rules the rest of the system can enforce.
 *
 * Nothing here talks to Amazon. There is no key, no tag and no request: this
 * is the shape an Amazon offer has to satisfy before it can exist, so that the
 * day AutoCraw starts producing them the checks are already in place and
 * already tested.
 *
 * Amazon is stricter than a generic merchant in two ways that matter, and both
 * are encoded rather than remembered:
 *
 *   1. **The link must carry the associate tag.** A link without it is not an
 *      affiliate link — it is a plain product link that earns nothing and
 *      still gets labelled as advertising. Wrong in both directions.
 *   2. **The host must match the market.** An `amazon.es` tag on an
 *      `amazon.com` link earns nothing and sends a Spanish reader to the wrong
 *      store.
 */

/**
 * The statement Amazon requires Associates to display.
 *
 * Verbatim from §5 of the Operating Agreement at
 * affiliate-program.amazon.com, checked 8 August 2026.
 *
 * This is the **English** wording, which is the one we have verified. Amazon
 * requires a market-appropriate equivalent, and the Spanish text could not be
 * retrieved from a primary source — the help pages index the Operating
 * Agreement without reproducing it. So it is not written here. Guessing at the
 * wording of a legal disclosure is exactly the failure mode this project
 * exists to avoid, and a wrong disclosure is worse than an absent one because
 * it looks compliant.
 *
 * `requireDisclosure` refuses to accept a merchant without one, so the gap
 * cannot be forgotten: someone has to paste the real text from the Associates
 * dashboard before an Amazon offer can go live.
 */
export const AMAZON_DISCLOSURE_EN =
  'As an Amazon Associate I earn from qualifying purchases.' as const;

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
 * Format taken from the tags Amazon issues (`nombre-21` for Spain, `-20` for
 * the US). Validated loosely on purpose — the exact suffix rules are Amazon's
 * to change, and rejecting a valid tag would be worse than accepting an odd
 * one that then simply earns nothing.
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
 * Amazon requires one; the schema requires one; and this refuses to let the
 * requirement be satisfied by whitespace or by a placeholder someone meant to
 * replace.
 */
export function requireDisclosure(text: string | undefined | null): string {
  const value = (text ?? '').trim();

  if (value.length < 10) {
    throw new Error(
      'Amazon exige mostrar una declaración de afiliación. Cópiala del panel de Afiliados: no la escribas de memoria.'
    );
  }

  if (/\[|\]|TODO|PENDIENTE|XXX/i.test(value)) {
    throw new Error('La declaración de afiliación sigue siendo un marcador de posición.');
  }

  return value;
}

/**
 * What is still missing before Amazon can be connected.
 *
 * Read from configuration rather than assumed, so the admin panel can show the
 * real state instead of a promise. Nothing here is a credential: it reports
 * which names are set, never their values.
 */
export interface AmazonReadiness {
  ready: boolean;
  missing: string[];
  present: string[];
}

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
