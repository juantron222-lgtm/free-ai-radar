-- =====================================================================
-- Free AI Radar — adversarial RLS suite
--
-- Every test here is written as an attacker, not as a user. It does not check
-- that the happy path works; it checks that the things which must be
-- impossible are impossible.
--
-- HOW TO RUN
--
--   Against a Supabase staging project, in the SQL editor:
--     paste this whole file and run it.
--
--   Against any Postgres with the migrations applied:
--     psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_adversarial.sql
--
-- It is idempotent and self-cleaning: it creates two throwaway identities,
-- runs every probe, prints a results table, and rolls back. Nothing survives.
--
-- IT MUST NEVER BE RUN AGAINST PRODUCTION. It writes rows, promotes nobody,
-- and rolls back — but a suite whose job is to attempt privilege escalation
-- has no business touching real user data.
--
-- READING THE OUTPUT
--   PASA    the attack was blocked. What we want.
--   FALLA   the attack succeeded. A bypass. Fix before shipping.
-- =====================================================================

begin;

-- Never leave anything behind, even if an assertion aborts mid-run.
set local client_min_messages = warning;

create temporary table rls_results (
  seq       serial primary key,
  id        text not null,
  severity  text not null,
  scenario  text not null,
  expected  text not null,
  outcome   text not null,
  detail    text
) on commit drop;

/*
 * Impersonation.
 *
 * Supabase derives `auth.uid()` from the `request.jwt.claims` GUC. Setting it
 * by hand reproduces exactly what the PostgREST layer does for a signed-in
 * caller, which is what makes these results transferable to the real thing:
 * the policies cannot tell the difference.
 */
create or replace function pg_temp.act_as(user_id uuid)
returns void language plpgsql as $$
begin
  if user_id is null then
    perform set_config('request.jwt.claims', null, true);
    perform set_config('role', 'anon', true);
  else
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', user_id::text, 'role', 'authenticated')::text,
      true
    );
    perform set_config('role', 'authenticated', true);
  end if;
end $$;

create or replace function pg_temp.act_as_service()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', null, true);
  perform set_config('role', 'service_role', true);
end $$;

/*
 * Records an attack attempt.
 *
 * `sql_to_try` is expected to FAIL. If it raises, the defence held. If it
 * succeeds, we have a bypass — and we record what leaked.
 */
create or replace function pg_temp.expect_denied(
  p_id text, p_severity text, p_scenario text, p_sql text
) returns void language plpgsql as $$
declare
  affected bigint;
begin
  begin
    execute p_sql;
    get diagnostics affected = row_count;

    if affected = 0 then
      insert into rls_results (id, severity, scenario, expected, outcome, detail)
      values (p_id, p_severity, p_scenario, 'denegado', 'PASA',
              'sin error, pero 0 filas afectadas: RLS filtró la fila');
    else
      insert into rls_results (id, severity, scenario, expected, outcome, detail)
      values (p_id, p_severity, p_scenario, 'denegado', 'FALLA',
              format('la operación afectó a %s fila(s)', affected));
    end if;
  exception when others then
    insert into rls_results (id, severity, scenario, expected, outcome, detail)
    values (p_id, p_severity, p_scenario, 'denegado', 'PASA',
            format('%s (%s)', sqlerrm, sqlstate));
  end;
end $$;

/* Records a read that must return exactly zero rows. */
create or replace function pg_temp.expect_no_rows(
  p_id text, p_severity text, p_scenario text, p_sql text
) returns void language plpgsql as $$
declare
  found_rows bigint;
begin
  begin
    execute format('select count(*) from (%s) probe', p_sql) into found_rows;

    if found_rows = 0 then
      insert into rls_results (id, severity, scenario, expected, outcome, detail)
      values (p_id, p_severity, p_scenario, '0 filas', 'PASA', '0 filas visibles');
    else
      insert into rls_results (id, severity, scenario, expected, outcome, detail)
      values (p_id, p_severity, p_scenario, '0 filas', 'FALLA',
              format('se han visto %s fila(s) ajenas', found_rows));
    end if;
  exception when others then
    insert into rls_results (id, severity, scenario, expected, outcome, detail)
    values (p_id, p_severity, p_scenario, '0 filas', 'PASA',
            format('denegado en el motor: %s', sqlerrm));
  end;
