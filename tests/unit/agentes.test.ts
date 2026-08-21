import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getAllTools } from '@lib/data/catalog';
import { decideFilters, usableFreeNow } from '@lib/data/category-page';
import {
  AGENT_CAPABILITIES,
  CANDIDATE_FILTERS,
  MIN_BLOQUE,
  agentCapabilityCount,
  agentTools,
  agentType,
  byType,
  freeNow,
  local,
} from '@lib/data/agentes';

/**
 * Lo que /agentes promete, como afirmaciones ejecutables.
 *
 * La vertical donde más fácil es mentir sin querer: la palabra «agente» está en
 * la portada de casi todo, y una comparación plana entre un producto que actúa
 * y una biblioteca que hay que programar no ayuda a nadie. Estas pruebas
 * vigilan las dos cosas.
 */

const agentes = agentTools();

describe('qué cuenta como agente', () => {
  it('nadie entra por la palabra: todos tienen un comportamiento citado', () => {
    for (const tool of agentes) {
      expect(agentCapabilityCount(tool), tool.slug).toBeGreaterThan(0);
    }
  });

  it('ninguna ficha de modelo aparece como agente', () => {
    for (const tool of agentes) {
      expect(tool.kind, tool.slug).not.toBe('model');
    }
  });

  /*
   * `agents` significaba «esto tiene que ver con agentes», que no decide nada.
   * Tres fichas la llevan sin que nadie haya comprobado un comportamiento, y no
   * pueden colarse por ella.
   */
  it('la vieja capacidad «agents» no da acceso por sí sola', () => {
    const vagas = getAllTools().filter(
      (t) => t.capabilities.includes('agents') && agentCapabilityCount(t) === 0
    );
    const dentro = new Set(agentes.map((t) => t.slug));
    for (const tool of vagas) {
      expect(dentro.has(tool.slug), `${tool.slug} entra sólo con «agents»`).toBe(false);
    }
  });

  it('una plataforma sin nada agéntico se queda fuera', () => {
    // Hugging Face Spaces es `kind: platform` y aloja modelos: no es un agente.
    expect(agentes.map((t) => t.slug)).not.toContain('hugging-face-spaces');
  });
});

describe('los tipos', () => {
  it('un framework es un framework y una plataforma una plataforma', () => {
    for (const tool of agentes) {
      if (tool.kind === 'framework') expect(agentType(tool), tool.slug).toBe('framework');
      if (tool.kind === 'platform') expect(agentType(tool), tool.slug).toBe('plataforma');
    }
  });

  /*
   * El error que esta prueba fija: Manus tiene terminal y ejecuta código dentro
   * de su propia caja de arena, y una primera versión lo clasificó como agente
   * de código. No toca tu repositorio — te entrega un resultado.
   */
  it('tener terminal no convierte a un agente general en agente de código', () => {
    const manus = agentes.find((t) => t.slug === 'manus')!;
    expect(manus.capabilities).toContain('terminal');
    expect(agentType(manus)).toBe('listo');
  });

  /*
   * Y el mismo error un nivel más abajo: navegar no es investigar. `research`
   * describe el trabajo de varias etapas, y hoy no lo tiene demostrado nadie.
   */
  it('navegar por la web no convierte a nadie en agente de investigación', () => {
    const navegan = agentes.filter((t) => t.capabilities.includes('web-browsing'));
    expect(navegan.length).toBeGreaterThan(0);
    for (const tool of navegan) {
      if (!tool.capabilities.includes('research')) {
        expect(agentType(tool), tool.slug).not.toBe('investigacion');
      }
    }
  });

  it('cada bloque con título tiene al menos tres fichas', () => {
    for (const tipo of ['codigo', 'plataforma', 'framework'] as const) {
      expect(byType(agentes, tipo).length, tipo).toBeGreaterThanOrEqual(MIN_BLOQUE);
    }
  });
});

describe('bloque — probar gratis', () => {
  it('no incluye nada que haya que instalar', () => {
    expect(freeNow(agentes).filter((t) => t.hosting !== 'cloud')).toEqual([]);
  });

  it('deja fuera lo que no tiene plan gratuito', () => {
    const gratis = freeNow(agentes).map((t) => t.slug);
    // Claude Code entra en Pro, 20 $/mes: su página de precios no lo da gratis.
    expect(gratis).not.toContain('claude-code');
  });

  it('deja fuera los créditos que no se renuevan', () => {
    for (const tool of freeNow(agentes)) {
      expect(tool.freePlan.creditReset, tool.slug).not.toBe('one_off');
    }
    // El Sandbox de Dify da 200 créditos y no documenta renovación.
    expect(freeNow(agentes).map((t) => t.slug)).not.toContain('dify');
  });
});

