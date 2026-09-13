import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getAllTools } from '@lib/data/catalog';
import { freeAccessLabel } from '@lib/data/category-page';
import { filaDe } from '@lib/data/portada';

/**
 * Web V2, fase 3: el resto del sitio con el sistema de la portada.
 *
 * Como en las fases anteriores, no se fijan textos ni píxeles: se fija la regla
 * que hace que una sección vuelva a parecer otra web o vuelva a contradecirse.
 */

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const tools = getAllTools();
const codigo = (ruta: string) =>
  readFileSync(join(ROOT, ruta), 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('el acceso gratuito no promete lo que los límites desmienten', () => {
  it('ninguna herramienta en la nube con límites dice «sin cuotas»', () => {
    /*
     * ChatGPT salía como «Gratis · Sin cuotas» encima de «límites de mensajes
     * que el fabricante no publica».
     */
    for (const tool of tools) {
      if (tool.hosting !== 'cloud' || tool.freePlan.limits.length === 0) continue;
      const { amount, amountFallback } = freeAccessLabel(tool);
      expect(`${amount ?? ''} ${amountFallback}`, tool.slug).not.toMatch(/sin cuotas/i);
    }
  });

  it('si el fabricante publica la cantidad, se enseña aunque sea gratis del todo', () => {
    /* Gemini CLI publica 1.000 peticiones al día y salía como «Sin cuotas». */
    for (const tool of tools) {
      const cantidad = tool.freePlan.creditsAmount?.trim();
      if (!cantidad) continue;
      if (!['free_real', 'open_source', 'credits', 'freemium', 'trial', 'demo'].includes(tool.freeModel)) continue;
      expect(filaDe(tool).cantidad, tool.slug).toBe(cantidad);
    }
  });
});

describe('el catálogo habla como la portada', () => {
  it('la tarjeta enseña acceso y las tres condiciones con la misma función que la portada', () => {
    const tarjeta = codigo('src/components/tools/ToolCard.astro');
    expect(tarjeta).toContain('filaDe(tool)');
    for (const condicion of ['fila.tarjeta', 'fila.registro', 'fila.comercial']) {
      expect(tarjeta).toContain(condicion);
    }
  });

  it('la tarjeta no repite el modelo de gratuidad en dos insignias', () => {
    /*
     * «Gratis real» salía en grande en la insignia de acceso y otra vez en la
     * primera pastilla, justo debajo.
     */
    const tarjeta = codigo('src/components/tools/ToolCard.astro');
    expect(tarjeta).not.toContain('<AccessBadge');
    expect(tarjeta).not.toContain('<FactChips');
  });

  it('en el catálogo no hay dos cajas de búsqueda', () => {
    const cabecera = codigo('src/components/site/Header.astro');
    expect(cabecera).toMatch(/enCatalogo\s*=/);
    expect(cabecera).toMatch(/\{!enCatalogo && \(\s*<form class="header-search"/);
  });

  it('las páginas interiores usan la misma cabecera, con las migas dentro', () => {
    const catalogo = codigo('src/pages/herramientas/index.astro');
    expect(catalogo).toContain('<CabeceraPagina');
    expect(catalogo).toContain('migasEnCabecera');
  });
});
