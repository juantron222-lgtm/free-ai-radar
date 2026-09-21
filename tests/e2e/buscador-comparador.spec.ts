import { test, expect, type Page } from '@playwright/test';
import { seedConsent } from './helpers';

/**
 * Buscar una tarea y comparar cuatro cosas, en un navegador de verdad.
 *
 * Lo que se comprueba aquí no se puede comprobar en una prueba unitaria: que
 * el motor de intención llega hasta la página, que el interruptor de «sólo
 * diferencias» esconde filas reales, que el selector no deja pasar de cuatro
 * y que a 375 px la tabla se desplaza dentro de su caja y no arrastra la
 * página entera.
 */

// El cartel de cookies tapa los controles del selector: se decide antes.
test.beforeEach(async ({ page }) => {
  await seedConsent(page);
});

test.describe('buscador por tarea', () => {
  test('«crear una app» devuelve constructores y dice cómo lo ha entendido', async ({ page }) => {
    await page.goto('/herramientas?q=crear+una+app');

    const intent = page.locator('#result-intent');
    await expect(intent).toBeVisible();
    await expect(intent).toContainText('Crear una aplicación desde una idea');

    const visibles = page.locator('[data-result-item]:not([hidden])');
    await expect(visibles).toHaveCount(3);
    for (const nombre of ['Lovable', 'Bolt.new', 'v0 by Vercel']) {
      await expect(page.locator('[data-result-item]:not([hidden])').getByText(nombre, { exact: false }).first()).toBeVisible();
    }
  });

  test('«generar imágenes» separa lo que se hace gratis de lo que se hace pagando', async ({ page }) => {
    /*
     * Midjourney salía mezclado con Krea bajo «Se muestran las que lo cumplen
     * según su ficha». Ahora va debajo de una separación que dice por qué.
     */
    await page.goto('/herramientas?q=generar+imagenes');

    const intent = page.locator('#result-intent');
    await expect(intent).toContainText('en su plan gratuito');
    await expect(intent).toContainText('pagando, con una prueba');

    const divisor = page.locator('#results [data-divider]');
    await expect(divisor).toBeVisible();
    await expect(divisor).toContainText('no en un plan gratuito que se renueve');

    const orden = await page.locator('#results > li:not([hidden])').evaluateAll((lis) =>
      lis.map((li) => (li.hasAttribute('data-divider') ? '|' : (li as HTMLElement).dataset['slug']))
    );
    const corte = orden.indexOf('|');
    expect(corte, 'hay gratuitas antes de la separación').toBeGreaterThan(0);
    expect(orden.indexOf('midjourney'), 'Midjourney no tiene plan gratuito').toBeGreaterThan(corte);
    expect(orden.indexOf('krea'), 'Krea lo incluye gratis').toBeLessThan(corte);
  });

  test('«crear una app» no cuela nada de audio ni de imagen', async ({ page }) => {
    await page.goto('/herramientas?q=crear+una+app');
    const texto = await page.locator('#results').innerText();
    expect(texto).not.toContain('Suno');
    expect(texto).not.toContain('Midjourney');
  });

  test('una tarea que no cubrimos ofrece las seis verticales, no resultados de relleno', async ({ page }) => {
    await page.goto('/herramientas?q=traducir+a+swahili');

    await expect(page.locator('#empty-state')).toBeVisible();
    const salidas = page.locator('.empty-verticals-list a');
    await expect(salidas).toHaveCount(6);
    await expect(salidas.first()).toBeVisible();
  });

  test('no destella el catálogo entero antes de filtrar', async ({ page, request }) => {
    /*
     * La página se prerenderiza con las noventa y cuatro fichas y filtra
     * después. Sin el velo, quien abre un enlace con `?q=` ve primero una
     * respuesta que no es la suya.
     *
     * El instante del destello no se puede observar sin carreras, así que se
     * comprueban las dos mitades del mecanismo: que el guardia va en el HTML
     * servido, y que la clase que pone esconde de verdad la rejilla.
     */
    const html = await (await request.get('/herramientas?q=crear+una+app')).text();
    expect(html).toContain('far-filtrando');

    await page.goto('/herramientas?q=crear+una+app');
    await expect(page.locator('[data-result-item]:not([hidden])')).toHaveCount(3);

    // Cuando el velo está puesto, no se ve nada; al quitarlo, se ve lo filtrado.
    await page.evaluate(() => document.documentElement.classList.add('far-filtrando'));
    await expect(page.locator('#results')).toBeHidden();

    await page.evaluate(() => document.documentElement.classList.remove('far-filtrando'));
    await expect(page.locator('#results')).toBeVisible();
    await expect(page.locator('[data-result-item]:not([hidden])')).toHaveCount(3);
  });

  test('el autocompletado enseña la tarea y nombres legibles, nunca tokens', async ({ page }) => {
    await page.goto('/herramientas');
    await page.locator('#q').fill('musica');

    const sugerencias = page.locator('#search-suggestions [role="option"]');
    await expect(sugerencias.first()).toBeVisible();

    const texto = await page.locator('#search-suggestions').innerText();
    expect(texto).toContain('Crear música');
    expect(texto).toContain('Música IA');
    // Los tokens del catálogo llevan guion y viven en inglés: no salen nunca.
    expect(texto).not.toContain('text-to-music');
    expect(texto).not.toContain('musica ia');
  });
});