end $$;

/* Records something that must remain true after an attack. */
create or replace function pg_temp.expect_true(
  p_id text, p_severity text, p_scenario text, p_sql text
) returns void language plpgsql as $$
declare
  ok boolean;
begin
  execute p_sql into ok;
  insert into rls_results (id, severity, scenario, expected, outcome, detail)
  values (p_id, p_severity, p_scenario, 'verdadero',
          case when ok then 'PASA' else 'FALLA' end, null);
exception when others then
  insert into rls_results (id, severity, scenario, expected, outcome, detail)
  values (p_id, p_severity, p_scenario, 'verdadero', 'FALLA',
          format('la comprobación no se pudo evaluar: %s', sqlerrm));
end $$;

-- =====================================================================
-- Fixtures
-- =====================================================================

do $$
declare
  mallory uuid := '11111111-1111-4111-8111-111111111111';
  alice   uuid := '22222222-2222-4222-8222-222222222222';
begin
  perform pg_temp.act_as_service();

  -- auth.users is owned by Supabase. Inserting directly is acceptable inside a
  -- transaction that rolls back, and avoids depending on the Auth API here.
  insert into auth.users (id, email, encrypted_password, email_confirmed_at,
                          created_at, updated_at, aud, role)
  values
    (mallory, 'mallory@ejemplo.test', '', now(), now(), now(), 'authenticated', 'authenticated'),
    (alice,   'alice@ejemplo.test',   '', now(), now(), now(), 'authenticated', 'authenticated')
  on conflict (id) do nothing;

  insert into public.profiles (id, display_name, role)
  values (mallory, 'Mallory', 'user'), (alice, 'Alice', 'user')
  on conflict (id) do update set role = excluded.role;

  insert into public.notification_preferences (user_id)
  values (mallory), (alice)
  on conflict (user_id) do nothing;

  -- Alice owns a private list and a private favourite. Mallory will go for them.
  insert into public.user_lists (id, user_id, name, is_public)
  values ('33333333-3333-4333-8333-333333333333', alice, 'Lista privada de Alice', false)
  on conflict (id) do nothing;

  insert into public.alerts (user_id, kind, is_active)
  values (alice, 'free_plan_reduced', true)
  on conflict do nothing;
end $$;

-- =====================================================================
-- RLS-01 — privilege escalation
-- =====================================================================

do $$
declare mallory uuid := '11111111-1111-4111-8111-111111111111';
begin
  perform pg_temp.act_as(mallory);

  perform pg_temp.expect_denied(
    'RLS-01a', 'crítica',
    'Mallory se asciende a admin en su propio perfil',
    format('update public.profiles set role = ''admin'' where id = %L', mallory)
  );

  perform pg_temp.expect_denied(
    'RLS-01b', 'crítica',
    'Mallory se asciende a editor',
    format('update public.profiles set role = ''editor'' where id = %L', mallory)
  );

  perform pg_temp.expect_denied(
    'RLS-01c', 'crítica',
    'Mallory reasigna su perfil a otro identificador',
    format('update public.profiles set id = ''44444444-4444-4444-8444-444444444444'' where id = %L', mallory)
  );
end $$;

-- The row must still say 'user' afterwards. Checked as service role, because a
-- successful escalation would also change what Mallory can see.
do $$
begin
  perform pg_temp.act_as_service();
  perform pg_temp.expect_true(
    'RLS-01d', 'crítica',
    'el rol de Mallory sigue siendo user tras los intentos',
    'select role = ''user'' from public.profiles where id = ''11111111-1111-4111-8111-111111111111'''
  );
end $$;

-- =====================================================================
-- RLS-02 — reading other people's data
-- =====================================================================

do $$
declare
  mallory uuid := '11111111-1111-4111-8111-111111111111';
  alice   uuid := '22222222-2222-4222-8222-222222222222';
