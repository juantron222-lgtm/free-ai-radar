import type { z } from 'zod';

/**
 * Types for the radar's pure core.
 *
 * The implementation is `.mjs` because that is what every script in this repo
 * is and because `scripts/news-radar.mjs` has to import it at runtime on plain
 * Node. Declaring the surface here means the test suite still type-checks
 * against it under `strictest`, rather than falling back to `any` at the one
 * boundary where the newsroom's separation is enforced.
 */

export declare const InboxStatus: z.ZodEnum<['discovered', 'duplicate', 'rejected', 'candidate']>;
export type InboxStatus = z.infer<typeof InboxStatus>;

export declare const InboxVertical: z.ZodEnum<
  [
    'modelo-lenguaje',
    'agentes',
    'imagen',
    'video',
    'audio',
    'multimodal',
    'local-open-source',
    'herramientas',
    'sin-clasificar',
  ]
>;
export type InboxVertical = z.infer<typeof InboxVertical>;

export interface InboxCandidateShape {
  id: string;
  title: string;
  url: string;
  canonicalUrl: string;
  publisher: string;
  observedAt: string;
  publishedAt: string | null;
  discoveredVia: string;
  vertical: InboxVertical;
  status: InboxStatus;
  reason: string | null;
}

export declare const InboxCandidate: z.ZodType<InboxCandidateShape>;
export declare const Inbox: z.ZodType<InboxCandidateShape[]>;

export interface KnownStory {
  title: string;
  publisher: string | null;
  publishedAt: string;
  slug: string;
}

export interface KnownStories {
  urls: Set<string>;
  stories: KnownStory[];
}

export interface InboxStats {
  total: number;
  byStatus: Partial<Record<InboxStatus, number>>;
  byVertical: Partial<Record<InboxVertical, number>>;
  byReason: Record<string, number>;
}

export interface RadarRow {
  sourceId: string;
  title: string;
  url: string;
  publishedAt: string | null;
}

export interface RadarSource {
  id: string;
  name?: string;
  enabled?: boolean;
}

export interface RadarResult {
  inbox: InboxCandidateShape[];
  added: InboxCandidateShape[];
  outsideWindow: number;
  stats: InboxStats;
}

export declare const NOISE_PATTERNS: ReadonlyArray<{ reason: string; test: RegExp }>;
export declare const VERTICAL_PATTERNS: ReadonlyArray<{ vertical: InboxVertical; test: RegExp }>;
export declare const DEFAULT_WINDOW_DAYS: number;

export declare function canonicalizeUrl(rawUrl: unknown): string;
export declare function identifyPublisher(rawUrl: unknown): string | null;
export declare function candidateId(canonicalUrl: string): string;
export declare function detectNoise(title: unknown): string | null;
export declare function detectVertical(title: unknown): InboxVertical;
export declare function titleSimilarity(a: unknown, b: unknown): number;

export declare function knownStories(newsItems: readonly unknown[]): KnownStories;

export declare function findDuplicate(
  candidate: Pick<InboxCandidateShape, 'id' | 'title' | 'canonicalUrl' | 'publisher' | 'publishedAt'>,
  known: KnownStories,
  otherCandidates?: readonly InboxCandidateShape[]
): string | null;

export declare function classifyRow(
  row: Partial<RadarRow>,
  context: {
    source: RadarSource;
    observedAt: string;
    known: KnownStories;
    sofar: readonly InboxCandidateShape[];
  }
): InboxCandidateShape;

export declare function mergeInbox(
  existing: readonly InboxCandidateShape[],
  incoming: readonly InboxCandidateShape[]
): { inbox: InboxCandidateShape[]; added: InboxCandidateShape[] };

export declare function runRadar(input: {
  rows: readonly Partial<RadarRow>[];
  sources: readonly RadarSource[];
  newsItems: readonly unknown[];
  existing?: readonly InboxCandidateShape[];
  observedAt: string;
  windowDays?: number;
}): RadarResult;

export declare function summarize(inbox: readonly InboxCandidateShape[]): InboxStats;
export declare function serializeInbox(inbox: readonly InboxCandidateShape[]): string;
