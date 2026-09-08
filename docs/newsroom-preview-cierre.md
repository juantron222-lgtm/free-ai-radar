# Newsroom en Preview — cierre formal

**SHA final:** `ac3db0de0436f23b6e66c59ac8dca379b871f507`
**Rama:** `newsroom-produccion` (17 commits sobre `main`, empujada)
**`main`:** `928022e`, intacta
**Fecha:** 2026-09-07

Newsroom queda operativo en Preview contra el staging de Supabase
`zzgvpyhygzfwtyecguyi`. Production no se ha tocado en ningún momento.

> **Este documento se cerró antes de la promoción.** Newsroom está en
> Production desde el 8 de septiembre de 2026: la sección 7 lo recoge. Las
> secciones 1 a 5 siguen describiendo el sistema; la 6 es el registro del
> punto de decisión y ya no es trabajo pendiente.

---

## 1. Arquitectura efectiva

El diagrama que importa es el de después del arreglo de `getDesk()`, porque hasta
ese commit el circuito estaba roto en un punto que no daba ningún síntoma.

```
news-sources.json          22 fuentes oficiales
        │
        ▼  cron diario · /api/cron/newsroom · CRON_SECRET
   RADAR ── feed oficial o HTML del artículo, según el fabricante
        │   dedupe por url canónica (restricción única en la base)
        ▼
   newsroom_candidates ──► newsroom_triage
        │                        │
        ▼                        ▼
   newsroom_verification ──► newsroom_drafts        (+ factTrace)
        │
        ▼  getDesk()  ← lee de Supabase, no de ficheros
   /admin/noticias            mesa de edición, sólo admin
        │
        ▼  decide({ action: 'approve' })   ÚNICA acción que publica
   newsroom_published         fila persistente
        │
        ▼  NEWSROOM_DEPLOY_HOOK
   build en Vercel
        │
        ▼  prebuild → newsroom-sync.mjs
   src/data/news/news.json (semilla, 11) ⊎ newsroom_published
        │
        ▼  isPublishable() en tiempo de build
   /noticias prerenderizada
```

### Lo que decide cada capa

| Capa | Qué decide | Qué **no** puede hacer |
| --- | --- | --- |
| Radar | qué existe y de quién es | afirmar nada sobre el contenido |
| Triaje | qué merece el coste de verificar | publicar |
| Verificación | qué sostiene la fuente, con cita literal | convertir silencio en «no» |
| Borrador | prosa compuesta de citas, con `factTrace` | afirmar sin cita trazable |
| Mesa | mostrar todo lo anterior a una persona | aprobar por su cuenta |
| **Aprobación humana** | **lo único que publica** | saltarse la puerta editorial |
| Build | volver a validar todo el conjunto | inventar lo que falte |

### El fallo que este arreglo cerró

`getDesk()` importaba las cuatro etapas como JSON estático. El cron escribía en
Supabase cada noche y `/admin/noticias` seguía mostrando los ficheros del
repositorio: la mesa listaba dos borradores escritos a mano mientras tres
generados por el cron esperaban en una base que nadie leía. Todo funcionaba y
nada llegaba a quien tenía que aprobarlo.

Ahora las etapas se leen de donde viva el pipeline —Supabase con service role,
ficheros sin él—, de modo que la mesa sigue arrancando en un portátil sin
credenciales y la suite sigue sin necesitar base de datos.

---

## 2. Estado final verificado

### Supabase staging `zzgvpyhygzfwtyecguyi`

| Tabla | Filas |
| --- | --- |
| `newsroom_candidates` | 265 (265 urls canónicas distintas, 0 duplicadas) |
| `newsroom_triage` | 264 |
| `newsroom_verification` | 6 |
| `newsroom_drafts` | 3 |
| `newsroom_decisions` | 1 |
| `newsroom_published` | **1** |
| `newsroom_runs` | 8 |

Batería `npm run newsroom:e2e`: **19 de 19**. Suite completa: **1232 pruebas**,
lint limpio, typecheck 0 errores.

### Los tres borradores

| Fuente | eventType / availability | Categoría | Plan gratuito |
| --- | --- | --- | --- |
| `blogs.nvidia.com` | `lanzamiento` / `available` | agentes | `unverified` |
| `blog.comfy.org` (FLUX 3) | `actualizacion` / `limited` | imagen | `unverified` |
| `blog.comfy.org` (Seedance 2.5) | `actualizacion` / `limited` | video | `unverified` |

