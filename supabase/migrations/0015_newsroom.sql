-- Newsroom: el pipeline editorial deja de vivir en ficheros.
--
-- Hasta ahora las seis etapas —descubrimiento, triaje, verificación, borrador,
-- decisión y publicación— eran JSON en el árbol de trabajo. Eso funciona en un
-- portátil y no funciona en Vercel: el sistema de ficheros es efímero, así que
-- una aprobación hecha desde producción se perdería en el siguiente arranque.
--
-- El diseño conserva la cadena entera y no la aplasta. Cada etapa tiene su
-- tabla y su clave, de modo que después se puede seguir preguntando qué
-- encontró el radar, qué pensó, qué decidió el triaje, por qué, y qué terminó
-- verificándose. Nada se sobrescribe: las decisiones humanas son un registro
-- que sólo crece.
--
-- `newsroom_published` guarda el NewsItem entero como jsonb en lugar de
-- desplegarlo en columnas. Es deliberado: el esquema de verdad es el Zod de
-- `src/lib/domain/news.ts`, el build lo revalida al leerlo, y una tabla que
-- copiara cada campo acabaría discrepando de él sin que nadie se enterara.

-- ---------------------------------------------------------------- ejecución --

create table if not exists public.newsroom_runs (
  id           uuid primary key default gen_random_uuid(),
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  trigger      text not null default 'cron' check (trigger in ('cron', 'manual')),
  status       text not null default 'running'
               check (status in ('running', 'ok', 'partial', 'failed')),
  found        integer not null default 0,
  ingested     integer not null default 0,
  duplicates   integer not null default 0,
  triaged      integer not null default 0,
  verified     integer not null default 0,
  blocked      integer not null default 0,
  pending      integer not null default 0,
  errors       jsonb not null default '[]'::jsonb,
  notes        text not null default ''
);

comment on table public.newsroom_runs is
  'Una fila por ejecución diaria: el informe de qué encontró, qué ingirió y qué falló.';

-- --------------------------------------------------------------- candidatos --

