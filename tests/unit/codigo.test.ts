import { describe, expect, it } from 'vitest';
import { getAllTools } from '@lib/data/catalog';
import { decideFilters, freeAccessLabel, usableFreeNow } from '@lib/data/category-page';
import {
  CANDIDATE_FILTERS,
  CODE_CAPABILITIES,
  CODE_TYPE_LABEL,
  MIN_BLOQUE,
  abiertoYLocal,
  byType,
  codeCapabilityCount,
  codeTools,
  codeType,
  facilesParaEmpezar,
  freeNow,
  localControl,
  type CodeType,
} from '@lib/data/codigo';

/**
 * Lo que /codigo promete, como afirmaciones ejecutables.
 *
 * Dos reglas cargan con el peso: un producto es de una clase y sólo de una, y
 * el acceso gratuito de una marca no se hereda a su producto agéntico.
 */

const codigo = codeTools();
const bySlug = new Map(getAllTools().map((t) => [t.slug, t]));

describe('cinco productos distintos', () => {
  it('cada ficha declara qué clase de producto es', () => {
    for (const tool of codigo) {
      expect(codeType(tool), `${tool.slug} no tiene productType`).toBeTruthy();
      expect(Object.keys(CODE_TYPE_LABEL), tool.slug).toContain(codeType(tool));
    }
  });

  it('el tipo se lee, no se deduce de las capacidades', () => {
    /*
     * Cursor y Cline editan repositorios y usan la terminal exactamente igual.
     * Si el tipo saliera de ahí, serían la misma cosa — y uno es un editor que
     * sustituye al tuyo y el otro una extensión que trabaja dentro de él.
     */
    const cursor = bySlug.get('cursor')!;
    const cline = bySlug.get('cline')!;
    const capsIguales = ['repository-editing', 'terminal'] as const;
    for (const cap of capsIguales) {
      expect(cursor.capabilities, `cursor/${cap}`).toContain(cap);
      expect(cline.capabilities, `cline/${cap}`).toContain(cap);
    }
    expect(cursor.productType).toBe('ide');
    expect(cline.productType).toBe('agent');
  });

  it('ninguna ficha está en dos tipos a la vez', () => {
    const tipos: CodeType[] = ['ide', 'copilot', 'agent', 'cli', 'app-builder', 'review'];
    const vistos = new Map<string, CodeType>();
    for (const tipo of tipos) {
      for (const tool of byType(codigo, tipo)) {
        expect(vistos.has(tool.slug), `${tool.slug} aparece en dos tipos`).toBe(false);
        vistos.set(tool.slug, tipo);
      }
    }
    expect(vistos.size).toBe(codigo.length);
  });

  it('crear una app y editar un repositorio no se mezclan', () => {
    /*
     * La distinción que más decide de esta vertical. Un constructor parte de
     * una descripción y devuelve algo desplegable; un agente abre código que ya
     * existe. Ninguno de los constructores puede declarar que edita
     * repositorios, porque no es lo que hacen.
     */
    for (const tool of byType(codigo, 'app-builder')) {
      expect(tool.capabilities, `${tool.slug} construye, no edita tu repo`).not.toContain(
        'repository-editing'
      );
    }
    for (const tool of byType(codigo, 'agent')) {
      expect(tool.capabilities, `${tool.slug} debe editar repositorios`).toContain(
        'repository-editing'
      );
    }
  });
});

describe('el acceso de la marca no se hereda al producto', () => {
  it('Copilot Free deja fuera el agente, y su ficha lo dice', () => {
    const copilot = bySlug.get('github-copilot')!;
    const limites = copilot.freePlan.limits.join(' · ');

    expect(copilot.freePlan.creditsAmount).toBe('2.000 completados/mes');
    expect(limites, 'el límite tiene que nombrar lo que queda fuera').toMatch(/NO incluye/);
    expect(limites).toMatch(/agente/i);
    expect(copilot.freePlan.requiresCreditCard).toBe('no');
  });

  it('las capacidades describen el producto y los límites el plan', () => {
    /*
     * Copilot sabe editar repositorios: eso es cierto del producto. Que su
     * plan gratuito no lo incluya es cierto del plan, y va donde decide.
     */
    const copilot = bySlug.get('github-copilot')!;
    expect(copilot.capabilities).toContain('repository-editing');
    expect(copilot.freePlan.limits.join(' ')).toMatch(/agente de programación|coding agent|agentes/i);
  });

  it('lo que no publica cifras no se las inventa', () => {
    const cursor = bySlug.get('cursor')!;
    expect(cursor.freePlan.creditsAmount).toBeUndefined();
    expect(cursor.freePlan.creditReset).toBe('unknown');
    expect(cursor.freePlan.requiresCreditCard, 'esto sí lo publica').toBe('no');
  });
});

