import { describe, expect, it } from 'vitest';
import { getAllTools } from '@lib/data/catalog';

/**
 * Lo que el plan gratuito no incluye, con su cita.
 *
 * `freePlan.excludedCapabilities` separa lo que el producto hace de lo que te
 * deja hacer gratis. El motor de decisión (docs/diseno-motor-de-decision.md)
 * depende de él para no recomendar gratis algo que es de pago, y hasta el 11
 * de octubre de 2026 sólo una ficha lo tenía relleno. Ese día se revisaron las
 * líneas de límites que declaraban exclusiones, contra la fuente oficial de
 * ese mismo día, y salieron dos correcciones de lo publicado.
 */

const tools = getAllTools();
const ficha = (slug: string) => tools.find((t) => t.slug === slug)!;

describe('cada exclusión se apoya en una cita oficial', () => {
  it('ninguna ficha excluye una capacidad sin evidencia «stated» de una fuente oficial', () => {
    for (const tool of tools.filter((t) => t.freePlan.excludedCapabilities.length > 0)) {
      const ev = tool.evidence.find((e) => e.field === 'freePlan.excludedCapabilities');
      expect(ev, `${tool.slug} excluye sin evidencia`).toBeTruthy();
      expect(ev!.outcome, tool.slug).toBe('stated');
      expect(['pricing', 'docs', 'help', 'terms', 'official'], tool.slug).toContain(ev!.sourceKind);
    }
  });

  it('sólo se excluye lo que el producto hace', () => {
    for (const tool of tools) {
      for (const c of tool.freePlan.excludedCapabilities) {
        expect(tool.capabilities, `${tool.slug} excluye ${c}, que no declara`).toContain(c);
      }
    }
  });
});

describe('lo incluido gratis también se cita, y no se deduce de lo excluido', () => {
  /*
   * Juan, 11 de octubre de 2026: «que una función no figure entre las
   * exclusiones conocidas no significa que esté incluida gratis. Si no hay
   * confirmación, sigue como desconocida». Por eso hay dos listas y ninguna
   * se calcula a partir de la otra.
   */
  const conInclusiones = tools.filter((t) => t.freePlan.includedCapabilities.length > 0);

  it('hay inclusiones comprobadas, o esta regla no prueba nada', () => {
    expect(conInclusiones.length).toBeGreaterThan(0);
  });

  it('cada inclusión trae su frase literal, de una fuente oficial, fechada', () => {
    for (const tool of conInclusiones) {
      for (const inc of tool.freePlan.includedCapabilities) {
        const donde = `${tool.slug} · ${inc.capability}`;
        expect(inc.evidence.outcome, donde).toBe('stated');
        expect(inc.evidence.quote.trim().length, donde).toBeGreaterThan(10);
        expect(['pricing', 'docs', 'help', 'terms', 'official', 'licence', 'repo'], donde).toContain(inc.evidence.sourceKind);
        expect(inc.evidence.checkedAt <= new Date().toISOString().slice(0, 10), donde).toBe(true);
      }
    }
  });

  it('sólo se incluye lo que el producto hace, una vez, y nunca lo que el plan excluye', () => {
    for (const tool of conInclusiones) {
      const vistas = tool.freePlan.includedCapabilities.map((i) => i.capability);
      expect(new Set(vistas).size, `${tool.slug} repite una inclusión`).toBe(vistas.length);
      for (const c of vistas) {
        expect(tool.capabilities, `${tool.slug} incluye ${c}, que no declara`).toContain(c);
        expect(tool.freePlan.excludedCapabilities, `${tool.slug} incluye y excluye ${c}`).not.toContain(c);
      }
    }
  });

  it('una ficha de pago no incluye nada gratis', () => {
    for (const tool of conInclusiones) {
      expect(tool.freeModel, tool.slug).not.toBe('paid_only');
    }
  });
});

describe('las marcas que no se ven van aparte de la marca de agua', () => {
  /*
   * Juan, 11 de octubre de 2026: SynthID y las credenciales C2PA son
   * información de procedencia, no un logotipo sobre el resultado. Se
   * registran en `provenanceSignals` y `hasWatermark` habla sólo de lo que se
   * ve o se oye.
   */
  const invisible = /SynthID|C2PA|Content Credentials|inaudible|invisible/i;

  it('ningún «sí» de marca de agua se apoya en una marca invisible', () => {
    for (const tool of tools) {
      if (tool.freePlan.hasWatermark !== 'yes') continue;
      const ev = tool.evidence.find((e) => e.field === 'freePlan.hasWatermark');
      if (ev?.outcome !== 'stated') continue;
      expect(ev.quote, tool.slug).not.toMatch(invisible);
    }
  });

  it('cada marca técnica trae su frase, de una fuente oficial', () => {
    const con = tools.filter((t) => t.freePlan.provenanceSignals.length > 0);
    expect(con.length).toBeGreaterThan(0);
    for (const tool of con) {
      const vistas = tool.freePlan.provenanceSignals.map((p) => p.signal);
      expect(new Set(vistas).size, `${tool.slug} repite una señal`).toBe(vistas.length);
      for (const p of tool.freePlan.provenanceSignals) {
        expect(p.evidence.outcome, `${tool.slug} · ${p.signal}`).toBe('stated');
        expect(['pricing', 'docs', 'help', 'terms', 'official'], tool.slug).toContain(p.evidence.sourceKind);
      }
    }
  });

  it('Gemini: la marca visible se puede quitar; SynthID no', () => {
    const t = ficha('google-gemini');
    expect(t.freePlan.hasWatermark).toBe('no');
    expect(t.freePlan.provenanceSignals.map((p) => p.signal)).toEqual(expect.arrayContaining(['synthid', 'c2pa']));
  });
});