Los dos de ComfyUI están acotados porque ComfyUI no fabrica FLUX ni Seedance:
acreditan la integración en su plataforma, no el lanzamiento del producto. Los
tres mantienen `unverified` sobre gratuidad, que es lo que sus páginas sostienen.

### Vercel

- **Preview:** 11 variables — 8 de Newsroom acotadas a `newsroom-produccion`,
  más `EMAIL_DRY_RUN`, `AUTH_SECRET` y `DEPLOYMENT_ENV`, que no son de Newsroom
  y se dejaron intactas.
- **Production:** 6 variables, sin tocar.
- Ninguna clave de Supabase se ha cambiado ni rotado.

---

## 3. El canario de staging

`newsroom_published` contiene **una** fila, deliberadamente:

```
slug   : blogs-nvidia-com-nvidia-and-local-ai-community-fuel-open-source-models-and-intel
por    : validacion-e2e
```

Se conserva como fixture. Su función es que `/noticias` en Preview muestre **12**
noticias en lugar de las 11 de la semilla: si algún día vuelve a mostrar 11, la
lectura de `newsroom_published` en el build se ha roto, y ese es exactamente el
fallo que de otro modo pasaría inadvertido —un sitio que se despliega bien y
sirve una versión sin lo aprobado—.

Comprobación rápida del canario:

```bash
curl -sL -H "x-vercel-protection-bypass: $BYPASS" \
     -H "x-vercel-set-bypass-cookie: samesitenone" \
     "$PREVIEW_URL/noticias" | grep -c 'href="/noticias/'
```

Debe contar 12. Si cuenta 11, mira `prebuild` antes que nada.

---

## 4. Rollback

Por orden de reversibilidad, del más barato al más caro. Ninguno toca `main`.

### 4.1 Despublicar el canario

```sql
delete from public.newsroom_published
 where slug = 'blogs-nvidia-com-nvidia-and-local-ai-community-fuel-open-source-models-and-intel';
```

Después, disparar `NEWSROOM_DEPLOY_HOOK`. `/noticias` vuelve a 11.

La decisión correspondiente **no se borra**: `newsroom_decisions` no tiene
política de `delete` y eso es deliberado. Queda constancia de que se aprobó y de
que se retiró.

### 4.2 Vaciar el pipeline y volver a empezar

```sql
delete from public.newsroom_drafts;
delete from public.newsroom_verification;
delete from public.newsroom_triage;
delete from public.newsroom_candidates;
```

El cron reconstruye todo en la siguiente pasada. `newsroom_published`,
`newsroom_decisions` y `newsroom_runs` sobreviven a propósito: son historial.

### 4.3 Revertir el código

```bash
git checkout newsroom-produccion
git revert --no-commit ac3db0d..HEAD    # o los commits concretos
```

`main` sigue en `928022e`, así que producción no depende de nada de esto.

### 4.4 Deshacer la configuración de Preview

Las 8 variables están acotadas a `newsroom-produccion`; borrarlas sólo afecta a
esa rama. Con `VERCEL_TOKEN` presente:

```bash
npm run vercel:newsroom:env      # informa qué hay, sin tocar nada
```

No hay orden de «deshacer» automática, y es a propósito: borrar variables de un
panel de despliegue no se revierte leyendo un log.

### 4.5 Retirar la migración

```sql
drop table if exists public.newsroom_published, public.newsroom_decisions,
  public.newsroom_drafts, public.newsroom_verification, public.newsroom_triage,
  public.newsroom_candidates, public.newsroom_runs cascade;
```

`0015` sólo añade; no modifica ninguna tabla anterior, así que retirarla deja el
esquema exactamente como estaba.

---

## 5. Deuda externa a Newsroom

**`AUTOCRAW_DB_URL_STAGING` sigue apuntando al proyecto de Supabase eliminado
`lhujloyflkllryshpkjl`.**

No es de Newsroom, ninguna parte de este trabajo la usa y no se ha tocado. Pero
las suites de AutoCraw fallarán contra un proyecto que ya no existe, y el fallo
se parecerá a un problema de red en lugar de a una variable caducada — que es
exactamente cómo nos costó dos sesiones el mismo problema en `SUPABASE_DATABASE_URL`.

Se arregla en su propio trabajo: recrear el rol `autocraw_ingest` en el staging
nuevo y actualizar la cadena. No bloquea nada de Newsroom.

