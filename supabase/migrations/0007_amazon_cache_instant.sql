-- =====================================================================
-- Free AI Radar — an instant for observed prices
--
-- `observed_price_at` is a `date`, and Amazon's licence measures cache life in
-- hours: 24 for anything that is not an image. A date cannot express that. It
-- cannot tell "seen two hours ago" from "seen twenty-six hours ago" when the
-- two fall on adjacent days, so the rule could not have been enforced even in
-- principle — the column was the wrong shape for the obligation.
--
-- The date stays: it is what a reader sees, and it is the right granularity
-- for a merchant whose prices are not under a licence like Amazon's. The
-- instant is what the freshness check reads.
-- =====================================================================

alter table public.affiliate_offers
  add column if not exists observed_price_at_utc timestamptz;

/*
 * If there is an instant, it has to agree with the day.
 *
 * Otherwise a row could claim it was seen on the 8th at a moment that falls on
 * the 9th, and the two fields would tell different stories to the freshness
 * check and to the reader.
 */
alter table public.affiliate_offers
  drop constraint if exists offers_instant_matches_day;

alter table public.affiliate_offers
  add constraint offers_instant_matches_day check (
    observed_price_at_utc is null
    or observed_price_at is null
    or (observed_price_at_utc at time zone 'UTC')::date = observed_price_at
  );

-- An instant in the future is not an observation.
alter table public.affiliate_offers
  drop constraint if exists offers_instant_not_future;

alter table public.affiliate_offers
  add constraint offers_instant_not_future check (
    observed_price_at_utc is null or observed_price_at_utc <= now() + interval '1 minute'
  );

comment on column public.affiliate_offers.observed_price_at_utc is
  'Instante exacto de observación. Obligatorio para comerciantes cuya licencia mide la caché en horas (Amazon: 24 h).';

grant select, insert, update on public.affiliate_offers to autocraw_ingest;
