import { describe, expect, it } from 'vitest';
import {
  evidenceFromEntry,
  evidenceFromHtml,
  gatherEvidence,
  parseFeed,
  strategyFor,
} from '../../scripts/verify/adapters.mjs';
import { verifyCandidate } from '../../scripts/verify/autoverify.mjs';

/**
 * Adaptadores de fuentes oficiales.
 *
 * La regla que se prueba una y otra vez aquí: **un feed sólo puede autorizar lo
 * que contiene**. Es la tentación evidente cuando el artículo devuelve 403 —
 * dar por bueno lo que «seguramente dirá»— y es exactamente lo que convertiría
 * el sistema en un generador de plausibilidad.
 *
 * También se prueba que la procedencia sobrevive: cada pieza de evidencia
 * arrastra de dónde salió y por qué vía, de modo que en la mesa se distingue un
 * hecho respaldado por el artículo de uno respaldado sólo por el feed.
 */

const FEED_RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item>
    <title><![CDATA[Aurora 2 is now available to everyone]]></title>
    <description><![CDATA[Aurora 2 is now available in the API for all customers, priced at $3 per million input tokens.]]></description>
    <link>https://openai.com/index/aurora-2</link>
    <pubDate>Sun, 30 Aug 2026 09:00:00 GMT</pubDate>
  </item>
  <item>
    <title><![CDATA[How Acme rebuilt onboarding]]></title>
    <description><![CDATA[Acme used our agents to cut onboarding time. See what enterprise leaders can apply.]]></description>
    <link>https://openai.com/index/acme-onboarding</link>
    <pubDate>Sat, 29 Aug 2026 09:00:00 GMT</pubDate>
  </item>
</channel></rss>`;

const FEED_ATOM = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Lyra 3 enters public preview</title>
    <link href="https://elevenlabs.io/blog/lyra-3"/>
    <published>2026-08-28T10:00:00Z</published>
    <summary>Lyra 3 is available in public preview for all developers starting this week.</summary>
  </entry>
</feed>`;

describe('los feeds oficiales se leen en sus dos formas', () => {
  it('lee RSS con item/pubDate/description', () => {
    const entradas = parseFeed(FEED_RSS, 'https://openai.com/news/rss.xml');
    expect(entradas).toHaveLength(2);
    expect(entradas[0]!.title).toBe('Aurora 2 is now available to everyone');
    expect(entradas[0]!.publishedAt).toBe('2026-08-30');
    expect(entradas[0]!.url).toBe('https://openai.com/index/aurora-2');
  });

  it('lee Atom con entry/published/summary', () => {
    const entradas = parseFeed(FEED_ATOM, 'https://elevenlabs.io/feed');
    expect(entradas).toHaveLength(1);
    expect(entradas[0]!.publishedAt).toBe('2026-08-28');
    expect(entradas[0]!.url).toBe('https://elevenlabs.io/blog/lyra-3');
  });

  it('descarta una entrada sin titular o sin enlace en lugar de inventarlos', () => {
    expect(parseFeed('<rss><channel><item><title>Sin enlace</title></item></channel></rss>', 'x')).toEqual(
      []
    );
  });
});

describe('toda evidencia lleva procedencia completa', () => {
  const evidencia = evidenceFromEntry(parseFeed(FEED_RSS, 'https://openai.com/news/rss.xml')[0]!);

  it('cada pieza declara tipo, cita, url y vía', () => {
    expect(evidencia.length).toBeGreaterThan(0);
    for (const item of evidencia) {
      expect(item.factType, JSON.stringify(item)).toBeTruthy();
      expect(item.quote.length, JSON.stringify(item)).toBeGreaterThan(0);
      expect(item.sourceUrl).toBe('https://openai.com/news/rss.xml');
      expect(item.via).toBe('feed');
    }
  });

  it('la fecha se cita por el campo del que sale, no reformateada', () => {
    const fecha = evidencia.find((e) => e.factType === 'date')!;
    expect(fecha.value).toBe('2026-08-30');
    expect(fecha.quote).toContain('Sun, 30 Aug 2026');
  });
});

