import type { z } from 'zod';

/**
 * Types for the verification stage.
 *
 * Same arrangement as the radar and triage cores: the implementation is `.mjs`
 * so it runs on plain Node, and the surface is declared here so the suite still
 * type-checks the boundary where a claim becomes citable.
 */

export declare const VerificationDecision: z.ZodEnum<
  ['verified', 'insufficient', 'contradicted']
>;
export type VerificationDecision = z.infer<typeof VerificationDecision>;

export type VerificationEventType =
  | 'anuncio'
  | 'lanzamiento'
  | 'actualizacion'
  | 'preview-beta'
  | 'disponibilidad-general'
  | 'retirada';

export type VerificationAvailability =
  | 'announced'
  | 'preview'
  | 'limited'
  | 'available'
  | 'deprecated'
  | 'unknown';

export type FreePlanState = 'yes' | 'no' | 'unverified';

export interface PrimarySourceShape {
  url: string;
  label: string;
  kind: 'official' | 'release-notes' | 'pricing' | 'docs' | 'repo' | 'model-card';
  publisher: string;
  checkedAt: string;
  reachable: boolean;
  unreachableReason: string | null;
  redirectedTo: string | null;
}

export interface VerifiedFactShape {
  fact: string;
  quote: string;
  sourceUrl: string;
}

export interface VerificationRecordShape {
  candidateId: string;
  title: string;
  checkedAt: string;
  decision: VerificationDecision;
  primarySources: PrimarySourceShape[];
  verifiedFacts: VerifiedFactShape[];
  unconfirmed: string[];
  eventType: VerificationEventType | null;
  availability: VerificationAvailability | null;
  affectsFreePlan: FreePlanState;
  verificationNotes: string;
}

export interface VerificationStats {
  total: number;
  byDecision: Partial<Record<VerificationDecision, number>>;
  writable: number;
  unreachableSources: number;
}

export declare const EVENT_TYPES: readonly string[];
export declare const AVAILABILITIES: readonly string[];
export declare const FREE_PLAN_STATES: readonly string[];

export declare const PrimarySource: z.ZodType<PrimarySourceShape>;
export declare const VerifiedFact: z.ZodType<VerifiedFactShape>;
export declare const VerificationRecord: z.ZodType<VerificationRecordShape>;
export declare const Verification: z.ZodType<VerificationRecordShape[]>;

export declare function canBeWritten(record: VerificationRecordShape): boolean;
export declare function summarizeVerification(
  records: readonly VerificationRecordShape[]
): VerificationStats;
export declare function serializeVerification(
  records: readonly VerificationRecordShape[]
): string;