describe('en tu equipo', () => {
  it('sólo entra lo que se ejecuta fuera de la nube', () => {
    for (const tool of local(agentes)) {
      expect(tool.hosting, tool.slug).not.toBe('cloud');
    }
  });

  it('nada local cuenta como usable gratis en la nube', () => {
    for (const tool of agentes.filter((t) => t.hosting !== 'cloud')) {
      expect(usableFreeNow(tool), tool.slug).toBe(false);
    }
  });
});

describe('filtros de agentes', () => {
  const decisions = decideFilters(agentes, CANDIDATE_FILTERS);

  it('cada filtro escondido dice por qué', () => {
    for (const d of decisions.filter((x) => !x.shown)) {
      expect(d.reason, d.filter.id).not.toBe('');
    }
  });

  it('ninguno enseñado deja la lista vacía', () => {
    for (const d of decisions.filter((x) => x.shown)) {
      expect(agentes.filter(d.filter.matches).length, d.filter.id).toBeGreaterThan(0);
    }
  });

  it('no enseña dos filtros que hoy seleccionan lo mismo', () => {
    const sets = decisions
      .filter((d) => d.shown)
      .map((d) =>
        agentes
          .filter(d.filter.matches)
          .map((t) => t.slug)
          .sort()
          .join('|')
      );
    expect(new Set(sets).size).toBe(sets.length);
  });

  /*
   * La marca de agua no se le pregunta a un agente que edita un repositorio: la
   * respuesta es «no» en todos, y un filtro que selecciona el catálogo entero
   * ocupa sitio sin decidir nada.
   */
  it('no ofrece el filtro de marca de agua', () => {
    expect(CANDIDATE_FILTERS.map((f) => f.id)).not.toContain('sin-marca');
  });
});