describe('un feed no autoriza lo que no contiene', () => {
  it('autoriza la disponibilidad cuando su descripción la dice', () => {
    const evidencia = evidenceFromEntry(parseFeed(FEED_RSS, 'https://openai.com/news/rss.xml')[0]!);
    const disp = evidencia.find((e) => e.factType === 'availability');
    expect(disp?.value).toBe('available');
    expect(disp?.quote).toContain('is now available');
    expect(disp?.via).toBe('feed');
  });

  it('no autoriza disponibilidad cuando la descripción no la menciona', () => {
    const evidencia = evidenceFromEntry(parseFeed(FEED_RSS, 'https://openai.com/news/rss.xml')[1]!);
    expect(evidencia.some((e) => e.factType === 'availability')).toBe(false);
    /* Sí autoriza lo que sí trae: fecha y titular. */
    expect(evidencia.some((e) => e.factType === 'date')).toBe(true);
  });

  it('no autoriza gratuidad que nadie ha escrito', () => {
    const evidencia = evidenceFromEntry(parseFeed(FEED_RSS, 'https://openai.com/news/rss.xml')[0]!);
    expect(evidencia.some((e) => e.factType === 'free-access')).toBe(false);
  });

  it('un feed que sólo trae titulares autoriza titular y fecha, nada más', () => {
    const escueto = `<rss><channel><item><title>Algo nuevo</title>
      <link>https://x.test/a/b</link><pubDate>Sun, 30 Aug 2026 09:00:00 GMT</pubDate></item></channel></rss>`;
    const tipos = evidenceFromEntry(parseFeed(escueto, 'https://x.test/feed')[0]!).map((e) => e.factType);
    expect(new Set(tipos)).toEqual(new Set(['date', 'title']));
  });
});

describe('el artículo bloqueado no impide descubrir, pero limita lo que se afirma', () => {
  const feed = async () => FEED_RSS;

  it('OpenAI: artículo 403 y feed que sí dice disponibilidad → verificada', async () => {
    const record = await verifyCandidate(
      {
        id: 'inbox-aaaaaaaaaaaa',
        title: 'Aurora 2 is now available to everyone',
        url: 'https://openai.com/index/aurora-2',
        canonicalUrl: 'openai.com/index/aurora-2',
        publisher: 'openai.com',
        vertical: 'modelo-lenguaje',
      },
      {
        fetchPage: async () => ({ ok: false, status: 403, body: '' }),
        fetchFeed: feed,
        checkedAt: '2026-09-01',
      }
    );

    expect(record.decision).toBe('verified');
    expect(record.availability).toBe('available');
    /* Y dice explícitamente que el cuerpo no se ha leído. */
    expect(record.unconfirmed.join(' ')).toMatch(/no se ha podido leer/i);
    expect(record.primarySources.some((s: { reachable: boolean }) => !s.reachable)).toBe(true);
  });

  it('OpenAI: artículo 403 y feed que no dice nada → bloqueada, con motivo', async () => {
    const record = await verifyCandidate(
      {
        id: 'inbox-bbbbbbbbbbbb',
        title: 'How Acme rebuilt onboarding',
        url: 'https://openai.com/index/acme-onboarding',
        canonicalUrl: 'openai.com/index/acme-onboarding',
        publisher: 'openai.com',
        vertical: 'modelo-lenguaje',
      },
      {
        fetchPage: async () => ({ ok: false, status: 403, body: '' }),
        fetchFeed: feed,
        checkedAt: '2026-09-01',
      }
    );

    expect(record.decision).toBe('insufficient');
    expect(record.verificationNotes).toMatch(/disponibilidad/i);
    /* La fecha sí se conserva: el feed la contenía. */
    expect(record.verifiedFacts.some((f: { fact: string }) => /fecha/i.test(f.fact))).toBe(true);
  });

  it('mezcla las dos vías y deja ver cuál sostiene cada hecho', async () => {
    const html = `<html><head><meta property="og:title" content="Aurora 2"/></head><body><article>
      <p>${'Aurora 2 replaces the previous generation across the whole product surface. '.repeat(10)}</p>
      <p>We are also making a free tier available so anyone can try Aurora 2 without a credit card.</p>
    </article></body></html>`;

    const record = await verifyCandidate(
      {
        id: 'inbox-cccccccccccc',
        title: 'Aurora 2 is now available to everyone',
        url: 'https://openai.com/index/aurora-2',
        canonicalUrl: 'openai.com/index/aurora-2',
        publisher: 'openai.com',
        vertical: 'modelo-lenguaje',
      },
      {
        fetchPage: async () => ({ ok: true, status: 200, body: html }),
        fetchFeed: feed,
        checkedAt: '2026-09-01',
      }
    );

    const vias = record.verifiedFacts.map((f: { fact: string }) => f.fact.match(/vía (\w+)\]/)?.[1]);
    expect(vias).toContain('feed');
    expect(vias).toContain('html');

    /* La gratuidad la sostiene el artículo, no el feed. */
    const gratis = record.verifiedFacts.find((f: { fact: string }) => /gratuito/i.test(f.fact));
    expect(gratis?.sourceUrl).toBe('https://openai.com/index/aurora-2');
  });
});

