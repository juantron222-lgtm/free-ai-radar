# Auditoría del catálogo — agosto de 2026

Rama `catalog-rebuild`, desde `main` en `88b1956`. Nada modificado todavía: esto
es el diagnóstico que precede a la reconstrucción.

La conclusión, por delante: **el catálogo no es fiable, y el motivo no es que
tenga errores sueltos**. Es que 22 de sus 24 fichas se rellenaron el mismo día
con los mismos valores por defecto, y esos valores afirman hechos —«no pide
tarjeta», «no tiene marca de agua»— que nadie comprobó una por una.

---

## A. Las 24, una por una

Gravedad: **CRÍTICO** engaña al lector sobre dinero o acceso · **ALTO** dato
falso o URL equivocada · **MEDIO** desactualizado o mal clasificado · **BAJO**
incompleto.

| Herramienta | Estado | Problema principal | Gravedad |
|---|---|---|---|
| **midjourney** | 403 desde aquí | Declara `trial` + `requiresCreditCard: no`. Su web y su centro de ayuda bloquean lectura automatizada, así que **no podemos demostrar ninguna de las dos cosas**. Un `trial` sin prueba es una invitación a que alguien intente registrarse gratis y no pueda | **CRÍTICO** |
| **suno-ai** | pricing legible | Declara `freemium`, sin créditos. Su página dice literalmente **«50 credits renew daily»** y **«No commercial use»**. El catálogo dice `commercialUse: no` (correcto) pero pierde el dato que más importa: créditos diarios | **CRÍTICO** |
| **elevenlabs** | pricing legible | Declara `freemium`, sin créditos. Su página dice **«Free $0 per month … 10k credits per month»** | **CRÍTICO** |
| **pika-labs** | pricing legible | Declara `freemium`, sin créditos. Su página muestra plan **$0 con «80 monthly video credits»** | **CRÍTICO** |
| **replicate** | pricing legible | Declara `demo` y `requiresCreditCard: unverified`. «demo» no es ninguno de los accesos que Replicate ofrece; es una plataforma de inferencia de pago por uso | **ALTO** |
| **civitai** | pricing legible | Declara `free_real` sin créditos. Su página menciona **«Buzz on daily rewards»**: hay una economía de créditos diarios que la ficha ignora | **ALTO** |
| **comfyui** | repo movido | `officialUrl` apunta a `github.com/comfyanonymous/ComfyUI`; el repositorio es hoy **`Comfy-Org/ComfyUI`**. Redirige, así que no está roto, pero la ficha nombra a un propietario que ya no lo es | **MEDIO** |
| **fooocus** | repo vivo, dormido | No está archivado (`archived: false`), pero su último *push* es de **2025-12-01**: ocho meses. Se presenta como `beginner` sin decir que es una aplicación Python local que exige GPU e instalación | **ALTO** |
| **leonardo-ai** | 403 | `freemium` no demostrable desde aquí | **ALTO** |
| **perplexity-ai** | 403 | `free_real` no demostrable desde aquí | **ALTO** |
| **google-gemini** | fetch falla | URL no legible automáticamente; `free_real` sin demostrar | **ALTO** |
| **gemma-4** | fetch falla | URL no legible; es un modelo, no una herramienta de uso directo | **MEDIO** |
| **cursor** | pricing legible | **Correcto y demostrado**: «Hobby Free · ✓ No credit card required». Es la única ficha donde `requiresCreditCard: no` está respaldado por una cita | — |
| **runwayml** | pricing legible | «Free forever» existe; la ficha acierta en `hasWatermark: yes`. Falta la cifra de créditos | **BAJO** |
| **chatgpt**, **claude**, **claude-sonnet-5** | 200 | `free_real`/`freemium` plausible, sin evidencia registrada. Tres fichas para dos productos y un modelo: `claude` y `claude-sonnet-5` se solapan | **MEDIO** |
| **bolt-new**, **v0-by-vercel** | 200 | «Start for free» sin cifras. `freemium` sin límites documentados | **MEDIO** |
| **stable-diffusion-webui** | 200 | Correcto como proyecto. Mal clasificado: `beginner`-adyacente en una categoría con productos web | **MEDIO** |
| **ollama**, **lm-studio**, **pinokio** | 200 | Correctos en esencia. `ollama` y `lm-studio` marcados `beginner` siendo instalaciones locales | **MEDIO** |
| **hugging-face-spaces** | 200 | Es un alojamiento de demos, no una herramienta | **MEDIO** |
| **gemma-4** | — | Modelo en una categoría de herramientas | **MEDIO** |

