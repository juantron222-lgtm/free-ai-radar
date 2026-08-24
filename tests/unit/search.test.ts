import { describe, expect, it } from 'vitest';
import { buildSearchDocs, editDistance, normalize, search, tokenize } from '@lib/search/index';
import { makeTool } from '../fixtures/tool';

const tools = [
  makeTool({
    slug: 'stable-diffusion-webui',
    name: 'Stable Diffusion WebUI',
    tagline: 'Interfaz web para generar imágenes en local.',
    categorySlug: 'imagen',
    useCases: ['Generación de imágenes ilimitada', 'Inpainting'],
    tags: ['Bueno para RTX 4060'],
  }),
  makeTool({
    slug: 'elevenlabs',
    name: 'ElevenLabs',
    tagline: 'Síntesis de voz muy realista.',
    categorySlug: 'voz',
    useCases: ['Locución para vídeo', 'Doblaje'],
  }),
  makeTool({
    slug: 'ollama',
    name: 'Ollama',
    tagline: 'Ejecuta modelos de lenguaje en tu ordenador.',
    categorySlug: 'modelos-open-source',
    useCases: ['Chat privado sin conexión'],
  }),
];

const docs = buildSearchDocs(tools, (slug) => ({ imagen: 'Imagen IA', voz: 'Voz IA' })[slug] ?? slug);

describe('normalize', () => {
  it('quita acentos y baja a minúsculas', () => {
    expect(normalize('Síntesis DE Vídeo')).toBe('sintesis de video');
  });

  it('colapsa la puntuación y los espacios', () => {
    expect(normalize('  Bolt.new  —  ¡genial!  ')).toBe('bolt new genial');
  });
});

describe('tokenize', () => {
  it('descarta palabras vacías y letras sueltas', () => {
    expect(tokenize('la generación de imágenes con IA')).toEqual(['generacion', 'imagenes']);
  });
});

describe('editDistance', () => {
  it('devuelve 0 para cadenas iguales', () => {
    expect(editDistance('ollama', 'ollama')).toBe(0);
  });

  it('cuenta una sustitución', () => {
    expect(editDistance('ollama', 'ollema')).toBe(1);
  });

  it('corta pronto cuando se supera el presupuesto', () => {
    expect(editDistance('ollama', 'stablediffusion', 2)).toBe(3);
  });
});

describe('search', () => {
  it('encuentra por nombre exacto', () => {
    const hits = search(docs, 'ollama');
    expect(hits[0]?.slug).toBe('ollama');
  });

  it('tolera una errata en palabras largas', () => {
    const hits = search(docs, 'elevenlbs');
    expect(hits[0]?.slug).toBe('elevenlabs');
  });

  it('no inventa resultados para palabras cortas mal escritas', () => {
    expect(search(docs, 'xyz')).toHaveLength(0);
  });

  it('encuentra por caso de uso, no sólo por nombre', () => {
    const hits = search(docs, 'inpainting');
    expect(hits[0]?.slug).toBe('stable-diffusion-webui');
    expect(hits[0]?.matchedOn).toBe('text');
  });

  it('encuentra por categoría', () => {
    const hits = search(docs, 'voz');
    expect(hits.map((hit) => hit.slug)).toContain('elevenlabs');
  });

  it('ignora los acentos en la consulta', () => {
    const hits = search(docs, 'sintesis');
    expect(hits.map((hit) => hit.slug)).toContain('elevenlabs');
  });

  it('exige que la mayoría de términos aporte algo', () => {
    // "ollama" coincide, "submarino" no: no basta con un término de dos.
    expect(search(docs, 'ollama submarino xilofono')).toHaveLength(0);
  });

  it('devuelve vacío para una consulta vacía', () => {
    expect(search(docs, '   ')).toHaveLength(0);
  });

  it('respeta el límite de resultados', () => {
    expect(search(docs, 'ia', { limit: 1, minScore: 0 }).length).toBeLessThanOrEqual(1);
  });

  it('la relevancia manda sobre la puntuación editorial', () => {
    const lowScoring = makeTool({
      slug: 'nicho',
      name: 'Nicho Exacto',
      tagline: 'Algo muy concreto.',
      scores: { freeReal: 1, usefulness: 1, ease: 1, transparency: 1, creatorValue: 1 },
    });
    const withLow = buildSearchDocs([...tools, lowScoring], (slug) => slug);
    const hits = search(withLow, 'nicho exacto');
    expect(hits[0]?.slug).toBe('nicho');
  });
});
