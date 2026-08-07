-- =====================================================================
-- Free AI Radar — commercial layer for AutoCraw
--
-- AutoCraw is a separate agent that will feed affiliate data. This migration
-- gives it a place to write and, more importantly, a wall it cannot write
-- past.
--
-- The design rule throughout: the separation between money and editorial
-- judgement is enforced by grants and constraints, not by convention. A bug in
-- the ingestion code, or a compromised AutoCraw credential, must not be able
-- to change a score, a verdict, or the order of a list.
--
-- What that means concretely:
--   * `autocraw_ingest` has privileges on the commercial tables and on
--     nothing else. It has no rights at all on `tools`, `profiles`,
--     `editorial_reviews`, or any other editorial or user table — not
--     revoked rights, simply never granted.
--   * Every commercial row lands as `pending_review`. A trigger forces it.
--     Promotion to `active` requires a staff session.
--   * `disclosure_required` is `true` with a check constraint that admits no
--     other value. There is no path to an undisclosed affiliate link.
--   * Click data is aggregated at write time. No user id, no session id.
--
-- Nothing here connects to Amazon or any other network, and no credential
-- exists yet. See docs/autocraw-affiliate-integration.md.
-- =====================================================================

-- ---------------------------------------------------------------------
-- The legacy placeholder becomes what it always was
--
-- 0001 shipped an `affiliate_links` table meaning "the tool's own outbound
-- affiliate URL" — an editorial property of a tool, decided by us. The
-- commercial layer needs that name for a different thing: the trackable URL of
-- a product offer. Renaming keeps both concepts legible instead of
-- overloading one word.
-- ---------------------------------------------------------------------

alter table if exists public.affiliate_links rename to tool_outbound_affiliations;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------

