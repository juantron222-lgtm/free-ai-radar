---
name: ai-catalog-verifier
description: Verifica fichas del catálogo de Free AI Radar contra la página oficial del fabricante y actualiza su estado de verificación. Úsala al añadir una herramienta, al revisar fichas caducadas, al resolver una corrección enviada por un lector, o cuando haya que decidir si una ficha puede presentarse como actual. Marca como pendiente todo lo que no pueda confirmar.
---

# Verificador del catálogo

## Objetivo

Garantizar que ninguna ficha presente como hecho algo que no se haya
comprobado contra la fuente oficial, y que el estado de verificación de cada
ficha refleje la realidad.

La regla que gobierna todo: **es preferible una ficha incompleta marcada como
pendiente que una ficha convincente pero inventada.**

## Cuándo activarse

- Al añadir una herramienta nueva al catálogo.
- Al revisar la cola de `/admin/desactualizadas`.
- Al resolver una corrección de `/admin/correcciones`.
- Cuando una noticia indique que un plan gratuito ha cambiado.
- Antes de subir el estado de una ficha a `verified`.
- Cuando el usuario diga «actualiza el catálogo» o «¿esto sigue siendo cierto?».

## Fuentes permitidas

Por orden de prioridad, y **sólo** estas:

1. **Página de precios oficial** — para límites, tarjeta, cuotas.
2. **Documentación oficial** — para capacidades y requisitos.
3. **Términos / licencia oficial** — para uso comercial y marca de agua.
4. **Política de privacidad oficial** — para entrenamiento con datos del usuario.
5. **Repositorio oficial** — para open source, licencia y versión.

Prensa, agregadores, directorios de la competencia y reseñas de terceros:
**no admisibles**, ni siquiera como apoyo.

## Herramientas permitidas

- `WebFetch` — leer las páginas oficiales.
- `WebSearch` — sólo para localizar la URL oficial correcta.
- `Read` / `Edit` — sobre `src/data/tools.json`.
- `Bash` / `PowerShell` — `npm run data:migrate:dry`, `npm run test`,
  `npm run links:check`, `git diff`.

## Procedimiento

### 1. Situar la ficha
```bash
node -e "const t=require('./src/data/generated/tools.json');const x=t.find(i=>i.slug==='<slug>');console.log(JSON.stringify(x,null,2))"
```

### 2. Verificar campo por campo

Para cada campo duro, abre la fuente y compara. **Un campo sólo se marca
confirmado si la página lo dice explícitamente.**

| Campo | Fuente | Regla |
| --- | --- | --- |
| `requiresCreditCard` | precios / alta | `no` sólo si dice que no hace falta; si calla → `unverified` |
| `requiresSignup` | producto | `no` sólo si se puede usar sin cuenta |
| `hasWatermark` | precios / términos | `no` sólo si lo afirma para el plan gratuito |
| `commercialUse` | términos / licencia | `yes` sólo con permiso explícito |
| `openSource` | repo + `LICENSE` | `yes` sólo con licencia OSI en repo oficial |
| `freePlan.limits` | precios | copiado literal, con unidades |
| `freePlan.creditReset` | precios | `one_off` si no dice que se renueve |
| `privacy.trainsOnUserData` | privacidad | `no` sólo si lo afirma para el plan gratuito |
| `licence` | `LICENSE` | identificador SPDX exacto |
| `version` | releases | etiqueta literal de la última release |

### 3. Clasificar la entidad

No mezcles un modelo base con la aplicación que lo usa:

| `kind` | Qué es | Ejemplo del tipo |
| --- | --- | --- |
| `model` | Pesos / modelo servido por API | un modelo de lenguaje concreto |
| `app` | Producto de usuario final | un chat de escritorio |
| `platform` | Aloja o sirve modelos de terceros | un hub de inferencia |
| `framework` | Librería para construir | un framework de agentes |
| `agent` | Sistema que ejecuta tareas por sí mismo | un agente de codificación |
| `api` | Acceso programático | un endpoint de inferencia |
| `interface` | Front-end sobre un motor ajeno | una UI para difusión |
| `oss_project` | Proyecto comunitario | un runtime local |

