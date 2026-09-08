import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseFeed,
  parseIndexLinks,
  extractArticleMeta,
  fetchSource,
  judgeHealth,
} from '../../scripts/source-adapters.mjs';

/**
 * The HTML adapter, against saved copies of the real pages.
 *
 * Fixtures rather than the network, for the usual reason and one specific one:
 * these tests exist to catch a vendor redesign, and a test that fetches the
 * live page cannot tell a redesign from a flaky connection. When one of these
 * goes red it is because the selector no longer matches the markup we recorded
 * — which is exactly the event `degraded` is meant to surface in production.
 */

const fixture = (name: string) =>
  readFileSync(join(process.cwd(), 'tests/fixtures/sources', name), 'utf8');

const BFL = {
  id: 's-bfl',
  source_type: 'html',
  index_url: 'https://bfl.ai/blog',
  item_link_pattern: '^/blog/[a-z0-9-]+$',
  exclude_patterns: ['^/blog/?$'],
};

const ELEVENLABS = {
  id: 's-11l',
  source_type: 'html',
  index_url: 'https://elevenlabs.io/blog',
  item_link_pattern: '^/blog/[a-z0-9-]+$',
  exclude_patterns: ['^/blog/category/', '^/blog/tag/', '^/blog/?$'],
};

const HEYGEN = {
  id: 's-hg',
  source_type: 'html',
  index_url: 'https://www.heygen.com/blog',
  item_link_pattern: '^/blog/[a-z0-9-]+$',
  exclude_patterns: ['^/blog/category/', '^/blog/?$'],
};

describe('el índice HTML produce artículos', () => {
  it('Black Forest Labs — imagen', () => {
    const links = parseIndexLinks(fixture('bfl-index.html'), BFL);
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link).toMatch(/^https:\/\/bfl\.ai\/blog\/[a-z0-9-]+$/);
  });

  it('ElevenLabs — audio', () => {
    const links = parseIndexLinks(fixture('elevenlabs-index.html'), ELEVENLABS);
    expect(links.length).toBeGreaterThan(0);
    // Las categorías son índices, no artículos: si se cuelan, el inbox se llena
    // de páginas que nunca son una noticia.
    for (const link of links) expect(link).not.toMatch(/\/blog\/(category|tag)\//);
  });

  it('HeyGen — vídeo', () => {
    const links = parseIndexLinks(fixture('heygen-index.html'), HEYGEN);
    expect(links.length).toBeGreaterThan(0);
  });
});

describe('lo que el índice no debe devolver', () => {
  it('no devuelve el propio índice', () => {
    for (const link of parseIndexLinks(fixture('bfl-index.html'), BFL)) {
      expect(link).not.toBe('https://bfl.ai/blog');
    }
  });

  it('no sale del dominio de la fuente', () => {
    const hostil =
      '<a href="https://malicioso.example/blog/robar">x</a><a href="/blog/real">y</a>';
    const links = parseIndexLinks(hostil, BFL);
    expect(links).toEqual(['https://bfl.ai/blog/real']);
  });

  it('no duplica un artículo enlazado dos veces', () => {
    const doble =
      '<a href="/blog/uno">a</a><a href="https://bfl.ai/blog/uno">b</a><a href="/blog/uno#seccion">c</a>';
    expect(parseIndexLinks(doble, BFL)).toEqual(['https://bfl.ai/blog/uno']);
  });

  it('respeta los exclude_patterns', () => {
    const conRecursos =
      '<a href="/blog/_astro/Header.css">x</a><a href="/blog/articulo-real">y</a>';
    const krea = { ...BFL, index_url: 'https://www.krea.ai/blog', exclude_patterns: ['/_astro/'] };
    expect(parseIndexLinks(conRecursos, krea)).toEqual(['https://www.krea.ai/blog/articulo-real']);
  });
});

