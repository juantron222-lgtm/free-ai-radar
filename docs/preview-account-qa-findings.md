# QA de cuentas reales sobre el Preview: hallazgos y causas

**Fecha:** 9 de agosto de 2026
**Destino:** Vercel Preview de `opus5-premium-rebuild` + Supabase **staging**
**Resultado final:** 16/16 comprobaciones correctas
**Evidencia:** [`docs/evidence/preview-account-qa.json`](evidence/preview-account-qa.json)

Primera vez que las rutas de cuenta se ejecutan contra Supabase real desde un
despliegue real. Las pruebas locales usan el almacén de identidades en JSON, así
que hasta aquí ninguna había tocado una clave foránea. Encontró un fallo que era
total, no intermitente.

---

## 1. Ningún favorito podía guardarse

### Qué pasaba

Toda escritura en `user_favorites` era rechazada:

```
23503  insert or update on table "user_favorites" violates foreign key
       constraint "user_favorites_tool_id_fkey"
       Key (tool_id)=(tool_ollama) is not present in table "tools"
```

Para cualquier herramienta y cualquier usuario. La página no se rompía: el
endpoint devolvía «No se ha podido guardar», y el favorito simplemente no
aparecía después.

### Causa raíz

`public.tools` tenía **cero filas**. `public.categories` también.

El esquema declara la relación:

```sql
tool_id text not null references public.tools(id) on delete cascade
```

…y nunca hubo un paso que poblara la tabla referenciada. Las migraciones
construyen el esquema; ninguna inserta contenido. Existe `supabase/seed/seed.sql`
generado por `data:seed-sql`, pero **ningún comando lo aplica**, está desfasado
(22 herramientas frente a las 24 del catálogo) y no siembra categorías — de modo
que aplicarlo habría fallado igual, en `tools.category_slug`.

La restricción nunca estuvo mal. Se le pedía garantizar integridad contra una
tabla vacía, y lo hacía con exactitud: nada puede referenciar una herramienta,
porque no hay herramientas.

### Por qué no lo vio nada antes

Ninguna página pública lee esas tablas. El sitio entero se renderiza desde el
catálogo comprometido en el repositorio (`src/data/generated/tools.json` vía
`catalog.ts`), que es lo que mantiene las páginas prerenderizables y hace que el
sitio siga funcionando si Supabase no responde. El espejo en base de datos existe
sólo para que los datos de usuario puedan apuntar a una herramienta con una clave
foránea y que esa referencia signifique algo.

Un espejo que nadie llena es peor que no tener espejo.

### Corrección

`node scripts/staging-run.mjs --sync-catalog` (`npm run db:sync:staging`) llena
el espejo desde el mismo conjunto de datos que lee `catalog.ts`, y **se ejecuta
al final de `--migrate`** en lugar de ser un paso que alguien recuerda. El orden
«migrar y luego sembrar» se olvida exactamente una vez, y olvidarlo deja los
favoritos rotos sin error en ninguna página.

Tres decisiones que lo mantienen honesto:

- **Copia lo almacenado, no lo derivado.** `scoreTotal` queda fuera: lo calcula
  `hydrateTool` a partir de las cinco componentes. Un valor derivado escrito en
  un segundo sitio es un valor derivado que puede discrepar del primero.
- **`jsonb_populate_recordset` contra el tipo de fila de la tabla** hace el
  casting, así que enums, fechas y jsonb no necesitan tratamiento por columna y
  una columna nueva no obliga a editar el script. La lista de actualización sale
  de `information_schema` por el mismo motivo.
- **Se niega antes de tocar la base de datos** si el catálogo trae una clave que
  la tabla no tiene, o una herramienta apunta a una categoría inexistente. A
  medio sincronizar es peor que sin sincronizar.

Idempotente: la segunda pasada informa 17 y 24 filas actualizadas, ninguna
insertada.

### Detalle que costó una vuelta

`postgres.js` serializa el parámetro cuando la columna es `jsonb`. Pasar
`JSON.stringify(filas)` hace que llegue un escalar JSON y Postgres responde
`cannot call jsonb_populate_recordset on a non-array`. Hay que pasar el array,
no una cadena que lo contenga.

---

## 2. El informe se contradecía a sí mismo

Dos de los tres fallos iniciales no eran del sitio, sino de las aserciones.

La primera versión registraba `status of 400` sin URL, sin método y sin paso:
suficiente para saber que algo iba mal, insuficiente para saber qué. Con la
respuesta registrada junto a su petición, quedó a la vista:

| Paso | Petición | Estado | Qué es en realidad |
| --- | --- | --- | --- |
| registro | `POST /api/auth/signup` | 400 | GoTrue rechaza el dominio de prueba |
| admin | `GET /admin` | 404 | un usuario sin permisos no debe saber que la ruta existe |

**ACC-11 pasaba *porque* `/admin` respondía 404, y ACC-13 fallaba porque lo había
hecho.** Los dos pasos existen para provocar un rechazo, y el rechazo es lo que
significa aprobar en ellos.

Ahora se declaran como rechazos previstos, con su motivo, y se emparejan por
paso, ruta **y estado** — si `/admin` empezara a responder 500, deja de estar
cubierto. Y **ACC-15 comprueba que siguen ocurriendo**: una exención para un
rechazo que ha dejado de producirse es una exención que miente sobre el sitio.

---

## 3. Lo que se decidió no cambiar

El mensaje que ve quien no consigue registrarse es genérico:

> No hemos podido completar la operación. Revisa los datos e inténtalo de nuevo.

Es `GENERIC_AUTH_ERROR`, y es deliberado. Distinguir «ya está registrado» de «no
es una dirección válida» convierte el formulario en un oráculo de enumeración de
cuentas. Se queda como está.

---

## 4. Qué cubre esta ronda y qué no

**Cubre**, contra Supabase staging real y desde el despliegue:
modo de autenticación resuelto, registro público, alta por Admin API, login,
panel de cuenta, permanencia en el origen del Preview, favoritos, listas,
preferencias, página de recuperación, denegación de `/admin` a un usuario normal,
cierre de sesión, consola y red.

**No cubre:**

- El envío real de correo. `emailSendPolicy` exige cuatro condiciones
  simultáneas y en Preview nunca se cumplen; el flujo de recuperación se
  comprueba hasta la página, no hasta la bandeja de entrada.
- El registro completo por formulario. GoTrue rechaza dominios no entregables y
  usar un buzón real significa enviar correo real: una decisión de una persona,
  no de una prueba.
- Producción. Nada de esto se ha ejecutado ni promocionado a producción, y el
  espejo de contenido de producción sigue sin existir — **cuando exista, el
  despliegue tendrá que ejecutar la sincronización**, o los favoritos estarán
  rotos allí exactamente igual.
