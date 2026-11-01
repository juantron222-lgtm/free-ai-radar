import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PAGO, comparacion, comparacionesDe, fichaDePago, precioDe, precioPorUnidad } from '@lib/domain/pago';
import { usoComercialDe } from '@lib/domain/uso-comercial';
import { getAllTools, getTool } from '@lib/data/catalog';
import { COLLECTIONS, getCollectionTools } from '@lib/data/collections';
import { filaDe } from '@lib/data/portada';
import { buildSearchDocs, searchTools } from '@lib/search/index';
import { sortTools } from '@lib/search/filters';
import type { Tool } from '@lib/domain/tool';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const leer = (ruta: string) => readFileSync(join(ROOT, ruta), 'utf8');

/*
 * Piloto calidad-precio, aprobado por Juan el 27 de octubre de 2026 y puesto
 * en marcha el 1 de noviembre: Murf, ElevenLabs, Runway y Canva.
 */

describe('los datos del piloto', () => {
  it('son exactamente las cuatro fichas aprobadas, y existen en el catálogo', () => {
    expect(Object.keys(PAGO.fichas).sort()).toEqual(['canva', 'elevenlabs', 'murf-ai', 'runwayml']);
    for (const slug of Object.keys(PAGO.fichas)) expect(getTool(slug), slug).toBeDefined();
  });

  it('cada celda apunta a una fuente que existe, y la primera fuente es siempre el plan gratuito', () => {
    for (const [slug, f] of Object.entries(PAGO.fichas)) {
      const indices = [
        ...f.precio.fuentes,
        ...(f.unidad?.fuentes ?? []),
        ...f.filas.flatMap((fila) => [fila.gratis, fila.pago, fila.ambos].flatMap((c) => c?.fuentes ?? [])),
      ];
      for (const i of indices) expect(f.fuentes[i], `${slug}: fuente ${i}`).toBeDefined();
      expect(f.fuentes[0]!.cita, slug).toMatch(/^Free\b/);
    }
  });

  it('ninguna comprobación está fechada en el futuro', () => {
    const hoy = new Date().toISOString().slice(0, 10);
    for (const [slug, f] of Object.entries(PAGO.fichas)) {
      for (const fu of f.fuentes) expect(fu.comprobadoEl <= hoy, `${slug}: ${fu.comprobadoEl}`).toBe(true);
    }
  });

  it('no publica el dato contradictorio de Runway: no hay fila de tarjeta', () => {
    expect(PAGO.fichas.runwayml!.filas.some((f) => /tarjeta/i.test(f.etiqueta))).toBe(false);
  });
});

describe('precios: mensual, equivalente mensual en anual y total anual', () => {
  it('lo publicado va como verificado y lo calculado como cálculo, con su operación', () => {
    const murf = precioDe(fichaDePago('murf-ai')!);
    expect([murf.mensual.texto, murf.anualPorMes.texto, murf.anualTotal.texto]).toEqual(['29 $', '19 $', '228 $']);
    expect([murf.anualPorMes.tipo, murf.anualTotal.tipo]).toEqual(['verificado', 'verificado']);

    const eleven = precioDe(fichaDePago('elevenlabs')!);
    expect(eleven.anualTotal).toMatchObject({ texto: '60 $', tipo: 'calculo', operacion: '5 $ × 12' });

    const runway = precioDe(fichaDePago('runwayml')!);
    expect(runway.anualTotal).toMatchObject({ texto: '144 $', tipo: 'calculo' });

    const canva = precioDe(fichaDePago('canva')!);
    expect(canva.mensual.texto).toBe('12 €');
    expect(canva.anualTotal).toMatchObject({ texto: '110 €', tipo: 'verificado' });
    expect(canva.anualPorMes).toMatchObject({ texto: '9,17 €', tipo: 'calculo', operacion: '110 € ÷ 12' });
  });

  it('conserva la moneda del fabricante: no convierte nada', () => {
    expect(fichaDePago('canva')!.moneda).toBe('EUR');
    for (const slug of ['murf-ai', 'elevenlabs', 'runwayml']) expect(fichaDePago(slug)!.moneda).toBe('USD');
  });
});

describe('precio por unidad: sólo con una medida que lo aguante', () => {
  it('se calcula con una cuota o con una equivalencia publicada', () => {
    const murf = precioPorUnidad(fichaDePago('murf-ai')!)!;
    expect([murf.mensual.texto, murf.anual.texto]).toEqual(['0,24 $', '0,16 $']);
    const runway = precioPorUnidad(fichaDePago('runwayml')!)!;
    expect([runway.mensual.texto, runway.anual.texto]).toEqual(['0,29 $', '0,23 $']);
    expect(runway.supuestos.join(' ')).toMatch(/Sólo vale para Gen-4.5/);
  });

  it('nunca con una estimación del fabricante, ni sin unidad', () => {
    expect(precioPorUnidad(fichaDePago('elevenlabs')!)).toBeUndefined();
    expect(precioPorUnidad(fichaDePago('canva')!)).toBeUndefined();
  });

  it('la comparación de voz no calcula precio por minuto: estimación frente a cuota no es la misma medida', () => {
    const c = comparacion('voz-comercial')!;
    expect(c.porUnidad).toBeUndefined();
    expect(c.motivoSinPorUnidad).toMatch(/estimación del fabricante/);
    expect(c.motivoSinPorUnidad).toMatch(/cuota/);
  });

  it('una comparación sólo junta herramientas cuyo plan comparado permite el uso comercial que promete', () => {
    for (const c of PAGO.comparaciones) {
      for (const slug of c.herramientas) expect(PAGO.fichas[slug]!.comercialDePago, `${c.id} · ${slug}`).toBe('yes');
    }
  });
});

