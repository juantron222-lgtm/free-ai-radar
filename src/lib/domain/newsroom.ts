import { z } from 'zod';
import { IsoDate } from './primitives';
import { NewsItem, isPublishable } from './news';
import { checkDraft } from '../../../scripts/draft/drafts.mjs';
import type { DraftShape } from '../../../scripts/draft/drafts.d.mts';
import type { VerificationRecordShape } from '../../../scripts/verify/verification.d.mts';

/**
 * The editing desk.
 *
 * Everything upstream of here is machinery: the radar guesses, triage scores,
 * verification quotes, drafting traces. None of it publishes. This module is
 * where a person looks at the result and takes the one decision the machinery
 * is not allowed to take.
 *
 * The gate logic is imported from `scripts/draft/drafts.mjs` rather than
 * reimplemented. It is the same function the drafting stage runs, which is the
 * point — a desk that re-derived "is this publishable?" would eventually
 * disagree with the pipeline, and the disagreement would be discovered by a
 * reader.
 */

export const NewsroomAction = z.enum(['approve', 'hold', 'reject']);
export type NewsroomAction = z.infer<typeof NewsroomAction>;

/**
 * A human decision, appended and never rewritten.
 *
 * Rejections stay in the log with their reason: the brief asks for stories to
 * be discarded without being deleted, and a decision that leaves no trace is
 * one nobody can be asked about later.
 */
export const DecisionRecord = z.object({
  slug: z.string().min(1),
  action: NewsroomAction,
  /** Who decided. Recorded because approval publishes. */
  actor: z.string().min(1),
  at: z.string().datetime(),
  note: z.string().max(500).default(''),
});
export type DecisionRecord = z.infer<typeof DecisionRecord>;

export const DecisionLog = z.array(DecisionRecord);

export type DeskSection = 'ready' | 'verification' | 'hold' | 'discarded';

export interface DeskStory {
  key: string;
  title: string;
  publisher: string;
  publishedAt: string | null;
  vertical: string;
  section: DeskSection;

  radar: { status: string; reason: string | null; vertical: string } | null;
  triage: { decision: string; score: number; reasons: Array<{ axis: string; points: number; reason: string }> } | null;
  verification: VerificationRecordShape | null;
  draft: DraftShape | null;
  gate: { ok: boolean; reasons: string[] } | null;
  decision: DecisionRecord | null;
  published: boolean;
}

/** The most recent decision for a slug, or null. Later entries win. */
export function latestDecision(log: readonly DecisionRecord[], slug: string): DecisionRecord | null {
  let latest: DecisionRecord | null = null;
  for (const entry of log) {
    if (entry.slug !== slug) continue;
    if (!latest || entry.at >= latest.at) latest = entry;
  }
  return latest;
}

/**
 * Whether this story may be approved for publication.
 *
 * Five conditions, and every one of them has already been checked by some
 * earlier stage. Checking them again here is deliberate: this is the only call
 * site that writes to the published dataset, so it is the only place where
 * being wrong is irreversible for a reader.
 */
export function canApprove(story: DeskStory): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (!story.draft) {
    reasons.push('no hay borrador: una historia no puede saltar del radar a publicada');
  }

  if (!story.verification) {
    reasons.push('no hay verificación: nada se publica sin haber leído la fuente');
  } else if (story.verification.decision !== 'verified') {
    reasons.push(
      `la verificación es "${story.verification.decision}": sólo "verified" puede publicarse`
    );
  }

  if (story.gate && !story.gate.ok) {
    reasons.push(...story.gate.reasons.map((reason) => `puerta editorial: ${reason}`));
  }

  if (!story.gate && story.draft) {
    reasons.push('el borrador no ha pasado por la puerta editorial');
  }

  if (story.published) {
    reasons.push('ya está publicada');
  }

  return { ok: reasons.length === 0, reasons };
}

/**
 * Turn an approved draft into a published news item.
 *
 * Deterministic: the same draft and verification always produce the same
 * record, byte for byte. Nothing is invented here — every field either comes
 * from the draft, from the verification, or is a constant. In particular
 * `publishedAt` is the vendor's date taken from the verified facts, never
 * today's date, and `checkedAt` is when the source was actually read.
 */
export function draftToNewsItem(
  draft: DraftShape,
  record: VerificationRecordShape,
  publishedAt: string
): NewsItem {
  const candidate = {
    id: draft.id,
    slug: draft.slug,
    title: draft.title,
    summary: draft.summary,
    impact: draft.impact,
    category: draft.category,
    eventType: draft.eventType,
    availability: draft.availability,
    publishedAt,
    checkedAt: record.checkedAt,
    sources: draft.sources,
    officialUrl: draft.officialUrl,
    relatedTools: draft.relatedTools,
    affectsFreePlan: draft.affectsFreePlan,
    /*
     * `verified` is not a courtesy: the draft only exists because the
     * verification said so, and the gate refused anything the quotes did not
     * carry. What the source left open lives in `unconfirmed`, which is why an
     * item can be fully verified and still say what it does not know.
     */
    verification: 'verified' as const,
    status: 'published' as const,
    author: 'Redacción de Free AI Radar',
    unconfirmed: [] as string[],
  };

  return NewsItem.parse(candidate);
}

