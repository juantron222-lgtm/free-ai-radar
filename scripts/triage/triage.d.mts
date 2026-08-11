import type { z } from 'zod';
import type { InboxCandidateShape, InboxVertical } from '../radar/inbox.d.mts';

/**
 * Types for the triage core.
 *
 * Same arrangement as `scripts/radar/inbox.d.mts`, and for the same reason: the
 * implementation has to run on plain Node, but the boundary between what the
 * radar guessed and what triage decided is exactly the place where a silent
 * `any` would cost the most.
 */

export declare const TriageDecision: z.ZodEnum<['promote', 'hold', 'reject']>;
export type TriageDecision = z.infer<typeof TriageDecision>;

export type TriageEventClass =
  | 'lanzamiento'
  | 'disponibilidad'
  | 'actualizacion'
  | 'preview'
  | 'retirada'
  | 'futuro'
  | 'indeterminado';

export interface TriageSignalShape {
  axis: string;
  points: number;
  max: number;
  reason: string;
}

export interface TriageRecordShape {
  id: string;
  title: string;
  canonicalUrl: string;
  publisher: string;
  publishedAt: string | null;

  /** What the radar thought, preserved so the disagreement stays readable. */
  radarStatus: string;
  radarReason: string | null;
  radarVertical: string;

  /** Triage's own reading, which may differ from the radar's. */
  vertical: InboxVertical | string;
  eventClass: TriageEventClass | string;
  product: string | null;

  triageDecision: TriageDecision;
  triageScore: number;
  triageReasons: TriageSignalShape[];

  overturnedRadar: boolean;
  triagedAt: string;
}

export declare const TriageSignal: z.ZodType<TriageSignalShape>;
export declare const TriageRecord: z.ZodType<TriageRecordShape>;
export declare const Triage: z.ZodType<TriageRecordShape[]>;

export interface ScoredStory {
  score: number;
  signals: TriageSignalShape[];
  eventClass: TriageEventClass | string;
  vertical: InboxVertical | string;
  product: string | null;
}

export interface StoryKey {
  product: string | null;
  eventClass: TriageEventClass | string;
  publishedAt: string | null;
}

export interface TriageStats {
  total: number;
  byDecision: Partial<Record<TriageDecision, number>>;
  byVertical: Record<string, number>;
  buckets: Record<'0-24' | '25-54' | '55-79' | '80-100', number>;
  rescued: number;
}

export interface CoverageGap {
  vertical: string;
  usable: number;
  latest: string | null;
  daysWithout: number | null;
}

export declare const THRESHOLDS: { promote: number; hold: number };

export declare function detectVertical(title: unknown): InboxVertical | string;
export declare function detectProduct(title: unknown): string | null;
export declare function detectEventClass(title: unknown): TriageEventClass | string;
export declare function readsAsCustomerStory(title: unknown): boolean;
export declare function hardReject(title: unknown): string | null;
export declare function sameEvent(a: StoryKey, b: StoryKey): boolean;

export declare function scoreStory(
  story: Pick<InboxCandidateShape, 'title' | 'canonicalUrl'>
): ScoredStory;

export declare function runTriage(input: {
  inbox: readonly InboxCandidateShape[];
  triagedAt: string;
}): TriageRecordShape[];

export declare function coverageGaps(
  records: readonly TriageRecordShape[],
  today: string
): CoverageGap[];

export declare function summarizeTriage(records: readonly TriageRecordShape[]): TriageStats;
export declare function serializeTriage(records: readonly TriageRecordShape[]): string;
