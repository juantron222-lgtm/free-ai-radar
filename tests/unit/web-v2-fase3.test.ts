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
    expect(cabecera).toMatch(/conBuscador = !enCatalogo && !enPortada/);
    expect(cabecera).toMatch(/\{conBuscador && \(\s*<form class="header-search"/);
  });

  it('las páginas interiores usan la misma cabecera, con las migas dentro', () => {
    const catalogo = codigo('src/pages/herramientas/index.astro');
    expect(catalogo).toContain('<CabeceraPagina');
    expect(catalogo).toContain('migasEnCabecera');
  });
});

describe('la ficha pone arriba lo que decide', () => {
  const ficha = codigo('src/pages/herramientas/[slug].astro');

  it('el panel de decisión va antes que la muestra, la tabla y las fuentes', () => {
    const decision = ficha.indexOf('id="decision-title"');
    expect(decision, 'no hay panel de decisión').toBeGreaterThan(-1);
    for (const despues of ['<MuestraEditorial', 'id="free-title"', 'id="sources-title"', 'id="review-title"']) {
      expect(ficha.indexOf(despues), `${despues} va antes que lo que decide`).toBeGreaterThan(decision);
    }
  });

  it('el panel dice acceso, tarjeta, registro, uso comercial, licencia y alternativas', () => {
    for (const dato of ['fila.tipoDeAcceso', 'fila.tarjeta', 'fila.registro', 'fila.comercial', '{licencia}', 'alternativasCortas']) {
      expect(ficha, `falta ${dato}`).toContain(dato);
    }
  });

  it('el acceso no se repite en insignia, pastillas y resumen lateral', () => {
    /*
     * La ficha decía el tipo de acceso en la insignia del veredicto, en la
     * primera pastilla de debajo del nombre y en el «Resumen» lateral.
     */
    expect(ficha).not.toContain('<AccessBadge');
    expect(ficha).not.toContain('<FactChips');
    expect(ficha).not.toContain('tool-aside');
  });

  it('conserva las secciones y los contratos que prueban los E2E del catálogo', () => {
    expect(ficha).toContain('tool-verified-note');
  });

  it('conserva las secciones y los contratos que prueban los E2E', () => {
    for (const contrato of ['Qué te dan gratis', '>Fuentes<', 'Para quién sirve', '<CorrectionForm', '<OutboundButton']) {
      expect(ficha, `falta ${contrato}`).toContain(contrato);
    }
  });
});

describe('las seis verticales son la misma web que el catálogo', () => {
  const VERTICALES = ['imagen', 'video', 'audio', 'codigo', 'agentes', 'modelos'];

  it('usan la cabecera común con las migas dentro', () => {
    for (const nombre of VERTICALES) {
      const pagina = codigo(`src/pages/${nombre}.astro`);
      expect(pagina, nombre).toContain('<CabeceraPagina');
      expect(pagina, nombre).toContain('migasEnCabecera');
      expect(pagina, nombre).not.toContain('class="vert-hero"');
    }
  });

  it('su tarjeta dice acceso y condiciones con la misma función que la del catálogo', () => {
    const tarjeta = codigo('src/components/catalog/IntentCard.astro');
    expect(tarjeta).toContain('filaDe(tool)');
    expect(tarjeta).toContain('verificacionDe(tool)');
    expect(tarjeta).not.toContain('ic-facts');
  });
});

describe('el comparador enseña primero lo que separa', () => {
  it('la prosa y la fecha no cuentan como diferencia', async () => {
    const { FILAS_DE_CONTEXTO, agruparFilas, filasDe } = await import('@lib/data/comparador');
    const chatgpt = tools.find((t) => t.slug === 'chatgpt')!;
    const claude = tools.find((t) => t.slug === 'claude')!;
    const grupos = agruparFilas(filasDe([chatgpt, claude]));
    for (const fila of [...grupos.diferencias, ...grupos.coincidencias]) {
      expect(FILAS_DE_CONTEXTO.has(fila.row.label), fila.row.label).toBe(false);
    }
    for (const fila of grupos.contexto) expect(FILAS_DE_CONTEXTO.has(fila.row.label)).toBe(true);
    for (const fila of grupos.coincidencias) expect(fila.iguales).toBe(true);
    for (const fila of grupos.diferencias) expect(fila.iguales).toBe(false);
  });

  it('arranca con «sólo diferencias» encendido cuando hay algo que esconder', () => {
    const pagina = codigo('src/pages/comparar.astro');
    expect(pagina).toContain('<CabeceraPagina');
    expect(pagina).toMatch(/id="solo-diferencias" checked/);
    expect(pagina).toContain("'solo-diferencias': soloDiferencias");
  });

  it('en móvil cada valor lleva el nombre de su herramienta', () => {
    const pagina = codigo('src/pages/comparar.astro');
    expect(pagina).toContain('data-herramienta={tools[i]?.name}');
    expect(pagina).toContain('content: attr(data-herramienta)');
  });
});

describe('noticias hereda el sistema, no la lógica', () => {
  const indice = codigo('src/pages/noticias/index.astro');
  const noticia = codigo('src/pages/noticias/[slug].astro');
  const tarjeta = codigo('src/components/news/NewsCard.astro');

  it('la portada de noticias usa la cabecera común y las pastillas con cifra', () => {
    expect(indice).toContain('<CabeceraPagina');
    expect(indice).toContain('migasEnCabecera');
    expect(indice).toContain('class="cifra-chip"');
    expect(indice).not.toContain('news-h1');
  });

  it('cada noticia lleva la cabecera de la ficha y las migas dentro', () => {
    expect(noticia).toMatch(/<header class="cabecera noticia-cabecera">/);
    expect(noticia).toContain('migasEnCabecera');
    expect(noticia).toContain('<Breadcrumbs crumbs={migasVisibles}');
    // El JSON-LD de migas sigue llevando el titular: el layout recibe las tres.
    expect(noticia).toMatch(/crumbs=\{crumbs\}/);
  });

  it('el separador no va en el color de las líneas', () => {
    /* Medía 1,3:1 en claro y en oscuro con `--line`. */
    const regla = /\.news-state-sep\s*\{([^}]*)\}/.exec(tarjeta);
    expect(regla, 'falta la regla del separador').not.toBeNull();
    expect(regla![1]).not.toMatch(/var\(--line/);
  });

  it('las plantillas sólo leen noticias: nada de publicar, verificar ni Supabase', () => {
    for (const plantilla of [indice, noticia, tarjeta]) {
      expect(plantilla).not.toMatch(/@lib\/newsroom|supabase|factTrace|publicar|canAutoPublish/i);
    }
  });

  it('el tipo de cada fuente se lee en castellano', () => {
    expect(noticia).toContain('TIPO_DE_FUENTE[source.kind]');
    expect(noticia).not.toMatch(/\{source\.kind\}/);
  });
});
