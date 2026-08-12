#!/usr/bin/env node
/**
 * Adds the image tools whose critical data could be quoted from an official
 * page, and only those.
 *
 * Eighteen candidates were checked. Eight are here. The other ten are absent on
 * purpose: Ideogram and NightCafe answer 403, Krea's pricing page fails to
 * load, and for FLUX, fal.ai, Freepik, Photoroom, Stability, Topaz, Draw Things
 * and Playground's competitors the pages that load never state a free plan —
 * their credit figures belong to paid tiers, which is exactly the confusion
 * this rebuild exists to remove.
 *
 * Every `yes`/`no` below carries the sentence that proves it. Anything the page
 * did not say is `unverified`, including things that are almost certainly true.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOY = '2026-08-12';

const base = (o) => ({
  id: `tool_${o.slug}`,
  kind: 'app',
  verification: 'verified',
  nextReviewAt: '2026-11-12',
  categorySlug: 'imagen',
  secondaryCategories: [],
  tags: [],
  useCases: [],
  openSource: 'no',
  hosting: 'cloud',
  platforms: ['web'],
  languages: ['en'],
  skillLevel: 'beginner',
  privacy: {},
  sources: [],
  pros: [],
  cons: [],
  bestFor: [],
  notFor: [],
  alternatives: [],
  alternativeNames: [],
  changelog: [],
  affiliation: { isAffiliate: false },
  sponsorship: { isSponsored: false },
  status: 'published',
  detectedAt: HOY,
  lastVerifiedAt: HOY,
  updatedAt: `${HOY}T00:00:00.000Z`,
  ...o,
});

const NUEVAS = [
  base({
    slug: 'clipdrop',
    name: 'Clipdrop',
    tagline: 'Generación y edición de imagen con cuotas gratuitas que se renuevan cada 24 horas.',
    descriptionShort:
      'Suite de imagen en el navegador: texto a imagen, quitar fondo, reencuadrar, escalar y limpiar. Su plan gratuito asigna cuotas por herramienta que se renuevan cada 24 horas.',
    officialUrl: 'https://clipdrop.co/',
    pricingUrl: 'https://clipdrop.co/pricing',
    freeModel: 'credits',
    freePlan: {
      summary:
        'Plan gratuito con cuotas por herramienta que se renuevan cada 24 horas: 20 usos en quitar fondo, escalado, limpieza y reiluminación, y 50 en el borrador de texto.',
      limits: ['Background Removal 20/24h', 'Image Upscaler x2 20/24h', 'Cleanup 20/24h', 'Text Remover 50/24h'],
      requiresSignup: 'unverified',
      requiresCreditCard: 'unverified',
      hasWatermark: 'unverified',
      commercialUse: 'unverified',
      creditReset: 'daily',
      creditsAmount: '20/24h por herramienta',
      verifiedAt: HOY,
    },
    scores: { freeReal: 8, usefulness: 8, ease: 9, transparency: 8, creatorValue: 7 },
    verdict:
      'Cuotas diarias documentadas por herramienta, que es justo lo que un catálogo de acceso gratuito debe poder decir.',
    evidence: {
      freePlan: {
        sourceUrl: 'https://clipdrop.co/pricing',
        verifiedAt: HOY,
        quote:
          'Free 0 - Start for free Text to image Uncrop Background Removal 20/24h Image Upscaler x2 20/24h Cleanup 20/24h Relight 20/24h Text Remover 50/24h',
      },
    },
  }),

  base({
    slug: 'playground-ai',
    name: 'Playground',
    tagline: 'Diez imágenes cada tres horas en el plan gratuito, con licencia comercial.',
    descriptionShort:
      'Generador de imagen en el navegador. El plan gratuito documenta su límite —diez imágenes cada tres horas— y concede licencia comercial sobre lo generado.',
    officialUrl: 'https://playground.com/',
    pricingUrl: 'https://playground.com/pricing',
    freeModel: 'credits',
    freePlan: {
      summary:
        'Plan gratuito activo con hasta diez imágenes cada tres horas y tres generaciones mensuales en los modelos premium. La licencia comercial se concede también en el plan gratuito.',
      limits: ['Create up to 10 images every 3 hours', '3 monthly generations across Nano Banana, GPT Image 2, and Seedream', 'Slower generation during peak hours'],
      requiresSignup: 'unverified',
      requiresCreditCard: 'unverified',
      hasWatermark: 'unverified',
      commercialUse: 'yes',
      creditReset: 'daily',
      creditsAmount: '10 imágenes cada 3 horas',
      verifiedAt: HOY,
    },
    scores: { freeReal: 8, usefulness: 8, ease: 9, transparency: 8, creatorValue: 8 },
    verdict:
      'De las pocas que documentan a la vez el límite del plan gratuito y que puedes usar comercialmente lo que genera.',
    evidence: {
      freePlan: {
        sourceUrl: 'https://playground.com/pricing',
        verifiedAt: HOY,
        quote:
          'Free ACTIVE For exploring and casual creation Limited image generation Create up to 10 images every 3 hours Limited model access 3 monthly generations across Nano Banana, GPT Image 2, and Seedream',
      },
      commercialUse: {
        sourceUrl: 'https://playground.com/pricing',
        verifiedAt: HOY,
        quote: 'Commercial use World-wide, royalty free license',
      },
    },
  }),

  base({
    slug: 'recraft',
    name: 'Recraft',
    tagline: 'Generación vectorial y de marca. Lo gratuito no se puede usar comercialmente.',
    descriptionShort:
      'Generador orientado a diseño gráfico y vectores. Su plan gratuito es utilizable, pero las imágenes son propiedad de Recraft y no llevan licencia comercial.',
    officialUrl: 'https://www.recraft.ai/',
    pricingUrl: 'https://www.recraft.ai/pricing',
    freeModel: 'freemium',
    freePlan: {
      summary:
        'Hay plan gratuito, pero las imágenes generadas en él son propiedad de Recraft, se muestran públicamente en la galería de la comunidad y no llevan licencia de uso comercial.',
      limits: ['Las imágenes del plan gratuito son propiedad de Recraft', 'Visibles públicamente en la galería'],
      requiresSignup: 'unverified',
      requiresCreditCard: 'unverified',
      hasWatermark: 'unverified',
      commercialUse: 'no',
      creditReset: 'unknown',
      verifiedAt: HOY,
    },
    scores: { freeReal: 5, usefulness: 8, ease: 9, transparency: 9, creatorValue: 5 },
    verdict:
      'Buena para probar y mala para publicar: el propio fabricante dice que lo gratuito no es tuyo ni se puede usar comercialmente.',
    evidence: {
      commercialUse: {
        sourceUrl: 'https://www.recraft.ai/pricing',
        verifiedAt: HOY,
        quote:
          'Images generated on the Free plan are owned by Recraft. They are publicly visible in the community gallery and are not licensed for commercial use.',
      },
    },
  }),

  base({
    slug: 'pixelcut',
    name: 'Pixelcut',
    tagline: 'Edición de producto con exportación sin marca de agua en el plan gratuito.',
    descriptionShort:
      'Editor de imagen orientado a fotografía de producto: quitar fondo, escalar y generar escenas. El plan gratuito exporta sin marca de agua.',
    officialUrl: 'https://www.pixelcut.ai/',
    pricingUrl: 'https://www.pixelcut.ai/pricing',
    freeModel: 'freemium',
    freePlan: {
      summary:
        'Plan gratuito a 0 $/mes con quitar fondo y escalado limitados, y exportación sin marca de agua.',
      limits: ['Limited Background Removal', 'Limited Upscale'],
      requiresSignup: 'unverified',
      requiresCreditCard: 'unverified',
      hasWatermark: 'no',
      commercialUse: 'unverified',
      creditReset: 'unknown',
      verifiedAt: HOY,
    },
    scores: { freeReal: 7, usefulness: 7, ease: 9, transparency: 8, creatorValue: 7 },
    verdict:
      'Una de las pocas donde «sin marca de agua» está escrito por el fabricante en el propio plan gratuito.',
    evidence: {
      watermark: {
        sourceUrl: 'https://www.pixelcut.ai/pricing',
        verifiedAt: HOY,
        quote: 'Free $0 per month Continue Limited Background Removal Limited Upscale Free export without watermark',
      },
    },
  }),

  base({
    slug: 'adobe-firefly',
    name: 'Adobe Firefly',
    tagline: 'Generaciones gratuitas diarias, según la propia documentación de Adobe.',
    descriptionShort:
      'Suite generativa de Adobe para imagen, vídeo, audio y diseño. Su documentación confirma un plan gratuito con generaciones diarias.',
    officialUrl: 'https://www.adobe.com/products/firefly.html',
    freeModel: 'credits',
    freePlan: {
      summary:
        'Adobe documenta un plan gratuito con generaciones diarias para probar Firefly. No publica la cantidad en esa página, así que no la afirmamos.',
      limits: ['Generaciones diarias, cantidad no publicada en la página oficial'],
      requiresSignup: 'unverified',
      requiresCreditCard: 'unverified',
      hasWatermark: 'unverified',
      commercialUse: 'unverified',
      creditReset: 'daily',
      verifiedAt: HOY,
    },
    scores: { freeReal: 7, usefulness: 8, ease: 9, transparency: 7, creatorValue: 7 },
    verdict:
      'La frecuencia está documentada y la cantidad no. Se registra lo primero y se calla lo segundo.',
    evidence: {
      freePlan: {
        sourceUrl: 'https://www.adobe.com/products/firefly.html',
        verifiedAt: HOY,
        quote:
          'Is Adobe Firefly free to use? Yes, Adobe has a free plan that provides users with free daily generations to try Adobe Firefly',
      },
    },
  }),

  base({
    slug: 'invokeai',
    name: 'InvokeAI',
    tagline: 'Interfaz local de generación con licencia Apache 2.0 y desarrollo activo.',
    descriptionShort:
      'Interfaz profesional para difusión local, con lienzo de edición y control de flujos. Se instala en tu equipo y necesita GPU.',
    officialUrl: 'https://github.com/invoke-ai/InvokeAI',
    repoUrl: 'https://github.com/invoke-ai/InvokeAI',
    kind: 'interface',
    hosting: 'local',
    platforms: ['windows', 'macos', 'linux'],
    skillLevel: 'intermediate',
    openSource: 'yes',
    licence: 'Apache-2.0',
    freeModel: 'open_source',
    freePlan: {
      summary:
        'Software libre bajo Apache 2.0. Gratis por licencia; el coste real es tu hardware y la instalación.',
      limits: ['Requiere GPU', 'Requiere instalación local'],
      requiresSignup: 'no',
      requiresCreditCard: 'no',
      hasWatermark: 'unverified',
      commercialUse: 'unverified',
      creditReset: 'none',
      verifiedAt: HOY,
    },
    scores: { freeReal: 10, usefulness: 8, ease: 5, transparency: 9, creatorValue: 8 },
    verdict: 'Licencia y actividad verificadas en el repositorio oficial. No es para quien quiere abrir una web y generar.',
    evidence: {
      freePlan: {
        sourceUrl: 'https://api.github.com/repos/invoke-ai/InvokeAI',
        verifiedAt: HOY,
        quote: 'spdx_id: Apache-2.0 · archived: false · pushed_at: 2026-08-09',
      },
    },
  }),

  base({
    slug: 'sdnext',
    name: 'SD.Next',
    tagline: 'Interfaz local avanzada, Apache 2.0, con desarrollo muy activo.',
    descriptionShort:
      'Bifurcación muy mantenida de las interfaces de difusión locales, con soporte amplio de modelos y backends. Para quien ya sabe lo que hace.',
    officialUrl: 'https://github.com/vladmandic/sdnext',
    repoUrl: 'https://github.com/vladmandic/sdnext',
    kind: 'interface',
    hosting: 'local',
    platforms: ['windows', 'macos', 'linux'],
    skillLevel: 'advanced',
    openSource: 'yes',
    licence: 'Apache-2.0',
    freeModel: 'open_source',
    freePlan: {
      summary: 'Software libre bajo Apache 2.0, con actividad diaria en el repositorio.',
      limits: ['Requiere GPU', 'Requiere instalación y configuración'],
      requiresSignup: 'no',
      requiresCreditCard: 'no',
      hasWatermark: 'unverified',
      commercialUse: 'unverified',
      creditReset: 'none',
      verifiedAt: HOY,
    },
    scores: { freeReal: 10, usefulness: 8, ease: 3, transparency: 9, creatorValue: 8 },
    verdict: 'Técnica de principio a fin, y honesta al respecto.',
    evidence: {
      freePlan: {
        sourceUrl: 'https://api.github.com/repos/vladmandic/sdnext',
        verifiedAt: HOY,
        quote: 'spdx_id: Apache-2.0 · archived: false · pushed_at: 2026-08-12',
      },
    },
  }),

  base({
    slug: 'comfy-cloud',
    name: 'Comfy Cloud',
    tagline: 'ComfyUI alojado, con cinco ejecuciones gratuitas y sin tarjeta.',
    descriptionShort:
      'La versión alojada de ComfyUI: los mismos flujos de nodos sin instalar nada ni tener GPU. Ofrece cinco ejecuciones gratuitas para empezar.',
    officialUrl: 'https://www.comfy.org/',
    pricingUrl: 'https://www.comfy.org/pricing',
    kind: 'platform',
    skillLevel: 'intermediate',
    freeModel: 'credits',
    freePlan: {
      summary:
        'Cinco ejecuciones gratuitas en GPU real, sin tarjeta. La página no dice que se renueven, así que se registran como asignación única.',
      limits: ['5 free runs on real GPUs'],
      requiresSignup: 'unverified',
      requiresCreditCard: 'no',
      hasWatermark: 'unverified',
      commercialUse: 'unverified',
      creditReset: 'one_off',
      creditsAmount: '5 free runs',
      verifiedAt: HOY,
    },
    scores: { freeReal: 6, usefulness: 8, ease: 6, transparency: 9, creatorValue: 7 },
    verdict:
      'Cinco ejecuciones no son una capa gratuita, y el fabricante no pretende que lo sean. Sirve para probar los flujos sin comprar una GPU.',
    evidence: {
      freePlan: {
        sourceUrl: 'https://www.comfy.org/pricing',
        verifiedAt: HOY,
        quote: "Start free. Upgrade when you're ready. 5 free runs on real GPUs — no credit card required.",
      },
      requiresCreditCard: {
        sourceUrl: 'https://www.comfy.org/pricing',
        verifiedAt: HOY,
        quote: 'no credit card required',
      },
    },
  }),
];

const ruta = resolve(ROOT, 'src/data/tools-v2.json');
const actuales = JSON.parse(readFileSync(ruta, 'utf8'));
const existentes = new Set(actuales.map((t) => t.slug));

const anadidas = NUEVAS.filter((t) => !existentes.has(t.slug));
writeFileSync(ruta, `${JSON.stringify([...actuales, ...anadidas], null, 2)}\n`, 'utf8');

console.log(`\nImagen: ${anadidas.length} fichas nuevas, todas con cita oficial`);
for (const t of anadidas) {
  const ev = Object.keys(t.evidence ?? {}).join(', ');
  console.log(`  · ${t.slug.padEnd(16)} ${t.freeModel.padEnd(12)} evidencia: ${ev}`);
}
console.log(`\n  catálogo: ${actuales.length} → ${actuales.length + anadidas.length}\n`);