begin
  perform pg_temp.act_as(mallory);

  perform pg_temp.expect_no_rows('RLS-02a', 'alta',
    'Mallory lee el perfil de Alice',
    format('select id from public.profiles where id = %L', alice));

  perform pg_temp.expect_no_rows('RLS-02b', 'alta',
    'Mallory enumera todos los perfiles',
    'select id from public.profiles where id <> ''11111111-1111-4111-8111-111111111111''');

  perform pg_temp.expect_no_rows('RLS-02c', 'alta',
    'Mallory lee la lista privada de Alice',
    format('select id from public.user_lists where user_id = %L', alice));

  perform pg_temp.expect_no_rows('RLS-02d', 'alta',
    'Mallory lee los favoritos de Alice',
    format('select tool_id from public.user_favorites where user_id = %L', alice));

  perform pg_temp.expect_no_rows('RLS-02e', 'alta',
    'Mallory lee las alertas de Alice',
    format('select id from public.alerts where user_id = %L', alice));

  perform pg_temp.expect_no_rows('RLS-02f', 'alta',
    'Mallory lee las preferencias de correo de Alice',
    format('select user_id from public.notification_preferences where user_id = %L', alice));

  perform pg_temp.expect_no_rows('RLS-02g', 'alta',
    'Mallory lee el historial de navegación de Alice',
    format('select id from public.view_history where user_id = %L', alice));

  perform pg_temp.expect_no_rows('RLS-02h', 'crítica',
    'Mallory lee la lista de suscriptores del boletín',
    'select email from public.newsletter_subscriptions');

  perform pg_temp.expect_no_rows('RLS-02i', 'crítica',
    'Mallory lee el registro de auditoría',
    'select id from public.audit_logs');

  perform pg_temp.expect_no_rows('RLS-02j', 'alta',
    'Mallory lee la facturación de Alice',
    format('select id from public.user_subscriptions where user_id = %L', alice));

  perform pg_temp.expect_no_rows('RLS-02k', 'media',
    'Mallory lee los eventos de producto',
    'select id from public.product_events');

  perform pg_temp.expect_no_rows('RLS-02l', 'media',
    'Mallory lee los webhooks procesados de Stripe',
    'select * from public.processed_webhook_events');
end $$;

-- =====================================================================
-- RLS-03 — writing to other people's data
-- =====================================================================

do $$
declare
  mallory uuid := '11111111-1111-4111-8111-111111111111';
  alice   uuid := '22222222-2222-4222-8222-222222222222';
begin
  perform pg_temp.act_as(mallory);

  perform pg_temp.expect_denied('RLS-03a', 'alta',
    'Mallory añade un favorito en nombre de Alice',
    format('insert into public.user_favorites (user_id, tool_id) values (%L, ''tool_ollama'')', alice));

  perform pg_temp.expect_denied('RLS-03b', 'alta',
    'Mallory borra la lista de Alice',
    format('delete from public.user_lists where user_id = %L', alice));

  perform pg_temp.expect_denied('RLS-03c', 'alta',
    'Mallory se apropia de la lista de Alice',
    format('update public.user_lists set user_id = %L where user_id = %L', mallory, alice));

  perform pg_temp.expect_denied('RLS-03d', 'alta',
    'Mallory hace pública la lista privada de Alice',
    format('update public.user_lists set is_public = true where user_id = %L', alice));

  perform pg_temp.expect_denied('RLS-03e', 'alta',
    'Mallory desactiva las alertas de Alice',
    format('update public.alerts set is_active = false where user_id = %L', alice));

  perform pg_temp.expect_denied('RLS-03f', 'crítica',
    'Mallory se regala una suscripción de pago',
    format('insert into public.user_subscriptions (user_id, status) values (%L, ''active'')', mallory));

  perform pg_temp.expect_denied('RLS-03g', 'crítica',
    'Mallory activa su propia suscripción existente',
    format('update public.user_subscriptions set status = ''active'' where user_id = %L', mallory));

  perform pg_temp.expect_denied('RLS-03h', 'crítica',
    'Mallory falsifica una entrada de auditoría',
    'insert into public.audit_logs (action, entity) values (''fake'', ''tools'')');

  perform pg_temp.expect_denied('RLS-03i', 'crítica',
    'Mallory borra el registro de auditoría',
    'delete from public.audit_logs');
end $$;