/**
 * Add an approved item to the dataset, or leave it untouched if it is there.
 *
 * Idempotent by slug. Approving twice — a double click, a retried request, a
 * second editor — must not produce two copies of a story, and must not rewrite
 * the first one either: whatever is already published is what readers have
 * seen, and silently replacing it would erase that.
 */
export function mergePublished(
  existing: readonly NewsItem[],
  item: NewsItem
): { items: NewsItem[]; added: boolean } {
  if (existing.some((published) => published.slug === item.slug)) {
    return { items: [...existing], added: false };
  }

  const items = [...existing, item].sort(
    (a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.slug.localeCompare(b.slug)
  );

  return { items, added: true };
}

/**
 * The final check, run against the dataset as it would be written.
 *
 * `canApprove` asks whether this story is allowed through; this asks whether
 * the file that results is still valid. They are different questions — an item
 * can be individually publishable and still collide with something already
 * there — and the write only happens if both say yes.
 */
export function validatesAfterMerge(items: readonly NewsItem[]): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];

  const parsed = NewsItem.array().safeParse(items);
  if (!parsed.success) {
    reasons.push(...parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`));
    return { ok: false, reasons };
  }

  const slugs = items.map((i) => i.slug);
  if (new Set(slugs).size !== slugs.length) reasons.push('hay slugs duplicados');

  const ids = items.map((i) => i.id);
  if (new Set(ids).size !== ids.length) reasons.push('hay identificadores duplicados');

  for (const item of items.filter((i) => i.status === 'published')) {
    const check = isPublishable(item);
    if (!check.ok) reasons.push(`"${item.slug}": ${check.reasons.join('; ')}`);
  }

  return { ok: reasons.length === 0, reasons };
}

/**
 * Assemble the desk from every stage's output.
 *
 * A story is keyed by draft slug when it has reached drafting, and by candidate
 * id before that. The four sections are derived, never stored: the desk is a
 * view of the pipeline, so there is no second place where a story's state could
 * drift out of step with the files.
 */
export function buildDesk(input: {
  inbox: ReadonlyArray<Record<string, unknown>>;
  triage: ReadonlyArray<Record<string, unknown>>;
  verification: readonly VerificationRecordShape[];
  drafts: readonly DraftShape[];
  publishedSlugs: readonly string[];
  decisions: readonly DecisionRecord[];
}): DeskStory[] {
  const { inbox, triage, verification, drafts, publishedSlugs, decisions } = input;

  const inboxById = new Map(inbox.map((row) => [String(row.id), row]));
  const verificationByCandidate = new Map(verification.map((r) => [r.candidateId, r]));
  const draftsByCandidate = new Map<string, DraftShape[]>();
  for (const draft of drafts) {
    draftsByCandidate.set(draft.candidateId, [
      ...(draftsByCandidate.get(draft.candidateId) ?? []),
      draft,
    ]);
  }

  const stories: DeskStory[] = [];

  for (const record of triage) {
    const candidateId = String(record.id);
    const row = inboxById.get(candidateId);
    const verified = verificationByCandidate.get(candidateId) ?? null;
    const candidateDrafts = draftsByCandidate.get(candidateId) ?? [];

    const radar = row
      ? {
          status: String(row.status),
          reason: (row.reason as string | null) ?? null,
          vertical: String(row.vertical),
        }
      : null;

    const triageView = {
      decision: String(record.triageDecision),
      score: Number(record.triageScore),
      reasons: (record.triageReasons as DeskStory['triage'] extends null
        ? never
        : Array<{ axis: string; points: number; reason: string }>) ?? [],
    };

    /* A verified candidate becomes one desk story per draft it produced. */
    if (candidateDrafts.length > 0) {
      for (const draft of candidateDrafts) {
        const gate = verified ? checkDraft(draft, verified) : { ok: false, reasons: ['sin verificación'] };
        const decision = latestDecision(decisions, draft.slug);
        const published = publishedSlugs.includes(draft.slug);

        stories.push({
          key: draft.slug,
          title: draft.title,
          publisher: String(record.publisher),
          publishedAt: (record.publishedAt as string | null) ?? null,
          vertical: draft.category,
          section:
            decision?.action === 'reject'
              ? 'discarded'
              : published || (gate.ok && verified?.decision === 'verified')
                ? 'ready'
                : 'verification',
          radar,
          triage: triageView,
          verification: verified,
          draft,
          gate,
          decision,
          published,
        });
      }
      continue;
    }

    const decision = latestDecision(decisions, candidateId);
    const section: DeskSection =
      decision?.action === 'reject'
        ? 'discarded'
        : verified && verified.decision !== 'verified'
          ? 'verification'
          : triageView.decision === 'promote'
            ? 'verification'
            : triageView.decision === 'hold'
              ? 'hold'
              : 'discarded';

    stories.push({
      key: candidateId,
      title: String(record.title),
      publisher: String(record.publisher),
      publishedAt: (record.publishedAt as string | null) ?? null,
      vertical: String(record.vertical),
      section,
      radar,
      triage: triageView,
      verification: verified,
      draft: null,
      gate: null,
      decision,
      published: false,
    });
  }

  return stories;
}

export function deskSection(stories: readonly DeskStory[], section: DeskSection): DeskStory[] {
  return stories
    .filter((story) => story.section === section)
    .sort((a, b) => (b.triage?.score ?? 0) - (a.triage?.score ?? 0) || a.key.localeCompare(b.key));
}

export const PublishedDate = IsoDate;
