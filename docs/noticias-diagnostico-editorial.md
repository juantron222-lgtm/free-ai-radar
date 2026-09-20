# Noticias: diagnóstico editorial y correcciones preparadas

Fecha: 16-17 de septiembre de 2026 · Rama: `noticias-editorial` (desde `verdad-y-utilidad`) · Worktree: `free-ai-radar-noticias`

**Límites respetados:**
- No se ha borrado ni despublicado nada.
- No se ha tocado Supabase (ni staging ni Production).
- No se ha desplegado ni hecho push o merge.
- No se han tocado el catálogo, las fichas, el comparador, los contratos ni el mecanismo de Newsroom.

Los cambios están sólo en `src/data/news/news.json` y en su derivado `src/data/generated/news.json`. Parten del diagnóstico del 15 de septiembre, revisado contra la web pública y releyendo **todas** las fuentes primarias el 16 de septiembre.

## 1. Resumen

- **Publicadas:** siguen siendo 25, igual que el 15 de septiembre. Coinciden la web, el sitemap y `/noticias`. 23 salen de la semilla y 2 existen sólo en Supabase de Production (Cohere y Together). No se ha publicado nada nuevo desde entonces.
- **Clasificación:**

  | Clasificación | Piezas |
  |---|---|
  | mantener | 2 |
  | editar | 21 |
  | archivar | 1 |
  | retirar | 1 |

- **Por sección propuesta:**

  | Sección | Piezas |
  |---|---|
  | actualidad | 7 |
  | uso gratuito | 1 |
  | contexto sectorial | 5 |
  | archivo | 11 |
  | fuera | 1 |

- **Preparado:**
  - Las 20 piezas de «editar» que viven en la semilla ya están corregidas, igual que el retoque de la de «archivar».
  - Para las 2 piezas que sólo existen en Supabase hay texto listo y validado contra el esquema: la reescritura de Cohere y la entrada archivada de Together (§4).
- **Errores de fondo nuevos:** releer las fuentes destapó errores que el diagnóstico del 15 no tenía (§5).
  - **GPT-6 Astra:** estaba **mal fechada**; es del 3 de septiembre, no del 9.
  - **Sonnet 5:** anunciaba una **subida de precio que Anthropic canceló**.
  - **Claude for Teachers:** decía que la oferta para centros no existía, cuando se lanzó el 28 de agosto.
  - **Agents API:** es una beta y se presentaba como «Disponible».
  - **Ollama 0.32.0:** prometía agentes sin sacar datos del equipo con un ejemplo que usa un modelo en la nube.
- **Pruebas:** todas pasan (§9).

## 2. Método

1. **Estado publicado:** se ha comparado `https://www.freeairadar.com/noticias` y su `sitemap.xml` con la semilla. Las URL coinciden. El RSS (`/rss.xml`) sigue sin ninguna noticia: 40 elementos, todos fichas.
2. **Fuentes primarias:** se han releído el 16 de septiembre las de las 25 piezas, siempre en el dominio del fabricante (o de la empresa investigadora en el caso Accomplish/Manifold). Se ha usado el HTML crudo para poder citar literalmente. La única excepción es ElevenLabs, cuyo servidor corta la conexión TLS y se leyó con WebFetch pidiendo frases literales.
3. **Fechas:** cada `publishedAt` se ha contrastado con la fecha que muestra la propia página. En el caso de Robostral, la fecha sale del índice de Mistral.
4. **Criterios de corrección:** los de Juan y la skill `ai-news-primary-source-researcher`:
   - titular en español;
   - entradilla para el lector final;
   - nada deducido del silencio de la fuente;
   - citas completas o paráfrasis atribuida, nunca fragmentos cortados;
   - tiempos verbales correctos a fecha de hoy;
   - etiquetas sólo cuando la fuente las sostiene.
5. **Qué no se ha cambiado:** ningún `status`, `slug`, `id` ni `frontPage`. `checkedAt` pasa a 2026-09-16 sólo en las piezas cuyas fuentes se releyeron y cuyo texto cambió. `verification` no cambia.

## 3. Clasificación por pieza

**Clasificación:**
- **mantener:** no necesita nada.
- **editar:** tenía errores de hecho, de etiqueta o de redacción. Aquí están ya corregidos en la semilla, salvo Cohere.
- **archivar:** es correcta, pero ya no es actualidad.
- **retirar:** no debe seguir publicada.

