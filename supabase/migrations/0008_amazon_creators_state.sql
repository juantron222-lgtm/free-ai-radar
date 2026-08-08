-- =====================================================================
-- Free AI Radar — shared state for Creators API
--
-- Two things AutoCraw cannot keep in memory if it ever runs as more than one
-- process:
--
--   * **The transaction counters.** Two processes each counting their own
--     requests against a shared quota will exceed it together while each one
--     believes it is inside budget. The limit is Amazon's, not per-instance.
--
--   * **The LwA access token.** Tokens last an hour. Two processes with
--     private caches request twice as many for no benefit, spend quota on
--     authentication, and hit Amazon's own limits on the token endpoint.
--
-- Neither table is readable by the public. The token especially: it *is* a
-- credential, and it is here only because sharing it is the point.
-- =====================================================================

create table if not exists public.amazon_api_usage (
  day             date primary key,
  transactions    integer not null default 0,
  -- Instant of the most recent request, for the per-second limit.
  last_request_at timestamptz,
  updated_at      timestamptz not null default now(),

  constraint amazon_usage_nonneg check (transactions >= 0)
);

comment on table public.amazon_api_usage is
  'Contador compartido de transacciones de Creators API. Compartido porque el límite es de la cuenta, no de cada proceso.';

/*
 * The quota we believe we have, and when we last checked.
 *
 * A row rather than a constant because Amazon adjusts it per account: 1 TPS
 * and 8,640 per day cover the first thirty days and nothing after. Storing the
 * observation date is what makes a stale figure detectable — a number with no
 * date is a number nobody can evaluate.
 */
create table if not exists public.amazon_api_quota (
  id           boolean primary key default true,
  max_tps      numeric(6,3) not null,
  max_tpd      integer not null,
  recorded_at  timestamptz not null,
  source       text not null,
  provisional  boolean not null default true,
  updated_at   timestamptz not null default now(),

  constraint amazon_quota_singleton check (id),
  constraint amazon_quota_tps check (max_tps > 0 and max_tps <= 100),
  constraint amazon_quota_tpd check (max_tpd > 0)
);

comment on table public.amazon_api_quota is
  'Cuota conocida y fecha de comprobación. Nunca se trata 8640/día como garantía perpetua.';

/*
 * The token cache.
 *
 * `expires_at` is what readers check; the row is replaced rather than
 * appended, because a table of expired tokens is a table of leaked
 * credentials waiting for someone to read the wrong row.
 */
create table if not exists public.amazon_lwa_token (
  id           boolean primary key default true,
  access_token text not null,
  expires_at   timestamptz not null,
  updated_at   timestamptz not null default now(),

  constraint amazon_token_singleton check (id)
);

comment on table public.amazon_lwa_token is
  'Caché compartida del token de LwA. Es una credencial: sólo autocraw_ingest y service_role.';

-- ---------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------

alter table public.amazon_api_usage enable row level security;
alter table public.amazon_api_quota enable row level security;
alter table public.amazon_lwa_token enable row level security;

-- Staff may read usage and quota to see what the agent is spending.
create policy "amazon usage: staff reads"
  on public.amazon_api_usage for select using (public.is_staff());

create policy "amazon quota: staff reads"
  on public.amazon_api_quota for select using (public.is_staff());

create policy "amazon quota: admin writes"
  on public.amazon_api_quota for all
  using (public.is_admin()) with check (public.is_admin());

/*
 * The token has no staff read policy, deliberately.
 *
 * Nobody needs to look at it in a dashboard, and a credential that is
 * convenient to read is a credential that ends up in a screenshot. Only
 * `autocraw_ingest` — which needs it to work — and the service role, which
 * bypasses RLS anyway.
 */
create policy "autocraw: reads usage" on public.amazon_api_usage
  for select to autocraw_ingest using (true);
create policy "autocraw: writes usage" on public.amazon_api_usage
  for insert to autocraw_ingest with check (true);
create policy "autocraw: updates usage" on public.amazon_api_usage
  for update to autocraw_ingest using (true) with check (true);

create policy "autocraw: reads quota" on public.amazon_api_quota
  for select to autocraw_ingest using (true);

create policy "autocraw: reads token" on public.amazon_lwa_token
  for select to autocraw_ingest using (true);
create policy "autocraw: writes token" on public.amazon_lwa_token
  for insert to autocraw_ingest with check (true);
create policy "autocraw: updates token" on public.amazon_lwa_token
  for update to autocraw_ingest using (true) with check (true);

-- ---------------------------------------------------------------------
-- Grants
--
-- The agent may count its own usage and cache its own token, and may read the
-- quota it has to respect. It may not change that quota: a limit an agent can
-- raise for itself is not a limit.
-- ---------------------------------------------------------------------

grant select, insert, update on public.amazon_api_usage to autocraw_ingest;
grant select on public.amazon_api_quota to autocraw_ingest;
grant select, insert, update on public.amazon_lwa_token to autocraw_ingest;

-- No grants at all to anon or authenticated: none of this is public, and the
-- token is a credential.
revoke all on public.amazon_lwa_token from anon, authenticated;
revoke all on public.amazon_api_usage from anon, authenticated;
revoke all on public.amazon_api_quota from anon, authenticated;

/*
 * The starting quota, seeded as provisional.
 *
 * Written as a row so it can be corrected without a deploy, and marked
 * provisional so `refreshFeasibility` refuses to trust it once it is more than
 * thirty days old. Amazon's limits after the introductory window depend on
 * account performance, and this figure is a starting point rather than a fact
 * about the future.
 */
insert into public.amazon_api_quota (id, max_tps, max_tpd, recorded_at, source, provisional)
values (
  true, 1, 8640, now(),
  'Documentación de Amazon Creators API: límites iniciales de los primeros 30 días',
  true
)
on conflict (id) do nothing;
