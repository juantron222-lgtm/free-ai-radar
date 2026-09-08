import { z } from 'zod';

/**
 * Verification: the stage where a candidate meets its primary source.
 *
 * Triage decides what is worth the cost of reading a vendor page. This stage is
 * the reading, and it is the last point at which a story can still be stopped
 * cheaply — after it, someone writes prose, and prose is persuasive whether or
 * not it is true.
 *
 * The pipeline, with each stage owning one file:
 *
 *   inbox.json         what the radar found
 *   triage.json        what triage decided, and why
 *   verification.json  what the source actually says          ← this
 *   news/news.json     what a human wrote and published
 *
 * Three outcomes, and only one of them may proceed:
 *
 *   verified      the source demonstrates the claims; it can be written
 *   insufficient  true as far as it goes, too vague to write without inventing
 *   contradicted  the source says something other than the candidate did
 *
 * `insufficient` is not a failure of the candidate, it is a refusal to guess.
 * A source that could not be opened at all lands here too: an unread page backs
 * nothing, and "we could not check" must never quietly become "we checked".
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const IsoDate = z.string().regex(ISO_DATE, 'fecha ISO AAAA-MM-DD');

export const VerificationDecision = z.enum(['verified', 'insufficient', 'contradicted']);

/**
 * The same vocabularies the editorial schema uses.
 *
 * Duplicated deliberately rather than imported: this module runs on plain Node
 * and `src/lib/domain/news.ts` is TypeScript. A test asserts the two lists stay
 * identical, so the duplication is checked rather than trusted.
 */
export const EVENT_TYPES = [
  'anuncio',
  'lanzamiento',
  'actualizacion',
  'preview-beta',
  'disponibilidad-general',
  'retirada',
];

export const AVAILABILITIES = [
  'announced',
  'preview',
  'limited',
  'available',
  'deprecated',
  'unknown',
];

export const FREE_PLAN_STATES = ['yes', 'no', 'unverified'];

/**
 * A source that was actually opened, or that demonstrably could not be.
 *
 * `reachable: false` is a first-class record. A page that returned 403 is not
 * the same as a page nobody tried, and the difference decides whether a story
 * is waiting on a person or on a blocked fetcher.
 */
export const PrimarySource = z.object({
  url: z.string().url(),
  label: z.string().min(1),
  kind: z.enum(['official', 'release-notes', 'pricing', 'docs', 'repo', 'model-card']),
  publisher: z.string().min(1),
  checkedAt: IsoDate,
  reachable: z.boolean(),
  /** Why it could not be read, when it could not. */
  unreachableReason: z.string().nullable().default(null),
  /**
   * True when this url is not where the vendor actually publishes the post —
   * a feed link that redirects elsewhere. The canonical one is what gets cited.
   */
  redirectedTo: z.string().url().nullable().default(null),
});

/** One demonstrated fact, tied to the sentence that demonstrates it. */
export const VerifiedFact = z.object({
  fact: z.string().min(1),
  /** Copied from the page, not paraphrased. */
  quote: z.string().min(1),
  sourceUrl: z.string().url(),
});

export const VerificationRecord = z
  .object({
    candidateId: z.string().min(1),
    title: z.string().min(1),
    checkedAt: IsoDate,

    decision: VerificationDecision,

    primarySources: z.array(PrimarySource).min(1),
    verifiedFacts: z.array(VerifiedFact),
    unconfirmed: z.array(z.string()),

    eventType: z.enum(EVENT_TYPES).nullable(),
    availability: z.enum(AVAILABILITIES).nullable(),
    affectsFreePlan: z.enum(FREE_PLAN_STATES),

    verificationNotes: z.string().min(1),
  })
  .superRefine((record, ctx) => {
    const fail = (path, message) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

    if (record.decision === 'verified') {
      if (!record.primarySources.some((source) => source.reachable)) {
        fail('primarySources', 'no se puede verificar contra una fuente que no se ha podido leer');
      }
      if (record.verifiedFacts.length === 0) {
        fail('verifiedFacts', 'una verificación sin hechos demostrados no verifica nada');
      }
      if (!record.eventType) fail('eventType', 'una noticia verificada debe declarar el tipo de evento');
      if (!record.availability) {
        fail('availability', 'una noticia verificada debe declarar la disponibilidad, aunque sea "unknown"');
      }
    }

    /*
     * Every fact has to point at a source this record actually lists, and one
     * that was read. Otherwise a quote could be attributed to a page nobody
     * opened, which is the failure this whole stage exists to prevent.
     */
    const readable = new Set(
      record.primarySources.filter((source) => source.reachable).map((source) => source.url)
    );
    for (const [index, fact] of record.verifiedFacts.entries()) {
      if (!readable.has(fact.sourceUrl)) {
        fail(
          'verifiedFacts',
          `el hecho ${index + 1} cita "${fact.sourceUrl}", que no consta entre las fuentes leídas`
        );
      }
    }

    if (record.decision !== 'verified' && record.verificationNotes.trim().length < 20) {
      fail('verificationNotes', 'un resultado que no es "verified" tiene que explicarse');
    }

    if (record.decision === 'contradicted' && record.unconfirmed.length === 0) {
      fail('unconfirmed', 'una contradicción debe decir qué afirmación contradice la fuente');
    }
  });

export const Verification = z.array(VerificationRecord);

/**
 * Whether a verification may proceed to writing.
 *
 * The only gate between this stage and prose. Kept as a named function rather
 * than an inline comparison so the rule is greppable and testable, and so that
 * nothing downstream has to remember which of the three outcomes was the safe
 * one.
 */
export function canBeWritten(record) {
  return record.decision === 'verified';
}

export function summarizeVerification(records) {
  const byDecision = {};
  for (const record of records) {
    byDecision[record.decision] = (byDecision[record.decision] ?? 0) + 1;
  }
  return {
    total: records.length,
    byDecision,
    writable: records.filter(canBeWritten).length,
    unreachableSources: records.reduce(
      (n, record) => n + record.primarySources.filter((s) => !s.reachable).length,
      0
    ),
  };
}

export function serializeVerification(records) {
  return `${JSON.stringify(Verification.parse(records), null, 2)}\n`;
}