Una pieza antigua con errores cuenta como «editar», y su sección es «archivo».

**Sección:**
- **actualidad:** noticias de producto de los últimos 45 días.
- **uso gratuito:** cambios en lo que se da gratis, también de los últimos 45 días.
- **contexto:** informes, rondas, compras, investigación y alianzas.
- **archivo:** todo lo que tiene más de 45 días.

Orden: de la más reciente a la más antigua, con las fechas ya corregidas.

**PG** = plan gratuito.

| slug | fecha | sección propuesta | clasificación | motivo | qué se ha preparado | qué falta y quién debe hacerlo |
|---|---|---|---|---|---|---|
| accomplish-sandbox-claude-code-cursor | 12 sep | actualidad | editar | La entradilla era una sola frase de ~70 palabras. El consejo final era confuso. Las cinco fuentes siguen sosteniendo los hechos. | Entradilla partida en tres frases y consejo reescrito. Fuentes releídas. Se mantiene «Parcial» y su nota. | **Juan (presentación):** quitar las pastillas de disponibilidad y PG, y la firma «publicado por el fabricante» (§7). **Newsroom + Juan:** Accomplish publicó el 15 sep «Escaping the OpenAI Codex sandbox, twice», la fuente primaria que faltaba para lo de Codex; es candidata a pieza nueva o actualización. |
| anthropic-informe-amenazas-septiembre-2026 | 10 sep | contexto | editar | Decía que no hubo abuso con Fable ni Mythos. El informe dice «with the exception of one illicit distillation case». | Frase corregida. | **Juan (presentación):** sin pastillas de disponibilidad ni PG en contexto. **Juan (contrato):** la categoría «Agentes» es la menos mala del esquema, que no tiene ninguna de seguridad. |
| cognition-swe-2 | 10 sep | actualidad | editar | Correcta cifra a cifra, pero «Fable 5.1» no decía de quién es. | «Claude Fable 5.1» en el titular y la entradilla. | — |
| cohere-com-introducing-north-small-translate-a-leading-sovereign-open-weight-mac | 10 sep | actualidad | editar | Importación automática, **sólo en Supabase de Production**: titular en inglés, citas cortadas («…reality..», «…on…»), «queda pendiente la revisión editorial» y slug con dominio. La noticia en sí tiene valor (pesos abiertos, uso no comercial). | Reescritura completa validada contra el esquema, `isPublishable` y el control de duplicados (§4.1). No aplicada. | **Juan:** decidir la vía A (misma URL, sin tocar Supabase) o la B (URL en español con 301) (§4.1). |
| deepseek-v4-1-flash | 10 sep | actualidad | editar | Usaba el futuro para el 14 sep, ya pasado. Omitía que V4-Flash y V4-Flash-Vision-Exp quedan retirados, y la bajada de precios del 10 sep. | Presente, retiradas y precios. Herramientas relacionadas `deepseek-v4-flash` y `deepseek-v4-pro`. | **Agente de catálogo:** revisar esas dos fichas; según DeepSeek, V4-Flash está retirado y V4-Pro se redirige. |
| elevenlabs-universal-music-group | 10 sep | contexto | editar | Impacto con tono de nota de prensa. Faltaba el dato útil: la plataforma será distinta de los productos musicales actuales y se ofrecerá aparte. | Impacto reescrito y fuente releída. | **Juan (presentación):** pastilla «Anunciado» y PG en contexto. |
| gemini-app-windows | 10 sep | actualidad | mantener | Correcta. Releída el 16 sep: fecha, Windows 10/11, Alt + Espacio, suscripción para Spark/Omni. | Nada. | — |
| openai-agents-api-gpt-live-1 | 10 sep | actualidad | editar | Figuraba como «Lanzamiento · Disponible». La fuente dice «available in public beta today to all developers». | Tipo «Preview o beta», disponibilidad «preview», coste (sin cuota propia) y entorno de Codex abierto. | — |
| positron-ronda-875-millones | 10 sep | contexto | mantener | Texto correcto; ronda, colíderes y memoria comprobados en positron.ai. Pero la categoría «Modelos de lenguaje» es errónea y el esquema no tiene una adecuada. | Nada: cambiar la categoría por otra igual de errónea no mejora nada. | **Juan (contrato):** categoría de industria/empresas, o secciones (§7). Mientras tanto aparece en «Seguir leyendo» de noticias de modelos. |
| suno-v6 | 9 sep | uso gratuito | editar | Omitía lo que importa aquí: v6 y v6-wild son para Pro y Premier, y v6-mini «available to everyone». Incluía un antecedente sin fuente («llevaba meses en conflicto…»). | Reescrita. PG «Sí», con fuente explícita. Herramienta `suno-ai`. | **Agente de catálogo:** revisar la ficha `suno-ai` con los tres modelos. |
| together-ai-the-open-source-ai-stack | 9 sep | fuera | **retirar** | No es una noticia: es una guía de Together AI. El «Disponible» sale de la barra promocional («On-demand B200s now available»). Texto de trabajo interno. **Sólo en Supabase de Production.** | Entrada archivada validada contra el esquema (§4.2). No aplicada. | **Juan:** autorizar la retirada y elegir vía (§4.2). |
| nvidia-compra-hugging-face | 3 sep | contexto | editar | El titular daba la compra por hecha; la fuente dice «has agreed to acquire». «Principal repositorio» no tenía fuente. | «NVIDIA acuerda comprar…». Compromiso de NVIDIA de no exigir su hardware y aviso de que no hay fecha de cierre. | **Juan (opcional):** el slug dice «compra»; cambiarlo exige un 301. |
| openai-gpt-6-astra | **3 sep** (antes 9 sep) | actualidad | editar | **Fecha equivocada**: la página (`publicationDateText: September 3, 2026`) y el feed dicen 3 sep. Figuraba como «Disponible», pero el despliegue empezó con «a limited set of organizations» y planes de pago. Faltaba el precio. | Fecha, disponibilidad «limitada», planes, precio de la API y salvaguardas. El anuncio no menciona el plan gratuito, y así se dice. | Nada editorial. El `id` conserva «2026-09-09» porque es un identificador y no se toca. Origen probable del error en §5. |
| runway-com-runway-research-introducing-gwm-worlds-2 | 3 sep | contexto | editar | Importación automática: titular en inglés, «queda pendiente la revisión editorial», cita pegada. Fuera de portada, pero en el archivo y en el sitemap. Es investigación sin acceso público. | Reescrita en la semilla: qué es, sus límites según Runway y que sólo hay un formulario de contacto. `frontPage: false` sin tocar. | **Juan (opcional):** slug `runway-gwm-worlds-2` con 301. Si prefiere retirarla, `"status": "archived"` en la semilla y 301 a `/noticias`. |
| ollama-0-32-6-retira-temporalmente-la-generacion-de-imagenes | 4 ago | archivo (sola, el 18 sep) | editar | Retirada «temporal» sin seguimiento. | Añade que ninguna nota de versión hasta la 0.34.2 (15 sep) anuncia su vuelta, con la página de releases como fuente. | Sale sola de portada el 18 sep por edad. **Juan (presentación):** la pastilla PG no tiene sentido en software sin planes. |
| anthropic-publica-su-posicion-sobre-modelos-de-pesos-abiertos | 27 jul | archivo | editar | No decía cuál era la postura, y la fuente la da. | Reescrita: no defienden prohibir, proponen tres medidas y discrepan de la carta abierta. Quitada «Claude» de herramientas afectadas. | — |
| anthropic-lanza-claude-opus-5 | 24 jul | archivo | editar | Deducía del silencio que no está en el plan gratuito y especulaba sobre la capa gratuita. El `seoTitle` prometía «plan gratuito». | El anuncio cita Max y Pro y no menciona Free. Añade el modo rápido, la comparación con Fable 5 y el paso a Opus 4.8. SEO corregido. Herramienta `claude-opus-5`. | — |
| anthropic-presenta-claude-for-teachers | 14 jul | archivo | editar | Decía que la oferta para centros «todavía no está disponible», pero se lanzó el 28 ago. Cita suelta en inglés («entirely free»). | Corregida. | **Juan (presentación):** sigue en «Lo que cambia si no pagas» con 65 días (§7.2). |
| ollama-0-32-0-activa-su-agente-interactivo-por-defecto | 11 jul | archivo | editar | Prometía agentes «sin enviar datos fuera de su equipo», pero el ejemplo de las notas arranca con `glm-5.2:cloud`. Valoración propia («la vía gratuita más directa»). PG «Sí» sin fuente. | Corregida, con cita de las notas que definen los modelos «cloud». PG «sin confirmar». `seoDescription` corregida. | — |
| mistral-presenta-robostral-navigate | 8 jul | archivo | editar | «Navegación embebida» traduce mal *embodied*. Nota de método en la entradilla. «Equipo comercial» no está en la fuente. | Corregida. | — |
| mistral-publica-leanstral-1-5 | 2 jul | archivo | archivar | Correcta, pero antigua. | Retoque de estilo: comillas inversas, «Otro modelo…», tamaño del modelo según Mistral. | **Juan (presentación):** sigue en el bloque PG (§7.2). En datos, el campo sería `"frontPage": false`, pero hoy no la saca de ese bloque. |
| claude-sonnet-5-pasa-a-ser-el-modelo-por-defecto-del-plan-gratuito | 30 jun | archivo | editar | **Anunciaba que el precio de la API subía el 1 sep a 3/15 $. Anthropic lo canceló el 10 ago**: 2/10 $ es permanente. | Precio permanente y aviso del tokenizador (1-1,35× tokens). `seoDescription` corregida. Titular intacto (lo usa la e2e). | **Juan (presentación):** bloque PG (§7.2). **Agente de catálogo:** revisar el precio en la ficha `claude-sonnet-5`. |
| ollama-acelera-gemma-4-en-apple-silicon | 30 jun | archivo | editar | Citas sueltas en inglés. PG «Sí» sin fuente, en software sin planes. | Reescrita. PG «sin confirmar». | — |
| mistral-lanza-ocr-4 | 23 jun | archivo | editar | «Tampoco ofrece pesos descargables» deduce del silencio. | «No menciona… pesos descargables». Precios revisados. | — |
| mistral-medium-3-5-y-agentes-remotos-en-vibe | 22 may | archivo | editar | PG «No» sin fuente: la página hace de Medium 3.5 el modelo por defecto de Le Chat sin decir para qué planes. Faltaban la vista previa y el precio. | Corregida. PG «sin confirmar». | — |

