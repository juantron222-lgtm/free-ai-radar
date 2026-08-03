---
name: ai-news-primary-source-researcher
description: Investiga y redacta noticias de IA para Free AI Radar usando EXCLUSIVAMENTE fuentes primarias verificables (blogs oficiales, notas de versión, páginas de precios, repositorios oficiales). Úsala al añadir o actualizar entradas en /noticias, al comprobar si un plan gratuito ha cambiado, o cuando haya que decidir si algo es publicable. Produce borradores, nunca publica.
---

# Investigador de noticias con fuente primaria

## Objetivo

Producir entradas de noticias para Free AI Radar en las que **cada afirmación
publicable esté respaldada por una fuente primaria citable con fecha**, y en las
que todo lo no confirmado quede marcado como no confirmado en lugar de omitirse
o suavizarse.

El activo del proyecto es que se puede confiar en él. Una sola noticia inventada
o mal fechada lo destruye. Esta skill existe para que eso no dependa de la
memoria del modelo.

## Cuándo activarse

- Al añadir cualquier entrada a `src/data/news/*.json`.
- Al actualizar una noticia existente.
- Cuando el usuario pida «actualiza las noticias», «mira qué hay nuevo»,
  «¿ha cambiado el plan gratuito de X?».
- Antes de marcar una ficha como `outdated` por un cambio anunciado.
- Al revisar la cola de borradores en `/admin/noticias`.

## Fuentes permitidas

**Primarias (única base admisible para publicar):**

| Tipo | Ejemplos válidos |
| --- | --- |
| Blog oficial del fabricante | `anthropic.com/news`, `openai.com/index`, `blog.google`, `mistral.ai/news` |
| Notas de versión | `github.com/<org>/<repo>/releases`, changelogs oficiales |
| Página de precios oficial | `openai.com/api/pricing`, `claude.com/pricing` |
| Documentación oficial | `docs.<vendor>.com`, `platform.openai.com/docs` |
| Repositorio oficial | releases, `README`, `LICENSE` del repo del propio proyecto |
| Model card oficial | tarjetas en Hugging Face **publicadas por la cuenta oficial** |

**Secundarias (sólo para descubrir; nunca para citar):**
prensa, agregadores, Reddit, X, newsletters, blogs de terceros, resúmenes de
buscador.

> Un resumen de motor de búsqueda **no es** una fuente. Sirve para saber dónde
> mirar. La cita siempre va a la página del fabricante.

## Herramientas permitidas

- `WebSearch` — sólo para localizar la fuente primaria.
- `WebFetch` — para leer y citar la fuente primaria.
- `Read` / `Write` / `Edit` — sobre `src/data/news/` y `docs/`.
- `Bash` / `PowerShell` — sólo para `npm run data:news:validate` y `git diff`.

No se permite ninguna herramienta que publique, despliegue o envíe correo.

## Procedimiento

### 1. Descubrir
```
WebSearch "<vendor> announcement <mes> <año>"
```
Anota los candidatos. **No escribas nada todavía.**

### 2. Localizar la fuente primaria
Para cada candidato, encuentra la URL del fabricante. Si no existe una página
oficial que lo respalde, el candidato se descarta aquí.

### 3. Verificar leyendo la fuente
```
WebFetch <url-oficial> "¿Qué anuncia exactamente? Da fecha de publicación,
nombre exacto del producto/modelo, precios si se indican, disponibilidad por
plan, y si está disponible en el plan gratuito. Cita textualmente los datos."
```

Extrae **sólo** lo que la página dice. Si la página no menciona el plan
gratuito, el campo correspondiente es `unverified`, no `no`.

### 4. Comprobación cruzada obligatoria
Antes de redactar, confirma los cuatro:

- [ ] La URL pertenece al dominio del fabricante.
- [ ] La fecha aparece en la propia página (no la infieras del buscador).
- [ ] El nombre del producto está copiado literalmente, con su versión.
- [ ] Los precios y límites están copiados literalmente, con su moneda y unidad.

Si alguno falla → **no se publica**. Se deja como borrador con
`verification: 'pending'` y una nota de qué falta.

### 5. Redactar
Rellena el esquema de `src/lib/domain/news.ts`. Reglas de redacción:

