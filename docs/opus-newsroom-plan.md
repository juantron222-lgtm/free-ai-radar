# OPUS NEWSROOM — auditoría de `/noticias` y flujo propuesto

**Rama:** `opus-newsroom` (creada desde `main` en `88b1956`)
**Fecha de la auditoría:** 2026-08-11
**Estado:** propuesta. No se ha modificado ningún fichero de `src/`.

---

## 1. Qué es hoy `/noticias`

Hay **dos sistemas de noticias en el repositorio y no se hablan entre ellos**.

### Sistema A — el editorial (el que se publica)

```
src/data/news/news.json          11 entradas, en español, escritas a mano
        ↓ valida contra
src/lib/domain/news.ts           esquema Zod + isPublishable() + isVendorSource()
        ↓ carga en build
src/lib/data/news.ts             lanza y rompe el build si algo no cumple
        ↓ consume
/noticias · /noticias/[slug] · /modelos · /agentes · sitemap.xml
```

Este sistema es **bueno y hay que conservarlo**. La regla editorial 1 no es una
promesa: está en código y rompe la compilación.

- `isVendorSource()` resuelve el problema difícil de verdad — en hosts
  compartidos (`github.com`, `huggingface.co`) exige la organización propietaria
  en la ruta, así que `github.com/ollama` es fuente del fabricante y
  `github.com/cualquiera` no lo es.
- `isPublishable()` además comprueba que `officialUrl` esté respaldada por
  alguna de las fuentes citadas: el botón «leer el anuncio» no puede llevar a un
  sitio que nadie ha citado.
- Un `relatedTools` que apunte a un slug inexistente **rompe el build**.
- `npm run data:news:validate` → **28 de 28 en verde** (comprobado hoy).

### Sistema B — el rastreador (el que no llega a nadie)

```
src/data/news-sources.json       10 feeds RSS (4 activos, 6 desactivados)
        ↓ npm run news:fetch
scripts/fetch-ai-news.mjs        parser RSS por expresiones regulares
        ↓ escribe
src/data/news.json               197 entradas, en inglés, updated_at 2026-07-12
        ↓ lo lee
NADIE
```

`src/data/news.json` no lo importa ninguna página, ningún componente y ninguna
prueba. `npm run news:fetch` produce un fichero que nadie mira, con un esquema
distinto (`items[]`, `canonical_url`, `source_type`) que ni siquiera es
convertible al del sistema A sin trabajo editorial.

**Ésta es la brecha exacta que OPUS NEWSROOM tiene que cerrar:** existe una capa
de descubrimiento y existe una capa editorial, pero no hay nada en medio.

Y hace falta algo en medio, porque lo que el rastreador trae no es publicable
tal cual. Muestra real de sus titulares:

| Titular recogido | Qué es en realidad |
| --- | --- |
| `GPT-5.6: Frontier intelligence that scales with your ambition` | noticia real |
| `How Deutsche Telekom is rewiring telecommunications with AI` | caso de cliente |
| `GeForce NOW Turns Up the Heat With New RTX 5080 Toronto Server` | nota de producto de gaming |
| `Profiling in PyTorch (Part 3): Attention is all you profile` | artículo técnico |
| `Our approach to government and national security partnerships` | posicionamiento corporativo |

De 197 elementos, aproximadamente **1 de cada 10** es una noticia que interese a
quien busca IA gratuita. Volcar ese fichero en `/noticias` incumpliría la regla
editorial 6 el primer día.

---

## 2. Inventario editorial actual

11 noticias publicadas. Ninguna en `draft` ni en `in_review`: el flujo de
estados existe en el esquema pero **nunca se ha usado**.