create table if not exists public.newsroom_candidates (
  id             text primary key,
  title          text not null,
  url            text not null,
  canonical_url  text not null unique,
  publisher      text not null,
  observed_at    date not null,
  published_at   date,
  discovered_via text not null,
  vertical       text not null,
  status         text not null
                 check (status in ('discovered', 'duplicate', 'rejected', 'candidate')),
  reason         text,
  run_id         uuid references public.newsroom_runs(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists newsroom_candidates_status_idx
  on public.newsroom_candidates (status, published_at desc);

-- La deduplicación no es una comprobación de la aplicación, es una restricción:
-- dos ejecuciones sobre el mismo feed no pueden crear dos filas de la misma
-- historia ni aunque el código lo intente.
comment on column public.newsroom_candidates.canonical_url is
  'Clave de deduplicación: host + ruta, sin esquema, sin query, sin barra final.';

-- ------------------------------------------------------------------ triaje --

create table if not exists public.newsroom_triage (
  candidate_id     text primary key
                   references public.newsroom_candidates(id) on delete cascade,
  decision         text not null check (decision in ('promote', 'hold', 'reject')),
  score            integer not null check (score between 0 and 100),
  reasons          jsonb not null,
  vertical         text not null,
  event_class      text not null,
  product          text,
  radar_status     text not null,
  radar_reason     text,
  overturned_radar boolean not null default false,
  triaged_at       date not null,
  updated_at       timestamptz not null default now()
);

create index if not exists newsroom_triage_decision_idx
  on public.newsroom_triage (decision, score desc);

-- Lo que pensó el radar se guarda aquí y no se pisa: sin esto no se puede saber
-- después que el triaje rescató algo que el radar había descartado.
comment on column public.newsroom_triage.radar_status is
  'Veredicto del radar en el momento de triar, conservado para poder ver el desacuerdo.';

-- ------------------------------------------------------------ verificación --

create table if not exists public.newsroom_verification (
  candidate_id        text primary key
                      references public.newsroom_candidates(id) on delete cascade,
  decision            text not null
                      check (decision in ('verified', 'insufficient', 'contradicted')),
  primary_sources     jsonb not null,
  verified_facts      jsonb not null default '[]'::jsonb,
  unconfirmed         jsonb not null default '[]'::jsonb,
  event_type          text,
  availability        text,
  affects_free_plan   text not null,
  verification_notes  text not null default '',
  checked_at          date not null,
  updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------- borrador --

create table if not exists public.newsroom_drafts (
  slug              text primary key,
  candidate_id      text not null
                    references public.newsroom_candidates(id) on delete cascade,
  news_id           text not null unique,
  title             text not null,
  summary           text not null,
  impact            text not null,
  category          text not null,
  event_type        text not null,
  availability      text not null,
  affects_free_plan text not null,
  related_tools     jsonb not null default '[]'::jsonb,
  official_url      text not null,
  sources           jsonb not null,
  fact_trace        jsonb not null,
  status            text not null default 'draft' check (status in ('draft', 'ready')),
  created_at        timestamptz not null default now()
);

-- Cada afirmación del borrador apunta a la cita que la sostiene. Sin esto el
-- texto es prosa con una fuente pegada al lado.
comment on column public.newsroom_drafts.fact_trace is
  'Qué citas verificadas sostienen cada parte del borrador.';

-- -------------------------------------------------------------- decisiones --

create table if not exists public.newsroom_decisions (
  id         bigserial primary key,
  slug       text not null,
  action     text not null check (action in ('approve', 'hold', 'reject')),
  actor      text not null,
  note       text not null default '',
  decided_at timestamptz not null default now()
);

create index if not exists newsroom_decisions_slug_idx
  on public.newsroom_decisions (slug, decided_at desc);

comment on table public.newsroom_decisions is
  'Registro humano que sólo crece. Un rechazo conserva su motivo: sin política de update ni de delete.';

-- -------------------------------------------------------------- publicadas --

create table if not exists public.newsroom_published (
  slug        text primary key,
  news_id     text not null unique,
  item        jsonb not null,
  approved_by text not null,
  approved_at timestamptz not null default now()
);

comment on table public.newsroom_published is
  'Lo aprobado por una persona. El build la lee y la mezcla con news.json antes de generar /noticias.';

-- --------------------------------------------------------------------- RLS --
--
-- Newsroom entero es material interno: incluye lo descartado y por qué. Nada de
-- esto es legible por `anon` ni por un usuario con sesión normal. El cron y el
-- build entran con la service role, que salta RLS por definición.

alter table public.newsroom_runs         enable row level security;
alter table public.newsroom_candidates   enable row level security;
alter table public.newsroom_triage       enable row level security;
alter table public.newsroom_verification enable row level security;
alter table public.newsroom_drafts       enable row level security;
alter table public.newsroom_decisions    enable row level security;
alter table public.newsroom_published    enable row level security;

do $do$
declare t text;
begin
  foreach t in array array[
    'newsroom_runs', 'newsroom_candidates', 'newsroom_triage',
    'newsroom_verification', 'newsroom_drafts', 'newsroom_decisions',
    'newsroom_published'
  ] loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists "%s: staff reads" on public.%I', t, t);
    execute format(
      'create policy "%s: staff reads" on public.%I for select using (public.is_staff())',
      t, t
    );
  end loop;
end
$do$;

-- Escribir es cosa de un admin. `newsroom_decisions` y `newsroom_published` no
-- reciben política de update ni de delete: una decisión tomada no se reescribe,
-- y una noticia publicada no se edita por debajo de quien ya la ha leído.
--
-- El grant y la política son dos capas distintas y hacen falta las dos: sin el
-- `grant insert` PostgreSQL rechaza la escritura antes de mirar siquiera la
-- política, así que un admin recibiría «permission denied» con una política que
-- le da permiso. Quién puede insertar de verdad lo decide el `with check`.
grant insert on public.newsroom_decisions to authenticated;
grant insert on public.newsroom_published to authenticated;
grant usage, select on sequence public.newsroom_decisions_id_seq to authenticated;

drop policy if exists "newsroom_decisions: admin appends" on public.newsroom_decisions;
create policy "newsroom_decisions: admin appends"
  on public.newsroom_decisions for insert with check (public.is_admin());

drop policy if exists "newsroom_published: admin publishes" on public.newsroom_published;
create policy "newsroom_published: admin publishes"
  on public.newsroom_published for insert with check (public.is_admin());
