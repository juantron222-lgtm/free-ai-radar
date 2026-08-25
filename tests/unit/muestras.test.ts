import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { getAllTools } from '@lib/data/catalog';
import { estaProbada, muestrasDe, todasLasMuestras } from '@lib/data/muestras';
import {
  AVISO_MUESTRA,
  AVISO_OBSERVADO,
  EditorialSample,
  OBSERVACIONES,
  OBSERVACION_LABEL,
  contradicciones,
} from '@lib/domain/muestra';
import { TRI_STATE_LABEL } from '@lib/domain/primitives';

/**
 * Una prueba propia no puede ascender a condición del plan.
 *
 * Es la línea que esta fase existe para trazar. Que una generación salga sin
 * marca de agua demuestra que **en esa prueba no apareció**, y nada más: puede
 * depender del modo, del formato de descarga o de que lo cambien mañana.
 * Convertir lo uno en lo otro sería la clase de error que destruye la razón de
 * ser de este sitio, así que aquí se guarda con varias vueltas de llave.
 */

const tools = getAllTools();
const muestras = todasLasMuestras();

/** Un caso completo, para poder probar el modelo sin depender del catálogo. */
const ejemplo = {
  id: 'ejemplo-2026-08-25',
  toolSlug: 'ideogram',
  generatedAt: '2026-08-25T10:32:00+02:00',
  accessSurface: 'web' as const,
  accessUrl: 'https://ideogram.ai/',
  prompt: 'Un taller de relojería al amanecer, luz lateral fría, sin texto.',
  model: 'Ideogram 3.0 · calidad lenta',
  aspectRatio: '1:1',
  dimensions: { width: 1024, height: 1024 },
  creditsSpent: '1 crédito lento',
  creditsLeft: '9 de 10 esta semana',
  cardRequiredObserved: 'no_aparecio' as const,
  watermarkObserved: 'no_aparecio' as const,
  durationSeconds: 34,
  asset: {
    original: '/muestras/originales/ideogram.png',
    originalBytes: 1_800_000,
    originalSha256: 'a'.repeat(64),
    web: '/muestras/web/ideogram.webp',
    webBytes: 180_000,
    webDimensiones: { width: 1024, height: 1024 },
    derivacion: 'Reescalado y recomprimido a WebP 82. Sin recorte ni retoque.',
  },
};

describe('observado no es lo mismo que documentado', () => {
  it('el vocabulario de una observación no se solapa con el de un triestado', () => {
    /*
     * La defensa estructural: si una observación pudiera valer `yes` o `no`,
     * alguien acabaría escribiéndola en `freePlan.hasWatermark` y la anécdota
     * se convertiría en condición sin que nadie lo notase.
     */
    const triestados = Object.keys(TRI_STATE_LABEL);
    for (const obs of OBSERVACIONES) {
      expect(triestados, `«${obs}» colisiona con el triestado`).not.toContain(obs);
    }
  });

  it('toda etiqueta pública de una observación se acota a la prueba', () => {
    for (const obs of OBSERVACIONES) {
      const etiqueta = OBSERVACION_LABEL[obs];
      expect(etiqueta, obs).toBeTruthy();
      if (obs === 'aparecio' || obs === 'no_aparecio') {
        expect(etiqueta, `«${etiqueta}» se lee como una condición del plan`).toMatch(
          /en nuestra prueba/i
        );
      }
    }
  });

  it('los dos avisos dicen lo que una muestra no demuestra', () => {
    expect(AVISO_MUESTRA).toMatch(/no determina qué herramienta es mejor/i);
    expect(AVISO_OBSERVADO).toMatch(/no sustituye/i);
  });

  it('ninguna muestra escribe en los campos del plan gratuito', () => {
    /*
     * `EditorialSample` no tiene forma de tocar `freePlan`: no comparte ni un
     * nombre de campo con él. Esto lo comprueba sobre el objeto real, por si
     * alguien añade uno con el mismo nombre.
     */
    const camposDelPlan = ['hasWatermark', 'requiresCreditCard', 'requiresSignup', 'commercialUse'];
    for (const muestra of [ejemplo, ...muestras]) {
      for (const campo of camposDelPlan) {
        expect(Object.keys(muestra), `una muestra no puede llevar «${campo}»`).not.toContain(campo);
      }
    }
  });
});

describe('una contradicción se señala, no se aplica', () => {
  it('detecta una marca que la ficha negaba', () => {
    const choques = contradicciones(
      { ...ejemplo, watermarkObserved: 'aparecio' },
      { hasWatermark: 'no', requiresCreditCard: 'no' }
    );
    expect(choques).toHaveLength(1);
    expect(choques[0]!.campo).toBe('freePlan.hasWatermark');
  });

  it('y una tarjeta que la ficha negaba', () => {
    const choques = contradicciones(
      { ...ejemplo, cardRequiredObserved: 'aparecio' },
      { hasWatermark: 'unverified', requiresCreditCard: 'no' }
    );
    expect(choques.map((c) => c.campo)).toContain('freePlan.requiresCreditCard');
  });

  it('no inventa contradicción cuando el dato está sin confirmar', () => {
    /*
     * Lo importante: una prueba contra un hueco no es una contradicción. Si la
     * ficha no afirma nada, la muestra no contradice nada; sólo añade.
     */
    const choques = contradicciones(
      { ...ejemplo, watermarkObserved: 'aparecio', cardRequiredObserved: 'aparecio' },
      { hasWatermark: 'unverified', requiresCreditCard: 'unverified' }
    );
    expect(choques).toEqual([]);
  });

  it('ni cuando lo observado coincide con lo documentado', () => {
    const choques = contradicciones(ejemplo, { hasWatermark: 'no', requiresCreditCard: 'no' });
    expect(choques).toEqual([]);
  });
});

