import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getAllTools } from '@lib/data/catalog';
import {
  VERIFICATION_STATE_LABEL,
  recuentoVerificacion,
  selloDe,
  verificacionDe,
} from '@lib/domain/verification';
import { EMPTY_FILTERS, applyFilters, parseFilters } from '@lib/search/filters';

/**
 * Lo que encontró la auditoría del 28 de agosto de 2026.
 *
 * El hallazgo mayor es el peor fallo posible en un sitio cuyo único activo es
 * poder decir «esto no lo sé»: sesenta y tres de las noventa y cuatro fichas
 * firmaban «hemos abierto la web del fabricante y confirmado uno a uno los
 * datos» dos pantallas por debajo de su propio «0/4 hechos confirmados». Adobe
 * Firefly y Clipdrop enseñaban las dos cosas a la vez, en la misma página.
 *
 * No era un error de dato: eran dos nociones de «verificada» que nadie había
 * atado. El sello del revisor salía del campo almacenado `tool.verification` y
 * el distintivo de arriba de `verificacionDe()`. Coincidían por casualidad.
 *
 * Por eso lo que se vigila aquí es la atadura y no los valores: los valores
 * cambian cada semana y estas reglas tienen que seguir valiendo.
 */

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const tools = getAllTools();

/**
 * El código sin los comentarios.
 *
 * Cada arreglo dejó escrito en su sitio por qué se hizo, y esas explicaciones
 * citan literalmente la frase que se retiró. Buscarla a secas daría positivo
 * sobre la propia explicación: hay que comprobar que nadie la *ejecuta*, no que
 * nadie la nombra.
 */
