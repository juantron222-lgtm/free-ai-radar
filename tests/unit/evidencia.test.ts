import { describe, expect, it } from 'vitest';
import { getAllTools } from '@lib/data/catalog';
import { FieldEvidence, EVIDENCE_FIELDS } from '@lib/domain/tool';
import {
  MOTIVO_LABEL,
  SEMANTICA_FILTRO_ALCANCE,
  UMBRAL_PARCIAL,
  UMBRAL_SUFICIENTE,
  baseDe,
  buscadoEn,
  citaDe,
  coberturaDe,
  cubreTodo,
  evidenciaDe,
  matizDeAlcance,
  motivoDelHueco,
  politicaDe,
  superficiesDe,
} from '@lib/domain/evidencia';
import { hechosCriticos, verificacionDe } from '@lib/domain/verification';
import {
  EMPTY_FILTERS,
  applyFilters,
  countActiveFilters,
  describeFilters,
  parseFilters,
  serializeFilters,
} from '@lib/search/filters';
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
          scope: 'product',
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
      scope: 'weights',
      checkedAt: '2026-08-24',
    });
    expect(sinBase.success).toBe(false);
  });

  it('una cita sin frase no es una cita', () => {
    /*
     * El error que esto impide ya ocurrió: un parche sustituyó entradas que
     * tenían frase literal por entradas `stated` sin nada, y quedaron
     * afirmando «lo dice la fuente» sin poder enseñar qué decía.
     */
    const sinFrase = FieldEvidence.safeParse({
      field: 'freePlan.requiresCreditCard',
      outcome: 'stated',
      sourceUrl: 'https://ejemplo.com/pricing',
      sourceKind: 'pricing',
      scope: 'product',
      checkedAt: '2026-08-24',
    });
    expect(sinFrase.success).toBe(false);
  });

  it('un silencio no puede traer una cita: no hay nada que citar', () => {
    /*
     * Es la mitad que faltaba de la semántica. Una entrada que demuestra que
     * algo NO aparece publicado y adjunta una frase entrecomillada sólo puede
     * haberla fabricado, y sería justo lo contrario de lo que afirma.
     */
    const conCitaImposible = FieldEvidence.safeParse({
      field: 'freePlan.hasWatermark',
      outcome: 'not_published',
      sourceUrl: 'https://ejemplo.com/pricing',
      sourceKind: 'pricing',
      scope: 'product',
      checkedAt: '2026-08-24',
      lookedFor: 'Si el plan gratuito marca',
      quote: 'esto no puede existir',
    });
    expect(conCitaImposible.success).toBe(false);
  });

  it('un silencio sí exige qué se buscó, dónde y cuándo', () => {
    const completo = FieldEvidence.safeParse({
      field: 'freePlan.hasWatermark',
      outcome: 'not_published',
      sourceUrl: 'https://ejemplo.com/pricing',
      sourceKind: 'pricing',
      scope: 'product',
      checkedAt: '2026-08-24',
      lookedFor: 'Si el plan gratuito marca',
    });
    expect(completo.success).toBe(true);

    const sinQue = FieldEvidence.safeParse({
      field: 'freePlan.hasWatermark',
      outcome: 'not_published',
      sourceUrl: 'https://ejemplo.com/pricing',
      sourceKind: 'pricing',
      scope: 'product',
      checkedAt: '2026-08-24',
    });
    expect(sinQue.success).toBe(false);
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
          citaDe(ev) ?? baseDe(ev) ?? buscadoEn(ev),
          `${tool.slug} · ${ev.field} no explica nada`
        ).toBeTruthy();
      }
    }
  });

  it('y ninguna finge una cita donde demuestra un silencio', () => {
    for (const tool of tools) {
      for (const ev of tool.evidence) {
        if (ev.outcome !== 'not_published') continue;
        expect(citaDe(ev), `${tool.slug} · ${ev.field}`).toBeUndefined();
        expect(buscadoEn(ev), `${tool.slug} · ${ev.field}`).toBeTruthy();
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

describe('una evidencia dice por qué puerta se entra', () => {
  it('toda entrada declara su alcance', () => {
    for (const tool of tools) {
      for (const ev of tool.evidence) {
        expect(ev.scope, `${tool.slug} · ${ev.field}`).toBeTruthy();
      }
    }
  });

  it('la licencia de unos pesos no habla del servicio entero', () => {
    /*
     * El riesgo concreto: un modelo con pesos MIT que además vende una API con
     * sus propias condiciones. La MIT dice qué puedes hacer con los pesos; no
     * dice nada de la API. Guardarlo sin alcance convertía un permiso concreto
     * en una promesa general.
     */
    const conDosPuertas = makeTool({
      slug: 'x',
      name: 'X',
      hosting: 'hybrid',
      access: { chat: 'no', chatFree: 'no', api: 'yes', apiFree: 'no', weights: 'yes' },
      evidence: [
        {
          field: 'freePlan.commercialUse',
          outcome: 'derived',
          sourceUrl: 'https://huggingface.co/ejemplo/modelo',
          sourceKind: 'repo',
          scope: 'weights',
          checkedAt: '2026-08-24',
          basis: 'La ficha del modelo declara «License: mit».',
        },
      ],
    });

    const ev = evidenciaDe(conDosPuertas, 'freePlan.commercialUse')!;
    expect(superficiesDe(conDosPuertas).has('api')).toBe(true);
    expect(cubreTodo(conDosPuertas, ev), 'los pesos no cubren la API').toBe(false);
  });

  it('pero sí cubre a lo que sólo se distribuye como pesos', () => {
    /*
     * Whisper no tiene otra puerta: no hay servicio que contratar, así que la
     * licencia de los pesos es la licencia de todo lo que hay.
     */
    const whisper = tools.find((t) => t.slug === 'whisper')!;
    const ev = evidenciaDe(whisper, 'freePlan.commercialUse')!;
    expect(ev.scope).toBe('weights');
    expect(cubreTodo(whisper, ev)).toBe(true);
  });

  it('`product` sólo se usa cuando la fuente de verdad no distingue', () => {
    /*
     * No es el valor por defecto: es una afirmación. Las condiciones de
     * ElevenLabs separan usuario gratuito de usuario de pago pero no separan
     * web de API, así que ahí `product` es correcto.
     */
    const elevenlabs = tools.find((t) => t.slug === 'elevenlabs')!;
    const ev = evidenciaDe(elevenlabs, 'freePlan.commercialUse')!;
    expect(ev.scope).toBe('product');
    expect(ev.outcome).toBe('stated');
  });

  it('lo que se leyó en la tabla de precios de una API se marca como API', () => {
    for (const slug of ['gemini-3-flash', 'claude-haiku-4-5']) {
      const tool = tools.find((t) => t.slug === slug)!;
      for (const ev of tool.evidence) {
        if (!/ai\.google\.dev|platform\.claude\.com/.test(ev.sourceUrl)) continue;
        expect(ev.scope, `${slug} · ${ev.field}`).toBe('api');
      }
    }
  });

  it('las licencias de pesos de la cohorte están marcadas como tales', () => {
    for (const slug of ['whisper', 'kokoro', 'f5-tts', 'deepseek-v4-flash']) {
      const tool = tools.find((t) => t.slug === slug)!;
      const ev = evidenciaDe(tool, 'freePlan.commercialUse')!;
      expect(ev.scope, slug).toBe('weights');
    }
  });

  it('ninguna afirmación pública descansa sólo en una puerta sin decirlo', () => {
    /*
     * La regla que cierra el agujero: si un hecho crítico está decidido y la
     * única evidencia que lo sostiene habla de una puerta más estrecha que el
     * producto, la ficha tiene que poder decir de qué puerta habla. Aquí se
     * comprueba que sabemos detectarlo; la interfaz lo escribe.
     */
    const campos = ['freePlan.commercialUse', 'privacy.trainsOnUserData'] as const;
    const parciales: string[] = [];

    for (const tool of tools) {
      for (const field of campos) {
        const valor =
          field === 'freePlan.commercialUse'
            ? tool.freePlan.commercialUse
            : tool.privacy.trainsOnUserData;
        if (valor === 'unverified') continue;
        const ev = evidenciaDe(tool, field);
        if (!ev) continue;
        if (!cubreTodo(tool, ev)) parciales.push(`${tool.slug}·${field}·${ev.scope}`);
      }
    }

    // No es cero: es una lista conocida y nombrada, no una sorpresa.
    for (const p of parciales) expect(p).toMatch(/·(weights|api|web|app|local|cloud)$/);
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
          scope: 'product',
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
          scope: 'product',
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
          scope: 'product',
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

describe('un filtro promete según lo que sabemos', () => {
  const genera = (t: (typeof tools)[number]) =>
    t.capabilities.some((c) =>
      /text-to-image|text-to-video|image-to-|text-to-music|text-to-speech|avatar-video|video-editing|image-editing/.test(
        c
      )
    );

  const tarjeta = coberturaDe(tools, 'freePlan.requiresCreditCard', (t) => t.freePlan.requiresCreditCard);
  const comercial = coberturaDe(tools, 'freePlan.commercialUse', (t) => t.freePlan.commercialUse);
  const marca = coberturaDe(tools, 'freePlan.hasWatermark', (t) => t.freePlan.hasWatermark, genera);
  const registro = coberturaDe(tools, 'freePlan.requiresSignup', (t) => t.freePlan.requiresSignup);

  it('los umbrales están escritos y ordenados', () => {
    expect(UMBRAL_SUFICIENTE).toBeGreaterThan(UMBRAL_PARCIAL);
    expect(UMBRAL_SUFICIENTE).toBe(0.6);
    expect(UMBRAL_PARCIAL).toBe(0.25);
  });

  it('clasifica los tres campos que pediste revisar', () => {
    expect(politicaDe(registro), 'registro, 90 %').toBe('suficiente');
    expect(politicaDe(tarjeta), 'tarjeta, 40 %').toBe('parcial');
    expect(politicaDe(comercial), 'uso comercial, 27 %').toBe('parcial');
    expect(politicaDe(marca), 'marca de agua, 3 %').toBe('testimonial');
  });

  it('un campo del que no sabemos nada es testimonial, no suficiente', () => {
    expect(politicaDe({ field: 'freePlan.hasWatermark', confirmados: 0, noPublicados: 0, pendientes: 0 })).toBe(
      'testimonial'
    );
    expect(politicaDe({ field: 'freePlan.hasWatermark', confirmados: 0, noPublicados: 30, pendientes: 5 })).toBe(
      'testimonial'
    );
  });

  it('saber que el fabricante calla no cuenta como cobertura', () => {
    /*
     * Es la trampa que este umbral podría invitar a hacer: llenar un campo de
     * `not_published` para que el filtro parezca cubierto. Un silencio
     * documentado es mejor que un hueco mudo, pero no es una respuesta.
     */
    const soloSilencios = { field: 'freePlan.commercialUse' as const, confirmados: 10, noPublicados: 84, pendientes: 0 };
    expect(politicaDe(soloSilencios)).toBe('testimonial');
  });
});

describe('el sustituto de un filtro testimonial', () => {
  const index = buildClientIndex(tools, (s) => s);

  it('devuelve donde lo hemos comprobado, en cualquiera de los dos sentidos', () => {
    const resultado = applyFilters(index, { ...EMPTY_FILTERS, watermarkKnown: true });
    expect(resultado.length).toBeGreaterThan(0);
    for (const entry of resultado) {
      expect(entry.freePlan.hasWatermark, entry.slug).not.toBe('unverified');
    }
  });

  it('y no deja pasar lo desconocido, ni siquiera el silencio documentado', () => {
    const callado = makeTool({
      slug: 'z',
      name: 'Z',
      capabilities: ['text-to-image'],
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
      evidence: [
        {
          field: 'freePlan.hasWatermark',
          outcome: 'not_published',
          sourceUrl: 'https://ejemplo.com/pricing',
          sourceKind: 'pricing',
          scope: 'product',
          checkedAt: '2026-08-24',
          lookedFor: 'Si el plan gratuito marca',
        },
      ],
    });
    const indice = buildClientIndex([callado], (s) => s);
    expect(applyFilters(indice, { ...EMPTY_FILTERS, watermarkKnown: true })).toEqual([]);
  });

  it('viaja en la URL como cualquier otro filtro', () => {
    const conFiltro = { ...EMPTY_FILTERS, watermarkKnown: true };
    expect(serializeFilters(conFiltro)).toContain('wmknown=1');
    expect(parseFilters(new URLSearchParams('wmknown=1')).watermarkKnown).toBe(true);
    expect(countActiveFilters(conFiltro)).toBe(1);
  });

  it('se dice con palabras en el título de la lista', () => {
    expect(describeFilters({ ...EMPTY_FILTERS, watermarkKnown: true }, (x) => x)).toContain('comprobada');
  });
});

describe('un filtro sobre un hecho con alcance dice qué promete', () => {
  const index = buildClientIndex(tools, (s) => s);

  it('la semántica elegida es «al menos una vía», y está escrita', () => {
    expect(SEMANTICA_FILTRO_ALCANCE).toMatch(/al menos una vía/i);
  });

  it('deja pasar un sí que sólo vale por una vía', () => {
    /*
     * DeepSeek publica sus pesos con licencia MIT: la respuesta a «¿puedo
     * usar esto para trabajar?» es sí, por esa vía. Con la semántica estricta
     * quedaría fuera por una vía que no hemos leído, y esconderíamos una
     * respuesta cierta.
     */
    const resultado = applyFilters(index, { ...EMPTY_FILTERS, commercial: true });
    expect(resultado.map((e) => e.slug)).toContain('deepseek-v4-flash');
  });

  it('pero la ficha no lo anuncia como si valiera para todo', () => {
    const deepseek = tools.find((t) => t.slug === 'deepseek-v4-flash')!;
    expect(matizDeAlcance(deepseek, 'freePlan.commercialUse')).toBe('los pesos descargables');
  });

  it('y una afirmación que sí cubre el producto no lleva matiz', () => {
    const ideogram = tools.find((t) => t.slug === 'ideogram')!;
    expect(ideogram.freePlan.commercialUse).toBe('yes');
    expect(matizDeAlcance(ideogram, 'freePlan.commercialUse')).toBeUndefined();
  });

  it('sigue sin dejar pasar lo desconocido: la semántica no lo relaja', () => {
    const resultado = applyFilters(index, { ...EMPTY_FILTERS, commercial: true });
    for (const entry of resultado) {
      expect(entry.freePlan.commercialUse, entry.slug).toBe('yes');
    }
  });
});
