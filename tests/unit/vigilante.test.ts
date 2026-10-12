import { describe, expect, it } from 'vitest';
import { getAllTools } from '@lib/data/catalog';
import {
  comprobarCita,
  fragmentosDeCita,
  normalizar,
  paginaLegible,
} from '../../scripts/vigilante/coincidencia.mjs';

/*
 * El vigilante de citas relee las páginas oficiales y avisa cuando una frase
 * que citamos deja de estar. Estas pruebas fijan cómo trocea y compara, con
 * casos sacados de citas reales del catálogo.
 */

describe('normalizar', () => {
  it('ignora comillas tipográficas, espacios duros y mayúsculas', () => {
    expect(normalizar('Google won’t claim  ownership')).toBe(normalizar("google won't claim ownership"));
    expect(normalizar('500 CREDITS / MONTH')).toBe('500 credits / month');
  });
});

describe('fragmentosDeCita', () => {
  it('parte una tarjeta de precios por sus « · »', () => {
    expect(fragmentosDeCita('Free · 100% Free · 3 Transcripts Daily')).toEqual(['free', '100% free', '3 transcripts daily']);
  });

  it('quita nuestras notas entre corchetes y las omisiones', () => {
    const f = fragmentosDeCita('[Tabla de planes: Free · Pro] Expand Image — Limited · 300/day […] Upscale');
    expect(f).toEqual(['expand image', 'limited', '300/day', 'upscale']);
  });

  it('separa una celda de tabla que citamos con dos puntos', () => {
    expect(fragmentosDeCita('Input price: Free of charge')).toEqual(['input price', 'free of charge']);
  });

  it('descarta trozos sin contenido o demasiado cortos para significar algo', () => {
    expect(fragmentosDeCita('Free · $0 · · €')).toEqual(['free']);
  });
});

describe('comprobarCita', () => {
  const pagina = `Free\n$0 per month\nIncludes\n$5 in one-time credits for new users\n7 message/day limit`;

  it('una cita que sigue entera está intacta', () => {
    expect(comprobarCita('$5 in one-time credits for new users · 7 message/day limit', pagina).estado).toBe('intacta');
  });

  it('la que ya no aparece, desaparecida', () => {
    /* La cita de agosto de v0, contra la página de octubre. */
    expect(comprobarCita('Free plan: $5 monthly credits', pagina).estado).toBe('desaparecida');
  });

  it('y si sólo falta un trozo, dice cuál', () => {
    const r = comprobarCita('7 message/day limit · Sync with GitHub', pagina);
    expect(r.estado).toBe('parcial');
    expect(r.faltan).toEqual(['sync with github']);
  });

  it('una cifra cambiada dentro de una frase cuenta como cambio', () => {
    expect(comprobarCita('Includes 1,200 credits/mo', 'Basic · €0 per month · 500 CREDITS / MONTH').estado).toBe('desaparecida');
  });
});

describe('paginaLegible', () => {
  it('un error o un muro anti-robots no es un cambio del fabricante', () => {
    expect(paginaLegible({ status: 403, texto: 'x'.repeat(1000) }).legible).toBe(false);
    expect(paginaLegible({ status: 200, texto: 'Just a moment... ' + 'x'.repeat(1000) }).legible).toBe(false);
    expect(paginaLegible({ status: 200, texto: 'corta' }).legible).toBe(false);
    expect(paginaLegible({ status: 200, texto: 'Pricing for every stage. '.repeat(40) }).legible).toBe(true);
  });
});

describe('las citas del catálogo se pueden vigilar', () => {
  it('toda cita literal deja al menos un fragmento que buscar', () => {
    /*
     * Una cita que se quedara sin fragmentos pasaría siempre por intacta y el
     * vigilante no la vigilaría nunca.
     */
    const sinFragmentos: string[] = [];
    for (const t of getAllTools()) {
      const citas = [
        ...t.evidence.flatMap((e) => (e.outcome === 'stated' ? [e.quote] : [])),
        ...t.freePlan.includedCapabilities.map((i) => i.evidence.quote),
        ...t.freePlan.provenanceSignals.map((p) => p.evidence.quote),
      ];
      for (const c of citas) if (fragmentosDeCita(c).length === 0) sinFragmentos.push(`${t.slug}: ${c}`);
    }
    expect(sinFragmentos).toEqual([]);
  });
});
