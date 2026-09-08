/**
 * Tipos de la política de recall.
 *
 * Mismo arreglo que el resto de núcleos puros: la implementación es `.mjs`
 * porque la comparte la pasada diaria, que corre dentro de una función
 * serverless, con la línea de órdenes que la audita.
 */

/**
 * Lo que hace falta de un registro de triaje para decidir si merece leerse.
 *
 * Es un subconjunto de lo que devuelve `runTriage`, declarado por lo que se usa
 * y no por lo que existe: este módulo no puede depender de campos que no mira.
 */
export interface RegistroTriado {
  id: string;
  title: string;
  canonicalUrl: string;
  publisher: string;
  publishedAt: string | null;
  triageDecision: string;
  triageScore: number;
  eventClass: string;
  product: string | null;
  vertical: string;
}

export interface Seleccion<T = RegistroTriado> {
  /** Lo que se va a leer, ya ordenado: promocionadas primero. */
  seleccionadas: T[];
  promovidas: T[];
  recall: T[];
  /** Cuántas de la banda se quedaron sin sitio. Es el coste del presupuesto. */
  sinSitio: number;
}

export declare const UMBRAL_INVESTIGACION: number;
export declare const PRESUPUESTO_POR_PASADA: number;
export declare const MAX_POR_FABRICANTE: number;

export declare function prioridad(
  registro: Pick<RegistroTriado, 'publishedAt' | 'eventClass' | 'product' | 'triageScore'>,
  opciones?: { hoy?: string; productosVistos?: ReadonlySet<string | null> }
): number;

export declare function intercalarPorFabricante<T extends { publisher?: string | null }>(
  lista: readonly T[]
): T[];

export declare function seleccionarParaInvestigar<T extends RegistroTriado>(
  triaje: readonly T[],
  opciones?: {
    hoy?: string;
    yaVerificados?: ReadonlySet<string>;
    presupuesto?: number;
    maxPorFabricante?: number;
    umbral?: number;
  }
): Seleccion<T>;

/** `80+`, `75-79`, `70-74` o `<70`. Sólo para el informe. */
export declare function banda(score: number): string;
