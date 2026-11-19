import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getAllTools, getTool } from '@lib/data/catalog';
import { LARGO_TITULO, preguntasDeFicha, tituloDeFicha } from '@lib/seo/ficha';
import { faqSchema } from '@lib/seo/structured-data';

/*
 * Search Console, 4 oct – 16 nov 2026: casi todo lo que nos encuentran es
 * «¿X es gratis?». Lovable salía 1.010 veces con un clic, bajo un título que
 * repetía la pregunta sin contestarla. Juan aprobó el 19 de noviembre contestar
 * en el título y añadir preguntas frecuentes, las dos sólo con datos comprobados.
 */

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const vivas = getAllTools().filter((t) => t.verification !== 'discontinued');

describe('el título contesta «¿es gratis?»', () => {
  it('con la respuesta comprobada, para las fichas más buscadas', () => {
    expect(tituloDeFicha(getTool('lovable')!)).toBe('¿Lovable es gratis? Con créditos diarios, sin tarjeta');
    expect(tituloDeFicha(getTool('ollama')!)).toBe('¿Ollama es gratis? Sí, sin cuotas en tu equipo');
  });

  it('sin la cifra: la cantidad exacta se lee en la ficha', () => {
    expect(tituloDeFicha(getTool('suno-ai')!)).toBe('¿Suno AI es gratis? Con créditos diarios, sin tarjeta');
    expect(tituloDeFicha(getTool('manus')!)).toBe('¿Manus es gratis? Con créditos diarios');
    for (const t of vivas) expect(tituloDeFicha(t).slice(`¿${t.name} es gratis? `.length), t.slug).not.toMatch(/\d/);
  });

  it('cabe antes del corte de Google salvo cuando el nombre solo ya no deja sitio', () => {
    for (const t of vivas) {
      const titulo = tituloDeFicha(t);
      if (t.name.length < 20) expect(titulo.length, titulo).toBeLessThanOrEqual(LARGO_TITULO);
      expect(titulo.startsWith(`¿${t.name} es gratis? `), titulo).toBe(true);
    }
  });

  it('«sin tarjeta» sólo cuando está comprobado', () => {
    for (const t of vivas) {
      if (tituloDeFicha(t).includes('sin tarjeta')) expect(t.freePlan.requiresCreditCard, t.slug).toBe('no');
    }
  });

  it('lo que no hemos comprobado no se contesta como si lo supiéramos', () => {
    for (const t of vivas.filter((x) => x.freeModel === 'unknown')) {
      expect(tituloDeFicha(t), t.slug).toMatch(/Aún no lo hemos comprobado$/);
    }
  });

  it('una retirada no se anuncia como si siguiera ahí', () => {
    for (const t of getAllTools().filter((x) => x.verification === 'discontinued')) {
      expect(tituloDeFicha(t), t.slug).toMatch(/retirada por su fabricante/);
    }
  });

  it('dos fichas no comparten título', () => {
    const titulos = getAllTools().map(tituloDeFicha);
    expect(new Set(titulos).size).toBe(titulos.length);
  });
});

describe('las preguntas frecuentes sólo preguntan lo que la ficha sabe', () => {
  it('ninguna pregunta sobre un dato sin comprobar', () => {
    for (const t of vivas) {
      const qs = preguntasDeFicha(t).map((p) => p.pregunta).join(' | ');
      if (!['yes', 'no'].includes(t.freePlan.requiresCreditCard)) expect(qs, t.slug).not.toMatch(/tarjeta/);
      if (!['yes', 'no'].includes(t.freePlan.requiresSignup)) expect(qs, t.slug).not.toMatch(/registrarse/);
      if (!['yes', 'no', 'partial'].includes(t.freePlan.commercialUse)) expect(qs, t.slug).not.toMatch(/comerciales/);
      if (t.freePlan.limits.length === 0) expect(qs, t.slug).not.toMatch(/límites/);
    }
  });

  it('una ficha sin plan gratuito no pregunta por lo que daría ese plan', () => {
    for (const t of vivas.filter((x) => x.freeModel === 'paid_only')) {
      expect(preguntasDeFicha(t).map((p) => p.pregunta).join(' '), t.slug).not.toMatch(/tarjeta|comerciales|renueva|límites/);
    }
  });

  it('siempre empieza por «¿es gratis?», con la misma respuesta que el título', () => {
    for (const t of vivas) {
      const [primera] = preguntasDeFicha(t);
      expect(primera!.pregunta).toBe(`¿${t.name} es gratis?`);
      // La misma respuesta: el título puede ir sin la cifra, pero nunca dice otra cosa.
      const palabra = (x: string) => x.split(/[ ,:]/)[0];
      const delTitulo = tituloDeFicha(t).slice(primera!.pregunta.length + 1);
      expect(palabra(primera!.respuesta), `${t.slug}: «${delTitulo}» / «${primera!.respuesta}»`).toBe(palabra(delTitulo));
    }
  });

  it('las respuestas son frases cerradas, sin paréntesis dentro de paréntesis', () => {
    for (const t of vivas) {
      for (const p of preguntasDeFicha(t)) {
        expect(p.respuesta, t.slug).toMatch(/[.!?…]$/);
        expect(p.respuesta, t.slug).not.toMatch(/\([^)]*\(/);
      }
    }
  });

  it('una retirada no tiene preguntas', () => {
    for (const t of getAllTools().filter((x) => x.verification === 'discontinued')) expect(preguntasDeFicha(t)).toEqual([]);
  });

  it('el marcado FAQPage dice exactamente lo que se ve en la página', () => {
    const ficha = readFileSync(join(ROOT, 'src/pages/herramientas/[slug].astro'), 'utf8');
    expect(ficha).toContain('faqSchema(preguntas.map((p) => ({ question: p.pregunta, answer: p.respuesta })))');
    expect(ficha).toMatch(/preguntas\.map\(\(p\) => \(\s*<div>\s*<dt>\{p\.pregunta\}<\/dt>\s*<dd>\{p\.respuesta\}<\/dd>/);
    const lovable = preguntasDeFicha(getTool('lovable')!);
    const schema = faqSchema(lovable.map((p) => ({ question: p.pregunta, answer: p.respuesta }))) as {
      mainEntity: { name: string; acceptedAnswer: { text: string } }[];
    };
    expect(schema.mainEntity.map((q) => [q.name, q.acceptedAnswer.text])).toEqual(lovable.map((p) => [p.pregunta, p.respuesta]));
  });
});
