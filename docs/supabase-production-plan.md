# Supabase producción — plan de creación

Estado: **preparado, no ejecutado**. Ningún recurso de producción existe todavía.

Este documento es lo que hay que seleccionar en el panel, en qué orden, y cómo
comprobar después que lo que se creó es lo que se quería. Cada valor que aparece
aquí sale del código de este repositorio, no de la memoria.

---

## Resumen: qué seleccionar, en orden

Para actuar sin leer el resto. Cada punto se detalla más abajo.

**Crear el proyecto** (botón *New project*)

| Campo | Qué poner |
|---|---|
| Organization | la misma que staging |
| Name | `free-ai-radar-production` |
| Database Password | *Generate a password* → al gestor de contraseñas |
| Region | **West EU (Ireland)** |
| Plan | el que ya tengas |

**Después, sin salir del panel:**

1. **Project Settings → API** → *Exposed schemas*: dejar **sólo `public`**.
   Quitar cualquier otro. *Max rows*: `1000`.
2. **SQL Editor** → pegar las ocho migraciones **en orden**, de
   `0001_core_schema.sql` a `0008_amazon_creators_state.sql`, una ejecución cada
   una, comprobando que ninguna da error antes de seguir.
3. **SQL Editor** → pegar `supabase/seed/catalog.sql`. Sin esto **ningún
   favorito se puede guardar**. Termina diciendo cuántas categorías y
   herramientas ha dejado; si algo no cuadra, aborta solo.
4. **SQL Editor** → las ocho consultas de validación de la sección 8. Las ocho.
5. **Authentication → URL Configuration**:
   - Site URL: `https://www.freeairadar.com`
   - Redirect URLs: `https://www.freeairadar.com/cuenta/verificar` y
     `https://www.freeairadar.com/cuenta/nueva-contrasena`
   - **No añadir dominios de Preview aquí.**
6. **Authentication → Providers → Email**: *Confirm email* activado.
7. **Database → Backups** → copia manual, con el esquema migrado y el catálogo
   sembrado y todavía sin usuarios.

**Y en local, el mismo día:**

```
SUPABASE_PRODUCTION_REFS="<la referencia del proyecto nuevo>"
```

Sustituye a `none-yet` en `.env.local`. A partir de ahí el guardián rechaza
cualquier intento de apuntar un runner de staging a producción.

**Lo que NO se toca en esta fase:** Vercel Production, `main`, DNS, Stripe,
Amazon, correo real y `preload` de HSTS.

---

## 0. Lo que hay que saber antes de empezar

**Ningún script de este repositorio puede tocar producción, y eso es
deliberado.** `scripts/staging-guard.mjs` exige `SUPABASE_ENV === "staging"`
exactamente, comprueba que la referencia del proyecto coincide con
`SUPABASE_STAGING_REF`, y rechaza cualquier referencia listada en
`SUPABASE_PRODUCTION_REFS`. Todos los runners (`db:migrate:staging`,
`db:reset:staging`, `rls:staging`, `http:staging`, `autocraw:staging`) pasan por
él como proceso separado antes de abrir una conexión.

La consecuencia es que **hoy no hay forma de migrar producción**, y la primera
migración tiene que hacerse por un camino nuevo. La sección 6 lo resuelve.

**Staging no se reutiliza ni se copia.** Proyecto nuevo, contraseña nueva, claves
nuevas, sin usuarios, sin datos de prueba. Lo único que viaja de staging a
producción son los ficheros `.sql` versionados y el catálogo del repositorio.

---

## 1. Nombre del proyecto

```
free-ai-radar-production
```

Recomendado sobre alternativas como `free-ai-radar` a secas: el nombre aparece
en el panel junto al de staging, y dos proyectos donde sólo uno dice qué es
invitan exactamente al error que el guardián existe para impedir. Que el nombre
diga en voz alta que es producción es la primera barrera, y es gratis.

**Organización:** la misma que staging.

---

## 2. Región

```
West EU (Ireland) · eu-west-1
```

La misma que staging, que corre en `aws-1-eu-west-1`. Igualarlas elimina una
clase entera de diferencias entre lo probado y lo desplegado: mismo *pooler*,
misma latencia, mismo comportamiento de IPv4/IPv6.

