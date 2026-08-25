#!/usr/bin/env node
/**
 * Fase 5 — la evidencia de la primera cohorte, escrita a mano.
 *
 * Cada entrada de este fichero corresponde a una página oficial que se abrió
 * el 24 de agosto de 2026. No hay ninguna inferencia silenciosa: lo que no
 * está dicho va como `derived` con su base, y lo que se buscó y no estaba va
 * como `not_published` con lo que se buscaba.
 *
 * Se ejecuta una vez y es idempotente: reemplaza la evidencia de los campos
 * que toca y deja el resto de la ficha como estaba.
 *
 *   node scripts/fase5-evidencia.mjs --dry-run
 *   node scripts/fase5-evidencia.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NATIVE = join(ROOT, 'src/data/tools-v2.json');
const HOY = '2026-08-24';
const REVISION = '2026-11-22'; // 90 días

/** Azúcar para no repetir `checkedAt` en cuarenta sitios. */
const dicho = (field, sourceUrl, sourceKind, scope, quote) => ({ field, outcome: 'stated', sourceUrl, sourceKind, scope, checkedAt: HOY, quote });
const deriva = (field, sourceUrl, sourceKind, scope, basis) => ({ field, outcome: 'derived', sourceUrl, sourceKind, scope, checkedAt: HOY, basis });
const calla = (field, sourceUrl, sourceKind, scope, lookedFor) => ({ field, outcome: 'not_published', sourceUrl, sourceKind, scope, checkedAt: HOY, lookedFor });

/**
 * La cohorte auditada en esta pasada.
 *
 * `set` cambia valores; `evidence` añade el respaldo. Un valor sólo cambia si
 * la fuente lo sostiene, y todo cambio lleva su entrada de evidencia al lado.
 */