describe('la estrategia por fabricante', () => {
  it('OpenAI y Google van por feed, y dicen por qué', () => {
    expect(strategyFor('openai.com').prefer).toBe('feed');
    expect(strategyFor('openai.com').note).toMatch(/403/);
    expect(strategyFor('blog.google').prefer).toBe('feed');
    expect(strategyFor('blog.google').note).toMatch(/JavaScript/i);
  });

  it('Anthropic y ElevenLabs siguen por HTML', () => {
    expect(strategyFor('anthropic.com').prefer).toBe('html');
    expect(strategyFor('elevenlabs.io').prefer).toBe('html');
  });

  it('un fabricante sin adaptador no rompe: se intenta el artículo', () => {
    expect(strategyFor('fabricante-nuevo.test').prefer).toBe('html');
  });
});

describe('el HTML sigue bloqueándose por las mismas razones', () => {
  it('un índice no aporta evidencia', () => {
    expect(evidenceFromHtml('<html></html>', 'https://openai.com/blog').blocked).toMatch(/índice/);
  });

  it('un esqueleto de JavaScript tampoco', () => {
    expect(evidenceFromHtml('<html><body><div id="root"></div></body></html>', 'https://x.test/a/b').blocked).toMatch(
      /JavaScript/i
    );
  });
});

describe('recolección resiliente', () => {
  it('un feed caído no impide leer el artículo', async () => {
    const html = `<html><head><meta property="article:published_time" content="2026-08-30T09:00:00Z"/></head>
      <body><article><p>${'Aurora 2 is now available to everyone right now across every plan. '.repeat(10)}</p></article></body></html>`;

    const { evidence, notes } = await gatherEvidence(
      { url: 'https://openai.com/index/aurora-2', publisher: 'openai.com', title: 'x' },
      {
        fetchPage: async () => ({ ok: true, status: 200, body: html }),
        fetchFeed: async () => {
          throw new Error('ETIMEDOUT');
        },
      }
    );

    expect(notes.join(' ')).toContain('ETIMEDOUT');
    expect(evidence.some((e: { factType: string }) => e.factType === 'availability')).toBe(true);
  });

  it('las dos vías caídas devuelven cero evidencia, no una excepción', async () => {
    const { evidence, htmlBlocked } = await gatherEvidence(
      { url: 'https://openai.com/index/x', publisher: 'openai.com', title: 'x' },
      {
        fetchPage: async () => ({ ok: false, status: 500, body: '' }),
        fetchFeed: async () => {
          throw new Error('ENOTFOUND');
        },
      }
    );

    expect(evidence).toEqual([]);
    expect(htmlBlocked).toContain('500');
  });
});

