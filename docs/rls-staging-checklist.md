# Lista obligatoria contra Supabase staging

Las 25 comprobaciones que deben pasar **antes** de declarar RLS verificado para
producción. Ninguna se da por buena por analogía con el preflight de PGlite.

**Estado global: pendiente.** No existe instancia de staging.

Leyenda de la columna «Ejecutor»:

| | |
| --- | --- |
| **SQL** | Cubierto por [`supabase/tests/rls_adversarial.sql`](../supabase/tests/rls_adversarial.sql), el mismo fichero del preflight, sin cambios |
| **HTTP** | Requiere un ejecutor sobre la API REST de Supabase con claves y JWT reales. **Aún no escrito** — ver §3 |
| **Manual** | Un paso humano, con captura de la salida |

---

## 1. La tabla

| # | Comprobación | Ejecutor | Dónde | Estado |
| ---: | --- | --- | --- | --- |
| 1 | Migraciones completas desde cero | SQL | `0001`→`0004` aplicadas en orden sobre base vacía | Pendiente |
| 2 | Auth real | HTTP | GoTrue: alta real, no `insert` a mano | Pendiente |
| 3 | Registro | HTTP | `POST /auth/v1/signup` | Pendiente |
| 4 | Login | HTTP | `POST /auth/v1/token?grant_type=password` | Pendiente |
| 5 | Verificación de correo | HTTP | Token de confirmación, y que sin confirmar no se pueda operar | Pendiente |
| 6 | Recuperación de contraseña | HTTP | `POST /auth/v1/recover` + canje del token | Pendiente |
| 7 | JWT reales | HTTP | Token firmado por el proyecto, no `set_config` | Pendiente |
| 8 | `auth.uid()` real | HTTP | Que el `sub` del JWT verificado sea el que ven las políticas | Pendiente |
| 9 | Anon key | HTTP | La clave pública del navegador, contra todas las tablas | Pendiente |
| 10 | Rol `authenticated` | HTTP | Con token real, no con `SET ROLE` | Pendiente |
| 11 | Rol `service_role` | HTTP + SQL | Que salte RLS, y que aun así no pueda romper restricciones (RLS-05e) | Pendiente |
| 12 | Expiración de sesión | HTTP | Token caducado rechazado; refresco funcionando | Pendiente |
| 13 | Usuario A contra datos de B | SQL | RLS-02a…l, RLS-03a…e | Preflight ✓ |
| 14 | Usuario normal contra admin | SQL | RLS-02i, RLS-03h/i, RLS-04a…e | Preflight ✓ |
| 15 | Modificación de `role` | SQL | RLS-01a…d | Preflight ✓ |
| 16 | Acceso directo REST | HTTP | `GET /rest/v1/profiles?select=*` con anon key | Pendiente |
| 17 | Acceso directo RPC | HTTP | `POST /rest/v1/rpc/is_admin` y toda función expuesta | Pendiente |
| 18 | Manipulación de IDs | SQL + HTTP | RLS-01c, RLS-03c; y `?user_id=eq.<ajeno>` por REST | Parcial |
| 19 | Exportación RGPD | HTTP | Que exporte todo lo del usuario y **nada** de otro | Pendiente |
| 20 | Borrado RGPD | SQL + HTTP | RLS-08a/b cubre la lectura; falta el borrado real | Parcial |
| 21 | Eliminación de `auth.users` | HTTP | Admin API; que la cascada limpie todas las tablas | Pendiente |
| 22 | Políticas de AutoCraw | SQL | RLS-06a…g | Preflight ✓ |
| 23 | AutoCraw no modifica `public.tools` | SQL | RLS-06a/b + permisos efectivos en la evidencia | Preflight ✓ |
| 24 | AutoCraw no borra datos | SQL | RLS-06e; `delete` no concedido en ninguna tabla | Preflight ✓ |
| 25 | Ningún dato comercial altera score, ranking ni veredicto | Unit + SQL | `tests/unit/affiliate.test.ts` + RLS-06a/b | Preflight ✓ |

**Resumen: 8 cubiertas por el preflight, 2 parciales, 15 pendientes de HTTP.**

Que ocho estén en verde no las convierte en verificadas para producción: están
verificadas *dentro de la base de datos*. Las mismas ocho vuelven a ejecutarse
contra staging antes de dar nada por bueno, porque los roles, los permisos por
defecto y el esquema `auth` de Supabase no son los que replica el arnés.

---

## 2. La suite SQL, sin duplicar lógica

El fichero de la suite es **SQL puro y ya es portable**. No tiene una sola línea
específica de PGlite: la suplantación usa `request.jwt.claims`, que es lo que
fija PostgREST, y las tablas y funciones auxiliares las crea y destruye la
propia transacción.

```bash
npm run staging:guard          # comprueba a dónde apunta, sin conectar
npm run staging:guard:connect  # además exige que la base esté limpia
npm run db:migrate:staging     # aplica 0001→0004 y verifica la instalación
npm run rls:staging            # ejecuta las 51 sondas y hace rollback
```

Todo pasa por `scripts/staging-run.mjs`, que es deliberadamente fino: lee los
mismos ficheros `.sql` que leyó el preflight, los envía y cuenta lo que vuelve.
No reimplementa ni una regla. La suite sigue siendo la única fuente de verdad
sobre qué es un ataque; el ejecutor es una tubería.

**Nota sobre el cliente.** No hay `psql`: EnterpriseDB devuelve 403 a las
descargas automatizadas, por winget y directas. En su lugar se usa el driver
`postgres` (postgres.js), JavaScript puro, sin instalación en el sistema, sin
servicio y sin permisos de administrador. Menos invasivo que la distribución
completa de PostgreSQL, y suficiente: habla el mismo protocolo.

