#!/usr/bin/env node
/**
 * Barrido de contraste WCAG 2.2 AA sobre las páginas públicas.
 *
 * Mide el color efectivo de cada nodo de texto contra el fondo que realmente
 * tiene detrás, con el umbral que corresponde a su tamaño y peso. **No
 * comprueba tokens: comprueba lo que se ve**, y esa diferencia es la razón de
 * que exista. Revisando la paleta a mano nadie habría encontrado el fallo más
 * grave que sacó en su primera pasada:
 *
 *   `AccessBadge` pedía `--text-3`, `--tone-good-bg` y otras cuatro variables
 *   que no existen en `global.css`. Cada `var()` caía a su valor de reserva,
 *   escrito al lado y ciego al tema, así que con el tema oscuro la línea de
 *   esfuerzo se pintaba en `rgb(0 0 0 / 0.6)` sobre una superficie casi negra:
 *   1,11:1. Un `var()` con reserva no falla ni avisa — simplemente se ve mal.
 *
 * Dos lecciones sobre medir, las dos aprendidas equivocándose primero:
 *
 *   - **Componer el alfa.** Devolver el primer fondo no transparente convertía
 *     un verde al 12 % sobre blanco en un verde opaco, y acusaba de 1,18:1 a
 *     una etiqueta perfectamente legible.
 *   - **Aceptar `color(srgb ...)`.** Chrome devuelve así el fondo de la
 *     cabecera, con canales de 0 a 1. Leerlos como si fueran de 0 a 255
 *     convertía un crema casi opaco en un negro e inventaba cuatro fallos en la
 *     cabecera de todas las páginas.
 *
 * Un medidor que exagera cuesta tanto como uno que calla: obliga a «arreglar»
 * lo que no está roto y entrena a ignorarlo.
 *
 * Uso:
 *   npm run dev
 *   node scripts/contraste.mjs
 *   BASE=https://<preview>.vercel.app node scripts/contraste.mjs
 */

import { chromium } from '@playwright/test';

const BASE = process.env.BASE ?? 'http://localhost:4321';

const PAGES = [
  '/',
  '/imagen',
  '/video',
  '/audio',
  '/agentes',
  '/herramientas',
  '/herramientas/krea',
  '/herramientas/comfyui',
  '/categorias',
  '/categorias/codigo',
  '/comparar',
  '/noticias',
  '/metodologia',
  '/colecciones',
  '/guias',
];

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'movil', width: 375, height: 812 },
];

const AUDIT = `(() => {
  function lum(c) {
    const m = (c.match(/[\\d.]+/g) || []).slice(0, 3).map(Number).map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    if (m.length < 3) return null;
    return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2];
  }
  function rgba(c) {
    const m = (c.match(/[\\d.]+/g) || []).map(Number);
    if (m.length < 3) return null;
    // Chrome devuelve el fondo de la cabecera como color(srgb 0.98 0.98 0.97 / 0.88),
    // con canales de 0 a 1. Leerlos como si fueran de 0 a 255 convertia un crema
    // casi opaco en un negro, e inventaba cuatro fallos en todas las cabeceras.
    const scale = c.indexOf('color(') === 0 ? 255 : 1;
    return { r: m[0] * scale, g: m[1] * scale, b: m[2] * scale, a: m.length > 3 ? m[3] : 1 };
  }
  /**
   * El fondo efectivo, componiendo las capas semitransparentes.
   *
   * La primera versión devolvía el primer backgroundColor no transparente, y
   * eso convertía un verde al 12 % sobre blanco en un verde opaco: la etiqueta
   * de acceso salía con 1,18:1 cuando en pantalla es legible. Medir mal en el
   * sentido alarmista tampoco sirve — obliga a "arreglar" lo que no está roto.
   */
  function bgOf(el) {
    const layers = [];
    let n = el;
    while (n) {
      const c = rgba(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) {
        layers.push(c);
        if (c.a === 1) break;
      }
      n = n.parentElement;
    }
    const base = rgba(getComputedStyle(document.documentElement).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
    if (!layers.length || layers[layers.length - 1].a < 1) layers.push({ ...base, a: 1 });
    let out = layers[layers.length - 1];
    for (let i = layers.length - 2; i >= 0; i -= 1) {
      const top = layers[i];
      out = {
        r: top.r * top.a + out.r * (1 - top.a),
        g: top.g * top.a + out.g * (1 - top.a),
        b: top.b * top.a + out.b * (1 - top.a),
        a: 1,
      };
    }
    return 'rgb(' + out.r + ', ' + out.g + ', ' + out.b + ')';
  }
  /** El color del texto también puede ser semitransparente. */
  function fgOn(color, bg) {
    const f = rgba(color), b = rgba(bg);
    if (!f || !b) return color;
    if (f.a >= 1) return color;
    return 'rgb(' + (f.r * f.a + b.r * (1 - f.a)) + ', ' + (f.g * f.a + b.g * (1 - f.a)) + ', ' + (f.b * f.a + b.b * (1 - f.a)) + ')';
  }
  /** Texto sólo para lectores de pantalla: recortado, no oculto. */
  function isScreenReaderOnly(el) {
    const st = getComputedStyle(el);
    if (st.clipPath && st.clipPath !== 'none') return true;
    if (st.clip && st.clip !== 'auto') return true;
    const b = el.getBoundingClientRect();
    return b.width <= 1 || b.height <= 1;
  }
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.children.length !== 0) continue;
    const text = (el.textContent || '').trim();
    if (!text) continue;
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') continue;
    const box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) continue;
    const size = parseFloat(st.fontSize);
    const bold = parseInt(st.fontWeight, 10) >= 700;
    const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
    if (isScreenReaderOnly(el)) continue;
    const bgColor = bgOf(el);
    const fgColor = fgOn(st.color, bgColor);
    const fg = lum(fgColor);
    const bg = lum(bgColor);
    if (fg === null || bg === null) continue;
    const r = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
    if (r < need) {
      out.push({
        text: text.slice(0, 34),
        sel: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''),
        px: size,
        ratio: +r.toFixed(2),
        need,
        color: st.color,
        bg: bgColor,
      });
    }
  }
  return out;
})()`;