describe('una plataforma no acredita el lanzamiento de un producto ajeno', () => {
  /*
   * Encontrado auditando borradores reales. ComfyUI publicó «FLUX 3 is now
   * available via Partner Nodes» y salió un lanzamiento global de FLUX 3 con
   * `availability: available`. FLUX es de Black Forest Labs: lo que ComfyUI
   * acredita es que FLUX funciona en ComfyUI.
   *
   * `isVendorSource` daba verde —comfy.org publicando en comfy.org— porque
   * comprueba que la página pertenezca a quien la firma, no que quien la firma
   * fabrique lo que anuncia. Hacían falta las dos preguntas.
   */
  it('reconoce una integración cuando el fabricante no es quien publica', async () => {
    const { detectScope } = await import('../../scripts/verify/ownership.mjs');
    const flux = detectScope('FLUX 3 is now available via Partner Nodes', 'blog.comfy.org');
    expect(flux.scope).toBe('integration');
    expect(flux.vendor).toBe('Black Forest Labs');
    expect(flux.platform).toBe('comfy.org');
  });

  it('no recorta a quien sí fabrica lo que anuncia', async () => {
    const { detectScope } = await import('../../scripts/verify/ownership.mjs');
    expect(detectScope('Introducing Claude Opus 5', 'anthropic.com').scope).toBe('first-party');
    /* Subdominio: blogs.nvidia.com sigue siendo NVIDIA. */
    expect(detectScope('Nemotron 3.5 Lightning', 'blogs.nvidia.com').scope).toBe('first-party');
  });

  it('degrada la disponibilidad y el evento de una integración', async () => {
    const { narrowToScope } = await import('../../scripts/verify/ownership.mjs');
    const r = narrowToScope({ scope: 'integration', availability: 'available', eventType: 'lanzamiento' });
    expect(r.availability).toBe('limited');
    expect(r.eventType).toBe('actualizacion');
    expect(r.narrowed).toBe(true);
  });

  it('un tercero nunca puede declarar disponibilidad general', async () => {
    const { narrowToScope } = await import('../../scripts/verify/ownership.mjs');
    expect(
      narrowToScope({ scope: 'integration', availability: 'available', eventType: 'disponibilidad-general' })
        .eventType
    ).toBe('actualizacion');
  });

  it('deja constancia de por qué se recortó', async () => {
    const html = `<html><head><meta property="article:published_time" content="2026-08-05T19:31:49Z"/>
      <meta property="og:title" content="FLUX 3 is now available via Partner Nodes"/></head>
      <body><article><p>${'FLUX 3 is now available via Partner Nodes for everyone building here. '.repeat(8)}</p></article></body></html>`;

    const record = await verifyCandidate(
      {
        id: 'inbox-cafecafecafe',
        title: 'FLUX 3 is now available via Partner Nodes',
        url: 'https://blog.comfy.org/p/flux-3',
        canonicalUrl: 'blog.comfy.org/p/flux-3',
        publisher: 'blog.comfy.org',
        vertical: 'imagen',
      },
      { fetchPage: async () => ({ ok: true, status: 200, body: html }), checkedAt: '2026-09-07' }
    );

    expect(record.availability).toBe('limited');
    expect(record.eventType).toBe('actualizacion');
    expect(record.unconfirmed.join(' ')).toMatch(/no fabrica FLUX 3/i);
    expect(record.unconfirmed.join(' ')).toMatch(/Black Forest Labs/);
  });
});

describe('lo que se cita tiene que ser del artículo', () => {
  it('el rendimiento no es un precio', async () => {
    /*
     * «Qwen3.8-27B reaches 131 tokens per second on a single GeForce RTX 5090»
     * se citó como precio porque el patrón admitía «per second» sin moneda
     * delante. Un borrador llegó a decir «sobre el precio» y enseñar velocidad.
     */
    const { extractFacts } = await import('../../scripts/verify/extract.mjs');
    const html = `<html><body><article><p>${'Qwen3.8-27B reaches 131 tokens per second on a single GeForce RTX 5090 with MTP. '.repeat(6)}</p></article></body></html>`;
    expect(extractFacts(html, 'https://blogs.nvidia.com/a/b').pricing).toEqual([]);
  });

  it('un precio de verdad sigue citándose', async () => {
    const { extractFacts } = await import('../../scripts/verify/extract.mjs');
    const html = `<html><body><article><p>${'Aurora 2 is priced at $3 per million input tokens for everyone. '.repeat(6)}</p></article></body></html>`;
    expect(extractFacts(html, 'https://openai.com/a/b').pricing[0]).toContain('$3');
  });

  it('descarta el menú y el título de la plantilla', async () => {
    const { sentences } = await import('../../scripts/verify/extract.mjs');
    expect(
      sentences('NVIDIA and Local AI Community Fuel Open Source Models | NVIDIA Blog Skip to content .')
    ).toEqual([]);
  });

  it('recorta la firma pegada al titular en vez de perder la frase', async () => {
    const { sentences } = await import('../../scripts/verify/extract.mjs');
    expect(sentences('FLUX 3 is now available via Partner Nodes - by Rob .')).toEqual([
      'FLUX 3 is now available via Partner Nodes',
    ]);
  });
});