---

## B. Los números

De 24 fichas:

| Medida | Cuenta |
|---|---|
| **Con un hecho afirmado sin evidencia** | **22/24** — `requiresCreditCard: no` |
| Con `hasWatermark: no` sin evidencia | 22/24 |
| **Con estado de gratuidad incorrecto o incompleto** | **6/24** — suno, elevenlabs, pika, replicate, civitai, midjourney |
| Con URL problemática | **6/24** — 4 × 403, 2 × fetch falla, +1 repo movido |
| Mal clasificadas (categoría o dificultad) | **11/24** |
| **Que no podemos demostrar hoy** | **6/24** — las que devuelven 403 o fallan |
| Con `creditsAmount` | **0/24** |
| Con `creditReset ≠ none` | **0/24** |
| Verificadas el mismo día (2026-07-08) | **22/24**, hace 35 días |

**Cero de veinticuatro usan los campos de créditos**, que existen en el esquema
desde el principio. Y al menos cuatro herramientas del catálogo tienen créditos
documentados en su propia web.

---

## C. El scoring, y por qué produce lo que produce

```
freeReal 30% · usefulness 30% · ease 15% · transparency 15% · creatorValue 10%
```

**AUTOMATIC1111 = 89**, no 95, pero el mecanismo es el que describes:

```
freeReal 10 · usefulness 9 · ease 6 · transparency 9 · creatorValue 9
```

`freeReal: 10` porque es software libre que se ejecuta en tu máquina. Eso pesa
un 30%. `transparency: 9` porque el código es público. Otro 15%. **El 45% de la
nota premia propiedades del código**, no la experiencia de usarlo.

**Midjourney = 65**, con `freeReal: 3`.

El problema no son los pesos. Es que **la escala mide dos cosas incompatibles con
la misma regla**. Para AUTOMATIC1111, `freeReal: 10` significa «no cuesta
dinero»; su coste real es una GPU, una instalación de Python y una tarde. Para
Midjourney, `freeReal: 3` significa «hay que pagar». Ninguno de los dos números
describe lo que le pasa a una persona que quiere una imagen ahora.

Y `ease: 6` para AUTOMATIC1111 frente a `ease: 8` para Midjourney reconoce la
diferencia — pero la aplasta bajo un 15% que no puede competir con el 45% que ya
está a favor del open source.

**Qué haría:** eliminar la nota única de la interfaz. No reponderarla: una media
ponderada responde a «¿cuál es mejor?», y esa pregunta no tiene respuesta sin
saber para quién. Sustituirla por recomendaciones por intención, que es lo que la
gente busca de verdad:

- puedo usarla ahora mismo desde el navegador
- mejor acceso gratuito renovable
- mejor sin tarjeta
- mejor si tengo GPU
- mejor open source
- mejor para uso comercial

Si hace falta un número para ordenar dentro de cada intención, que sea interno y
específico de esa intención, nunca un `89/100` presentado como veredicto.

---

## D. Arquitectura mínima necesaria

El esquema ya tiene `kind`, `hosting`, `skillLevel`, `freeModel` y
`freePlan.creditReset`. Lo que falta es menos de lo que parece.

**1. `kind` con el vocabulario correcto.** Hoy son `app | platform | model |
interface | agent | oss_project`, y `interface` mete en el mismo saco a ComfyUI
(grafo de nodos) y a Fooocus (un botón). Propuesta:

```
cloud-generator    entras a una web y generas
creator-suite      plataforma con edición y varios medios
local-ui           se instala y corre en tu máquina
workflow-ui        nodos y grafos, local o alojado
model              pesos, no producto
model-platform     API o inferencia alojada
model-hub          comunidad y repositorio de modelos
```

