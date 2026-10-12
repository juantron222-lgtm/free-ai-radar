#!/usr/bin/env node
/**
 * Vigilante de citas: ¿siguen las páginas oficiales diciendo lo que citamos?
 *
 * Recorre todas las citas literales del catálogo —las evidencias `stated`, lo
 * que el plan gratuito incluye y las marcas de procedencia—, abre cada página
 * oficial una vez y comprueba, fragmento a fragmento, si la cita sigue ahí
 * (scripts/vigilante/coincidencia.mjs). Escribe un informe para una persona:
 * qué citas desaparecieron o cambiaron, de qué ficha y de qué campo.
 *
 * Decisiones deliberadas:
 *   · Un navegador de verdad (Playwright), porque muchas páginas de precios se
 *     pintan con JavaScript y un `fetch` vería una página vacía.
 *   · Una página cada vez por sitio y una pausa entre ellas: esto lee lo que
 *     cualquiera puede leer, y no debe parecer un ataque.
 *   · Una página que no se deja leer (error, muro anti-robots) no cuenta como
 *     cambio: el informe la lista aparte como «no leída».
 *   · No toca el catálogo. Un aviso es para que alguien abra la página; las
 *     correcciones de lo publicado las aprueba Juan.
 *
 * Uso:
 *   node scripts/vigilante-citas.mjs
 *   node scripts/vigilante-citas.mjs --solo=ideogram,elevenlabs
 *
 * Escribe docs/vigilante/AAAA-MM-DD.md y .json, y guarda el texto leído de cada
 * página en .data/vigilante/AAAA-MM-DD/ (ignorado por git) para poder revisarlo.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { comprobarCita, paginaLegible } from './vigilante/coincidencia.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOY = new Date().toISOString().slice(0, 10);
const CACHE = join(ROOT, '.data/vigilante', HOY);
const SALIDA = join(ROOT, 'docs/vigilante');
const PAUSA_MS = 1500;
const EN_PARALELO = 4;

const solo = process.argv.find((a) => a.startsWith('--solo='))?.slice(7).split(',');

/** Todas las citas del catálogo, con de dónde salen. */
function citasDelCatalogo() {
  const tools = JSON.parse(readFileSync(join(ROOT, 'src/data/tools-v2.json'), 'utf8'));
  const citas = [];
  for (const t of tools) {
    if (solo && !solo.includes(t.slug)) continue;
    if (t.status === 'discontinued' || t.verification === 'discontinued') continue;
    const anadir = (campo, ev) => {
      if (ev?.outcome !== 'stated' || !ev.quote) return;
      citas.push({ slug: t.slug, nombre: t.name, campo, url: ev.sourceUrl, comprobada: ev.checkedAt, cita: ev.quote });
    };
    for (const e of t.evidence ?? []) anadir(e.field, e);
    for (const i of t.freePlan?.includedCapabilities ?? []) anadir(`incluida: ${i.capability}`, i.evidence);
    for (const p of t.freePlan?.provenanceSignals ?? []) anadir(`procedencia: ${p.signal}`, p.evidence);
  }
  return citas;
}

/** Lee una página como la vería una persona, más las etiquetas de sus iconos. */
async function leer(contexto, url) {
  const page = await contexto.newPage();
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const texto = await page.evaluate(() => {
      document.querySelectorAll('details').forEach((d) => (d.open = true));
      const etiquetas = [...document.querySelectorAll('[aria-label], [title], img[alt], svg title')]
        .map((n) => n.getAttribute?.('aria-label') || n.getAttribute?.('title') || n.getAttribute?.('alt') || n.textContent || '')
        .filter(Boolean);
      const oculto = (document.body?.textContent ?? '').replace(/\s+/g, ' ');
      return { visible: document.body?.innerText ?? '', resto: [etiquetas.join(' \n '), oculto].join('\n') };
    });
    return { status: resp?.status() ?? null, final: page.url(), visible: texto.visible, texto: `${texto.visible}\n${texto.resto}` };
  } catch (e) {
    return { status: null, final: url, visible: '', texto: '', error: String(e.message).split('\n')[0] };
  } finally {
    await page.close();
  }
}