### Efecto en `/noticias` tras las correcciones, sin tocar presentación

- **Bloque «Lo que cambia si no pagas»:** pasa de 5 a 4 piezas y lo abre Suno (9 sep). Antes lo abría Claude for Teachers (14 jul).
- **Pastillas «Disponible» mal puestas:** desaparecen en GPT-6 Astra y Agents API.
- **Textos de plantilla:**
  - Runway: ya no los tiene.
  - Cohere y Together: siguen en la web hasta que Juan decida (§4).

## 4. Piezas que sólo existen en Supabase de Production

Ninguna se ha tocado. El JSON de cada una está en el apéndice A, validado contra `NewsItem`. El de Cohere, además, contra `isPublishable` y `findDuplicateStories` junto a la semilla corregida (prueba temporal, no versionada).

**Dato clave:** `scripts/newsroom-sync.mjs` funde la semilla con `newsroom_published` y **la semilla gana por slug**. Por eso las dos se pueden corregir o archivar desde el repositorio sin tocar Supabase.

**Redirecciones:** hoy `vercel.json` no tiene ninguna (sólo `headers`). Un 301 exige añadir `redirects` en `vercel.json` o en `astro.config.mjs`.

### 4.1 Cohere: editar

**Opción A (recomendada, mínima):**
1. Añadir el objeto A.1 a `src/data/news/news.json`. Lleva el mismo `slug`.
2. Ejecutar `node scripts/newsroom-sync.mjs --seed`.
3. Pasar `npm run data:news:validate`.

