import { describe, expect, it } from 'vitest';
import { getAllTools } from '@lib/data/catalog';
import type { Tool } from '@lib/domain/tool';

/**
 * Una ficha no se contradice a sí misma.
 *
 * Los datos estructurados (tarjeta, uso comercial, marca de agua, renovación)
 * y el texto que los cuenta (titular, descripción, veredicto, resumen y
 * límites) se editan por separado, y es fácil que uno cambie y el otro no:
 * así se habría quedado v0 diciendo «cinco dólares al mes» con créditos de
 * una sola vez. Estas reglas buscan, frase a frase, las combinaciones que no
 * pueden ser verdad a la vez. Se añadieron el 12 de octubre de 2026; ese día
 * el catálogo pasó limpio.
 */

const tools = getAllTools();

function frases(t: Tool): { campo: string; frase: string }[] {
  const textos: Record<string, string> = {
    tagline: t.tagline,
    descriptionShort: t.descriptionShort,
    verdict: t.verdict,
    summary: t.freePlan.summary,
    ...Object.fromEntries(t.freePlan.limits.map((l, i) => [`limits[${i}]`, l])),
  };
  return Object.entries(textos).flatMap(([campo, texto]) =>
    String(texto ?? '')
      .split(/(?<=[.;])\s+|\s+—\s+/)
      .filter((f) => f.trim())
      .map((frase) => ({ campo, frase: frase.trim() }))
  );
}

/** Lo que habla de un plan de pago o de una prueba no describe el plan gratuito. */
const DE_PAGO_O_PRUEBA = /\b(de pago|plan(es)? de pago|más barato|prueba|trial|Pro|Plus|Starter|Standard|Premium|Business|Max|Team|Ultra|empieza en|a partir de)\b/i;

/** «No publica si pide tarjeta» no afirma nada: dice que no consta. */
const NO_LO_PUBLICA = /\bno (lo )?(publica|publican|dice|dicen)\b/i;

interface Regla {
  id: string;
  aplica: (t: Tool) => boolean;
  choca: RegExp;
  /** Frases que nombran otro cupo o un plan de pago y no cuentan. */
  ignora?: RegExp;
}

const SIN_COMPROBAR = (t: Tool, k: 'requiresCreditCard' | 'commercialUse' | 'hasWatermark') =>
  t.freePlan[k] === 'unverified';

const REGLAS: Regla[] = [
  // Lo que los datos dejan sin comprobar, el texto no lo afirma.
  {
    id: 'afirma una tarjeta que no consta',
    aplica: (t) => SIN_COMPROBAR(t, 'requiresCreditCard'),
    choca: /\b(sin tarjeta|no pide tarjeta|no hace falta tarjeta|(pide|exige|requiere) tarjeta)\b/i,
    ignora: DE_PAGO_O_PRUEBA,
  },
  {
    id: 'afirma un uso comercial que no consta',
    aplica: (t) => SIN_COMPROBAR(t, 'commercialUse'),
    choca: /\b(permite (el )?uso comercial|uso comercial (permitido|incluido|no permitido)|s[oó]lo (para )?uso personal|no comercial)\b/i,
    ignora: DE_PAGO_O_PRUEBA,
  },
  {
    id: 'afirma una marca de agua que no consta',
    aplica: (t) => SIN_COMPROBAR(t, 'hasWatermark'),
    choca: /\b(sin marca de agua|lleva(n)? (la |su |una )?marca de agua|con (la |su )?marca de agua)\b/i,
    ignora: DE_PAGO_O_PRUEBA,
  },
  // Y lo que sí consta, no lo desdice.
  {
    id: 'créditos de una vez contados como si volvieran',
    aplica: (t) => t.freePlan.creditReset === 'one_off',
    choca: /(?<!\bno vuelven )\b(al mes|cada mes|mensual(es)?|al día|cada día|diari[oa]s?|a la semana|semanal(es)?)\b/i,
    /*
     * Dos cosas que vuelven y no son los créditos: un tope de mensajes (v0:
     * «siete mensajes al día») y la asignación que conservan las cuentas
     * anteriores a un cambio (v0, 17 de octubre de 2026: las cuentas gratuitas
     * de antes siguen con 5 $ al mes; las nuevas, una sola vez).
     */
    ignora: new RegExp(`${DE_PAGO_O_PRUEBA.source}|no vuelven|mensajes|cuentas (gratuitas )?anteriores`, 'i'),
  },
  {
    id: 'cuota que vuelve contada como de una vez',
    aplica: (t) => ['daily', 'weekly', 'monthly', 'intraday'].includes(t.freePlan.creditReset),
    choca: /\b(una sola vez|de una vez|no se renuev\w*)\b/i,
    // Descript da 60 minutos al mes y, aparte, 100 créditos de IA de una sola vez: son dos cupos.
    ignora: /créditos de IA de una sola vez/i,
  },
  {
    id: 'sin tarjeta, pero la pide',
    aplica: (t) => t.freePlan.requiresCreditCard === 'no',
    choca: /(?<!\bno )\b(pide|exige|requiere|necesita) (una )?tarjeta\b/i,
    ignora: DE_PAGO_O_PRUEBA,
  },
  { id: 'pide tarjeta, pero «sin tarjeta»', aplica: (t) => t.freePlan.requiresCreditCard === 'yes', choca: /\bsin tarjeta\b/i },
  {
    id: 'no comercial, pero lo permite',
    aplica: (t) => t.freePlan.commercialUse === 'no',
    choca: /(?<!\bno )\b(permite (el )?uso comercial|uso comercial (permitido|incluido)|licencia comercial incluida)\b/i,
    ignora: DE_PAGO_O_PRUEBA,
  },
  {
    id: 'comercial, pero sólo personal',
    aplica: (t) => t.freePlan.commercialUse === 'yes',
    choca: /\b(s[oó]lo (para )?uso personal|uso comercial no|sin uso comercial)\b/i,
  },
  {
    id: 'sin marca, pero la lleva',
    aplica: (t) => t.freePlan.hasWatermark === 'no',
    choca: /(?<!\bno )\b(lleva(n)? (la |su |una )?marca de agua|con (la |su )?marca de agua)\b/i,
  },
  {
    id: 'con marca, pero «sin marca»',
    aplica: (t) => t.freePlan.hasWatermark === 'yes',
    choca: /\bsin marca de agua\b/i,
    ignora: DE_PAGO_O_PRUEBA,
  },
  {
    id: 'de pago, pero con plan gratuito',
    aplica: (t) => t.freeModel === 'paid_only',
    choca: /\bplan gratuito (incluye|da|ofrece|tiene)\b/i,
  },
];