test.describe('comparador: entrada', () => {
  test('arranca con comparaciones ya montadas, no con noventa y cuatro casillas', async ({ page }) => {
    await page.goto('/comparar');
    const utiles = page.locator('.compare-useful-item');
    const cuantas = await utiles.count();
    expect(cuantas).toBeGreaterThanOrEqual(6);
    expect(cuantas).toBeLessThanOrEqual(10);

    // Y cada una dice para qué sirve.
    await expect(utiles.first().locator('.compare-useful-why')).not.toBeEmpty();
  });

  test('una comparación útil lleva a una URL compartible', async ({ page }) => {
    await page.goto('/comparar');
    await page.locator('.compare-useful-link').first().click();
    await expect(page).toHaveURL(/\/comparar\?t=[a-z0-9-]+(,[a-z0-9-]+)+/);
    await expect(page.getByRole('table')).toBeVisible();
  });

  test('se puede llegar a una herramienta por su nombre', async ({ page }) => {
    await page.goto('/comparar');
    await page.locator('#compare-q').fill('lovable');

    const visibles = page.locator('[data-compare-option]:not([hidden])');
    await expect(visibles).toHaveCount(1);
    await expect(visibles.first()).toContainText('Lovable');
  });

  test('el filtro por vertical acota el muro', async ({ page }) => {
    await page.goto('/comparar');
    const todas = await page.locator('[data-compare-option]:not([hidden])').count();

    // El control real es un radio `sr-only` detrás de su etiqueta.
    await page.locator('[data-compare-vertical][value="codigo"]').check({ force: true });
    const codigo = await page.locator('[data-compare-option]:not([hidden])').count();

    expect(codigo).toBeGreaterThan(0);
    expect(codigo).toBeLessThan(todas);
  });

  test('no deja elegir más de cuatro', async ({ page }) => {
    await page.goto('/comparar');

    /*
     * Una a una y comprobando. Cuatro clics seguidos sobre etiquetas cuyo
     * control real es `sr-only` se adelantan al `change` que los cuenta, y en
     * WebKit el cuarto llegaba antes de que el tercero se registrase.
     *
     * Y a veces WebKit se traga el clic entero. Ocurre sólo con los seis
     * motores corriendo a la vez —con este fichero solo pasa 32 de 32, y con
     * mobile-safari solo, 191 de 191—: la máquina se satura, el clic se
     * despacha, Playwright no da error porque despacharlo salió bien, y la
     * casilla se queda sin marcar. Es de la misma familia que el problema de
     * arriba y no dice nada del producto: los otros cinco motores lo pasan
     * siempre, y éste también en cuanto deja de competir por la CPU.
     *
     * Se reintenta el clic, no se relaja la comprobación. Si el tope de cuatro
     * se rompiera de verdad, reintentar no salvaría nada y la prueba caería
     * igual, que es exactamente lo que tiene que hacer.
     */
    const marcar = async (slug: string) => {
      const casilla = page.locator(`[data-compare-pick][value="${slug}"]`);
      for (let intento = 0; intento < 3; intento++) {
        await page.locator(`[data-compare-option][data-slug="${slug}"]`).click();
        try {
          await expect(casilla).toBeChecked({ timeout: 2000 });
          return;
        } catch {
          if (intento === 2) throw new Error(`«${slug}» no se marcó tras tres clics`);
        }
      }
    };

    const slugs = await page
      .locator('[data-compare-option]')
      .evaluateAll((els) => els.slice(0, 4).map((el) => (el as HTMLElement).dataset['slug']!));

    for (const slug of slugs) await marcar(slug);

    await expect(page.locator('#compare-chosen')).toBeVisible();
    await expect(page.locator('[data-compare-pick]').nth(5)).toBeDisabled();
    await expect(page.locator('[data-compare-submit]')).toBeEnabled();
  });

  test('lo ya elegido no se esconde al filtrar', async ({ page }) => {
    /*
     * Si el filtro ocultase una casilla marcada, el formulario mandaría una
     * comparación distinta de la que se ve en pantalla.
     */
    await page.goto('/comparar');

    /*
     * Por el mismo camino que haría una persona: buscarla, pulsar su pastilla
     * y luego buscar otra cosa. Pulsar la casilla `sr-only` a la fuerza no
     * cambia su estado en los motores táctiles —el clic aterriza donde ya no
     * está—, y además no es lo que hace nadie: lo que se pulsa es la etiqueta.
     */
    await page.locator('#compare-q').fill('lovable');
    await page.locator('[data-compare-option][data-slug="lovable"]').click();
    await expect(page.locator('[data-compare-pick][value="lovable"]')).toBeChecked();

    await page.locator('#compare-q').fill('whisper');
    await expect(page.locator('[data-compare-option][data-slug="lovable"]')).toBeVisible();
  });
});