| Fecha | Categoría | Verificación | Plan gratuito | Herramientas |
| --- | --- | --- | --- | --- |
| 2026-08-04 | limitacion | verified | sin confirmar | ollama |
| 2026-07-27 | local-open-source | partial | sin confirmar | claude |
| 2026-07-24 | modelo-lenguaje | verified | sin confirmar | claude |
| 2026-07-14 | lanzamiento | partial | sin confirmar | claude |
| 2026-07-11 | agentes | verified | **sí** | ollama |
| 2026-07-08 | local-open-source | partial | sin confirmar | — |
| 2026-07-02 | local-open-source | partial | sin confirmar | — |
| 2026-06-30 | plan-gratuito | verified | **sí** | claude, claude-sonnet-5 |
| 2026-06-30 | local-open-source | verified | **sí** | ollama, gemma-4 |
| 2026-06-23 | modelo-multimodal | partial | sin confirmar | — |
| 2026-05-22 | plataforma-agentes | partial | sin confirmar | — |

Lo que dicen estos números:

- **Frescura:** la última noticia es del 4 de agosto. Hoy es 11. Siete días.
- **Calidad de verificación:** 6 de 11 son `partial`. Más de la mitad de la
  sección se presenta al lector como parcialmente verificada.
- **Concentración de fabricantes:** sólo tres — Ollama, Anthropic y Google. Cero
  OpenAI, Mistral, Meta, Stability, ElevenLabs, Black Forest Labs.
- **Diversidad (regla 8):** se usan 8 de las 17 categorías del esquema. **Cero
  imagen. Cero vídeo. Cero audio.** Exactamente tres de las verticales que el
  encargo pide cubrir están vacías.

---

## 3. Contraste con las diez reglas editoriales

| # | Regla | Estado | Dónde |
| --- | --- | --- | --- |
| 1 | Fuente primaria verificable | ✅ **en código** | `isPublishable()` |
| 2 | Prioridad de fuentes | ✅ | `NewsSource.kind` cubre official / release-notes / pricing / docs / repo / model-card |
| 3 | No inventar fechas ni versiones | ✅ | `publishedAt` ≤ `checkedAt`, validado |
| 4 | Lo no verificable no se publica como hecho | ✅ | `verification` + `unconfirmed[]` |
| 5 | **Distinguir anuncio / lanzamiento / actualización / preview / disponibilidad** | ❌ **no existe el campo** | ver §4 |
| 6 | Evitar noticias irrelevantes | ⚠️ sólo criterio humano | no hay filtro |
| 7 | Sin duplicados | ⚠️ parcial | sólo unicidad de `slug` e `id`; no hay deduplicación por URL ni por historia |
| 8 | Diversidad de verticales | ❌ | 0 imagen, 0 vídeo, 0 audio |
| 9 | Amazon / afiliación / AutoCraw no influyen | ✅ | no hay acoplamiento alguno en la ruta de noticias |
| 10 | No tocar infraestructura | ✅ | Newsroom es JSON + build; no toca base de datos |

Las cuatro primeras reglas ya están resueltas y bien resueltas. **El trabajo de
OPUS NEWSROOM son las reglas 5, 6, 7 y 8.**

### La regla 5 es la más grave

El esquema mezcla dos ejes distintos en un solo campo `category`:

```
'imagen', 'video', 'audio', 'agentes', 'modelo-lenguaje'   ← de qué trata
'lanzamiento', 'actualizacion'                             ← qué ha pasado
```

Al ser un `enum` de un solo valor, una noticia es **o** «imagen» **o**
«lanzamiento», nunca las dos. Hoy no se puede expresar «lanzamiento de un modelo
de imagen» ni distinguir un anuncio de una disponibilidad real. La regla 5 no se
incumple por descuido de redacción: **no hay dónde escribirla**.

---

## 4. Cosas construidas que no están conectadas

| Qué | Estado |
| --- | --- |
| `getNewsForTool()` | exportada y con pruebas, **usada por cero páginas**. Las fichas de herramienta no muestran sus noticias. |
| `/admin/noticias` | la skill `ai-news-primary-source-researcher` §2 dice «revisa la cola de borradores en `/admin/noticias`». **Esa página no existe.** |
| `rss.xml` | sólo lleva catálogo (altas y cambios). Ninguna noticia se sindica jamás. |
| `itemListSchema` | importada en `noticias/index.astro:44` y anulada con `void`. Import muerto. |
| Estados `draft` / `in_review` | en el esquema, nunca usados. El flujo de revisión no se ha ejercitado. |

