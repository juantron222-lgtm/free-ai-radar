import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { getAllTools, getPopulatedCategories } from '@lib/data/catalog';
import { buildSearchDocs, searchWithIntents } from '@lib/search/index';
import { buildClientIndex } from '@lib/search/client-index';
import { INTENCIONES, detectarIntenciones, fuerza, palabrasClave } from '@lib/search/intents';
import { CAPABILITIES, CAPABILITY_LABEL } from '@lib/domain/taxonomy';

/**
 * El buscador contesta tareas, o no contesta.
 *
 * Estas pruebas no dicen qué herramienta debe ganar: dicen qué debe cumplir
 * todo lo que salga. «Lovable debe ser la primera» se rompería el día que
 * entre otro constructor de aplicaciones igual de bueno, y romperse por eso
 * no prueba nada. «Todos los resultados de "crear una app" deben ser
 * constructores de aplicaciones» sólo se rompe si el buscador se equivoca.
 */

const categorias = new Map(getPopulatedCategories().map((c) => [c.slug, c.name]));
const tools = getAllTools();
const docs = buildSearchDocs(tools, (slug) => categorias.get(slug) ?? slug);
const porSlug = new Map(tools.map((t) => [t.slug, t]));

const buscar = (q: string) => searchWithIntents(docs, q, { limit: 500 }).hits;
const herramientas = (q: string) => buscar(q).map((h) => porSlug.get(h.slug)!);

describe('la búsqueda entiende tareas', () => {
  it('«crear una app» sólo devuelve constructores de aplicaciones', () => {
    const resultado = herramientas('crear una app');
    expect(resultado.length).toBeGreaterThan(0);
    for (const tool of resultado) {
      expect(tool.productType, tool.name).toBe('app-builder');
    }
  });

  it('«crear una app» no devuelve nada de audio ni de imagen', () => {
    /*
     * Ésta era la consulta que delataba el buscador viejo: devolvía Suno AI y
     * Midjourney, dos respuestas que sólo se parecían a la pregunta en las
     * letras.
     */
    const verticales = herramientas('crear una app').map((t) => t.categorySlug);
    expect(verticales).not.toContain('musica');
    expect(verticales).not.toContain('voz');
    expect(verticales).not.toContain('imagen');
  });

  it('todo lo que sale por «quitar fondo» sabe quitar el fondo', () => {
    const resultado = herramientas('quitar fondo');
    expect(resultado.length).toBeGreaterThan(0);
    for (const tool of resultado) {
      expect(tool.capabilities, tool.name).toContain('background-removal');
    }
  });

  it('«subtítulos» y «transcribir» son la misma pregunta', () => {
    const subtitulos = herramientas('subtitulos').map((t) => t.slug).sort();
    const transcribir = herramientas('transcribir').map((t) => t.slug).sort();
    expect(subtitulos.length).toBeGreaterThan(0);
    expect(subtitulos).toEqual(transcribir);
  });

  it('todo lo que sale por «transcribir» transcribe', () => {
    for (const tool of herramientas('transcribir')) {
      expect(tool.capabilities, tool.name).toContain('transcription');
    }
  });

  it('«crear vídeo» no devuelve herramientas de música', () => {
    for (const tool of herramientas('crear video')) {
      expect(tool.categorySlug, tool.name).not.toBe('musica');
    }
  });
});

describe('los hechos estructurados mandan sobre el texto', () => {
  it('«gratis sin tarjeta» exige un no explícito, nunca un «sin verificar»', () => {
    /*
     * La regla de toda la casa: lo que no se ha podido demostrar es
     * `unverified`, y `unverified` no cumple un filtro positivo. Quien busca
     * «sin tarjeta» pregunta justo por lo que no queremos suponer.
     */
    const resultado = herramientas('gratis sin tarjeta');
    expect(resultado.length).toBeGreaterThan(0);
    for (const tool of resultado) {
      expect(tool.freePlan.requiresCreditCard, tool.name).toBe('no');
    }
  });

  it('«modelo local» no devuelve nada que sólo viva en la nube', () => {
    const resultado = herramientas('modelo local');
    expect(resultado.length).toBeGreaterThan(0);
    for (const tool of resultado) {
      expect(tool.hosting, tool.name).not.toBe('cloud');
    }
  });

  it('dos intenciones en una consulta se cumplen las dos', () => {
    const resultado = herramientas('clonar voz sin tarjeta');
    expect(resultado.length).toBeGreaterThan(0);
    for (const tool of resultado) {
      expect(tool.freePlan.requiresCreditCard, tool.name).toBe('no');
      const hablaOClona =
        tool.capabilities.includes('text-to-speech') || tool.capabilities.includes('voice-clone');
      expect(hablaOClona, tool.name).toBe(true);
    }
  });
});