const CAMBIOS = [
  {
    slug: 'whisper',
    set: { 'freePlan.commercialUse': 'yes' },
    evidence: [
      deriva(
        'freePlan.commercialUse',
        'https://github.com/openai/whisper',
        'repo', 'weights',
        'El README declara: «Whisper’s code and model weights are released under the MIT License». La MIT permite el uso comercial sin condiciones más allá de conservar el aviso de copyright.'
      ),
      dicho(
        'openSource',
        'https://github.com/openai/whisper',
        'repo', 'weights',
        'Whisper’s code and model weights are released under the MIT License.'
      ),
      deriva(
        'freePlan.requiresCreditCard',
        'https://github.com/openai/whisper',
        'repo', 'local',
        'Se instala con `pip install -U openai-whisper` y se ejecuta en local: el README no describe ninguna cuenta, clave ni pago, porque no hay servicio que cobrar.'
      ),
      deriva(
        'freePlan.requiresSignup',
        'https://github.com/openai/whisper',
        'repo', 'local',
        'Mismo motivo: los pesos se descargan y el modelo corre en tu equipo.'
      ),
    ],
  },
  {
    slug: 'kokoro',
    set: { 'freePlan.commercialUse': 'yes' },
    evidence: [
      deriva(
        'freePlan.commercialUse',
        'https://github.com/hexgrad/kokoro',
        'repo', 'weights',
        'El README dice: «With Apache-licensed weights, Kokoro can be deployed anywhere from production environments to personal projects». La Apache-2.0 permite el uso comercial.'
      ),
      dicho(
        'openSource',
        'https://github.com/hexgrad/kokoro',
        'repo', 'weights',
        'With Apache-licensed weights, Kokoro can be deployed anywhere from production environments to personal projects.'
      ),
    ],
  },
  {
    slug: 'f5-tts',
    evidence: [
      deriva(
        'freePlan.commercialUse',
        'https://github.com/SWivid/F5-TTS',
        'repo', 'weights',
        'El README separa las dos licencias: «The pre-trained models are licensed under the CC-BY-NC license due to the training data Emilia, which is an in-the-wild dataset». El código es MIT, pero los pesos publicados llevan NC, que excluye el uso comercial.'
      ),
      dicho(
        'openSource',
        'https://github.com/SWivid/F5-TTS',
        'repo', 'weights',
        'The pre-trained models are licensed under the CC-BY-NC license due to the training data Emilia, which is an in-the-wild dataset.'
      ),
    ],
  },
  {
    slug: 'deepseek-v4-flash',
    evidence: [
      deriva(
        'freePlan.commercialUse',
        'https://huggingface.co/deepseek-ai/DeepSeek-V3.2-Exp',
        'repo', 'weights',
        'La ficha oficial del modelo declara «License: mit» para los pesos. La MIT permite el uso comercial.'
      ),
      dicho(
        'freePlan.limits',
        'https://api-docs.deepseek.com/quick_start/pricing',
        'docs', 'api',
        'Off-peak: $0.22/1M input, $0.66/1M output. Peak hours are 01:00 - 04:00 and 06:00 - 10:00 UTC, Monday through Friday.'
      ),
    ],
  },
  {
    slug: 'ideogram',
    evidence: [
      dicho(
        'freePlan.commercialUse',
        'https://ideogram.ai/legal/tos',
        'terms', 'product',
        'We do not claim any ownership rights in your User Input or User Output, and we do not restrict your ability to use User Output for your own purposes (including for commercial purposes).'
      ),
      calla(
        'freePlan.hasWatermark',
        'https://ideogram.ai/legal/tos',
        'terms', 'product',
        'Si el plan gratuito estampa una marca. Las condiciones sólo prohíben retirar las marcas que existan («Remove any watermarks included on any User Output»), sin decir si el plan gratuito las pone. Ni la documentación de planes ni las preguntas frecuentes lo mencionan.'
      ),
    ],
  },
  {
    slug: 'github-copilot',
    set: {
      'freePlan.limits': [
        '2.000 completados en línea al mes',
        '50 solicitudes de chat al mes (incluye Copilot Edits)',
        'Sólo selección automática de modelo',
        'NO incluye agentes ni agente de programación',
        'NO incluye revisión de código ni modo agente',
        'Plan de pago más barato: Pro, 10 $/mes',
      ],
    },
    evidence: [
      dicho(
        'freePlan.requiresCreditCard',
        'https://github.com/features/copilot/plans',
        'pricing', 'product',
        'No credit card required. Verified students have access to the GitHub Copilot Student plan.'
      ),
      dicho(
        'freePlan.limits',
        'https://github.com/features/copilot/plans',
        'pricing', 'product',
        '2,000 completions per month […] 2000 completions and 50 chat requests (including Copilot Edits)'
      ),
      calla(
        'freePlan.commercialUse',
        'https://github.com/features/copilot/plans',
        'pricing', 'product',
        'Si el código sugerido en el plan gratuito puede usarse en trabajo comercial. La página de planes no lo trata.'
      ),
    ],
  },
  {
    slug: 'lovable',
    set: {
      'freePlan.commercialUse': 'yes',
      'freePlan.limits': [
        '5 créditos de construcción al día (máximo 30 al mes)',
        'Se renuevan cada día a las 00:00 UTC y no se acumulan',
        '20 créditos de nube al mes',
        '4 créditos para las funciones de IA de tus aplicaciones',
      ],
    },
    evidence: [
      dicho(
        'freePlan.limits',
        'https://docs.lovable.dev/user-guides/messaging-limits',
        'docs', 'product',
        'Free: 5 per day, up to 30 per month […] Unused usage-specific grants do not roll over.'
      ),
      dicho(
        'freePlan.creditReset',
        'https://docs.lovable.dev/user-guides/messaging-limits',
        'docs', 'product',
        'refresh every day at 00:00 UTC'
      ),
      deriva(
        'freePlan.commercialUse',
        'https://lovable.dev/terms',
        'terms', 'product',
        'Las condiciones dicen «you own your Customer Data, including the applications, websites, or other projects you build using the Services» y conceden licencia para «create, deploy, operate, and make available» esas aplicaciones, sin reservar el uso comercial a los planes de pago.'
      ),
      calla(
        'freePlan.requiresCreditCard',
        'https://docs.lovable.dev/user-guides/messaging-limits',
        'docs', 'product',
        'Si hay que dar tarjeta para el plan gratuito. La documentación de límites no lo menciona.'
      ),
    ],
  },
  {
    slug: 'gemini-3-flash',
    set: { 'privacy.trainsOnUserData': 'yes' },
    evidence: [
      deriva(
        'privacy.trainsOnUserData',
        'https://ai.google.dev/gemini-api/docs/pricing',
        'pricing', 'api',
        'La tabla oficial de precios marca «Used to improve our products: Yes» en la columna de la capa gratuita, frente a «No» en la de pago.'
      ),
      dicho(
        'freePlan.limits',
        'https://ai.google.dev/gemini-api/docs/pricing',
        'pricing', 'api',
        'Free of charge […] $0.75 through December 31, 2026. $1.50 starting January 1, 2027 (input, per 1M tokens)'
      ),
    ],
  },
  {
    slug: 'claude-haiku-4-5',
    evidence: [
      dicho(
        'freePlan.limits',
        'https://platform.claude.com/docs/en/about-claude/pricing',
        'pricing', 'api',
        'Claude Haiku 4.5 — $1 / MTok (base input tokens) · $5 / MTok (output tokens)'
      ),
      deriva(
        'freePlan.creditReset',
        'https://platform.claude.com/docs/en/about-claude/pricing',
        'pricing', 'api',
        'Las preguntas frecuentes dicen «New users receive a small amount of free credits to test the API»: es un saldo de bienvenida por cuenta nueva, no una cuota que vuelva. Por eso `none` y no una renovación periódica.'
      ),
      calla(
        'freePlan.requiresCreditCard',
        'https://platform.claude.com/docs/en/about-claude/pricing',
        'pricing', 'api',
        'Si hace falta tarjeta para gastar los créditos de bienvenida. La página describe la facturación («Credit card and invoicing options available») pero no dice si la tarjeta es requisito para empezar.'
      ),
    ],
  },
  {
    slug: 'elevenlabs',
    evidence: [
      dicho(
        'freePlan.commercialUse',
        'https://elevenlabs.io/terms-of-use',
        'terms', 'product',
        "if you access or use our Services free of charge (such a user, a 'Free User'), you may only use the Services for non-commercial purposes; if you access or use our Services through a paid subscription plan (such a user, a 'Paid User'), you may use the Services for commercial purposes."
      ),
      dicho('freePlan.limits', 'https://elevenlabs.io/pricing', 'pricing', 'product', '10k credits per month'),
      dicho(
        'freePlan.creditReset',
        'https://elevenlabs.io/pricing',
        'pricing', 'product',
        'Credits reset monthly on the subscription anniversary date. Unused credits do not roll over for the Free tier.'
      ),
      calla(
        'freePlan.hasWatermark',
        'https://elevenlabs.io/terms-of-use',
        'terms', 'product',
        'Si el audio del plan gratuito lleva marca o exige atribución. Las condiciones no imponen ninguna atribución, y ni ellas ni la página de precios mencionan marca alguna.'
      ),
    ],
  },
  {
    slug: 'v0-by-vercel',
    set: { 'freePlan.creditReset': 'monthly' },
    evidence: [
      dicho(
        'freePlan.limits',
        'https://v0.app/docs/pricing',
        'docs', 'product',
        'Free plan: $5 monthly credits · Daily Message Limit: 7 messages. Each plan includes a monthly credit allowance.'
      ),
      dicho(
        'freePlan.creditReset',
        'https://v0.app/docs/pricing',
        'docs', 'product',
        'Each plan includes a monthly credit allowance.'
      ),
      calla(
        'freePlan.commercialUse',
        'https://v0.app/docs/pricing',
        'docs', 'product',
        'Si lo generado en el plan gratuito puede usarse comercialmente. La documentación de precios no lo trata.'
      ),
    ],
  },
  {
    slug: 'clipdrop',
    evidence: [
      dicho(
        'freePlan.limits',
        'https://clipdrop.co/pricing',
        'pricing', 'product',
        'Free 0 — Text to image: unlimited · Uncrop: unlimited · Background Removal: 20/24h · Image Upscaler x2: 20/24h · Cleanup: 20/24h · Relight: 20/24h · Text Remover: 50/24h'
      ),
      calla(
        'freePlan.requiresCreditCard',
        'https://clipdrop.co/pricing',
        'pricing', 'product',
        'Si hay que dar tarjeta para el plan gratuito. La página de precios enumera los límites de cada herramienta y no lo menciona.'
      ),
      calla(
        'freePlan.hasWatermark',
        'https://clipdrop.co/pricing',
        'pricing', 'product',
        'Si el resultado del plan gratuito sale con marca. La página de precios no lo menciona.'
      ),
    ],
  },
  {
    /*
     * La corrección más importante de esta pasada.
     *
     * La ficha afirmaba `hasWatermark: 'no'`, y la página de precios oficial
     * enumera «Download videos with no watermark» entre lo que traen los
     * planes de pago. La cita que sostenía el «no» estaba tomada de la columna
     * equivocada. Alguien pudo elegir Pika precisamente por eso.
     *
     * No se pone `yes` —la página no dice que el plan gratuito marque, sólo
     * que quitar la marca es de pago— sino `unverified`, que es lo que de
     * verdad sabemos. Confirmarlo en un sentido u otro queda pendiente.
     */
    slug: 'pika-labs',
    set: {
      'freePlan.hasWatermark': 'unverified',
      'freePlan.limits': [
        '80 créditos de vídeo al mes',
        'La descarga sin marca de agua figura entre las características de pago',
        'Pika 2.5 sólo a 480p',
      ],
    },
    evidence: [
      dicho('freePlan.limits', 'https://pika.art/pricing', 'pricing', 'product', '80 monthly video credits'),
      calla(
        'freePlan.hasWatermark',
        'https://pika.art/pricing',
        'pricing', 'product',
        'Si el vídeo del plan gratuito lleva marca. La página sólo dice que la descarga sin marca («Download videos with no watermark») es de los planes de pago, lo que no afirma que el gratuito la ponga.'
      ),
      calla(
        'freePlan.commercialUse',
        'https://pika.art/pricing',
        'pricing', 'product',
        'Si el plan gratuito permite uso comercial. La página lo enumera entre las características de pago, sin decir qué ocurre en el gratuito.'
      ),
    ],
  },
];

