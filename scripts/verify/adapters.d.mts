/**
 * Tipos de los adaptadores de fuentes oficiales.
 *
 * Mismo arreglo que el resto de núcleos puros del repositorio: la
 * implementación es `.mjs` porque tiene que correr en Node a secas, y la
 * superficie se declara aquí para que el `strictest` del proyecto siga
 * comprobando el sitio donde se decide qué puede afirmarse.
 */

export type EvidenceVia = 'feed' | 'html';

export type FactType = 'date' | 'title' | 'availability' | 'pricing' | 'free-access' | 'licence';

/**
 * Una pieza de evidencia.
 *
 * Las cuatro cosas que nunca faltan: de qué clase de hecho se trata, qué dice
 * literalmente, de qué URL salió y por qué vía. Sin cualquiera de ellas la
 * afirmación no puede rastrearse hasta el fabricante.
 */
export interface Evidence {
  factType: FactType;
  value: string | null;
  quote: string;
  sourceUrl: string;
  via: EvidenceVia;
  eventType?: string;
  publishedAt?: string | null;
}

export interface FeedEntry {
  title: string;
  url: string;
  publishedAt: string | null;
  rawDate: string;
  body: string;
  feedUrl: string;
}

export interface SourceStrategy {
  feed: string | null;
  prefer: EvidenceVia;
  note: string;
}

export interface FetchedPage {
  ok: boolean;
  status: number;
  body: string;
}

export type FetchPage = (url: string) => Promise<FetchedPage>;
export type FetchFeed = (url: string) => Promise<string>;

export interface GatheredEvidence {
  evidence: Evidence[];
  notes: string[];
  htmlBlocked: string | null;
  strategy: SourceStrategy;
  url: string;
}

export declare const SOURCE_STRATEGY: Record<string, SourceStrategy>;
export declare function strategyFor(publisher: string): SourceStrategy;

export declare function parseFeed(xml: string, feedUrl: string): FeedEntry[];
export declare function evidenceFromEntry(entry: FeedEntry): Evidence[];
export declare function evidenceFromHtml(
  html: string,
  url: string
): { evidence: Evidence[]; blocked: string | null };

export declare function gatherEvidence(
  candidate: { url?: string; canonicalUrl?: string; publisher: string; title?: string },
  io: { fetchPage: FetchPage; fetchFeed?: FetchFeed | null }
): Promise<GatheredEvidence>;
