import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { isThirdPartyNoise, seedConsent, trackThirdPartyFailures } from './helpers';

/**
 * Public navigation, search, filtering and the tool page.
 *
 * These run against the dev server with no external credentials, so they cover
 * exactly what a first-time visitor sees.
 */

test.describe('portada', () => {
  test('carga y comunica la propuesta de valor', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/gratis de verdad/i);
    await expect(page).toHaveTitle(/Free AI Radar/);
  });

  test('el canónico apunta al dominio real, nunca al de preview', async ({ page }) => {
    await page.goto('/');
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical).toContain('freeairadar.com');
    expect(canonical).not.toContain('vercel.app');
  });

  test('emite datos estructurados válidos', async ({ page }) => {
    await page.goto('/');
    const jsonLd = await page.locator('script[type="application/ld+json"]').first().textContent();
    const parsed = JSON.parse(jsonLd ?? '{}');
    expect(parsed['@context']).toBe('https://schema.org');
    expect(Array.isArray(parsed['@graph'])).toBe(true);
  });

  test('no hay errores de consola', async ({ page, baseURL }) => {
    const errors: string[] = [];
    // Se atan antes de navegar: si se atan después, el primer error ya pasó.
    const fallosDeTerceros = trackThirdPartyFailures(page, baseURL ?? '');

    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      const text = message.text();
      // Guiones de terceros que fallan fuera de producción. Ver el ayudante:
      // filtrado, nunca silenciado — cualquier otro error rompe la prueba.
      if (isThirdPartyNoise(text, fallosDeTerceros)) return;
      errors.push(text);
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(errors).toEqual([]);
  });
});

test.describe('consentimiento', () => {
  test('aparece antes de cualquier decisión y permite rechazar con un clic', async ({ page }) => {
    await page.goto('/');
    /*
     * Una región, no un diálogo.
     *
     * Dejó de ser modal a propósito: pedía permiso de algo que aún no ocurre y
     * a cambio tapaba la primera pantalla entera. Lo que sigue exigiéndose es
     * lo que de verdad importaba —que aparezca antes de cualquier decisión y
     * que rechazar cueste un clic, igual que aceptar.
     */
    const dialog = page.getByRole('region', { name: /cookies/i });
    await expect(dialog).toBeVisible();

    // Rechazar debe ser tan accesible como aceptar.
    const accept = dialog.getByRole('button', { name: 'Aceptar todo' });
    const reject = dialog.getByRole('button', { name: 'Rechazar todo' });
    await expect(accept).toBeVisible();
    await expect(reject).toBeVisible();

    await reject.click();
    await expect(dialog).toBeHidden();
  });

  test('la decisión se recuerda entre visitas', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Rechazar todo' }).click();
    await page.reload();
    await expect(page.getByRole('region', { name: /cookies/i })).toBeHidden();
  });
});

