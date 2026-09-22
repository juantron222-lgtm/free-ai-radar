# Cierre para publicación

21 de septiembre de 2026. Rama `verdad-y-utilidad`. Este documento cierra
[el informe del 17](informe-verdad-y-utilidad-2026-09-17.md): lo que allí quedaba pendiente de tu
decisión está resuelto aquí, y lo que no he hecho está dicho con su motivo.

## 1. Lo que has decidido, y cómo ha quedado

### 1.1 DeepSeek V4 Flash: corregido

DeepSeek lo retiró de su API el 10 de septiembre. Su página de precios lo dice con todas las letras:

> Use `deepseek-flash` as the model name. The legacy names `deepseek-v4-flash` and
> `deepseek-v4-flash-vision-exp` are still accepted, but the corresponding models have been retired,
> their requests are served by the DeepSeek-V4.1-Flash model and billed at the Flash price.

- **Los precios viejos salen de la ficha** y quedan en su historial, con la fecha del fabricante
  (10/09) y el enlace al anuncio. Es el único sitio donde un precio que ya no se cobra puede estar
  sin engañar a nadie.
- **La ficha se queda**, marcada como retirada. Borrarla rompería los enlaces de quien la guardó y
  dejaría sin respuesta a quien la busca por su nombre, que es justo cuando más falta hace contestar.
- **Hay ficha vigente**: creé la de DeepSeek V4.1 Flash, con lo que se puede citar de sus páginas
  oficiales —licencia MIT, 552.000 millones de parámetros, contexto de 1M, precios de API— y con el
  alta, la tarjeta y el uso comercial explícitamente sin comprobar. La retirada enlaza a ella.
- **El vocabulario tenía un hueco.** Una ficha retirada no es «verificada» ni «parcial»: con sus
  hechos confirmados y nada pendiente, la regla anterior la llamaba «Verificación parcial» sin tener
  nada que nombrar como pendiente. Ahora hay un cuarto estado, **Retirada**, y las cuatro cifras de
  la portada siguen sumando el catálogo entero.

**Algo que no me pediste y conviene que sepas:** el mismo anuncio dice que desde el 14 de septiembre
las peticiones a `deepseek-v4-pro` también las atiende V4.1-Flash, «until V4.1-Pro launches». Pero la
tabla de precios de hoy sigue listando `deepseek-v4-pro` como modelo con sus propias tarifas. Son dos
páginas oficiales que no dicen lo mismo. He dejado la ficha de V4 Pro como dice la tabla de precios,
que es la que un lector consultaría, y lo dejo anotado aquí en vez de elegir por mi cuenta.

### 1.2 Las 21 deducciones: fuera

Aplicado en estricto. **El catálogo no publica ninguna deducción**, y lo vigila una prueba.

- **Trece pasan a «Sin comprobar».** Su razonamiento, la página consultada y qué haría falta para
  cerrarlas están en [`docs/deducciones-retiradas-2026-09-21.md`](deducciones-retiradas-2026-09-21.md).
- **Ocho volvieron con cita literal**, porque al releer la fuente sí contestaba. No es una amnistía:
  son citas nuevas, no deducciones rescatadas.

El criterio que las separa, para que puedas discutirlo:

| Licencia | ¿Contesta «uso comercial»? | Por qué |
|---|---|---|
| MIT | **Sí** | Concede «…and/or **sell** copies of the Software». |
| CC BY-NC 4.0 | **Sí** | «NonCommercial — You may not use the material for commercial purposes.» |
| Apache-2.0 | **No** | No menciona el uso comercial en ningún punto de su articulado. |

Por eso Whisper, F5-TTS y DeepSeek conservan su respuesta y **Kokoro vuelve a «Sin comprobar»**.

**Lo que ha costado:** la portada enseña cuatro recomendadas en vez de cinco. La quinta era Zapier
Agents y su «no pide tarjeta» era una deducción nuestra; sin ella, esa clase de IA se queda sin
nadie que cumpla las condiciones. Rellenar el hueco con la siguiente menos comprobada sería lo
contrario de lo que promete esa tabla.

**Lo que ha destapado.** Releer las fuentes sacó dos cosas que no eran el encargo:

1. **Pika ha cambiado su plan gratuito.** Su tabla da hoy «0 credits / month · packs only»: no hay
   asignación mensual y generar exige comprar packs. La ficha decía 80 créditos de vídeo al mes
   renovables y generación a 480p. Corregido, con entrada en el historial y el aviso de que Pika no
   publica la fecha del cambio.
2. **Su marca de agua era al revés.** La ficha deducía que la salida gratuita llevaba marca; su
   tabla dice «Included: No watermark».