La URL no cambia y la fila de Supabase se queda como historial.

**Opción B (URL limpia):**
1. Añadir el mismo objeto con `"slug": "cohere-north-small-translate"`.
2. Añadir el objeto A.1 con el slug original y `"status": "archived"`.
3. Añadir un 301 de `/noticias/cohere-com-introducing-north-small-translate-a-leading-sovereign-open-weight-mac` a `/noticias/cohere-north-small-translate`.

### 4.2 Together: retirar

**Opción A (sin tocar Supabase):**
1. Añadir el objeto A.2 a la semilla. Lleva `"status": "archived"`; el campo que decide es `status`.
2. Regenerar.
3. Añadir un 301 de `/noticias/together-ai-the-open-source-ai-stack` a `/noticias`.

La página y su entrada del sitemap desaparecen en el siguiente build.

**Opción B:** Juan borra la fila en `newsroom_published` de Production y añade el mismo 301.

### Runway, por si se prefiere retirarla

En la semilla: `"status": "published"` → `"archived"`, y un 301 a `/noticias`.

## 5. Hallazgos nuevos respecto al 15 de septiembre

1. **GPT-6 Astra tenía la fecha mal.**
   - **Qué dicen las fuentes:** la página oficial y el feed de OpenAI fechan «GPT-6 Astra: A new generation of intelligence» el 3 sep.
   - **Qué publicamos:** 9 sep.
   - **Origen probable (hipótesis, no comprobada):** la pieza entró en `d43e594` (10 sep), cuando OpenAI sólo se leía por feed. Ese feed tiene otro artículo, «GPT-6 Astra: The next generation in intelligence for work», del 9 sep.
   - **Lección:** una fecha tomada del feed no basta.