test.describe('descubrimiento', () => {
  test.beforeEach(async ({ page }) => {
    // The consent decision is a precondition here, not the thing under test —
    // it gets its own suite above. Seeding it keeps these tests focused and
    // avoids re-driving a modal dialog dozens of times.
    await seedConsent(page);
    await page.goto('/herramientas');
  });

  test('lista herramientas', async ({ page }) => {
    await expect(page.locator('[data-result-item]:visible').first()).toBeVisible();
    const count = await page.locator('[data-result-item]:visible').count();
    expect(count).toBeGreaterThan(0);
  });

  /**
   * The filter inputs are real checkboxes styled as chips, so the input itself
   * is `sr-only` and the visible target is its wrapping label — which is what a
   * reader actually clicks. Driving the label keeps the test honest about the
   * real interaction.
   */
  const filterChip = (page: Page, label: string) =>
    page.locator('.filter-chip').filter({ hasText: new RegExp(`^${label}`) }).first();

  /**
   * Comprueba el mecanismo, no una coincidencia del catálogo.
   *
   * La versión anterior exigía que «sin tarjeta» y «uso comercial» dejaran
   * algún resultado. Trece fichas cumplían las dos hasta que la auditoría
   * devolvió a `unverified` todo lo que nadie había comprobado, y la
   * intersección se quedó en cero: la prueba se puso roja por un cambio de
   * datos correcto.
   *
   * Una intersección vacía es un estado legítimo y la aplicación lo trata —
   * dice qué filtro es el responsable—. Así que eso es lo que se comprueba:
   * que los filtros se combinen, viajen en la URL, no amplíen nunca el
   * resultado, y que si lo dejan vacío el explorador lo explique.
   */
  test('los filtros se combinan y quedan en la URL', async ({ page }) => {
    const visible = () => page.locator('[data-result-item]:visible').count();
    const before = await visible();

    await filterChip(page, 'Sin tarjeta').click();
    await expect(page).toHaveURL(/nocard=1/);
    const conUno = await visible();
    expect(conUno).toBeLessThanOrEqual(before);

    await filterChip(page, 'Uso comercial').click();
    await expect(page).toHaveURL(/nocard=1/);
    await expect(page).toHaveURL(/comm=1/);

    const conDos = await visible();
    expect(conDos, 'añadir un requisito nunca puede devolver más resultados').toBeLessThanOrEqual(
      conUno
    );

    if (conDos === 0) {
      // Callejón sin salida, pero con salida: el explorador nombra al culpable.
      await expect(page.locator('#empty-state')).toBeVisible();
      await expect(page.locator('#empty-reason')).not.toBeEmpty();
    }
  });

  test('los filtros son operables por teclado', async ({ page }) => {
    const checkbox = page.getByRole('checkbox', { name: 'Sin tarjeta' });
    await checkbox.focus();
    await page.keyboard.press('Space');
    await expect(checkbox).toBeChecked();
    await expect(page).toHaveURL(/nocard=1/);
  });

  test('una URL con filtros se puede compartir y reproduce el estado', async ({ page }) => {
    await page.goto('/herramientas?oss=1');
    // "Open source" exists both as a hard requirement and as a free-tier model,
    // so the assertion has to name which group it means.
    const requirement = page
      .getByRole('group', { name: 'Requisitos' })
      .getByRole('checkbox', { name: 'Open source' });
    await expect(requirement).toBeChecked();
    expect(await page.locator('[data-result-item]:visible').count()).toBeGreaterThan(0);
  });

  test('la vista filtrada no compite con su canónico', async ({ page }) => {
    await page.goto('/herramientas?nocard=1');

    // 1. El canónico consolida en la URL limpia.
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical).toBe('https://www.freeairadar.com/herramientas');

    // 2. El explorador marca noindex en cuanto hay filtros (para los
    //    rastreadores que ejecutan JavaScript). robots.txt cubre al resto.
    await expect
      .poll(() => page.locator('meta[name="robots"]').getAttribute('content'))
      .toContain('noindex');
  });

  test('la vista sin filtrar es indexable', async ({ page }) => {
    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots).toContain('index');
    expect(robots).not.toContain('noindex');
  });

  test('la búsqueda encuentra y sugiere', async ({ page }) => {
    const search = page.getByRole('combobox', { name: /buscar/i });
    await search.fill('ollama');
    await expect(page.getByRole('listbox')).toBeVisible();
    await expect(page.getByRole('option').first()).toContainText(/ollama/i);
  });

  test('«/» enfoca el buscador', async ({ page }) => {
    await page.locator('body').press('/');
    await expect(page.getByRole('combobox', { name: /buscar/i })).toBeFocused();
  });

  test('el estado vacío explica qué filtro lo provoca', async ({ page }) => {
    await page.goto('/herramientas?q=zzzzqqqxxx');
    await expect(page.locator('#empty-state')).toBeVisible();
    await expect(page.locator('#empty-reason')).not.toBeEmpty();
  });

  test('se pueden quitar todos los filtros', async ({ page }) => {
    await page.goto('/herramientas?nocard=1&oss=1');
    await page.getByRole('button', { name: 'Quitar filtros' }).click();
    await expect(page).toHaveURL(/\/herramientas$/);
  });
});