**Lo que queda, y no he tocado:** doce valores del catálogo están decididos sin ninguna evidencia
registrada, casi todos licencias de pesos abiertos anteriores a que existiera el registro (Gemma 4,
Llama 4, Mistral ×3, Qwen3-27B, Phi-4, GLM-5, AudioCraft, Kling, DeepSeek V4 Pro). Tu decisión era
sobre las 21 deducciones; bajarlos sin leer sus licencias tiraría información cierta. Están
nombrados uno a uno en la suite para que la lista no crezca sola. **Son la siguiente tanda.**

### 1.3 Privacidad: la fila de facturación, fuera

- **Privacidad** pierde «Datos de facturación · Cobrar la suscripción y emitir facturas», y añade a
  «Lo que no hacemos»: no se recogen datos de pago, y la página lo dirá *antes* del primer cargo.
- **Derechos** perdía lo mismo por otro lado: conservaba «las facturas emitidas, durante seis años».
  No hay facturas que guardar.
- **Términos §4** se queda como está: ya dice «Radar Pro todavía no se puede contratar: no hay precio
  publicado ni se cobra nada» y lo que sigue está redactado en futuro. No describe un tratamiento de
  datos, que es lo que pediste quitar.
- La lista de encargados ya era condicional: Stripe sólo aparece si está configurado, y no lo está.

**Un cabo suelto que no he tocado:** el formulario de contacto ofrece «Suscripción o facturación»
como motivo. No es un tratamiento de datos, así que queda fuera de lo que decidiste, pero es un
callejón sin salida para quien lo elija.

### 1.4 Noticias: los siete puntos

`noticias-editorial` está integrada. **Nada se ha borrado y no se ha tocado Supabase.**

| Punto | Qué he hecho |
|---|---|
| 1. Retirar Together | Vía A: entra en la semilla con `status: archived`, que gana sobre Supabase por slug. Su fila de Production queda intacta como historial. 301 a `/noticias`. |
| 2. Reescribir Cohere | Aplicada, con la URL nueva (ver abajo). |
| 3. Slug de Runway | **Cambiado**, con 301. El motivo no estaba decidido de antemano: lo decidió la puerta nueva. |
| 4. Slug de NVIDIA | **Sin cambiar.** Ver abajo. |
| 5. Pausar la autopublicación | `MAX_AUTOPUBLICADAS = 0` y una puerta de legibilidad en las dos rutas. |
| 6. Presentación de /noticias | Cinco arreglos hechos, cuatro aplazados con propuesta. |
| 7. Fuente de Accomplish | Pieza nueva sobre los dos escapes del sandbox de Codex. |

**Por qué Cohere y Runway cambian de URL y NVIDIA no.** Escribí la puerta de legibilidad que pediste
—`checkReaderReady`, que detecta el texto de trabajo del generador— y entre sus marcas está el slug
que empieza por el dominio de la fuente, porque lo arma `autodraft.mjs`. Al pasarla sobre lo
publicado señaló exactamente tres piezas: Together, Cohere y Runway. Tener una regla que llama «sin
reescribir» a algo que sigues publicando es no creértela, así que las dos que se quedan pasan a URL
en español con 301:

- `/noticias/cohere-com-introducing-north-small-translate-…` → `/noticias/cohere-north-small-translate`
- `/noticias/runway-com-runway-research-introducing-gwm-worlds-2` → `/noticias/runway-gwm-worlds-2`

El de NVIDIA (`nvidia-compra-hugging-face`) no lo formó ningún automatismo y la puerta no lo señala:
es un slug en español, escrito por una persona, que dice «compra» donde la fuente dice «has agreed to
acquire». El titular ya está corregido. Cambiar la URL costaría los enlaces entrantes de una página
indexada a cambio de una palabra que no se lee como afirmación. **Si prefieres cambiarlo, es una
línea.**

**Cómo se conserva lo retirado.** Cada slug retirado se queda en la semilla con `status: archived`.
Hace dos cosas: deja constancia de que existió y con qué se sustituye, e impide que la fila de
Supabase vuelva a publicarse por un slug que ya no está en la semilla. El texto original de Cohere y
Runway vive en la fila de Production y en el historial de git, no en la entrada archivada, y la nota
de cada una lo dice así en vez de prometer lo que no hace.

**La autopublicación.** La pasada sigue descubriendo, leyendo fuentes, verificando y dejando
borradores en la mesa. Deja de aprobarlos. Además, `checkReaderReady` la aplican las dos rutas —la
manual también— porque el fallo no era de la automática: era que nadie lo comprobaba en ninguna de
las dos. Busca la coletilla «queda pendiente la revisión editorial», la fecha en ISO dentro de la
prosa, las citas cortadas, el separador del sitio en el titular, el slug con dominio y el titular sin
traducir. Con ella puesta, **las 28 noticias publicadas pasan y las 3 archivadas son exactamente las
tres que salieron solas.**

