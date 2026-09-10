import type { z } from 'zod';
import {
  Confianza as ConfianzaJs,
  Hecho as HechoJs,
  Hechos as HechosJs,
  Naturaleza as NaturalezaJs,
  TipoHecho as TipoHechoJs,
  exigenAtribucion,
  normalizar,
  suficienteParaRedactar,
  verificarCitas,
} from '../../../scripts/publicar/gates.mjs';

/**
 * Lo que el agente lector devuelve antes de escribir una sola frase.
 *
 * La implementación vive en `scripts/publicar/gates.mjs` porque la comparten el
 * dominio y el publicador, y el publicador corre con Node a secas: es el mismo
 * arreglo que `dateline.mjs` y `newsroom-cobertura.mjs`. Aquí sólo se le ponen
 * los tipos, para que el `strictest` del proyecto siga comprobando a quien la
 * usa. Una segunda copia en TypeScript se separaría de ésta en la primera
 * corrección, y entonces el publicador y el dominio comprobarían cosas
 * distintas creyendo comprobar la misma.
 *
 * El contrato, para quien llegue aquí primero:
 *
 *   afirmación   lo que sostenemos
 *   cita         el texto exacto del artículo que lo sostiene
 *   fuente       de qué URL salió
 *   fecha        cuándo lo publicó el fabricante
 *   tipo         de qué clase de hecho hablamos
 *   confianza    cuánto de firme es
 *   naturaleza   dato, atribución o interpretación
 *
 * Y la pieza que hace que valga algo: `verificarCitas` vuelve a descargar el
 * artículo y comprueba que **cada cita aparece literalmente**. Una cita
 * inventada no pasa, por bien escrita que esté la noticia.
 */

export const TipoHecho = TipoHechoJs as z.ZodEnum<
  [
    'que-ha-pasado',
    'cifra',
    'fecha',
    'disponibilidad',
    'precio',
    'licencia',
    'partes',
    'capacidad',
    'limitacion',
    'contexto',
  ]
>;
export type TipoHecho = z.infer<typeof TipoHecho>;

export const Confianza = ConfianzaJs as z.ZodEnum<['alta', 'media', 'baja']>;
export type Confianza = z.infer<typeof Confianza>;

export const Naturaleza = NaturalezaJs as z.ZodEnum<['dato', 'atribucion', 'interpretacion']>;
export type Naturaleza = z.infer<typeof Naturaleza>;

export interface Hecho {
  afirmacion: string;
  cita: string;
  fuente: string;
  fecha: string;
  tipo: TipoHecho;
  confianza: Confianza;
  naturaleza: Naturaleza;
}

export const Hecho = HechoJs as z.ZodType<Hecho>;
export const Hechos = HechosJs as z.ZodType<Hecho[]>;

export interface CitaComprobada {
  hecho: Hecho;
  literal: boolean;
}

export { exigenAtribucion, normalizar, suficienteParaRedactar, verificarCitas };
