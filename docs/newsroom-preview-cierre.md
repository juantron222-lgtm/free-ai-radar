# Newsroom en Preview — cierre formal

**SHA final:** `ac3db0de0436f23b6e66c59ac8dca379b871f507`
**Rama:** `newsroom-produccion` (17 commits sobre `main`, empujada)
**`main`:** `928022e`, intacta
**Fecha:** 2026-09-07

Newsroom queda operativo en Preview contra el staging de Supabase
`zzgvpyhygzfwtyecguyi`. Production no se ha tocado en ningún momento.

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