**Presentación de /noticias.** Hecho:

1. **«Lo que cambia si no pagas» respeta la ventana de 45 días** y la retirada manual. Abría con una
   noticia de junio por encima de las de septiembre.
2. **El filtro alcanza los tres bloques.** Contaba 28 y sólo filtraba la rejilla de portada, así que
   «Imagen» podía contestar «no hay noticias en esa categoría» teniendo alguna en el archivo. Un
   bloque que se queda sin nada ahora se esconde.
3. **El RSS incluye las noticias.** El botón de /noticias llevaba a un feed de cuarenta elementos sin
   una sola noticia.
4. **La firma dice «fecha de la fuente»**, no «publicado por el fabricante»: Accomplish no fabrica
   Codex, lo investigó. El estado de verificación se dice ahí, con su fecha, en vez de como pastilla
   suelta.
5. **El botón dice «Leer la fuente original».** La mitad de lo que enlazamos no es un anuncio.
6. **La descripción ya no llama verificadas a las parciales.**

Aplazado, con propuesta, porque son cambios de contrato y no quiero estrenarlos el día de la
publicación:

- **Secciones** (actualidad / uso gratuito / contexto / archivo). Necesita un campo `section`
  opcional en `NewsItem`. El informe ya tiene asignada la sección de cada pieza, así que es
  mecánico; lo que no es mecánico es rehacer el orden de la página con las e2e apuntando al actual.
- **Pastillas de disponibilidad y plan gratuito sólo en noticias de producto.** Depende de lo
  anterior: sin secciones no hay forma de distinguir un informe de un lanzamiento sin deducirlo.
- **«Seguir leyendo» por sección y fecha**, en vez de por categoría.
- **Categorías que faltan** para seguridad e industria. Positron, NVIDIA/Hugging Face, ElevenLabs/UMG
  y el informe de amenazas están hoy en la categoría menos mala del esquema.
- **Sacar «Historial de cambios» de /noticias.** Son anotaciones del catálogo de 2022-2024. La
  sección ya avisa de que es historial y no actualidad, así que es el menos urgente de todos.

## 2. QA

| Comprobación | Resultado |
|---|---|
| Vitest (unidad e integración) | 1500 / 1500 |
| Lint (`--max-warnings=0`) | 0 avisos |
| Tipos (`astro check`) | 0 errores |
| Build de producción en local | Correcto |
| E2E Chromium | 231 / 231 |
| E2E Firefox | 221 / 221 (10 omitidas por diseño: no emula viewport móvil) |
| E2E WebKit | 231 / 231 |
| E2E móvil (Pixel 7) | 231 / 231 |
| E2E móvil Safari (iPhone 14) | 231 / 231 |
| E2E escritorio | 231 / 231 |
| Rastreo completo (consola, red, canónicos, títulos, h1, 404, sitemap, RSS) | Verde en los seis |
| CSP de producción sobre las rutas principales | Verde |

**Un falso positivo, y de dónde salía.** La primera pasada de Chromium falló una prueba de inicio de
sesión. La causa estaba en su propio registro: seis errores de `[vite] An error happened during full
reload · Failed to load url astro:server-app.js` en el instante exacto de la prueba. El servidor de
desarrollo se estaba recargando porque yo estaba editando ficheros del repositorio mientras corría la
suite. Repetida sin tocar nada: **231 / 231 y cero errores de Vite**. La misma prueba pasa en los
otros cinco motores.

**Inspección manual en navegador** (servidor local, consola y red leídas en cada página): portada,
catálogo con búsqueda por tarea, /noticias con el filtro de categorías, la pieza nueva de Accomplish,
la ficha retirada de DeepSeek, la de V4.1 Flash, la de Pika, el comparador de tres, privacidad y
derechos. Sin errores de consola ni peticiones propias fallidas. Los tres 301 nuevos comprobados uno
a uno. A 375 px, ninguna de las nueve páginas revisadas se desborda. Probado el cartel de cookies y
el modo oscuro sobre el aviso de retirada.

**Tres defectos que encontró esa inspección, y que no encontró ninguna prueba:**

1. Cada noticia decía «Pulsa **Avisarme** en cualquiera de estas fichas y te escribimos cuando su
   plan gratuito cambie otra vez». Ese botón se retiró en esta misma fase, con el resto de promesas
   de funciones inexistentes. Corregido.
2. El tipo de fuente se leía **«anuncio oficial»** debajo de cada enlace. El análisis de Accomplish
   no es un anuncio ni lo firma el fabricante de Codex. Ahora dice «página oficial».