describe('lo que se comprobó el 11 de octubre de 2026', () => {
  it('ElevenLabs: la clonación de voz es de pago; el doblaje, no', () => {
    /*
     * La ficha decía «Clonación de voz y doblaje: no incluidos». La clonación
     * es de Starter («Everything in free, plus … Instant Voice Cloning»), pero
     * su centro de ayuda dice «Dubbing is available on all our plans,
     * including the free plan», con marca de agua.
     */
    const t = ficha('elevenlabs');
    expect(t.freePlan.excludedCapabilities).toEqual(['voice-clone']);
    const publicado = [t.freePlan.summary, ...t.freePlan.limits].join(' ');
    expect(publicado).not.toMatch(/doblaje[^.]*no (est[áa]n? )?incluid/i);
  });

  it('ElevenLabs: el doblaje gratis lleva su condición y su fuente', () => {
    const t = ficha('elevenlabs');
    const doblaje = t.freePlan.includedCapabilities.find((i) => i.capability === 'dubbing');
    expect(doblaje?.condition).toBe('con marca de agua que no se puede quitar');
    expect(doblaje?.evidence.quote).toContain('Dubs generated on free plans are automatically watermarked');
    expect(t.freePlan.limits).toContain('Doblaje: incluido, con marca de agua que no se puede quitar');
    /*
     * El «no lo publican» de la marca de agua dejó de ser cierto: lo publican
     * para el doblaje, y su ayuda dice además que marcan de forma inaudible el
     * audio que generan. Si eso es «sí» o «parcial» para el plan entero lo
     * decide Juan; mientras, pendiente, sin un silencio que ya no lo es.
     */
    expect(t.freePlan.hasWatermark).toBe('unverified');
    expect(t.evidence.find((e) => e.field === 'freePlan.hasWatermark')).toBeUndefined();
  });

  it('Grok Imagine: el vídeo no está en Free', () => {
    expect(ficha('grok-imagine').freePlan.excludedCapabilities).toEqual(['text-to-video', 'image-to-video']);
  });

  it('Ideogram: escalar es de pago; quitar el fondo, no', () => {
    /*
     * La ficha decía «Sin Magic Fill, Extend, escalado ni recorte de fondo».
     * Su FAQ: «Upscale sizes need a paid plan», y quitar el fondo «costs 1
     * credit», sin plan de pago.
     */
    const t = ficha('ideogram');
    expect(t.freePlan.excludedCapabilities).toEqual(['upscaling']);
    const publicado = [t.freePlan.summary, ...t.freePlan.limits].join(' ');
    expect(publicado).not.toMatch(/recorte de fondo[^.]*no incluid|ni recorte de fondo/i);
    expect(publicado).toContain('Quitar el fondo: disponible, por 1 crédito');
  });

  it('Ideogram: el plan gratuito de hoy, no el de agosto', () => {
    /*
     * Revisión completa autorizada por Juan. Su documentación (verificada por
     * ellos el 1 de octubre) da 30 créditos a la semana sólo a quien entra con
     * Google, Apple o Microsoft; con correo y contraseña, ninguno. Los «dos
     * lienzos» y «sin referencia de estilo ni de personaje» salían de una
     * tabla de precios que ya no existe: la de hoy no los menciona, y su FAQ
     * de precios y su documentación se contradicen sobre las referencias, así
     * que la ficha no afirma ni lo uno ni lo otro.
     */
    const t = ficha('ideogram');
    const publicado = [t.freePlan.summary, ...t.freePlan.limits].join(' ');
    expect(t.freePlan.creditsAmount).toBe('30 créditos/semana');
    expect(publicado).toContain('Google, Apple o Microsoft');
    expect(publicado).not.toMatch(/lienzos|referencia de estilo|de personaje/i);
    expect(t.freePlan.includedCapabilities.map((i) => i.capability)).toContain('background-removal');
    expect(t.lastVerifiedAt).toBe('2026-10-11');
  });
});