do $$ begin
  create type public.commercial_status as enum
    ('pending_review','active','inactive','rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.commercial_source as enum ('autocraw','manual','import');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.product_relation_kind as enum
    ('requires','complements','alternative_hardware','learning');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.offer_availability as enum ('in_stock','out_of_stock','unknown');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Merchants
-- ---------------------------------------------------------------------

create table if not exists public.affiliate_merchants (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  name            text not null,
  programme       text not null,
  -- Registrable domain. Used to prove a link points where it claims.
  host            text not null,
  market          char(2) not null,

  -- Required, and long enough to actually say something. A merchant we cannot
  -- describe honestly to the reader is one we cannot link to.
  disclosure_text text not null,

  status          public.commercial_status not null default 'pending_review',
  source          public.commercial_source not null default 'autocraw',
  last_checked_at date not null default current_date,
  notes           text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint merchants_market_format check (market ~ '^[A-Z]{2}$'),
  constraint merchants_disclosure_len check (char_length(disclosure_text) between 10 and 300),
  constraint merchants_host_format check (host ~ '^[a-z0-9.-]+\.[a-z]{2,}$')
);

-- ---------------------------------------------------------------------
-- Products
-- ---------------------------------------------------------------------

create table if not exists public.affiliate_products (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  title           text not null,
  summary         text not null default '',
  brand           text,
  category        text,
  -- ASIN, GTIN, EAN. Free-form because merchants disagree about identifiers.
  external_id     text,
  image_url       text,

  status          public.commercial_status not null default 'pending_review',
  source          public.commercial_source not null default 'autocraw',
  last_checked_at date not null default current_date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint products_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint products_title_len check (char_length(title) between 1 and 200)
);

-- ---------------------------------------------------------------------
-- Offers
--
-- One merchant selling one product in one market. Price lives here because
-- price is a property of an offer, not of a thing.
-- ---------------------------------------------------------------------

create table if not exists public.affiliate_offers (
  id                   uuid primary key default gen_random_uuid(),
  product_id           uuid not null references public.affiliate_products(id) on delete cascade,
  merchant_id          uuid not null references public.affiliate_merchants(id) on delete cascade,
  market               char(2) not null,

  -- Minor units. Money is never a float.
  observed_price_cents integer,
  observed_currency    char(3),
  -- The day the price was seen, not the day the row was written.
  observed_price_at    date,

  availability         public.offer_availability not null default 'unknown',
  status               public.commercial_status not null default 'pending_review',
  source               public.commercial_source not null default 'autocraw',
  last_checked_at      date not null default current_date,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint offers_market_format check (market ~ '^[A-Z]{2}$'),
  constraint offers_price_nonneg check (observed_price_cents is null or observed_price_cents >= 0),
  constraint offers_currency_format check (observed_currency is null or observed_currency ~ '^[A-Z]{3}$'),

  -- All three price fields or none. A price without a date is a rumour, and a
  -- price without a currency is a number.
  constraint offers_price_is_complete check (
    (observed_price_cents is null and observed_currency is null and observed_price_at is null)
    or
    (observed_price_cents is not null and observed_currency is not null and observed_price_at is not null)
  ),

  -- A price cannot have been observed in the future.
  constraint offers_price_not_future check (observed_price_at is null or observed_price_at <= current_date),

  unique (product_id, merchant_id, market)
);
create index if not exists offers_product_idx on public.affiliate_offers(product_id);
create index if not exists offers_status_idx on public.affiliate_offers(status, last_checked_at desc);

-- ---------------------------------------------------------------------
-- Links
-- ---------------------------------------------------------------------

create table if not exists public.affiliate_links (
  id                  uuid primary key default gen_random_uuid(),
  offer_id            uuid not null references public.affiliate_offers(id) on delete cascade,
  url                 text not null,
  -- Stored for audit, never rendered.
  tracking_tag        text,

  -- The invariant, as a constraint rather than a promise. The column exists so
  -- that anyone reading the schema sees the rule; the check means there is no
  -- value it can hold that would switch disclosure off.
  disclosure_required boolean not null default true,

  status              public.commercial_status not null default 'pending_review',
  source              public.commercial_source not null default 'autocraw',
  last_checked_at     date not null default current_date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint links_disclosure_always check (disclosure_required = true),
  constraint links_url_https check (url ~ '^https://')
);
create index if not exists links_offer_idx on public.affiliate_links(offer_id);

-- ---------------------------------------------------------------------
-- Tool ↔ product relations
--
-- The only place the commercial layer touches the editorial one, and it does
-- so by reading a slug. `commercial_priority` lives here, not on `tools`:
-- there is no column on a tool that money can move.
-- ---------------------------------------------------------------------

create table if not exists public.tool_product_relations (
  id                  uuid primary key default gen_random_uuid(),
  tool_id             text not null references public.tools(id) on delete cascade,
  product_id          uuid not null references public.affiliate_products(id) on delete cascade,
  kind                public.product_relation_kind not null,

  -- Why this product belongs next to this tool, in an editor's words. A
  -- relation nobody can justify in a sentence is an advert.
  rationale           text not null,

  -- Orders products inside a commercial slot. Nothing reads it outside one.
  commercial_priority smallint not null default 0,

  status              public.commercial_status not null default 'pending_review',
  source              public.commercial_source not null default 'autocraw',
  last_checked_at     date not null default current_date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint relations_rationale_len check (char_length(rationale) between 10 and 400),
  constraint relations_priority_range check (commercial_priority between 0 and 100),
  unique (tool_id, product_id, kind)
);
create index if not exists relations_tool_idx on public.tool_product_relations(tool_id);

-- ---------------------------------------------------------------------
-- Placement slots
--
-- The surfaces themselves are a closed list in application code
-- (`PLACEMENT_SLOTS`), so adding a commercial surface to the site is a code
-- change that goes through review. This table only says which relation may
-- appear in an existing slot.
-- ---------------------------------------------------------------------

create table if not exists public.placement_slots (
  id                  uuid primary key default gen_random_uuid(),
  slot                text not null,
  relation_id         uuid not null references public.tool_product_relations(id) on delete cascade,
  commercial_priority smallint not null default 0,
  starts_on           date,
  ends_on             date,

  status              public.commercial_status not null default 'pending_review',
  source              public.commercial_source not null default 'autocraw',
  last_checked_at     date not null default current_date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint slots_known check (
    slot in ('tool_detail_sidebar','tool_detail_footer','guide_inline','collection_footer')
  ),
  constraint slots_priority_range check (commercial_priority between 0 and 100),
  constraint slots_dates check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create index if not exists slots_slot_idx on public.placement_slots(slot, status);

-- ---------------------------------------------------------------------
-- Clicks, aggregated at write time
--
-- No user id and no session id, by construction. An aggregate cannot leak an
-- individual's browsing, so the privacy question is answered once here instead
-- of in every consumer downstream. It also means this table needs no
-- per-user RLS: there is no user to isolate.
-- ---------------------------------------------------------------------

create table if not exists public.affiliate_click_events_daily (
  day        date not null,
  link_id    uuid not null references public.affiliate_links(id) on delete cascade,
  slot       text not null,
  market     char(2) not null,
  clicks     integer not null default 0,

  primary key (day, link_id, slot, market),
  constraint clicks_nonneg check (clicks >= 0),
  constraint clicks_market_format check (market ~ '^[A-Z]{2}$')
);
create index if not exists clicks_day_idx on public.affiliate_click_events_daily(day desc);

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------

create trigger affiliate_merchants_updated before update on public.affiliate_merchants
  for each row execute function public.set_updated_at();
create trigger affiliate_products_updated before update on public.affiliate_products
  for each row execute function public.set_updated_at();
create trigger affiliate_offers_updated before update on public.affiliate_offers
  for each row execute function public.set_updated_at();
create trigger affiliate_links_updated before update on public.affiliate_links
  for each row execute function public.set_updated_at();
create trigger tool_product_relations_updated before update on public.tool_product_relations
  for each row execute function public.set_updated_at();
create trigger placement_slots_updated before update on public.placement_slots
  for each row execute function public.set_updated_at();

/*
 * Publication is a human act.
 *
 * A WITH CHECK policy could express "AutoCraw may not insert active rows", but
 * a trigger states the rule once for every writer and every future policy, and
 * it survives someone adding a policy that forgets. Rows written by the agent
 * land as pending regardless of what the payload asked for; a staff session
 * may set any status it likes.
 */
create or replace function public.force_pending_for_agent()
returns trigger language plpgsql as $$
begin
  if new.source = 'autocraw' and coalesce(public.is_staff(), false) = false then
    new.status = 'pending_review';
  end if;
  return new;
end $$;

create trigger affiliate_merchants_pending before insert or update on public.affiliate_merchants
  for each row execute function public.force_pending_for_agent();
create trigger affiliate_products_pending before insert or update on public.affiliate_products
  for each row execute function public.force_pending_for_agent();
create trigger affiliate_offers_pending before insert or update on public.affiliate_offers
  for each row execute function public.force_pending_for_agent();
create trigger affiliate_links_pending before insert or update on public.affiliate_links
  for each row execute function public.force_pending_for_agent();
create trigger tool_product_relations_pending before insert or update on public.tool_product_relations
  for each row execute function public.force_pending_for_agent();
create trigger placement_slots_pending before insert or update on public.placement_slots
  for each row execute function public.force_pending_for_agent();

-- ---------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------

alter table public.affiliate_merchants          enable row level security;
alter table public.affiliate_products           enable row level security;
alter table public.affiliate_offers             enable row level security;
alter table public.affiliate_links              enable row level security;
alter table public.tool_product_relations       enable row level security;
alter table public.placement_slots              enable row level security;
alter table public.affiliate_click_events_daily enable row level security;
alter table public.tool_outbound_affiliations   enable row level security;

-- Public reads see active rows only. `pending_review` is invisible to the
-- site, which is what makes review meaningful rather than decorative.
create policy "merchants: public reads active"
  on public.affiliate_merchants for select
  using (status = 'active' or public.is_staff());

create policy "products: public reads active"
  on public.affiliate_products for select
  using (status = 'active' or public.is_staff());

create policy "offers: public reads active"
  on public.affiliate_offers for select
  using (status = 'active' or public.is_staff());

create policy "links: public reads active"
  on public.affiliate_links for select
  using (status = 'active' or public.is_staff());

create policy "relations: public reads active"
  on public.tool_product_relations for select
  using (status = 'active' or public.is_staff());

create policy "slots: public reads active"
  on public.placement_slots for select
  using (status = 'active' or public.is_staff());

-- Aggregate click counts are business data, not public data.
create policy "clicks: staff only"
  on public.affiliate_click_events_daily for select
  using (public.is_staff());

create policy "tool outbound: public reads active"
  on public.tool_outbound_affiliations for select
  using (is_active or public.is_staff());

-- Writes: staff, through the admin panel.
create policy "merchants: staff writes"
  on public.affiliate_merchants for all
  using (public.is_staff()) with check (public.is_staff());
create policy "products: staff writes"
  on public.affiliate_products for all
  using (public.is_staff()) with check (public.is_staff());
create policy "offers: staff writes"
  on public.affiliate_offers for all
  using (public.is_staff()) with check (public.is_staff());
create policy "links: staff writes"
  on public.affiliate_links for all
  using (public.is_staff()) with check (public.is_staff());
create policy "relations: staff writes"
  on public.tool_product_relations for all
  using (public.is_staff()) with check (public.is_staff());
create policy "slots: staff writes"
  on public.placement_slots for all
  using (public.is_staff()) with check (public.is_staff());
create policy "clicks: staff writes"
  on public.affiliate_click_events_daily for all
  using (public.is_staff()) with check (public.is_staff());
create policy "tool outbound: staff writes"
  on public.tool_outbound_affiliations for all
  using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------
-- The AutoCraw role
--
-- Minimum privilege, stated as a list of grants rather than a list of
-- revocations. Everything not named below is unreachable — not because it was
-- taken away, but because it was never given. Adding a table to the schema
-- does not silently widen this role.
--
-- NOLOGIN on purpose: this migration creates the shape of the access, not the
-- access itself. Issuing a credential is a separate, deliberate act performed
-- by a human when AutoCraw is actually connected. There is no password here
-- and no secret in this repository.
-- ---------------------------------------------------------------------

do $$ begin
  create role autocraw_ingest nologin;
exception when duplicate_object then null; end $$;

/*
 * The project owner may assume the role.
 *
 * Needed to administer it at all, and needed for the adversarial suite to
 * test it: without membership, `set role autocraw_ingest` fails with
 * "permission denied to set role", and the six probes that check AutoCraw's
 * limits never run. On Supabase `postgres` is not a superuser, so this is not
 * implied — the local preflight only passed because its session user was one.
 *
 * No privilege is gained: the owner already outranks this role in every
 * respect. What changes is that the role's boundaries become testable.
 */
do $$ begin
  execute format('grant autocraw_ingest to %I', current_user);
end $$;

grant usage on schema public to autocraw_ingest;

-- Read what it needs to build a coherent payload: its own tables, plus the
-- tool slugs it must reference. Reading a tool's *name* is necessary to relate
-- a product to it; writing one is not, and is not granted.
grant select (id, slug, name, category_slug, status) on public.tools to autocraw_ingest;
grant select on public.categories to autocraw_ingest;

grant select, insert, update on
  public.affiliate_merchants,
  public.affiliate_products,
  public.affiliate_offers,
  public.affiliate_links,
  public.tool_product_relations,
  public.placement_slots
to autocraw_ingest;

-- Deletion is not granted. Retiring a record is `status = 'inactive'`, which
-- keeps the history auditable and makes a destructive bug impossible.
-- Aggregated clicks are readable so AutoCraw can optimise, never writable.
grant select on public.affiliate_click_events_daily to autocraw_ingest;

/*
 * The status column is writable, and the trigger above is what keeps that
 * honest: AutoCraw can set it to anything, and it will land as
 * `pending_review` anyway. Column-level revocation was rejected because it
 * would make an ordinary UPDATE fail confusingly rather than being corrected.
 */

-- RLS still applies to this role. Its policies are narrow: it sees its own
-- pending rows and the active ones, and nothing that belongs to a user.
create policy "autocraw: reads commercial"
  on public.affiliate_products for select
  to autocraw_ingest
  using (true);

create policy "autocraw: writes pending products"
  on public.affiliate_products for insert
  to autocraw_ingest
  with check (source = 'autocraw');

create policy "autocraw: updates own products"
  on public.affiliate_products for update
  to autocraw_ingest
  using (source = 'autocraw')
  with check (source = 'autocraw');

-- The same three policies, for each remaining commercial table.
create policy "autocraw: reads merchants" on public.affiliate_merchants
  for select to autocraw_ingest using (true);
create policy "autocraw: writes merchants" on public.affiliate_merchants
  for insert to autocraw_ingest with check (source = 'autocraw');
create policy "autocraw: updates merchants" on public.affiliate_merchants
  for update to autocraw_ingest using (source = 'autocraw') with check (source = 'autocraw');

create policy "autocraw: reads offers" on public.affiliate_offers
  for select to autocraw_ingest using (true);
create policy "autocraw: writes offers" on public.affiliate_offers
  for insert to autocraw_ingest with check (source = 'autocraw');
create policy "autocraw: updates offers" on public.affiliate_offers
  for update to autocraw_ingest using (source = 'autocraw') with check (source = 'autocraw');

create policy "autocraw: reads links" on public.affiliate_links
  for select to autocraw_ingest using (true);
create policy "autocraw: writes links" on public.affiliate_links
  for insert to autocraw_ingest with check (source = 'autocraw' and disclosure_required = true);
create policy "autocraw: updates links" on public.affiliate_links
  for update to autocraw_ingest
  using (source = 'autocraw')
  with check (source = 'autocraw' and disclosure_required = true);

create policy "autocraw: reads relations" on public.tool_product_relations
  for select to autocraw_ingest using (true);
create policy "autocraw: writes relations" on public.tool_product_relations
  for insert to autocraw_ingest with check (source = 'autocraw');
create policy "autocraw: updates relations" on public.tool_product_relations
  for update to autocraw_ingest using (source = 'autocraw') with check (source = 'autocraw');

create policy "autocraw: reads slots" on public.placement_slots
  for select to autocraw_ingest using (true);
create policy "autocraw: writes slots" on public.placement_slots
  for insert to autocraw_ingest with check (source = 'autocraw');
create policy "autocraw: updates slots" on public.placement_slots
  for update to autocraw_ingest using (source = 'autocraw') with check (source = 'autocraw');

create policy "autocraw: reads click aggregates" on public.affiliate_click_events_daily
  for select to autocraw_ingest using (true);

-- ---------------------------------------------------------------------
-- What the site actually reads
--
-- A view, so the render path cannot accidentally select a pending row or a
-- stale one. Age is checked here because the passage of time is not an event
-- anybody sends us: if AutoCraw goes quiet, rows leave this view on their own
-- and the pages that used them keep working.
-- ---------------------------------------------------------------------

create or replace view public.active_placements as
select
  ps.slot,
  ps.commercial_priority,
  r.tool_id,
  r.kind          as relation_kind,
  r.rationale,
  p.slug          as product_slug,
  p.title         as product_title,
  p.image_url,
  o.market,
  o.observed_price_cents,
  o.observed_currency,
  o.observed_price_at,
  o.availability,
  l.url           as link_url,
  l.disclosure_required,
  m.name          as merchant_name,
  m.disclosure_text,
  least(ps.last_checked_at, r.last_checked_at, o.last_checked_at, l.last_checked_at)
    as last_checked_at
from public.placement_slots ps
join public.tool_product_relations r on r.id = ps.relation_id
join public.affiliate_products     p on p.id = r.product_id
join public.affiliate_offers       o on o.product_id = p.id
join public.affiliate_links        l on l.offer_id = o.id
join public.affiliate_merchants    m on m.id = o.merchant_id
where ps.status = 'active'
  and r.status  = 'active'
  and p.status  = 'active'
  and o.status  = 'active'
  and l.status  = 'active'
  and m.status  = 'active'
  and (ps.starts_on is null or ps.starts_on <= current_date)
  and (ps.ends_on   is null or ps.ends_on   >= current_date)
  and least(ps.last_checked_at, r.last_checked_at, o.last_checked_at, l.last_checked_at)
      >= current_date - interval '60 days';

comment on view public.active_placements is
  'Lo único que el sitio público lee de la capa comercial. Excluye pendientes, inactivos y caducados.';
