import type { Tool } from '@lib/domain/tool';
import type { TriState } from '@lib/domain/primitives';
import { TRI_STATE_LABEL } from '@lib/domain/primitives';
import { getAllTools } from './catalog';
import { freeAccessLabel } from './category-page';
import { VERTICALES, destacadas } from './home';
import { ROUTES, VERTICALS } from '@lib/nav';

/**
 * Lo que la portada necesita saber, calculado una vez y en un sitio.
 *
 * La portada anterior contaba tres historias con los mismos datos —seis atajos,
 * seis tarjetas y un bloque de cifras— y cada una los pedía a su manera. Aquí
 * están las dos cosas que la nueva enseña: qué condiciones cumple una
 * herramienta concreta y cuántas cumplen cada condición. Nada de esto opina:
 * son recuentos sobre datos ya verificados.
 */

export type Tono = 'bien' | 'mal' | 'neutro';

export interface Condicion {
  etiqueta: string;
  tono: Tono;
  /** Si el dato no está confirmado, para poder marcarlo distinto de un «no». */
  sinConfirmar: boolean;
}

/**
 * Un triestado, con el tono que le corresponde a esa pregunta.
 *
 * «¿Pide tarjeta? No» es una buena noticia y «¿Uso comercial? No» es una mala:
 * el tono no puede salir del valor, tiene que salir de la pregunta. Y «sin
 * verificar» no es ninguna de las dos cosas, así que va aparte.
 */
function condicion(valor: TriState, bueno: 'yes' | 'no'): Condicion {
  if (valor === 'unverified') {
    return { etiqueta: TRI_STATE_LABEL.unverified, tono: 'neutro', sinConfirmar: true };
  }
  if (valor === 'partial') {
    return { etiqueta: TRI_STATE_LABEL.partial, tono: 'neutro', sinConfirmar: false };
  }
  return { etiqueta: TRI_STATE_LABEL[valor], tono: valor === bueno ? 'bien' : 'mal', sinConfirmar: false };
}

export interface FilaEvidencia {
  slug: string;
  nombre: string;
  /** Qué da gratis: el tipo, y la cantidad sólo si el fabricante la publica. */
  tipoDeAcceso: string;
  cantidad: string;
  tarjeta: Condicion;
  registro: Condicion;
  comercial: Condicion;
}

export function filaDe(tool: Tool): FilaEvidencia {
  const acceso = freeAccessLabel(tool);
  return {
    slug: tool.slug,
    nombre: tool.name,
    tipoDeAcceso: acceso.kind,
    cantidad: acceso.amount ?? acceso.amountFallback,
    tarjeta: condicion(tool.freePlan.requiresCreditCard, 'no'),
    registro: condicion(tool.freePlan.requiresSignup, 'no'),
    comercial: condicion(tool.freePlan.commercialUse, 'yes'),
  };
}

export interface Recomendada {
  tool: Tool;
  fila: FilaEvidencia;
  /** La clase de IA por la que entra: dice por qué está en la lista. */
  clase: string;
}

/**
 * Las herramientas con las que empezar, desde la portada.
 *
 * Salen de `destacadas()`, que ya resuelve la pregunta difícil —cuál de cada
 * vertical— con un criterio que se puede comprobar: usable hoy sin pagar ni
 * instalar, acceso comprobado contra la fuente y capacidades citadas. La
 * portada no vuelve a elegir; sólo enseña menos de las que hay, y dice de qué
 * clase es cada una para que un nombre desconocido no llegue sin contexto.
 */
export function recomendadas(limite = 5): Recomendada[] {
  return destacadas(6)
    .slice(0, limite)
    .map(({ vertical, tool }) => {
      const ruta = VERTICALES.find((v) => v.id === vertical)?.ruta;
      return {
        tool,
        fila: filaDe(tool),
        clase: VERTICALS.find((v) => v.href === ruta)?.label ?? vertical,
      };
    });
}

export interface Conteo {
  clave: string;
  etiqueta: string;
  n: number;
  /** El filtro del catálogo que enseña exactamente estas fichas. */
  href: string;
}

/**
 * Las condiciones que de verdad deciden, con cuántas las cumplen.
 *
 * Estaban dentro de `/herramientas`, a un clic y un desplazamiento. Son la
 * respuesta a «¿qué puedo encontrar aquí?», así que van en la portada con su
 * cifra: una casilla sin número obliga a pulsarla para saber si vale la pena.
 */
export function conteosDeDecision(tools: readonly Tool[] = getAllTools()): Conteo[] {
  return [
    {
      clave: 'nocard',
      etiqueta: 'Sin tarjeta',
      n: tools.filter((t) => t.freePlan.requiresCreditCard === 'no').length,
      href: `${ROUTES.tools}?nocard=1`,
    },
    {
      clave: 'nosignup',
      etiqueta: 'Sin registro',
      n: tools.filter((t) => t.freePlan.requiresSignup === 'no').length,
      href: `${ROUTES.tools}?nosignup=1`,
    },
    {
      clave: 'comm',
      etiqueta: 'Uso comercial',
      n: tools.filter((t) => t.freePlan.commercialUse === 'yes').length,
      href: `${ROUTES.tools}?comm=1`,
    },
    {
      clave: 'oss',
      etiqueta: 'Open source',
      n: tools.filter((t) => t.openSource === 'yes').length,
      href: `${ROUTES.tools}?oss=1`,
    },
  ];
}
