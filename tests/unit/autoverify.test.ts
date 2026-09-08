import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  extractFacts,
  looksLikeIndex,
  looksUnreadable,
  sentences,
  toText,
} from '../../scripts/verify/extract.mjs';
import { verifyCandidate } from '../../scripts/verify/autoverify.mjs';
import { draftFromVerification } from '../../scripts/draft/autodraft.mjs';

/**
 * Verificación y redacción automáticas.
 *
 * Lo que se prueba aquí no es que el sistema escriba bien, sino que **no pueda
 * escribir lo que no ha leído**. Casi todos los casos son negativos: 403, muro
 * de login, esqueleto de JavaScript, página que responde 200 y no dice nada.
 * Cada uno tiene que terminar en `insufficient` con un motivo concreto, porque
 * la alternativa —un borrador plausible construido sobre una página que nadie
 * ha visto— es exactamente el fallo que este proyecto no se puede permitir.
 */

const CHECKED = '2026-09-01';

function candidato(extra: Record<string, unknown> = {}) {
  return {
    id: 'inbox-aaaaaaaaaaaa',
    title: 'Un anuncio del fabricante',
    url: 'https://openai.com/index/algo',
    canonicalUrl: 'openai.com/index/algo',
    publisher: 'openai.com',
    vertical: 'modelo-lenguaje',
    ...extra,
  };
}

function pagina(body: string, status = 200) {
  return async () => ({ ok: status >= 200 && status < 300, status, body });
}

const PAGINA_BUENA = `
  <html><head>
    <meta property="og:title" content="Introducing Aurora 2" />
    <meta property="article:published_time" content="2026-08-30T09:00:00Z" />
  </head><body>
    <nav><a href="/pricing">Pricing — from $10 per month</a></nav>
    <article>
      <p>Aurora 2 is our new generation of image models, trained from scratch on
         a rebuilt data pipeline and evaluated against the previous release on
         internal benchmarks covering composition, text rendering and prompt
         adherence across a wide range of styles.</p>
      <p>Aurora 2 is now available to everyone in the API and in the web app,
         with no changes needed to existing integrations.</p>
      <p>Aurora 2 is priced at $3 per million input tokens and $12 per million
         output tokens for all customers, billed the same way as before.</p>
      <p>We are also making a free tier available so anyone can try Aurora 2
         without a credit card before deciding whether to upgrade.</p>
      <p>The model card, the evaluation methodology and the full list of
         supported parameters are documented alongside this announcement for
         teams that need to review them before adopting it.</p>
    </article>
  </body></html>
`;

describe('leer una página es distinto de recibir un 200', () => {
  it('detecta un esqueleto de JavaScript', () => {
    expect(looksUnreadable('<html><body><div id="root"></div></body></html>')).toMatch(/JavaScript/i);
  });

  it('detecta un muro de acceso', () => {
    const html = `<html><body><main>${'Sign in to continue reading this announcement. '.repeat(20)}</main></body></html>`;
    expect(looksUnreadable(html)).toMatch(/sesión/i);
  });

  it('detecta una comprobación anti-bot', () => {
    const html = `<html><body><main>${'Verify you are human before continuing to the site. '.repeat(20)}</main></body></html>`;
    expect(looksUnreadable(html)).toMatch(/anti-bot/i);
  });

  it('no marca como ilegible una página normal', () => {
    expect(looksUnreadable(PAGINA_BUENA)).toBeNull();
  });

  it('descarta menús y scripts antes de buscar hechos', () => {
    /*
     * Sin esto, el «Pricing» del menú de navegación de cualquier fabricante
     * produciría citas sobre precios que nadie escribió en el artículo.
     */
    const html = `
      <html><body>
        <nav><a href="/pricing">Pricing — from $10 per month</a></nav>
        <script>const precio = "$99 per seat";</script>
        <article><p>${'El cuerpo real del anuncio no habla de dinero en absoluto. '.repeat(8)}</p></article>
      </body></html>`;
    expect(toText(html)).not.toMatch(/\$10|\$99/);
  });
});

