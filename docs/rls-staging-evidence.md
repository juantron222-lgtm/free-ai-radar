# RLS: auditoría, correcciones y evidencia

**Estado: ejecutado contra PostgreSQL 18.3 real. 51 de 51 ataques bloqueados.**

Los hallazgos salieron de leer el SQL como atacante; las correcciones están
escritas; y ahora las cuatro migraciones se aplican y la suite corre contra un
motor de verdad. Lo que todavía **no** se ha hecho es correrla contra Supabase:
el motor es Postgres real, pero GoTrue y el JWT firmado están replicados, no
son los suyos. La diferencia se detalla en §6.

| | |
| --- | --- |
| Políticas | [`0002_rls_policies.sql`](../supabase/migrations/0002_rls_policies.sql) |
| Correcciones | [`0004_rls_hardening.sql`](../supabase/migrations/0004_rls_hardening.sql) |
| Suite adversarial | [`supabase/tests/rls_adversarial.sql`](../supabase/tests/rls_adversarial.sql) — 51 comprobaciones |
| Arnés | [`scripts/rls-harness.mjs`](../scripts/rls-harness.mjs) — `npm run rls:test` |
| Evidencia bruta | [`docs/evidence/rls-run.json`](evidence/rls-run.json) |

---

## 1. Cómo se ejecuta

```bash
npm run rls:test
```

Levanta un PostgreSQL 18.3 (PGlite, Postgres compilado a WebAssembly), replica
el esquema `auth` de Supabase, aplica las cuatro migraciones, ejecuta las 51
comprobaciones y hace `rollback`. Tarda unos segundos y no deja nada. Devuelve
código 1 si algo falla, así que sirve como puerta de un pipeline.

**El resultado del 7 de agosto de 2026:**

```
Motor:  PostgreSQL 18.3 (PGlite 0.5.4)
51/51 bloqueados · 0 bypass
Políticas aplicadas: 81
Tablas alcanzables por autocraw_ingest: 8
Capa de permisos por columna en profiles: intacta
```

### La prueba de que la suite no pasa en vacío

Una suite verde sólo es evidencia si habría estado roja con el código roto:

```bash
npm run rls:test:broken   # omite la migración 0004
```

```
38/51 bloqueados · 13 bypass
⚠ Capa de permisos por columna en profiles: ANULADA
```

Trece, pero **no son trece agujeros independientes**. RLS-01a se ejecuta
primero y asciende a Mallory a administrador; de ahí en adelante los diez
siguientes fallan porque Mallory *ya es admin*. Es el radio de explosión de una
sola escalada, y decirlo así importa: exagerar el recuento sería tan poco útil
como esconderlo. El único hallazgo independiente es RLS-08a, la lectura de
perfiles marcados para borrado.

---

## 2. Hallazgos

### RLS-01 · Crítica · Un usuario podía ascenderse a administrador

La política era:

```sql
create policy "profiles: update own" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
```

Y tres líneas más arriba, un comentario decía: *«A user must never be able to
promote themselves. Role changes go through the service role in the admin
API.»*

Nada lo imponía. `using` y `with check` sólo restringen **qué fila** se escribe,
nunca **qué columnas**. Así que esto funcionaba:

```sql
update public.profiles set role = 'admin' where id = auth.uid();
```

Y a partir de ahí se abre todo lo que cuelga de `is_admin()`: leer cualquier
perfil, leer `audit_logs`, reescribir los planes de suscripción.

Es la clase de fallo que se escribe solo: el autor pensó la regla, la escribió
en prosa y dio por hecho que la política la expresaba. La prosa y el código
decían cosas distintas.

**Corrección — dos capas independientes**, porque tarde o temprano alguien
editará una sin saber de la otra:

1. **Permisos por columna.** `authenticated` sólo puede actualizar
   `display_name`, `avatar_url`, `locale`, `interests` y `onboarded_at`. Falla
   cerrado: una columna nueva no es escribible hasta que alguien la conceda a
   propósito.
2. **Disparador que compara OLD y NEW.** Un `with check` no ve `OLD`, así que no
   puede expresar «esto no debe haber cambiado». Un disparador sí, y además
   cubre a cualquier escritor que llegue por una política futura.

### RLS-02 · Alta · `is_staff` e `is_admin` sin `search_path` fijado

`current_role()` es `SECURITY DEFINER` y fija su `search_path`. Las dos
funciones que la envuelven, no.

