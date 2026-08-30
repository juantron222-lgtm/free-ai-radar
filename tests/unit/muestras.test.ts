import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { getAllTools } from '@lib/data/catalog';
import { estaProbada, muestrasDe, todasLasMuestras } from '@lib/data/muestras';
import { capturasDe, todasLasCapturas } from '@lib/data/capturas';
import {
  AVISO_MUESTRA,
  AVISO_OBSERVADO,
  CapturaDeInterfaz,
  CosteObservado,
  EditorialSample,
  OBSERVACIONES,
  OBSERVACION_LABEL,
  ORIGEN_COSTE_LABEL,
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
  creditsSpent: { origen: 'mostrado' as const, texto: '1 crédito lento' },
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
  auxiliar: [],
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

describe('las muestras reales del piloto', () => {
  it('están ingeridas y son las que trajo la persona que las ejecutó', () => {
    /*
     * Generar exige una cuenta en cada servicio, así que aquí sólo se ingiere
     * lo que llega. Las que faltan no se anuncian en ninguna parte: el módulo
     * de ficha desaparece entero cuando no hay muestra.
     */
    expect(existsSync('src/data/muestras.json')).toBe(true);
    expect(muestras.map((m) => m.toolSlug).sort()).toEqual(['ideogram', 'krea', 'leonardo-ai', 'recraft']);
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
    expect(porSlug.get('leonardo-ai')?.asset.original).toMatch(/\.jpg$/);
    expect(porSlug.get('krea')?.asset.original).toMatch(/\.png$/);
  });

  it('todas comparten el mismo prompt literal', () => {
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

describe('la captura de interfaz es evidencia auxiliar, no una condición', () => {
  const ideogram = muestras.find((m) => m.toolSlug === 'ideogram');

  it('está archivada con su huella y sus dimensiones', () => {
    const aux = ideogram?.auxiliar[0];
    expect(aux, 'falta la captura de créditos de Ideogram').toBeDefined();
    expect(aux!.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(aux!.bytes).toBeGreaterThan(0);
    expect(existsSync(`public${aux!.ruta}`)).toBe(true);
  });

  it('se sirve desde nuestro dominio, como todo lo demás', () => {
    for (const muestra of muestras) {
      for (const aux of muestra.auxiliar) {
        expect(aux.ruta, muestra.toolSlug).toMatch(/^\/muestras\/auxiliar\//);
      }
    }
  });

  it('transcribe la frase literal sin interpretarla', () => {
    expect(ideogram?.auxiliar[0]?.textoVisible).toBe(
      '0 / 12 credits left until your weekly limit resets in 3 days'
    );
  });

  it('y dice hasta dónde llega: mostraba, no «el plan es»', () => {
    /*
     * El riesgo entero de una captura: que se lea como una propiedad
     * permanente del producto. Doce créditos en un contador se convierten solos
     * en «la cuota es doce»; un aviso de que algo es de pago, en «siempre lo
     * fue». `respalda` tiene que acotarlo con palabras, y aquí se comprueba que
     * lo hace de las dos maneras que importan.
     *
     * Primero, el verbo: lo que se cuenta es lo que la pantalla hacía, en
     * pasado. Y después el anclaje: cuándo. Sin fecha ni sesión, una lectura de
     * un instante queda escrita como una condición indefinida, que es
     * exactamente el salto que esta fase existe para impedir.
     */
    const observar = /mostraba|mostró|marcaba|enseñaba|respondió|figuraba|tarifaba|publicaba|declaraba/i;
    const cuando = /durante nuestra prueba|ese día|el día de la prueba|en ese momento|esa sesión|al intentarlo/i;

    for (const c of [...todasLasCapturas(), ...muestras.flatMap((m) => m.auxiliar)]) {
      expect(c.respalda, `${c.ruta} no dice qué hacía la pantalla`).toMatch(observar);
      expect(c.respalda, `${c.ruta} no ancla la lectura en el tiempo`).toMatch(cuando);
    }
  });

  it('no ha tocado el dato documental del catálogo', () => {
    /*
     * La interfaz mostró 12 créditos semanales y la ficha documentaba 10. La
     * captura registró lo primero sin reescribir lo segundo, que era el punto.
     *
     * Después ocurrió lo tercero: Ideogram dejó de publicar la cifra —su tabla
     * dice ahora «Weekly for eligible accounts»— y el 10 se retiró por eso, no
     * por nuestra captura. Lo que esta prueba vigila sigue siendo lo mismo: que
     * el 12 que vimos no haya ascendido a cantidad publicada. La ficha no
     * publica ninguna, que es la verdad.
     */
    const ficha = tools.find((t) => t.slug === 'ideogram')!;
    expect(ficha.freePlan.creditsAmount, 'la ficha no debe publicar una cantidad').toBeUndefined();
    expect(JSON.stringify(ficha.freePlan.limits), 'el 12 observado no puede colarse como cuota').not.toMatch(
      /12 créditos/
    );
  });
});

describe('la metodología de la marca de agua se describe como lo que es', () => {
  it('cada nota dice que se inspeccionó el archivo completo', () => {
    for (const muestra of muestras) {
      if (muestra.watermarkObserved !== 'no_aparecio') continue;
      expect(muestra.notes, `${muestra.toolSlug} no explica cómo se comprobó`).toMatch(
        /archivo original completo/i
      );
    }
  });

  it('y ninguna la presenta como una propiedad del plan', () => {
    for (const muestra of muestras) {
      expect(muestra.notes ?? '', muestra.toolSlug).not.toMatch(
        /el plan (gratuito )?no (pone|añade) marca/i
      );
    }
  });
});

describe('una cifra de coste dice de dónde sale', () => {
  /*
   * El error que esto impide es pequeño y muy caro: Krea no enseña el cargo de
   * una generación, publica una tarifa por modelo y deja que restes. La resta
   * la hicimos nosotros. Escrita igual que una cifra que el producto mostró,
   * pasaría por suya; y si la tarifa que usamos no era la que se aplicó, sería
   * un dato inventado con aspecto de dato observado.
   */
  it('una cifra que mostró la interfaz vale sola', () => {
    expect(CosteObservado.safeParse({ origen: 'mostrado', texto: '1 crédito lento' }).success).toBe(true);
  });

  it('una cifra deducida por nosotros no vale sin decir de qué', () => {
    expect(CosteObservado.safeParse({ origen: 'inferido', texto: '2 créditos' }).success).toBe(false);
    expect(
      CosteObservado.safeParse({
        origen: 'inferido',
        texto: '2 créditos',
        base: 'El selector tarifa ese modelo en 2 y la generación llegó con su etiqueta.',
      }).success
    ).toBe(true);
  });

  it('y no hay tercera vía: o se vio o se dedujo', () => {
    expect(CosteObservado.safeParse({ origen: 'aproximado', texto: '2 créditos' }).success).toBe(false);
    expect(CosteObservado.safeParse('2 créditos').success).toBe(false);
  });

  it('las dos procedencias se llaman distinto en público', () => {
    expect(ORIGEN_COSTE_LABEL.mostrado).not.toBe(ORIGEN_COSTE_LABEL.inferido);
    expect(ORIGEN_COSTE_LABEL.inferido).toMatch(/deducid/i);
  });

  it('ninguna muestra archiva una deducción sin su base', () => {
    for (const m of muestras) {
      if (m.creditsSpent?.origen !== 'inferido') continue;
      expect(m.creditsSpent.base.length, m.toolSlug).toBeGreaterThan(20);
    }
  });
});

describe('una captura puede existir sin muestra detrás', () => {
  /*
   * Clipdrop es el caso que obligó a esto: responde al intento de generar con
   * un aviso de que la generación es exclusiva de Pro. No hay generación que
   * archivar —justamente por eso— y esa pantalla es la única prueba que queda,
   * porque el HTML de la página no la contiene.
   */
  const capturas = todasLasCapturas();

  it('todas pasan el esquema y apuntan a una herramienta del catálogo', () => {
    const slugs = new Set(tools.map((t) => t.slug));
    for (const c of capturas) {
      expect(CapturaDeInterfaz.safeParse(c).success, c.id).toBe(true);
      expect(slugs.has(c.toolSlug), c.id).toBe(true);
    }
  });

  it('cada una está en disco, con su huella y su tamaño', () => {
    for (const c of capturas) {
      expect(existsSync(`public${c.ruta}`), c.id).toBe(true);
      expect(c.sha256, c.id).toMatch(/^[a-f0-9]{64}$/);
      expect(c.bytes, c.id).toBe(readFileSync(`public${c.ruta}`).length);
    }
  });

  it('dice dónde se tomó, para poder volver a mirarlo', () => {
    for (const c of capturas) {
      expect(c.url, c.id).toMatch(/^https:\/\//);
    }
  });

  it('Clipdrop la tiene y no tiene muestra: es el caso entero', () => {
    expect(capturasDe('clipdrop').length).toBeGreaterThan(0);
    expect(muestrasDe('clipdrop')).toHaveLength(0);
  });
});

describe('un recorte se declara', () => {
  /*
   * Una captura de navegador arrastra el correo de la cuenta, el nombre de
   * quien hizo la prueba y su barra de marcadores. Nada de eso es la prueba y
   * ninguna de esas cosas debería publicarse, así que se recorta. Pero
   * recortar también sirve para quitar lo que estorba: por eso lo que se
   * archiva tiene que decir qué región quedó y de qué pantalla salió.
   */
  const todas = [...todasLasCapturas(), ...muestras.flatMap((m) => m.auxiliar)];

  it('cada recorte dice qué región queda, de qué pantalla y por qué', () => {
    for (const c of todas) {
      if (!c.recorte) continue;
      expect(c.recorte, c.ruta).toMatch(/\d+×\d+/);
      expect(c.recorte.length, c.ruta).toBeGreaterThan(60);
    }
  });

  it('y las dimensiones archivadas son las del recorte, no las de la pantalla', () => {
    for (const c of todas) {
      if (!c.recorte) continue;
      const [, ancho, alto] = c.recorte.match(/Recorte de (\d+)×(\d+)/) ?? [];
      expect(Number(ancho), c.ruta).toBe(c.dimensiones.width);
      expect(Number(alto), c.ruta).toBe(c.dimensiones.height);
    }
  });
});