---

## 6. Punto de promoción a Production

Newsroom **no está listo para Production** y no debe promoverse en este trabajo.
Lo que sigue es el punto exacto desde el que otro trabajo separado podría
hacerlo, y lo que tendría que resolver antes.

### Punto de partida

```
rama : newsroom-produccion
sha  : ac3db0de0436f23b6e66c59ac8dca379b871f507
base : main @ 928022e
```

La rama está al día con `main` y no tiene conflictos pendientes.

### Lo que falta, y por qué no se hace aquí

1. **Migrar `0015` al Supabase de producción.** El guardián de staging bloquea
   cualquier operación contra un proyecto que no sea el declarado, por diseño.
   Promover exige una decisión explícita y un procedimiento propio.

2. **Variables de Production.** Ninguna de las 8 de Newsroom existe allí.
   `vercel-newsroom-env.mjs` **sólo escribe en `preview`** y hay que mantenerlo
   así: una versión que aceptara `production` sería la forma de que una clave de
   staging acabe sirviendo a lectores reales.

3. **Un `CRON_SECRET` distinto.** El de Preview no debe reutilizarse.

4. **Decidir la cadencia del cron en `vercel.json`.** En Preview se dispara a
   mano; en Production hay que fijarla, y con ella el coste.

5. **Cobertura editorial.** Con las fuentes actuales, una noche deja más
   bloqueadas que verificadas: OpenAI devuelve 403 en sus artículos y Google los
   renderiza con JavaScript, así que ambos dependen de lo que su feed contenga
   literalmente. Eso es correcto y no debe relajarse — pero conviene entrar a
   Production sabiendo que el ritmo será de pocas noticias verificadas por
   semana, no de una diaria.

6. **Quién aprueba.** En Production la mesa exige rol `admin` real. Hay que
   decidir quién lo tiene antes de que haya algo que aprobar.

### Lo que ya no hay que rehacer

Esquema, RLS, deduplicación, idempotencia, adaptadores de fuentes, puerta
editorial, `factTrace`, acotación de alcance por fabricante, mesa de edición,
seguridad del cron y del hook: todo está probado contra un Supabase real y
cubierto por 1232 pruebas. Promover es una tarea de configuración y decisión,
no de construcción.

---

## 7. Promoción a Production — 8 de septiembre de 2026

```
main                 : a0b07aa  (fusión --no-ff de newsroom-produccion @ 651a5f6)
main anterior        : 928022e
supabase production  : fafntsrszmllgvkrxzdw
cron                 : /api/cron/newsroom, 0 6 * * * (uno solo: Hobby)
```

### Cómo se verificó el esquema sin credenciales de producción

No hay forma de alcanzar `fafntsrszmllgvkrxzdw` desde una máquina de
desarrollo, y es deliberado: no existe cadena de conexión, ni token de gestión,
ni la CLI; sólo la referencia, que está ahí para que el guardián se niegue a
tocar ese proyecto. El único sitio donde vive la service role de producción es
dentro de un despliegue.

Así que la comprobación se mudó al único lugar que puede hacerla:
`scripts/newsroom-schema.mjs` corre en el `prebuild`, compara el esquema vivo
con `0015_newsroom.sql` y rompe el build si difieren. Un build roto no
despliega, así que el peor caso es que el sitio siga sirviendo la versión
anterior.

Resultado, idéntico en los tres builds de producción —incluido el lanzado por
el Deploy Hook, que es el que dispara Newsroom—:

```
proyecto : fafntsrszmllgvkrxzdw.supabase.co
tablas   : 7/7
columnas : 77 comprobadas
unicidad : restricción presente (23502)
anon     : sin acceso a ninguna
✓ coincide con la migración.
```

Sin diferencias, así que no hizo falta ninguna migración aditiva.

### Primera pasada real en Production

```
found 2602 · ingested 219 · triaged 219 · verified 2 · drafted 2
published 0 · heldForReview 2 · archived 9 · superseded 2
errors: Freepik Blog HTTP 403
```

Cero errores de base de datos escribiendo en las siete tablas, que es la
confirmación más fuerte de que el esquema es el correcto: no se dedujo, se
ejerció.

**Publicó cero, y por el motivo correcto.** Las dos candidatas eran anuncios de
*partner nodes* de ComfyUI: `comfy.org` no fabrica Seedance ni FLUX 3, así que
la acotación de alcance las degradó a integración, y además tenían 31 y 34 días.
La puerta hizo exactamente lo que se le pidió y no se tocó.

