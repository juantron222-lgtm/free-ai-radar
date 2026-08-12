# Hacer comparables las herramientas — agosto de 2026

Rama `catalog-rebuild`. Nada publicado, `main` intacto, sin rediseño de interfaz.

---

## 1. Cambios de esquema

Tres añadidos y una sustitución conceptual.

```ts
capabilities: z.array(z.enum(CAPABILITIES)).default([])
startEffort:  z.enum(['instant','signup','install','technical']).default('signup')
```

**`capabilities`** — 22 valores, separados de la categoría. La categoría dice de
qué trata; la capacidad dice qué puedes pedirle:

```
imagen   text-to-image · image-to-image · image-editing · inpainting ·
         outpainting · reference-image · character-consistency ·
         upscaling · background-removal
vídeo    text-to-video · image-to-video · video-editing
audio    text-to-speech · voice-clone · text-to-music · transcription
texto    text-generation · code-generation · agents
infra    api · model-hosting · model-download
```

**`startEffort`** — cuatro valores que describen la herramienta, no al usuario:

| Valor | Significa |
|---|---|
| `instant` | Abres la web y generas |
| `signup` | Cuenta o algo de configuración antes del primer resultado |
| `install` | Instalación guiada, sin conocimientos |
| `technical` | Modelos, entornos o GPU |

`skillLevel` sigue existiendo, pero deja de ser el criterio de comparación.
Medía la pericia de quien usa, y con él se podía llamar «principiante» a la vez
a Fooocus —Python y GPU— y a una web donde escribes y generas.

**Distinción sobre la evidencia:** `capabilities` exige cita oficial, porque es
una afirmación sobre lo que el fabricante ofrece. `startEffort` no, porque es
una lectura nuestra de lo que cuesta empezar. Lo que exige prueba es lo que la
empresa promete, no lo que observamos.

---

## 2. Migración

`0010_capabilities_start_effort.sql`:

```sql
alter table public.tools add column if not exists capabilities jsonb not null default '[]'::jsonb;
alter table public.tools add column if not exists start_effort text not null default 'signup';
alter table public.tools add constraint tools_start_effort_known
  check (start_effort in ('instant','signup','install','technical'));
```

`evidence` y `auditNotes` siguen **fuera** del espejo: son la trazabilidad de por
qué un campo dice lo que dice, se revisan en un diff y nada en Postgres los lee.

---

## 3. Cómo quedan las 33

| Reparto | |
|---|---|
| **kind** | app 18 · interface 5 · platform 4 · agent 3 · model 2 · oss_project 1 |
| **hosting** | cloud 23 · local 6 · hybrid 4 |
| **startEffort** | signup 18 · instant 5 · install 5 · technical 5 |
| **freeModel** | free_real 10 · credits 8 · freemium 6 · **unknown 6** · open_source 3 |
| **con evidencia citada** | 30/33 |

**Capacidades:** 29 de 33 tienen al menos una. Las más frecuentes: `api` 25,
`text-to-image` 10, `upscaling` 10, `outpainting` 7, `image-editing` 6.

Sin capacidades: `gemma-4`, `lm-studio`, `midjourney`, `sdnext` — sus páginas no
son legibles o no nombran ninguna.

### Sobre las 74 candidatas descartadas

La extracción automática leyó páginas oficiales y propuso capacidades. **Se
descartaron 74.** Aceptarlas habría repetido el error de la auditoría con otro
disfraz: un dato plausible, masivo y sin comprobar.

- **ElevenLabs** salía con `text-to-image` porque su tabla de precios nombra un
  plan «Image & Video».
- **Hugging Face Spaces** salía con quince porque aloja de todo. Marcarla como
  `text-to-image` diría que genera imágenes, cuando lo que hace es ejecutar el
  modelo de otra persona — y en un comparador esa diferencia lo es todo.
- **`agents`** aparecía en casi todas: se ha vuelto una palabra de marketing.

Regla aplicada: una plataforma que aloja modelos ajenos recibe sólo capacidades
de infraestructura, y el resto se filtra por el dominio de su categoría.

---

## 4. Las intenciones, comprobadas

**«Quiero generar imágenes gratis ahora»**

```
capabilities ∋ text-to-image
hosting = cloud
startEffort ∈ {instant, signup}
freeModel ∈ {free_real, freemium, credits}
```

| | modelo | esfuerzo | créditos |
|---|---|---|---|
| Clipdrop | credits | **instant** | 20/24h por herramienta |
| Playground | credits | signup | 10 imágenes cada 3 horas |
| Adobe Firefly | credits | signup | diarias, cantidad no publicada |
| Pixelcut | freemium | signup | — |
| Recraft | freemium | signup | — |