3. El título de la ficha retirada seguía preguntando **«¿es gratis de verdad?»**. Es lo primero que
   ve quien llega desde un buscador. Ahora dice «retirada por su fabricante, qué la sustituye».

**No comprobado:** sesión registrada y de administrador a mano (sí las cubren las e2e de cuenta),
zoom al 200 %, y contraste medido con herramienta.

## 3. Catálogo, antes y después

| | `main` (lo desplegado) | Rama |
|---|---|---|
| Fichas | 94 | 95 |
| Evidencias con fuente | 183 | 265 |
| · citadas (`stated`) | 163 | 207 |
| · «el fabricante no lo publica» | 8 | 58 |
| · **deducciones** | **12** | **0** |
| Tarjeta: no la piden | 37 | 41 |
| Uso comercial: sí / no / sin dato | 15 / 9 / 67 | 17 / 11 / 64 |
| Marca de agua: sí / no / sin dato | 2 / 15 / 77 | 5 / 16 / 74 |
| Fichas con logo | 34 | 84 |
| Noticias publicadas | 26 | 28 |

## 4. Datos publicados que cambian, y puedes vetar

Lo que Production dice hoy y la rama dice distinto. Todo lleva cita oficial.

### 4.1 Del informe del 17 (sin cambios)

Copilot, Claude y Perplexity a «uso comercial: no», ChatGPT / Runway / HeyGen a «sí», ComfyUI y SD
WebUI dejan de «requerir NVIDIA», Ollama sí tiene app, los precios en hora valle de DeepSeek V4 Pro,
Suno sin la equivalencia en canciones, LM Studio con límites y Hugging Face Spaces con cuota.
La tabla completa está en el §4 de aquel informe.

### 4.2 Nuevo del 21

| Ficha | Production dice | La rama dice | Fuente |
|---|---|---|---|
| **Pika Labs** | 80 créditos de vídeo/mes, a 480p | **Sin capa gratuita**: «0 credits / month · packs only» | pika.art/pricing |
| **Pika Labs** | Marca de agua: **sí** (deducido) | Marca de agua: **no** · «Included: No watermark» | pika.art/pricing |
| **DeepSeek V4 Flash** | Verificada, con precios de API | **Retirada** · precios sólo en el historial | api-docs.deepseek.com |
| **Kokoro** | Uso comercial: sí | **Sin comprobar** (Apache-2.0 no lo dice) | github.com/hexgrad/kokoro |
| **Lovable** | Uso comercial: sí | **Sin comprobar** | lovable.dev/terms |
| **Whisper** | Sin tarjeta y sin registro | **Sin comprobar** los dos | github.com/openai/whisper |
| *(nueva)* DeepSeek V4.1 Flash | — | Ficha nueva, pendiente de revisión | huggingface.co · api-docs |

En Noticias, además de lo ya listado: GPT-6 Astra cambia de fecha (9 → **3 de septiembre**), la
Agents API pasa de «Disponible» a **beta pública**, Suno pasa a marcar que afecta al plan gratuito, y
Ollama ×2 y Mistral Medium 3.5 pierden una etiqueta de plan gratuito que no tenía fuente.

## 5. Qué hago si dices que sí

1. Sincronizo con `main` desde el worktree de `main`: merge, push y despliegue a Production.
2. Verifico www.freeairadar.com: portada, búsqueda, una ficha, el comparador, /noticias, los tres
   301 nuevos y el móvil.
3. Si algo falla, revierto al deployment actual.

No toco Supabase. Las filas de Cohere, Together y Runway se quedan donde están: la semilla gana por
slug, así que la web enseñará lo de la rama y esas filas quedan como historial.

## 6. Lo que sigue dependiendo de ti

1. **Los datos del titular legal** —nombre, NIF, domicilio—. Se rellenan en
   `src/lib/legal/titular.ts`: cambiar `null` por el dato basta y las páginas no se tocan. Hoy se ven
   como «Pendiente · lo aporta el titular».
2. **El slug de NVIDIA**, si prefieres cambiarlo. Es una línea.
3. **Los doce valores decididos sin evidencia** (§1.2). Dime si los bajo a «Sin comprobar» o si abro
   sus licencias una por una, que es lo que recomiendo.
4. **Las cuatro mejoras de /noticias que he aplazado** (§1.4): secciones, pastillas, «seguir leyendo»
   y las categorías que faltan. Todas tocan el contrato de datos.
5. **La contradicción de DeepSeek** entre su anuncio y su tabla de precios sobre V4 Pro (§1.1).
6. **Hailuo AI** sigue con la página que no se deja leer, desde el informe anterior.
