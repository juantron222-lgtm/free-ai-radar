# Fase 2: la Home y la navegación

Decisión: **B híbrida**. La portada abre con tres puertas —encontrar, ver qué
está pasando, comparar— y el buscador vive en la cabecera, en todas las
páginas. Implementado el 12 de septiembre de 2026 en `web-v2`.

## Qué problema resolvía

La portada anterior ofrecía cuatro listas para el mismo viaje: un buscador en
el hero, seis atajos de intención, seis tarjetas «una por vertical» y ocho
enlaces en la cabecera. Y cerraba con «Por qué fiarte de esto», unas 350
palabras que repetían lo que cada ficha ya dice con su estado, su fecha y su
fuente.

## Cómo está montada

| Pieza | Dónde vive | Qué enseña |
| --- | --- | --- |
| Buscador global | `src/components/site/Header.astro` | Formulario GET a `/herramientas`. Sin JavaScript. Conserva la consulta al volver al catálogo |
| Puerta 1 · Encontrar | `src/components/home/PuertaBuscar.astro` | Caja, cuatro condiciones con su cifra y una tabla de cinco fichas reales (tarjeta, registro, uso comercial) |
| Puerta 2 · Actualidad | `src/components/home/PuertaActualidad.astro` | Tres titulares fechados. Sólo lee `getLatestNews()` |
| Puerta 3 · Comparar | `src/components/home/PuertaComparar.astro` | Dos desplegables con el mismo `name="t"`; `/comparar` acepta `?t=a&t=b` y `?t=a,b` |
| Verticales | `src/components/home/FilaVerticales.astro` | Las seis, con cuántas fichas tiene cada una |
| Franja de confianza | `src/components/home/FranjaConfianza.astro` | 94 revisadas · 12 verificadas · 77 parciales · 5 catalogadas, y enlace a metodología |
| Datos | `src/lib/data/portada.ts` | Filas de evidencia, conteos y cifras por vertical |

La cabecera pasa de ocho entradas a cuatro (Herramientas, Noticias, Comparar,
Metodología). Las seis verticales siguen a un clic: en el menú móvil y en la
propia portada.

## Reglas que lo sujetan

`tests/unit/web-v2-portada.test.ts`:

- cada casilla de la portada devuelve **exactamente** las fichas que anuncia su
  cifra: la prueba ejecuta el filtro de su propio enlace;
- la tabla sólo enseña fichas usables hoy y comprobadas, sin repetir;
- el tono de cada condición sale de la pregunta y no del valor: «¿Pide tarjeta?
  No» es buena noticia y «¿Uso comercial? No» no lo es;
- la cabecera no lleva verticales y el buscador es un GET al catálogo;
- la portada no vuelve a montar la rejilla de intenciones ni el bloque largo.

## Detalles que costaron una medición

- **El CSS de una página no alcanza a sus componentes hijos.** Colocar las
  secciones con `.puertas > :nth-child(n)` no funciona, ni siquiera envuelto en
  `:global()`: Astro sella cada selector con el atributo del fichero que lo
  escribe. Las tres puertas van dentro de un `div.hueco` que sí pertenece a la
  página.
- **La primera acción tiene que caber sobre el aviso de cookies.** Medido a
  375×812: el campo de búsqueda acaba en 508 px y la barra empieza en 545. Si
  la cabecera de la portada vuelve a crecer, eso se rompe primero.

## Lo que queda para la fase siguiente

Extender el sistema visual al resto del sitio: fichas, catálogo, verticales,
comparador y `/noticias`, que hereda navegación y estilo pero no toca su
mecanismo de publicación.