2. **Hechos que caducan porque el fabricante edita su página.**
   - **Sonnet 5:** edición del 10 ago, precio permanente.
   - **Claude for Teachers:** actualización del 28 ago, oferta para centros.
   - En ambos casos la pieza se comprobó el 11 ago y nadie la volvió a leer.
3. **Disponibilidad inflada.**
   - **Agents API:** es una beta pública.
   - **GPT-6 Astra:** el despliegue es escalonado.
   - La segunda coincide con un fallo del extractor (§6.3).
4. **Etiquetas de plan gratuito deducidas.**
   - **Ollama 0.32.0 y 0.31.1:** estaban en «Sí» sin ninguna fuente que hable de planes.
   - **Mistral Medium 3.5:** estaba en «No» con una fuente que no lo dice.
5. **Informe de amenazas de Anthropic:** omitía una excepción explícita.
6. **Accomplish publicó el 15 sep su análisis de Codex.** Es la fuente primaria que la nota de piezas pendientes decía que faltaba. No se ha publicado nada.

## 6. Autopublicación: propuesta (endurece, nunca relaja)

Referencias comprobadas en esta rama:
- bucle en `src/lib/newsroom/daily.ts:609-625`;
- tope `MAX_AUTOPUBLICADAS = 4` en `:119`;
- borrador automático en `scripts/draft/autodraft.mjs`;
- conversión a noticia en `src/lib/domain/newsroom.ts:121-154`.

### 6.1 Ya, antes de la próxima pasada

**Pausar la autopublicación.** Pasar `MAX_AUTOPUBLICADAS` a `0` (`daily.ts:119`) hasta que exista la comprobación de legibilidad (§6.2).

- **Por qué:** todo lo que ha salido solo (Cohere, Together, Runway) llegó con el texto de trabajo de `autodraft.mjs`, y ninguna puerta lo mira.
- **Qué pasa mientras:** la pasada sigue leyendo, verificando y dejando borradores en la mesa; sólo deja de aprobar por su cuenta.
- **Coherencia:** encaja con «si no hay nada suficientemente verificado, publica 0».

### 6.2 Comprobación de legibilidad común a las dos rutas

Una función pura, por ejemplo `checkReaderReady(item)` en `src/lib/domain/newsroom.ts`. La llamarían `canApprove` (ruta manual), `canAutoPublish` y `scripts/newsroom-publicar.mjs`. Rechaza:

- **Titular:** idéntico al `<title>` u `og:title` de la fuente (`autodraft.mjs:69`, `:137`), mayoritariamente en inglés, o con separadores de sitio (« | »).
- **Slug:** empieza por un dominio, `^[a-z0-9]+-(com|ai|io|org|dev)-` (`autodraft.mjs:131`).
- **Texto de plantilla:** «queda pendiente la revisión editorial» (`:124`), «publicó esto el», «según la fecha que declara su propia página» (`:96`), o fechas ISO en la prosa.
- **Citas cortadas o pegadas:** «…»», «..»», «.».» (`recortar`, `:43-46`, `:101`, `:119`).
- **Entradilla hecha sólo de citas en otro idioma.**
- **Autor:** si lo firmó el automatismo y nadie lo ha reescrito, no puede publicarse firmado como «Redacción de Free AI Radar». Hoy `draftToNewsItem` fuerza ese autor y `verification: 'verified'` (`newsroom.ts:147` y `:149`).

