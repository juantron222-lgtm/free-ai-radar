import { describe, expect, it } from 'vitest';
import {
  DIAS_FRESCA,
  PORTADA_MAX,
  encontrarSupersesiones,
  relevancia,
  repartirPortada,
} from '@lib/domain/lifecycle';
import { canAutoPublish } from '@lib/domain/newsroom';
import { hydrateNews } from '@lib/domain/news';

/* El tipo se ancla al que espera `hydrateNews`: importar `NewsItem` por su
   alias lo resolvía por una ruta distinta y TypeScript veía dos tipos con el
   mismo nombre y sin relación entre sí. */
type Entrada = Parameters<typeof hydrateNews>[0];

/**
 * El ciclo de vida de la portada, y la puerta que publica sin que nadie mire.
 *
 * Lo que más se prueba aquí es que envejecer no borra. Una noticia sale de
 * portada y sigue existiendo: si esta partición pudiera perder una historia,
 * perdería con ella su URL, sus enlaces entrantes y su sitio en el sitemap.
 */

const HOY = new Date('2026-09-07T00:00:00Z');

function noticia(overrides: Record<string, unknown> = {}) {
  /*
   * Sin anotar, y con un puente en la llamada. `freeAccess` es un objeto zod
   * anidado y TypeScript infiere un tipo anónimo distinto en cada punto de
   * importación, así que anotar el literal produce «dos tipos con el mismo
   * nombre y sin relación» sobre estructuras idénticas. Lo que valida esta
   * fixture son las pruebas que la usan, no su anotación.
   */
  const base = {
    id: 'news-x',
    slug: 'una-noticia',
    title: 'Un fabricante publica algo',
    summary: 'Resumen de prueba con la longitud mínima que el esquema exige para validarse.',
    impact: 'Consecuencia práctica de prueba, distinta del resumen y suficientemente larga.',
    category: 'modelo-lenguaje',
    eventType: 'lanzamiento',
    availability: 'available',
    publishedAt: '2026-09-01',
    checkedAt: '2026-09-02',
    sources: [
      {
        url: 'https://www.anthropic.com/news/algo',
        label: 'Anuncio',
        kind: 'official',
        publisher: 'anthropic.com',
        checkedAt: '2026-09-02',
      },
    ],
    officialUrl: 'https://www.anthropic.com/news/algo',
    relatedTools: [],
    affectsFreePlan: 'unverified',
    verification: 'verified',
    status: 'published',
    author: 'Redacción',
    unconfirmed: [],
    ...overrides,
  };
  return hydrateNews(base as unknown as Entrada, HOY);
}

describe('envejecer no es desaparecer', () => {
  it('nada se pierde entre portada y archivo', () => {
    const items = Array.from({ length: 30 }, (_, i) =>
      noticia({ slug: `n-${i}`, publishedAt: `2026-0${i < 9 ? '9' : '8'}-0${(i % 9) + 1}` })
    );
    const { destacadas, archivo } = repartirPortada(items);
    expect(destacadas.length + archivo.length).toBe(items.length);

    const todos = new Set([...destacadas, ...archivo].map((n) => n.slug));
    expect(todos.size).toBe(items.length);
  });

  it('la portada no crece sin límite', () => {
    const items = Array.from({ length: 40 }, (_, i) => noticia({ slug: `n-${i}` }));
    expect(repartirPortada(items).destacadas.length).toBe(PORTADA_MAX);
  });

  it('una noticia vieja sale de portada aunque quepa', () => {
    const vieja = noticia({ slug: 'vieja', publishedAt: '2026-01-01' });
    const nueva = noticia({ slug: 'nueva', publishedAt: '2026-09-05' });
    const { destacadas, archivo } = repartirPortada([vieja, nueva]);

    expect(destacadas.map((n) => n.slug)).toEqual(['nueva']);
    expect(archivo.map((n) => n.slug)).toEqual(['vieja']);
  });

  it('cada salida de portada lleva su motivo', () => {
    const items = [
      noticia({ slug: 'vieja', publishedAt: '2026-01-01' }),
      ...Array.from({ length: 20 }, (_, i) => noticia({ slug: `n-${i}`, publishedAt: '2026-09-01' })),
    ];
    const { motivos } = repartirPortada(items);

    expect(motivos.find((m) => m.slug === 'vieja')?.motivo).toMatch(/días/);
    expect(motivos.some((m) => /ya lleva/.test(m.motivo))).toBe(true);
  });

  it('el corte por edad es el declarado', () => {
    const justa = noticia({ slug: 'justa', publishedAt: '2026-09-01' });
    expect(justa.ageDays).toBeLessThan(DIAS_FRESCA);
    expect(repartirPortada([justa]).destacadas).toHaveLength(1);
  });
});