describe('el artículo se describe a sí mismo', () => {
  it('saca título, canonical y fecha de su propia cabecera', () => {
    const meta = extractArticleMeta(fixture('bfl-article.html'), 'https://bfl.ai/blog/flux-3-video');
    expect(meta.title.length).toBeGreaterThan(3);
    expect(meta.url).toMatch(/^https:\/\/bfl\.ai\//);
  });

  it('prefiere og:title al <title>, que suele traer el nombre del sitio pegado', () => {
    const html =
      '<title>Un titular | Acme Blog</title><meta property="og:title" content="Un titular">';
    expect(extractArticleMeta(html, 'https://acme.test/x').title).toBe('Un titular');
  });

  it('acepta la fecha de JSON-LD cuando no hay meta', () => {
    const html = '<title>x</title><script type="application/ld+json">{"datePublished":"2026-03-04T10:00:00Z"}</script>';
    expect(extractArticleMeta(html, 'https://acme.test/x').publishedAt).toBe('2026-03-04');
  });

  it('una fecha ilegible es null, nunca hoy', () => {
    const html = '<title>x</title><meta property="article:published_time" content="pronto">';
    expect(extractArticleMeta(html, 'https://acme.test/x').publishedAt).toBeNull();
  });
});

describe('RSS sigue funcionando igual', () => {
  it('lee item y entry, y saca la fecha de donde esté', () => {
    const rss = `<rss><channel>
      <item><title>Uno</title><link>https://a.test/1</link><pubDate>Tue, 04 Mar 2026 10:00:00 GMT</pubDate></item>
    </channel></rss>`;
    expect(parseFeed(rss)).toEqual([
      { title: 'Uno', url: 'https://a.test/1', publishedAt: '2026-03-04' },
    ]);

    const atom = `<feed><entry><title>Dos</title><link href="https://a.test/2"/><updated>2026-03-05T00:00:00Z</updated></entry></feed>`;
    expect(parseFeed(atom)[0]).toMatchObject({ title: 'Dos', publishedAt: '2026-03-05' });
  });
});

describe('el adaptador entero, sin red', () => {
  it('lee el índice y luego cada artículo', async () => {
    const paginas: Record<string, string> = {
      'https://bfl.ai/blog': '<a href="/blog/uno">a</a><a href="/blog/dos">b</a>',
      'https://bfl.ai/blog/uno':
        '<meta property="og:title" content="Primero"><meta property="article:published_time" content="2026-03-01">',
      'https://bfl.ai/blog/dos':
        '<meta property="og:title" content="Segundo"><meta property="article:published_time" content="2026-03-02">',
    };

    const items = await fetchSource(
      { ...BFL, max_items: 5 },
      { fetchPage: async (url: string) => paginas[url] ?? '' }
    );

    expect(items).toEqual([
      { title: 'Primero', url: 'https://bfl.ai/blog/uno', publishedAt: '2026-03-01' },
      { title: 'Segundo', url: 'https://bfl.ai/blog/dos', publishedAt: '2026-03-02' },
    ]);
  });

  it('un artículo caído no tumba la fuente entera', async () => {
    const items = await fetchSource(
      { ...BFL, max_items: 5 },
      {
        fetchPage: async (url: string) => {
          if (url.endsWith('/blog')) return '<a href="/blog/uno">a</a><a href="/blog/roto">b</a>';
          if (url.endsWith('/roto')) throw new Error('HTTP 404');
          return '<meta property="og:title" content="Primero">';
        },
      }
    );

    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe('Primero');
  });

  it('respeta max_items', async () => {
    const muchos = Array.from({ length: 20 }, (_, i) => `<a href="/blog/a${i}">x</a>`).join('');
    const items = await fetchSource(
      { ...BFL, max_items: 3 },
      {
        fetchPage: async (url: string) =>
          url.endsWith('/blog') ? muchos : '<meta property="og:title" content="t">',
      }
    );
    expect(items).toHaveLength(3);
  });
});

describe('salud de la fuente', () => {
  /*
   * The distinction this whole mechanism exists for. Before it, a vendor
   * redesigning their index page and a vendor having a quiet week produced the
   * same output — nothing — and nobody could tell which had happened.
   */
  it('devuelve elementos → healthy', () => {
    expect(judgeHealth({ reachable: true, items: 8, previousItems: 8 })).toBe('healthy');
  });

  it('devolvía elementos y ahora ninguno → degraded, no healthy', () => {
    expect(judgeHealth({ reachable: true, items: 0, previousItems: 8 })).toBe('degraded');
  });

  it('nunca devolvió nada y sigue sin devolver → healthy, no se inventa una avería', () => {
    expect(judgeHealth({ reachable: true, items: 0, previousItems: 0 })).toBe('healthy');
  });

  it('no se puede alcanzar → broken', () => {
    expect(judgeHealth({ reachable: false, items: 0, previousItems: 8 })).toBe('broken');
  });

  it('inalcanzable pesa más que cualquier historial', () => {
    expect(judgeHealth({ reachable: false, items: 0, previousItems: 0 })).toBe('broken');
  });
});