**Orden obligado:** primero retirar o reescribir Cohere y Together (§4). Si la comprobación entrase en `isPublishable` (lo aplica el build), con esas dos filas vivas en Supabase **el build de Production fallaría**.

### 6.3 Extractor y fechas

- **Disponibilidad:** `scripts/verify/extract.mjs:212` clasifica «rolling out today» como `available` antes de mirar `limited` (`:217`). «Rolling out today to a limited set of organizations» sale «Disponible». Propuesta:
  - evaluar los calificadores limitantes de la misma frase antes que los genéricos;
  - buscar sólo dentro del cuerpo del artículo (`<main>`/`<article>`), no en barras promocionales como la de Together (`:348-365`).
- **Fechas:** exigir en la ruta manual lo que `canAutoPublish` ya exige en la automática: que la fecha aparezca en la página del artículo, no sólo en el feed.
- **Caducidad de hechos:** relectura periódica (por ejemplo mensual) de las fuentes de lo publicado, con aviso a la mesa cuando cambie el texto relevante. Nunca editar solo. Dos de los errores de hoy los habría detectado.

## 7. Presentación de `/noticias`: recomendaciones (no implementadas)

1. **Cuatro bloques, cada pieza en uno solo**, de la más reciente a la más antigua, en este orden:
   - **actualidad:** últimos 45 días, producto;
   - **cambios en el uso gratuito:** últimos 45 días;
   - **contexto sectorial:** informes, rondas, compras, investigación y alianzas;
   - **archivo:** agrupado por mes.

   Para distinguir actualidad de contexto sin deducirlo hace falta un campo explícito, por ejemplo `section` opcional en `NewsItem`. Es un cambio de contrato: decide Juan.
2. **«Lo que cambia si no pagas» debe respetar la ventana de 45 días y `frontPage`.** Hoy `getFreePlanNews()` (`src/lib/data/news.ts:99`) no filtra por edad, por eso Sonnet 5, Teachers y Leanstral siguen encima de septiembre. Es un filtro de sólo lectura, sin tocar `repartirPortada`, que usa el informe diario.
3. **Pastillas** (`src/pages/noticias/[slug].astro:120-131`, `NewsCard.astro`):
   - disponibilidad y PG sólo en noticias de producto;
   - fuera de informes, rondas, compras e investigaciones;
   - fuera de software sin planes, como Ollama.
4. **«Verificada»:** fuera de la franja; se dice en la firma con su fecha.
5. **Firma y botón:**
   - la firma dice «publicado por el fabricante» (`[slug].astro:203`) y debería decir «fecha de la fuente», porque Accomplish o Manifold no son fabricantes;
   - el botón «Leer el anuncio oficial» (`:136`) debería ser «Leer la fuente original» cuando no es un anuncio. La e2e `tests/e2e/noticias.spec.ts` busca el texto actual y habría que ajustarla.
6. **Título y descripción** (`index.astro:86-87`): «25 novedades verificadas» cuando una es parcial.
7. **RSS:**
   - el botón (`index.astro:258`) y el `<link rel="alternate">` (`BaseLayout.astro:94`) llevan a un feed sin noticias;
   - opciones: crear un feed de noticias o quitar el botón.
8. **«Historial de cambios»:**
   - son anotaciones del catálogo de 2022-2024 dentro de Noticias (`index.astro:205`);
   - propuesta: sacarlo de esta página;
   - tiene su propia e2e (`historial de cambios en noticias`), que habría que mover.
9. **Filtros:**
   - las cifras cuentan las 25 piezas, pero el filtro sólo actúa sobre la rejilla de portada (12);
   - por eso «Imagen», «Vídeo» o «Plataformas de agentes» muestran «No hay noticias en esa categoría todavía»;
   - el filtro debe cubrir todos los bloques y ocultar los vacíos.
10. **«Seguir leyendo»** (`[slug].astro:21`): hoy va por categoría. Propuesta: por sección y fecha, para que una ronda de chips no salga bajo un modelo.
11. **Taxonomía:** faltan categorías para seguridad e industria (Positron, NVIDIA, ElevenLabs/UMG, informe de amenazas). Es un contrato: decide Juan.

## 8. Qué necesita autorización de Juan