test.describe('ficha de herramienta', () => {
  test('muestra el análisis completo', async ({ page }) => {
    await seedConsent(page);
    await page.goto('/herramientas');

    await page.locator('[data-result-item]:visible .tool-card-link').first().click();
    // `domcontentloaded`: ver la nota en account.spec.ts sobre el evento `load`.
    await page.waitForURL(/\/herramientas\/[a-z0-9-]+$/, { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Qué te dan gratis' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Fuentes' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Para quién sirve/ })).toBeVisible();
    await expect(page.locator('#reportar')).toBeVisible();

    /*
     * Aquí había una comprobación de «Por qué 89 y no otra cifra», la sección
     * que justificaba la nota única. La nota se retiró —una media ponderada
     * contesta «¿cuál es mejor?», y esa pregunta no tiene respuesta sin saber
     * para quién—, así que la comprobación llevaba dos commits en rojo.
     *
     * En su lugar se vigila lo contrario, que es lo que ahora hay que sostener:
     * que ninguna ficha vuelva a publicar un número sobre cien. Es la clase de
     * cosa que reaparece sola cuando alguien recupera un componente viejo.
     */
    await expect(page.locator('body')).not.toContainText(/\b\d{1,3}\s*\/\s*100\b/);
    await expect(page.locator('[data-score-badge], .score-badge')).toHaveCount(0);
  });

  test('el enlace saliente se abre en pestaña nueva con rel seguro', async ({ page }) => {
    await page.goto('/herramientas/ollama');
    const link = page.locator('[data-outbound]').first();
    await expect(link).toHaveAttribute('target', '_blank');
    const rel = await link.getAttribute('rel');
    expect(rel).toContain('noopener');
  });

  test('no publica datos estructurados de valoración', async ({ page }) => {
    await page.goto('/herramientas/ollama');
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const combined = blocks.join(' ');
    expect(combined).not.toContain('aggregateRating');
    expect(combined).not.toContain('ratingValue');
  });
});

test.describe('comparador', () => {
  test('compara dos herramientas desde una URL compartible', async ({ page }) => {
    await page.goto('/comparar?t=ollama,lm-studio');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/vs/i);
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByRole('rowheader', { name: '¿Pide tarjeta?' })).toBeVisible();
  });

  test('el comparador vacío no es indexable', async ({ page }) => {
    await page.goto('/comparar');
    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots).toContain('noindex');
  });

  test('una comparación con contenido sí es indexable', async ({ page }) => {
    await page.goto('/comparar?t=ollama,lm-studio');
    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots).not.toContain('noindex');
  });

  test('avisa de las herramientas que no existen', async ({ page }) => {
    await page.goto('/comparar?t=ollama,no-existe-esto');
    await expect(page.getByText(/No tenemos ficha de/)).toBeVisible();
  });
});

