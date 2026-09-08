import { z } from 'zod';
import { AVAILABILITIES, EVENT_TYPES, FREE_PLAN_STATES, canBeWritten } from '../verify/verification.mjs';

/**
 * Drafting: prose, with every factual claim tied back to a quote.
 *
 * This is the stage where the newsroom stops holding structured data and starts
 * holding sentences, which is exactly where a pipeline like this usually starts
 * lying. Prose is fluent; fluency reads as authority; and the sentence "and
 * it's free for everyone" costs nothing to type and everything to be wrong
 * about.
 *
 * So a draft is not free text with a source attached. Its factual load has to
 * be traceable: `factTrace` maps each part of the draft to the verified quotes
 * that support it, and `checkDraft` refuses anything that asserts what no quote
 * demonstrates — a price, an availability, a licence, a region, a free plan, a
 * comparison, or a superlative the writer supplied themselves.
 *
 *   verification.json  what the source says       (quotes)
 *   drafts.json        what we would publish      (prose + trace)   ← this
 *   news/news.json     what a human approved
 *
 * Nothing here writes `news/news.json`. Passing the gate makes a draft
 * publishable, not published.
 */

export const DraftStatus = z.enum(['draft', 'ready']);

/**
 * Which quotes support which part of the draft.
 *
 * Keyed by quote rather than by index so the trace survives the fact list being
 * reordered, and so a trace is readable on its own without holding the
 * verification record alongside it.
 */
export const FactTrace = z.object({
  summary: z.array(z.string().min(1)).min(1),
  impact: z.array(z.string().min(1)).min(1),
  eventType: z.array(z.string().min(1)).min(1),
  availability: z.array(z.string().min(1)).min(1),
  pricing: z.array(z.string().min(1)).default([]),
  freePlan: z.array(z.string().min(1)).default([]),
});