### El guardián

Nada se conecta hasta que `scripts/staging-guard.mjs` pasa, y se ejecuta como
proceso aparte para que un `try/catch` mal puesto no pueda tragárselo. Exige
cuatro condiciones independientes:

1. `SUPABASE_ENV` vale exactamente `staging`.
2. La referencia del proyecto no está en `SUPABASE_PRODUCTION_REFS`.
3. No aparece «prod» en el anfitrión ni en `PUBLIC_SUPABASE_URL`.
4. Con `--connect`, el esquema `public` está vacío — una base de producción
   tiene tablas; una que va a recibir migraciones desde cero, no.

Y nunca imprime un secreto: ni contraseña, ni cadena, ni anfitrión completo.
Sólo una huella. Comprobado metiendo una contraseña en la entrada y contando
sus apariciones en la salida: cero.

Diferencias reales al ejecutarlo contra Supabase, ninguna de las cuales exige
tocar el fichero:

- `anon`, `authenticated` y `service_role` **ya existen**; el arnés local los
  creaba, la suite no.
- `auth.users` es la tabla real. Las columnas que usa la suite existen todas.
  Los usuarios de prueba se insertan a mano, así que **no pueden iniciar
  sesión** — para eso está el ejecutor HTTP.
- El editor SQL de Supabase envuelve en transacción; el `begin;` de la suite
  quedaría anidado y avisaría. Inofensivo, y no ocurre con el ejecutor: éste
  quita el `begin;`/`rollback;` del fichero y gobierna la transacción él, para
  poder leer la tabla de resultados antes de deshacerla.
- `autocraw_ingest` lo crea la migración `0003`, que debe estar aplicada.

### Antes de ejecutarla

- Contra **staging**. Nunca contra producción: una suite cuyo trabajo es
  intentar escalar privilegios no tiene nada que hacer cerca de datos reales,
  aunque haga `rollback`.
- Con las cuatro migraciones aplicadas desde cero, en orden.
- Guardando la salida completa como evidencia, igual que
  `docs/evidence/rls-preflight-pglite-2026-08-07.json`.

---

## 3. El ejecutor HTTP: qué falta y por qué no está escrito

Quince comprobaciones necesitan hablar con la API, no con la base de datos. Es
donde ataca alguien de verdad: no abre una consola SQL, hace `curl` con la clave
pública que está en el código del navegador.

**No lo he escrito todavía, a propósito.** Sin un proyecto contra el que
ejecutarlo sería código que no ha corrido nunca — exactamente la clase de
artefacto que produjo los dos fallos del preflight: la migración 0001 llevaba
meses revisada y no arrancaba. Escribir ahora una suite HTTP a ciegas
repetiría el error con otro nombre.

Lo que sí está decidido es su forma:

| Decisión | Cuál y por qué |
| --- | --- |
| Transporte | `fetch` contra `/rest/v1` y `/auth/v1`, sin SDK. El SDK normaliza errores y añade cabeceras; aquí interesa lo que el servidor hace con una petición cruda. |
| Identidades | Dos cuentas reales creadas por `signup`, más una promovida a admin con `service_role`. |
| Credenciales | De `.env` local, ya en `.gitignore`. Nunca en el repositorio, nunca en la salida. |
| Aserciones | Las mismas tres formas que la suite SQL: *denegado*, *cero filas*, *sigue siendo cierto*. |
| Salida | El mismo JSON que `docs/evidence/`, para que las dos evidencias se lean igual. |
| Duplicación | Ninguna con la suite SQL: cubre lo que SQL no alcanza, no repite lo que sí. |

Los ataques que ejecutará, en concreto:

```
GET  /rest/v1/profiles?select=*                      con anon key
GET  /rest/v1/profiles?id=eq.<ajeno>                 con JWT de A
GET  /rest/v1/user_lists?select=*,profiles(*)        atravesando la relación
PATCH /rest/v1/profiles?id=eq.<propio>  {"role":"admin"}
POST /rest/v1/rpc/is_admin                           llamada directa
GET  /rest/v1/newsletter_subscriptions?select=email  la lista de correos
GET  /rest/v1/audit_logs?select=*
     …con JWT caducado, con firma alterada, con el role del payload cambiado
```

Se escribe en cuanto haya instancia y claves. Es trabajo de una sesión.

---

## 4. Qué necesito de ti

1. **Crear el proyecto de staging** en supabase.com. Requiere cuenta y aceptar
   términos: acto humano, no lo puedo hacer yo. Sugerencia: `free-ai-radar-staging`,
   región europea.
2. **Pasarme las claves fuera del repositorio** — un `.env` local vale, ya está
   ignorado por git:
   ```
   SUPABASE_DB_URL_STAGING=postgresql://…
   PUBLIC_SUPABASE_URL=https://….supabase.co
   PUBLIC_SUPABASE_ANON_KEY=…
   SUPABASE_SERVICE_ROLE_KEY=…
   ```
3. **Autorizarme a instalar `psql`** (o la CLI de Supabase) para aplicar las
   migraciones y ejecutar la suite.

Con eso: migraciones desde cero, suite SQL, ejecutor HTTP escrito y ejecutado, y
las 25 filas de la tabla del §1 con su veredicto y su evidencia reproducible.

---

## 5. La regla que no se salta

**RLS no se declara verificado para producción hasta que las 25 estén en verde
contra Supabase staging real.**

Ocho verdes en el preflight no son ocho verdes en staging. Son ocho razones para
esperar que lo sean.