test.describe('la tarjeta a 320 px', () => {
  test.use({ viewport: { width: 320, height: 720 } });

  /**
   * Un nombre no se parte por comodidad del reparto.
   *
   * `.tool-card-name` llevaba `overflow-wrap: anywhere` y `.tool-card-titles`
   * un `min-width: 0`, así que la insignia de acceso —que reclama un ancho
   * mínimo grande— dejaba la columna del nombre en 23 px: «Lov / able», «Bolt.
   * / new», «v0 by Verce / l». Y no era cosa de móviles: pasaba a 1280 px.
   *
   * La comprobación es geométrica y no depende del catálogo: un nombre no
   * puede ocupar más líneas que palabras tiene. «AudioCraft (MusicGen)» puede
   * caer en dos; «Lovable» en una y sólo una.
   */
  test('ningún nombre se parte a mitad de palabra', async ({ page }) => {
    await page.goto('/herramientas');
    await expect(page.locator('.tool-card-name').first()).toBeVisible();

    const partidos = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.tool-card-name'))
        .map((el) => {
          const alto = el.getBoundingClientRect().height;
          const linea = parseFloat(getComputedStyle(el).lineHeight);
          const texto = (el.textContent ?? '').trim();
          return { texto, lineas: Math.round(alto / linea), palabras: texto.split(/\s+/).length };
        })
        .filter((n) => n.lineas > n.palabras)
        .map((n) => `${n.texto}: ${n.lineas} líneas para ${n.palabras} palabra(s)`)
    );

    expect(partidos).toEqual([]);
  });

  test('y ninguna tarjeta desborda su propia caja', async ({ page }) => {
    /*
     * La otra mitad del arreglo: `anywhere` estaba ahí para que un nombre
     * larguísimo no desbordase. `break-word` conserva esa protección, y esto
     * lo comprueba en el ancho donde importaba.
     */
    await page.goto('/herramientas');
    await expect(page.locator('.tool-card').first()).toBeVisible();

    const desbordes = await page.evaluate(
      () =>
        Array.from(document.querySelectorAll('.tool-card')).filter(
          (el) => el.scrollWidth > el.clientWidth + 1
        ).length
    );
    expect(desbordes).toBe(0);

    const arrastra = await page.evaluate(() => {
      window.scrollTo(3000, window.scrollY);
      const movido = window.scrollX > 0;
      window.scrollTo(0, window.scrollY);
      return movido;
    });
    expect(arrastra).toBe(false);
  });
});

test.describe('los logos', () => {
  test('ninguna imagen de logo se pide a un tercero', async ({ page }) => {
    /*
     * El atajo tentador —un servicio de favicons por dominio— le contaría a un
     * tercero quién mira qué en cada carga. Esto lo comprueba mirando la red,
     * no el código: si alguien lo reintroduce por cualquier vía, se ve aquí.
     */
    const ajenas: string[] = [];
    page.on('request', (r) => {
      const url = new URL(r.url());
      if (r.resourceType() !== 'image') return;
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return;
      ajenas.push(r.url());
    });

    await page.goto('/');
    await page.goto('/codigo');
    expect(ajenas).toEqual([]);
  });

  test('cada logo reserva su hueco antes de cargar', async ({ page }) => {
    await page.goto('/codigo');
    const sinCaja = await page.evaluate(() =>
      Array.from(document.querySelectorAll('img.tool-logo')).filter(
        (i) => !i.getAttribute('width') || !i.getAttribute('height')
      ).length
    );
    expect(sinCaja).toBe(0);
  });

  test('y no se deforma: la caja manda, la proporción se conserva', async ({ page }) => {
    await page.goto('/codigo');
    const malos = await page.evaluate(() =>
      Array.from(document.querySelectorAll('img.tool-logo'))
        .filter((i) => getComputedStyle(i).objectFit !== 'contain')
        .map((i) => (i as HTMLImageElement).src)
    );
    expect(malos).toEqual([]);
  });

  test('un logo es decorativo: el lector de pantalla no dice el nombre dos veces', async ({ page }) => {
    await page.goto('/codigo');
    const conNombre = await page.evaluate(() =>
      Array.from(document.querySelectorAll('img.tool-logo'))
        .filter((i) => (i.getAttribute('alt') ?? '') !== '')
        .map((i) => i.getAttribute('alt'))
    );
    expect(conNombre).toEqual([]);

    // Y el monograma tampoco: es `aria-hidden`, sus iniciales no se leen.
    const monogramasVisibles = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.tool-logo-mono')).filter(
        (e) => e.getAttribute('aria-hidden') !== 'true'
      ).length
    );
    expect(monogramasVisibles).toBe(0);
  });

  test('si el fichero no existe, la tarjeta sigue entera', async ({ page }) => {
    /*
     * No se puede borrar un fichero desde aquí, así que se bloquea la petición:
     * para el navegador es exactamente lo mismo que un activo que ya no está.
     */
    await page.route('**/logos/**', (route) => route.abort());
    await page.goto('/codigo');

    const tarjetas = page.locator('[data-slug]');
    await expect(tarjetas.first()).toBeVisible();
    expect(await tarjetas.count()).toBeGreaterThan(3);

    const desbordes = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.ic-card, .tool-card')).filter(
        (el) => el.scrollWidth > el.clientWidth + 1
      ).length
    );
    expect(desbordes).toBe(0);
  });

  test('conviven logos reales y monogramas sin que se note el remiendo', async ({ page }) => {
    await page.goto('/codigo');
    const reales = await page.locator('img.tool-logo').count();
    const monogramas = await page.locator('.tool-logo-mono').count();
    expect(reales).toBeGreaterThan(0);
    expect(monogramas).toBeGreaterThan(0);

    /*
     * La misma caja para los dos dentro del mismo contexto: la mezcla no
     * cambia el ritmo de la rejilla. Se mira sólo la cabecera de las tarjetas
     * grandes, porque las menciones usan a propósito una caja menor.
     */
    const cajas = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.ic-head > .tool-logo')).map((e) => {
        const r = e.getBoundingClientRect();
        return `${Math.round(r.width)}x${Math.round(r.height)}`;
      })
    );
    expect(cajas.length).toBeGreaterThan(3);
    expect(new Set(cajas).size, `cajas distintas: ${[...new Set(cajas)].join(', ')}`).toBe(1);
  });
});

