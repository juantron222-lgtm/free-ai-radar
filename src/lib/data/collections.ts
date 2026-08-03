import type { Tool } from '@lib/domain/tool';
import { getAllTools } from './catalog';

/**
 * Curated collections.
 *
 * Each one answers a question people actually type into a search box, and each
 * is a *rule* over verified data rather than a hand-maintained list — so a
 * collection can never quietly contradict the fichas it links to.
 */

export interface Collection {
  slug: string;
  title: string;
  h1: string;
  lede: string;
  description: string;
  /** Long-form explanation shown under the grid. */
  context: string;
  match: (tool: Tool) => boolean;
}

export const COLLECTIONS: readonly Collection[] = [
  {
    slug: 'sin-tarjeta',
    title: 'IA gratis sin tarjeta de crédito',
    h1: 'IA gratis que no te pide la tarjeta',
    lede: 'Verificado una por una: estas herramientas no exigen introducir una tarjeta para usar su plan gratuito.',
    description:
      'Herramientas de IA con plan gratuito real que no piden tarjeta de crédito. Verificadas contra la página oficial, con fecha de comprobación.',
    context: `Pedir la tarjeta "sólo para verificar" es el patrón más rentable del sector: convierte una prueba en una suscripción por inercia, porque casi nadie cancela a tiempo. Por eso lo tratamos como un dato de primer nivel y lo penalizamos en la puntuación.

Aquí sólo aparecen las herramientas donde hemos **confirmado** que no hace falta tarjeta. Las que no hemos podido verificar no entran: un "no lo sé" no vale como garantía.`,
    match: (tool) => tool.freePlan.requiresCreditCard === 'no',
  },
  {
    slug: 'uso-comercial',
    title: 'IA gratis con derecho a uso comercial',
    h1: 'IA gratis que puedes usar para trabajar',
    lede: 'Su plan gratuito permite monetizar lo que generes. Es la condición que más veces falla en silencio.',
    description:
      'Herramientas de IA cuyo plan gratuito permite uso comercial del resultado. Con licencia verificada y fecha de comprobación.',
    context: `Mucha gente descubre el problema tarde: has generado el material, se lo has entregado al cliente y entonces lees que el plan gratuito era "sólo para uso personal". La licencia de lo que generas es tan importante como la calidad.

Estas herramientas permiten explícitamente uso comercial en su capa gratuita. Aun así, revisa siempre los términos concretos antes de un encargo grande: algunas limitan por volumen o por tipo de proyecto, y esos matices están anotados en cada ficha.`,
    match: (tool) => tool.freePlan.commercialUse === 'yes',
  },
  {
    slug: 'en-local',
    title: 'IA que funciona en tu ordenador',
    h1: 'IA que se ejecuta en tu propio equipo',
    lede: 'Sin cuotas, sin límites de uso y sin enviar tus archivos a nadie. El coste se traslada a tu hardware.',
    description:
      'Herramientas de IA que se ejecutan localmente: sin suscripción, sin límites de generación y sin que tus datos salgan de tu equipo.',
    context: `Ejecutar el modelo en tu máquina cambia la ecuación entera. No hay cuota mensual, no hay límite de generaciones y, sobre todo, no hay una empresa decidiendo el mes que viene que tu plan gratuito ahora cuesta 20 € al mes.

A cambio necesitas hardware: para modelos de imagen y vídeo, una GPU con VRAM suficiente; para modelos de lenguaje, memoria. Cada ficha indica los requisitos concretos cuando los hemos verificado.`,
    match: (tool) => tool.hosting === 'local' || tool.hosting === 'hybrid',
  },
  {
    slug: 'open-source',
    title: 'IA open source gratuita',
    h1: 'IA de código abierto',
    lede: 'Código o pesos abiertos: gratis por licencia, no por cortesía comercial. Nadie te lo puede quitar.',
    description:
      'Herramientas de IA open source verificadas. Su gratuidad no depende de una decisión comercial futura.',
    context: `La diferencia entre "gratis" y "open source" es quién controla el interruptor. Un plan gratuito lo decide una empresa y puede retirarlo mañana. Una licencia abierta no se revoca sobre el software que ya tienes.

Es la única categoría donde la palabra "gratis" no lleva asterisco. Por eso suma puntos en la fórmula.`,
    match: (tool) => tool.openSource === 'yes',
  },
  {
    slug: 'sin-marca-de-agua',
    title: 'IA gratis sin marca de agua',
    h1: 'IA gratis que no marca el resultado',
    lede: 'El plan gratuito entrega el resultado limpio, sin logotipo ni firma superpuesta.',
    description:
      'Herramientas de IA cuyo plan gratuito entrega resultados sin marca de agua. Verificado con fecha.',
    context: `La marca de agua es la forma más común de hacer que un plan "gratuito" no sirva para nada entregable. Puedes practicar, no puedes trabajar.

Estas herramientas entregan el resultado limpio en su capa gratuita. Comprueba también la fila de uso comercial: no tener marca de agua y poder monetizar son dos permisos distintos, y no siempre vienen juntos.`,
    match: (tool) => tool.freePlan.hasWatermark === 'no',
  },
  {
    slug: 'para-creadores',
    title: 'IA gratis para creadores de contenido',
    h1: 'Para quien produce por su cuenta',
    lede: 'Las que mejor resuelven el trabajo de alguien que crea contenido sin presupuesto ni equipo.',
    description:
      'Selección de herramientas de IA gratuitas orientadas a creadores independientes: imagen, vídeo, voz y edición sin coste.',
    context: `Esta colección cruza tres condiciones: puntuación alta en valor para creadores, capa gratuita utilizable de verdad y ausencia de las trampas que más estorban a quien entrega trabajo — marca de agua y restricción comercial.

No es una lista de "lo más popular": es lo que sobrevive a mirar la letra pequeña.`,
    match: (tool) =>
      tool.scores.creatorValue >= 7 &&
      tool.freePlan.hasWatermark !== 'yes' &&
      tool.freeModel !== 'demo' &&
      tool.freeModel !== 'paid_only',
  },
  {
    slug: 'sin-registro',
    title: 'IA gratis sin registrarse',
    h1: 'IA que puedes usar sin crear cuenta',
    lede: 'Entras, la usas y te vas. Sin correo, sin contraseña, sin lista de distribución.',
    description:
      'Herramientas de IA utilizables sin crear cuenta. Verificado contra la página oficial.',
    context: `Poder probar algo sin dejar un correo es cada vez más raro, y es exactamente lo que quieres cuando sólo necesitas resolver una cosa puntual.

Ojo: no registrarse no significa que no se procesen tus datos. Revisa la sección de privacidad de cada ficha para saber qué pasa con lo que subes.`,
    match: (tool) => tool.freePlan.requiresSignup === 'no',
  },
] as const;

export function getCollection(slug: string): Collection | undefined {
  return COLLECTIONS.find((collection) => collection.slug === slug);
}

export function getCollectionTools(collection: Collection): Tool[] {
  return getAllTools()
    .filter(collection.match)
    .sort((a, b) => b.scoreTotal - a.scoreTotal);
}

/** Only collections with enough entries to be worth a page. */
export function getPopulatedCollections(): Array<Collection & { count: number }> {
  return COLLECTIONS.map((collection) => ({
    ...collection,
    count: getCollectionTools(collection).length,
  })).filter((collection) => collection.count >= 2);
}
