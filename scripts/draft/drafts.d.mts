import type { z } from 'zod';
import type {
  FreePlanState,
  VerificationAvailability,
  VerificationEventType,
  VerificationRecordShape,
} from '../verify/verification.d.mts';

/** Types for the drafting stage. Same arrangement as the other pure cores. */

export declare const DraftStatus: z.ZodEnum<['draft', 'ready']>;
export type DraftStatus = z.infer<typeof DraftStatus>;

export interface FactTraceShape {
  summary: string[];
  impact: string[];
  eventType: string[];
  availability: string[];
  pricing: string[];
  freePlan: string[];
}

export interface DraftSourceShape {
  url: string;
  label: string;
  kind: 'official' | 'release-notes' | 'pricing' | 'docs' | 'repo' | 'model-card';
  publisher: string;
  checkedAt: string;
}

export interface DraftShape {
  candidateId: string;
  id: string;
  slug: string;
  title: string;
  summary: string;
  impact: string;
  category: string;
  eventType: VerificationEventType;
  availability: VerificationAvailability;
  affectsFreePlan: FreePlanState;
  relatedTools: string[];
  officialUrl: string;
  sources: DraftSourceShape[];
  factTrace: FactTraceShape;
  status: DraftStatus;
}

export interface GateResult {
  ok: boolean;
  reasons: string[];
}

export declare const FactTrace: z.ZodType<FactTraceShape>;
export declare const Draft: z.ZodType<DraftShape>;
export declare const Drafts: z.ZodType<DraftShape[]>;

export declare function checkDraft(
  draft: DraftShape,
  record: VerificationRecordShape | undefined
): GateResult;

export declare function gateDrafts(
  drafts: readonly DraftShape[],
  verification: readonly VerificationRecordShape[]
): Array<GateResult & { slug: string }>;

export declare function serializeDrafts(drafts: readonly DraftShape[]): string;