describe('qué se queda arriba cuando no cabe todo', () => {
  it('manda la fecha, no la relevancia', () => {
    const relevante = noticia({ slug: 'relevante', publishedAt: '2026-09-01', affectsFreePlan: 'yes' });
    const reciente = noticia({ slug: 'reciente', publishedAt: '2026-09-05' });
    const { destacadas } = repartirPortada([relevante, reciente], { max: 2 });
    expect(destacadas[0]!.slug).toBe('reciente');
  });

  it('la relevancia desempata en la misma fecha', () => {
    const gratis = noticia({ slug: 'gratis', affectsFreePlan: 'yes' });
    const normal = noticia({ slug: 'normal' });
    const { destacadas } = repartirPortada([normal, gratis], { max: 2 });
    expect(destacadas[0]!.slug).toBe('gratis');
  });

  it('lo que cambia el acceso gratuito pesa más que nada', () => {
    expect(relevancia(noticia({ affectsFreePlan: 'yes' }))).toBeGreaterThan(
      relevancia(noticia({ affectsFreePlan: 'unverified' }))
    );
  });

  it('una integración de terceros pesa menos que un lanzamiento', () => {
    const integracion = noticia({ eventType: 'actualizacion', availability: 'limited' });
    expect(relevancia(integracion)).toBeLessThan(relevancia(noticia()));
  });
});

describe('cuando una noticia deja atrás a otra', () => {
  it('detecta que la disponibilidad avanzó', () => {
    const antes = noticia({ slug: 'preview', title: 'Claude Opus entra en preview', availability: 'preview', publishedAt: '2026-08-01' });
    const ahora = noticia({ slug: 'ga', title: 'Claude Opus ya disponible para todos', availability: 'available', publishedAt: '2026-09-01' });

    const s = encontrarSupersesiones([antes, ahora]);
    expect(s).toHaveLength(1);
    expect(s[0]!.anterior).toBe('preview');
    expect(s[0]!.nueva).toBe('ga');
    expect(s[0]!.motivo).toMatch(/preview.*available/);
  });

  it('no supera hacia atrás', () => {
    const nueva = noticia({ slug: 'preview', title: 'Claude entra en preview', availability: 'preview', publishedAt: '2026-09-01' });
    const vieja = noticia({ slug: 'ga', title: 'Claude ya disponible', availability: 'available', publishedAt: '2026-08-01' });
    expect(encontrarSupersesiones([vieja, nueva])).toEqual([]);
  });

  it('dos noticias distintas del mismo producto no se superan', () => {
    /*
     * Colapsarlas perdería una de las dos. Sólo hay supersesión cuando el
     * estado de disponibilidad avanza, no cuando simplemente se habla del
     * mismo producto otra vez.
     */
    const precio = noticia({ slug: 'precio', title: 'Claude baja de precio', availability: 'available', publishedAt: '2026-08-01' });
    const region = noticia({ slug: 'region', title: 'Claude llega a más países', availability: 'available', publishedAt: '2026-09-01' });
    expect(encontrarSupersesiones([precio, region])).toEqual([]);
  });

  it('productos distintos nunca se superan', () => {
    const claude = noticia({ slug: 'c', title: 'Claude entra en preview', availability: 'preview', publishedAt: '2026-08-01' });
    const gemini = noticia({ slug: 'g', title: 'Gemini ya disponible', availability: 'available', publishedAt: '2026-09-01' });
    expect(encontrarSupersesiones([claude, gemini])).toEqual([]);
  });
});