export const Draft = z.object({
  /** The verification this was written from. Several drafts may share one. */
  candidateId: z.string().min(1),
  id: z.string().min(1),
  slug: z
    .string()
    .min(3)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug inválido'),
  title: z.string().min(1).max(160),
  summary: z.string().min(20).max(600),
  impact: z.string().min(20).max(600),
  category: z.string().min(1),
  eventType: z.enum(EVENT_TYPES),
  availability: z.enum(AVAILABILITIES),
  affectsFreePlan: z.enum(FREE_PLAN_STATES),
  relatedTools: z.array(z.string()).default([]),
  officialUrl: z.string().url(),
  sources: z
    .array(
      z.object({
        url: z.string().url(),
        label: z.string().min(1),
        kind: z.enum(['official', 'release-notes', 'pricing', 'docs', 'repo', 'model-card']),
        publisher: z.string().min(1),
        checkedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
    )
    .min(1),
  factTrace: FactTrace,
  status: DraftStatus.default('draft'),
});

export const Drafts = z.array(Draft);

/* ------------------------------------------------------- claim detectors -- */

/** Money, in any of the shapes these announcements use. */
const PRICE_CLAIM = /(\$\s?\d|\d+[.,]\d+\s*(?:d[oó]lares|euros|usd|eur)|\d+\s*(?:d[oó]lares|euros)\b)/i;

/** Words that assert what something costs a reader, rather than describing it. */
const FREE_CLAIM = /\b(gratis|gratuit[oa]s?|sin coste|de pago|hay que pagar|cuesta dinero)\b/i;

/**
 * Hedges that turn a claim into a statement about the source's silence.
 *
 * "No menciona capa gratuita" is honest and publishable; "no tiene capa
 * gratuita" is an inference the page does not support. The two differ only by
 * this vocabulary, so the gate looks for it sentence by sentence.
 */
const HEDGE = /\b(no (?:lo )?(?:menciona|dice|indica|aclara|precisa|detalla|consta|especifica)|sin confirmar|no consta|no sabemos|la p[aá]gina no|el anuncio no|ni para confirmarlo)\b/i;

const LICENCE_CLAIM = /\b(pesos abiertos|open[- ]weights?|c[oó]digo abierto|open[- ]source|licencia\s+\w+|apache|mit\b|gguf|descargar los pesos)\b/i;

const REGION_CLAIM = /\b(en Estados Unidos|en Europa|en la UE|en Espa[nñ]a|solo en|s[oó]lo en|por regiones|seg[uú]n el pa[ií]s|disponible en \d+ pa[ií]ses)\b/i;

const AVAILABILITY_CLAIM = /\b(ya (?:est[aá] )?disponible|disponible desde|se puede usar|puedes usarlo|accesible desde|disponibilidad general|en preview|en beta)\b/i;

/** Praise the writer supplied. Never traceable, so never allowed. */
const SUPERLATIVE = /\b(revolucionari[oa]|el mejor|la mejor|impresionante|espectacular|sin precedentes|l[ií]der del sector|puntero|definitiv[oa]|imprescindible|incre[ií]ble|asombros[oa]|nunca visto|cambia las reglas)\b/i;

/** Comparisons need evidence; "faster than X" is a claim about X too. */
const COMPARISON = /\b(m[aá]s (?:r[aá]pido|barato|potente|preciso|capaz) que|mejor que|supera a|por delante de|frente a \w+ que)\b/i;

function sentences(text) {
  return String(text ?? '')
    .split(/(?<=[.!?])\s+|\s+—\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Every quote the verification actually demonstrated. */
function quotePool(record) {
  return record.verifiedFacts.map((fact) => fact.quote);
}

/**
 * Whether any quote in the trace demonstrates a given kind of claim.
 *
 * The trace names quotes; this checks the named quotes really say the thing.
 * Without it a writer could cite a date quote as cover for a price.
 */
function traceSupports(trace, pool, pattern) {
  return trace.some((quote) => pool.includes(quote) && pattern.test(quote));
}

/* ------------------------------------------------------------------ gate -- */

/**
 * The gate between a draft and publication.
 *
 * Returns every reason it failed rather than the first, because a writer fixing
 * one sentence at a time is how the other problems get forgotten.
 */
export function checkDraft(draft, record) {
  const reasons = [];

  if (!record) {
    return { ok: false, reasons: ['no hay registro de verificación para este candidato'] };
  }

  if (!canBeWritten(record)) {
    reasons.push(`la verificación es "${record.decision}": sólo "verified" puede redactarse`);
  }

  const pool = quotePool(record);

  /* Every quote cited by the trace has to be one the verification recorded. */
  for (const [part, quotes] of Object.entries(draft.factTrace)) {
    for (const quote of quotes) {
      if (!pool.includes(quote)) {
        reasons.push(`"${part}" cita una frase que no está en los hechos verificados: «${quote}»`);
      }
    }
  }

  /* The declared event type and availability each need a quote behind them. */
  if (draft.factTrace.eventType.length === 0) {
    reasons.push('el tipo de evento no está respaldado por ningún hecho verificado');
  }
  if (!traceSupports(draft.factTrace.availability, pool, /\S/)) {
    reasons.push('la disponibilidad declarada no está respaldada por ningún hecho verificado');
  }

  /*
   * Availability has to match what the quotes say, not merely have a quote
   * attached. A page that says "public preview" cannot back `available`.
   */
  const availabilityQuotes = draft.factTrace.availability.join(' ');
  if (draft.availability === 'available' && /\bpreview|beta\b/i.test(availabilityQuotes)) {
    reasons.push('declara "available" citando una frase que habla de preview o beta');
  }
  if (draft.availability === 'preview' && !/\bpreview|beta\b/i.test(availabilityQuotes)) {
    reasons.push('declara "preview" sin citar ninguna frase que lo diga');
  }

  const prose = `${draft.title} ${draft.summary} ${draft.impact}`;

  if (SUPERLATIVE.test(prose)) {
    reasons.push(`contiene un superlativo propio: «${prose.match(SUPERLATIVE)?.[0]}»`);
  }

  if (COMPARISON.test(prose)) {
    const comparison = prose.match(COMPARISON)?.[0] ?? '';
    if (!pool.some((quote) => COMPARISON.test(quote))) {
      reasons.push(`compara sin evidencia: «${comparison}»`);
    }
  }

  if (PRICE_CLAIM.test(prose) && !traceSupports(draft.factTrace.pricing, pool, PRICE_CLAIM)) {
    reasons.push('da un precio que ningún hecho verificado respalda');
  }

  if (LICENCE_CLAIM.test(prose)) {
    const licenceSentences = sentences(prose).filter((s) => LICENCE_CLAIM.test(s));
    const supported = pool.some((quote) => LICENCE_CLAIM.test(quote));
    const allHedged = licenceSentences.every((s) => HEDGE.test(s));
    if (!supported && !allHedged) {
      reasons.push('afirma algo sobre licencia o pesos que la fuente no sostiene');
    }
  }

  if (REGION_CLAIM.test(prose) && !pool.some((quote) => REGION_CLAIM.test(quote))) {
    reasons.push('afirma una limitación por región que la fuente no menciona');
  }

  if (AVAILABILITY_CLAIM.test(prose) && draft.factTrace.availability.length === 0) {
    reasons.push('afirma disponibilidad sin trazarla a ningún hecho verificado');
  }

  /*
   * The free plan, which is the claim this site exists to get right.
   *
   * When the verification could not establish it, the draft may still discuss
   * it — but only as the source's silence. Any sentence that uses the money
   * vocabulary has to carry a hedge.
   */
  if (draft.affectsFreePlan !== record.affectsFreePlan) {
    reasons.push(
      `dice "${draft.affectsFreePlan}" sobre el plan gratuito y la verificación dice "${record.affectsFreePlan}"`
    );
  }

  if (draft.affectsFreePlan === 'unverified') {
    for (const sentence of sentences(prose)) {
      if (FREE_CLAIM.test(sentence) && !HEDGE.test(sentence)) {
        reasons.push(`presenta el coste como hecho sin que esté verificado: «${sentence}»`);
      }
    }
  }

  if (draft.eventType !== record.eventType && record.eventType !== null) {
    /*
     * A record covering two products carries the headline one at top level;
     * a draft about the other may legitimately differ, so this is only a
     * mismatch when the draft's own quotes do not support it.
     */
    if (draft.factTrace.eventType.every((quote) => !pool.includes(quote))) {
      reasons.push(
        `declara eventType "${draft.eventType}" frente a "${record.eventType}" sin citas propias`
      );
    }
  }

  /* The button and the evidence have to lead to the same page. */
  const readUrls = record.primarySources.filter((s) => s.reachable).map((s) => s.url);
  if (!readUrls.includes(draft.officialUrl)) {
    reasons.push('officialUrl no es una de las fuentes primarias que se pudieron leer');
  }

  for (const source of draft.sources) {
    if (!record.primarySources.some((s) => s.url === source.url)) {
      reasons.push(`cita una fuente que no está en la verificación: ${source.url}`);
    }
  }

  return { ok: reasons.length === 0, reasons };
}

/** Drafts that cleared the gate, with the reasons for those that did not. */
export function gateDrafts(drafts, verification) {
  const byCandidate = new Map(verification.map((record) => [record.candidateId, record]));

  return drafts.map((draft) => ({
    slug: draft.slug,
    ...checkDraft(draft, byCandidate.get(draft.candidateId)),
  }));
}

export function serializeDrafts(drafts) {
  return `${JSON.stringify(Drafts.parse(drafts), null, 2)}\n`;
}