describe('la fecha sale de donde la página la declara', () => {
  it('la toma de los metadatos, con su procedencia', () => {
    const hechos = extractFacts(PAGINA_BUENA, 'https://openai.com/index/algo');
    expect(hechos.publishedAt?.value).toBe('2026-08-30');
    expect(hechos.publishedAt?.quote).toContain('article:published_time');
  });

  it('no inventa una fecha a partir del cuerpo', () => {
    /*
     * Una fecha suelta en el texto puede ser la de cualquier cosa mencionada de
     * pasada. La regla editorial pide la fecha que la página declara como suya.
     */
    const html = '<html><body><article><p>Back in January 2020 we started this work, and today it ships to everyone.</p></article></body></html>';
    expect(extractFacts(html, 'https://x.test/a').publishedAt).toBeNull();
  });
});

describe('el hecho es la frase del fabricante', () => {
  const hechos = extractFacts(PAGINA_BUENA, 'https://openai.com/index/algo');

  it('cita literalmente la frase que declara disponibilidad', () => {
    expect(hechos.availability?.availability).toBe('available');
    expect(hechos.availability?.quote).toContain('is now available to everyone');
  });

  it('distingue una preview de una disponibilidad general', () => {
    const preview = extractFacts(
      '<html><body><article><p>Aurora 2 is available in public preview starting today for developers.</p></article></body></html>',
      'https://openai.com/index/p'
    );
    expect(preview.availability?.availability).toBe('preview');
    expect(preview.availability?.eventType).toBe('preview-beta');
  });

  it('lee un anuncio sin disponibilidad como anuncio', () => {
    const futuro = extractFacts(
      '<html><body><article><p>Aurora 2 is coming soon, and you can join the waitlist today to be notified.</p></article></body></html>',
      'https://openai.com/index/f'
    );
    expect(futuro.availability?.availability).toBe('announced');
  });

  it('cita el precio y la gratuidad por separado', () => {
    expect(hechos.pricing[0]).toContain('$3 per million');
    expect(hechos.freePlan[0]).toContain('free tier');
  });

  it('no encuentra gratuidad donde no la hay, y no la niega', () => {
    const sinGratis = extractFacts(
      '<html><body><article><p>Aurora 2 is now available and costs $3 per million input tokens for everyone.</p></article></body></html>',
      'https://openai.com/index/g'
    );
    expect(sinGratis.freePlan).toEqual([]);
  });
});

describe('lo que la fuente no permite verificar queda bloqueado', () => {
  it('un 403 se registra como tal, no desaparece', async () => {
    const record = await verifyCandidate(candidato(), {
      fetchPage: pagina('', 403),
      checkedAt: CHECKED,
    });
    expect(record.decision).toBe('insufficient');
    expect(record.verificationNotes).toContain('403');
    expect(record.primarySources[0]!.reachable).toBe(false);
  });

  it('un muro de login queda bloqueado con su motivo', async () => {
    const html = `<html><body><main>${'Sign in to continue reading this announcement. '.repeat(20)}</main></body></html>`;
    const record = await verifyCandidate(candidato(), { fetchPage: pagina(html), checkedAt: CHECKED });
    expect(record.decision).toBe('insufficient');
    expect(record.verificationNotes).toMatch(/sesión/i);
  });

  it('una página que sólo trae JavaScript no cuenta como leída', async () => {
    const record = await verifyCandidate(candidato(), {
      fetchPage: pagina('<html><body><div id="app"></div></body></html>'),
      checkedAt: CHECKED,
    });
    expect(record.decision).toBe('insufficient');
    expect(record.verificationNotes).toMatch(/JavaScript/i);
  });

  it('una url que no es del fabricante no se lee siquiera', async () => {
    let llamado = false;
    const record = await verifyCandidate(candidato({ url: 'https://noticias.example/copia' }), {
      fetchPage: async () => {
        llamado = true;
        return { ok: true, status: 200, body: PAGINA_BUENA };
      },
      checkedAt: CHECKED,
    });
    expect(record.decision).toBe('insufficient');
    expect(llamado).toBe(false);
  });

  it('una página legible que no sostiene el hecho tampoco se verifica', async () => {
    const html = `<html><head><meta property="article:published_time" content="2026-08-30T09:00:00Z"/></head>
      <body><article><p>${'Hoy hablamos de cómo pensamos sobre el futuro del sector y de nuestra visión. '.repeat(6)}</p></article></body></html>`;
    const record = await verifyCandidate(candidato(), { fetchPage: pagina(html), checkedAt: CHECKED });
    expect(record.decision).toBe('insufficient');
    expect(record.verificationNotes).toContain('disponibilidad');
  });

  it('un error de red se registra en lugar de romper la pasada', async () => {
    const record = await verifyCandidate(candidato(), {
      fetchPage: async () => {
        throw new Error('ETIMEDOUT');
      },
      checkedAt: CHECKED,
    });
    expect(record.decision).toBe('insufficient');
    expect(record.verificationNotes).toContain('ETIMEDOUT');
  });

  it('el silencio nunca se convierte en un "no"', async () => {
    const html = PAGINA_BUENA.replace(/We are also making a free tier[\s\S]*?<\/p>/, '');
    const record = await verifyCandidate(candidato(), { fetchPage: pagina(html), checkedAt: CHECKED });
    expect(record.affectsFreePlan).toBe('unverified');
    expect(record.unconfirmed.join(' ')).toMatch(/menciona acceso sin pagar/i);
  });
});