describe('publicar sin que nadie lo mire pide más, no menos', () => {
  const historia = (extra: Record<string, unknown> = {}) => ({
    key: 'una',
    title: 'Algo',
    publisher: 'anthropic.com',
    publishedAt: '2026-09-05',
    vertical: 'modelo-lenguaje',
    section: 'ready' as const,
    radar: null,
    triage: null,
    draft: { slug: 'una' },
    gate: { ok: true, reasons: [] },
    decision: null,
    published: false,
    ...extra,
    /*
     * La verificación se compone al final a propósito: un `...extra` posterior
     * sustituiría el objeto entero en lugar de fusionarlo, y las pruebas que
     * cambian un solo campo acabarían pasando una verificación sin fuentes.
     */
    verification: {
      decision: 'verified',
      primarySources: [{ url: 'https://anthropic.com/news/x', label: 'x', reachable: true, unreachableReason: null }],
      verifiedFacts: [{ fact: 'La fuente declara la fecha. [date, vía html]', quote: 'q', sourceUrl: 'u' }],
      unconfirmed: [],
      ...((extra.verification as Record<string, unknown>) ?? {}),
    },
  });

  const opciones = { today: '2026-09-07' };

  it('deja pasar una historia leída, verificada y sin huecos', () => {
    const r = canAutoPublish(historia() as never, opciones);
    expect(r.ok, r.reasons.join('; ')).toBe(true);
  });

  it('se niega si nada se pudo leer', () => {
    const r = canAutoPublish(
      historia({ verification: { primarySources: [{ url: 'u', label: 'x', reachable: false, unreachableReason: '403' }] } }) as never,
      opciones
    );
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/ninguna fuente primaria se ha podido leer/);
  });

  it('se niega si toda la evidencia viene del feed', () => {
    const r = canAutoPublish(
      historia({ verification: { verifiedFacts: [{ fact: 'La fuente declara la fecha. [date, vía feed]', quote: 'q', sourceUrl: 'u' }] } }) as never,
      opciones
    );
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/artículo no se ha leído/);
  });

  it('se niega si quedan puntos sustantivos sin confirmar', () => {
    const r = canAutoPublish(
      historia({ verification: { unconfirmed: ['Cuerpo del artículo: no se ha podido leer (403).'] } }) as never,
      opciones
    );
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/sin confirmar/);
  });

  it('una ausencia que la fuente declara no bloquea', () => {
    /*
     * El verificador anota siempre que la página no menciona precio ni acceso
     * gratuito cuando calla, y el borrador lo dice tal cual. Tratar eso como un
     * hueco dejaba la puerta cerrada para todo: no había una sola verificación
     * sin esas dos líneas.
     */
    const r = canAutoPublish(
      historia({
        verification: {
          unconfirmed: [
            'Precio: no aparece en ninguna vía oficial.',
            'Plan gratuito: ninguna vía oficial menciona acceso sin pagar.',
          ],
        },
      }) as never,
      opciones
    );
    expect(r.ok, r.reasons.join('; ')).toBe(true);
  });

  it('una ausencia declarada junto a un hueco real sigue bloqueando', () => {
    const r = canAutoPublish(
      historia({
        verification: {
          unconfirmed: [
            'Precio: no aparece en ninguna vía oficial.',
            'Cuerpo del artículo: no se ha podido leer (403).',
          ],
        },
      }) as never,
      opciones
    );
    expect(r.ok).toBe(false);
  });

  it('se niega ante una integración de terceros', () => {
    const r = canAutoPublish(historia({ verification: { scope: 'integration' } }) as never, opciones);
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/integración/);
  });

  it('se niega si la fuente la publicó hace demasiado', () => {
    const r = canAutoPublish(historia({ publishedAt: '2026-06-01' }) as never, opciones);
    expect(r.ok).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/demasiado vieja/);
  });

  it('nunca es más permisiva que la aprobación humana', () => {
    /*
     * La automática incluye entera a `canApprove`. Si alguna vez dejara pasar
     * algo que una persona no podría aprobar, el orden de las barreras estaría
     * invertido.
     */
    const sinBorrador = canAutoPublish(historia({ draft: null }) as never, opciones);
    expect(sinBorrador.ok).toBe(false);
    expect(sinBorrador.reasons.join(' ')).toMatch(/no hay borrador/);
  });
});