describe('la verificación de agentes', () => {
  const bySlug = new Map(getAllTools().map((t) => [t.slug, t]));

  it('Claude Code no tiene plan gratuito', () => {
    const tool = bySlug.get('claude-code')!;
    expect(tool.freeModel).toBe('paid_only');
    expect(tool.freePlan.summary).toMatch(/20 \$\/mes/);
  });

  it('Codex sí está incluido en el plan gratuito de ChatGPT', () => {
    const tool = bySlug.get('codex')!;
    expect(tool.freeModel).toBe('freemium');
    // La cantidad no se publica, así que no se inventa.
    expect(tool.freePlan.creditsAmount).toBeUndefined();
  });

  it('Copilot separa lo gratuito de su agente en la nube', () => {
    const tool = bySlug.get('github-copilot')!;
    expect(tool.freePlan.requiresCreditCard).toBe('no');
    expect(tool.freePlan.creditReset).toBe('monthly');
    /*
     * Se comprueba el mecanismo, no la frase. La redacción vino de la página
     * de planes de GitHub y volverá a cambiar cuando ellos la cambien; lo que
     * no puede cambiar es que el límite diga qué queda fuera.
     */
    const limites = tool.freePlan.limits.join(' · ');
    expect(limites, 'el plan gratuito tiene que nombrar lo que excluye').toMatch(/NO incluye/);
    expect(limites, 'y el agente es lo que excluye').toMatch(/agente/i);
  });

  it('Manus publica una renovación diaria, con su cifra', () => {
    const tool = bySlug.get('manus')!;
    expect(tool.freePlan.creditReset).toBe('daily');
    expect(tool.freePlan.creditsAmount).toBe('300 créditos/día');
  });

  it('el Sandbox de Dify es de una sola vez, no una capa permanente', () => {
    const tool = bySlug.get('dify')!;
    expect(tool.freeModel).toBe('credits');
    expect(tool.freePlan.creditReset).toBe('one_off');
  });

  it('Gemini CLI publica su cuota y su licencia', () => {
    const tool = bySlug.get('gemini-cli')!;
    expect(tool.licence).toBe('Apache-2.0');
    expect(tool.freePlan.creditsAmount).toBe('1.000 peticiones/día');
  });

  /*
   * fair-code no es open source. Ver el código y poder autoalojarlo no es lo
   * mismo que una licencia OSI, y llamarlo así induciría a error justo en el
   * campo que alguien consulta para saber si puede usarlo.
   */
  it('n8n no se presenta como open source sin más', () => {
    const tool = bySlug.get('n8n')!;
    expect(tool.openSource).toBe('partial');
    expect(tool.licence).toMatch(/Sustainable Use License/);
  });

  /*
   * `evidence` no está en el esquema y por eso se lee del conjunto de datos.
   *
   * Es deliberado: la cita y la fecha que respaldan cada afirmación viven en el
   * repositorio, donde se revisan en un diff, y no en el objeto que la página
   * pinta. Comprobarlo sobre la ficha hidratada daría siempre vacío —y sería
   * una prueba que aprueba justo lo que quiere impedir.
   */
  it('cada ficha nueva trae una cita oficial de lo que afirma', () => {
    const crudo = JSON.parse(
      readFileSync(new URL('../../src/data/tools-v2.json', import.meta.url), 'utf8')
    ) as Array<{ slug: string; evidence?: Record<string, unknown> }>;
    const porSlug = new Map(crudo.map((t) => [t.slug, t]));

    for (const tool of agentes) {
      const evidencia = porSlug.get(tool.slug)?.evidence ?? {};
      expect(Object.keys(evidencia).length, `${tool.slug} sin evidencia`).toBeGreaterThan(0);
      for (const fuente of tool.sources) {
        expect(fuente.url, tool.slug).toMatch(/^https:\/\//);
      }
    }
  });
});

describe('lo que la tarjeta puede enseñar', () => {
  it('todas las capacidades de agente tienen etiqueta en la página', () => {
    for (const tool of agentes) {
      const propias = tool.capabilities.filter((c) =>
        (AGENT_CAPABILITIES as readonly string[]).includes(c)
      );
      expect(propias.length, tool.slug).toBeGreaterThan(0);
    }
  });

  it('ninguna ficha se queda sin tipo', () => {
    for (const tool of agentes) {
      expect(agentType(tool), tool.slug).toBeTruthy();
    }
  });
});


describe('la puerta editorial de la auditoría', () => {
  /*
   * Después de la primera ronda, «listos para usar» era 1 y «investigación» 0.
   * La auditoría de huecos encontró que el cero venía de mi criterio, no del
   * mercado: los agentes de investigación que sí existen o son de código
   * abierto —y yo había mirado productos alojados— o son un modo dentro de un
   * asistente, que el filtro por `kind` dejaba fuera de oficio.
   *
   * Estas pruebas fijan las dos mitades de la corrección: la puerta se abre
   * para un modo documentado, y no se abre para nada más.
   */
  const enPagina = new Set(agentTools().map((t) => t.slug));

  it('un modelo no entra ni aunque se le declare', () => {
    for (const tool of getAllTools()) {
      if (tool.kind !== 'model') continue;
      expect(enPagina.has(tool.slug), tool.slug).toBe(false);
    }
  });

  it('lo que no es agente, plataforma ni framework entra sólo si lo declara', () => {
    const propios = new Set(['agent', 'platform', 'framework']);
    for (const tool of agentTools()) {
      if (propios.has(tool.kind)) continue;
      expect(tool.secondaryCategories, `${tool.slug} entra sin declararse`).toContain('agentes');
    }
  });

  it('Gemini entra por su modo de investigación, no por ser capaz', () => {
    const gemini = getAllTools().find((t) => t.slug === 'google-gemini')!;
    expect(gemini.secondaryCategories).toContain('agentes');
    expect(gemini.capabilities).toContain('research');
    expect(agentType(gemini)).toBe('investigacion');
  });

  it('el bloque de investigación existe y todas sus fichas lo demuestran', () => {
    /*
     * La cita se busca en el fichero del repositorio, no en la ficha hidratada:
     * `evidence` no forma parte del esquema y el objeto que la página pinta no
     * la lleva. Sobre la ficha hidratada esto aprobaría siempre.
     */
    const crudo = JSON.parse(
      readFileSync(new URL('../../src/data/tools-v2.json', import.meta.url), 'utf8')
    ) as Array<{ slug: string; evidence?: { capabilities?: { sourceUrl?: string } } }>;
    const porSlug = new Map(crudo.map((t) => [t.slug, t]));

    const investigacion = byType(agentTools(), 'investigacion');
    expect(investigacion.length).toBeGreaterThanOrEqual(MIN_BLOQUE);
    for (const tool of investigacion) {
      expect(tool.capabilities, tool.slug).toContain('research');
      expect(
        porSlug.get(tool.slug)?.evidence?.capabilities?.sourceUrl,
        `${tool.slug} afirma investigar sin una cita que lo respalde`
      ).toMatch(/^https:\/\//);
    }
  });

  /*
   * Dos no son un bloque. Se deja escrito para que subirlo sea una decisión y
   * no un descuido: el día que haya un tercero verificado, esta prueba avisa.
   */
  it('«listos para usar» sigue por debajo del mínimo, y se sabe', () => {
    expect(byType(agentTools(), 'listo').length).toBeLessThan(MIN_BLOQUE);
  });
});