/**
 * La evidencia que ya estaba y nadie leía.
 *
 * Noventa y tres de las noventa y cuatro fichas guardaban un objeto `evidence`
 * con `{sourceUrl, verifiedAt, quote}` por campo. La forma no estaba en el
 * esquema, así que Zod la descartaba y no llegaba ni a la ficha ni al
 * comparador: citas literales de páginas oficiales, con su fecha, tiradas.
 *
 * Esto las convierte al tipo nuevo conservando su fecha original —no la de
 * hoy: nadie las ha vuelto a abrir— y su cita. Las claves heredadas eran
 * flojas («pricing», «status»), así que se traducen a rutas de campo reales.
 */
const CLAVES_HEREDADAS = {
  freePlan: 'freePlan.limits',
  pricing: 'freePlan.limits',
  status: 'freePlan.limits',
  requiresCreditCard: 'freePlan.requiresCreditCard',
  commercialUse: 'freePlan.commercialUse',
  watermark: 'freePlan.hasWatermark',
  capabilities: 'capabilities',
};

function claseDeFuente(url) {
  const u = url.toLowerCase();
  if (/\/pricing|\/plans|membership|precios/.test(u)) return 'pricing';
  if (/\/terms|\/tos|\/legal/.test(u)) return 'terms';
  if (/\/privacy/.test(u)) return 'privacy';
  if (/github\.com|huggingface\.co/.test(u)) return 'repo';
  if (/help|support|faq/.test(u)) return 'help';
  if (/docs?\./.test(u) || /\/docs/.test(u)) return 'docs';
  return 'official';
}