/*
 * La tabla arranca enseñando sólo lo que separa.
 *
 * Las pruebas que miran el contenido de una celda concreta, y no el punto de
 * partida, abren antes las filas que coinciden: lo que comprueban es que el
 * dato está bien dicho, no en qué grupo cae para ese par de herramientas.
 */
async function mostrarTodas(page: Page) {
  const interruptor = page.locator('#solo-diferencias');
  if (await interruptor.count()) await interruptor.uncheck();
}

test.describe('comparador: la tabla', () => {
  const URL_TRES = '/comparar?t=lovable,bolt-new,v0-by-vercel';

  test('empieza por lo que distingue', async ({ page }) => {
    await page.goto(URL_TRES);
    const primera = page.locator('#compare-table tbody tr').first();
    await expect(primera).toHaveAttribute('data-igual', 'no');
    await expect(primera).toBeVisible();
  });

  test('por defecto sólo enseña diferencias, y el interruptor devuelve el resto', async ({ page }) => {
    await page.goto(URL_TRES);
    const filas = page.locator('tbody tr');
    const total = await filas.count();
    const iguales = await page.locator('tbody tr[data-igual="si"]').count();
    expect(iguales).toBeGreaterThan(0);

    const interruptor = page.locator('#solo-diferencias');
    await expect(interruptor).toBeChecked();
    await expect(page.locator('tbody tr:visible')).toHaveCount(total - iguales);

    await interruptor.uncheck();
    await expect(page.locator('tbody tr:visible')).toHaveCount(total);
  });

  test('un hueco de análisis se lee como hueco, no como ventaja', async ({ page }) => {
    await page.goto('/comparar?t=whisper,descript');
    await mostrarTodas(page);
    const tabla = await page.locator('#compare-table').innerText();

    // El guion suelto era la ambigüedad: fuera de la tabla.
    expect(tabla).not.toMatch(/(^|\n)\s*—\s*(\n|$)/);
    expect(tabla).toContain('Sin analizar');
  });

  test('la leyenda explica las cuatro formas de no saber', async ({ page }) => {
    /*
     * Eran tres hasta que la fase de cobertura de datos partió «sin verificar»
     * en dos: el hueco que es deuda nuestra y el que es silencio del
     * fabricante. Son cuatro porque significan cuatro cosas distintas.
     */
    await page.goto(URL_TRES);
    const leyenda = page.locator('.compare-legend');
    for (const motivo of ['Sin comprobar', 'El fabricante no lo', 'publica', 'Sin analizar', 'No aplica']) {
      await expect(leyenda).toContainText(motivo);
    }
  });

  test('el resumen señala filas, no gana nadie', async ({ page }) => {
    await page.goto(URL_TRES);
    const resumen = page.locator('.compare-summary');
    await expect(resumen).toContainText(/Se diferencian en \d+ de \d+ filas/);
    await expect(resumen).not.toContainText(/la mejor|el mejor|gana/i);
  });

  test('un dato que falta no se cuenta como diferencia', async ({ page }) => {
    /*
     * «Sí» frente a «El fabricante no lo publica» salía como diferencia. Ahora
     * esa fila dice que faltan datos y el resumen lo cuenta aparte.
     */
    await page.goto('/comparar?t=chatgpt,claude,perplexity-ai');
    await mostrarTodas(page);
    const faltan = page.locator('#compare-table tbody tr[data-igual="faltan"]');
    expect(await faltan.count()).toBeGreaterThan(0);
    await expect(faltan.first().locator('.compare-faltan')).toHaveText('Faltan datos');
    await expect(page.locator('.compare-summary')).toContainText('falta algún dato');
  });

  test('«Añadir otra» propone lo que hace lo mismo, y no aparece si ya hay cuatro', async ({ page }) => {
    await page.goto('/comparar?t=lovable,bolt-new');
    const propuestas = await page.locator('.compare-more-list a').allInnerTexts();
    expect(propuestas, 'v0 construye aplicaciones como las dos').toContain('v0 by Vercel');
    for (const ajena of ['Suno AI', 'Midjourney', 'Aider']) expect(propuestas).not.toContain(ajena);

    await page.goto('/comparar?t=klingai,hailuo-ai,luma-dream-machine,pika-labs');
    await expect(page.locator('.compare-more')).toHaveCount(0);
  });

  test('pedir más de cuatro dice cuál se ha quedado fuera', async ({ page }) => {
    await page.goto('/comparar?t=klingai,hailuo-ai,luma-dream-machine,pika-labs,runwayml');
    await expect(page.locator('thead th')).toHaveCount(5);
    await expect(page.getByRole('status').filter({ hasText: 'como mucho 4' })).toContainText('RunwayML');
  });

  test('la URL sigue siendo compartible con cuatro columnas', async ({ page }) => {
    await page.goto('/comparar?t=klingai,hailuo-ai,luma-dream-machine,pika-labs');
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.locator('thead th')).toHaveCount(5);
    await expect(page).toHaveURL(/t=klingai,hailuo-ai,luma-dream-machine,pika-labs/);
  });
});

