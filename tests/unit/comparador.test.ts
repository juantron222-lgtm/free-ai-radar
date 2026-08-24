import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { getAllTools, getTool } from '@lib/data/catalog';
import { NO_APLICA, ROWS, SIN_ANALIZAR, filasDe } from '@lib/data/comparador';
import { COMPARACIONES, comparacionesVigentes, urlDe } from '@lib/data/comparaciones';
import { makeTool } from '../fixtures/tool';

const tools = getAllTools();

describe('una ausencia no se disfraza de respuesta', () => {
  it('sin contras escritas no es «no tiene contras»', () => {
    /*
     * El fallo con más alcance de toda la tabla: setenta de las noventa y
     * cuatro fichas no tienen contras escritas, y el guion las pintaba a todas
     * como herramientas sin una sola pega. Una comparación en la que el que
     * menos hemos mirado parece el mejor está mintiendo por omisión.
     */
    const sinContras = makeTool({ slug: 'a', name: 'A', cons: [] });
    const conContras = makeTool({ slug: 'b', name: 'B', cons: ['Marca de agua en el plan gratuito'] });

    const fila = filasDe([sinContras, conContras]).find((f) => f.row.label === 'En contra');
    expect(fila).toBeDefined();

    const celda = fila!.celdas[0]!;
    expect(celda.tipo).toBe('ausente');
    expect(celda.tipo === 'ausente' && celda.texto).toBe(SIN_ANALIZAR);
    expect(celda.tipo === 'ausente' && celda.nota).toMatch(/no las hemos escrito/);
  });

  it('ninguna celda de ninguna comparación declarada sale como un guion suelto', () => {
    for (const comparacion of comparacionesVigentes()) {
      const elegidas = comparacion.slugs.map((s) => getTool(s)!);
      for (const fila of filasDe(elegidas)) {
        for (const celda of fila.celdas) {
          const texto = celda.tipo === 'lista' ? celda.items.join(' ') : celda.texto;
          expect(texto.trim(), `${comparacion.id} · ${fila.row.label}`).not.toBe('');
          expect(texto.trim(), `${comparacion.id} · ${fila.row.label}`).not.toBe('—');
        }
      }
    }
  });

  it('las tres clases de ausencia se distinguen entre sí', () => {
    expect(SIN_ANALIZAR).not.toBe(NO_APLICA);
    // «Sin verificar» lo pone la propia etiqueta triestado, y no es ninguna de las dos.
    expect([SIN_ANALIZAR, NO_APLICA]).not.toContain('Sin verificar');
  });

  it('una ausencia nunca se marca como ventaja', () => {
    /*
     * `better` sólo se consulta sobre celdas de valor. Si una fila con
     * `better` pudiera devolver una ausencia con el texto que ella considera
     * bueno, el hueco se subrayaría en verde.
     */
    for (const row of ROWS) {
      if (!row.better) continue;
      for (const tool of tools) {
        const celda = row.values(tool);
        if (celda.tipo !== 'ausente') continue;
        expect(row.better(celda.texto), `${row.label} · ${tool.slug}`).toBe(false);
      }
    }
  });
});

describe('el orden de las filas empieza por lo que separa', () => {
  it('lo que discrimina va antes que lo contextual', () => {
    const etiquetas = ROWS.map((r) => r.label);
    const posicion = (label: string) => etiquetas.indexOf(label);

    expect(posicion('Qué clase de producto es')).toBe(0);
    expect(posicion('Qué sabe hacer')).toBeLessThan(posicion('Qué te dan gratis'));
    expect(posicion('Qué te dan gratis')).toBeLessThan(posicion('Límites'));
    expect(posicion('Límites')).toBeLessThan(posicion('¿Pide tarjeta?'));
    expect(posicion('¿Pide tarjeta?')).toBeLessThan(posicion('¿Marca de agua?'));
    expect(posicion('¿Marca de agua?')).toBeLessThan(posicion('¿Uso comercial?'));
    expect(posicion('¿Uso comercial?')).toBeLessThan(posicion('Dónde se ejecuta'));
    expect(posicion('Dónde se ejecuta')).toBeLessThan(posicion('Cuánto cuesta empezar'));

    // Y lo que casi nunca separa, al final.
    expect(posicion('Categoría')).toBeGreaterThan(posicion('¿Pide tarjeta?'));
    expect(posicion('Modelo de gratuidad')).toBeGreaterThan(posicion('Límites'));
  });

  it('la clase de producto se usa de verdad', () => {
    const codigo = tools.filter((t) => t.categorySlug === 'codigo');
    expect(codigo.length).toBeGreaterThan(0);

    const fila = ROWS.find((r) => r.label === 'Qué clase de producto es')!;
    for (const tool of codigo) {
      const celda = fila.values(tool);
      expect(celda.tipo, tool.slug).toBe('valor');
    }
  });
});