describe('uso comercial: dice a qué plan se refiere', () => {
  const de = (slug: string) => usoComercialDe(getTool(slug)!);

  it('distingue gratis, sólo de pago, con condiciones, no en el gratuito y sin dato', () => {
    expect(de('canva').estado).toBe('gratis');
    expect(de('runwayml').estado).toBe('gratis');
    expect(de('murf-ai')).toMatchObject({ estado: 'solo-pago', corta: 'Sólo de pago' });
    expect(de('elevenlabs').larga).toBe('No en el plan gratuito; sí desde el plan Starter');
    const estados = new Set(getAllTools().map((t) => usoComercialDe(t).estado));
    for (const e of ['gratis', 'solo-pago', 'condiciones', 'no-gratis', 'sin-dato']) expect(estados).toContain(e);
  });

  it('lo desconocido nunca se convierte en negativo', () => {
    for (const t of getAllTools()) {
      const uso = usoComercialDe(t);
      if (t.freePlan.commercialUse === 'unverified') {
        expect(uso.estado, t.slug).toBe('sin-dato');
        expect(uso.tono, t.slug).toBe('neutro');
      }
      if (uso.estado === 'no-gratis') expect(uso.larga).toMatch(/plan gratuito/);
    }
  });

  it('«Sólo de pago» exige un plan de pago verificado; sin él, sólo se habla del gratuito', () => {
    for (const t of getAllTools()) {
      if (usoComercialDe(t).estado !== 'solo-pago') continue;
      expect(fichaDePago(t.slug)?.comercialDePago, t.slug).toBe('yes');
    }
  });
});

describe('la afiliación no toca nada de esto', () => {
  const afiliada = (t: Tool): Tool => ({
    ...t,
    affiliation: { ...t.affiliation, isAffiliate: true, programName: 'Prueba', affiliateUrl: 'https://example.com/afiliado' },
  });

  it('el bloque, la comparación y el uso comercial no leen la afiliación', () => {
    for (const ruta of [
      'src/components/tools/MerecePagar.astro',
      'src/components/tools/ComparacionPago.astro',
      'src/components/tools/TipoDeDatoChip.astro',
      'src/lib/domain/pago.ts',
      'src/lib/domain/uso-comercial.ts',
    ]) {
      expect(leer(ruta).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''), ruta).not.toMatch(/affiliat|afiliaci/i);
    }
  });

  it('marcar todas las herramientas como afiliadas no cambia etiquetas, comparaciones ni colecciones', () => {
    for (const t of getAllTools()) {
      expect(usoComercialDe(afiliada(t)), t.slug).toEqual(usoComercialDe(t));
      expect(filaDe(afiliada(t)), t.slug).toEqual(filaDe(t));
    }
    for (const slug of Object.keys(PAGO.fichas)) {
      expect(comparacionesDe(slug)).toEqual(comparacionesDe(slug));
    }
    for (const coleccion of COLLECTIONS) {
      const antes = getCollectionTools(coleccion).map((t) => t.slug);
      const despues = getAllTools()
        .map(afiliada)
        .filter(coleccion.match)
        .sort((a, b) => a.name.localeCompare(b.name, 'es'))
        .map((t) => t.slug);
      expect(despues, coleccion.slug).toEqual(antes);
    }
  });

  it('ni el orden del buscador ni el del catálogo', () => {
    const tools = getAllTools();
    const todas = tools.map(afiliada);
    const cat = (s: string) => s;
    for (const q of ['voz', 'vídeo', 'quitar fondo', 'transcribir audio', 'imagen gratis']) {
      expect(searchTools(todas, buildSearchDocs(todas, cat), q).map((t) => t.slug), q).toEqual(
        searchTools(tools, buildSearchDocs(tools, cat), q).map((t) => t.slug)
      );
    }
    const filas = (ts: readonly Tool[]) => ts.map((t) => ({ ...t, ...filaDe(t) }));
    for (const orden of ['useful', 'name', 'recent', 'verified'] as const) {
      expect(sortTools(filas(todas) as never[], orden).map((t: Tool) => t.slug), orden).toEqual(
        sortTools(filas(tools) as never[], orden).map((t: Tool) => t.slug)
      );
    }
  });
});

describe('el buscador ya no recibe etiquetas que salgan de notas', () => {
  it('ni «Recomendada», ni «Fácil de empezar», ni «Para creadores» entre las derivadas', () => {
    for (const t of getAllTools()) {
      for (const etiqueta of ['Recomendada', 'Fácil de empezar', 'Para creadores']) {
        expect(t.badges, `${t.slug}: ${etiqueta}`).not.toContain(etiqueta);
      }
    }
  });

  it('ni las etiquetas escritas a mano, que eran opiniones', () => {
    const docs = buildSearchDocs(getAllTools(), (s) => s);
    const conManuales = getAllTools().filter((t) => t.tags.length > 0);
    expect(conManuales.length, 'el JSON aún las guarda').toBeGreaterThan(0);
    for (const d of docs) {
      expect(d.haystack, d.slug).not.toMatch(/ideal para creadores|bueno para video/);
    }
    for (const ruta of ['src/lib/search/index.ts', 'src/lib/search/client-index.ts']) {
      expect(leer(ruta).replace(/\/\/.*$/gm, ''), ruta).not.toContain('tool.tags');
    }
  });

  it('cuánto cuesta empezar sale de la clasificación de esfuerzo de la ficha', () => {
    const etiquetas = ['Abres y usas', 'Cuenta o configuración previa', 'Instalación sencilla', 'Instalación técnica, modelos o GPU', 'Sin instalar'];
    for (const t of getAllTools()) {
      expect(t.badges.filter((g) => etiquetas.includes(g)), t.slug).toHaveLength(1);
    }
  });
});