describe('cuando no hay respuesta, no se inventa', () => {
  it('una tarea que el catálogo no cubre devuelve cero', () => {
    expect(buscar('traducir a swahili')).toEqual([]);
  });

  it('una consulta sin sentido devuelve cero', () => {
    expect(buscar('zzzz')).toEqual([]);
  });

  it('escribir el nombre exacto siempre funciona, aunque suene a filtro', () => {
    /*
     * «Local Deep Researcher» lleva la palabra «local», que es una intención.
     * Quien la escribe entera busca una ficha, no un filtro por dónde se
     * ejecuta: el nombre tiene que abrirse paso.
     */
    const primero = buscar('Local Deep Researcher')[0];
    expect(primero?.slug).toBe('local-deep-researcher');
  });

  it('el nombre exacto gana a la intención que contiene', () => {
    /*
     * La regresión concreta: que la consulta no se convierta en «herramientas
     * que se ejecutan en tu equipo». Se comprueba de tres maneras, porque el
     * fallo puede aparecer por cualquiera de ellas.
     */
    const consulta = 'Local Deep Researcher';
    const hits = buscar(consulta);
    const ficha = porSlug.get('local-deep-researcher')!;

    // 1. Es la primera, y no por poco: le saca distancia a la segunda.
    expect(hits[0]?.slug).toBe('local-deep-researcher');
    if (hits.length > 1) expect(hits[0]!.score).toBeGreaterThan(hits[1]!.score);

    // 2. No ha degenerado en el filtro «en local»: eso devuelve decenas.
    const enLocal = tools.filter((t) => t.hosting !== 'cloud');
    expect(enLocal.length).toBeGreaterThan(10);
    expect(hits.length).toBeLessThan(enLocal.length / 2);

    // 3. La coincidencia se atribuye al nombre, no a una tarea.
    expect(hits[0]?.matchedOn).toBe('name');
    expect(hits[0]?.intent).toBeUndefined();
    expect(ficha.name).toBe('Local Deep Researcher');
  });

  it('vale para cualquier ficha cuyo nombre lleve una palabra de intención', () => {
    /*
     * No es un apaño para una ficha: es una propiedad. Toda herramienta cuyo
     * nombre completo se escriba entero tiene que salir la primera, aunque su
     * nombre contenga «vídeo», «código», «agente» o «local».
     */
    const conPalabraDeIntencion = tools.filter((t) =>
      detectarIntenciones(t.name).length > 0
    );
    expect(conPalabraDeIntencion.length).toBeGreaterThan(3);

    for (const tool of conPalabraDeIntencion) {
      const primero = buscar(tool.name)[0];
      expect(primero?.slug, `«${tool.name}» no se encuentra a sí misma`).toBe(tool.slug);
    }
  });
});

describe('el diccionario de intenciones no inventa nada', () => {
  it('toda capacidad citada existe en la taxonomía', () => {
    const validas = new Set<string>(CAPABILITIES);
    for (const intencion of INTENCIONES) {
      for (const capacidad of intencion.capacidades ?? []) {
        expect(validas.has(capacidad), `${intencion.etiqueta}: ${capacidad}`).toBe(true);
      }
    }
  });

  it('toda intención tiene alguna herramienta que la cumpla', () => {
    /*
     * Una intención sin respuesta posible es una promesa vacía: la reconoce,
     * filtra el catálogo entero y deja la página en blanco. Mejor no
     * declararla.
     */
    for (const intencion of INTENCIONES) {
      const cuantas = docs.filter((d) => fuerza(d.hechos, intencion) > 0).length;
      expect(cuantas, intencion.etiqueta).toBeGreaterThan(0);
    }
  });

  it('las frases se reconocen enteras, no por trozos de palabra', () => {
    // «api» no debe dispararse dentro de «rapidapi».
    expect(detectarIntenciones('rapidapi')).toEqual([]);
    expect(detectarIntenciones('api').length).toBeGreaterThan(0);
  });

  it('gana la frase más específica', () => {
    const [primera] = detectarIntenciones('modelo local');
    expect(primera?.etiqueta).toBe('Ejecutarlo en tu equipo');
  });

  it('el andamiaje del castellano no cambia la pregunta', () => {
    expect(palabrasClave('quiero crear una app con IA')).toEqual(['crear', 'app']);
  });
});

describe('nada de esto depende de la vieja nota', () => {
  it('ningún fichero de búsqueda menciona scoreTotal', () => {
    for (const ruta of [
      'src/lib/search/index.ts',
      'src/lib/search/intents.ts',
      'src/lib/search/client-index.ts',
      'src/lib/search/filters.ts',
    ]) {
      const fuente = readFileSync(ruta, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(fuente, ruta).not.toMatch(/scoreTotal|\bscores\b/);
    }
  });

  it('el índice que viaja al navegador no lleva puntuación', () => {
    const entrada = buildClientIndex(tools.slice(0, 3), (s) => s)[0]!;
    const json = JSON.stringify(entrada);
    expect(json).not.toMatch(/score/i);
    expect(json).not.toMatch(/"puntuacion"/i);
  });
});

describe('el autocompletado enseña texto, no tokens', () => {
  it('el campo de intención se indexa con etiquetas escritas', () => {
    /*
     * El token es `background-removal`; lo que se lee es «Quitar fondo». Si el
     * índice llevase el token, la sugerencia enseñaría guiones e inglés.
     */
    for (const doc of docs) {
      expect(doc.fields.intent, doc.slug).not.toMatch(/-/);
    }
  });

  it('toda capacidad tiene una etiqueta pública distinta de su token', () => {
    for (const capacidad of CAPABILITIES) {
      const etiqueta = CAPABILITY_LABEL[capacidad];
      expect(etiqueta, capacidad).toBeTruthy();
      expect(etiqueta, capacidad).not.toBe(capacidad);
    }
  });

  it('la vertical de una sugerencia va con sus acentos', () => {
    const entradas = buildClientIndex(tools, (slug) => categorias.get(slug) ?? slug);
    const musica = entradas.find((e) => e.slug === 'suno-ai');
    expect(musica?.vert).toBe('Música IA');
    // Y el campo de índice sigue siendo el normalizado, que es otra cosa.
    expect(musica?.f[4]).toBe('musica ia');
  });
});
