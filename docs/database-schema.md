# Esquema de base de datos

**Motor:** PostgreSQL 15+ (Supabase) · **Migraciones:** `supabase/migrations/`

---

## Principios

1. **Deny by default.** RLS activo en las 28 tablas. Una tabla sin política es inaccesible salvo para
   el rol de servicio.
2. **`auth.users` es de Supabase.** `public.profiles` extiende con FK y `on delete cascade`.
3. **Fechas vs. instantes.** Una verificación editorial es un `date` (ocurre un día). Un evento de
   sistema es un `timestamptz`.
4. **`jsonb` para sub-objetos editoriales**, validado por Zod en la aplicación. Mantiene el modelo
   maleable mientras la taxonomía se asienta, sin una migración por campo.
5. **Nada derivable se almacena.** No hay columna `score_total`: se calcula al leer.

---

## Mapa de tablas

### Identidad

| Tabla | Para qué |
| --- | --- |
| `auth.users` | Gestionada por Supabase Auth. |
| `profiles` | Nombre visible, avatar, idioma, **rol**, intereses, borrado lógico. |

El rol arranca siempre en `'user'`. El trigger `handle_new_user` no lo lee de los metadatos del
registro: si lo hiciera, cualquiera podría enviarse `role: admin` al registrarse.

### Contenido editorial

| Tabla | Para qué |
| --- | --- |
| `categories` | Taxonomía. |
| `tools` | La ficha completa. 40 columnas. |
| `tool_versions` | Instantánea íntegra en cada publicación. Permite restaurar. |
| `tool_updates` | Registro de cambios por herramienta. El `kind` decide el enrutado de alertas. |
| `editorial_reviews` | Quién revisó, cuándo y con qué puntuaciones. |

### Aportaciones de la comunidad

| Tabla | Para qué |
| --- | --- |
| `tool_submissions` | Propuestas de herramientas. |
| `tool_corrections` | «Esto ya no es cierto». |
| `accuracy_votes` | «¿Sigue siendo correcta?». Una por usuario y ficha. |

### Datos del usuario

| Tabla | Para qué |
| --- | --- |
| `user_favorites` | Clave compuesta (`user_id`, `tool_id`). |
| `user_tool_states` | «Ya probada» + nota privada. |
| `user_lists` / `user_list_items` | Listas, opcionalmente públicas. |
| `saved_comparisons` | Entre 2 y 4 herramientas, con `check` en la BD. |
| `followed_categories` | Seguimiento por categoría. |
| `view_history` | Últimas fichas vistas. |
| `notification_preferences` | Qué correos y con qué frecuencia. |
| `alerts` | Aviso por herramienta **o** por categoría, nunca ambos (`check`). |

### Correo

| Tabla | Para qué |
| --- | --- |
| `newsletter_subscriptions` | Doble opt-in, tokens hasheados, prueba de consentimiento. |
| `email_log` | Destinatario **hasheado**, plantilla, tipo, estado. |

### Monetización

| Tabla | Para qué |
| --- | --- |
| `subscription_plans` | Importes administrables, no incrustados en código. |
| `user_subscriptions` | Estado de Stripe. Sólo escribe el webhook. |
| `processed_webhook_events` | Idempotencia por `event.id`. |
| `affiliate_programs` / `affiliate_links` | Afiliación. |
| `sponsored_placements` | Patrocinios con ventana de fechas. |

### Operación

| Tabla | Para qué |
| --- | --- |
| `audit_logs` | Append-only. IP hasheada. |
| `product_events` | Analítica de producto de primera parte, con hash anónimo rotatorio. |

---

## `tools` en detalle

Cubre los 38 campos exigidos:

| Requisito | Columna |
| --- | --- |
| nombre, slug | `name`, `slug` (con `check` de formato y `unique`) |
| descripción corta y completa | `description_short`, `description_long`, `tagline` |
| categoría | `category_slug` (FK), `secondary_categories` |
| casos de uso | `use_cases` |
| plataforma | `platforms` |
| modelo de gratuidad | `free_model` (enum) |
| tarjeta / registro / marca de agua / uso comercial | dentro de `free_plan` (jsonb, tri-estado) |
| límites gratuitos | `free_plan.limits` |
| renovación de créditos | `free_plan.creditReset` |
| licencia | `licence` |
| código abierto | `open_source` (tri-estado) |
| local o nube | `hosting` (enum) |
| sistemas compatibles | `platforms` |
| idiomas | `languages` |
| requisitos de hardware | `hardware_requirements` |
| privacidad, país de la empresa | `privacy` (jsonb) |
| URL oficial, fuentes | `official_url`, `pricing_url`, `docs_url`, `repo_url`, `sources` |
| afiliación | `affiliation` (jsonb) |
| puntuación y componentes | `scores` (jsonb) — el total se deriva |
| veredicto, ventajas, inconvenientes | `verdict`, `pros`, `cons` |
| alternativas | `alternatives` (slugs) + `alternative_names` (texto) |
| última verificación | `last_verified_at` |
| historial de cambios | `changelog` + tabla `tool_updates` |
| estado editorial | `status` (enum) |
| patrocinio | `sponsorship` (jsonb) |