describe('cuando la fuente sí lo sostiene, redacta con evidencia', () => {
  it('verifica y produce hechos con cita literal', async () => {
    const record = await verifyCandidate(candidato(), {
      fetchPage: pagina(PAGINA_BUENA),
      checkedAt: CHECKED,
    });

    expect(record.decision).toBe('verified');
    expect(record.availability).toBe('available');
    expect(record.affectsFreePlan).toBe('yes');
    expect(record.verifiedFacts.length).toBeGreaterThanOrEqual(4);
    for (const hecho of record.verifiedFacts) {
      expect(hecho.quote.length, hecho.fact).toBeGreaterThan(5);
      expect(hecho.sourceUrl).toContain('openai.com');
    }
  });

  it('el borrador pasa la misma puerta que uno escrito a mano', async () => {
    const record = await verifyCandidate(candidato(), {
      fetchPage: pagina(PAGINA_BUENA),
      checkedAt: CHECKED,
    });
    const resultado = draftFromVerification(record, candidato());

    expect(resultado?.blocked).toEqual([]);
    expect(resultado?.draft).not.toBeNull();
  });

  it('cada afirmación del borrador apunta a una cita verificada', async () => {
    const record = await verifyCandidate(candidato(), {
      fetchPage: pagina(PAGINA_BUENA),
      checkedAt: CHECKED,
    });
    const { draft } = draftFromVerification(record, candidato())!;
    const citasValidas = new Set(record.verifiedFacts.map((f: { quote: string }) => f.quote));

    for (const [parte, citas] of Object.entries(draft!.factTrace)) {
      for (const cita of citas as string[]) {
        expect(citasValidas.has(cita), `${parte}: «${cita}»`).toBe(true);
      }
    }
  });

  it('el texto factual del borrador es literalmente el del fabricante', async () => {
    /*
     * Todo lo entrecomillado tiene que existir en la página. Es la comprobación
     * que separa «compone citas» de «escribe prosa que suena a la fuente».
     */
    const record = await verifyCandidate(candidato(), {
      fetchPage: pagina(PAGINA_BUENA),
      checkedAt: CHECKED,
    });
    const { draft } = draftFromVerification(record, candidato())!;
    const texto = toText(PAGINA_BUENA);

    const entrecomillado = [...`${draft!.summary} ${draft!.impact}`.matchAll(/«([^»]+)»/g)].map(
      (m) => m[1]!.replace(/…$/, '')
    );

    expect(entrecomillado.length).toBeGreaterThan(0);
    for (const cita of entrecomillado) {
      const inicio = cita.slice(0, 40);
      expect(texto.includes(inicio), `no está en la página: «${inicio}»`).toBe(true);
    }
  });

  it('no redacta desde una verificación insuficiente', async () => {
    const record = await verifyCandidate(candidato(), { fetchPage: pagina('', 403), checkedAt: CHECKED });
    expect(draftFromVerification(record, candidato())).toBeNull();
  });

  it('declara la disponibilidad que la cita sostiene, no otra', async () => {
    const html = PAGINA_BUENA.replace(
      'is now available to everyone in the API and in the web app',
      'is available in public preview starting today for developers'
    );
    const record = await verifyCandidate(candidato(), { fetchPage: pagina(html), checkedAt: CHECKED });
    const { draft } = draftFromVerification(record, candidato())!;

    expect(draft!.availability).toBe('preview');
    expect(draft!.eventType).toBe('preview-beta');
    expect(draft!.factTrace.availability[0]).toContain('public preview');
  });

  it('es determinista: la misma página produce el mismo borrador', async () => {
    const uno = await verifyCandidate(candidato(), { fetchPage: pagina(PAGINA_BUENA), checkedAt: CHECKED });
    const dos = await verifyCandidate(candidato(), { fetchPage: pagina(PAGINA_BUENA), checkedAt: CHECKED });

    expect(JSON.stringify(draftFromVerification(dos, candidato()))).toBe(
      JSON.stringify(draftFromVerification(uno, candidato()))
    );
  });
});

