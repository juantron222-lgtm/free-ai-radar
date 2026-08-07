-- =====================================================================
-- Free AI Radar — core schema
-- Target: Supabase (PostgreSQL 15+)
--
-- Conventions:
--   * `public.profiles.id` is FK to `auth.users.id` (Supabase Auth owns users).
--   * Timestamps are `timestamptz`, dates that describe editorial facts are
--     `date` (a verification is a day, not an instant).
--   * Rich sub-objects are `jsonb` and validated by Zod in the application.
--     This keeps the editorial model malleable without a migration per field
--     while the taxonomy is still settling.
--   * Every table gets RLS. Default is deny.
-- =====================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";
create extension if not exists "unaccent";

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------

do $$ begin
  create type public.editorial_status as enum ('draft','in_review','published','archived','rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.user_role as enum ('user','editor','admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.free_model as enum
    ('free_real','freemium','credits','trial','open_source','local','demo','paid_only');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.tri_state as enum ('yes','no','partial','unverified');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.hosting_kind as enum ('cloud','local','hybrid');
exception when duplicate_object then null; end $$;

-- What an entry actually is. A base model and the commercial app that serves
-- it are different rows; this is what keeps them from sharing one.
do $$ begin
  create type public.tool_kind as enum
    ('model','app','platform','framework','agent','api','interface','oss_project');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.verification_state as enum
    ('verified','partially_verified','pending_review','outdated','discontinued');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.skill_level as enum ('beginner','intermediate','advanced');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.subscription_status as enum
    ('trialing','active','past_due','canceled','incomplete','incomplete_expired','unpaid','paused');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.submission_status as enum ('pending','accepted','rejected','duplicate');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------

create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  display_name    text,
  avatar_url      text,
  locale          text not null default 'es',
  role            public.user_role not null default 'user',
  interests       jsonb not null default '[]'::jsonb,
  onboarded_at    timestamptz,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint profiles_display_name_len check (display_name is null or char_length(display_name) between 1 and 80)
);

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

/*
 * Role lookup, defined here rather than with the other helpers because it
 * reads public.profiles.
 *
 * PostgreSQL validates the body of a `language sql` function when it is
 * created (check_function_bodies is on by default), so declaring this before
 * the table exists aborts the migration on its first run. SECURITY DEFINER so
 * that reading the caller's own role does not itself require a policy that
 * could recurse.
 */
create or replace function public.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'user'::public.user_role);
$$;

create or replace function public.is_staff()
returns boolean language sql stable
security definer set search_path = public as $$
  select public.current_role() in ('editor','admin');
$$;

create or replace function public.is_admin()
returns boolean language sql stable
security definer set search_path = public as $$
  select public.current_role() = 'admin';
$$;

-- New auth users get a profile automatically. Role always starts at 'user';
-- privilege is granted deliberately, never inferred from sign-up data.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(new.raw_user_meta_data->>'display_name',''))
  on conflict (id) do nothing;

  insert into public.notification_preferences (user_id) values (new.id)
  on conflict (user_id) do nothing;

  return new;
end $$;

-- ---------------------------------------------------------------------
-- Editorial content
-- ---------------------------------------------------------------------

