# RLS: auditoría, correcciones y evidencia

**Estado: auditado estáticamente y corregido. No ejecutado todavía contra una base de datos real.**

Esa segunda frase es la importante. Los hallazgos de abajo salieron de leer el
SQL como atacante, y las correcciones están escritas, pero **ninguna política de
este proyecto ha corrido nunca contra un Postgres real**. Hasta que lo haga, lo
que hay es un diseño revisado, no un sistema verificado.

| | |
| --- | --- |
| Políticas | [`0002_rls_policies.sql`](../supabase/migrations/0002_rls_policies.sql) |
| Correcciones | [`0004_rls_hardening.sql`](../supabase/migrations/0004_rls_hardening.sql) |
| Suite adversarial | [`supabase/tests/rls_adversarial.sql`](../supabase/tests/rls_adversarial.sql) — 51 comprobaciones |

---

## 1. Por qué no hay ejecución todavía

En esta máquina no hay Docker, ni `psql`, ni CLI de Supabase, ni Postgres, ni
fichero `.env`, ni ninguna variable de entorno de conexión. Comprobado, no
supuesto:

```
docker       NO INSTALADO
psql         NO INSTALADO
supabase     NO INSTALADO
pg_isready   NO INSTALADO
.env         no existe (sólo .env.example)
```

Crear el proyecto de staging exige dar de alta una cuenta y aceptar unos
términos. Es un acto humano y no lo puedo hacer yo. Lo que sí se puede hacer sin
eso está hecho: la auditoría, las correcciones y una suite que se ejecuta con
una sola orden en cuanto exista la instancia.

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

## 4. Lo que falta, y quién puede hacerlo

Sólo el primer paso está fuera de mi alcance; el resto sale de él.

1. **Crear el proyecto de staging en Supabase.** Requiere cuenta y aceptar
   términos: acto humano. Nombre sugerido `free-ai-radar-staging`, región
   europea por cercanía a los usuarios.
2. Pasarme la cadena de conexión de staging y las claves `PUBLIC_SUPABASE_URL`,
   `PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` **por un canal que
   no sea este repositorio**, o ponerlas en un `.env` local que ya está en
   `.gitignore`.
3. Autorizarme a instalar la CLI de Supabase o `psql` para aplicar migraciones
   y ejecutar la suite. Sin una de las dos no hay forma de hablar con la base
   de datos.

Con eso: aplico las cuatro migraciones, ejecuto la suite, y la evidencia es la
tabla de resultados completa —cada comprobación con su veredicto— más el
listado real de políticas leído de `pg_policies`, que es la única prueba de que
lo que hay desplegado es lo que dice este documento.

---

## 5. Qué contará como evidencia

No la palabra de nadie. Tres salidas, reproducibles:

1. **La tabla de resultados de la suite**, con las 51 filas y su veredicto.
2. **`select * from pg_policies where schemaname = 'public'`**, que es lo que
   realmente está aplicado, frente a lo que las migraciones creen haber creado.
3. **Los permisos efectivos del rol**:
   ```sql
   select table_name, privilege_type
   from information_schema.role_table_grants
   where grantee = 'autocraw_ingest' order by table_name;
   ```
   Si ahí aparece una sola tabla editorial o de usuario, el diseño de mínimo
   privilegio ha fallado, por muy bien que suene el documento que lo describe.