/**
 * Qué hay probado ahora mismo, leído del registro y no recordado.
 *
 * Las muestras las genera una persona y entran de una en una, así que una
 * lista escrita a mano en un test caduca el día siguiente a escribirla. Estas
 * dos funciones leen los mismos ficheros que lee el sitio.
 */
const registroDeMuestras = (): { toolSlug: string }[] =>
  JSON.parse(readFileSync('src/data/muestras.json', 'utf8'));

const catalogoDeImagen = (): { slug: string; categorySlug: string; secondaryCategories: string[] }[] =>
  JSON.parse(readFileSync('src/data/generated/tools.json', 'utf8')).filter(
    (t: { categorySlug: string; secondaryCategories: string[] }) =>
      t.categorySlug === 'imagen' || t.secondaryCategories?.includes('imagen')
  );

/** Los slugs de imagen con muestra, ordenados como los devuelve la página. */
const probadasDeImagen = (): string[] => {
  const enImagen = new Set(catalogoDeImagen().map((t) => t.slug));
  return [...new Set(registroDeMuestras().map((m) => m.toolSlug))].filter((s) => enImagen.has(s)).sort();
};

/** Una ficha de imagen que no tiene muestra, para comprobar que el módulo no aparece. */
const deImagenSinMuestra = (): string => {
  const probadas = new Set(registroDeMuestras().map((m) => m.toolSlug));
  const candidata = catalogoDeImagen()
    .map((t) => t.slug)
    .sort()
    .find((slug) => !probadas.has(slug));
  if (!candidata) throw new Error('No queda ninguna ficha de imagen sin muestra que comprobar.');
  return candidata;
};

