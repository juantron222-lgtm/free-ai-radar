/**
 * Tipos del núcleo del vigilante de citas. La implementación es `.mjs`
 * porque la ejecuta Node a secas desde scripts/vigilante-citas.mjs.
 */

export type EstadoDeCita = 'intacta' | 'parcial' | 'desaparecida';

export interface ResultadoDeCita {
  estado: EstadoDeCita;
  fragmentos: string[];
  faltan: string[];
}

export declare function normalizar(texto: string): string;
export declare function fragmentosDeCita(cita: string): string[];
export declare function comprobarCita(cita: string, textoDePagina: string): ResultadoDeCita;
export declare function paginaLegible(pagina: { status: number | null | undefined; texto: string }): {
  legible: boolean;
  motivo?: string;
};