describe('una ficha no se contradice a sí misma', () => {
  for (const regla of REGLAS) {
    it(regla.id, () => {
      const choques: string[] = [];
      for (const t of tools) {
        if (!regla.aplica(t)) continue;
        // Una condición citada en «incluido gratis» ya tiene su fuente.
        const citadas = t.freePlan.includedCapabilities.flatMap((i) => (i.condition ? [i.condition] : []));
        for (const { campo, frase } of frases(t)) {
          if (!regla.choca.test(frase)) continue;
          if (regla.ignora?.test(frase)) continue;
          if (NO_LO_PUBLICA.test(frase)) continue;
          if (citadas.some((c) => frase.includes(c))) continue;
          choques.push(`${t.slug} · ${campo}: «${frase}»`);
        }
      }
      expect(choques).toEqual([]);
    });
  }

  it('las cifras de la cuota gratuita salen en el resumen o en los límites', () => {
    const sueltas: string[] = [];
    for (const t of tools) {
      const cuota = t.freePlan.creditsAmount;
      if (!cuota) continue;
      const texto = [t.freePlan.summary, ...t.freePlan.limits].join(' ');
      const faltan = (cuota.match(/\d[\d.,]*/g) ?? []).filter((c) => !texto.includes(c));
      if (faltan.length) sueltas.push(`${t.slug}: «${cuota}» (falta ${faltan.join(', ')})`);
    }
    expect(sueltas).toEqual([]);
  });

  it('las reglas saltan cuando deben', () => {
    /* Una regla que nunca encuentra nada puede estar rota; estas frases inventadas deben chocar. */
    const prueba = (id: string, frase: string) => REGLAS.find((r) => r.id === id)!.choca.test(frase);
    expect(prueba('créditos de una vez contados como si volvieran', 'Cinco dólares en créditos al mes')).toBe(true);
    expect(prueba('créditos de una vez contados como si volvieran', 'Los 125 créditos no vuelven al mes siguiente')).toBe(false);
    // Las excepciones no se tragan el error de verdad.
    const ignora = (id: string, frase: string) => REGLAS.find((r) => r.id === id)!.ignora?.test(frase) ?? false;
    expect(ignora('créditos de una vez contados como si volvieran', 'Cinco dólares en créditos al mes')).toBe(false);
    expect(ignora('créditos de una vez contados como si volvieran', 'y un límite de siete mensajes al día')).toBe(true);
    expect(prueba('sin marca, pero la lleva', 'Los vídeos llevan la marca de agua')).toBe(true);
    expect(prueba('sin marca, pero la lleva', 'lo que salga no lleva marca de agua')).toBe(false);
    expect(prueba('afirma una tarjeta que no consta', 'No pide tarjeta para empezar')).toBe(true);
  });
});
