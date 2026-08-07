-- =====================================================================
-- Free AI Radar — RLS hardening
--
-- Fixes found by reading 0002 adversarially, before any of it ran against a
-- real database. The suite that reproduces each one is in
-- `supabase/tests/rls_adversarial.sql`; the write-up is in
-- `docs/rls-staging-evidence.md`.
-- =====================================================================

-- ---------------------------------------------------------------------
-- RLS-01 (critical) — a user could promote themselves to admin
--
-- 0002 says, in a comment: "A user must never be able to promote themselves.
-- Role changes go through the service role in the admin API." Nothing enforced
-- it. The policy was:
--
--   create policy "profiles: update own" on public.profiles for update
--     using (id = auth.uid()) with check (id = auth.uid());
--
-- Both clauses only constrain *which row* is written, never *which columns*.
-- So this succeeded:
--
--   update public.profiles set role = 'admin' where id = auth.uid();
--
-- and from there every is_admin() policy opened: reading every profile,
-- reading audit_logs, rewriting subscription plans.
--
-- Two independent layers, because one of them will eventually be edited by
-- someone who does not know about the other:
--
--   1. Column-level grants. `authenticated` may update the four columns that
--      are genuinely the user's own, and no others. This is the primary
--      defence and it fails closed on any column added later — a new column is
--      not writable until someone grants it deliberately.
--   2. A trigger comparing OLD and NEW. A WITH CHECK clause cannot see OLD, so
--      it cannot express "this value must not have changed"; a trigger can,
--      and it also covers writers that arrive through some future policy.
-- ---------------------------------------------------------------------

revoke update on public.profiles from authenticated;

grant update (display_name, avatar_url, locale, interests, onboarded_at)
  on public.profiles to authenticated;

create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The service role and admins may change roles. Nobody else may, including
  -- the owner of the row.
  if new.role is distinct from old.role then
    if not (public.is_admin() or auth.uid() is null) then
      raise exception 'No puedes cambiar tu propio rol.'
        using errcode = '42501';
    end if;
  end if;

  -- The primary key is the link to auth.users. Moving it would let a row be
  -- reparented onto another identity.
  if new.id is distinct from old.id then
    raise exception 'El identificador de un perfil no se puede cambiar.'
      using errcode = '42501';
  end if;

  return new;
end $$;

drop trigger if exists profiles_guard_privileges on public.profiles;
create trigger profiles_guard_privileges
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();

-- ---------------------------------------------------------------------
-- RLS-02 (high) — `is_staff` and `is_admin` had no fixed search_path
--
-- `public.current_role()` is SECURITY DEFINER and pins its search_path.
-- The two helpers that wrap it did not. They fully qualify their call, so
-- there was no exploitable path today, but a SECURITY DEFINER function without
-- a pinned search_path is one refactor away from being one: the moment
-- somebody writes an unqualified call inside it, a caller-controlled
-- search_path decides which function runs.
--
-- Pinning it costs nothing and removes the class.
-- ---------------------------------------------------------------------

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

-- ---------------------------------------------------------------------
-- RLS-03 (medium) — a user could delete their profile and keep their session
--
-- `profiles: admin deletes` allowed `id = auth.uid()`. Deleting the profile row
-- does not delete the `auth.users` row, so the session stayed valid while
-- `current_role()` fell back to its `coalesce(..., 'user')` default. The
-- account still existed and still worked, minus its record.
--
-- GDPR erasure has to remove the identity, which only the service role can do.
-- So the self-delete path is closed and replaced with a soft-delete the user
-- *can* perform, with the real erasure done server-side.
-- ---------------------------------------------------------------------

drop policy if exists "profiles: admin deletes" on public.profiles;

create policy "profiles: admin deletes"
  on public.profiles for delete
  using (public.is_admin());

grant update (deleted_at) on public.profiles to authenticated;

-- ---------------------------------------------------------------------
-- RLS-04 (medium) — soft-deleted profiles stayed fully readable
--
-- Nothing consulted `deleted_at`. An account marked for erasure kept serving
-- its display name and avatar to staff queries and to any join that reached
-- it, for as long as the row survived.
-- ---------------------------------------------------------------------

drop policy if exists "profiles: read own" on public.profiles;

create policy "profiles: read own"
  on public.profiles for select
  using (
    (id = auth.uid() and deleted_at is null)
    or public.is_admin()
  );

-- ---------------------------------------------------------------------
-- RLS-05 (medium) — public lists exposed their owner's identity
--
-- `user_lists: read own or public` let anybody read a public list, including
-- its `user_id`. Joined against `profiles`, that is a name attached to a
-- reading history. Lists are a sharing feature, not an identity one.
--
-- The row still carries `user_id` because ownership has to be enforceable;
-- what changes is that reading someone's *profile* is no longer possible just
-- because they published a list — RLS-04 already restricts profile reads to
-- self and admin.
--
-- This policy additionally hides lists whose owner is being erased.
-- ---------------------------------------------------------------------

drop policy if exists "user_lists: read own or public" on public.user_lists;

create policy "user_lists: read own or public"
  on public.user_lists for select
  using (
    user_id = auth.uid()
    or (
      is_public = true
      and not exists (
        select 1 from public.profiles p
        where p.id = user_id and p.deleted_at is not null
      )
    )
  );

-- ---------------------------------------------------------------------
-- RLS-06 (low) — anonymous submissions could not be rate-limited by owner
--
-- `with check (submitted_by is null or submitted_by = auth.uid())` let a
-- signed-in user write `submitted_by = null`, detaching their own submission
-- from themselves. Harmless for abuse (the app rate-limits by IP), but it
-- meant "read own" could never show it back to them, and an audit could not
-- attribute it. A signed-in writer must now own what they write.
-- ---------------------------------------------------------------------

drop policy if exists "tool_submissions: anyone may submit" on public.tool_submissions;

create policy "tool_submissions: anyone may submit"
  on public.tool_submissions for insert
  with check (
    (auth.uid() is null and submitted_by is null)
    or submitted_by = auth.uid()
  );

drop policy if exists "tool_corrections: anyone may report" on public.tool_corrections;

create policy "tool_corrections: anyone may report"
  on public.tool_corrections for insert
  with check (
    (auth.uid() is null and reported_by is null)
    or reported_by = auth.uid()
  );

-- ---------------------------------------------------------------------
-- RLS-07 (low) — audit rows could be inserted by anyone authenticated
--
-- `audit_logs` had a SELECT policy for admins and no INSERT policy, which
-- denies inserts through the API. That is correct, but it was correct by
-- omission. Stating it makes the intent survive somebody "fixing" the missing
-- policy later.
-- ---------------------------------------------------------------------

comment on table public.audit_logs is
  'Sólo escribe el service role. La ausencia de política de INSERT es deliberada: append-only desde la API.';

comment on table public.processed_webhook_events is
  'Sin ninguna política. Sólo service role. No añadir políticas aquí.';