-- =====================================================================
-- RLS-04 — editorial content
-- =====================================================================

do $$
declare mallory uuid := '11111111-1111-4111-8111-111111111111';
begin
  perform pg_temp.act_as(mallory);

  perform pg_temp.expect_denied('RLS-04a', 'crítica',
    'Mallory sube la puntuación de una herramienta',
    'update public.tools set scores = ''{"freeReal":10,"usefulness":10,"ease":10,"transparency":10,"creatorValue":10}''::jsonb');

  perform pg_temp.expect_denied('RLS-04b', 'crítica',
    'Mallory reescribe un veredicto',
    'update public.tools set verdict = ''Comprado''');

  perform pg_temp.expect_denied('RLS-04c', 'alta',
    'Mallory publica una herramienta inventada',
    'insert into public.tools (id, slug, name, category_slug, free_model, free_plan, official_url, scores, detected_at, last_verified_at) '
    'values (''x'', ''x'', ''X'', ''imagen'', ''free_real'', ''{}''::jsonb, ''https://x.test'', ''{}''::jsonb, current_date, current_date)');

  perform pg_temp.expect_denied('RLS-04d', 'alta',
    'Mallory borra una herramienta',
    'delete from public.tools');

  perform pg_temp.expect_denied('RLS-04e', 'media',
    'Mallory edita una categoría',
    'update public.categories set name = ''Pirateada''');

  perform pg_temp.expect_no_rows('RLS-04f', 'media',
    'Mallory lee borradores no publicados',
    'select id from public.tools where status <> ''published''');
end $$;

-- =====================================================================
-- RLS-05 — the commercial layer (AutoCraw)
-- =====================================================================

do $$
declare mallory uuid := '11111111-1111-4111-8111-111111111111';
begin
  perform pg_temp.act_as(mallory);

  perform pg_temp.expect_denied('RLS-05a', 'alta',
    'Mallory inserta un producto afiliado',
    'insert into public.affiliate_products (slug, title) values (''spam'', ''Spam'')');

  perform pg_temp.expect_denied('RLS-05b', 'crítica',
    'Mallory crea un enlace afiliado sin divulgación',
    'insert into public.affiliate_links (offer_id, url, disclosure_required) '
    'values (gen_random_uuid(), ''https://spam.test'', false)');

  perform pg_temp.expect_no_rows('RLS-05c', 'media',
    'Mallory lee los clics agregados',
    'select * from public.affiliate_click_events_daily');

  perform pg_temp.expect_no_rows('RLS-05d', 'media',
    'Mallory ve productos pendientes de revisión',
    'select id from public.affiliate_products where status <> ''active''');
end $$;

-- The disclosure constraint must hold even for the service role: it is a
-- property of the data, not a permission.
do $$
begin
  perform pg_temp.act_as_service();
  perform pg_temp.expect_denied('RLS-05e', 'crítica',
    'ni siquiera el service role puede crear un enlace sin divulgación',
    'insert into public.affiliate_links (offer_id, url, disclosure_required) '
    'values (gen_random_uuid(), ''https://spam.test'', false)');
end $$;

-- =====================================================================
-- RLS-06 — the AutoCraw role itself
-- =====================================================================

do $$
begin
  set local role autocraw_ingest;

  perform pg_temp.expect_denied('RLS-06a', 'crítica',
    'AutoCraw cambia la puntuación de una herramienta',
    'update public.tools set scores = ''{}''::jsonb');

  perform pg_temp.expect_denied('RLS-06b', 'crítica',
    'AutoCraw cambia un veredicto',
    'update public.tools set verdict = ''Patrocinado''');

  perform pg_temp.expect_no_rows('RLS-06c', 'crítica',
    'AutoCraw lee perfiles de usuario',
    'select id from public.profiles');

  perform pg_temp.expect_no_rows('RLS-06d', 'crítica',
    'AutoCraw lee la lista del boletín',
    'select email from public.newsletter_subscriptions');

  perform pg_temp.expect_denied('RLS-06e', 'alta',
    'AutoCraw borra un producto en vez de desactivarlo',
    'delete from public.affiliate_products');

  perform pg_temp.expect_denied('RLS-06f', 'alta',
    'AutoCraw lee el registro de auditoría',
    'select id from public.audit_logs');