Una segunda pasada inmediata ingirió 0 y duplicó 0: la deduplicación por
`canonical_url` y los upsert son idempotentes contra datos reales.

### Estado de la portada

2 destacadas, 9 en «Archivo», 11 enlaces vivos y las 11 URLs en `sitemap.xml`.
Envejecer saca de portada; no borra ni desindexa.

### Rollback de Production

El de la sección 4 sigue valiendo para el pipeline y la migración. Para el
código:

```bash
git revert -m 1 a0b07aa && git push origin main
```

Devuelve el árbol a `928022e` sin tocar ningún dato. Alternativa más rápida sin
reescribir git: promover en Vercel el despliegue
`dpl_4UD9sB2UA4gpnVATZdBoYUa3Dcr3`, que es el último de `main @ 928022e`.

### Lo que sigue pendiente

1. **Cobertura editorial.** ~~El cuello es que OpenAI devuelve 403 y Google
   renderiza con JavaScript.~~ **Esto era falso y se midió el 8 de septiembre.**
   Veinte de veintidós fuentes servían HTML de artículo perfectamente legible;
   sólo OpenAI y Freepik responden 403. Ver la sección 8.

2. **Quién aprueba.** La mesa exige rol `admin` real y hay 2 historias
   esperando decisión humana. Sigue sin decidirse quién.

3. **`AUTOCRAW_DB_URL_STAGING`** sigue apuntando al proyecto eliminado
   `lhujloyflkllryshpkjl`. Deuda externa a Newsroom, sin cambios.

---

## 8. Cobertura — 8 de septiembre de 2026

### Lo que se creía y lo que se midió

Durante todo el trabajo anterior se dio por hecho que la sección publicaba poco
porque los fabricantes bloquean la lectura. Se midió, y no era eso.

De veintidós fuentes activas, **veinte servían HTML de artículo legible**. Sólo
OpenAI y Freepik responden 403. Lo que dejaba a Anthropic —uno de los tres
fabricantes sobre los que más escribe este sitio— aportando exactamente cero era
otra cosa: no publica fecha legible por máquina en ninguna parte. Ni
`article:published_time`, ni `datePublished`, ni `<time datetime>`. Sus diez
artículos llegaban con fecha nula, la ventana de 45 días los descartaba sin
mirarlos y nadie lo notó porque la pasada terminaba en verde. Groq, Recraft,
LlamaIndex y Cursor fallaban igual.

Los cinco sí imprimen la fecha junto al titular. `scripts/dateline.mjs` la lee,
en la capa de descubrimiento y en la de verificación. Anthropic pasa de 0 a 9
artículos utilizables.

### El embudo, y dónde se estrecha de verdad

```
                    antes        después
titulares brutos     2617          3196
pasan el radar        229           342
promote                 5             5
hold                   66           105
reject                158           232
```

**Quince fuentes nuevas no movieron la publicación ni una unidad.** El límite es
el umbral de `promote` del triaje, fijado en 80. La distribución de puntuación
lo dice sin ambigüedad: 5 historias en la banda 80-100 y **33 en la 70-79**.

Eso es lógica editorial cerrada y no se ha tocado. Queda medido para que la
decisión sobre ese umbral se tome con la distribución delante y no a ojo.

### Fuentes

Treinta y nueve declaradas, treinta y siete activas. Las quince nuevas se
sondearon una a una antes de escribirlas: Anthropic Claude Platform release
notes —feed real, donde `anthropic.com/news` no tiene ninguno—, blog.google AI
y Gemini, Ollama, Together, Midjourney, OpenRouter, EleutherAI, Meta Engineering
—sustituye al feed de `ai.meta.com` que lleva meses en 404— y Cohere, Runway,
Groq, Recraft, LlamaIndex y Cursor por HTML.

Se sondeó y se dejó fuera el blog de desarrolladores de NVIDIA: cien entradas
diarias de CUDA entierran la sección en lugar de llenarla.

### Cómo se mide a partir de ahora

```bash
npm run newsroom:cobertura             # embudo en vivo por fabricante, sin base de datos
npm run newsroom:cobertura:historial   # lo que la base recuerda + fuentes inactivas
```