**Restricciones que importan:**

```sql
constraint tools_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
constraint tools_official_url_http check (official_url ~* '^https?://')
```

**Índices:** por estado, categoría, modelo de gratuidad y fecha de verificación; y dos GIN con
`pg_trgm` para búsqueda por similitud sobre nombre y texto combinado.

---

## Row Level Security

### El modelo en cinco frases

1. Anónimo lee contenido **publicado** y nada más.
2. Un usuario lee y escribe **sólo filas donde `user_id = auth.uid()`**.
3. Un editor gestiona contenido editorial.
4. Un admin gestiona además roles, facturación y auditoría.
5. El rol de servicio salta RLS y sólo lo usa código de servidor que ya autorizó al llamante.

### Detalles deliberados

**`current_role()` es `SECURITY DEFINER`.** Leer el propio rol no puede depender de una política que
consulte `profiles`, porque eso recursaría. La función se define con `search_path = public` fijo para
que no pueda secuestrarse.

**Nadie se promueve solo.** Existen dos políticas de `UPDATE` sobre `profiles`: una para el propio
usuario y otra para admin. Los cambios de rol pasan por la API de administración con el rol de
servicio, que escribe en `audit_logs`.

**La newsletter no tiene política permisiva.** Ninguna. Las direcciones de correo son identificadores
enumerables; todo acceso pasa por endpoints de servidor que limitan la tasa y verifican tokens.

**`user_subscriptions` es de sólo lectura para el usuario.** Hay política de `SELECT`, no de
`INSERT`/`UPDATE`. El único escritor del estado de facturación es el webhook de Stripe. Sin esto,
un usuario podría concederse Pro con una petición.

**`audit_logs` no tiene `UPDATE` ni `DELETE`.** Ni siquiera para admin. La historia no se reescribe.

**Las listas públicas** son la única excepción a «sólo tus filas»: `is_public = true` las hace
legibles, y `user_list_items` hereda esa visibilidad consultando la lista padre.

---

## Migración desde la v1

```bash
npm run data:migrate:dry     # informe, sin escribir
npm run data:migrate         # genera src/data/generated/
npm run data:seed-sql        # además: supabase/seed/{seed,rollback}.sql
```

**Qué hace:**

1. Valida el JSON de origen.
2. Normaliza categorías y modelos de gratuidad contra la taxonomía.
3. Detecta duplicados por slug (conserva el primero, informa del descarte).
4. Genera slugs deterministas e insensibles a acentos.
5. **Convierte todo lo no afirmado en `unverified`**, nunca en `false`.
6. Resuelve alias de alternativas; las no catalogadas se conservan como texto.
7. Escribe un informe en `src/data/generated/migration-report.json`.

**Reversible:** `supabase/seed/rollback.sql` borra exactamente las filas que insertó la semilla, por
slug. No toca fichas creadas por editores ni datos de usuario.

**Idempotente:** la semilla usa `on conflict (slug) do update`. Ejecutarla dos veces no duplica nada.

### Resultado de la migración real

```
Entrada:     22 herramientas
Salida:      22 herramientas
Descartadas: 0
Duplicadas:  0
Avisos:      0
Alternativas sin ficha: 35 (conservadas como texto, sin enlace)
```

Ninguna pérdida de contenido.

---

## Aplicar el esquema

```bash
# Con la CLI de Supabase
supabase db push

# O manualmente, en orden:
psql "$DATABASE_URL" -f supabase/migrations/0001_core_schema.sql
psql "$DATABASE_URL" -f supabase/migrations/0002_rls_policies.sql
psql "$DATABASE_URL" -f supabase/seed/seed.sql
```

Después, conectar el trigger de alta de usuarios (requiere permisos sobre `auth`):

```sql
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

> Este paso queda **pendiente de aprobación humana**: toca el esquema `auth`, que gestiona Supabase.

---

## Comprobar las políticas RLS

```sql
-- Toda tabla pública debe tener RLS activo
select tablename, rowsecurity
from pg_tables
where schemaname = 'public' and rowsecurity = false;
-- Debe devolver 0 filas.

-- Un usuario no puede ver los favoritos de otro
set local role authenticated;
set local request.jwt.claims = '{"sub":"<uuid-usuario-a>"}';
select count(*) from user_favorites where user_id = '<uuid-usuario-b>';
-- Debe devolver 0.
```

El procedimiento completo está en [`security-review.md`](./security-review.md) § «Verificar RLS».