1. **Cohere:** aplicar la reescritura, vía A o B (§4.1).
2. **Together:** retirarla, vía A o B, con 301 (§4.2).
3. **Runway:** conservar la reescritura con su slug actual, cambiar el slug con 301, o retirarla.
4. **NVIDIA (opcional):** cambiar su slug con 301.
5. **Autopublicación:** pausarla (`MAX_AUTOPUBLICADAS = 0`) y aprobar la comprobación de legibilidad y los cambios del extractor (§6).
6. **Presentación y contratos:** secciones, filtro del bloque PG por edad, pastillas, firma, RSS, historial y categorías (§7).
7. **Pieza nueva o actualización de Accomplish sobre Codex:** la fuente primaria existe desde el 15 sep.
8. **Llegada a `main` y despliegue:** ver §10.

## 9. Pruebas

- `node scripts/newsroom-sync.mjs --seed`: tras cada tanda. La semilla y `generated/news.json` quedan idénticos byte a byte. La semilla adopta el orden del generador, así que GPT-6 Astra cambia de posición al cambiar su fecha.
- `npm run data:news:validate` (15 ficheros) más `tests/unit/lifecycle.test.ts`: **16 ficheros, 458 pruebas, todas pasan.** La tanda 2 falló una vez, con razón: el impacto de Accomplish pasaba del límite de 600 caracteres. Se acortó antes del commit.
- Otras suites que leen noticias (`web-v2-saneamiento`, `web-v2-fase3`, `web-v2-portada`, `vocabulario`, `sitemap`, `series`, `publicar`, `promesas`, `coherencia`): **9 ficheros, 117 pruebas, todas pasan.**
- Prueba temporal de los textos del §4 (esquema, puerta y duplicados): pasa. Se borró y no está versionada.
- **No ejecutado:** e2e de Playwright (necesita servidor) y build de Astro.
  - El H1 de Sonnet 5 sigue conteniendo «Claude Sonnet 5», que es lo que comprueba `noticias.spec.ts`.
  - La ruta de Accomplish de `palabras-pegadas.spec.ts` no cambia de estructura.

## 10. Riesgos y avisos

- **La rama sale de `verdad-y-utilidad`, no de `main`.** `main` (lo desplegado) va 12 commits por detrás.
  - Para publicar sólo estas correcciones en `main`, hay que llevar los tres commits de datos (`05a0cc9`, `37b3e4a`, `c4df1d7`) con `cherry-pick` desde el worktree de `main`.
  - Sólo tocan `src/data/news/news.json` y `src/data/generated/news.json`, idénticos en ambas ramas antes de empezar, así que deberían aplicarse limpios.
  - Hacer merge de la rama arrastraría `verdad-y-utilidad` entero.
- **Sitemap:** `lastmod` de las noticias sale de `checkedAt` (`src/pages/sitemap.xml.ts:52`). 21 páginas pasan a 2026-09-16. Es correcto, porque su contenido cambia.
- **Cohere y Together** siguen publicadas con el texto automático hasta que se aplique el §4. Nada de este commit las cambia.
- **Runway** podría existir también en `newsroom_published`. Da igual: la semilla gana.
- **Catálogo (fuera de este encargo):** las fichas `deepseek-v4-flash`, `deepseek-v4-pro`, `claude-sonnet-5` y `suno-ai` pueden haber quedado desactualizadas por hechos confirmados hoy en fuentes primarias.
- **Wording de GPT-6 Astra:** la página de OpenAI dice «the world's most intelligent and aligned model»; el feed, «our most intelligent and aligned model yet». La pieza sigue a la página.
- **`node_modules`:** el worktree `free-ai-radar-noticias` usa una unión (junction) al `node_modules` del checkout principal. Antes de `git worktree remove`, quitar la unión con `cmd /c rmdir <worktree>\node_modules` (sin `/s`). Nunca `npm ci` a través de ella.

## Apéndice A. JSON preparado (no aplicado)

### A.1 Cohere, reescrita