**Cinco herramientas, ninguna local.** ComfyUI, AUTOMATIC1111, InvokeAI, SD.Next,
Fooocus y Gemma quedan fuera por `hosting = local`, que es exactamente lo que
pediste: una instalación gratuita no es «pulsa aquí y genera».

Las demás intenciones se responden sin la nota universal:

| Intención | Se calcula con |
|---|---|
| Desde el navegador | `hosting = cloud` |
| Créditos renovables | `creditReset ∈ {daily, weekly, monthly}` |
| Editar una foto | `capabilities ∋ image-editing` |
| Personaje consistente | `capabilities ∋ character-consistency` |
| Trabajar en local | `hosting = local` |
| Máximo control | `startEffort = technical` |
| Fácil para empezar | `startEffort = instant` |
| Sin tarjeta | `requiresCreditCard = no` **(sólo 2 fichas lo demuestran)** |

---

## 5. Gratis online ≠ open source local

Cinco conceptos separados, nunca un filtro genérico:

| Filtro | Regla |
|---|---|
| Gratis online ahora | `cloud` + `free_real\|freemium\|credits` + `instant\|signup` |
| Free tier / créditos | `freeModel = credits` + `creditReset` documentado |
| Prueba | `freeModel = trial` |
| Open source | `freeModel = open_source` o `openSource = yes` |
| Local sin coste de licencia | `hosting = local` |

Las dos primeras y las dos últimas **no se solapan en ninguna ficha**.

---

## 6. Cola de verificación manual

Seis fichas con acceso gratuito `unknown`, por orden de importancia:

| Herramienta | Bloqueo | Campos que hay que comprobar a mano |
|---|---|---|
| **Midjourney** | 403 en web y centro de ayuda | `freeModel`, si existe prueba, `requiresCreditCard`, precio mínimo, `hasWatermark`, `commercialUse`, `capabilities` |
| **Leonardo** | 403 | `freeModel`, créditos y frecuencia, `requiresCreditCard`, `commercialUse` |
| **Grok Imagine** | 403 en `x.ai/grok` y `x.ai/api` | `freeModel`, límites gratuitos, frecuencia, `requiresCreditCard`. Capacidades ya verificadas |
| **Ideogram** | 403 | Todo: no está en el catálogo |
| **Krea** | la página de precios no carga | Todo: no está en el catálogo |
| **Google Gemini** | no legible | `freeModel`, límites del plan gratuito |
| **Perplexity** | 403 | `freeModel`, límites |
| **Replicate** | precios legibles, sin plan gratuito declarado | `freeModel`: si hay capa gratuita o sólo pago por uso |

Ninguno de esos campos se ha rellenado a ojo.

---

## 7. Grok Imagine: añadida

Entra al catálogo con capacidades verificadas y acceso `unknown`.

`docs.x.ai` **sí responde**, y su navegación oficial enumera: *Imagine Overview ·
Image Generation · Image Editing · Multi-Image Editing · Video Generation ·
Image-to-Video · Reference-to-Video*.

De ahí salen cinco capacidades. De `x.ai/grok` y `x.ai/api`, que devuelven 403,
no sale nada — así que el plan gratuito queda `unknown`.

Excluirla por una página difícil habría sido peor: la herramienta existe, es
relevante, y su ausencia fue una de las cosas que originaron esta auditoría.

---

## 8. Cómo quedan tres tarjetas

Sin rediseñar nada: esto es qué información habría disponible.

**Plataforma cloud fácil — Clipdrop**
```
Clipdrop
Créditos · 20/24h por herramienta · Abres y generas
Texto a imagen · Rellenar zonas · Ampliar encuadre · Escalado · Quitar fondo
Tarjeta: sin confirmar   Marca de agua: sin confirmar
```

**Con créditos gratuitos — Playground**
```
Playground
Créditos · 10 imágenes cada 3 horas · Cuenta y algo de configuración
Texto a imagen · Edición de imagen · Escalado · Quitar fondo
Uso comercial: sí ✔ citado
```

**Local avanzada — ComfyUI**
```
ComfyUI
Gratis real · Instalación técnica, modelos o GPU
Texto a imagen · Imagen a imagen · Edición · Rellenar · Ampliar · Escalado
Se ejecuta en tu equipo · Sin cuotas · Requiere GPU
```

Las tres son distinguibles de un vistazo, y ninguna lleva un número sobre 100.

---

## Lo que sigue pendiente

- **Cuatro fichas sin capacidades** y **seis con acceso `unknown`**: necesitan
  una lectura humana, no otra pasada automática.
- **`requiresCreditCard` sólo está demostrado en dos fichas.** El filtro «sin
  tarjeta» se puede construir, pero hoy devolvería dos resultados. Es honesto y
  es poco útil: merece una tanda de verificación dedicada.
- **La interfaz no se ha tocado.** `AccessBadge` ya muestra modelo, créditos y
  esfuerzo; las capacidades no se pintan todavía en ninguna parte.