/**
 * Los cuatro caminos por los que se decide el tema, no dos.
 *
 * La paleta se declara tres veces: en `:root`, dentro de
 * `@media (prefers-color-scheme: dark)` y otra vez en `:root[data-theme='dark']`
 * para que la elección manual gane sobre la del sistema. Un barrido que sólo
 * emula la preferencia del sistema nunca ejecuta la tercera, y eso es
 * exactamente lo que pasó: `--ink-subtle` se corrigió en el bloque del `@media`,
 * la revisión salió limpia, y quien elige el tema oscuro a mano seguía viendo
 * el valor viejo.
 *
 * Los dos últimos modos cruzan la preferencia con el atributo a propósito: si
 * el atributo no ganara, el resultado sería un tema mezclado y saldría aquí.
 */
const MODES = [
  { name: 'sistema-claro', scheme: 'light', attr: null },
  { name: 'sistema-oscuro', scheme: 'dark', attr: null },
  { name: 'elegido-claro', scheme: 'dark', attr: 'light' },
  { name: 'elegido-oscuro', scheme: 'light', attr: 'dark' },
];

const browser = await chromium.launch();
let total = 0;
const seen = new Map();

for (const mode of MODES) {
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      colorScheme: mode.scheme,
      viewport: { width: vp.width, height: vp.height },
      /*
       * Para medir contra un Preview protegido. Sólo la cabecera: el valor no
       * se imprime, no se registra y nunca va en la URL, donde quedaría en los
       * accesos del servidor y en el historial.
       */
      ...(process.env.VERCEL_PROTECTION_BYPASS
        ? { extraHTTPHeaders: { 'x-vercel-protection-bypass': process.env.VERCEL_PROTECTION_BYPASS } }
        : {}),
    });
    const page = await context.newPage();
    for (const path of PAGES) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
      // El banner de consentimiento tapa la página y falsea el fondo medido.
      await page.evaluate((attr) => {
        const b = [...document.querySelectorAll('.consent-actions button')].find((x) =>
          /Rechazar/.test(x.textContent || '')
        );
        if (b) b.click();
        /*
         * Sin transiciones: cambiar el tema anima el color, y medir a mitad de
         * la animación da un valor que no existe en ninguno de los dos temas.
         * Salía un 4,41:1 con un verde que no era ni el claro ni el oscuro.
         */
        const kill = document.createElement('style');
        kill.textContent = '*,*::before,*::after{transition:none!important;animation:none!important}';
        document.head.appendChild(kill);
        if (attr) document.documentElement.setAttribute('data-theme', attr);
      }, mode.attr);
      await page.waitForTimeout(150);
      const fails = await page.evaluate(AUDIT);
      total += fails.length;
      for (const f of fails) {
        const key = `${f.sel}|${f.px}|${f.color}`;
        if (!seen.has(key)) seen.set(key, { ...f, where: [] });
        seen.get(key).where.push(`${mode.name}/${vp.name}${path}`);
      }
    }
    await context.close();
  }
}

await browser.close();

const views = PAGES.length * MODES.length * VIEWPORTS.length;
console.log(
  `Páginas: ${PAGES.length} × ${MODES.length} temas × ${VIEWPORTS.length} anchos = ${views} vistas`
);
console.log(`Fallos de contraste: ${total}`);
if (seen.size) {
  console.log('\nDistintos:');
  for (const f of seen.values()) {
    console.log(` ${f.ratio}:1 (necesita ${f.need}) ${f.px}px ${f.sel}  fg=${f.color} bg=${f.bg}`);
    console.log(`   «${f.text}»  ${f.where.length} vistas, p.ej. ${f.where[0]}`);
  }
  process.exitCode = 1;
}