test.describe('por qué falta un dato', () => {
  /*
   * La distinción que esta fase añadió al modelo, comprobada donde importa:
   * en la página. «Sin comprobar» es deuda nuestra; «El fabricante no lo
   * publica» es opacidad suya. Antes las dos se escribían igual, y la ficha
   * llegaba a acusar al fabricante de callar lo que nadie había mirado.
   */
  test('el comparador distingue el hueco nuestro del suyo', async ({ page }) => {
    await page.goto('/comparar?t=ideogram,krea');
    const tabla = page.locator('#compare-table');
    await expect(tabla).toContainText('El fabricante no lo publica');
    await expect(tabla).toContainText('Sin comprobar');
  });

  test('y explica qué se buscó cuando el fabricante calla', async ({ page }) => {
    await page.goto('/comparar?t=ideogram,krea');
    const callado = page.locator('.compare-absent', { hasText: 'El fabricante no lo publica' }).first();
    const nota = await callado.getAttribute('title');
    expect(nota).toContain('Buscábamos');
  });

  test('la leyenda nombra los dos motivos', async ({ page }) => {
    await page.goto('/comparar?t=ideogram,krea');
    const leyenda = page.locator('.compare-legend');
    await expect(leyenda).toContainText('Sin comprobar');
    await expect(leyenda).toContainText('El fabricante no lo publica');
  });

  test('la ficha no acusa al fabricante de lo que no hemos mirado', async ({ page }) => {
    /*
     * Hace falta una ficha con los dos huecos a la vez. Era Ideogram hasta el
     * 15 de septiembre, cuando se comprobó que su página de precios no dice si
     * pide tarjeta y dejó de tener nada pendiente nuestro. Codex tiene la
     * tarjeta sin publicar y el uso comercial sin mirar todavía.
     */
    await page.goto('/herramientas/codex');
    const nota = page.locator('.tool-verified-note');
    await expect(nota).toContainText('su fabricante no publica');
    await expect(nota).toContainText('Nos falta comprobar');
    await expect(nota).toContainText('trabajo nuestro pendiente');
  });

  test('un filtro de cobertura parcial lo dice antes de pulsarlo', async ({ page }) => {
    /*
     * «Sin tarjeta» se apoya en un dato confirmado en 38 de 94 fichas: sigue
     * siendo un filtro, pero marcarlo esconde más de la mitad del catálogo por
     * un motivo que es nuestro. Hay que decirlo antes, no después.
     *
     * El aviso vivía en el `title` de la pastilla y ahí no servía: en táctil no
     * existe, y el teléfono es el dispositivo principal. Ahora se lee siempre,
     * debajo de la barra. El número de la pastilla dejó de ser la cobertura
     * —«38/94»— porque en ese sitio se lee como el resultado, y el resultado
     * eran 37.
     */
    await page.goto('/herramientas');

    const nota = page.locator('.filters-cobertura');
    await expect(nota).toBeVisible();
    await expect(nota).toContainText('Sin tarjeta');
    await expect(nota).toContainText('aún no lo sabemos');

    /*
     * La nota y el chip dicen el mismo número, y la nota suma el catálogo.
     * Antes ponía «confirmado en 38» junto al chip «37»: dos cifras ciertas que
     * se leían como una contradicción.
     */
    const cuenta = page.locator('[data-filter-count="nocard"]');
    await expect(cuenta).toHaveText(/^\d+$/);
    const chip = Number(await cuenta.innerText());
    const tramo = (await nota.innerText()).match(/Sin tarjeta:\s*(\d+)[^.]*?(\d+)[^.]*?(\d+)/);
    expect(tramo, 'la nota cuenta la condición entera').not.toBeNull();
    expect(Number(tramo![1])).toBe(chip);
    const total = Number((await page.locator('.cabecera-entradilla').innerText()).match(/Las (\d+) herramientas/)?.[1]);
    expect(Number(tramo![1]) + Number(tramo![2]) + Number(tramo![3])).toBe(total);
  });

  test('el número de una casilla es lo que devuelve al marcarla', async ({ page }) => {
    /*
     * La comprobación que la auditoría hizo a mano: leer la cifra del control y
     * contar lo que aparece. Prometía 25 y entregaba 15.
     */
    await page.goto('/herramientas');
    const promete = Number(await page.locator('[data-filter-count="comm"]').innerText());
    expect(promete).toBeGreaterThan(0);

    await page.goto('/herramientas?comm=1');
    await expect(page.locator('[data-result-item]:not([hidden])').first()).toBeVisible();
    expect(await page.locator('[data-result-item]:not([hidden])').count()).toBe(promete);
  });

  test('un filtro con cobertura suficiente no se disculpa', async ({ page }) => {
    /*
     * «Sin registro» tiene el dato en casi todo el catálogo: no necesita aviso
     * y no debe aparecer en la nota de cobertura, o la nota deja de significar
     * nada por repetirse en todas.
     */
    await page.goto('/herramientas');
    await expect(page.locator('.filters-cobertura')).not.toContainText('sin registro');
  });

  test('uno de cobertura testimonial cambia de pregunta', async ({ page }) => {
    /*
     * Con el dato confirmado en 1 de las 35 fichas donde aplica, «sin marca de
     * agua» devolvería una ficha y escondería treinta y cuatro por ignorancia
     * nuestra: eso presenta lo que no sabemos como un resultado negativo del
     * fabricante. En su lugar se ofrece ver dónde lo hemos comprobado.
     */
    await page.goto('/herramientas');
    await expect(page.locator('[data-filter-flag="nowm"]')).toHaveCount(0);

    const sustituto = page.locator('[data-filter-known="wmknown"]');
    await expect(sustituto).toBeVisible();
    /*
     * Sin paréntesis: «(1)» era la cobertura contando sólo las que generan
     * archivos, y al marcarla salían quince. Un número entre paréntesis al lado
     * de un control se lee como el resultado, se llame como se llame por dentro.
     */
    await expect(sustituto).toContainText(/Marca de agua comprobada \d+/);
    expect(await sustituto.getAttribute('title')).toContain('filtra por si la sabemos');
  });

  test('y ese sustituto enseña lo comprobado, no lo negativo', async ({ page }) => {
    await page.goto('/herramientas?wmknown=1');
    const visibles = page.locator('[data-result-item]:not([hidden])');
    await expect(visibles.first()).toBeVisible();

    const cuantas = await visibles.count();
    expect(cuantas).toBeGreaterThan(0);
    expect(cuantas).toBeLessThan(94);
  });
});

