import { describe, expect, it } from 'vitest';
import { getAllTools } from '@lib/data/catalog';
import { FieldEvidence, EVIDENCE_FIELDS } from '@lib/domain/tool';
import {
  MOTIVO_LABEL,
  coberturaDe,
  evidenciaDe,
  motivoDelHueco,
} from '@lib/domain/evidencia';
import { hechosCriticos, verificacionDe } from '@lib/domain/verification';
import { applyFilters, EMPTY_FILTERS } from '@lib/search/filters';
import { buildClientIndex } from '@lib/search/client-index';
import { makeTool } from '../fixtures/tool';

/**
 * Lo que no sabemos no puede convertirse en lo que nos conviene.
 *
 * Estas pruebas guardan la línea que separa un hecho de una suposición. Ninguna
 * comprueba un valor concreto del catálogo: comprueban que la maquinaria no
 * pueda ascender un hueco a respuesta.
 */

const tools = getAllTools();

describe('un hueco nunca se convierte en un no', () => {
  it('ninguna evidencia de «no publicado» acompaña a un valor decidido', () => {
    /*
     * El error que esto impide es exactamente el de §4: mirar la
     * documentación, no encontrar la respuesta y escribir «no». Si dejamos
     * constancia de que el fabricante calla, el valor tiene que seguir sin
     * confirmar; si no, la constancia sería la coartada de la invención.
     */
    const valorDe: Record<string, (t: (typeof tools)[number]) => string | undefined> = {
      'freePlan.requiresCreditCard': (t) => t.freePlan.requiresCreditCard,
      'freePlan.requiresSignup': (t) => t.freePlan.requiresSignup,
      'freePlan.hasWatermark': (t) => t.freePlan.hasWatermark,
      'freePlan.commercialUse': (t) => t.freePlan.commercialUse,
      'privacy.trainsOnUserData': (t) => t.privacy.trainsOnUserData,
    };

    for (const tool of tools) {
      for (const ev of tool.evidence) {
        if (ev.outcome !== 'not_published') continue;
        const leer = valorDe[ev.field];
        if (!leer) continue;
        expect(leer(tool), `${tool.slug} · ${ev.field}`).toBe('unverified');
      }
    }
  });

  it('el motivo de un hueco es «pendiente» mientras nadie diga lo contrario', () => {
    const sinMirar = makeTool({ slug: 'a', name: 'A' });
    expect(motivoDelHueco(sinMirar, 'freePlan.hasWatermark', 'unverified')).toBe('pendiente');
  });

  it('y pasa a «no publicado» sólo con evidencia que lo diga', () => {
    const mirado = makeTool({
      slug: 'b',
      name: 'B',
      evidence: [
        {
          field: 'freePlan.hasWatermark',
          outcome: 'not_published',
          sourceUrl: 'https://ejemplo.com/pricing',
          sourceKind: 'pricing',
          checkedAt: '2026-08-24',
          lookedFor: 'Si el plan gratuito estampa una marca',
        },
      ],
    });
    expect(motivoDelHueco(mirado, 'freePlan.hasWatermark', 'unverified')).toBe('no_publicado');
  });

  it('un valor confirmado no tiene motivo, se haya mirado o no', () => {
    const confirmado = makeTool({ slug: 'c', name: 'C' });
    expect(motivoDelHueco(confirmado, 'freePlan.requiresCreditCard', 'no')).toBeUndefined();
  });

  it('los dos huecos se llaman distinto en público', () => {
    expect(MOTIVO_LABEL.pendiente).not.toBe(MOTIVO_LABEL.no_publicado);
    expect(MOTIVO_LABEL.no_publicado).toMatch(/fabricante/i);
  });
});

