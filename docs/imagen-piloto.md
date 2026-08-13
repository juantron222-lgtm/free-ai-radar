# Imagen: verificación de las ocho y rediseño piloto — 13 de agosto de 2026

Rama `catalog-rebuild`. `main` intacta en `88b1956`. Sin despliegue, sin
Newsroom, sin tocar otras categorías.

---

## 1. Las ocho prioritarias

Todo lo que sigue salió de una página oficial abierta hoy. Cuando `WebFetch`
recibió un 403 se leyó la misma página en un navegador real, sin tocar ninguna
protección; cuando ni así, se buscó otra fuente oficial —documentación, centro
de ayuda, facturación—; y cuando tampoco, el campo se quedó sin afirmar.

### Midjourney — `unknown` → **`paid_only`**

Su propia documentación lo dice sin rodeos:

> «A limited trial is available on the niji · journey app […] No free trial is
> currently available in Discord or the midjourney.com website.»

La ficha anterior decía *«Ocasionalmente ofrece trials de ~25 generaciones»*.
Ese «~25» no estaba en ninguna parte.

| | |
|---|---|
| Precio mínimo | Basic 10 $/mes · 96 $/año |
| Uso comercial | «you own all the images and videos you create»; empresas de más de 1 M$ necesitan Pro o Mega |
| Capacidades | 9, de los títulos de la documentación |
| Marca de agua · tarjeta | sin constar · sí (todo es suscripción) |

El vídeo es **`image-to-video`**, no `text-to-video`: el artículo abre con
«Turn your images into captivating 5 second videos» y describe alimentar una
imagen como primer fotograma.

### Leonardo — `unknown` → **`credits`, diarios, con cifra**

**150 Fast Tokens al día**, banco de 150, plan Essential desde 12 $/mes.

Y una condición que la ficha anterior no mencionaba: en el plan gratuito las
creaciones son **públicas**. Su centro de ayuda dice que quedan visibles para
que otros usuarios las copien y remezclen. El uso comercial sí está permitido
—«You can indeed use your images for commercial purposes!»— en ambos planes.

### Grok Imagine — `unknown` → **`freemium`**, con un matiz que la tarjeta escondía

La tarjeta de SuperGrok anuncia «Image and video generation», lo que sugiere que
ninguna de las dos está en el plan gratuito. **La tabla comparativa dice otra
cosa:**

| Fila | Free | Resto |
|---|---|---|
| Image generation (Imagine) | ✔ | ✔ |
| Video generation | — | ✔ |

Se comprobó comparando los iconos SVG de cada celda con filas de control cuyo
resultado ya se conocía (SSO y RBAC, marcados sólo en Enterprise). **Imagen sí,
vídeo no.** Los límites se describen como «generous limits» y no se publican.
Las cinco capacidades verificadas en `docs.x.ai` se mantienen intactas.

### Ideogram — **nueva ficha**

**10 créditos lentos a la semana.** Lo interesante está en la segunda tabla: en
el plan gratuito constan como *no incluidos* la referencia de estilo, la de
personaje, Magic Fill, Extend, el escalado y el recorte de fondo. Y por defecto
todas las imágenes se publican en la comunidad.

Uso comercial, citado: «We do not claim ownership of your generated images, and
you're free to use them for any purpose, including commercial use.»

### Krea — **nueva ficha**

**100 unidades al día**, que su propia tabla equipara a *una* generación de Nano
Banana 2.

El texto plano del plan Free enumera «All image models», «All video models» y
«Commercial license», pero esa enumeración es la lista compartida por todos los
planes: cada fila lleva al lado un aspa o un visto. **En Free las tres llevan
aspa.** De ahí `commercialUse: 'no'` — no es una suposición, es una exclusión
declarada.

Los precios de los planes de pago no están en el DOM de su página, así que el
precio mínimo queda sin verificar.

### Google Gemini — `unknown` → **`freemium`**

Dos productos, dos respuestas opuestas, y confundirlos sería publicar lo
contrario de lo que dice una de las dos fuentes:

| | Generación de imágenes en la capa gratuita |
|---|---|
| App Gemini (`gemini.google/subscriptions`) | **Sí** — «Generación y edición de imágenes. Se pueden aplicar límites de uso» |
| API (`ai.google.dev/gemini-api/docs/pricing`) | **No** — todos los modelos de imagen figuran como «Not available» |

Existe una **cuota diaria** de imágenes: el soporte oficial habla de «your daily
quota of Nano Banana 2 images». La cifra no se publica.

`startEffort` pasa de `instant` a `signup`: para generar imágenes hay que estar
identificado.

### Perplexity — **no entra en Imagen**, y `unknown` → **`freemium`**

Dos razones, las dos de fuente oficial.

**Su plan gratuito excluye expresamente la generación de imágenes:**

> «What do I get with the Free (Standard) plan? […] No access to advanced AI
> models, image generation, or premium support.»