---

## 5. Flujo propuesto — OPUS NEWSROOM

Principio de diseño:

> **El descubrimiento es automático y barato. La publicación es verificada y
> cara. El humano sólo ve lo que ya ha pasado los filtros de la máquina.**

Seis etapas, cada una con una puerta que se puede comprobar.

### Etapa 0 — FUENTES · `src/data/news-sources.json`

- Reparar los 6 feeds desactivados (Anthropic, Mistral, Meta, Stability) o
  sustituirlos por lo que sí publique cada fabricante.
- Añadir feeds por vertical: imagen, vídeo, audio, agentes, open source. Hoy no
  hay ni uno solo de esas cuatro áreas, y por eso están vacías.
- Añadir **releases de GitHub** (`github.com/<org>/<repo>/releases.atom`) de las
  herramientas del catálogo: es la fuente primaria de changelog más fiable y
  encaja directamente con `kind: 'release-notes'`.
- Campos nuevos por fuente: `vertical`, `publisher` (el dominio que
  `isVendorSource` va a exigir después) y `priority`.

### Etapa 1 — RADAR (automático, no publica nada)

`npm run news:radar` — reescritura de `fetch-ai-news.mjs` que escribe en
`src/data/news/inbox.json`, una **cola de candidatos**, nunca una noticia.

- Deduplicación por URL canónica normalizada **y** contra las `sources[].url` ya
  publicadas → cumple la regla 7 de verdad, no sólo por slug.
- Cada candidato lleva `status: new | triaged | discarded | promoted` y el motivo
  del descarte. Los descartes se conservan: es lo que evita volver a evaluar lo
  mismo cada semana.
- **Elimina `src/data/news.json`** y con él la ambigüedad de tener dos ficheros
  con el mismo nombre y distinto significado.

### Etapa 2 — TRIAJE (regla 6 y regla 8)

Puntuación explícita, no criterio implícito. Un candidato asciende si suma en:

- ¿cambia lo que se puede hacer gratis?
- ¿toca una herramienta del catálogo?
- ¿es un lanzamiento o versión real, y no un caso de cliente?
- ¿pertenece a una vertical poco cubierta las últimas semanas?

Descarta por defecto: acuerdos comerciales, rondas de financiación, casos de
cliente, resúmenes de congresos, notas de hardware y artículos de investigación
sin producto detrás. Es decir, el 90 % de lo que hoy trae el rastreador.

El informe de triaje muestra **la cobertura por vertical de los últimos 30
días** y señala las que están en ayunas. Así la regla 8 deja de depender de que
alguien se acuerde.

### Etapa 3 — VERIFICAR Y REDACTAR · skill `ai-news-primary-source-researcher`

Sin cambios en la skill: ya hace exactamente lo que hace falta. `WebFetch` a la
página del fabricante, extracción literal, relleno de `NewsItem` con
`status: 'draft'`. Nada asciende a `verified` si falla alguna de las cuatro
comprobaciones cruzadas de su §4.

Las noticias que afecten a una herramienta del catálogo disparan además
`ai-catalog-verifier` sobre esa ficha: una noticia que dice que un plan gratuito
ha cambiado y una ficha que sigue afirmando lo contrario es peor que no
publicar.

### Etapa 4 — PUERTA · `npm run data:news:validate`

Se amplía lo que ya existe y ya funciona:

- todo lo actual (28 pruebas), más
- `eventType` obligatorio → regla 5,
- sin duplicado de historia contra lo ya publicado → regla 7,
- `checkedAt` no anterior a N días para una noticia que entra nueva.

Sigue rompiendo el build. Nada llega al lector sin pasar por aquí.