create table if not exists public.categories (
  slug        text primary key,
  name        text not null,
  intro       text not null default '',
  icon        text not null default 'model',
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.tools (
  id                    text primary key,
  slug                  text not null unique,
  name                  text not null,
  tagline               text not null default '',
  description_short     text not null default '',
  description_long      text not null default '',

  kind                  public.tool_kind not null default 'app',
  verification          public.verification_state not null default 'pending_review',
  next_review_at        date,
  version               text,

  category_slug         text not null references public.categories(slug) on update cascade,
  secondary_categories  jsonb not null default '[]'::jsonb,
  tags                  jsonb not null default '[]'::jsonb,
  use_cases             jsonb not null default '[]'::jsonb,

  free_model            public.free_model not null,
  free_plan             jsonb not null,

  open_source           public.tri_state not null default 'unverified',
  licence               text,
  hosting               public.hosting_kind not null default 'cloud',
  platforms             jsonb not null default '[]'::jsonb,
  languages             jsonb not null default '[]'::jsonb,
  hardware_requirements text,
  skill_level           public.skill_level not null default 'beginner',

  privacy               jsonb not null default '{}'::jsonb,

  official_url          text not null,
  pricing_url           text,
  docs_url              text,
  repo_url              text,
  sources               jsonb not null default '[]'::jsonb,

  scores                jsonb not null,
  verdict               text not null default '',
  pros                  jsonb not null default '[]'::jsonb,
  cons                  jsonb not null default '[]'::jsonb,
  best_for              jsonb not null default '[]'::jsonb,
  not_for               jsonb not null default '[]'::jsonb,
  alternatives          jsonb not null default '[]'::jsonb,
  alternative_names     jsonb not null default '[]'::jsonb,
  changelog             jsonb not null default '[]'::jsonb,

  affiliation           jsonb not null default '{"isAffiliate": false}'::jsonb,
  sponsorship           jsonb not null default '{"isSponsored": false}'::jsonb,

  status                public.editorial_status not null default 'draft',
  reviewed_by           text,
  detected_at           date not null default current_date,
  last_verified_at      date not null default current_date,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint tools_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint tools_official_url_http check (official_url ~* '^https?://')
);

create trigger tools_set_updated_at before update on public.tools
  for each row execute function public.set_updated_at();

create index if not exists tools_status_idx on public.tools(status);
create index if not exists tools_category_idx on public.tools(category_slug);
create index if not exists tools_free_model_idx on public.tools(free_model);
create index if not exists tools_last_verified_idx on public.tools(last_verified_at);
create index if not exists tools_name_trgm_idx on public.tools using gin (name gin_trgm_ops);
create index if not exists tools_search_trgm_idx on public.tools
  using gin ((name || ' ' || tagline || ' ' || description_short) gin_trgm_ops);

-- Append-only history. Every publish writes a snapshot so an editor can restore.
create table if not exists public.tool_versions (
  id          uuid primary key default gen_random_uuid(),
  tool_id     text not null references public.tools(id) on delete cascade,
  snapshot    jsonb not null,
  reason      text,
  changed_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists tool_versions_tool_idx on public.tool_versions(tool_id, created_at desc);

create table if not exists public.tool_updates (
  id          uuid primary key default gen_random_uuid(),
  tool_id     text not null references public.tools(id) on delete cascade,
  kind        text not null,
  summary     text not null,
  source_url  text,
  happened_on date not null default current_date,
  created_at  timestamptz not null default now()
);
create index if not exists tool_updates_tool_idx on public.tool_updates(tool_id, happened_on desc);
create index if not exists tool_updates_recent_idx on public.tool_updates(happened_on desc);

create table if not exists public.editorial_reviews (
  id          uuid primary key default gen_random_uuid(),
  tool_id     text not null references public.tools(id) on delete cascade,
  reviewer_id uuid references public.profiles(id) on delete set null,
  reviewer_name text not null default '',
  notes       text not null default '',
  scores      jsonb not null,
  reviewed_on date not null default current_date,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Community input
-- ---------------------------------------------------------------------

create table if not exists public.tool_submissions (
  id          uuid primary key default gen_random_uuid(),
  submitted_by uuid references public.profiles(id) on delete set null,
  email       text,
  name        text not null,
  url         text not null,
  category_slug text,
  notes       text not null default '',
  status      public.submission_status not null default 'pending',
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists tool_submissions_status_idx on public.tool_submissions(status, created_at desc);

create table if not exists public.tool_corrections (
  id          uuid primary key default gen_random_uuid(),
  tool_id     text not null references public.tools(id) on delete cascade,
  reported_by uuid references public.profiles(id) on delete set null,
  email       text,
  field       text,
  message     text not null,
  evidence_url text,
  status      public.submission_status not null default 'pending',
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists tool_corrections_status_idx on public.tool_corrections(status, created_at desc);

-- "Is this still accurate?" — one vote per user per tool, replaceable.
create table if not exists public.accuracy_votes (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  tool_id     text not null references public.tools(id) on delete cascade,
  still_accurate boolean not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, tool_id)
);

-- ---------------------------------------------------------------------
-- User-owned data
-- ---------------------------------------------------------------------

create table if not exists public.user_favorites (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  tool_id     text not null references public.tools(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, tool_id)
);

create table if not exists public.user_tool_states (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  tool_id     text not null references public.tools(id) on delete cascade,
  tried       boolean not null default false,
  note        text,
  updated_at  timestamptz not null default now(),
  primary key (user_id, tool_id)
);

create table if not exists public.user_lists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  slug        text not null,
  title       text not null,
  description text not null default '',
  is_public   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, slug)
);

create trigger user_lists_set_updated_at before update on public.user_lists
  for each row execute function public.set_updated_at();

create table if not exists public.user_list_items (
  list_id     uuid not null references public.user_lists(id) on delete cascade,
  tool_id     text not null references public.tools(id) on delete cascade,
  position    integer not null default 0,
  note        text,
  created_at  timestamptz not null default now(),
  primary key (list_id, tool_id)
);

create table if not exists public.saved_comparisons (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  title       text not null default '',
  tool_slugs  jsonb not null,
  created_at  timestamptz not null default now(),
  constraint saved_comparisons_size check (jsonb_array_length(tool_slugs) between 2 and 4)
);

create table if not exists public.followed_categories (
  user_id       uuid not null references public.profiles(id) on delete cascade,
  category_slug text not null references public.categories(slug) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (user_id, category_slug)
);

create table if not exists public.view_history (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  tool_id     text not null references public.tools(id) on delete cascade,
  viewed_at   timestamptz not null default now(),
  primary key (user_id, tool_id)
);

create table if not exists public.notification_preferences (
  user_id           uuid primary key references public.profiles(id) on delete cascade,
  weekly_digest     boolean not null default true,
  instant_alerts    boolean not null default false,
  product_updates   boolean not null default true,
  -- Commercial email is opt-in and tracked separately from transactional mail.
  marketing_opt_in  boolean not null default false,
  categories        jsonb not null default '[]'::jsonb,
  updated_at        timestamptz not null default now()
);

create trigger notification_preferences_set_updated_at before update on public.notification_preferences
  for each row execute function public.set_updated_at();

create table if not exists public.alerts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  -- Either watch a specific tool or a whole category.
  tool_id     text references public.tools(id) on delete cascade,
  category_slug text references public.categories(slug) on delete cascade,
  kinds       jsonb not null default '["free_plan_reduced","price_change","card_now_required"]'::jsonb,
  is_active   boolean not null default true,
  last_sent_at timestamptz,
  created_at  timestamptz not null default now(),
  constraint alerts_target check (
    (tool_id is not null and category_slug is null) or
    (tool_id is null and category_slug is not null)
  )
);
create index if not exists alerts_user_idx on public.alerts(user_id);

-- ---------------------------------------------------------------------
-- Newsletter (independent of accounts — you can subscribe without one)
-- ---------------------------------------------------------------------

create table if not exists public.newsletter_subscriptions (
  id                uuid primary key default gen_random_uuid(),
  email             text not null unique,
  user_id           uuid references public.profiles(id) on delete set null,
  status            text not null default 'pending'
                      check (status in ('pending','confirmed','unsubscribed','bounced','complained')),
  categories        jsonb not null default '[]'::jsonb,
  locale            text not null default 'es',
  -- Double opt-in. Tokens are stored hashed; the raw value only ever exists in
  -- the confirmation email.
  confirm_token_hash text,
  confirm_sent_at   timestamptz,
  confirmed_at      timestamptz,
  unsubscribe_token_hash text not null,
  unsubscribed_at   timestamptz,
  -- Proof of consent, required by GDPR art. 7(1).
  consent_ip_hash   text,
  consent_user_agent text,
  source            text not null default 'web',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create trigger newsletter_set_updated_at before update on public.newsletter_subscriptions
  for each row execute function public.set_updated_at();

create table if not exists public.email_log (
  id          uuid primary key default gen_random_uuid(),
  to_hash     text not null,            -- sha256 of recipient; never the address
  template    text not null,
  kind        text not null check (kind in ('transactional','marketing')),
  provider_id text,
  status      text not null default 'queued',
  error       text,
  created_at  timestamptz not null default now()
);
create index if not exists email_log_created_idx on public.email_log(created_at desc);

-- ---------------------------------------------------------------------
-- Monetisation
-- ---------------------------------------------------------------------

create table if not exists public.subscription_plans (
  id                text primary key,          -- 'free' | 'pro_monthly' | 'pro_yearly'
  tier              text not null check (tier in ('free','pro')),
  name              text not null,
  description       text not null default '',
  -- Amounts live here, not in code, so pricing is administrable.
  amount_cents      integer not null default 0,
  currency          text not null default 'eur',
  interval          text check (interval in ('month','year')),
  stripe_price_id   text,
  features          jsonb not null default '[]'::jsonb,
  is_active         boolean not null default true,
  position          integer not null default 0
);

create table if not exists public.user_subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.profiles(id) on delete cascade,
  plan_id                text references public.subscription_plans(id),
  stripe_customer_id     text,
  stripe_subscription_id text unique,
  status                 public.subscription_status not null default 'incomplete',
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (user_id, stripe_subscription_id)
);

create trigger user_subscriptions_set_updated_at before update on public.user_subscriptions
  for each row execute function public.set_updated_at();

create index if not exists user_subscriptions_user_idx on public.user_subscriptions(user_id);

-- Webhook idempotency: Stripe retries, we must not double-apply.
create table if not exists public.processed_webhook_events (
  id            text primary key,          -- Stripe event id
  provider      text not null default 'stripe',
  type          text not null,
  processed_at  timestamptz not null default now()
);

create table if not exists public.affiliate_programs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  network     text,
  notes       text not null default '',
  created_at  timestamptz not null default now()
);