Frankfurt (`eu-central-1`) o París (`eu-west-3`) estarían algo más cerca de un
público español, pero la diferencia real la decide **dónde corren las funciones
de Vercel**, no dónde está el navegador. Y ahí hay un punto abierto:

**Decidido:** `vercel.json` declara ya `"regions": ["dub1"]` — Dublín, la misma
isla que la base de datos. Sin eso, unas funciones en la región por defecto (que
puede ser estadounidense) cruzarían el Atlántico dos veces en cada consulta.

> ⚠ **Queda por confirmar en el panel.** El adaptador `@astrojs/vercel` genera
> `.vercel/output/functions/_render.func/.vc-config.json` **sin campo
> `regions`** y no expone opción para ponerlo — comprobado sobre el build real.
> La declaración de `vercel.json` es el enunciado versionado de la intención; el
> ajuste autoritativo es **Project Settings → Functions → Function Region**, y
> hay que verificar ahí que dice Dublín.

---

## 3. Contraseña de la base de datos

La genera el panel. **No la escribas tú y no la reutilices de staging.**

Va directamente al gestor de contraseñas. No entra en `.env.local`, no entra en
el repositorio, no se pega en un chat. La aplicación no la necesita: se conecta
por PostgREST con las claves `anon` y `service_role`.

Sólo hará falta para la migración inicial (sección 6) y para cualquier
mantenimiento por SQL directo.

---

## 4. Data API

En **Project Settings → API** (o **Data API** según la versión del panel):

| Ajuste | Valor | Por qué |
|---|---|---|
| Exposed schemas | `public` — **y sólo `public`** | Exponer `auth` deja la tabla de usuarios al alcance de PostgREST. Ninguna política del proyecto protege `auth`. |
| Extra search path | `public` | Lo predeterminado. |
| Max rows | `1000` | Techo a lo que una consulta anónima puede extraer de una vez. El sitio pagina muy por debajo. |

**No habilites `graphql_public`** si aparece: no se usa, y una superficie que no
se usa es una superficie que nadie revisa.

Las tres claves que aparecen en esa pantalla se recogen en la sección 5.

---

## 5. RLS

No hay nada que configurar a mano. **Las políticas las traen las migraciones**
(`0002_rls_policies.sql` y `0004_rls_hardening.sql`), y la validación posterior
comprueba que están.

Dos cosas que sí hay que saber:

- **Toda tabla nueva creada desde el panel llega con RLS activado y sin
  políticas**, es decir, inaccesible. Es el comportamiento correcto, pero
  sorprende. Crea tablas por migración, no por panel.
- La defensa de `profiles.role` tiene **dos capas independientes**: un `revoke`
  por columna y un disparador `guard_profile_privileges`. La validación de la
  sección 8 comprueba las dos. Si alguna vez sólo pasa una, la instalación está
  a medias aunque nada haya fallado en voz alta.

---

## 6. Migraciones — cómo llega el esquema a producción

Las ocho, en orden, sin saltarse ninguna:

```
0001_core_schema.sql        tablas, tipos, disparadores
0002_rls_policies.sql       políticas RLS
0003_autocraw_affiliate.sql rol autocraw_ingest (NOLOGIN) y tablas comerciales
0004_rls_hardening.sql      permisos por columna + disparador de privilegios
0005_postgrest_grants.sql   grants a anon / authenticated / service_role
0006_auth_user_trigger.sql  perfil automático al registrarse
0007_amazon_cache_instant.sql
0008_amazon_creators_state.sql
```

### El camino recomendado: SQL Editor

Para la **primera** migración, pegar cada fichero en el **SQL Editor** del panel,
uno a uno y en orden.

Es más lento que un script y es la opción correcta aquí, por tres razones:

1. **Ninguna credencial de producción sale del panel.** No hay cadena de
   conexión que guardar, ni fichero donde se pueda quedar.
2. **No existe un camino de código que pueda apuntar al proyecto equivocado.**
   Un runner de producción escrito hoy sería código sin probar contra nada, y el
   código sin probar es precisamente el que no debe estrenarse contra
   producción.
3. **Cada paso enseña su resultado.** Si `0005` falla, se ve al ejecutarlo, no
   tres pasos después.

`0003` contiene `grant autocraw_ingest to current_user`, que necesita que quien
ejecuta pueda conceder el rol. Desde el SQL Editor se ejecuta como
`postgres`, así que funciona.