**Y cuando la hay, no la genera Perplexity.** El artículo «Can Perplexity
generate images?» explica que los modelos son GPT Image 1, Nano Banana o
Seedream 4.5, elegidos en ajustes, y que no hay un botón de imagen: se pide
escribiendo. Marcarla con `text-to-image` diría que genera imágenes, que es
exactamente lo que no se hizo con Hugging Face Spaces por la misma razón.

Se queda en Investigación. Su ficha mejora igualmente: `freemium`, con los
límites del plan Standard citados.

### Replicate — `unknown` → **`trial`**

La página de precios no menciona ningún plan gratuito. La de facturación sí:

> «You can run select models on Replicate for free, but after a bit you'll be
> asked to set up billing.»

No hay cantidad, ni frecuencia, ni renovación. `trial` y no `credits`: es un
acceso gratuito que termina, no una cuota que vuelve.

---

## 2. Qué sigue sin poder afirmarse

| Herramienta | Campo | Qué haría falta |
|---|---|---|
| Todas menos Krea, Leonardo, Ideogram, Playground, Recraft | `commercialUse` | Leer los términos de cada una, uno a uno |
| Todas menos una | `hasWatermark` | Ninguna página de precios lo menciona; hay que buscarlo en los términos |
| Casi todas | `requiresCreditCard` | Sólo se sabe abriendo el alta. Puede requerir crear cuenta |
| Krea | precio mínimo | Sus precios no están en el DOM de la página |
| Grok | límites del plan gratuito | xAI dice «generous limits» y no publica cifras |
| Google Gemini | cuántas imágenes al día | Google confirma que hay cuota diaria; no dice cuánta |
| Replicate | qué modelos y cuánto tiempo | «select models», «after a bit» |
| SD.Next | capacidades | Su página no enumera funciones de forma legible |

Ninguno se ha rellenado a ojo.

---

## 3. `startEffortReason`

Campo nuevo, migración `0011`. Una línea por ficha, **las 35**.

`startEffort` es el único campo del catálogo exento de cita, porque describe lo
que cuesta empezar y eso lo observamos nosotros. Esa exención lo vuelve el más
fácil de rellenar a ojo y el más difícil de discutir después. Esto es el rastro:

```
signup    → «Hay que crear cuenta y elegir plan —aunque sea el de 0 $— antes de generar.»
technical → «Exige instalar el entorno, descargar los modelos y montar el grafo de nodos.»
install   → «Se descarga y se ejecuta con un solo fichero, pero exige GPU y modelos de varios gigas.»
instant   → «Cada herramienta se usa desde su página sin pasar por un alta previa.»
```

Entra en el espejo de Postgres, a diferencia de `evidence`: acompaña siempre al
valor que explica, y un valor sin su criterio es la mitad del dato.

---

## 4. `/imagen`

Ruta propia. `/categorias/imagen` responde **301** hacia ella, así que no hay dos
URLs compitiendo por el mismo contenido. El sitemap sólo publica `/imagen`.

**17 herramientas** en la categoría (14 antes + Ideogram + Krea + Grok, que ya
estaba).

| Bloque | Cuántas | Criterio de orden |
|---|---|---|
| Genera imágenes gratis ahora | **9** | frecuencia de renovación → cantidad publicada → uso comercial → facilidad → capacidades |
| Fáciles para empezar | **5** | `instant` primero, luego amplitud |
| Potentes y profesionales | **5** | capacidades de imagen citadas, luego totales |
| Local y máximo control | **5** (1 `install` + 4 `technical`) | capacidades → open source → gratuidad real |
| Todas | **17** | alfabético |

**Ningún bloque ordena por la nota global.** El bloque 5 es alfabético a
propósito: `getToolsByCategory` devuelve las herramientas ordenadas por
`scoreTotal`, y usarlo habría colado la puntuación universal por la puerta de
atrás — invisible en las tarjetas pero mandando en el orden, que es la mitad de
lo que un ranking comunica.

### Los bloques, resueltos

```
Gratis ahora   Clipdrop · Leonardo · Playground · Krea · Ideogram ·
               Adobe Firefly · Pixelcut · Recraft · Grok Imagine
Fáciles        Clipdrop · Ideogram · Midjourney · Leonardo · Pixelcut
Profesionales  Ideogram · Midjourney · Leonardo · Pixelcut · Recraft
Local          Fooocus (instalar) | ComfyUI · AUTOMATIC1111 · InvokeAI · SD.Next (técnico)
```

Ninguna local aparece en «gratis ahora», y hay una prueba que lo comprueba.
Midjourney aparece en «fáciles» y en «profesionales» sin tener plan gratuito,
porque esos bloques no preguntan por el precio.

### La tarjeta

Cuatro respuestas, ningún número sobre cien:

```
Krea                                     [Créditos diarios]
Texto a imagen · Edición · Escalado · Quitar fondo
CUÁNTO            DÓNDE                EMPEZAR
100 unidades/día  En el navegador      Cuenta y algo de configuración
```

