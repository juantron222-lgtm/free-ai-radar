# Preflight RLS: hallazgos, causas y límites

**Fecha:** 7 de agosto de 2026
**Motor:** PostgreSQL 18.3 (PGlite 0.5.4), WebAssembly
**Resultado:** 51/51 ataques bloqueados · 81 políticas aplicadas
**Evidencia congelada:** [`docs/evidence/rls-preflight-pglite-2026-08-07.json`](evidence/rls-preflight-pglite-2026-08-07.json)

Este documento es el registro del preflight. **No declara RLS verificado para
producción**: eso requiere que la suite pase contra Supabase staging real, con
Auth, JWT firmados y acceso REST. Lo que hay aquí es la ronda previa, y lo que
encontró.

---

## 1. La escalada de rol

### Qué se pudo hacer

```sql
-- Como cualquier usuario autenticado, sin ningún privilegio especial:
update public.profiles set role = 'admin' where id = auth.uid();
```

Funcionaba. Y a partir de ahí se abre todo lo que cuelga de `is_admin()`:

| Después de la escalada | Qué se consigue |
| --- | --- |
| `select * from profiles` | Nombre y avatar de todos los usuarios |
| `select * from audit_logs` | El registro completo de auditoría |
| `update tools set scores = …` | Reescribir cualquier puntuación |
| `update tools set verdict = …` | Reescribir cualquier veredicto |
| `insert into tools …` | Publicar fichas inventadas |
| `update subscription_plans …` | Cambiar precios y planes |

En la suite se ve exactamente así: al omitir la corrección, RLS-01a pasa a rojo
y **arrastra otras diez comprobaciones** que fallan no por tener sus propios
agujeros, sino porque para cuando se ejecutan el atacante ya es administrador.
Trece rojas en total; una escalada y su radio de explosión, más un hallazgo
independiente (RLS-08a).

### Causa raíz

```sql
create policy "profiles: update own" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
```

**`USING` y `WITH CHECK` restringen qué fila se escribe, nunca qué columnas.**
Esa es toda la causa. La política era correcta en lo que expresaba —sólo tocas
tu propia fila— e insuficiente en lo que dejaba fuera: qué puedes cambiar
dentro de ella.

El agravante está tres líneas más arriba, en el propio fichero:

> *«A user must never be able to promote themselves. Role changes go through the
> service role in the admin API.»*

La regla estaba pensada, escrita y documentada. Simplemente no estaba
implementada. Es el modo de fallo más común de RLS: se confunde el comentario
que describe la intención con el mecanismo que la impone.

### Corrección aplicada

En [`0004_rls_hardening.sql`](../supabase/migrations/0004_rls_hardening.sql), y
deliberadamente en **dos capas independientes**:

**Capa 1 — permisos por columna.**

```sql
revoke update on public.profiles from authenticated;
grant update (display_name, avatar_url, locale, interests, onboarded_at)
  on public.profiles to authenticated;
```

Falla cerrado: una columna nueva no es escribible hasta que alguien la conceda
a propósito.

**Capa 2 — disparador que compara `OLD` y `NEW`.**

```sql
if new.role is distinct from old.role then
  if not (public.is_admin() or auth.uid() is null) then
    raise exception 'No puedes cambiar tu propio rol.' using errcode = '42501';
  end if;
end if;
```

Un `WITH CHECK` no puede ver `OLD`, así que es incapaz de expresar «esto no debe
haber cambiado». Un disparador sí. Y cubre a cualquier escritor que llegue por
una política futura que nadie ha escrito todavía.

Por qué dos y no una: ver §3.

---

## 2. La migración 0001 no era ejecutable

### Qué pasaba

```
✗ La migración supabase/migrations/0001_core_schema.sql ha fallado:
  relation "public.profiles" does not exist
```

El esquema completo abortaba **en su primera ejecución**. No en un caso raro:
siempre, en cualquier base de datos.

### Causa raíz