### Después: un runner con guardián propio

Para las migraciones siguientes conviene automatizar, pero **con su propio
guardián**, no ampliando el de staging. Requisitos, para cuando se escriba:

- identidad positiva obligatoria: `SUPABASE_PRODUCTION_REF` debe coincidir con
  la referencia de la cadena de conexión;
- `--reset` **no debe existir** en él, ni siquiera detrás de una confirmación:
  la forma más fiable de no borrar producción es que el código no sepa hacerlo;
- migraciones sólo hacia adelante, con registro de cuáles se han aplicado;
- la sincronización del catálogo y su verificación, tal como ya funcionan.

No se escribe ahora porque no puede probarse contra nada.

---

## 7. Sincronización del catálogo

Sin este paso **ningún favorito funciona**. `user_favorites.tool_id` es clave
foránea contra `public.tools`, y un esquema recién migrado tiene esa tabla
vacía. Es el fallo que apareció en el Preview y está documentado en
`docs/preview-account-qa-findings.md`.

En staging lo hace `npm run db:migrate:staging`, que sincroniza y verifica antes
de dar nada por bueno.

Para producción, el mismo contenido en forma de SQL pegable:

```bash
npm run data:catalog-sql
```

Escribe `supabase/seed/catalog.sql` desde `scripts/catalog-source.mjs` — la
misma fuente que usa la sincronización de staging, no una copia. Se pega en el
SQL Editor después de `0008`.

El fichero:

- **es idempotente**: aplicarlo dos veces deja el mismo estado;
- **archiva, nunca borra**, igual que la sincronización viva;
- **se verifica solo**: termina con un bloque que cuenta categorías,
  herramientas activas e ids mal formados, y lanza una excepción si algo no
  cuadra. La transacción se deshace entera, así que un espejo a medias no llega
  a existir.

`tests/unit/catalog-sql.test.ts` lo aplica a un PostgreSQL real y comprueba que
el espejo resultante es **indistinguible** del que produce `syncCatalog`. Es la
única forma de que un fichero destinado a una base de datos donde nadie puede
experimentar llegue probado.

El fichero **está versionado**, porque quien lo pegue en el panel puede no tener
un entorno de desarrollo desde el que regenerarlo. Y como un fichero generado
que vive en git se desincroniza en silencio, hay una prueba que compara el
comprometido con el que sale del catálogo actual: si difieren, falla y dice qué
comando ejecutar.

Eso obligó a un cambio en el propio generador. `created_at` se emitía con la
marca de tiempo del momento de generar, así que el fichero salía distinto en
cada ejecución y nunca habría podido compararse. Ahora esas columnas las pone la
base con `now()` al aplicarlo — que además es lo correcto: `created_at` significa
«cuándo apareció esta fila en *esta* base», no «cuándo alguien ejecutó el
generador».

> El generador anterior (`data:seed-sql`, sobre `migrate-tools.mjs`) leía el
> conjunto de datos heredado: emitía 22 herramientas de 24 y ninguna categoría,
> que son la clave foránea padre — no habría podido aplicarse ni con el número
> correcto. Se ha eliminado junto con su `rollback.sql`, que borraba
> herramientas por slug y por tanto arrastraba favoritos, listas e historial.

**Cada cambio del catálogo obliga a repetir la sincronización.** Una herramienta
nueva no se puede guardar en favoritos hasta que esté en el espejo. Mientras no
haya runner de producción, eso significa regenerar y pegar.

---

## 8. Validación posterior a la migración

Ninguna de estas comprobaciones necesita credenciales nuevas: son consultas de
lectura en el SQL Editor.