describe('una evidencia sostiene lo que afirma', () => {
  it('toda entrada del catálogo pasa el esquema', () => {
    for (const tool of tools) {
      for (const ev of tool.evidence) {
        const parsed = FieldEvidence.safeParse(ev);
        expect(parsed.success, `${tool.slug} · ${ev.field}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
      }
    }
  });

  it('una derivación sin base no es una derivación', () => {
    const sinBase = FieldEvidence.safeParse({
      field: 'freePlan.commercialUse',
      outcome: 'derived',
      sourceUrl: 'https://ejemplo.com/licence',
      sourceKind: 'licence',
      checkedAt: '2026-08-24',
    });
    expect(sinBase.success).toBe(false);
  });

  it('toda evidencia cita una URL y una fecha', () => {
    for (const tool of tools) {
      for (const ev of tool.evidence) {
        expect(ev.sourceUrl, `${tool.slug} · ${ev.field}`).toMatch(/^https:\/\//);
        expect(ev.checkedAt, `${tool.slug} · ${ev.field}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });

  it('toda evidencia dice algo: una cita, una base o qué se buscó', () => {
    for (const tool of tools) {
      for (const ev of tool.evidence) {
        expect(
          ev.quote ?? ev.basis ?? ev.lookedFor,
          `${tool.slug} · ${ev.field} no explica nada`
        ).toBeTruthy();
      }
    }
  });

  it('ninguna cita un tercero: sólo dominios del fabricante o su repositorio', () => {
    /*
     * La regla de la casa, comprobada en vez de prometida: nada de blogs,
     * agregadores ni comparadores. Se admite la forja y el hub de modelos
     * porque ahí es donde publica el fabricante su licencia.
     */
    const prohibidos = /reddit\.com|medium\.com|producthunt|futurepedia|toolify|g2\.com|capterra/i;
    for (const tool of tools) {
      for (const ev of tool.evidence) {
        expect(ev.sourceUrl, `${tool.slug} · ${ev.field}`).not.toMatch(prohibidos);
      }
    }
  });

  it('sólo se apunta a campos que existen', () => {
    const validos = new Set<string>(EVIDENCE_FIELDS);
    for (const tool of tools) {
      for (const ev of tool.evidence) {
        expect(validos.has(ev.field), `${tool.slug}: ${ev.field}`).toBe(true);
      }
    }
  });
});

describe('un regalo de bienvenida no es una cuota', () => {
  it('lo que no vuelve no se modela como si volviera', () => {
    /*
     * §8: tres mil créditos por instalar una aplicación no convierten a nadie
     * en «3.000 créditos gratis al mes». Si el saldo es de una vez, la
     * renovación tiene que decirlo.
     */
    const bienvenida = makeTool({
      slug: 'd',
      name: 'D',
      freeModel: 'credits',
      freePlan: {
        summary: 'Créditos de bienvenida por registrarse.',
        limits: ['300 créditos al crear la cuenta'],
        requiresSignup: 'yes',
        requiresCreditCard: 'no',
        hasWatermark: 'unverified',
        commercialUse: 'unverified',
        creditReset: 'one_off',
        verifiedAt: '2026-08-24',
      },
    });
    expect(bienvenida.freePlan.creditReset).toBe('one_off');
    expect(['daily', 'weekly', 'monthly']).not.toContain(bienvenida.freePlan.creditReset);
  });

  it('un saldo de una vez lo dice con todas las letras', () => {
    /*
     * Buscar palabras de cadencia no vale: las tres fichas con saldo único
     * mencionan al lado la cuota *del plan de pago*, y eso es contexto
     * legítimo. Lo que hay que exigir es lo contrario, que el texto diga que
     * no se renueva, para que nadie lo lea como una asignación mensual.
     */
    const conSaldoUnico = tools.filter((t) => t.freePlan.creditReset === 'one_off');
    expect(conSaldoUnico.length).toBeGreaterThan(0);

    for (const tool of conSaldoUnico) {
      const texto = `${tool.freePlan.summary} ${tool.freePlan.limits.join(' ')}`;
      expect(texto, `${tool.slug} tiene saldo único y no lo advierte`).toMatch(
        /no se renuev|una sola vez|sin renovación|asignación única/i
      );
    }
  });
});

describe('lo de pago no se disfraza de gratis', () => {
  it('ninguna ficha `paid_only` promete uso gratuito hoy', () => {
    for (const tool of tools) {
      if (tool.freeModel !== 'paid_only') continue;
      expect(tool.freePlan.creditReset, tool.slug).toBe('none');
      expect(tool.startEffort, `${tool.slug} dice que se empieza al instante y es de pago`).not.toBe(
        'instant'
      );
    }
  });
});

describe('lo desconocido no entra en un filtro positivo', () => {
  const index = buildClientIndex(tools, (s) => s);

  it('«uso comercial» sólo devuelve un sí explícito', () => {
    const resultado = applyFilters(index, { ...EMPTY_FILTERS, commercial: true });
    expect(resultado.length).toBeGreaterThan(0);
    for (const entry of resultado) {
      expect(entry.freePlan.commercialUse, entry.slug).toBe('yes');
    }
  });

  it('«sin tarjeta» sólo devuelve un no explícito', () => {
    const resultado = applyFilters(index, { ...EMPTY_FILTERS, noCard: true });
    expect(resultado.length).toBeGreaterThan(0);
    for (const entry of resultado) {
      expect(entry.freePlan.requiresCreditCard, entry.slug).toBe('no');
    }
  });

  it('«sin marca de agua» sólo devuelve un no explícito', () => {
    const resultado = applyFilters(index, { ...EMPTY_FILTERS, noWatermark: true });
    for (const entry of resultado) {
      expect(entry.freePlan.hasWatermark, entry.slug).toBe('no');
    }
  });

  it('saber que el fabricante no lo publica tampoco abre la puerta', () => {
    /*
     * La distinción nueva sirve para contarlo mejor, no para colar nada: un
     * «no publicado» sigue siendo desconocido a efectos de filtrar.
     */
    const callado = makeTool({
      slug: 'e',
      name: 'E',
      freePlan: {
        summary: 'x',
        limits: [],
        requiresSignup: 'no',
        requiresCreditCard: 'unverified',
        hasWatermark: 'unverified',
        commercialUse: 'unverified',
        creditReset: 'none',
        verifiedAt: '2026-08-24',
      },
      evidence: [
        {
          field: 'freePlan.commercialUse',
          outcome: 'not_published',
          sourceUrl: 'https://ejemplo.com/terms',
          sourceKind: 'terms',
          checkedAt: '2026-08-24',
          lookedFor: 'Si permite uso comercial',
        },
      ],
    });

    const indice = buildClientIndex([callado], (s) => s);
    expect(applyFilters(indice, { ...EMPTY_FILTERS, commercial: true })).toEqual([]);
  });
});

describe('la marca de agua sólo cuenta donde tiene sentido', () => {
  it('una herramienta que no genera archivos no la lleva en su lista de hechos', () => {
    const modelo = makeTool({ slug: 'f', name: 'F', capabilities: ['text-generation'] });
    expect(hechosCriticos(modelo).map((h) => h.key)).not.toContain('hasWatermark');
  });

  it('una que sí los genera la lleva', () => {
    const generador = makeTool({ slug: 'g', name: 'G', capabilities: ['text-to-image'] });
    expect(hechosCriticos(generador).map((h) => h.key)).toContain('hasWatermark');
  });

  it('y por tanto no impide que una ficha sin medios sea completa', () => {
    const modelo = makeTool({
      slug: 'h',
      name: 'H',
      capabilities: ['text-generation'],
      verification: 'verified',
      freePlan: {
        summary: 'x',
        limits: [],
        requiresSignup: 'no',
        requiresCreditCard: 'no',
        hasWatermark: 'unverified',
        commercialUse: 'yes',
        creditReset: 'none',
        verifiedAt: '2026-08-24',
      },
    });
    expect(verificacionDe(modelo).state).toBe('verificada');
  });
});

describe('la ficha cuenta los dos huecos por separado', () => {
  const base = {
    summary: 'x',
    limits: [],
    requiresSignup: 'no' as const,
    requiresCreditCard: 'unverified' as const,
    hasWatermark: 'unverified' as const,
    commercialUse: 'unverified' as const,
    creditReset: 'none' as const,
    verifiedAt: '2026-08-24',
  };

  it('sin evidencia, todo lo que falta es trabajo nuestro', () => {
    const tool = makeTool({ slug: 'i', name: 'I', capabilities: ['text-generation'], freePlan: base });
    const v = verificacionDe(tool);
    expect(v.sinComprobar.map((p) => p.key).sort()).toEqual(['commercialUse', 'requiresCreditCard']);
    expect(v.noPublicados).toEqual([]);
  });

  it('con evidencia de silencio, el hueco cambia de dueño', () => {
    const tool = makeTool({
      slug: 'j',
      name: 'J',
      capabilities: ['text-generation'],
      freePlan: base,
      evidence: [
        {
          field: 'freePlan.commercialUse',
          outcome: 'not_published',
          sourceUrl: 'https://ejemplo.com/terms',
          sourceKind: 'terms',
          checkedAt: '2026-08-24',
          lookedFor: 'Si permite uso comercial',
        },
      ],
    });
    const v = verificacionDe(tool);
    expect(v.noPublicados.map((p) => p.key)).toEqual(['commercialUse']);
    expect(v.sinComprobar.map((p) => p.key)).toEqual(['requiresCreditCard']);
    // Y las dos juntas siguen siendo todo lo que falta.
    expect(v.pendientes.length).toBe(v.noPublicados.length + v.sinComprobar.length);
  });

  it('ninguno de los dos convierte la ficha en verificada', () => {
    const tool = makeTool({
      slug: 'k',
      name: 'K',
      verification: 'verified',
      capabilities: ['text-generation'],
      freePlan: base,
      evidence: [
        {
          field: 'freePlan.commercialUse',
          outcome: 'not_published',
          sourceUrl: 'https://ejemplo.com/terms',
          sourceKind: 'terms',
          checkedAt: '2026-08-24',
          lookedFor: 'Si permite uso comercial',
        },
      ],
    });
    expect(verificacionDe(tool).state).toBe('parcial');
  });
});

describe('la fecha de comprobación existe y es real', () => {
  it('toda ficha dice cuándo se comprobó su plan gratuito', () => {
    for (const tool of tools) {
      expect(tool.freePlan.verifiedAt, tool.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(tool.lastVerifiedAt, tool.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('ninguna evidencia se fecha en el futuro', () => {
    const hoy = '2026-08-24';
    for (const tool of tools) {
      for (const ev of tool.evidence) {
        expect(ev.checkedAt <= hoy, `${tool.slug} · ${ev.field}: ${ev.checkedAt}`).toBe(true);
      }
    }
  });
});

describe('la cobertura se puede medir antes de decidir un filtro', () => {
  it('cuenta confirmados, silencios y pendientes sin solaparse', () => {
    const c = coberturaDe(tools, 'freePlan.commercialUse', (t) => t.freePlan.commercialUse);
    expect(c.confirmados + c.noPublicados + c.pendientes).toBe(tools.length);
    expect(c.confirmados).toBeGreaterThan(0);
  });

  it('respeta el «cuándo aplica» que se le pase', () => {
    const genera = (t: (typeof tools)[number]) => t.capabilities.includes('text-to-image');
    const c = coberturaDe(tools, 'freePlan.hasWatermark', (t) => t.freePlan.hasWatermark, genera);
    expect(c.confirmados + c.noPublicados + c.pendientes).toBe(tools.filter(genera).length);
  });
});

describe('los hechos volátiles confirmados en esta cohorte llevan fuente', () => {
  it('todo lo que cambió de valor tiene evidencia que lo sostiene', () => {
    /*
     * No se exige a las noventa y cuatro: se exige a las que esta fase tocó,
     * que son las que se pueden defender hoy. El resto queda en el informe.
     */
    const cohorte = ['whisper', 'kokoro', 'lovable', 'gemini-3-flash'];
    for (const slug of cohorte) {
      const tool = tools.find((t) => t.slug === slug)!;
      const campos = ['freePlan.commercialUse', 'privacy.trainsOnUserData'] as const;
      const alguno = campos.some((f) => evidenciaDe(tool, f));
      expect(alguno, `${slug} cambió de valor sin dejar evidencia`).toBe(true);
    }
  });
});
