/**
 * Tipos del lector de fechas visibles.
 *
 * Mismo arreglo que el resto de núcleos puros: la implementación es `.mjs`
 * porque la comparten el radar y el verificador, que corren con Node a secas.
 */

export interface FechaVisible {
  /** Día en ISO, `YYYY-MM-DD`. */
  value: string;
  /** El texto exacto que la sostiene, tal y como aparece en la página. */
  quote: string;
}

export declare const VENTANA_CABECERA: number;

export declare function fechaVisible(
  texto: string,
  opciones?: { hoy?: Date; ventana?: number }
): FechaVisible | null;