test.describe('las muestras editoriales', () => {
  test('la ficha probada separa lo documentado de lo observado', async ({ page }) => {
    /*
     * La línea que esta fase existe para trazar, comprobada donde se lee: las
     * dos columnas en la misma fila, con encabezados distintos, y la
     * observación acotada a la prueba.
     */
    await page.goto('/herramientas/recraft');
    const muestra = page.locator('.muestra');
    await expect(muestra).toBeVisible();
    await expect(muestra.getByRole('heading', { name: 'Probado por Free AI Radar' })).toBeVisible();

    const tabla = muestra.locator('.muestra-tabla');
    await expect(tabla.getByRole('columnheader', { name: 'Documentación oficial' })).toBeVisible();
    await expect(tabla.getByRole('columnheader', { name: 'En nuestra prueba' })).toBeVisible();
    await expect(tabla.locator('.muestra-observado').first()).toContainText('En nuestra prueba');
  });

  test('nunca escribe una observación como si fuera la condición del plan', async ({ page }) => {
    await page.goto('/herramientas/recraft');
    const observadas = await page.locator('.muestra-observado').allInnerTexts();
    expect(observadas.length).toBeGreaterThan(0);
    for (const texto of observadas) {
      expect(texto).toMatch(/en nuestra prueba|no pudimos|no aplica/i);
    }
  });

  test('publica el prompt entero y enlaza el original sin retocar', async ({ page }) => {
    await page.goto('/herramientas/ideogram');
    await expect(page.locator('.muestra-cita')).toContainText('luciérnagas');

    const enlace = page.locator('.muestra-enlace');
    await expect(enlace).toHaveAttribute('href', /^\/muestras\/originales\//);
  });

  test('la imagen reserva su hueco y no la sirve un tercero', async ({ page }) => {
    await page.goto('/herramientas/recraft');
    const img = page.locator('.muestra-imagen');
    await expect(img).toHaveAttribute('width', /\d+/);
    await expect(img).toHaveAttribute('height', /\d+/);
    await expect(img).toHaveAttribute('src', /^\/muestras\/web\//);
  });

  test('una ficha sin muestra no anuncia ninguna prueba', async ({ page }) => {
    /*
     * La herramienta de ejemplo sale del registro, no de una constante.
     *
     * Este test estuvo clavado en Krea y dejó de comprobar nada el día que Krea
     * tuvo muestra: se puso rojo por tener razón, y arreglarlo a mano habría
     * sido cuestión de cambiar un slug por otro hasta la próxima. Ahora busca
     * él una ficha de imagen sin muestra.
     */
    const sinMuestra = deImagenSinMuestra();
    await page.goto(`/herramientas/${sinMuestra}`);
    await expect(page.locator('.muestra')).toHaveCount(0);
    await expect(page.getByText('Probado por Free AI Radar')).toHaveCount(0);
  });

  test('en la vertical sólo llevan la marca las probadas', async ({ page }) => {
    /*
     * Se cuentan herramientas, no marcas: una misma ficha puede aparecer en
     * varios bloques de intención y lleva su marca en cada aparición, que es lo
     * correcto. Lo que no puede haber es una marca sobre algo sin muestra.
     */
    await page.goto('/imagen');
    const marcadas = await page.evaluate(() =>
      [
        ...new Set(
          Array.from(document.querySelectorAll('.ic-probada'))
            .map((e) => e.closest('[data-slug]')?.getAttribute('data-slug'))
            .filter(Boolean)
        ),
      ].sort()
    );
    expect(marcadas).toEqual(probadasDeImagen());
  });
});

test.describe('SEO técnico', () => {
  test('robots.txt apunta al sitemap del dominio correcto', async ({ request }) => {
    const response = await request.get('/robots.txt');
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain('Sitemap: https://www.freeairadar.com/sitemap.xml');
    expect(body).not.toContain('vercel.app');
    expect(body).toContain('Disallow: /admin');
    expect(body).toContain('Disallow: /cuenta');
  });

  test('el sitemap es XML válido y no incluye rutas privadas', async ({ request }) => {
    const response = await request.get('/sitemap.xml');
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain('<urlset');
    expect(body).toContain('/herramientas');
    expect(body).not.toContain('/admin');
    expect(body).not.toContain('/cuenta/');
  });

  test('el RSS es válido', async ({ request }) => {
    const response = await request.get('/rss.xml');
    expect(response.status()).toBe(200);
    const body = await response.text();
    expect(body).toContain('<rss');
    expect(body).toContain('<channel>');
  });

  test('el manifest de la PWA es válido', async ({ request }) => {
    const response = await request.get('/manifest.webmanifest');
    expect(response.status()).toBe(200);
    const manifest = await response.json();
    expect(manifest.name).toBeTruthy();
    expect(manifest.start_url).toBeTruthy();
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
    expect(manifest.icons.some((icon: { purpose?: string }) => icon.purpose === 'maskable')).toBe(
      true
    );
  });

  test('la 404 es útil, no un callejón sin salida', async ({ page }) => {
    const response = await page.goto('/una-ruta-que-no-existe');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('searchbox')).toBeVisible();
  });
});

test.describe('accesibilidad', () => {
  /**
   * The skip link, asserted per engine.
   *
   * WebKit does not move Tab focus to links at all — it only reaches form
   * controls unless the user turns on macOS "Full Keyboard Access". Measured
   * on this page: Chromium and Firefox tab to `a.skip-link` first, WebKit goes
   * straight to `button.theme-toggle`. That is a browser default, not a defect
   * here, so asserting Tab order on WebKit would be testing Safari rather than
   * the site.
   *
   * What must hold on every engine is that the link is first in DOM order,
   * can take focus, and actually moves the reader to the content.
   */
  test('hay un enlace para saltar al contenido', async ({ page }, testInfo) => {
    // The consent dialog is modal and traps focus by design, so the decision
    // has to exist before the page's own tab order can be exercised.
    await seedConsent(page);
    await page.goto('/');

    const skip = page.getByRole('link', { name: 'Saltar al contenido' });

    // El Tab va primero, sobre la carga limpia. `blur()` no sirve para
    // reiniciarlo: Chromium conserva el punto de partida de la navegación
    // secuencial en el último elemento enfocado, así que el siguiente Tab
    // continuaría desde ahí en vez de empezar por el principio.
    const tabsToLinks = !['webkit', 'mobile-safari'].includes(testInfo.project.name);
    if (tabsToLinks) {
      await page.keyboard.press('Tab');
      await expect(skip).toBeFocused();
    }

    // Primero en el orden del DOM, en todos los motores.
    const isFirstFocusable = await page.evaluate(() => {
      const focusable = document.querySelectorAll<HTMLElement>(
        'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      return focusable[0]?.classList.contains('skip-link') ?? false;
    });
    expect(isFirstFocusable).toBe(true);

    // Recibe el foco y lleva al contenido, en todos los motores.
    await skip.focus();
    await expect(skip).toBeFocused();
    await expect(skip).toHaveAttribute('href', '#main');
  });

  test('el tema se puede cambiar y persiste', async ({ page }) => {
    await seedConsent(page);
    await page.goto('/');

    const toggle = page.locator('#theme-toggle');
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('cada página tiene exactamente un h1', async ({ page }) => {
    for (const path of ['/', '/herramientas', '/categorias', '/metodologia', '/pro']) {
      await page.goto(path);
      /*
       * `toHaveCount` en vez de `expect(await …count())`.
       *
       * La segunda forma toma una única muestra en el instante en que se
       * ejecuta, y con `prefetchAll` activado el navegador puede estar todavía
       * intercambiando documentos: bajo carga, Firefox devolvía cero. La
       * afirmación web-first reintenta hasta que el DOM se asienta, que es
       * esperar a una condición concreta y no tapar nada — si de verdad
       * hubiera dos `h1`, seguiría fallando igual.
       */
      await expect(page.locator('h1'), path).toHaveCount(1);
    }
  });
});

test.describe('rutas privadas', () => {
  test('la cuenta redirige al login', async ({ page }) => {
    await page.goto('/cuenta');
    await expect(page).toHaveURL(/\/cuenta\/entrar/);
  });

  test('el admin no es accesible sin sesión', async ({ page }) => {
    await page.goto('/admin');
    // Redirige al login: la existencia del panel no se confirma con un 403.
    expect(page.url()).toContain('/cuenta/entrar');
  });
});