La detección de fuentes calladas corre además dentro de la pasada diaria y viaja
en el informe. No apaga nada: sustituir una fuente es una decisión editorial.
Hoy señala dos, y las dos de verdad: Freepik (403 permanente) y Udio (sin
publicar desde noviembre de 2025).

Las fuentes llevan `since` para que ampliar quince de golpe no produzca quince
falsos positivos. Un aviso que salta cuando no toca deja de leerse.

### Reloj

La pasada pasó de 12 a 44 segundos en local al añadir las fuentes. En Production
son **12,2 segundos** para las 37, ninguna sin visitar. Aun así se declaró
`maxDuration: 60` y un presupuesto de 35 segundos para la fase de
descubrimiento: la ingesta ocurre al final, así que una función cortada a mitad
de descarga no perdía una fuente lenta, perdía la pasada entera.

### Higiene

`SUPABASE_DATABASE_URL` retirada de Vercel Preview. Era la credencial de acceso
total al Postgres de staging en un entorno que no la usa; sobrevivió a una
limpieza anterior porque el configurador sabía no crearla pero no sabía
retirarla. Ahora la retira.

---

## 9. Recalibración del triaje — 8 de septiembre de 2026

### La auditoría que invirtió la premisa

Se leyó la fuente primaria de 38 candidatas para medir qué estaba seleccionando
de verdad el corte de 80:

| banda | leídas | verificadas | borrador válido | pasan `canAutoPublish` |
| --- | --- | --- | --- | --- |
| 80+ | 5 | 2 | 2 (40 %) | 0 |
| 75-79 | 11 | 3 | 2 (18 %) | 0 |
| **70-74** | 22 | 12 | **12 (55 %)** | **1** |

La banda que el corte descartaba entera era la mejor de las tres, y la única
historia autopublicable del conjunto salía de un 70 —Runway, *GWM Worlds 2*—,
que con la regla anterior no se habría leído nunca.

El motivo es estructural: la puntuación premia titulares de fabricantes
grandes, y los grandes son los que peor se dejan leer. Un 100 de OpenAI devuelve
403 y sólo queda su feed; los posts de comunidad de Hugging Face puntúan alto
sin sostener una frase citable. Un 70 de Runway se lee entero.

### La política

`scripts/triage/recall.mjs`. Primero **todo** lo promocionado, sin recortar
nunca; después lo mejor de la banda de recall por frescura, impacto y novedad
hasta agotar el reloj.

- **Frescura con escalón a los 21 días**, no pendiente: es la ventana en la que
  `canAutoPublish` todavía puede decir que sí.
- **Tope de 3 por fabricante** en la banda de recall. Together publicó seis
  comparativas «X vs Y en DeepSWE» el mismo día: las seis verificaban, las seis
  redactaban, ninguna publicaba —modelos ajenos, alcance degradado— y sin tope
  se habrían llevado un cuarto del presupuesto.
- La lectura va en paralelo **entre** fabricantes y nunca dos peticiones a la
  vez dentro de uno.

### Medido en Production

| pasada | total | lectura | leídas | verificadas | rechazadas tras leer | **publicadas** | en cola |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 18,7 s | 1,5 s | **23** | 10 | 13 | **0** | 11 |
| 2 | 11,0 s | 0,9 s | 9 | 5 | 4 | **0** | 2 |
| 3 | 12,0 s | 0,2 s | 2 | 0 | 2 | **0** | 0 |

Por banda en la primera pasada: 70-74 → 14 leídas, 7 verificadas; 75-79 → 9
leídas, 3 verificadas. La cola se drena sola porque no se relee lo que ya tiene
veredicto.

Ese `0` repetido es el criterio de éxito, no un fallo. `canAutoPublish`,
`checkDraft`, `factTrace` y el alcance por fabricante están intactos.

### El reloj

Había dos presupuestos independientes —30 s para descubrir, 30 s para leer—
que sumaban más que el techo de 60. Ahora comparten un plazo único de 45 s, con
15 de margen para autopublicación, portada y registro. En Production la pasada
completa tarda 12-19 s, así que el plazo no llega a rozarse.

### Lo que queda en la mesa

Cuatro borradores esperando decisión humana. Los dos de ComfyUI, por alcance de
terceros y edad. Los **dos de Suno pasan todo menos la edad** —26 y 29 días—:
son el atasco de la primera barrida con la red ancha, no un defecto de la
puerta. A partir de ahora el cron las encontrará dentro de la ventana.