```sql
-- 1. Las tablas están
select count(*) from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE';
-- esperado: 38

-- 2. Ninguna tabla sin RLS
select c.relname from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
-- esperado: 0 filas

-- 3. Las políticas están
select count(*) from pg_policies where schemaname = 'public';
-- esperado: 91

-- 4. El rol de AutoCraw existe y NO puede entrar
select rolname, rolcanlogin from pg_roles where rolname = 'autocraw_ingest';
-- esperado: 1 fila, rolcanlogin = false

-- 5. La defensa por columna sobre profiles.role sigue en pie
select count(*) from information_schema.column_privileges
where grantee = 'authenticated' and table_name = 'profiles'
  and column_name = 'role' and privilege_type = 'UPDATE';
-- esperado: 0

-- 6. El disparador que crea el perfil está enganchado a auth.users
select tgname from pg_trigger where tgrelid = 'auth.users'::regclass
  and not tgisinternal;
-- esperado: on_auth_user_created

-- 7. El espejo del catálogo está poblado
select
  (select count(*) from public.categories) as categorias,
  (select count(*) from public.tools) as herramientas,
  (select count(*) from public.tools where id <> 'tool_' || slug) as ids_malos;
-- esperado: 17, 24, 0

-- 8. Un favorito puede insertarse (y se deshace acto seguido)
begin;
  insert into public.tools (id, slug, name, category_slug, free_model, free_plan,
    official_url, scores)
  values ('tool_prueba-fk', 'prueba-fk', 'x', (select slug from public.categories limit 1),
    'free_real', '{}'::jsonb, 'https://x.example', '{}'::jsonb);
  select 'la FK acepta la inserción' as resultado;
rollback;
```

La comprobación 8 es la que habría detectado el fallo del Preview antes de que
lo hiciera un usuario intentando guardar una herramienta.

**Ninguna de estas ocho puede saltarse.** Si una falla, la instalación no está
lista, aunque las migraciones no hayan dado un solo error.

---

## 9. Auth — URLs

En **Authentication → URL Configuration**:

| Campo | Valor |
|---|---|
| Site URL | `https://www.freeairadar.com` |
| Redirect URLs | `https://www.freeairadar.com/cuenta/verificar`<br>`https://www.freeairadar.com/cuenta/nueva-contrasena` |

Esas dos rutas son exactamente las que pide el código
(`src/lib/auth/provider.ts`, líneas 79 y 155). No hacen falta más.

**No añadas dominios de Preview a la lista de producción.** Los previews tienen
su propio proyecto Supabase (staging) y su propia lista. Mezclarlos convierte
cualquier despliegue de rama en un destino válido para un enlace de
recuperación de contraseña emitido por producción.

El código ya defiende este flanco por su lado: `src/lib/runtime-origin.ts`
rechaza cualquier anfitrión que no esté en su lista blanca, de modo que una
cabecera `Host` falsificada no puede desviar un enlace de restablecimiento. La
lista del panel es la segunda capa, no la única.

### Otros ajustes de Authentication

| Ajuste | Valor | Por qué |
|---|---|---|
| Confirm email | **activado** | Sin esto, cualquiera registra a cualquiera. |
| Secure email change | activado | Confirma en las dos direcciones. |
| Minimum password length | 8 o más | El formulario ya lo exige por su cuenta. |
| Enable signups | activado | Desactívalo sólo si se abre el sitio sin cuentas. |

---

## 10. Correo real

**No se activa ahora.** Lo que sigue es lo que habrá que hacer, no lo que hay
que hacer hoy.

Supabase envía los correos de autenticación con un SMTP propio limitado a unos
pocos mensajes por hora y sin garantía de entrega. **Sirve para probar y no
sirve para producción**: en cuanto haya registros reales, los correos de
verificación empezarán a perderse en silencio.

Hay dos caminos de correo y no son el mismo:

1. **Correo de autenticación** (verificación, recuperación) — lo envía GoTrue.
   Se configura en **Project Settings → Authentication → SMTP Settings**,
   apuntando a Resend con un dominio verificado.
2. **Correo transaccional y boletín** — lo envía la aplicación con
   `RESEND_API_KEY`. Ya está escrito y **blindado**: `emailSendPolicy` exige
   cuatro condiciones a la vez para enviar de verdad
   (`deploymentEnv() === 'production'`, `EMAIL_SEND_MODE === 'live'`,
   `EMAIL_DRY_RUN !== '1'`, y una clave con forma de clave de Resend).
   Cualquier otra combinación simula.

Requisito previo a ambos: **verificar el dominio en Resend** (SPF, DKIM y
DMARC). Sin eso, el correo llega a spam o no llega.

Orden recomendado: dominio verificado → SMTP de GoTrue → observar entregas
reales → sólo entonces `EMAIL_SEND_MODE=live` para el resto.

---

## 11. Variables de entorno

Las que la aplicación declara están en `astro.config.mjs`. Para producción:

### Imprescindibles

