import { test, expect } from '@playwright/test';

/**
 * Una vertical se llama igual en la navegación y en sus migas.
 *
 * La cabecera decía «Imagen» y la miga «Categorías / Imagen IA»; en Audio,
 * «Audio IA»; en Código, Agentes y Modelos no había «Categorías». Aquí se
 * comprueba lo que se ve, la miga visible y la del JSON-LD.
 */

const VERTICALES: [string, string][] = [
  ['/imagen', 'Imagen'],
  ['/video', 'Vídeo'],
  ['/audio', 'Audio'],
  ['/agentes', 'Agentes'],
  ['/modelos', 'Modelos'],
  ['/codigo', 'Código'],
];

for (const [ruta, rotulo] of VERTICALES) {
  test(`${ruta}: la miga dice «${rotulo}», como la navegación`, async ({ page }) => {
    await page.goto(ruta);
    const migas = page.getByRole('navigation', { name: 'Migas de pan' }).locator('li');
    // La última miga es sólo el nombre; `toHaveText` con cadena exige el texto entero.
    await expect(migas).toHaveText([/^Inicio/, rotulo]);

    const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
    const nombres = ld
      .flatMap((bloque) => {
        const datos = JSON.parse(bloque) as { '@graph'?: unknown[] };
        return (datos['@graph'] ?? [datos]) as { '@type'?: string; itemListElement?: { name: string }[] }[];
      })
      .filter((nodo) => nodo['@type'] === 'BreadcrumbList')
      .flatMap((nodo) => (nodo.itemListElement ?? []).map((i) => i.name));
    expect(nombres).toEqual(['Inicio', rotulo]);
  });
}

test('la miga de categoría de una ficha de imagen dice «Imagen»', async ({ page }) => {
  await page.goto('/herramientas/krea');
  const migas = page.getByRole('navigation', { name: 'Migas de pan' }).locator('li');
  await expect(migas.nth(2).getByRole('link')).toHaveText('Imagen');
  await expect(migas.nth(2).getByRole('link')).toHaveAttribute('href', '/imagen');
});