/**
 * Qué puerta describe una fuente heredada.
 *
 * Ninguna de las 147 entradas decía a qué superficie se refería, porque el
 * campo no existía. Deducirlo de la URL y de las puertas que la propia ficha
 * declara es mejor que ponerles `product` a todas: eso convertiría la licencia
 * de unos pesos en un permiso para el servicio entero, que es justo lo que hay
 * que evitar.
 */
function alcanceHeredado(tool, field, url) {
  const u = url.toLowerCase();

  // Una licencia leída en la forja o en el hub habla de los pesos y del código.
  if (/github\.com|huggingface\.co/.test(u)) {
    return field === 'openSource' || field === 'freePlan.commercialUse' ? 'weights' : 'local';
  }
  if (/api[.-]|\/api\/|ai\.google\.dev|platform\./.test(u)) return 'api';

  // Y si la ficha sólo tiene una puerta, la fuente sólo puede hablar de ésa.
  const puertas = new Set();
  if (tool.access?.chat === 'yes') puertas.add('web');
  if (tool.access?.api === 'yes') puertas.add('api');
  if (tool.access?.weights === 'yes') puertas.add('weights');
  if (tool.hosting === 'local') puertas.add('local');
  if (tool.hosting === 'cloud') puertas.add('cloud');
  if (tool.hosting === 'hybrid') { puertas.add('local'); puertas.add('cloud'); }
  if (puertas.size === 1) return [...puertas][0];

  return 'product';
}

/**
 * Y las que ya estaban en forma de lista pero sin alcance.
 *
 * La migración anterior las convirtió al tipo nuevo cuando `scope` todavía no
 * existía. Volver a ejecutarla no las toca —ya son un array—, así que se les
 * completa aparte.
 */
function completarAlcance(tool) {
  if (!Array.isArray(tool.evidence)) return 0;
  let n = 0;
  for (const ev of tool.evidence) {
    if (ev.scope) continue;
    ev.scope = alcanceHeredado(tool, ev.field, ev.sourceUrl);
    n++;
  }
  return n;
}