Hoy no es explotable: ambas cualifican su llamada con `public.`. Pero una
función `SECURITY DEFINER` sin `search_path` fijado está a un refactor de serlo
— en cuanto alguien escriba dentro una llamada sin cualificar, el
`search_path` que controla quien llama decide qué función se ejecuta.

Fijarlo no cuesta nada y elimina la clase entera.

### RLS-03 · Media · Borrarse el perfil sin perder la sesión

`profiles: admin deletes` admitía `id = auth.uid()`. Borrar la fila de
`profiles` no borra la de `auth.users`: la sesión seguía siendo válida y
`current_role()` caía en su `coalesce(..., 'user')`. La cuenta seguía
existiendo y funcionando, sin su registro.

El borrado del RGPD tiene que eliminar la identidad, y eso sólo lo puede hacer
el service role. Se cierra la vía de auto-borrado y se sustituye por un borrado
lógico que el usuario sí puede hacer, con la eliminación real en el servidor.

### RLS-04 · Media · Los perfiles marcados para borrado seguían legibles

Nada consultaba `deleted_at`. Una cuenta en proceso de eliminación seguía
sirviendo su nombre y su avatar mientras la fila existiera.

### RLS-05 · Media · Las listas públicas exponían la identidad de quien las publica

Cualquiera podía leer una lista pública, incluido su `user_id`. Cruzado contra
`profiles`, eso es un nombre pegado a un historial de lectura. Publicar una
lista es compartir una lista, no compartir quién eres.

### RLS-06 · Baja · Un usuario podía escribir envíos anónimos

`with check (submitted_by is null or ...)` permitía a alguien con sesión
escribir `submitted_by = null`, desligando su propio envío de sí mismo. Sin
riesgo de abuso, pero hacía imposible devolvérselo en «tus envíos» y rompía la
atribución en una auditoría.

### RLS-07 · Baja · Reglas correctas por omisión

`audit_logs` y `processed_webhook_events` estaban bien —sin política de
escritura, luego denegadas— pero lo estaban *por omisión*. Ahora lo dicen, para
que sobreviva a que alguien «arregle» la política que falta.

---

## 3. La suite adversarial

51 comprobaciones. Ninguna verifica que el camino feliz funcione: todas
comprueban que lo que debe ser imposible lo es.

| Bloque | Qué intenta |
| --- | --- |
| RLS-01 | Escalada de privilegios: ascenderse, reasignar el perfil a otra identidad |
| RLS-02 | Leer lo ajeno: perfiles, listas, favoritos, alertas, historial, boletín, auditoría, facturación |
| RLS-03 | Escribir lo ajeno: apropiarse de listas, regalarse una suscripción, falsificar auditoría |
| RLS-04 | Tocar lo editorial: subirse la puntuación, reescribir un veredicto, publicar una ficha |
| RLS-05 | La capa comercial: crear un enlace sin divulgación, ver lo pendiente |
| RLS-06 | El rol `autocraw_ingest` contra sus propios límites |
| RLS-07 | Anónimo: no ve nada privado, sí ve el catálogo |
| RLS-08 | RGPD: un perfil en borrado deja de ser legible, y sus listas públicas también |

Cada intento se registra como `PASA` (el ataque fue bloqueado) o `FALLA` (el
ataque funcionó: hay bypass). La suite termina con `raise exception` si hay un
solo `FALLA`, así que sirve como puerta de un pipeline. Todo ocurre dentro de
una transacción que hace `rollback`: no deja nada.

La suplantación se hace fijando `request.jwt.claims`, que es exactamente lo que
hace PostgREST con una petición autenticada. Por eso los resultados son
trasladables: las políticas no pueden notar la diferencia.

**Ejecución:**

```bash
psql "$DATABASE_URL_STAGING" -v ON_ERROR_STOP=1 -f supabase/tests/rls_adversarial.sql
```

O pegando el fichero entero en el editor SQL del proyecto de staging.

Nunca contra producción. Hace `rollback`, pero una suite cuyo trabajo es
intentar escalar privilegios no tiene nada que hacer cerca de datos reales.

---

## 4. Dos hallazgos que sólo aparecieron al ejecutarlo

Ninguno de estos dos se ve leyendo. Salieron de correr el SQL, que es
precisamente el argumento para correrlo.

### La migración 0001 no era ejecutable