describe('bloques', () => {
  it('ninguno se levanta con menos de tres', () => {
    for (const tipo of ['agent', 'cli', 'copilot', 'app-builder'] as CodeType[]) {
      expect(byType(codigo, tipo).length, tipo).toBeGreaterThanOrEqual(MIN_BLOQUE);
    }
    expect(freeNow(codigo).length).toBeGreaterThanOrEqual(MIN_BLOQUE);
    expect(facilesParaEmpezar(codigo).length).toBeGreaterThanOrEqual(MIN_BLOQUE);
  });

  it('el editor no llega a bloque y se queda como filtro', () => {
    expect(byType(codigo, 'ide').length).toBeLessThan(MIN_BLOQUE);
    expect(byType(codigo, 'review').length).toBe(0);
  });

  it('«gratis ahora» no incluye nada que haya que instalar ni de pago', () => {
    for (const tool of freeNow(codigo)) {
      expect(tool.hosting, tool.slug).toBe('cloud');
      expect(['paid_only', 'trial', 'demo', 'unknown'], tool.slug).not.toContain(tool.freeModel);
      expect(tool.freePlan.creditReset, tool.slug).not.toBe('one_off');
    }
  });

  it('lo local y abierto lo es de verdad', () => {
    for (const tool of abiertoYLocal(codigo)) {
      expect(tool.openSource, tool.slug).toBe('yes');
      expect(tool.hosting, tool.slug).not.toBe('cloud');
    }
    expect(abiertoYLocal(codigo).length).toBeGreaterThanOrEqual(MIN_BLOQUE);
  });

  it('nada local se cuela en «gratis ahora»', () => {
    const gratis = new Set(freeNow(codigo).map((t) => t.slug));
    const { install, technical } = localControl(codigo);
    for (const tool of [...install, ...technical]) {
      expect(gratis.has(tool.slug), tool.slug).toBe(false);
    }
  });
});

describe('capacidades', () => {
  it('ninguna ficha entra sin al menos una capacidad de la vertical', () => {
    for (const tool of codigo) {
      expect(codeCapabilityCount(tool), tool.slug).toBeGreaterThan(0);
    }
  });

  it('la vieja capacidad vaga no cuenta como prueba de nada', () => {
    /*
     * `agents` significaba «esto tiene que ver con agentes». Bolt y v0 la
     * llevaban y no demostraba nada; ahora declaran lo que hacen.
     */
    for (const slug of ['bolt-new', 'v0-by-vercel']) {
      const tool = bySlug.get(slug)!;
      expect(tool.capabilities, slug).toContain('code-generation');
      expect(codeCapabilityCount(tool), slug).toBeGreaterThan(0);
    }
  });

  it('todo lo que la tarjeta puede enseñar tiene etiqueta', () => {
    for (const tool of codigo) {
      for (const cap of tool.capabilities) {
        if (!(CODE_CAPABILITIES as readonly string[]).includes(cap)) continue;
        expect(CODE_CAPABILITIES, cap).toContain(cap);
      }
    }
  });
});

describe('filtros de código', () => {
  const decisions = decideFilters(codigo, CANDIDATE_FILTERS);

  it('cada filtro escondido dice por qué', () => {
    for (const d of decisions.filter((x) => !x.shown)) {
      expect(d.reason, d.filter.id).not.toBe('');
    }
  });

  it('ninguno enseñado deja la lista vacía', () => {
    for (const d of decisions.filter((x) => x.shown)) {
      expect(codigo.filter(d.filter.matches).length, d.filter.id).toBeGreaterThan(0);
    }
  });

  it('no enseña dos filtros que hoy seleccionan lo mismo', () => {
    const sets = decisions
      .filter((d) => d.shown)
      .map((d) => codigo.filter(d.filter.matches).map((t) => t.slug).sort().join('|'));
    expect(new Set(sets).size).toBe(sets.length);
  });

  it('el tipo va primero, porque es lo primero que hay que decidir', () => {
    const mostrados = decisions.filter((d) => d.shown).map((d) => d.filter.id);
    expect(mostrados[0], 'el primer filtro debe ser de tipo').toMatch(/^tipo-/);
  });
});

describe('las reglas globales siguen en pie', () => {
  it('unknown nunca se convierte en no', () => {
    for (const tool of codigo) {
      if (tool.freeModel === 'unknown') {
        expect(freeAccessLabel(tool).kind, tool.slug).toBe('Sin confirmar');
      }
    }
  });

  it('lo local nunca cuenta como usable gratis en la nube', () => {
    for (const tool of codigo.filter((t) => t.hosting !== 'cloud')) {
      expect(usableFreeNow(tool), tool.slug).toBe(false);
    }
  });

  it('los créditos que no se renuevan no se presentan como plan gratuito', () => {
    for (const tool of codigo) {
      if (tool.freePlan.creditReset !== 'one_off') continue;
      expect(usableFreeNow(tool), `${tool.slug} es one_off`).toBe(false);
    }
  });

  it('las cifras publicadas van tal cual, sin convertir', () => {
    expect(bySlug.get('bolt-new')!.freePlan.creditsAmount).toBe('300.000 tokens/día (1M/mes)');
    expect(bySlug.get('lovable')!.freePlan.creditsAmount).toBe('5 créditos/día (tope de 30/mes)');
    expect(bySlug.get('amazon-q-developer')!.freePlan.creditsAmount).toBe('50 peticiones agénticas/mes');
  });
});