- Titular descriptivo, sin superlativos ni «revolucionario».
- Resumen que responda «¿qué cambia para quien usa esto gratis?».
- `impact` explica la consecuencia práctica, no repite el titular.
- `affectsFreePlan` sólo es `true` si la fuente lo dice explícitamente.
- Vincula `relatedTools` únicamente con slugs que existan en el catálogo.

### 6. Validar
```bash
npm run data:news:validate
```
Debe pasar sin errores. Comprueba esquema, fechas no futuras, dominios de
fuente y slugs de herramientas.

> **Dependencia:** este script y `src/data/news/` se crean en la fase de
> construcción de la sección de noticias. Mientras no existan, valida a mano
> contra `src/lib/domain/news.ts` y ejecuta `npm run test`, que incluye las
> pruebas de integración del dataset. Comprueba su disponibilidad con:
> ```bash
> node -e "process.exit(require('./package.json').scripts['data:news:validate']?0:1)" \
>   && echo "disponible" || echo "pendiente de la fase de noticias"
> ```

## Criterios de verificación

Una noticia es **publicable** (`verification: 'verified'`) sólo si:

1. Tiene al menos una `sources[]` con `kind: 'official'`.
2. El host de esa fuente pertenece al fabricante del que habla la noticia.
3. `publishedAt` aparece literalmente en la fuente.
4. `checkedAt` es la fecha real en la que se leyó la fuente.
5. Ninguna cifra del cuerpo aparece sin estar en la fuente.
6. `relatedTools` referencia slugs existentes.

Si cumple 1–4 pero hay algún dato secundario sin confirmar →
`verification: 'partial'`, y ese dato se marca en el texto como no confirmado.

## Prohibiciones

- ❌ No inventes noticias, fechas, versiones, precios ni características.
- ❌ No cites un agregador, un resumen de buscador ni prensa como fuente.
- ❌ No deduzcas una fecha. Si la página no la muestra, no hay fecha.
- ❌ No conviertas «no lo dice» en «no».
- ❌ No publiques directamente: todo entra como borrador.
- ❌ No rellenes la sección para que parezca más llena.
- ❌ No traduzcas un nombre de producto ni «corrijas» su grafía.
- ❌ No reutilices el cuerpo de una noticia antigua cambiándole la fecha.

## Formato del informe final

```markdown
## Investigación de noticias — <fecha>

### Verificadas y listas para revisión editorial (N)
| Titular | Fecha | Fuente primaria | ¿Afecta al plan gratuito? |
|---|---|---|---|
| ... | AAAA-MM-DD | https://... | sí / no / sin confirmar |

### Descartadas por falta de fuente primaria (N)
| Candidato | Dónde apareció | Por qué se descarta |
|---|---|---|

### Parcialmente verificadas (N)
| Titular | Qué falta por confirmar |
|---|---|

### Herramientas del catálogo afectadas
- <slug> → motivo → ¿requiere reverificar la ficha?

### Validación
`npm run data:news:validate` → <salida>
```

## Ejemplos de uso

**Correcto**
```
Usuario: añade las novedades de Anthropic de julio
→ WebSearch para localizar
→ WebFetch https://www.anthropic.com/news  (índice oficial, fechas visibles)
→ WebFetch https://www.anthropic.com/news/claude-sonnet-5  (detalle)
→ Extrae: "default model for Free and Pro plans" → affectsFreePlan: true
→ Borrador con sources[0].kind = 'official'
```

**Incorrecto**
```
Usuario: añade las novedades de Anthropic de julio
→ WebSearch devuelve un resumen que menciona precios
→ Se escribe la noticia con esos precios  ❌
   El resumen no es fuente. Hay que abrir la página del fabricante.
```

## Detente y pide aprobación si

- La fuente primaria y una fuente secundaria **se contradicen**.
- El anuncio implica que una herramienta del catálogo ha **cerrado**.
- Un plan gratuito **desaparece** (afecta a las alertas de usuarios).
- La noticia es sobre una **incidencia de seguridad** que afecte a usuarios.
- Hay que **retirar** una noticia ya publicada.
- La fuente exige inicio de sesión o está tras un muro de pago.