```json
{
  "id": "news-2026-09-10-cohere-com-introducing-north-small-translate-a-leading-sovereign-open-weig",
  "slug": "cohere-com-introducing-north-small-translate-a-leading-sovereign-open-weight-mac",
  "title": "Cohere publica North Small Translate, un modelo de traducción con pesos abiertos para uso no comercial",
  "author": "Redacción de Free AI Radar",
  "summary": "Cohere presentó el 10 de septiembre North Small Translate, su primer modelo de traducción de la familia North, con soporte para más de 50 idiomas. Es un modelo de mezcla de expertos de 218.000 millones de parámetros, de los que activa 25.000 millones. Sus pesos se pueden descargar en Hugging Face con licencia CC BY-NC 4.0, para investigación y uso no comercial; el uso comercial exige licencia, y las empresas también pueden usarlo a través de Language Weaver, de RWS.",
  "impact": "Ejecutarlo en local exige hardware de centro de datos: Cohere indica como mínimo una GPU B200 o dos H100 con cuantización W4A4. También ofrece una demo en Hugging Face. Según las pruebas de la propia Cohere, que usan GPT-5.6 Sol como juez, obtiene 83,6 puntos en WMT26 y supera a DeepL y a Google Translate; son resultados de la empresa, no de un evaluador independiente.",
  "category": "local-open-source",
  "eventType": "lanzamiento",
  "availability": "available",
  "publishedAt": "2026-09-10",
  "checkedAt": "2026-09-16",
  "officialUrl": "https://cohere.com/blog/north-small-translate",
  "sources": [
    {
      "url": "https://cohere.com/blog/north-small-translate",
      "kind": "official",
      "label": "Introducing North Small Translate: A leading sovereign open-weight machine translation model",
      "checkedAt": "2026-09-16",
      "publisher": "cohere.com"
    }
  ],
  "relatedTools": [],
  "affectsFreePlan": "unverified",
  "verification": "verified",
  "status": "published",
  "unconfirmed": [],
  "frontPage": true
}
```

**Comprobado en cohere.com el 16 sep:**
- fecha: 2026-09-10;
- «first translation model in the North model family»;
- «50+ languages»;
- «218B total; 25B active»;
- «Now available for research and non-commercial use under a CC BY-NC 4.0 license»;
- «Hardware (minimum) 1× B200 @ W4A4 / 2× H100s @ W4A4»;
- «83.6 score … outperforming … DeepL and Google Translate»;
- «using GPT-5.6-Sol as a judge»;
- Language Weaver de RWS.

**Qué no se deduce:** no se afirma que sea «gratis», porque la página no lo dice. Por eso PG queda «sin confirmar».

**Id:** es el que genera `autodraft.mjs` para ese slug. Conviene confirmarlo contra la fila real si se elige la vía B.

### A.2 Together, archivada

```json
{
  "id": "news-2026-09-09-together-ai-the-open-source-ai-stack",
  "slug": "together-ai-the-open-source-ai-stack",
  "title": "The Open Source AI Stack",
  "author": "Redacción de Free AI Radar",
  "summary": "together.ai publicó esto el 2026-09-09, según la fecha que declara su propia página. Sobre la disponibilidad, el anuncio dice: «⚡ On-demand B200s now available on Together GPU Clusters →.».",
  "impact": "La página no menciona ninguna capa gratuita, ni para confirmarla ni para descartarla, así que no podemos decir qué cambia para quien no paga. Sobre pesos y licencia: «The Open Source AI Stack .». Verificado leyendo la página del fabricante; queda pendiente la revisión editorial.",
  "category": "local-open-source",
  "eventType": "lanzamiento",
  "availability": "available",
  "publishedAt": "2026-09-09",
  "checkedAt": "2026-09-10",
  "officialUrl": "https://together.ai/blog/the-open-source-ai-stack",
  "sources": [
    {
      "url": "https://together.ai/blog/the-open-source-ai-stack",
      "kind": "official",
      "label": "The Open Source AI Stack",
      "checkedAt": "2026-09-10",
      "publisher": "together.ai"
    }
  ],
  "relatedTools": [],
  "affectsFreePlan": "unverified",
  "verification": "verified",
  "status": "archived",
  "unconfirmed": [
    "RETIRADA DE PUBLICACIÓN: guía de Together AI, no una noticia; importada automáticamente con la disponibilidad tomada de una barra promocional."
  ],
  "frontPage": false
}
```

**Cómo está hecha:**
- **Texto:** conserva el que se publicó (tomado de la web el 16 sep), para que el historial muestre qué salió. No se enseña a ningún lector.
- **Campo que retira la pieza:** `status: "archived"`.
- **Nota de retirada:** va en mayúsculas en `unconfirmed`, la convención que vigila `news.test.ts`.
- **Fuente releída el 16 sep:** «Published 9/9/2026», una guía «deep dive into the open model AI stack».
