import type { Tool } from './tool';
import { MOTIVO_LABEL, motivoDelHueco } from './evidencia';
import { fichaDePago } from './pago';

/**
 * Qué se puede decir del uso comercial de una herramienta, y en qué plan.
 *
 * «Uso comercial: No» se leía como «nunca», y lo verificado es el plan
 * gratuito. ElevenLabs y Murf no lo permiten gratis y sí en su primer plan de
 * pago: «No» a secas era cierto y engañoso a la vez. Ahora cada estado dice a
 * qué plan se refiere:
 *
 *   gratis       permitido en el plan gratuito
 *   solo-pago    no en el gratuito, sí en un plan de pago verificado
 *   condiciones  permitido con condiciones (umbral de usuarios, uso interno…)
 *   no-gratis    no en el gratuito; de los planes de pago no sabemos nada
 *   sin-dato     no comprobado, o el fabricante no lo publica
 *
 * Lo desconocido no se convierte en negativo: un «sin comprobar» nunca pasa a
 * «no», y «no en el gratuito» no dice nada de los planes de pago.
 */
export type EstadoComercial = 'gratis' | 'solo-pago' | 'condiciones' | 'no-gratis' | 'sin-dato';

export interface UsoComercial {
  estado: EstadoComercial;
  /** Para tarjetas y celdas estrechas: siempre con el plan al que se refiere. */
  corta: string;
  /** Para la ficha y los títulos. */
  larga: string;
  tono: 'bien' | 'mal' | 'neutro';
}

export function usoComercialDe(tool: Tool): UsoComercial {
  const valor = tool.freePlan.commercialUse;
  if (valor === 'yes') {
    return { estado: 'gratis', corta: 'Sí, gratis', larga: 'Permitido en el plan gratuito', tono: 'bien' };
  }
  if (valor === 'partial') {
    return {
      estado: 'condiciones',
      corta: 'Con condiciones',
      larga: 'Permitido en el plan gratuito, con condiciones',
      tono: 'neutro',
    };
  }
  if (valor === 'no') {
    const pago = fichaDePago(tool.slug);
    if (pago?.comercialDePago === 'yes') {
      return {
        estado: 'solo-pago',
        corta: 'Sólo de pago',
        larga: `No en el plan gratuito; sí desde el plan ${pago.plan}`,
        tono: 'neutro',
      };
    }
    return {
      estado: 'no-gratis',
      corta: 'No, gratis no',
      larga: 'No permitido en el plan gratuito',
      tono: 'mal',
    };
  }
  const motivo = motivoDelHueco(tool, 'freePlan.commercialUse', valor) ?? 'pendiente';
  return { estado: 'sin-dato', corta: MOTIVO_LABEL[motivo], larga: MOTIVO_LABEL[motivo], tono: 'neutro' };
}
