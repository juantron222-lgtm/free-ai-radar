-- =====================================================================
-- Free AI Radar — Row Level Security
--
-- Model:
--   * Everything is deny-by-default. RLS is enabled on every table.
--   * Anonymous visitors can read published editorial content and nothing else.
--   * A signed-in user can read and write ONLY rows where user_id = auth.uid().
--   * Editors can manage editorial content. Admins can additionally manage
--     users, billing records and audit.
--   * The service role bypasses RLS by design; it is used only by server-side
--     code that has already authorised the caller (webhooks, cron, admin API).
-- =====================================================================

alter table public.profiles                 enable row level security;
alter table public.categories               enable row level security;
alter table public.tools                    enable row level security;
alter table public.tool_versions            enable row level security;
alter table public.tool_updates             enable row level security;
alter table public.editorial_reviews        enable row level security;
alter table public.tool_submissions         enable row level security;
alter table public.tool_corrections         enable row level security;
alter table public.accuracy_votes           enable row level security;
alter table public.user_favorites           enable row level security;
alter table public.user_tool_states         enable row level security;
alter table public.user_lists               enable row level security;
alter table public.user_list_items          enable row level security;
alter table public.saved_comparisons        enable row level security;
alter table public.followed_categories      enable row level security;
alter table public.view_history             enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.alerts                   enable row level security;
alter table public.newsletter_subscriptions enable row level security;
alter table public.email_log                enable row level security;
alter table public.subscription_plans       enable row level security;
alter table public.user_subscriptions       enable row level security;
alter table public.processed_webhook_events enable row level security;
alter table public.affiliate_programs       enable row level security;
alter table public.affiliate_links          enable row level security;
alter table public.sponsored_placements     enable row level security;
alter table public.audit_logs               enable row level security;
alter table public.product_events           enable row level security;

-- ---------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------

create policy "profiles: read own"
  on public.profiles for select
  using (id = auth.uid() or public.is_staff());

create policy "profiles: update own"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- A user must never be able to promote themselves. Role changes go through the
-- service role in the admin API, which logs to audit_logs.
create policy "profiles: admin manages roles"
  on public.profiles for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "profiles: admin deletes"
  on public.profiles for delete
  using (public.is_admin() or id = auth.uid());

-- ---------------------------------------------------------------------
-- Editorial content: public read of published rows only
-- ---------------------------------------------------------------------

create policy "categories: public read"
  on public.categories for select using (true);

create policy "categories: staff writes"
  on public.categories for all
  using (public.is_staff()) with check (public.is_staff());

create policy "tools: public reads published"
  on public.tools for select
  using (status = 'published' or public.is_staff());

create policy "tools: staff writes"
  on public.tools for all
  using (public.is_staff()) with check (public.is_staff());

create policy "tool_versions: staff only"
  on public.tool_versions for all
  using (public.is_staff()) with check (public.is_staff());

create policy "tool_updates: public read for published tools"
  on public.tool_updates for select
  using (
    public.is_staff()
    or exists (select 1 from public.tools t where t.id = tool_id and t.status = 'published')
  );

create policy "tool_updates: staff writes"
  on public.tool_updates for all
  using (public.is_staff()) with check (public.is_staff());

create policy "editorial_reviews: public read for published tools"
  on public.editorial_reviews for select
  using (
    public.is_staff()
    or exists (select 1 from public.tools t where t.id = tool_id and t.status = 'published')
  );

create policy "editorial_reviews: staff writes"
  on public.editorial_reviews for all
  using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------
-- Community input: write-only for the public, readable by staff
-- ---------------------------------------------------------------------

create policy "tool_submissions: anyone may submit"
  on public.tool_submissions for insert
  with check (submitted_by is null or submitted_by = auth.uid());

create policy "tool_submissions: read own or staff"
  on public.tool_submissions for select
  using (submitted_by = auth.uid() or public.is_staff());

create policy "tool_submissions: staff manages"
  on public.tool_submissions for update
  using (public.is_staff()) with check (public.is_staff());

