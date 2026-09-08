/**
 * Tipos del comparador de esquemas.
 *
 * Mismo arreglo que el resto de núcleos puros del repositorio: la
 * implementación es `.mjs` porque el `prebuild` la ejecuta con Node a secas,
 * antes de que exista nada compilado, y la superficie se declara aquí para que
 * el `strictest` del proyecto siga comprobando quien la usa.
 */

/** Una columna, tal y como la declara la migración o la publica PostgREST. */
export interface ColumnaEsperada {
  /** Nombre canónico de PostgreSQL, no el alias con que se declaró. */
  tipo: string;
  noNulo: boolean;
  clave: boolean;
  unica?: boolean;
}

export type Esquema = Record<string, Record<string, ColumnaEsperada>>;

export interface Diferencias {
  /** Rompen la pasada diaria: detienen el build. */
  fallos: string[];
  /** No rompen nada: se cuentan y se sigue. */
  avisos: string[];
  ok: boolean;
}

export interface Sondeo {
  ok: boolean;
  motivo: string;
}

export interface SondeoAnon {
  ok: boolean;
  /** Tablas que respondieron 200 a `anon`, que es acceso abierto. */
  abiertas: string[];
}

export interface InformeEsquema {
  ok: boolean;
  tablas: number;
  presentes: number;
  columnas: number;
  fallos: string[];
  avisos: string[];
  unicidad: Sondeo;
  anon: SondeoAnon | null;
}

export interface Credenciales {
  url: string;
  key: string;
  anonKey?: string;
  fetchImpl?: typeof fetch;
}

export declare const MIGRACION: string;

export declare function esquemaEsperado(sql?: string): Esquema;
export declare function esquemaVivo(spec: Record<string, unknown>): Esquema;
export declare function compararEsquema(esperado: Esquema, vivo: Esquema): Diferencias;

export declare function inspeccionar(
  credenciales: Omit<Credenciales, 'anonKey'>
): Promise<Record<string, unknown>>;

export declare function sondearUnicidad(
  credenciales: Omit<Credenciales, 'anonKey'>
): Promise<Sondeo>;

export declare function sondearAnon(credenciales: {
  url: string;
  anonKey: string;
  tablas: readonly string[];
  fetchImpl?: typeof fetch;
}): Promise<SondeoAnon>;

export declare function verificarEsquema(credenciales: Credenciales): Promise<InformeEsquema>;
export declare function imprimirInforme(informe: InformeEsquema, destino?: string): void;
