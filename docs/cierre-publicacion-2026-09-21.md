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
| Vitest (unidad e integración) | PENDIENTE |
| Lint (`--max-warnings=0`) | 0 avisos |
| Tipos (`astro check`) | 0 errores |
| Build de producción en local | Correcto |
| E2E Chromium | PENDIENTE |
| E2E Firefox | PENDIENTE |
| E2E WebKit | PENDIENTE |
| E2E móvil (Pixel 7) | PENDIENTE |
| E2E móvil Safari (iPhone 14) | PENDIENTE |
| E2E escritorio | PENDIENTE |

## 3. Datos publicados que cambian

## 4. Qué hago si dices que sí

## 5. Lo que sigue pendiente de ti
