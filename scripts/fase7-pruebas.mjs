#!/usr/bin/env node
/**
 * Lo que enseñaron las pruebas humanas del 26 de agosto.
 *
 * Cuatro interfaces abiertas por una persona con sus cuentas. Tres confirman
 * lo que ya documentábamos —y confirmar también es trabajo— y una lo
 * desmiente: Clipdrop se negó a generar.
 *
 * Ninguna de estas entradas es una muestra: no hay imagen que enseñar en tres
 * de los cuatro casos. Son evidencia documental, porque lo que se leyó es lo
 * que el fabricante dice en su propia interfaz sobre su propio plan. La
 * separación importa: una muestra prueba qué salió, esto prueba qué pone.
 */
import { readFileSync, writeFileSync } from 'node:fs';
const NATIVE = 'src/data/tools-v2.json';
const HOY = '2026-08-26';

const dicho = (field, sourceUrl, scope, quote) => ({
  field, outcome: 'stated', sourceUrl, sourceKind: 'official', scope, checkedAt: HOY, quote,
});

const CAMBIOS = [
  {
    /*
     * La corrección. La ficha decía «Text to image: unlimited» copiado de su
     * tabla de precios, y al intentar generar el producto contesta que la
     * generación es exclusiva de Pro. Lo que la tabla enumera como herramienta
     * gratuita no lo es, y presentarlo así mandaba a alguien a una función de
     * pago creyendo que era gratis.
     *
     * Se corrige el límite, no la capacidad: Clipdrop sigue sabiendo generar
     * imágenes, y sus otras herramientas —quitar fondo, limpiar, escalar—
     * siguen teniendo cuota gratuita según la misma tabla.
     */
    slug: 'clipdrop',
    set: {
      'freePlan.limits': [
        'La generación de imágenes es exclusiva de Pro: no entra en el plan gratuito',
        'Quitar fondo: 20 cada 24 h',
        'Escalado x2: 20 cada 24 h',
        'Limpiar: 20 cada 24 h',
        'Reiluminar: 20 cada 24 h',
        'Quitar texto: 50 cada 24 h',
      ],
      'freePlan.summary':
        'El plan gratuito cubre las herramientas de edición con cuotas diarias —quitar fondo, escalar, limpiar, reiluminar y quitar texto—, pero NO la generación de imágenes: al intentarlo, la propia interfaz responde que es exclusiva de Pro.',
    },
    evidence: [
      dicho(
        'freePlan.limits',
        'https://clipdrop.co/text-to-image',
        'web',
        'Image generation is for Pro — Generate images exclusively for Pro users'
      ),
    ],
  },
  {
    slug: 'playground-ai',
    set: {
      'freePlan.limits': [
        'Hasta 10 imágenes cada 3 horas',
        '3 generaciones al mes en los modelos Nano Banana, GPT Image 2 y Seedream',
        'Uso comercial: licencia mundial y libre de derechos',
        'Generación más lenta en horas punta y espera al agotar el límite',
      ],
    },
    evidence: [
      dicho(
        'freePlan.limits',
        'https://playgroundai.com/design/pricing',
        'product',
        'Free — Limited image generation: Create up to 10 images every 3 hours · Limited model access: 3 monthly generations across Nano Banana, GPT Image 2, and Seedream · Commercial use: World-wide, royalty free license · Limitations: Slower generation during peak hours. Waiting period after limits are reached.'
      ),
      dicho(
        'freePlan.commercialUse',
        'https://playgroundai.com/design/pricing',
        'product',
        'Commercial use — World-wide, royalty free license'
      ),
    ],
  },
  {
    slug: 'krea',
    evidence: [
      dicho(
        'freePlan.creditReset',
        'https://www.krea.ai/',
        'web',
        '92 Credits remaining · 100 per day'
      ),
      dicho(
        'freePlan.limits',
        'https://www.krea.ai/',
        'web',
        'Krea 2 Turbo: 2 créditos · Krea 2 Medium: 9 · Krea 2 Large: 20 · ChatGPT 2: ~75 · Nano Banana Pro: ~100'
      ),
    ],
  },
  {
    slug: 'leonardo-ai',
    evidence: [
      dicho(
        'freePlan.limits',
        'https://app.leonardo.ai/',
        'web',
        'My Plan: Free · Fast Tokens 134 / 150 · You are currently on a free plan.'
      ),
    ],
  },
];

const tools = JSON.parse(readFileSync(NATIVE, 'utf8'));
const porSlug = new Map(tools.map((t) => [t.slug, t]));

function poner(objeto, ruta, valor) {
  const partes = ruta.split('.');
  const ultima = partes.pop();
  let cursor = objeto;
  for (const parte of partes) cursor = cursor[parte] ??= {};
  const antes = cursor[ultima];
  cursor[ultima] = valor;
  return antes;
}

for (const cambio of CAMBIOS) {
  const tool = porSlug.get(cambio.slug);
  if (!tool) { console.log(`${cambio.slug}: NO EXISTE`); continue; }

  for (const [ruta, valor] of Object.entries(cambio.set ?? {})) {
    const antes = poner(tool, ruta, valor);
    const mismo = JSON.stringify(antes) === JSON.stringify(valor);
    console.log(`  ${cambio.slug} · ${ruta}: ${mismo ? 'sin cambio' : 'ACTUALIZADO'}`);
  }

  const previas = new Map((tool.evidence ?? []).map((e) => [e.field, e]));
  const tocados = new Set(cambio.evidence.map((e) => e.field));
  tool.evidence = [
    ...(tool.evidence ?? []).filter((e) => !tocados.has(e.field)),
    ...cambio.evidence.map((e) => (e.quote ? e : { ...e, quote: previas.get(e.field)?.quote })),
  ];

  tool.lastVerifiedAt = HOY;
  tool.freePlan.verifiedAt = HOY;
  tool.nextReviewAt = '2026-11-24';

  const urls = new Set((tool.sources ?? []).map((s) => s.url));
  for (const e of cambio.evidence) {
    if (urls.has(e.sourceUrl)) continue;
    urls.add(e.sourceUrl);
    (tool.sources ??= []).push({
      url: e.sourceUrl, label: 'Interfaz oficial del producto', kind: 'official',
      publisher: new URL(e.sourceUrl).hostname.replace(/^www\./, ''), checkedAt: HOY,
    });
  }
  console.log(`${cambio.slug}: ${cambio.evidence.length} evidencias`);
}

writeFileSync(NATIVE, `${JSON.stringify(tools, null, 2)}\n`, 'utf8');
console.log('\nEscrito', NATIVE);