`public.current_role()` está declarada `language sql`, y PostgreSQL valida el
cuerpo de esas funciones **en el momento de crearlas** (`check_function_bodies`
está activo por defecto). Estaba en la sección de utilidades, unas treinta
líneas antes de la tabla `public.profiles` que consulta.

Que no se detectara antes tiene una explicación incómoda y exacta: **el esquema
nunca se había ejecutado**. Estaba en el repositorio, revisado y comentado, sin
haber tocado jamás un Postgres. Ese era el riesgo R-3 de la lista de bloqueos, y
esto es en qué consistía.

### Corrección aplicada

Las tres funciones (`current_role`, `is_staff`, `is_admin`) se mueven justo
detrás de la tabla `profiles`. `set_updated_at()` se queda donde estaba: es
`plpgsql`, cuyo cuerpo no se valida al crearlo, y el disparador de `profiles` lo
necesita antes.

---

## 3. El problema del `grant all`

### Qué pasaba

La primera versión del arnés hacía esto después de aplicar las migraciones,
imitando lo que recomiendan casi todas las guías de Supabase:

```sql
grant all on all tables in schema public to anon, authenticated, service_role;
```

Eso **deshacía en silencio** el `revoke update on public.profiles` de la
migración 0004. Comprobado:

```
profiles.role   INSERT, REFERENCES, SELECT, UPDATE   ← concedido a authenticated
```

**Y la suite seguía en verde.** El disparador atrapaba la escalada igualmente.

### Por qué importa más de lo que parece

No es un fallo del arnés: es el escenario real. En Supabase, ese `grant all`
aparece en la documentación, en las plantillas y en medio artículo de blog sobre
el tema. Cualquiera puede ejecutarlo un martes por la tarde para arreglar un
`permission denied`, y con él se lleva por delante una capa de seguridad sin que
nada falle, sin que ninguna prueba se ponga roja y sin que quede rastro.

Es exactamente el argumento para tener dos capas independientes en vez de una
buena: **una puede desaparecer sin síntoma**. Con dos, el fallo tiene que
ocurrir dos veces.

### Corrección aplicada

Dos cosas:

1. El arnés concede como concede Supabase de verdad — con
   `alter default privileges`, que se aplica al crear cada tabla, de modo que un
   `revoke` posterior en una migración manda.
2. Comprueba explícitamente si `authenticated` puede escribir `profiles.role` y
   lo dice en cada ejecución:

```
Capa de permisos por columna en profiles: intacta
```

Si algún día alguien ejecuta el `grant all`, esa línea cambia a
`ANULADA` y queda a la vista.

---

## 4. Hallazgos menores, corregidos

| Id | Gravedad | Qué |
| --- | --- | --- |
| RLS-02 | Alta | `is_staff` e `is_admin` sin `search_path` fijado. No explotable hoy porque cualifican su llamada, pero a un refactor de serlo. |
| RLS-03 | Media | Borrarse el perfil dejaba viva la fila de `auth.users` y la sesión: la cuenta seguía funcionando sin su registro. |
| RLS-04 | Media | Nada consultaba `deleted_at`; una cuenta en borrado seguía sirviendo nombre y avatar. |
| RLS-05 | Media | Las listas públicas exponían el `user_id` de quien las publica. Cruzado con `profiles`, es un nombre pegado a un historial de lectura. |
| RLS-06 | Baja | Un usuario con sesión podía escribir envíos como anónimos, rompiendo la atribución. |
| RLS-07 | Baja | `audit_logs` era append-only *por omisión* de política, no por declaración. |

---

## 5. Qué cubre PGlite

PGlite es PostgreSQL 18.3 compilado a WebAssembly. **Es el mismo código C.** Lo
que se comprueba aquí se comprueba con el mismo mecanismo que lo comprobaría un
servidor:

- **Row Level Security**: el motor de políticas, la combinación `OR` de
  políticas permisivas, `USING` frente a `WITH CHECK`.
- **Roles y permisos**: `GRANT`/`REVOKE` a nivel de tabla y de columna,
  `SET ROLE`, herencia, `BYPASSRLS`.
- **Disparadores**: `BEFORE UPDATE`, comparación `OLD`/`NEW`, `raise exception`
  con `errcode`.