test.describe('un dato que sólo vale por una puerta lo dice', () => {
  test('el uso comercial de unos pesos no se lee como permiso del servicio', async ({ page }) => {
    /*
     * DeepSeek publica sus pesos con licencia MIT y además vende una API con
     * sus propias condiciones. «Uso comercial: sí» es cierto de los pesos y no
     * se ha leído de la API: sin el matiz, un permiso concreto se lee como una
     * promesa general.
     *
     * El ejemplo era V4 Flash y pasó a ser V4.1 Flash el 21 de septiembre de
     * 2026, cuando DeepSeek retiró el primero de su API. Sin API, sus únicas
     * puertas son los pesos y el equipo donde se ejecutan, así que la licencia
     * sí cubre el producto entero y el matiz sobraría: lo que esta prueba
     * vigila necesita un modelo que además venda una API.
     */
    await page.goto('/comparar?t=deepseek-v4-1-flash,gemma-4');
    await mostrarTodas(page);
    const matiz = page.locator('.compare-matiz', { hasText: 'pesos descargables' }).first();
    await expect(matiz).toBeVisible();

    const celda = page.locator('.compare-value', { has: matiz });
    expect(await celda.getAttribute('title')).toContain('Las demás vías de acceso');
  });

  test('lo leído en la tabla de precios de una API se atribuye a la API', async ({ page }) => {
    await page.goto('/comparar?t=gemini-3-flash,claude-haiku-4-5');
    await mostrarTodas(page);
    await expect(page.locator('.compare-matiz', { hasText: 'en la API' }).first()).toBeVisible();
  });
});

