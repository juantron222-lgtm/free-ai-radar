/**
 * Tipos de la medida de cobertura.
 *
 * La implementación es `.mjs` porque la comparten la línea de órdenes y la
 * pasada diaria, que corre dentro de una función serverless.
 */

export interface FuenteInactiva {
  id: string;
  nombre: string;
  /** Último día en que aportó un candidato, o `null` si nunca aportó. */
  ultimaVez: string | null;
  diasSin: number | null;
  motivo: string;
}

export interface FilaEmbudo {
  id: string;
  nombre: string;
  candidatos: number;
  /** Los que llegaron a un veredicto: se abrió la página y se juzgó. */
  leidos: number;
  verificados: number;
  publicados: number;
  ultimaVez: string | null;
}

export declare const DIAS_SIN_APORTAR: number;

/**
 * Lo que hace falta de un candidato: de qué fuente vino y cuándo se vio.
 *
 * Se aceptan las dos escrituras porque las dos existen: `discovered_via` es
 * como lo guarda Supabase y `discoveredVia` como lo pasa el radar. Declararlo
 * así es más honesto que pedir un objeto cualquiera.
 */
export interface AportacionDeFuente {
  discovered_via?: string | null;
  discoveredVia?: string | null;
  observed_at?: string | null;
  observedAt?: string | null;
}

export interface FuenteConfigurada {
  id: string;
  name?: string;
  enabled?: boolean;
  /**
   * Día en que se añadió, `YYYY-MM-DD`.
   *
   * Sirve para no llamar «callada» a una fuente que acaba de entrar. Es
   * opcional: sin él se asume anterior a la ventana, que es lo correcto para
   * las que ya llevaban tiempo cuando esto se escribió.
   */
  since?: string;
}

export declare function fuentesInactivas(
  candidatos: ReadonlyArray<AportacionDeFuente>,
  fuentes: ReadonlyArray<FuenteConfigurada>,
  opciones?: { hoy?: Date | string; dias?: number }
): FuenteInactiva[];

export declare function embudoDesdeHistorial(datos: {
  candidatos: ReadonlyArray<Record<string, unknown>>;
  verificaciones: ReadonlyArray<Record<string, unknown>>;
  publicadas: ReadonlyArray<Record<string, unknown>>;
  fuentes: ReadonlyArray<FuenteConfigurada>;
}): FilaEmbudo[];