### Etapa 5 — REVISIÓN Y PUBLICACIÓN (el único paso humano)

`/admin/noticias` — la cola de borradores que la skill ya presupone y que no
existe. Lista `draft` e `in_review` con el veredicto de la puerta y lo que queda
sin confirmar.

Pasar `status` a `published` es **la única escritura humana de todo el flujo**.
`release-guardian` sigue custodiando el commit; push y despliegue siguen siendo
manuales y explícitos.

---

## 6. Cambio de esquema que exige la regla 5

Separar los dos ejes que hoy están mezclados:

```ts
category   // de qué trata — se conserva, quitando 'lanzamiento' y 'actualizacion'
eventType  // qué ha pasado — NUEVO, obligatorio
           // 'anuncio' | 'lanzamiento' | 'actualizacion'
           // | 'preview-beta' | 'disponibilidad-general' | 'retirada'
availability // NUEVO
           // 'general' | 'lista-de-espera' | 'beta-cerrada'
           // | 'por-region' | 'no-indicada'
```

Con esto la tarjeta puede decir **«Anuncio — todavía no disponible»** en lugar
de dejar que el lector suponga que ya puede usarlo. La regla 5 pasa de ser una
intención a ser un campo obligatorio.

**Coste de migración:** 11 noticias necesitan `eventType` y `availability`
rellenados. No se deducen del texto — hay que releer las 11 fuentes originales.
Es trabajo real y hay que presupuestarlo, pero es acotado y se hace una vez.

---

## 7. Objetivos de régimen

| Métrica | Hoy | Objetivo |
| --- | --- | --- |
| Publicadas por semana | ~1 | 4–6 |
| Antigüedad de la última | 7 días | ≤ 3 días |
| `verified` sobre el total | 45 % | ≥ 70 % |
| Verticales con contenido | 8 / 17 | ≥ 12 / 17 |
| Imagen · vídeo · audio | 0 · 0 · 0 | cobertura mensual en las tres |
| Fabricantes distintos | 3 | ≥ 8 |
| Días máximos sin cubrir una vertical | sin medir | 21, visible en el informe de triaje |

Cadencia: radar diario y automático; triaje y verificación en 2–3 sesiones por
semana de unos 5 candidatos cada una.

---

## 8. Fuera de alcance (regla 10)

OPUS NEWSROOM **no toca** usuarios, billing, RLS, Supabase ni infraestructura.
Todo el sistema son ficheros JSON, validación en tiempo de build, dos páginas
Astro que ya existen y una página de administración nueva. **Sin base de datos.**

La regla 9 se cumple por construcción: no hay ninguna vía por la que Amazon, la
afiliación o AutoCraw entren en la selección, el orden o la redacción. El triaje
puntúa por impacto en el plan gratuito y por cobertura de vertical, y por nada
más.

---

## 9. Orden de trabajo propuesto

| # | Trabajo | Por qué va aquí |
| --- | --- | --- |
| 1 | `eventType` + `availability` en el esquema, y migrar las 11 | Toda noticia nueva nace ya con la regla 5 cumplida; hacerlo después obliga a migrar más |
| 2 | Reparar y ampliar `news-sources.json` | Sin fuentes de imagen, vídeo y audio, las verticales vacías no se llenan |
| 3 | `news:radar` + `inbox.json`, y retirar `src/data/news.json` | Cierra la brecha entre descubrimiento y edición |
| 4 | Triaje con cobertura por vertical | Reglas 6 y 8 |
| 5 | Ampliar `data:news:validate` | Convierte 1, 3 y 4 en puertas que rompen el build |
| 6 | `/admin/noticias` | Cierra el bucle que la skill ya presupone |
| 7 | Conectar `getNewsForTool()` en las fichas | Función ya construida y probada, hoy invisible |
| 8 | Noticias en `rss.xml` | Distribución; ninguna noticia se sindica hoy |

Los puntos 1–5 son el sistema. Los 6–8 son la conexión de cosas que ya existen.
