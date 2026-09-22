/** Tipos de la puerta de legibilidad. Mismo arreglo que los otros núcleos puros. */

export declare function checkReaderReady(draft: {
  title?: string;
  slug?: string;
  summary?: string;
  impact?: string;
}): { ok: boolean; reasons: string[] };