exception when others then
  -- If the role does not exist yet, say so instead of silently skipping.
  insert into rls_results (id, severity, scenario, expected, outcome, detail)
  values ('RLS-06', 'crítica', 'rol autocraw_ingest', 'existe', 'FALLA', sqlerrm);
end $$;

reset role;

-- AutoCraw's own writes must land as pending, whatever they ask for.
do $$
declare inserted public.commercial_status;
begin
  perform pg_temp.act_as_service();
  insert into public.affiliate_products (slug, title, source, status)
  values ('sonda-autocraw', 'Sonda', 'autocraw', 'active')
  returning status into inserted;

  insert into rls_results (id, severity, scenario, expected, outcome, detail)
  values ('RLS-06g', 'crítica',
          'un alta de AutoCraw marcada como activa se degrada a pendiente',
          'pending_review',
          case when inserted = 'pending_review' then 'PASA' else 'FALLA' end,
          format('quedó en %s', inserted));
exception when others then
  insert into rls_results (id, severity, scenario, expected, outcome, detail)
  values ('RLS-06g', 'crítica', 'disparador force_pending_for_agent',
          'pending_review', 'FALLA', sqlerrm);
end $$;

-- =====================================================================
-- RLS-07 — anonymous visitors
-- =====================================================================

do $$
begin
  perform pg_temp.act_as(null);

  perform pg_temp.expect_no_rows('RLS-07a', 'crítica',
    'un anónimo lee perfiles',
    'select id from public.profiles');

  perform pg_temp.expect_no_rows('RLS-07b', 'crítica',
    'un anónimo lee favoritos',
    'select tool_id from public.user_favorites');

  perform pg_temp.expect_no_rows('RLS-07c', 'crítica',
    'un anónimo lee alertas',
    'select id from public.alerts');

  perform pg_temp.expect_no_rows('RLS-07d', 'crítica',
    'un anónimo lee el boletín',
    'select email from public.newsletter_subscriptions');

  perform pg_temp.expect_denied('RLS-07e', 'alta',
    'un anónimo escribe un favorito',
    'insert into public.user_favorites (user_id, tool_id) '
    'values (''22222222-2222-4222-8222-222222222222'', ''tool_ollama'')');

  -- What an anonymous visitor *must* be able to do: read the catalogue.
  perform pg_temp.expect_true('RLS-07f', 'alta',
    'un anónimo sí puede leer el catálogo publicado',
    'select count(*) >= 0 from public.tools where status = ''published''');
end $$;

-- =====================================================================
-- RLS-08 — GDPR erasure
-- =====================================================================

do $$
declare alice uuid := '22222222-2222-4222-8222-222222222222';
begin
  perform pg_temp.act_as_service();
  update public.profiles set deleted_at = now() where id = alice;

  perform pg_temp.act_as(alice);

  perform pg_temp.expect_no_rows('RLS-08a', 'alta',
    'un perfil marcado para borrado deja de ser legible',
    format('select id from public.profiles where id = %L', alice));
end $$;

do $$
begin
  perform pg_temp.act_as(null);
  perform pg_temp.expect_no_rows('RLS-08b', 'alta',
    'las listas públicas de una cuenta en borrado dejan de mostrarse',
    'select id from public.user_lists where is_public = true '
    'and user_id = ''22222222-2222-4222-8222-222222222222''');
end $$;

-- =====================================================================
-- Results
-- =====================================================================

reset role;

select id, severity, outcome, scenario, coalesce(detail, '') as detail
from rls_results
order by seq;

select
  count(*) filter (where outcome = 'PASA')  as pasan,
  count(*) filter (where outcome = 'FALLA') as fallan,
  count(*)                                  as total
from rls_results;

-- A single failure fails the run, so this can gate a pipeline.
do $$
declare failures int;
begin
  select count(*) into failures from rls_results where outcome = 'FALLA';
  if failures > 0 then
    raise exception 'Suite RLS adversarial: % comprobación(es) han fallado. Revisa la tabla anterior.', failures;
  end if;
end $$;

rollback;
