import { describe, expect, it } from 'vitest';
import { getAllTools } from '@lib/data/catalog';
import { metaDescription } from '@lib/seo/site';
import { LARGO_DESCRIPCION, condicionesConocidas, descripcionDeFicha } from '@lib/seo/ficha';

/**
 * Lo que sale de cada ficha en un buscador.
 *
 * Antes: eslogan + «Analizamos su plan gratuito:» + resumen, cortado con «…».
 * Ahora: la pregunta que se busca, contestada con lo comprobado, entera.
 */

const tools = getAllTools();

describe('la descripción de una ficha en el buscador', () => {
  it('cabe entera: ninguna sale cortada con «…»', () => {
    for (const tool of tools) {
      const d = descripcionDeFicha(tool);
      expect(d.length, `${tool.slug}: ${d.length}`).toBeLessThanOrEqual(LARGO_DESCRIPCION);
      expect(metaDescription(d), tool.slug).toBe(d);
    }
  });

  it('empieza por la pregunta que se busca, salvo si está retirada', () => {
    for (const tool of tools) {
      const d = descripcionDeFicha(tool);
      if (tool.verification === 'discontinued') expect(d, tool.slug).toMatch(/ya no está disponible/);
      else expect(d.startsWith(`¿${tool.name} es gratis? `), `${tool.slug}: ${d}`).toBe(true);
    }
  });

  it('sin plan gratuito contesta que no', () => {
    for (const tool of tools.filter((t) => t.freeModel === 'paid_only' && t.verification !== 'discontinued')) {
      expect(descripcionDeFicha(tool), tool.slug).toContain('es gratis? No: no tiene plan gratuito.');
    }
  });

  it('no dice nada de tarjeta, registro o uso comercial que la ficha no tenga comprobado', () => {
    for (const tool of tools) {
      const d = descripcionDeFicha(tool).toLocaleLowerCase('es');
      const { requiresCreditCard, requiresSignup, commercialUse } = tool.freePlan;
      if (requiresCreditCard === 'unverified') expect(d, tool.slug).not.toMatch(/tarjeta/);
      if (requiresSignup === 'unverified') expect(d, tool.slug).not.toMatch(/registro/);
      if (commercialUse === 'unverified') expect(d, tool.slug).not.toMatch(/uso comercial/);
    }
  });

  it('las condiciones salen literalmente de los campos', () => {
    const conTodo = tools.find(
      (t) => t.freePlan.requiresCreditCard === 'no' && t.freePlan.requiresSignup === 'yes' && t.freePlan.commercialUse === 'yes'
    );
    expect(conTodo, 'hace falta una ficha con las tres condiciones comprobadas').toBeTruthy();
    expect(condicionesConocidas(conTodo!)).toEqual(['sin tarjeta', 'con registro', 'uso comercial permitido']);
  });

  it('cada ficha tiene la suya', () => {
    const todas = tools.map(descripcionDeFicha);
    expect(new Set(todas).size).toBe(todas.length);
  });
});