test.describe('a 375 px', () => {
  test.use({ viewport: { width: 375, height: 780 } });

  test('cada condición se lee apilada, sin arrastrar nada de lado', async ({ page }) => {
    /*
     * Antes la tabla se desplazaba dentro de su caja: no rompía la página, pero
     * para comparar dos párrafos había que arrastrarla y perder de vista a quién
     * pertenecía cada dato. Ahora se apila y cada valor lleva el nombre de su
     * herramienta delante.
     */
    await page.goto('/comparar?t=lovable,bolt-new,v0-by-vercel');
    await expect(page.getByRole('table')).toBeVisible();

    expect(await sePuedeArrastrarDeLado(page)).toBe(false);

    const medida = await page.evaluate(() => {
      const caja = document.querySelector('.compare-scroll');
      const celda = document.querySelector('#compare-table tbody tr[data-igual="no"] td');
      return {
        desplazaLaTabla: caja ? caja.scrollWidth > caja.clientWidth + 1 : true,
        // Firefox devuelve `attr(...)` sin resolver: se comprueba que el
        // pseudoelemento existe y, aparte, qué nombre lleva la celda.
        antes: celda ? getComputedStyle(celda, '::before').content : 'none',
        herramienta: celda?.getAttribute('data-herramienta') ?? '',
      };
    });
    expect(medida.desplazaLaTabla).toBe(false);
    expect(medida.antes).not.toBe('none');
    expect(medida.herramienta).toMatch(/Lovable|Bolt|v0/);
  });

  test('el selector no desborda', async ({ page }) => {
    await page.goto('/comparar');
    expect(await sePuedeArrastrarDeLado(page)).toBe(false);
  });

  test('el buscador tampoco', async ({ page }) => {
    await page.goto('/herramientas?q=quitar+fondo');
    await expect(page.locator('[data-result-item]:not([hidden])').first()).toBeVisible();
    expect(await sePuedeArrastrarDeLado(page)).toBe(false);
  });

  test('el cartel de cookies cabe entero, con todos sus botones alcanzables', async ({ browser }) => {
    /*
     * Sin decidir las cookies, que es como llega todo el mundo la primera vez.
     *
     * Rechazar y personalizar tienen que ser tan alcanzables como aceptar: un
     * botón fuera de pantalla en un cartel de consentimiento no es un fallo de
     * maquetación, es un consentimiento que no se ha podido negar. Y la página
     * no se arrastra de lado, así que lo que se sale no se alcanza.
     */
    const contexto = await browser.newContext({ viewport: { width: 375, height: 780 } });
    const pagina = await contexto.newPage();
    await pagina.goto('/');

    const cartel = pagina.locator('#consent-root');
    await expect(cartel).toBeVisible();

    const ancho = await cartel.evaluate((el) => el.getBoundingClientRect().width);
    expect(ancho).toBeLessThanOrEqual(375);

    for (const boton of ['Aceptar todo', 'Rechazar todo', 'Personalizar']) {
      const control = cartel.getByRole('button', { name: boton });
      await expect(control).toBeVisible();
      const derecha = await control.evaluate((el) => el.getBoundingClientRect().right);
      expect(derecha, boton).toBeLessThanOrEqual(376);
    }

    await contexto.close();
  });
});

/**
 * ¿Se arrastra la página de lado de verdad?
 *
 * `scrollWidth > clientWidth` no vale como prueba: una fila con
 * `overflow-x: auto` hace crecer el `scrollWidth` de la raíz aunque su
 * contenido esté recortado y el documento no se mueva ni un píxel. Medido en
 * `/herramientas` a 375 px: `scrollWidth` 619, `clientWidth` 375 y `scrollX`
 * clavado en 0. Lo que se comprueba es lo que le pasa a quien arrastra.
 */
async function sePuedeArrastrarDeLado(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    window.scrollTo(3000, window.scrollY);
    const movido = window.scrollX > 0;
    window.scrollTo(0, window.scrollY);
    return movido;
  });
}
