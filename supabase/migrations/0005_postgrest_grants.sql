-- =====================================================================
-- Free AI Radar — the grants PostgREST needs
--
-- Found by running against a real Supabase project, and invisible before that.
--
-- 0001–0004 create tables, enable RLS and write 81 policies, and never grant a
-- single table privilege to `anon`, `authenticated` or `service_role`. The
-- assumption was that Supabase's default privileges would supply them. They do
-- not, for tables a migration creates: on the real project every one of those
-- roles had REFERENCES, TRIGGER and TRUNCATE and nothing else.
--
-- The consequence is total. PostgREST connects as `anon` or `authenticated`,
-- so every request the application makes — reading the catalogue, saving a
-- favourite, signing in — would come back `permission denied for table ...`,
-- and **RLS would never be consulted at all**. The policies would be perfect
-- and irrelevant.
--
-- The local preflight could not have caught it. Its shim ran
-- `alter default privileges ... grant all ... to anon, authenticated,
-- service_role` while setting up, which is precisely the grant the real
-- project was missing. The harness built the thing production lacked and then
-- reported that everything worked.
--
-- ---------------------------------------------------------------------
-- On granting broadly
--
-- This looks like the `grant all` pattern that migration 0004 exists to defend
-- against, and the difference is worth stating rather than assuming.
--
-- Supabase's model is: grant table privileges to the request roles, and let
-- RLS decide row by row. That only holds if RLS is genuinely on everywhere —
-- `npm run staging:verify` asserts zero tables without it, and reports 0 of
-- 36. Given that, a grant is permission to *ask*; the policy still answers.
--
-- What made the earlier incident dangerous was ordering: a blanket grant run
-- *after* 0004 silently undid its column-level revoke. So the revoke is
-- re-applied at the end of this file, explicitly, where anyone editing can see
-- it must stay last.
-- =====================================================================

grant usage on schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- Reads
--
-- Every request role may ask. Deny-by-default RLS decides what comes back:
-- anonymous visitors see published tools and nothing else, a signed-in user
-- sees their own rows, staff see the queue.
-- ---------------------------------------------------------------------

grant select on all tables in schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- Writes
--
-- `anon` gets INSERT and nothing more. The only thing an anonymous visitor may
-- write is a tool submission or a correction, both gated by policies that
-- require `submitted_by`/`reported_by` to be null for an anonymous writer.
--
-- It gets no UPDATE and no DELETE anywhere. Supabase's own default would hand
-- it both and rely entirely on policy; withholding them costs nothing, and it
-- means a policy mistake on a table nobody thought about cannot become an
-- anonymous write.
-- ---------------------------------------------------------------------

grant insert on all tables in schema public to anon;

grant insert, update, delete on all tables in schema public to authenticated, service_role;

grant usage, select on all sequences in schema public to anon, authenticated, service_role;

grant execute on all functions in schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- Tables created later
--
-- Without this, the next migration to add a table reintroduces exactly the bug
-- this file fixes, and it would be just as invisible.
-- ---------------------------------------------------------------------

alter default privileges in schema public
  grant select on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant insert on tables to anon;
alter default privileges in schema public
  grant insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- Re-apply the column defence — this must stay last
--
-- `grant update on all tables` above includes `profiles`, which would hand
-- `authenticated` the `role` column back and reopen the privilege escalation
-- that 0004 closed. The trigger would still catch it, which is the entire
-- argument for having two layers, but a defence that only half exists is not
-- one we should ship.
--
-- `staging:verify` asserts this held: it fails if `authenticated` can write
-- `profiles.role`.
-- ---------------------------------------------------------------------

revoke update on public.profiles from authenticated;

grant update (display_name, avatar_url, locale, interests, onboarded_at, deleted_at)
  on public.profiles to authenticated;

-- `auth.users` stays untouched. GoTrue owns it, only the Admin API deletes an
-- identity, and nothing in this schema should be able to reach it directly.