async function main() {
  const citas = citasDelCatalogo();
  const urls = [...new Set(citas.map((c) => c.url))];
  mkdirSync(CACHE, { recursive: true });
  mkdirSync(SALIDA, { recursive: true });
  console.log(`${citas.length} citas en ${urls.length} páginas`);

  // Una cola por sitio: nunca dos páginas a la vez del mismo fabricante.
  const porSitio = new Map();
  for (const u of urls) {
    const h = new URL(u).hostname;
    porSitio.set(h, [...(porSitio.get(h) ?? []), u]);
  }
  const colas = [...porSitio.values()];

  const browser = await chromium.launch();
  const contexto = await browser.newContext({
    locale: 'en-US',
    viewport: { width: 1366, height: 900 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 (+https://www.freeairadar.com/metodologia)',
  });
  const paginas = new Map();
  let hechas = 0;
  await Promise.all(
    Array.from({ length: EN_PARALELO }, async () => {
      while (colas.length) {
        const cola = colas.shift();
        for (const url of cola) {
          const p = await leer(contexto, url);
          paginas.set(url, p);
          const nombre = createHash('sha1').update(url).digest('hex').slice(0, 12);
          writeFileSync(join(CACHE, `${nombre}.txt`), `URL: ${url}\nFINAL: ${p.final}\nSTATUS: ${p.status}\n\n${p.texto}`);
          hechas++;
          if (hechas % 20 === 0) console.log(`  ${hechas}/${urls.length} páginas`);
          await new Promise((r) => setTimeout(r, PAUSA_MS));
        }
      }
    })
  );
  await browser.close();

  const resultados = citas.map((c) => {
    const p = paginas.get(c.url);
    const legible = paginaLegible({ status: p.status, texto: p.visible });
    if (!legible.legible) return { ...c, estado: 'no-leida', motivo: p.error ?? legible.motivo, faltan: [] };
    const r = comprobarCita(c.cita, p.texto);
    return { ...c, estado: r.estado, faltan: r.faltan, final: p.final !== c.url ? p.final : undefined };
  });

  const cuenta = (e) => resultados.filter((r) => r.estado === e).length;
  const resumen = {
    fecha: HOY,
    citas: resultados.length,
    paginas: urls.length,
    intactas: cuenta('intacta'),
    parciales: cuenta('parcial'),
    desaparecidas: cuenta('desaparecida'),
    noLeidas: cuenta('no-leida'),
  };
  writeFileSync(join(SALIDA, `${HOY}.json`), JSON.stringify({ resumen, resultados }, null, 2) + '\n');
  writeFileSync(join(SALIDA, `${HOY}.md`), informe(resumen, resultados));
  console.log(JSON.stringify(resumen));
}

function informe(resumen, resultados) {
  const avisos = resultados.filter((r) => r.estado === 'desaparecida' || r.estado === 'parcial');
  const porFicha = new Map();
  for (const r of avisos) porFicha.set(r.slug, [...(porFicha.get(r.slug) ?? []), r]);
  const noLeidas = [...new Map(resultados.filter((r) => r.estado === 'no-leida').map((r) => [r.url, r])).values()];

  const l = [];
  l.push(`# Vigilante de citas — ${resumen.fecha}`, '');
  l.push('Cada hecho del catálogo descansa en una frase literal de una página oficial. Este informe dice qué frases ya no están en su página, o han cambiado. Un aviso no es una corrección: es para que alguien abra la página y decida.', '');
  l.push('| | Citas |', '|---|---|');
  l.push(`| Revisadas | ${resumen.citas} (en ${resumen.paginas} páginas) |`);
  l.push(`| Intactas | ${resumen.intactas} |`);
  l.push(`| Cambiadas en parte | ${resumen.parciales} |`);
  l.push(`| Desaparecidas | ${resumen.desaparecidas} |`);
  l.push(`| Página no leída | ${resumen.noLeidas} |`, '');
  l.push(`## Avisos (${avisos.length} citas en ${porFicha.size} fichas)`, '');
  for (const [slug, rs] of [...porFicha].sort((a, b) => b[1].length - a[1].length)) {
    l.push(`### ${rs[0].nombre} (\`${slug}\`)`, '');
    for (const r of rs) {
      l.push(`- **${r.campo}** — ${r.estado === 'desaparecida' ? 'ya no aparece' : 'cambió en parte'} · comprobada el ${r.comprobada} · <${r.url}>${r.final ? ` (redirige a <${r.final}>)` : ''}`);
      l.push(`  - Citábamos: «${r.cita.length > 300 ? r.cita.slice(0, 300) + '…' : r.cita}»`);
      if (r.estado === 'parcial') l.push(`  - Falta: ${r.faltan.map((f) => `«${f}»`).join(', ')}`);
    }
    l.push('');
  }
  l.push(`## Páginas que no se pudieron leer (${noLeidas.length})`, '');
  l.push('No cuentan como cambio: o rechazan la lectura automática o no respondieron.', '');
  for (const r of noLeidas) l.push(`- <${r.url}> — ${r.motivo}`);
  l.push('');
  return l.join('\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