describe('contra HTML real de un fabricante', () => {
  it('extrae texto legible de una página de producción', () => {
    const html = readFileSync('tests/fixtures/sources/bfl-article.html', 'utf-8');
    const texto = toText(html);
    expect(texto.length).toBeGreaterThan(500);
    expect(sentences(texto).length).toBeGreaterThan(3);
  });

  it('no la declara ilegible', () => {
    const html = readFileSync('tests/fixtures/sources/bfl-article.html', 'utf-8');
    expect(looksUnreadable(html)).toBeNull();
  });
});

describe('un índice no es una noticia', () => {
  /*
   * Encontrado leyendo páginas reales: `elevenlabs.io/blog` responde 200, se lee
   * bien y contiene «Eleven v3 is Now Generally Available». El extractor la
   * verificaba entera como si fuera el anuncio, y el borrador salía con el
   * titular del blog y una cifra de marketing de otra historia.
   */
  it('reconoce un índice de sección por la profundidad de la ruta', () => {
    expect(looksLikeIndex('https://elevenlabs.io/blog')).toMatch(/índice/);
    expect(looksLikeIndex('https://mistral.ai/news')).toMatch(/índice/);
    expect(looksLikeIndex('https://openai.com')).toMatch(/portada/);
  });

  it('no confunde un artículo con un índice', () => {
    expect(looksLikeIndex('https://bfl.ai/announcements/flux-2')).toBeNull();
    expect(looksLikeIndex('https://www.anthropic.com/news/claude-opus-5')).toBeNull();
  });

  it('rechaza el índice sin llegar a descargarlo', async () => {
    let descargado = false;
    const record = await verifyCandidate(
      candidato({ url: 'https://openai.com/blog', canonicalUrl: 'openai.com/blog' }),
      {
        fetchPage: async () => {
          descargado = true;
          return { ok: true, status: 200, body: PAGINA_BUENA };
        },
        checkedAt: CHECKED,
      }
    );

    expect(record.decision).toBe('insufficient');
    expect(record.verificationNotes).toMatch(/índice/);
    expect(descargado, 'no debería descargarse un índice').toBe(false);
  });

  it('decodifica las entidades del titular', () => {
    const html = '<html><head><meta property="og:title" content="Research &amp; Product"/></head><body></body></html>';
    expect(extractFacts(html, 'https://x.test/a/b').title).toBe('Research & Product');
  });
});

describe('una cita con marcado dentro no es una cita', () => {
  /*
   * Encontrado leyendo ElevenLabs en vivo. Tailwind escribe clases como
   * `class="[&>*]:hidden"`, con un «>» dentro de las comillas, y un limpiador
   * de etiquetas ingenuo corta ahí: la cita salía como «Eleven v3 is Now
   * Generally Available &)]:tw-overflow-x-hidden">».
   */
  it('quita etiquetas cuyos atributos contienen «>»', () => {
    const html = '<div class="[&>*]:tw-overflow-x-hidden"><p>Eleven v3 is Now Generally Available for everyone today.</p></div>';
    const texto = toText(html);
    expect(texto).toContain('Eleven v3 is Now Generally Available');
    expect(texto).not.toMatch(/tw-overflow|class=|">/);
  });

  it('descarta una frase si algún resto de marcado sobrevive', () => {
    const conBasura = 'Something is now available &)]:tw-overflow-x-hidden"> and ready to use today.';
    expect(sentences(conBasura)).toEqual([]);
  });

  it('el borrador nunca cita marcado', async () => {
    const record = await verifyCandidate(candidato(), {
      fetchPage: pagina(PAGINA_BUENA),
      checkedAt: CHECKED,
    });
    const { draft } = draftFromVerification(record, candidato())!;
    expect(`${draft!.summary} ${draft!.impact}`).not.toMatch(/tw-|class=|">|<[a-z]/i);
  });
});