describe('el modelo exige lo que hace falta para poder defender una prueba', () => {
  it('el caso completo pasa el esquema', () => {
    expect(EditorialSample.safeParse(ejemplo).success).toBe(true);
  });

  it('una fecha sin hora no vale', () => {
    /*
     * Una cuota diaria se agota a media tarde y un plan cambia de una semana a
     * otra: sin hora, una prueba fechada se lee como una afirmación indefinida.
     */
    const sinHora = EditorialSample.safeParse({ ...ejemplo, generatedAt: '2026-08-25' });
    expect(sinHora.success).toBe(false);
  });

  it('una observación tiene que ser explícita, no puede faltar', () => {
    const sinObservacion = { ...ejemplo } as Record<string, unknown>;
    delete sinObservacion['watermarkObserved'];
    expect(EditorialSample.safeParse(sinObservacion).success).toBe(false);
  });

  it('un activo servido desde fuera de nuestro dominio no vale', () => {
    const ajeno = EditorialSample.safeParse({
      ...ejemplo,
      asset: { ...ejemplo.asset, web: 'https://cdn.ejemplo.com/muestra.webp' },
    });
    expect(ajeno.success).toBe(false);
  });

  it('el derivado tiene que decir de qué original viene y qué se le hizo', () => {
    const sinLinaje = EditorialSample.safeParse({
      ...ejemplo,
      asset: { ...ejemplo.asset, derivacion: '' },
    });
    expect(sinLinaje.success).toBe(false);
  });

  it('las dimensiones son enteros positivos: no se estiman', () => {
    const inventada = EditorialSample.safeParse({
      ...ejemplo,
      dimensions: { width: 0, height: 1024 },
    });
    expect(inventada.success).toBe(false);
  });
});

describe('las dos primeras muestras reales', () => {
  it('están ingeridas y son las dos de imagen', () => {
    /*
     * Generar exige una cuenta en cada servicio, así que las ejecutó una
     * persona y aquí sólo se ingirió lo que trajo. Dos, no seis: las otras
     * cuatro siguen pendientes y ninguna ficha las anuncia.
     */
    expect(existsSync('src/data/muestras.json')).toBe(true);
    expect(muestras.map((m) => m.toolSlug).sort()).toEqual(['ideogram', 'recraft']);
  });

  it('cada una conserva la huella de su original', () => {
    /*
     * Es lo que convierte «conservamos el original» en algo comprobable: si
     * alguien discute una muestra, este número dice si el fichero es el que
     * salió del generador.
     */
    for (const muestra of muestras) {
      expect(muestra.asset.originalSha256, muestra.toolSlug).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it('el original conserva su formato, no se recodifica', () => {
    /*
     * Recraft entregó PNG y Ideogram JPEG. Archivar los dos como PNG «para
     * uniformar» perdería información en uno y la inventaría en el otro.
     */
    const porSlug = new Map(muestras.map((m) => [m.toolSlug, m]));
    expect(porSlug.get('recraft')?.asset.original).toMatch(/\.png$/);
    expect(porSlug.get('ideogram')?.asset.original).toMatch(/\.jpg$/);
  });

  it('las dos comparten el mismo prompt literal', () => {
    /*
     * El interés editorial está justo ahí: mismo texto, dos lecturas muy
     * distintas de la escena. Si los prompts divergen, la comparación deja de
     * decir nada.
     */
    const prompts = new Set(muestras.map((m) => m.prompt));
    expect(prompts.size, 'las muestras del piloto no comparten prompt').toBe(1);
  });

  it('ninguna ficha se anuncia como probada sin tener muestra', () => {
    for (const tool of tools) {
      expect(estaProbada(tool.slug)).toBe(muestrasDe(tool.slug).length > 0);
    }
  });

  it('el procedimiento manual está escrito', () => {
    /*
     * Si el paso que falta lo tiene que dar una persona, lo mínimo es que esté
     * escrito: qué prompt, qué anotar, qué no tocar y qué hacer si la prueba
     * contradice la ficha.
     */
    expect(existsSync('docs/muestras.md')).toBe(true);
    const guia = readFileSync('docs/muestras.md', 'utf8');
    for (const seccion of ['El prompt', 'La ejecución', 'La descarga', 'La ingesta']) {
      expect(guia, `falta «${seccion}» en la guía`).toContain(seccion);
    }
    expect(guia).toMatch(/no se crean varias/i);
    expect(guia).toMatch(/no se saltan captcha/i);
  });
});

describe('cada muestra que exista tendrá que cumplir esto', () => {
  it('su herramienta existe y su activo está en disco', () => {
    for (const muestra of muestras) {
      expect(tools.some((t) => t.slug === muestra.toolSlug), muestra.toolSlug).toBe(true);
      expect(existsSync(`public${muestra.asset.original}`), muestra.asset.original).toBe(true);
      expect(existsSync(`public${muestra.asset.web}`), muestra.asset.web).toBe(true);
    }
  });

  it('lo servido pesa mucho menos que lo archivado', () => {
    for (const muestra of muestras) {
      expect(muestra.asset.webBytes, muestra.toolSlug).toBeLessThan(muestra.asset.originalBytes);
      expect(muestra.asset.webBytes, `${muestra.toolSlug} sirve demasiado peso`).toBeLessThan(400 * 1024);
    }
  });

  it('el prompt se publica entero, no resumido', () => {
    for (const muestra of muestras) {
      expect(muestra.prompt.length, muestra.toolSlug).toBeGreaterThan(40);
      expect(muestra.prompt, muestra.toolSlug).not.toMatch(/\[…\]|\.\.\.$/);
    }
  });
});
