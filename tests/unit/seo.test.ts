import { describe, expect, it } from 'vitest';
import { absoluteUrl, canonicalFor, metaDescription, pageTitle, SITE_URL } from '@lib/seo/site';
import {
  breadcrumbSchema,
  graph,
  itemListSchema,
  organizationSchema,
  softwareApplicationSchema,
  websiteSchema,
  faqSchema,
} from '@lib/seo/structured-data';
import { slugify } from '@lib/domain/primitives';
import { resolveCategory, resolveFreeModel, getFreeModel } from '@lib/domain/taxonomy';
import { makeTool } from '../fixtures/tool';

describe('URL canónica', () => {
  it('apunta al dominio real, no al de preview', () => {
    expect(SITE_URL).toBe('https://www.freeairadar.com');
    expect(SITE_URL).not.toContain('vercel.app');
  });

  it('descarta la query por defecto para no duplicar el listado', () => {
    const url = new URL('https://www.freeairadar.com/herramientas?nocard=1&cat=imagen');
    expect(canonicalFor(url)).toBe('https://www.freeairadar.com/herramientas');
  });

  it('conserva sólo los parámetros declarados', () => {
    const url = new URL('https://www.freeairadar.com/comparar?t=a,b&otro=1');
    expect(canonicalFor(url, ['t'])).toBe('https://www.freeairadar.com/comparar?t=a%2Cb');
  });

  it('elimina la barra final salvo en la raíz', () => {
    expect(canonicalFor(new URL('https://www.freeairadar.com/herramientas/'))).toBe(
      'https://www.freeairadar.com/herramientas'
    );
    expect(canonicalFor(new URL('https://www.freeairadar.com/'))).toBe(
      'https://www.freeairadar.com/'
    );
  });

  it('absoluteUrl no altera una URL ya absoluta', () => {
    expect(absoluteUrl('https://otro.example/x')).toBe('https://otro.example/x');
    expect(absoluteUrl('/og.jpg')).toBe('https://www.freeairadar.com/og.jpg');
    expect(absoluteUrl('og.jpg')).toBe('https://www.freeairadar.com/og.jpg');
  });
});

describe('metadatos', () => {
  it('añade el nombre del sitio una sola vez', () => {
    expect(pageTitle('Ollama')).toBe('Ollama | Free AI Radar');
    expect(pageTitle('Free AI Radar — IA gratis')).toBe('Free AI Radar — IA gratis');
  });

  it('recorta la descripción por palabra', () => {
    const long = 'palabra '.repeat(60);
    const result = metaDescription(long);
    expect(result.length).toBeLessThanOrEqual(158);
    expect(result.endsWith('…')).toBe(true);
  });

  it('deja intacta una descripción corta', () => {
    expect(metaDescription('Corta y clara.')).toBe('Corta y clara.');
  });
});

describe('datos estructurados', () => {
  it('el grafo es JSON válido con contexto schema.org', () => {
    const parsed = JSON.parse(graph(organizationSchema(), websiteSchema()));
    expect(parsed['@context']).toBe('https://schema.org');
    expect(parsed['@graph']).toHaveLength(2);
  });

  it('WebSite declara SearchAction apuntando al buscador real', () => {
    const schema = websiteSchema() as Record<string, Record<string, Record<string, string>>>;
    expect(schema['potentialAction']?.['target']?.['urlTemplate']).toContain('/herramientas?q=');
  });

  it('las migas numeran desde 1 y usan URLs absolutas', () => {
    const schema = breadcrumbSchema([
      { name: 'Inicio', path: '/' },
      { name: 'Herramientas', path: '/herramientas' },
    ]) as { itemListElement: Array<{ position: number; item: string }> };

    expect(schema.itemListElement[0]?.position).toBe(1);
    expect(schema.itemListElement[1]?.item).toBe('https://www.freeairadar.com/herramientas');
  });

  it('SoftwareApplication NO emite aggregateRating ni review', () => {
    const schema = softwareApplicationSchema(makeTool());
    // Publicar nuestra puntuación editorial como estrellas sería tergiversarla.
    expect(schema).not.toHaveProperty('aggregateRating');
    expect(schema).not.toHaveProperty('review');
    expect(schema).not.toHaveProperty('ratingValue');
  });

  it('SoftwareApplication declara oferta gratuita sólo si existe capa gratuita', () => {
    expect(softwareApplicationSchema(makeTool())).toHaveProperty('offers');
    expect(softwareApplicationSchema(makeTool({ freeModel: 'paid_only' }))).not.toHaveProperty(
      'offers'
    );
  });

  it('ItemList refleja el número real de elementos', () => {
    const tools = [makeTool({ slug: 'a' }), makeTool({ slug: 'b' })];
    const schema = itemListSchema(tools, 'Lista') as { numberOfItems: number };
    expect(schema.numberOfItems).toBe(2);
  });

  it('FAQPage estructura pregunta y respuesta', () => {
    const schema = faqSchema([{ question: '¿Es gratis?', answer: 'Sí.' }]) as {
      mainEntity: Array<{ name: string; acceptedAnswer: { text: string } }>;
    };
    expect(schema.mainEntity[0]?.name).toBe('¿Es gratis?');
    expect(schema.mainEntity[0]?.acceptedAnswer.text).toBe('Sí.');
  });
});

describe('slugify', () => {
  it('elimina acentos y normaliza', () => {
    expect(slugify('Generación de Vídeo IA')).toBe('generacion-de-video-ia');
  });

  it('colapsa "Cámara" y "Camara" en el mismo slug', () => {
    expect(slugify('Cámara IA')).toBe(slugify('Camara IA'));
  });

  it('no deja guiones sueltos en los extremos', () => {
    expect(slugify('  ¡Hola!  ')).toBe('hola');
  });

  it('recorta a 80 caracteres', () => {
    expect(slugify('a'.repeat(200)).length).toBeLessThanOrEqual(80);
  });
});

describe('taxonomía', () => {
  it('resuelve nombres heredados a la categoría canónica', () => {
    expect(resolveCategory('Vídeo IA')?.slug).toBe('video');
    expect(resolveCategory('Video IA')?.slug).toBe('video');
    expect(resolveCategory('APIs gratuitas')?.slug).toBe('apis');
  });

  it('devuelve undefined para una categoría desconocida', () => {
    expect(resolveCategory('Categoría Inventada')).toBeUndefined();
  });

  it('resuelve los modelos de gratuidad heredados', () => {
    expect(resolveFreeModel('Gratis real')).toBe('free_real');
    expect(resolveFreeModel('Demo limitada')).toBe('demo');
  });

  it('cada modelo tiene una explicación accionable', () => {
    for (const id of ['free_real', 'freemium', 'credits', 'trial', 'demo'] as const) {
      expect(getFreeModel(id).meaning.length).toBeGreaterThan(20);
    }
  });
});