`public.current_role()` es `language sql`, y PostgreSQL valida el cuerpo de esas
funciones al crearlas (`check_function_bodies` está activo por defecto). Estaba
declarada en la sección de utilidades, **antes** de la tabla `public.profiles`
que consulta.

Resultado: la migración abortaba en su primera ejecución con
`relation "public.profiles" does not exist`. En cualquier base de datos, no sólo
aquí. El esquema llevaba meses en el repositorio sin que nadie lo notara, porque
nunca se había ejecutado.

Corregido moviendo las tres funciones justo detrás de la tabla.

### Un `grant all` posterior anula la defensa por columnas

La primera versión del arnés aplicaba `grant all on all tables` después de las
migraciones, imitando lo que recomiendan casi todas las guías de Supabase. Eso
**deshacía en silencio** el `revoke update on public.profiles` de la migración
0004.

Y la suite seguía en verde: el disparador atrapaba la escalada igualmente.

Es exactamente el motivo por el que 0004 pone dos capas independientes en lugar
de una buena. Una de ellas se puede perder sin que nada falle visiblemente; con
dos, el fallo tiene que ocurrir dos veces.

Corregido de dos formas: el arnés ahora concede como concede Supabase de verdad
—con `alter default privileges`, que se aplica al crear cada tabla, de modo que
un `revoke` posterior manda— y además comprueba explícitamente si
`authenticated` puede escribir `profiles.role`, y lo avisa:

```
Capa de permisos por columna en profiles: intacta
```

---

## 5. Qué contiene la evidencia

`docs/evidence/rls-run.json` se regenera en cada ejecución y contiene:

| Clave | Qué es |
| --- | --- |
| `engine` | Versión exacta del motor |
| `results` | Las 51 comprobaciones con veredicto y detalle |
| `policies` | Las 81 políticas **tal y como quedan aplicadas**, leídas de `pg_policies` |
| `autocrawGrants` | Permisos de tabla efectivos de `autocraw_ingest` |
| `columnGrants` | Permisos por columna, donde vive la defensa de `profiles` |
| `columnDefenceIntact` | Si la capa de columnas sigue en pie |
| `notes` | Cada adaptación hecha para PGlite |

Lo de `policies` no es adorno: es la diferencia entre lo que las migraciones
*creen* haber creado y lo que la base de datos *tiene*. Y `autocrawGrants` es la
comprobación del mínimo privilegio: si ahí apareciera una sola tabla editorial o
de usuario, el diseño habría fallado por mucho que el documento diga lo
contrario. Hoy son ocho, todas comerciales, más `categories` en sólo lectura.

---

## 6. Qué es real aquí y qué no

Merece precisión, porque «lo hemos probado» significa cosas distintas.

**Real:** el motor es PostgreSQL 18.3. Las políticas, los permisos, los
disparadores, las restricciones, `security definer` y la propia RLS son los del
mismo código C que corre en un servidor. Un ataque bloqueado aquí está
bloqueado por el mismo mecanismo que lo bloquearía en producción.

**Replicado:** `auth.users` y `auth.uid()` están recreados a partir de la
definición que publica Supabase. `auth.uid()` lee `request.jwt.claims`
exactamente igual, así que ninguna política puede notar la diferencia — es el
único gancho del que cuelgan todas.

**Ausente:** GoTrue. No hay JWT firmado, ni caducidad de token, ni refresco, ni
las políticas que Supabase añade por su cuenta al esquema `auth`. El
`service_role` es un rol con `bypassrls`, que es lo que hace en Supabase, pero
sin la comprobación de firma que lo autoriza.

**Omitido por PGlite:** `pgcrypto`, `pg_trgm` y `unaccent`, y los dos índices GIN
de trigramas que dependen de la segunda. Son aceleradores de búsqueda:
ninguna política, permiso, disparador ni restricción depende de ellos.
`gen_random_uuid()` es del núcleo desde PostgreSQL 13, así que prescindir de
pgcrypto no cuesta nada. Cada omisión se imprime en cada ejecución.

**Lo que sigue pendiente**, y sólo lo puedes hacer tú: crear el proyecto de
staging en Supabase, pasarme las claves por un canal que no sea el repositorio,
y autorizarme a instalar `psql` o la CLI. Con eso, la misma suite se ejecuta sin
cambiar una línea —está escrita en SQL puro por esa razón— y la evidencia se
vuelve completa.