create policy "tool_corrections: anyone may report"
  on public.tool_corrections for insert
  with check (reported_by is null or reported_by = auth.uid());

create policy "tool_corrections: read own or staff"
  on public.tool_corrections for select
  using (reported_by = auth.uid() or public.is_staff());

create policy "tool_corrections: staff manages"
  on public.tool_corrections for update
  using (public.is_staff()) with check (public.is_staff());

create policy "accuracy_votes: own rows"
  on public.accuracy_votes for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "accuracy_votes: staff reads all"
  on public.accuracy_votes for select using (public.is_staff());

-- ---------------------------------------------------------------------
-- User-owned data: strictly own rows
-- ---------------------------------------------------------------------

create policy "user_favorites: own rows"
  on public.user_favorites for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "user_tool_states: own rows"
  on public.user_tool_states for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Lists are private unless the owner publishes them.
create policy "user_lists: read own or public"
  on public.user_lists for select
  using (user_id = auth.uid() or is_public = true);

create policy "user_lists: write own"
  on public.user_lists for insert with check (user_id = auth.uid());
create policy "user_lists: update own"
  on public.user_lists for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "user_lists: delete own"
  on public.user_lists for delete using (user_id = auth.uid());

create policy "user_list_items: read via parent list"
  on public.user_list_items for select
  using (exists (
    select 1 from public.user_lists l
    where l.id = list_id and (l.user_id = auth.uid() or l.is_public = true)
  ));

create policy "user_list_items: write via own list"
  on public.user_list_items for all
  using (exists (select 1 from public.user_lists l where l.id = list_id and l.user_id = auth.uid()))
  with check (exists (select 1 from public.user_lists l where l.id = list_id and l.user_id = auth.uid()));

create policy "saved_comparisons: own rows"
  on public.saved_comparisons for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "followed_categories: own rows"
  on public.followed_categories for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "view_history: own rows"
  on public.view_history for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "notification_preferences: own rows"
  on public.notification_preferences for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "alerts: own rows"
  on public.alerts for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Newsletter: no client access at all.
--
-- Email addresses are enumerable identifiers. Every read and write goes
-- through server endpoints using the service role, which rate-limit and
-- verify tokens. There is deliberately no permissive policy here.
-- ---------------------------------------------------------------------

create policy "newsletter: staff reads"
  on public.newsletter_subscriptions for select using (public.is_staff());

create policy "email_log: staff reads"
  on public.email_log for select using (public.is_staff());

-- ---------------------------------------------------------------------
-- Monetisation
-- ---------------------------------------------------------------------

create policy "subscription_plans: public read of active plans"
  on public.subscription_plans for select
  using (is_active = true or public.is_staff());

create policy "subscription_plans: admin writes"
  on public.subscription_plans for all
  using (public.is_admin()) with check (public.is_admin());

-- A user may read their subscription but never write it. Only Stripe webhooks
-- (service role) may change billing state.
create policy "user_subscriptions: read own"
  on public.user_subscriptions for select
  using (user_id = auth.uid() or public.is_admin());

create policy "affiliate_programs: staff only"
  on public.affiliate_programs for all
  using (public.is_staff()) with check (public.is_staff());

create policy "affiliate_links: public read of active"
  on public.affiliate_links for select
  using (is_active = true or public.is_staff());

create policy "affiliate_links: staff writes"
  on public.affiliate_links for all
  using (public.is_staff()) with check (public.is_staff());

create policy "sponsored_placements: public read of live"
  on public.sponsored_placements for select
  using ((is_active = true and current_date between starts_on and ends_on) or public.is_staff());

create policy "sponsored_placements: staff writes"
  on public.sponsored_placements for all
  using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------
-- Audit and analytics
-- ---------------------------------------------------------------------

-- Audit is append-only from the application's point of view: no update, no
-- delete policy exists, so not even an admin can rewrite history via the API.
create policy "audit_logs: admin reads"
  on public.audit_logs for select using (public.is_admin());

create policy "product_events: staff reads"
  on public.product_events for select using (public.is_staff());

-- processed_webhook_events has no policy at all: service role only.
