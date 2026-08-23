import { describe, expect, it } from 'vitest';
import { getAllTools } from '@lib/data/catalog';
import { usableFreeNow } from '@lib/data/category-page';
import { verificacionDe } from '@lib/domain/verification';
import { VERTICALES, candidatasDe, destacadas, sinRepetir } from '@lib/data/home';

/**
 * Lo que la portada enseña, y que no se repita.
 *
 * El módulo principal salía de `getAllTools().slice(0, 6)`. Con el catálogo
 * ordenado alfabéticamente eso daba cinco herramientas de código y un modelo:
 * seis tarjetas para enseñar una sola cosa. Y la misma ficha llegaba a
 * aparecer tres veces en la página porque cumplía tres criterios distintos.
 */

const tools = getAllTools();

describe('el módulo principal representa el catálogo', () => {
  const elegidas = destacadas(6);

  it('trae una herramienta por vertical, hasta seis', () => {
    expect(elegidas.length).toBeGreaterThanOrEqual(4);
    expect(elegidas.length).toBeLessThanOrEqual(6);
  });

  it('ninguna vertical aparece dos veces', () => {
    const verticales = elegidas.map((d) => d.vertical);
    expect(new Set(verticales).size).toBe(verticales.length);
  });

  it('ninguna herramienta aparece dos veces', () => {
    const slugs = elegidas.map((d) => d.tool.slug);
    expect(new Set(slugs).size, slugs.join(', ')).toBe(slugs.length);
  });

  it('no está dominado por una sola categoría', () => {
    /*
     * La prueba que habría cazado el problema original: cinco de las seis
     * destacadas eran de `codigo` porque el orden alfabético empieza por
     * Amazon Q, Bolt, Cursor, GitHub Copilot y JetBrains.
     */
    const porCategoria = new Map<string, number>();
    for (const { tool } of elegidas) {
      porCategoria.set(tool.categorySlug, (porCategoria.get(tool.categorySlug) ?? 0) + 1);
    }
    const mayor = Math.max(...porCategoria.values());
    expect(mayor, 'ninguna categoría puede acaparar el módulo').toBeLessThanOrEqual(2);
  });

  it('cada destacada cumple el criterio publicado', () => {
    for (const { tool } of elegidas) {
      expect(usableFreeNow(tool), `${tool.slug} debe ser usable gratis hoy`).toBe(true);
      expect(verificacionDe(tool).state, `${tool.slug} sin comprobar`).not.toBe('catalogada');
      expect(tool.capabilities.length, `${tool.slug} sin capacidades citadas`).toBeGreaterThan(0);
    }
  });

  it('ninguna destacada es de pago', () => {
    for (const { tool } of elegidas) {
      expect(tool.freeModel, tool.slug).not.toBe('paid_only');
    }
  });

  it('el orden entre candidatas no es alfabético ni por una nota', () => {
    /*
     * Dentro de una vertical gana la que menos huecos tenga. Es un criterio
     * sobre lo comprobado, no sobre la calidad, y por eso se puede publicar.
     */
    for (const vertical of VERTICALES) {
      const candidatas = candidatasDe(tools, vertical.slugs);
      if (candidatas.length < 2) continue;
      const huecos = candidatas.map((t) => verificacionDe(t).pendientes.length);
      for (let i = 1; i < huecos.length; i++) {
        expect(huecos[i - 1]!, `${vertical.id}: candidatas mal ordenadas`).toBeLessThanOrEqual(
          huecos[i]!
        );
      }
    }
  });
});

describe('la deduplicación es explícita, no accidental', () => {
  it('sinRepetir salta lo que ya está colocado', () => {
    const candidatas = tools.slice(0, 5);
    const yaUsadas = [candidatas[0]!.slug, candidatas[2]!.slug];
    const out = sinRepetir(candidatas, yaUsadas, 3);

    expect(out.map((t) => t.slug)).not.toContain(candidatas[0]!.slug);
    expect(out.map((t) => t.slug)).not.toContain(candidatas[2]!.slug);
    expect(out.length).toBe(3);
  });

  it('tampoco se repite dentro de su propia lista', () => {
    const repetida = tools[0]!;
    const out = sinRepetir([repetida, repetida, tools[1]!], [], 3);
    expect(out.length).toBe(2);
  });

  it('respeta el límite', () => {
    expect(sinRepetir(tools, [], 2).length).toBe(2);
    expect(sinRepetir(tools, [], 0).length).toBe(0);
  });

  it('no depende del orden del array de entrada', () => {
    /*
     * Lo que se prohíbe explícitamente: que la ausencia de repetidos venga de
     * cómo estuviera ordenado el catálogo ese día.
     */
    const alReves = [...tools].reverse();
    const out = sinRepetir(alReves, [alReves[0]!.slug], 3);
    expect(out.map((t) => t.slug)).not.toContain(alReves[0]!.slug);
    expect(new Set(out.map((t) => t.slug)).size).toBe(out.length);
  });
});

describe('el logo', () => {
  it('si una ficha declara logo, se sirve desde nuestro dominio', () => {
    for (const tool of tools) {
      if (!tool.logo) continue;
      expect(tool.logo, `${tool.slug} enlaza fuera`).toMatch(/^\/logos\//);
      expect(tool.logo, tool.slug).not.toMatch(/^https?:/);
    }
  });
});