- **`SECURITY DEFINER`** y el efecto de `set search_path`.
- **Restricciones**: `CHECK`, claves foráneas, `UNIQUE`, tipos enumerados.
- **Vistas** y cómo heredan las políticas de sus tablas base.
- **El orden de aplicación de las migraciones**, que es como salió el fallo §2.
- **`auth.uid()`** leyendo `request.jwt.claims`, que es el único gancho del que
  cuelgan todas las políticas de este proyecto.

En resumen: **todo lo que ocurre dentro de la base de datos**.

---

## 6. Qué NO cubre PGlite

Esto es la parte importante del documento. Cada línea es una razón por la que
el preflight **no basta** para declarar nada verificado.

### 6.1 No hay GoTrue

No existe el servicio de autenticación de Supabase. Por tanto no se prueba:

- registro, login, verificación de correo, recuperación de contraseña;
- el hash real de contraseñas de GoTrue;
- la creación de `auth.users` por la vía real — aquí se insertan filas a mano;
- el disparador `on_auth_user_created` que crea el perfil;
- confirmación de correo, doble alta, reenvío.

Los usuarios del preflight son filas insertadas directamente. **No pueden
iniciar sesión**, porque no tienen una contraseña que GoTrue reconozca.

### 6.2 No hay JWT

`request.jwt.claims` se fija con `set_config`. En Supabase lo fija PostgREST
tras **verificar una firma**. Por tanto no se prueba:

- que un JWT manipulado se rechace;
- que un JWT caducado se rechace;
- la expiración de sesión ni el refresco de token;
- que el `role` del token no se pueda falsificar;
- qué ocurre con un token de otro proyecto.

Aquí, la suplantación es por decreto. Allí hay que ganársela.

### 6.3 No hay PostgREST

No se prueba nada de la capa HTTP:

- acceso directo a `/rest/v1/<tabla>` con la anon key;
- llamadas RPC a `/rest/v1/rpc/<función>`;
- manipulación de parámetros (`?id=eq.<otro>`, `select=*,profiles(*)`);
- filtros anidados que atraviesan relaciones;
- `Prefer: return=representation` filtrando lo que la política debería ocultar;
- qué expone la introspección de OpenAPI del propio endpoint.

**Esto es un hueco serio.** Es donde un atacante real ataca: no abre una consola
SQL, hace `curl` con la clave pública que está en el código del navegador.

### 6.4 Los roles no son los de Supabase

`anon`, `authenticated` y `service_role` los crea el arnés. En Supabase existen
con permisos por defecto, pertenencias y configuración propias que no se
reproducen. Tampoco `supabase_admin`, `authenticator` ni el mecanismo por el que
`authenticator` cambia de rol.

### 6.5 Sin extensiones

`pgcrypto`, `pg_trgm` y `unaccent` se omiten, y con ellas dos índices GIN de
trigramas. Son aceleradores de búsqueda: ninguna política, permiso, disparador
ni restricción depende de ellos, y `gen_random_uuid()` es del núcleo desde
PostgreSQL 13. Es la omisión menos preocupante de la lista, pero se registra en
cada ejecución para que nadie tenga que fiarse.

### 6.6 Sin nada de lo operativo

Sin réplicas, sin `pgbouncer`, sin límites de conexión, sin Realtime, sin
Storage y sin sus políticas propias, sin Edge Functions, sin webhooks.

---

## 7. Conclusión honesta

El preflight ha hecho lo que un preflight debe hacer: **encontró una escalada de
privilegios crítica y un esquema que no arrancaba**, ambos en código que llevaba
meses revisado. Eso justifica la ronda por sí solo.

Lo que **no** ha hecho es verificar el sistema. Todo lo del §6 sigue sin probar,
y ahí es donde vive el ataque realista: la clave pública en el navegador y una
petición HTTP.

**RLS no está verificado para producción.** Lo estará cuando la lista completa
de [`rls-staging-checklist.md`](rls-staging-checklist.md) pase contra Supabase
staging real.