describe('«sólo diferencias» quita exactamente lo que no separa', () => {
  it('una fila idéntica en todas las columnas queda marcada como igual', () => {
    const a = makeTool({ slug: 'a', name: 'A', hosting: 'cloud' });
    const b = makeTool({ slug: 'b', name: 'B', hosting: 'cloud' });
    const fila = filasDe([a, b]).find((f) => f.row.label === 'Dónde se ejecuta')!;
    expect(fila.iguales).toBe(true);
  });

  it('una fila que difiere no se marca como igual', () => {
    const a = makeTool({ slug: 'a', name: 'A', hosting: 'cloud' });
    const b = makeTool({ slug: 'b', name: 'B', hosting: 'local' });
    const fila = filasDe([a, b]).find((f) => f.row.label === 'Dónde se ejecuta')!;
    expect(fila.iguales).toBe(false);
  });

  it('comparar una herramienta consigo misma no deja ni una diferencia', () => {
    const tool = getTool('lovable')!;
    const filas = filasDe([tool, tool]);
    expect(filas.filter((f) => !f.iguales)).toEqual([]);
  });

  it('toda comparación declarada tiene algo que enseñar con el filtro puesto', () => {
    /*
     * Si una comparación útil no difiere en ninguna fila, es que no era útil:
     * son la misma herramienta contada dos veces.
     */
    for (const comparacion of comparacionesVigentes()) {
      const filas = filasDe(comparacion.slugs.map((s) => getTool(s)!));
      const distintas = filas.filter((f) => !f.iguales);
      expect(distintas.length, comparacion.id).toBeGreaterThan(0);
    }
  });

  it('una fila que no aplica a ninguna de las elegidas desaparece', () => {
    const a = makeTool({ slug: 'a', name: 'A', kind: 'app' });
    const b = makeTool({ slug: 'b', name: 'B', kind: 'app' });
    const filas = filasDe([a, b]);
    expect(filas.map((f) => f.row.label)).not.toContain('Qué clase de producto es');
  });
});

describe('las comparaciones útiles son editoriales, no calculadas', () => {
  it('hay entre seis y diez, y todas apuntan a fichas reales', () => {
    expect(COMPARACIONES.length).toBeGreaterThanOrEqual(6);
    expect(COMPARACIONES.length).toBeLessThanOrEqual(10);
    expect(comparacionesVigentes().length).toBe(COMPARACIONES.length);
  });

  it('cada una dice para qué sirve', () => {
    for (const comparacion of COMPARACIONES) {
      expect(comparacion.motivo.length, comparacion.id).toBeGreaterThan(40);
    }
  });

  it('ninguna compara menos de dos ni más de cuatro', () => {
    for (const comparacion of COMPARACIONES) {
      expect(comparacion.slugs.length, comparacion.id).toBeGreaterThanOrEqual(2);
      expect(comparacion.slugs.length, comparacion.id).toBeLessThanOrEqual(4);
    }
  });

  it('si una incluye algo de pago, su motivo lo advierte', () => {
    /*
     * «Vídeo desde el navegador» llevaba a Luma Dream Machine, que es
     * `paid_only`, bajo un titular sobre planes gratuitos: una columna que no
     * cumple lo que promete la cabecera.
     *
     * Comparar de pago con gratis es legítimo —a veces es justo la pregunta—;
     * lo que no vale es no decirlo. Así que la regla no es «prohibido incluir
     * algo de pago», es «si lo incluyes, dilo en el motivo».
     */
    const loAdvierte = /no son todos|no todas|de pago|sólo de pago|no lo es/i;
    for (const comparacion of comparacionesVigentes()) {
      const dePago = comparacion.slugs.filter((s) => getTool(s)!.freeModel === 'paid_only');
      if (dePago.length === 0) continue;
      expect(
        loAdvierte.test(comparacion.motivo),
        `«${comparacion.titulo}» incluye ${dePago.join(', ')}, que es de pago, y su motivo no lo advierte`
      ).toBe(true);
    }
  });

  it('su enlace es el mismo que se puede compartir', () => {
    const primera = COMPARACIONES[0]!;
    expect(urlDe(primera)).toBe(`/comparar?t=${primera.slugs.join(',')}`);
  });
});

describe('el comparador no reintroduce la nota por la puerta de atrás', () => {
  it('ni el módulo ni la página mencionan puntuación ni ganadores', () => {
    for (const ruta of ['src/lib/data/comparador.ts', 'src/lib/data/comparaciones.ts', 'src/pages/comparar.astro']) {
      const fuente = readFileSync(ruta, 'utf8')
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      expect(fuente, ruta).not.toMatch(/scoreTotal|\bscores\b/);
      /*
       * Lo que se busca es una sentencia, no la palabra. La página dice «sin
       * ganadores prefabricados», que es exactamente lo contrario.
       */
      expect(fuente, ruta).not.toMatch(/la mejor es|el mejor es|el ganador|gana la comparaci/i);
    }
  });

  it('ninguna fila es una puntuación', () => {
    for (const row of ROWS) {
      expect(row.label.toLowerCase(), row.label).not.toMatch(/puntuaci|nota|ranking|score/);
    }
  });
});