**2. `capabilities: string[]`**, separado de la categoría:

```
text-to-image · image-to-image · editing · inpainting · outpainting
reference-image · character-consistency · upscaling
text-to-video · image-to-video · video-editing
text-to-speech · voice-clone · music
```

Esto es lo que arregla la categoría «Imagen», que hoy contiene **una comunidad,
dos interfaces locales, un grafo de nodos y dos generadores cloud** — seis cosas
que no se pueden comparar entre sí.

**3. `startEffort`** en lugar de `skillLevel`, con tres valores que describen el
primer minuto y no la maestría:

```
instant     abres una web y generas
setup       cuenta, cola, límites, o una instalación sencilla
technical   descargar modelos, GPU, Python, nodos
```

**4. Evidencia por dato temporal.** Un campo por hecho perecedero:

```ts
evidence: {
  freePlan?:   { sourceUrl, verifiedAt, quote }
  pricing?:    { sourceUrl, verifiedAt, quote }
  watermark?:  { sourceUrl, verifiedAt, quote }
  commercial?: { sourceUrl, verifiedAt, quote }
}
```

Sin cita, el dato no puede valer `yes` ni `no`: sólo `unverified`. Es la regla
que ya funciona en Newsroom, y es la que habría impedido las 22 tarjetas.

---

## E. Imagen: catálogo propuesto

**Nada de esto está verificado todavía.** Es la lista de candidatas a investigar,
y su estado real depende de una lectura de fuentes oficiales que aún no he hecho.

**VERIFICADO** (leído durante esta auditoría, con cita):

| Herramienta | Tipo | Hosting | Acceso gratuito | Fuente |
|---|---|---|---|---|
| Comfy Cloud | workflow-ui | cloud | `credits` · `one_off` · «5 free runs … no credit card required» | comfy.org/pricing |
| ComfyUI | workflow-ui | local | `open_source` | Comfy-Org/ComfyUI |
| Civitai | model-hub | cloud | créditos: «Buzz on daily rewards» — frecuencia por confirmar | civitai.com/pricing |
| Cursor *(no imagen)* | — | — | «No credit card required» | cursor.com/pricing |

**PENDIENTE DE VERIFICAR** — candidatas por vertical, a comprobar una a una:

*Generación cloud:* Midjourney · Ideogram · Recraft · Leonardo · Adobe Firefly ·
Krea · Freepik/Magnific · Google (Gemini/Imagen) · OpenAI (imágenes en ChatGPT) ·
Grok Imagine

*Modelos y plataformas:* Black Forest Labs / FLUX · Stability AI · fal.ai ·
Replicate · Hugging Face

*Local y open source:* AUTOMATIC1111 · Fooocus · InvokeAI · SD.Next · Draw Things

*Edición:* Photoroom · Pixelcut · Magnific · Topaz

Son 24 candidatas. La lista final saldrá de la investigación, no de esta tabla.

---

## F. Ausencias graves

**Imagen:** ni una sola de las plataformas punteras actuales. No están FLUX,
Ideogram, Recraft, Krea, Freepik, Firefly, Grok Imagine ni Stability. La
categoría «Imagen» tiene seis entradas y **cuatro son proyectos de código**.

**Vídeo:** dos fichas, Runway y Pika. Faltan Luma, Kling, Seedance, HeyGen,
Descript, Higgsfield — todas activas y con planes gratuitos publicados.

**Audio:** una ficha, ElevenLabs. Faltan Suno *(está, mal clasificada en
música)*, Udio, Cartesia.

**Modelos:** no hay ninguna ficha de los modelos de imagen o vídeo que mueven el
mercado, mientras que sí hay cuatro de LLM.

**Grok:** ausente por completo, pese a ser uno de los pocos asistentes con
generación de imagen integrada.

---

## Lo que no se ha hecho, y por qué

Seis fichas no se han podido verificar porque sus webs devuelven 403 a peticiones
automatizadas: Midjourney, Leonardo, Perplexity, y las de Google. **No he
intentado rodear ninguna protección.** Para esas seis, la única salida honesta es
que un humano las lea, o que sus datos pasen a `unverified`.