| Variable | Origen | Contexto |
|---|---|---|
| `PUBLIC_SUPABASE_URL` | Panel → API → Project URL | cliente |
| `PUBLIC_SUPABASE_ANON_KEY` | Panel → API → `anon` `public` | cliente |
| `SUPABASE_SERVICE_ROLE_KEY` | Panel → API → `service_role` | **servidor** |
| `AUTH_SECRET` | generada, ≥32 bytes aleatorios | servidor |
| `ADMIN_EMAILS` | tu correo | servidor |
| `DEPLOYMENT_ENV` | `production` | servidor |

`SUPABASE_SERVICE_ROLE_KEY` **salta toda la RLS**. Sólo en variables de servidor,
nunca con prefijo `PUBLIC_`, nunca en el cliente. La suite HTTP comprueba en
cada ejecución que no aparece en el HTML ni en los *bundles*.

`AUTH_SECRET` debe ser **distinta** de la de staging. Si se comparte, una sesión
firmada en un entorno vale en el otro.

### Cuando toque, no ahora

| Variable | Cuándo |
|---|---|
| `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_SEND_MODE` | sección 10 |
| `STRIPE_*` | cuando se active el cobro |
| `PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | si hace falta más que *honeypot* y límite de tasa |
| `PUBLIC_ANALYTICS_DOMAIN` | si se añade analítica |

### En local, para el guardián

```
SUPABASE_PRODUCTION_REFS="<la referencia del proyecto nuevo>"
```

Sustituye a `none-yet` **el mismo día** que se cree el proyecto. A partir de ese
momento el guardián rechaza cualquier intento de apuntar un runner de staging a
producción, con esa referencia como prueba positiva.

El guardián ya no acepta que esta variable esté vacía: o lleva referencias, o
lleva `none-yet` como declaración explícita de que producción no existe. Un
aviso que iba a ser cierto durante meses era un aviso que nadie iba a leer.

---

## 12. Rollback

Que sea un proyecto nuevo y separado es, en sí mismo, el plan de vuelta atrás:
**mientras Vercel Production no apunte a él, producción sigue siendo lo que es
hoy.**

| Situación | Vuelta atrás |
|---|---|
| Las migraciones fallan a medias | El proyecto está vacío y no lo usa nadie. Borrarlo y crearlo de nuevo es más limpio que arreglarlo. |
| El esquema queda mal y ya hay usuarios | Restaurar desde copia (sección 13). Para el contenido basta con volver el catálogo atrás en git y regenerar: no hay un `rollback.sql` porque borrar herramientas arrastra datos de usuario. |
| El sitio desplegado falla | Revertir las variables de entorno de Vercel Production y volver a desplegar el build anterior. La base de datos nueva se queda ahí sin que nadie la use. |
| El catálogo se sincroniza mal | Volver a sincronizar: es idempotente y verifica antes de confirmar. Una herramienta que desaparece se **archiva**, nunca se borra, así que los datos de usuario sobreviven. |

**Lo que no tiene vuelta atrás**, y por eso no se toca en esta fase: DNS,
`preload` de HSTS, borrar el despliegue anterior, y las claves live de Stripe.

> **Decidido:** la directiva `preload` se ha retirado de la cabecera. HSTS sigue
> activo con `max-age=63072000; includeSubDomains`, que es la protección real.
> `preload` sólo anuncia intención de inscribirse en la lista de los navegadores,
> algo que exige enviarlo a hstspreload.org y que es muy difícil de deshacer.
> Anunciarlo sin haberlo hecho no aportaba nada y comprometía a algo que nadie
> había decidido.

---

## 13. Copias de seguridad

Antes de que haya un solo usuario real, en **Database → Backups**:

- confirmar que las copias diarias están activas (el plan gratuito las tiene con
  retención corta; los de pago añaden PITR);
- hacer una copia manual justo después de la sección 8, con el esquema migrado y
  el catálogo sincronizado y aún sin usuarios. Es el punto de restauración más
  limpio que va a existir.

---

## Qué queda pendiente de esta fase

1. **Confirmar la región de funciones en Vercel** y fijarla si hace falta
   (sección 2).
2. **Escribir el runner de producción** con guardián propio y sin `--reset`,
   una vez exista el proyecto (sección 6).
3. **Decidir sobre `preload` de HSTS** (sección 12).