const codigo = (ruta: string): string =>
  readFileSync(join(ROOT, ruta), 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const ficha = codigo('src/pages/herramientas/[slug].astro');
const portada = codigo('src/pages/index.astro');
const panel = codigo('src/components/discovery/FilterPanel.astro');

describe('un estado de verificación, una sola fuente', () => {
  it('ninguna ficha firma «confirmado uno a uno» sin estar verificada', () => {
    for (const tool of tools) {
      const v = verificacionDe(tool);
      if (v.state === 'verificada') continue;
      expect(selloDe(v), `${tool.slug} firma como comprobado siendo «${v.state}»`).not.toMatch(
        /confirmado uno a uno/i
      );
    }
  });

  it('y la que sí lo está no deja ningún hecho pendiente', () => {
    for (const tool of tools) {
      const v = verificacionDe(tool);
      if (v.state !== 'verificada') continue;
      expect(v.pendientes, tool.slug).toHaveLength(0);
      expect(v.confirmados, tool.slug).toBe(v.total);
      expect(selloDe(v)).toMatch(/confirmado uno a uno/i);
    }
  });

  it('una ficha parcial dice cuántos hechos le faltan y cuáles son', () => {
    for (const tool of tools) {
      const v = verificacionDe(tool);
      if (v.state !== 'parcial') continue;
      const sello = selloDe(v);
      expect(sello, tool.slug).toContain(`${v.pendientes.length} de los ${v.total}`);
      for (const p of v.pendientes) {
        expect(sello.toLowerCase(), `${tool.slug} no nombra «${p.label}»`).toContain(
          p.label.replace(/^¿|\?$/g, '').toLowerCase()
        );
      }
    }
  });

  it('la plantilla ya no indexa textos públicos por el campo almacenado', () => {
    expect(ficha).not.toMatch(/VERIFICATION_(LABEL|MEANING)\[/);
    expect(ficha).not.toMatch(/\[tool\.verification\]/);
  });

  it('la portada y la ficha llaman igual a cada estado', () => {
    /*
     * La portada decía «Verificación completa» y la ficha «Verificada»: el
     * mismo concepto con dos nombres. Por eso la cifra de la portada no se
     * podía rastrear hasta ninguna ficha, y quien lo intentaba concluía que las
     * once no existían.
     */
    expect(portada).not.toMatch(/Verificación completa/);
    for (const etiqueta of Object.values(VERIFICATION_STATE_LABEL)) {
      expect(portada, `la portada no usa «${etiqueta}»`).toContain(etiqueta);
    }
  });
});

describe('cada cifra pública significa una cosa, y las series cierran', () => {
  const r = recuentoVerificacion(tools);

  it('los tres estados particionan el catálogo', () => {
    expect(r.verificada + r.parcial + r.catalogada).toBe(r.total);
    expect(r.total).toBe(tools.length);
  });

  it('el acceso gratuito cierra también, y es otra serie', () => {
    /*
     * Eran 79 con acceso confirmado y 9 sin plan gratuito sobre 94. Los seis
     * que faltaban no se nombraban en ninguna parte: cuatro sin revisar, una
     * con el modelo de gratuidad sin determinar y una de sólo prueba. Un bloque
     * titulado «por qué fiarte» es el peor sitio del mundo para dejar un hueco.
     */
    expect(r.accesoGratuitoConfirmado + r.sinPlanGratuito + r.accesoSinConfirmar).toBe(r.total);
  });

  it('la portada enseña la suma, para poder comprobarla sin salir de ella', () => {
    expect(portada).toContain('hero-stats-suma');
  });
});

describe('un filtro devuelve lo que su etiqueta promete', () => {
  const devuelve = (clave: string) =>
    applyFilters(tools, {
      ...EMPTY_FILTERS,
      ...parseFilters(new URLSearchParams(`${clave}=1`)),
    }).length;

  it('el número del chip es el recuento, no la cobertura', () => {
    /*
     * «Uso comercial 25/94», y al pulsarlo aparecían quince. Las dos cifras
     * eran ciertas y medían cosas distintas —25 es en cuántas fichas tenemos el
     * dato, 15 cuántas lo permiten—, pero iban pegadas a la etiqueta, con el
     * mismo aspecto, en el sitio donde alguien lee «cuántas voy a ver».
     */
    expect(panel).not.toMatch(/filter-chip-cov/);
    expect(panel).toContain('cuantasDevuelve');
  });

  it('la cobertura se cuenta con palabras y fuera del control', () => {
    /*
     * Vivía en un atributo `title`, que en táctil no existe: en el teléfono la
     * barra de filtros era un conjunto de etiquetas ambiguas sin ninguna forma
     * de resolverlas.
     */
    expect(panel).toContain('filters-cobertura');
    expect(panel).toMatch(/tenemos el dato confirmado en/);
  });

  it('ninguna casilla se ofrece si devuelve el catálogo entero o cero', () => {
    /*
     * «Verificada hace poco» devolvía las 94: el umbral son cuatro meses y la
     * comprobación más antigua tiene menos de dos. Quien la pulsaba no veía
     * cambiar nada y no podía saber por qué. Se retira sola mientras no separe
     * nada, y vuelve sola el día que lo haga.
     */
    expect(panel).toMatch(/devuelve === todas\.length \|\| devuelve === 0/);
  });

  it('las dos que la auditoría midió siguen separando el catálogo', () => {
    expect(devuelve('comm'), 'uso comercial').toBeLessThan(tools.length);
    expect(devuelve('nocard'), 'sin tarjeta').toBeLessThan(tools.length);
  });
});

describe('el texto automático no delata la plantilla', () => {
  it('ninguna categoría se publica con las siglas en minúscula', () => {
    /*
     * «Buscas imagen ia sin pagar nada por adelantado», en 34 fichas.
     * Minusculizar una etiqueta se lleva por delante las siglas, y una frase
     * con «imagen ia» dentro delata que no la escribió nadie, justo donde la
     * política editorial promete revisión humana.
     */
    expect(ficha).not.toMatch(/category\.name\.toLowerCase\(\)/);
  });
});

describe('lo que no debe rastrearse no se ofrece a rastrear', () => {
  it('el sitemap no lista el comparador vacío ni /pro', () => {
    /*
     * Las dos se sirven con `noindex, nofollow`. Pedirle a un buscador que
     * rastree una URL y decirle en esa misma URL que no la indexe son dos
     * instrucciones opuestas sobre la misma página.
     */
    const sitemap = codigo('src/pages/sitemap.xml.ts');
    expect(sitemap).not.toMatch(/ROUTES\.compare/);
    expect(sitemap).not.toMatch(/ROUTES\.pricing/);
  });

  it('los seis cebos anti-spam quedan fuera del árbol accesible', () => {
    /*
     * `aria-hidden` sobre un contenedor con un campo enfocable es una
     * contradicción que cada lector de pantalla resuelve a su manera: había un
     * campo de texto etiquetado «No rellenes este campo» que algunos usuarios
     * sí encontraban. `inert` lo saca del árbol y del foco de verdad, y lo deja
     * dentro del formulario, así que el bot que rellena todo sigue delatándose.
     */
    const formularios = [
      'src/components/marketing/NewsletterForm.astro',
      'src/components/tools/CorrectionForm.astro',
      'src/pages/contacto.astro',
      'src/pages/cuenta/crear.astro',
      'src/pages/cuenta/recuperar.astro',
      'src/pages/enviar-herramienta.astro',
    ];
    for (const ruta of formularios) {
      const fuente = readFileSync(join(ROOT, ruta), 'utf8');
      expect(fuente, `${ruta}: cebo sin inert`).toMatch(/-hp" aria-hidden="true" inert>/);
      expect(fuente, `${ruta}: el cebo ya no se envía`).toMatch(/name="website"/);
    }
  });
});
