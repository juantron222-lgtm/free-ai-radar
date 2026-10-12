/**
 * Índice de opacidad: qué fabricantes callan lo que necesitas saber.
 *
 * Para cada herramienta se miran los hechos que deciden si su plan gratuito
 * te sirve —si pide tarjeta, si puedes usar el resultado para trabajar, si
 * marca lo que generas, si entrena con tus datos y cuánto da gratis— y cada
 * uno cae en una de tres casillas:
 *
 *   publicado     el fabricante lo dice (evidencia `stated`, o la cuota
 *                 escrita en `creditsAmount`);
 *   noPublicado   miramos donde había que mirar y calla (`not_published`, o
 *                 un límite que dice que la cantidad no se publica);
 *   pendiente     todavía no lo hemos comprobado.
 *
 * El índice es `noPublicado / (publicado + noPublicado)`. Lo pendiente queda
 * fuera a propósito: es deuda nuestra, no opacidad suya, y contarlo culparía
 * a un fabricante de lo que aún no hemos leído.
 *
 * Sólo cuentan los hechos que tienen sentido para cada herramienta: la
 * tarjeta, el registro y el entrenamiento sólo en servicios en la nube; la
 * marca de agua sólo en lo que genera archivos; y nada de esto en lo que no
 * tiene acceso gratuito.
 */
import type { Tool } from '@lib/domain/tool';

export type Casilla = 'publicado' | 'noPublicado' | 'pendiente';

export interface HechoDeOpacidad {
  clave: 'tarjeta' | 'comercial' | 'marca' | 'entrenamiento' | 'cuota';
  etiqueta: string;
  casilla: Casilla;
}

export interface OpacidadDeFicha {
  slug: string;
  nombre: string;
  hechos: HechoDeOpacidad[];
  publicados: number;
  noPublicados: number;
  pendientes: number;
  /** null si no hay ningún hecho comprobado en ninguno de los dos sentidos. */
  indice: number | null;
}

const GENERA_ARCHIVOS = new Set([
  'text-to-image', 'image-to-image', 'image-editing', 'inpainting', 'outpainting', 'upscaling',
  'background-removal', 'text-to-video', 'image-to-video', 'video-editing', 'avatar-video',
  'text-to-speech', 'text-to-music', 'voice-clone', 'dubbing', 'sound-effects',
]);

const NO_PUBLICA_CUANTO = /\b(no (se )?publica(n)?|sin publicar|sin cifra publicada)\b/i;

function casillaDe(tool: Tool, campo: string, valor: string | undefined): Casilla {
  const ev = tool.evidence.find((e) => e.field === campo);
  if (valor && valor !== 'unverified') return 'publicado';
  if (ev?.outcome === 'not_published') return 'noPublicado';
  return 'pendiente';
}

export function opacidadDe(tool: Tool): OpacidadDeFicha {
  const hechos: HechoDeOpacidad[] = [];
  const conAccesoGratis = tool.freeModel !== 'paid_only';
  const enLaNube = tool.hosting === 'cloud' || tool.hosting === 'hybrid';
  if (conAccesoGratis) {
    if (enLaNube) {
      hechos.push({ clave: 'tarjeta', etiqueta: 'Si pide tarjeta', casilla: casillaDe(tool, 'freePlan.requiresCreditCard', tool.freePlan.requiresCreditCard) });
    }
    hechos.push({ clave: 'comercial', etiqueta: 'Si permite uso comercial', casilla: casillaDe(tool, 'freePlan.commercialUse', tool.freePlan.commercialUse) });
    if (enLaNube && tool.capabilities.some((c) => GENERA_ARCHIVOS.has(c))) {
      hechos.push({ clave: 'marca', etiqueta: 'Si pone marca de agua', casilla: casillaDe(tool, 'freePlan.hasWatermark', tool.freePlan.hasWatermark) });
    }
    if (enLaNube) {
      hechos.push({ clave: 'entrenamiento', etiqueta: 'Si entrena con tus datos', casilla: casillaDe(tool, 'privacy.trainsOnUserData', tool.privacy.trainsOnUserData) });
      const cuota: Casilla = tool.freePlan.creditsAmount?.trim()
        ? 'publicado'
        : tool.freePlan.limits.some((l) => NO_PUBLICA_CUANTO.test(l))
          ? 'noPublicado'
          : 'pendiente';
      hechos.push({ clave: 'cuota', etiqueta: 'Cuánto da gratis', casilla: cuota });
    }
  }
  const cuenta = (c: Casilla) => hechos.filter((h) => h.casilla === c).length;
  const publicados = cuenta('publicado');
  const noPublicados = cuenta('noPublicado');
  const comprobados = publicados + noPublicados;
  return {
    slug: tool.slug,
    nombre: tool.name,
    hechos,
    publicados,
    noPublicados,
    pendientes: cuenta('pendiente'),
    indice: comprobados === 0 ? null : noPublicados / comprobados,
  };
}

/**
 * El ranking: sólo fichas con al menos `minimo` hechos comprobados, para que
 * un 1 de 1 no encabece la lista. Ordenado de más a menos opaco y, a igualdad,
 * por más hechos callados.
 */
export function rankingDeOpacidad(tools: readonly Tool[], minimo = 3): OpacidadDeFicha[] {
  return tools
    .filter((t) => t.verification !== 'discontinued')
    .map(opacidadDe)
    .filter((o) => o.indice !== null && o.publicados + o.noPublicados >= minimo)
    .sort((a, b) => b.indice! - a.indice! || b.noPublicados - a.noPublicados || a.nombre.localeCompare(b.nombre));
}
