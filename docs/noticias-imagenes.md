# Imágenes en las noticias

Guía para quien escribe las noticias (la redacción). Una noticia puede llevar
una imagen; es opcional y la noticia sale igual sin ella.

## Qué se ve en la web

- **Página de la noticia:** la imagen debajo de la cabecera, con un pie que
  dice qué es. El pie lo pone la web; no hay que escribirlo.
- **Listado y portada:** una miniatura arriba de la tarjeta, con la etiqueta
  «Ilustración IA» o «Captura oficial».
- **Al compartir** (WhatsApp, X, LinkedIn…) y en los datos para Google: la
  misma imagen recortada a 1200 × 630.

## Cómo se adjunta

1. Guarda el archivo en `src/assets/noticias/`, con el slug de la noticia
   como nombre: `src/assets/noticias/<slug>.webp`. Valen `.webp`, `.png`,
   `.jpg` y `.jpeg`; mejor WebP. Sólo minúsculas, números y guiones.
2. Añade el campo `image` a la noticia en `src/data/news/news.json`:

   ```json
   "image": {
     "file": "<slug>.webp",
     "alt": "Qué se ve en la imagen, en una frase",
     "kind": "ilustracion-ia",
     "generator": "Nombre del modelo o herramienta con que se generó"
   }
   ```

3. Regenera `src/data/generated/news.json` como siempre. Los dos archivos de
   noticias van juntos en el mismo commit, y la imagen también.
4. Comprueba: `node node_modules/vitest/vitest.mjs run tests/unit/noticias-imagenes.test.ts`.

## Requisitos del archivo

- **Al menos 1200 px de ancho**, que es lo que pide Google Discover.
- **Proporción 16:9 o parecida** (entre 1,6 y 2). Lo recomendado es
  1600 × 900 o 1920 × 1080.
- **3 MB como máximo.** La web la convierte a AVIF y WebP en varios tamaños,
  así que no hace falta comprimir mucho.
- **Lo importante, en el centro.** La versión para compartir recorta los
  bordes de arriba y abajo.
- **Una imagen por noticia.** Dos noticias no comparten archivo, y no puede
  quedar en la carpeta ningún archivo que no use ninguna noticia.

## Dos clases de imagen

### `ilustracion-ia`: la que genera la redacción

Es una ilustración: acompaña a la noticia, no la prueba. `generator` es
obligatorio y sale en el pie.

La redacción las genera con **Nano Banana Pro (versión low cost de
RunningHub)**. En `generator` va `"Nano Banana Pro (RunningHub)"`. Pide
1600 × 900 o 16:9 y di en el prompt, siempre, «sin texto, sin logotipos, sin
personas, sin interfaces»: este modelo escribe texto en la imagen con mucha
facilidad, y eso está prohibido. Revisa cada imagen antes de adjuntarla; si
aparece una letra, un logotipo o algo parecido a una pantalla, se descarta y se
genera otra.

**Sí:** escenas conceptuales y abstractas del tema (privacidad, servidores,
código, voz, imagen, un radar…).

**Nunca:**
- interfaces, pantallas o páginas web que parezcan reales, de ningún producto;
- logotipos o marcas, propios o ajenos;
- personas reales, reconocibles o no;
- texto dentro de la imagen, cifras o gráficos con datos;
- nada que un lector pudiera tomar por una foto o una captura del hecho.

La regla de fondo: una imagen inventada no puede afirmar nada que la noticia
no respalde con una fuente.

### `captura-oficial`: captura de una fuente

Es prueba, no adorno. Tiene que ser de una página que esté en `sources` de la
misma noticia, con la URL exacta, y tomada como muy tarde el día de
`checkedAt`.

```json
"image": {
  "file": "<slug>.png",
  "alt": "Tabla de precios de … con el plan gratuito marcado",
  "kind": "captura-oficial",
  "sourceUrl": "https://… (la misma URL que en sources)",
  "capturedAt": "2026-11-23"
}
```

## Texto alternativo (`alt`)

Entre 20 y 250 caracteres. Describe lo que se ve, no repite el titular y no
empieza por «Imagen de». Es lo que oye quien no ve la imagen.

## Qué para la publicación

- Falta el archivo → el build falla con el nombre de la noticia.
- Ilustración sin `generator`, o captura sin `sourceUrl` o `capturedAt` →
  falla el esquema.
- Captura de una página que no está entre las fuentes → la noticia no es
  publicable.
- Menos de 1200 px, proporción rara, más de 3 MB, archivos huérfanos o
  repetidos → fallan los tests.