Si una ficha mezcla dos, se divide en dos fichas.

### 4. Asignar estado

| Estado | Condición exacta |
| --- | --- |
| `verified` | Todos los campos duros confirmados hoy contra fuente oficial |
| `partially_verified` | Confirmados los del plan gratuito; alguno secundario sin confirmar |
| `pending_review` | Ficha nueva o campos clave sin confirmar |
| `outdated` | Verificación anterior a `STALE_AFTER_DAYS`, o fuente contradictoria |
| `discontinued` | La web oficial confirma cierre o redirige a otro producto |

Fija `nextReviewAt` = fecha de verificación + 90 días (30 si el plan gratuito
cambia con frecuencia).

### 5. Registrar el cambio

Si un campo cambia respecto a la verificación anterior, añade una entrada a
`changelog[]` con **la fecha del cambio del fabricante**, no la de hoy, y con
`sourceUrl`.

### 6. Regenerar y comprobar
```bash
npm run data:migrate:dry     # informe, sin escribir
npm run data:migrate
npm run test                 # los tests de integración validan el dataset real
```

## Criterios de verificación

Una ficha puede pasar a `verified` sólo si:

1. Cada campo duro tiene una fuente oficial que lo afirma.
2. `sources[]` incluye la URL de precios (o del repo, si es open source).
3. `lastVerifiedAt` es la fecha real de la comprobación.
4. `kind` corresponde a lo que la herramienta realmente es.
5. `npm run test` pasa.
6. Ningún campo duro quedó en `unverified` por comodidad.

## Prohibiciones

- ❌ No conviertas «la página no lo dice» en `no`. Eso es inventar.
- ❌ No copies datos de otro directorio de IA.
- ❌ No estimes límites, precios ni cuotas.
- ❌ No marques `verified` sin haber abierto la fuente en esta sesión.
- ❌ No inventes puntuaciones: los cinco componentes son juicio editorial y se
  justifican en el veredicto.
- ❌ No añadas fichas superficiales para engordar el número.
- ❌ No mezcles modelo y producto comercial en una sola ficha.
- ❌ No escribas descripciones promocionales copiadas del fabricante.

## Formato del informe final

```markdown
## Verificación del catálogo — <fecha>

### Resumen
| | Antes | Después |
|---|---|---|
| Fichas totales | | |
| verified | | |
| partially_verified | | |
| pending_review | | |
| outdated | | |
| discontinued | | |

### Fichas verificadas (N)
| Slug | Campos comprobados | Fuente | Cambios detectados |
|---|---|---|---|

### Cambios de datos del fabricante (van al changelog)
| Slug | Campo | Antes | Ahora | Fecha real | Fuente |
|---|---|---|---|---|---|

### Quedan pendientes y por qué (N)
| Slug | Campo sin confirmar | Qué haría falta |
|---|---|---|

### Descartadas / discontinuadas
| Slug | Evidencia |
|---|---|

### Comprobaciones
- `npm run data:migrate:dry` → <resumen>
- `npm run test` → <resultado>
- `npm run links:check` → <URLs oficiales caídas>
```

## Ejemplos de uso

**Correcto**
```
Ficha: un generador de imágenes. Su página de precios enumera el plan gratuito
pero no menciona marca de agua.
→ hasWatermark = 'unverified'
→ estado = 'partially_verified'
→ nota en el informe: "falta confirmar marca de agua"
```

**Incorrecto**
```
Misma ficha.
→ "todos los de esta gama ponen marca de agua" → hasWatermark = 'yes'  ❌
   Eso es una suposición presentada como hecho verificado.
```

## Detente y pide aprobación si

- La fuente oficial **contradice** una ficha publicada (afecta a lectores que ya
  tomaron una decisión con ese dato).
- Una herramienta ha **cerrado** o ha sido absorbida.
- Un plan gratuito **desaparece** o pasa a exigir tarjeta.
- Hay que **eliminar** una ficha existente.
- La verificación requiere **crear una cuenta** o introducir una tarjeta.
- Una corrección de un lector resulta correcta y afecta a la puntuación
  publicada.