create table if not exists public.affiliate_links (
  id          uuid primary key default gen_random_uuid(),
  tool_id     text not null references public.tools(id) on delete cascade,
  program_id  uuid references public.affiliate_programs(id) on delete set null,
  url         text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.sponsored_placements (
  id          uuid primary key default gen_random_uuid(),
  tool_id     text references public.tools(id) on delete cascade,
  surface     text not null,   -- 'home_rail' | 'category_rail' | 'newsletter'
  label       text not null default 'Patrocinado',
  starts_on   date not null,
  ends_on     date not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint sponsored_dates check (ends_on >= starts_on)
);

-- ---------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------

create table if not exists public.audit_logs (
  id          bigserial primary key,
  actor_id    uuid references public.profiles(id) on delete set null,
  actor_email text,
  action      text not null,
  entity      text not null,
  entity_id   text,
  diff        jsonb,
  ip_hash     text,
  created_at  timestamptz not null default now()
);
create index if not exists audit_logs_created_idx on public.audit_logs(created_at desc);
create index if not exists audit_logs_entity_idx on public.audit_logs(entity, entity_id);

-- ---------------------------------------------------------------------
-- Product analytics (first-party, consent-gated at the edge)
-- ---------------------------------------------------------------------

create table if not exists public.product_events (
  id          bigserial primary key,
  name        text not null,
  -- Never a raw user id for anonymous traffic; a rotating daily salt hash.
  anon_hash   text,
  user_id     uuid references public.profiles(id) on delete set null,
  props       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists product_events_name_idx on public.product_events(name, created_at desc);
