import { describe, expect, it } from 'vitest';
import { COLLECTIONS, getCollection, getCollectionTools, tieneAccesoGratuito } from '@lib/data/collections';
import { getAllTools } from '@lib/data/catalog';
import { produceMedios } from '@lib/domain/medios';
import { deriveTags } from '@lib/domain/scoring';
import type { Tool } from '@lib/domain/tool';

/*
 * 27 de octubre de 2026, decisión de Juan: ni las colecciones ni el buscador
 * dependen de las notas editoriales («valor para creadores» y las demás). Una
 * nota sin fuente no puede decidir qué entra en una lista ni en qué orden.
 */

const notas = (tool: Tool, valor: number): Tool => ({
  ...tool,
  scores: { freeReal: valor, usefulness: valor, ease: valor, transparency: valor, creatorValue: valor },
  scoreTotal: valor * 10,
});

describe('las colecciones no dependen de ninguna nota', () => {
  it('cambiar todas las notas no mete ni saca a nadie de ninguna colección', () => {
    for (const coleccion of COLLECTIONS) {
      for (const tool of getAllTools()) {
        const conCero = coleccion.match(notas(tool, 0));
        const conDiez = coleccion.match(notas(tool, 10));
        expect(conCero, `${coleccion.slug} · ${tool.slug}`).toBe(coleccion.match(tool));
        expect(conDiez, `${coleccion.slug} · ${tool.slug}`).toBe(coleccion.match(tool));
      }
    }
  });

  it('todas van en orden alfabético, no por la suma de notas', () => {
    for (const coleccion of COLLECTIONS) {
      const nombres = getCollectionTools(coleccion).map((t) => t.name);
      expect(nombres, coleccion.slug).toEqual([...nombres].sort((a, b) => a.localeCompare(b, 'es')));
    }
  });
});

describe('«Para creadores» es una colección temática', () => {
  const coleccion = getCollection('para-creadores')!;

  it('sólo entra lo que crea imagen, vídeo o audio y tiene acceso gratuito', () => {
    const tools = getCollectionTools(coleccion);
    expect(tools.length).toBeGreaterThan(0);
    for (const t of tools) {
      expect(produceMedios(t.capabilities), t.slug).toBe(true);
      expect(tieneAccesoGratuito(t), t.slug).toBe(true);
    }
  });

  it('no deja fuera a ninguna herramienta de creación con acceso gratuito', () => {
    const esperadas = getAllTools().filter((t) => tieneAccesoGratuito(t) && produceMedios(t.capabilities));
    expect(getCollectionTools(coleccion).map((t) => t.slug).sort()).toEqual(esperadas.map((t) => t.slug).sort());
  });

  it('no promete en general nada sobre el uso comercial ni la marca de agua', () => {
    const texto = `${coleccion.lede} ${coleccion.description} ${coleccion.context}`;
    expect(texto).not.toMatch(/ausencia de .*restricci[oó]n comercial/i);
    expect(texto).not.toMatch(/sin restricci[oó]n comercial/i);
    expect(texto).not.toMatch(/las que mejor/i);
    expect(texto).toMatch(/no significa que puedas usar comercialmente/);
  });
});

describe('el buscador no recibe la etiqueta «Para creadores»', () => {
  it('ninguna ficha la lleva, aunque su nota sea la máxima', () => {
    for (const t of getAllTools()) expect(t.tags, t.slug).not.toContain('Para creadores');
    const maxima = notas(getAllTools()[0]!, 10);
    expect(deriveTags(maxima)).not.toContain('Para creadores');
  });
});