Cuando la cantidad no consta, la casilla no se deja vacía: dice **«No publican
la cantidad»**, en cursiva y en gris. Que el fabricante no lo diga es en sí
mismo el dato que separa un plan que se puede planificar de uno que no, y un
hueco dejaría a las dos clases con el mismo aspecto.

SD.Next aparece con «Capacidades sin confirmar en fuente oficial» en vez de una
lista inventada.

---

## 5. Filtros: 12 puestos, 4 escondidos

**Puestos:** Gratis ahora (11) · Créditos renovables (6) · Online (12) · Local
(5) · Generación (13) · Edición (10) · Image-to-image (7) · Imagen de referencia
(3) · Personaje consistente (3) · Rellenar zonas (9) · Ampliar encuadre (10) ·
Escalado (12).

**Escondidos, y la página dice por qué:**

| Filtro | Motivo |
|---|---|
| **Sin tarjeta** | sólo 4 de 17 fichas tienen ese dato confirmado |
| **Sin marca de agua** | sólo 1 de 17 |
| **Uso comercial** | sólo 5 de 17 |
| **Fácil para empezar** | hoy selecciona exactamente lo mismo que «Online» |

Los tres primeros se esconden por una regla que mira **cuánto del catálogo tiene
el dato resuelto**, no cuántas coincidencias hay. Tres aciertos sobre tres
fichas revisadas serían suficientes; tres sobre diecisiete no, porque entonces
lo que el filtro deja fuera no son «las que no cumplen» sino «las que no hemos
mirado», y el lector no puede distinguirlo.

El cuarto se esconde por redundancia, comparando el conjunto resultante y no la
definición: en cuanto exista una herramienta de imagen en la nube con arranque
técnico, los dos filtros volverán a distinguirse y los dos reaparecerán.

---

## 6. Comprobado en navegador real

Servidor de desarrollo, Chromium, tema claro y oscuro.

| | Escritorio 1280×720 | Móvil 375×812 |
|---|---|---|
| Desbordamiento horizontal | no | no |
| Rejilla | 3 columnas de 389 px | 1 columna de 343 px |
| Alto de tarjeta | 255 px, igual en toda la fila | 238 px |
| Objetivos táctiles < 36 px | ninguno | ninguno (chips exactos a 36 px) |
| Errores de consola | ninguno | ninguno |

**Contraste:** barrido automático de todo el texto de la página contra su fondo
real, con el umbral de WCAG 2.2 AA según tamaño y peso. **0 fallos** en los
cuatro cruces (claro/oscuro × escritorio/móvil).

La primera pasada encontró **3,54:1** en las etiquetas pequeñas, los contadores
y las fechas: `--ink-subtle` no llega al 4,5:1 que exige el texto normal. Se
cambiaron a `--ink-muted` en los componentes de esta página. **El token sigue
usándose así en el resto del sitio**, y merece una revisión propia que no toque
sólo Imagen.

También apareció que `.ic-unpublished` no se aplicaba: `.ic-fact dd` tiene más
especificidad que una clase suelta y se comía la regla entera.

**Interacción, probada pulsando:** el enlace estirado cubre la tarjeta en sus
cuatro esquinas (una sola parada de tabulación por tarjeta); los filtros
combinan en Y; el estado vacío nombra al culpable —«El filtro "Gratis ahora" es
el que lo deja vacío»—; los filtros viajan en la URL; «Quitar filtros» aparece y
desaparece con el estado.

Sin JavaScript la sección sigue siendo un catálogo completo y legible: los
filtros son un atajo, no la única puerta.

---

## 7. Comprobaciones

```
lint        limpio
typecheck   0 errores (203 ficheros)
test        487 pruebas, 20 ficheros
build       Complete
```

31 de esas pruebas son nuevas y están en `tests/unit/imagen.test.ts`. Corren
contra el catálogo real, no contra maquetas: comprueban que ninguna local se
cuele en «gratis ahora», que Perplexity no acabe en Imagen, que Krea no prometa
un uso comercial que su tabla excluye, que Replicate no invente créditos, que
las 35 fichas expliquen su esfuerzo y que ningún filtro escondido lo esté sin
motivo escrito.

---

## Lo que queda encima de la mesa

- **`requiresCreditCard` y `hasWatermark` siguen casi vacíos.** Son los dos
  datos que más pesan en la decisión de un lector y los dos que ninguna página
  de precios publica. Sacarlos de ahí exige abrir altas y leer términos: una
  tanda propia, probablemente manual.
- **`--ink-subtle` a tamaños pequeños incumple AA en todo el sitio.** Aquí está
  arreglado; en el resto no.
- **`skillLevel` sigue vivo** en la ficha de detalle («Nivel técnico:
  Intermedio») al lado de `startEffort`. Dos medidas de lo mismo, y una es la
  que se descartó por engañosa.
- **`/imagen` es el piloto.** Nada de esto se ha replicado a las otras dieciséis
  categorías, y no debería hasta que esta se revise.
