import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getAllTools, getTool } from '@lib/data/catalog';
import { verificacionDe } from '@lib/domain/verification';
import { ToolRecord } from '@lib/domain/tool';
import { makeToolRecord } from '../fixtures/tool';

/**
 * Ninguna conclusión puede ser más fuerte que el dato que la sostiene.
 *
 * Todas estas pruebas nacen de contradicciones reales que la propia web
 * enseñaba: Midjourney decía «Sin capa gratuita» arriba y «Encaja si buscas
 * imagen IA sin pagar nada» abajo; fichas con `commercialUse: unverified`
 * concluían «No encaja si vas a monetizar»; siete modelos en la nube decían a
 * la vez «Nube» e «Instalación técnica, modelos o GPU».
 *
 * Un lector puede desconfiar del diseño. Lo que no puede es pillar a la web
 * contradiciéndose consigo misma en la misma pantalla.
 */

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const tools = getAllTools();

function fuentes(dir: string, out: string[] = []): string[] {
  for (const entrada of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${entrada}`;
    if (statSync(join(ROOT, rel)).isDirectory()) fuentes(rel, out);
    else if (/\.(astro|ts)$/.test(entrada)) out.push(rel);
  }
  return out;
}

const VISTA = [...fuentes('src/pages'), ...fuentes('src/components'), ...fuentes('src/layouts')];

/**
 * El código sin los comentarios.
 *
 * Cada arreglo de este fichero dejó escrito en su sitio por qué se hizo, y esas
 * explicaciones citan literalmente la frase que se retiró. Buscar la frase a
 * secas daría positivo sobre la propia explicación: lo que hay que comprobar
 * es que nadie la *ejecuta*, no que nadie la nombra.
 */
const codigo = (ruta: string): string =>
  readFileSync(join(ROOT, ruta), 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const ficha = codigo('src/pages/herramientas/[slug].astro');

describe('«sin confirmar» no produce conclusiones', () => {
  it('la línea de monetizar sólo la escribe un no explícito', () => {
    /*
     * La condición era `commercialUse !== 'yes'`, que incluye `unverified`.
     * Con ella, una ficha que decía «Sin confirmar» en la tabla concluía «No
     * encaja si vas a monetizar» cuatro párrafos más abajo.
     */
    expect(ficha).not.toMatch(/commercialUse !== 'yes'/);
    expect(ficha).toMatch(/commercialUse === 'no'/);
  });

  it('ninguna plantilla deriva una conclusión de un !== positivo', () => {
    const sospechosas = /(freePlan\.\w+|openSource) !== '(yes|no)'/g;
    const culpables: string[] = [];
    for (const f of VISTA) {
      const texto = codigo(f);
      for (const m of texto.matchAll(sospechosas)) culpables.push(`${f}: ${m[0]}`);
    }
    expect(culpables, 'un !== incluye «sin confirmar» y lo convierte en conclusión').toEqual([]);
  });
});

describe('lo que no es gratis no se anuncia como gratis', () => {
  it('«sin pagar nada» exige que exista plan gratuito', () => {
    expect(ficha).toMatch(/freeModel !== 'paid_only'[\s\S]{0,120}sin pagar nada/);
  });

  it('hay fichas de pago en el catálogo, así que la regla no es teórica', () => {
    const dePago = tools.filter((t) => t.freeModel === 'paid_only');
    expect(dePago.length).toBeGreaterThan(0);
    expect(dePago.map((t) => t.slug)).toContain('midjourney');
  });

  it('ninguna ficha de pago se cuenta entre las de acceso gratuito', () => {
    for (const tool of tools.filter((t) => t.freeModel === 'paid_only')) {
      expect(tool.freePlan.creditsAmount, `${tool.slug} no debería anunciar cantidad gratuita`)
        .toBeUndefined();
    }
  });
});

describe('un producto en la nube no se instala', () => {
  it('nada alojado en la nube pide instalación técnica', () => {
    /*
     * `startEffort` mide qué hay que hacer antes del primer resultado, no para
     * quién es el producto. Con una clave de API eso es registrarse y
     * configurar —`signup`—, no instalar modelos ni tener GPU.
     */
    const contradictorias = tools.filter(
      (t) => t.hosting === 'cloud' && t.startEffort === 'technical'
    );
    expect(
      contradictorias.map((t) => t.slug),
      'dicen «Nube» y «Instalación técnica» en la misma tarjeta'
    ).toEqual([]);
  });

  it('los modelos de nube que se usan en un chat no exigen instalar', () => {
    for (const tool of tools) {
      if (tool.kind !== 'model' || tool.access.chat !== 'yes') continue;
      expect(tool.startEffort, tool.slug).not.toBe('technical');
      expect(tool.startEffort, tool.slug).not.toBe('install');
    }
  });

  it('lo que sí exige instalación no está en la nube', () => {
    for (const tool of tools.filter((t) => t.startEffort === 'technical')) {
      expect(tool.hosting, `${tool.slug} dice instalación técnica`).not.toBe('cloud');
    }
  });
});

describe('una ficha no dice de sí misma más de lo que sostiene', () => {
  it('la tabla ya no se titula «Condiciones verificadas»', () => {
    expect(ficha).not.toMatch(/Condiciones verificadas/);
  });

  it('ninguna ficha con huecos aparece como completamente verificada', () => {
    for (const tool of tools) {
      const v = verificacionDe(tool);
      if (v.pendientes.length === 0) continue;
      expect(v.state, `${tool.slug} tiene ${v.pendientes.length} huecos`).not.toBe('verificada');
      expect(v.label, tool.slug).not.toBe('Verificada');
    }
  });

  it('Midjourney es el caso que lo demuestra: de pago y parcial', () => {
    const midjourney = getTool('midjourney')!;
    expect(midjourney.freeModel).toBe('paid_only');
    expect(verificacionDe(midjourney).state).not.toBe('verificada');
  });
});

describe('nada promete lo que no puede cumplir', () => {
  it('no existe el botón de avisos, porque no existe el aviso', () => {
    const acciones = codigo('src/components/tools/ToolActions.astro');
    expect(acciones).not.toMatch(/Avisos activos/);
    expect(acciones).not.toMatch(/data-action="follow"/);
  });

  it('lo local se llama local', () => {
    const acciones = codigo('src/components/tools/ToolActions.astro');
    expect(acciones).toMatch(/en este navegador/i);
  });

  it('/pro no expone configuración interna ni simula un cobro', () => {
    const pro = codigo('src/pages/pro.astro');
    expect(pro).not.toMatch(/Modo demostración/);
    expect(pro).not.toMatch(/Stripe no está configurado/);
    expect(pro).not.toMatch(/docs\/[a-z-]+\.md/);
    expect(pro, 'sin formulario de checkout mientras no se pueda pagar').not.toMatch(
      /api\/billing\/checkout/
    );
  });

  it('/pro no aparece en la navegación pública', () => {
    const nav = codigo('src/lib/nav.ts');
    const header = codigo('src/components/site/Header.astro');
    expect(nav).not.toMatch(/label: 'Radar Pro'/);
    expect(header).not.toMatch(/ROUTES\.pricing/);
  });
});

describe('lo antiguo no se presenta como reciente', () => {
  it('la portada saca «qué ha cambiado» de las noticias, no del changelog', () => {
    const home = codigo('src/pages/index.astro');
    expect(home).not.toMatch(/getCatalogChanges/);
    expect(home).toMatch(/getLatestNews/);
    expect(home, 'la ventana temporal tiene que ser explícita').toMatch(/VENTANA_DIAS/);
  });

  it('el changelog del catálogo está congelado en 2024 y por eso no vale', () => {
    /*
     * La prueba deja constancia del motivo: si algún día vuelve a alimentarse,
     * este número cambiará y habrá que decidir de nuevo, en vez de arrastrar
     * una decisión sin contexto.
     */
    const fechas = tools.flatMap((t) => t.changelog.map((c) => c.date)).sort();
    const masReciente = fechas[fechas.length - 1]!;
    expect(masReciente < '2025-01-01', `la más reciente es ${masReciente}`).toBe(true);
  });
});

describe('el maniquí de las pruebas no se queda atrás del esquema', () => {
  it('tiene exactamente los mismos campos que una ficha real', () => {
    /*
     * `makeTool` llevaba un `as ToolRecord` que tapaba lo que le faltaba, y lo
     * que le faltaba era `access`, `licences`, `kind` y `verification` —cuatro
     * campos que el esquema fue ganando y el maniquí no—. El síntoma no era un
     * error de tipos sino un `Cannot read properties of undefined` dentro de
     * una prueba que iba de otra cosa. Sin el cast, esto lo caza el compilador;
     * con esta prueba, además, se ve cuál falta.
     */
    const maniqui = makeToolRecord();

    const faltan = Object.entries(ToolRecord.shape)
      .filter(([, esquema]) => !esquema.isOptional())
      .map(([clave]) => clave)
      .filter((clave) => !(clave in maniqui));

    expect(faltan).toEqual([]);
  });
});