function migrarHeredada(tool) {
  const vieja = tool.evidence;
  if (!vieja || Array.isArray(vieja)) return 0;

  const nuevas = [];
  const vistos = new Set();
  for (const [clave, dato] of Object.entries(vieja)) {
    const field = CLAVES_HEREDADAS[clave];
    if (!field || vistos.has(field)) continue;
    if (!dato?.sourceUrl || !dato?.quote || !dato?.verifiedAt) continue;
    vistos.add(field);
    nuevas.push({
      field,
      outcome: 'stated',
      sourceUrl: dato.sourceUrl,
      sourceKind: claseDeFuente(dato.sourceUrl),
      scope: alcanceHeredado(tool, field, dato.sourceUrl),
      checkedAt: dato.verifiedAt,
      quote: String(dato.quote).replace(/\s+/g, ' ').trim().slice(0, 600),
    });
  }
  tool.evidence = nuevas;
  return nuevas.length;
}

// ---------------------------------------------------------------------------

const seco = process.argv.includes('--dry-run');
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

const informe = [];

let migradas = 0;
let entradasMigradas = 0;
let conAlcance = 0;
for (const tool of tools) {
  const n = migrarHeredada(tool);
  if (n > 0) { migradas++; entradasMigradas += n; }
  tool.evidence ??= [];
  conAlcance += completarAlcance(tool);
}
informe.push(
  `Evidencia heredada migrada: ${entradasMigradas} entradas en ${migradas} fichas.`,
  `Alcance completado en ${conAlcance} entradas que no lo declaraban.`,
  ''
);

for (const cambio of CAMBIOS) {
  const tool = porSlug.get(cambio.slug);
  if (!tool) {
    informe.push(`${cambio.slug}: NO EXISTE`);
    continue;
  }

  const lineas = [];
  for (const [ruta, valor] of Object.entries(cambio.set ?? {})) {
    const antes = poner(tool, ruta, valor);
    const mismo = JSON.stringify(antes) === JSON.stringify(valor);
    lineas.push(`  ${ruta}: ${mismo ? 'sin cambio' : `${JSON.stringify(antes)} → ${JSON.stringify(valor)}`}`);
  }

  /*
   * La evidencia se reemplaza por campo: volver a correr esto no duplica nada.
   *
   * Y no se pierde lo que había. La primera versión de este script sustituía
   * la entrada entera, así que una cita literal capturada en agosto
   * desaparecía en cuanto esta fase tocaba el mismo campo sin traer otra. Un
   * script de mejora de datos que borra datos es peor que no ejecutarlo.
   */
  const previas = new Map((tool.evidence ?? []).map((e) => [e.field, e]));
  const tocados = new Set(cambio.evidence.map((e) => e.field));
  const conservando = cambio.evidence.map((e) =>
    e.quote || !previas.get(e.field)?.quote ? e : { ...e, quote: previas.get(e.field).quote }
  );
  tool.evidence = [...(tool.evidence ?? []).filter((e) => !tocados.has(e.field)), ...conservando];

  tool.lastVerifiedAt = HOY;
  tool.nextReviewAt = REVISION;
  tool.freePlan.verifiedAt = HOY;

  // Las fuentes de la ficha incorporan las páginas abiertas hoy.
  const yaCitadas = new Set((tool.sources ?? []).map((s) => s.url));
  for (const e of cambio.evidence) {
    if (yaCitadas.has(e.sourceUrl)) continue;
    yaCitadas.add(e.sourceUrl);
    (tool.sources ??= []).push({
      url: e.sourceUrl,
      label: {
        pricing: 'Página oficial de precios',
        docs: 'Documentación oficial',
        terms: 'Condiciones oficiales',
        privacy: 'Política de privacidad oficial',
        repo: 'Repositorio oficial',
        help: 'Centro de ayuda oficial',
        licence: 'Licencia oficial',
        official: 'Web oficial',
      }[e.sourceKind],
      kind: e.sourceKind === 'repo' ? 'repo' : e.sourceKind === 'pricing' ? 'pricing' : 'docs',
      publisher: new URL(e.sourceUrl).hostname.replace(/^www\./, ''),
      checkedAt: HOY,
    });
  }

  informe.push(
    `${cambio.slug}: ${cambio.evidence.length} evidencias (${cambio.evidence.filter((e) => e.outcome === 'stated').length} dichas, ${cambio.evidence.filter((e) => e.outcome === 'derived').length} derivadas, ${cambio.evidence.filter((e) => e.outcome === 'not_published').length} no publicadas)` +
      (lineas.length ? `\n${lineas.join('\n')}` : '')
  );
}

if (!seco) writeFileSync(NATIVE, `${JSON.stringify(tools, null, 2)}\n`, 'utf8');

console.log(informe.join('\n'));
console.log(seco ? '\n(dry run: no se ha escrito nada)' : `\nEscrito ${NATIVE}`);
