import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getAllTools } from '@lib/data/catalog';
import { nivelDeAcceso } from '@lib/search/filters';
import { ANILLOS, RADIO, SECTORES, anilloDe, radarDe, sectorDe } from '@lib/data/radar';

/**
 * El radar de la portada, como afirmaciones ejecutables.
 *
 * Es un gráfico, pero es un gráfico de datos: si un punto está donde no le
 * toca, la portada miente en su primera pantalla. Lo que se fija aquí es que
 * cada punto es una ficha, que está en su sector y en su anillo, que ninguno
 * tapa a otro y que la suma cierra con el catálogo.
 */

const tools = getAllTools();
const radar = radarDe(tools);
const puntos = radar.sectores.flatMap((s) => s.puntos);
const bySlug = new Map(tools.map((t) => [t.slug, t]));

describe('cada punto es una ficha, y cada ficha un punto', () => {
  it('el recuento cierra con el catálogo', () => {
    const retiradas = tools.filter((t) => nivelDeAcceso(t) === 4).length;
    expect(radar.retiradas).toBe(retiradas);
    expect(radar.total + radar.retiradas).toBe(tools.length);
    expect(puntos).toHaveLength(radar.total);
    expect(new Set(puntos.map((p) => p.slug)).size, 'ninguna ficha sale dos veces').toBe(puntos.length);
  });

  it('las retiradas no están, porque no se pueden usar ni pagando', () => {
    for (const p of puntos) {
      expect(bySlug.get(p.slug)!.verification, p.slug).not.toBe('discontinued');
    }
  });

  it('los recuentos por sector suman el total por anillo', () => {
    for (const anillo of ANILLOS) {
      const suma = radar.sectores.reduce((s, sec) => s + sec.recuento[anillo.id], 0);
      expect(suma, anillo.id).toBe(radar.recuento[anillo.id]);
    }
  });
});

describe('cada punto está donde dicen sus datos', () => {
  it('su distancia al centro cae dentro de su anillo', () => {
    for (const p of puntos) {
      const anillo = ANILLOS.find((a) => a.id === p.anillo)!;
      const r = Math.hypot(p.x, p.y);
      expect(r, `${p.slug} en ${p.anillo}`).toBeGreaterThanOrEqual(anillo.desde);
      expect(r, `${p.slug} en ${p.anillo}`).toBeLessThanOrEqual(anillo.hasta);
    }
  });

  it('su ángulo cae dentro de su sector', () => {
    for (const sector of radar.sectores) {
      for (const p of sector.puntos) {
        let a = (Math.atan2(p.y, p.x) * 180) / Math.PI;
        while (a < sector.desde) a += 360;
        while (a > sector.desde + 360) a -= 360;
        expect(a, `${p.slug} en ${sector.id}`).toBeLessThanOrEqual(sector.hasta);
      }
    }
  });

  it('el anillo sale del acceso y del esfuerzo, no de un juicio', () => {
    for (const p of puntos) {
      const tool = bySlug.get(p.slug)!;
      const nivel = nivelDeAcceso(tool);
      if (p.anillo === 'web' || p.anillo === 'instalar') expect(nivel, p.slug).toBe(0);
      if (p.anillo === 'pago') expect(tool.freeModel, p.slug).toBe('paid_only');
      if (p.anillo === 'web') expect(['instant', 'signup'], p.slug).toContain(tool.startEffort);
      if (p.anillo === 'instalar') expect(['install', 'technical'], p.slug).toContain(tool.startEffort);
    }
  });

  it('el sector respeta la categoría principal antes que las secundarias', () => {
    expect(sectorDe(bySlug.get('canva')!), 'Diseño, y también imagen').toBe('imagen');
    expect(sectorDe(bySlug.get('n8n')!), 'Automatización, y también agentes').toBe('agentes');
    expect(sectorDe(bySlug.get('chatgpt')!), 'ninguna de las seis').toBe('otras');
    expect(sectorDe(bySlug.get('elevenlabs')!)).toBe('audio');
  });

  it('una herramienta de pago nunca aparece en un anillo gratuito', () => {
    for (const tool of tools.filter((t) => t.freeModel === 'paid_only')) {
      expect(anilloDe(tool), tool.slug).not.toBe('web');
      expect(anilloDe(tool), tool.slug).not.toBe('instalar');
    }
  });
});

describe('se puede leer', () => {
  it('ningún punto pisa a otro', () => {
    // Radio del punto más grande (5) por dos, y un poco de aire.
    const MINIMA = 10.5;
    const choques: string[] = [];
    for (let i = 0; i < puntos.length; i++) {
      for (let j = i + 1; j < puntos.length; j++) {
        const d = Math.hypot(puntos[i]!.x - puntos[j]!.x, puntos[i]!.y - puntos[j]!.y);
        if (d < MINIMA) choques.push(`${puntos[i]!.slug} / ${puntos[j]!.slug}: ${d.toFixed(1)}`);
      }
    }
    expect(choques).toEqual([]);
  });

  it('todo cabe dentro del círculo', () => {
    for (const p of puntos) expect(Math.hypot(p.x, p.y), p.slug).toBeLessThanOrEqual(RADIO - 4);
  });

  it('los sectores siguen el orden de las puertas', () => {
    expect(SECTORES.map((s) => s.id)).toEqual(['imagen', 'video', 'audio', 'agentes', 'modelos', 'codigo', 'otras']);
    const portada = readFileSync(new URL('../../src/pages/index.astro', import.meta.url), 'utf8');
    expect(portada).toMatch(/ORDEN_HERO = \['\/imagen', '\/video', '\/audio', ROUTES\.agents, ROUTES\.models, '\/codigo'\]/);
  });

  it('el barrido llega a cada punto una sola vez y en orden', () => {
    for (const p of puntos) {
      expect(p.vuelta, p.slug).toBeGreaterThanOrEqual(0);
      expect(p.vuelta, p.slug).toBeLessThan(1);
    }
  });
});

describe('no contradice a las páginas de cada clase', () => {
  it('dice qué cuenta: cada ficha una vez, en su clase principal', () => {
    /*
     * Las páginas de clase cuentan a quien hace imagen además de otra cosa;
     * el radar, no. Las dos cifras son ciertas si cada una dice qué cuenta.
     * La línea que sale al señalar una puerta no lleva el total del sector,
     * que es justo la cifra que alguien compararía con la página de detrás.
     */
    const radar = readFileSync(new URL('../../src/components/home/RadarCatalogo.astro', import.meta.url), 'utf8');
    expect(radar).toMatch(/Cada punto es una herramienta, en su clase principal/);
    expect(radar).toMatch(/<strong>\{d\.etiqueta\}<\/strong> como clase principal: \{d\.texto\}/);
    expect(radar).not.toMatch(/<strong>\{d\.etiqueta\}<\/strong>, \{d\.cuantas\}/);
  });
});
