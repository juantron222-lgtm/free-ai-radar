import type { FetchFeed, FetchPage } from './adapters.d.mts';
import type { VerificationRecordShape } from './verification.d.mts';

/**
 * Tipos de la verificación automática.
 *
 * `fetchFeed` es opcional a propósito: hay fabricantes cuyo artículo se lee sin
 * problema y que no publican feed, y obligar a pasar uno convertiría en error
 * de tipos lo que es una decisión editorial por fabricante.
 */

export interface VerifyCandidateInput {
  id: string;
  title: string;
  url?: string;
  canonicalUrl: string;
  publisher: string;
  vertical?: string;
}

export declare function verifyCandidate(
  candidate: VerifyCandidateInput,
  io: { fetchPage: FetchPage; fetchFeed?: FetchFeed | null; checkedAt: string }
): Promise<VerificationRecordShape & { canonicalUrl?: string; title?: string }>;
