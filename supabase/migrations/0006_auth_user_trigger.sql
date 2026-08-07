-- =====================================================================
-- Free AI Radar — connect handle_new_user to auth.users
--
-- Found by the HTTP suite, and by nothing before it.
--
-- 0001 defines `public.handle_new_user()`, comments it carefully, and never
-- attaches it to anything. The function sat in the schema, correct and
-- unreachable, while `auth` contained no triggers at all.
--
-- What that means in practice: GoTrue creates the `auth.users` row and no
-- `profiles` row is ever created. Sign-in appears to work — `current_role()`
-- falls back to 'user' through its coalesce — and then every page that reads a
-- profile comes back empty. Favourites, lists, alerts, notification
-- preferences: all of them hang off a row that does not exist. The account
-- area would have been broken for every user, from the first one.
--
-- Why the SQL suite could not find it: its fixtures insert into `profiles`
-- directly, because they need identities to attack and not identities to sign
-- in with. It tested the policies on rows it created itself. Only a real
-- sign-up through GoTrue exercises the path where the row is supposed to
-- appear on its own — which is the entire argument for the HTTP layer having
-- its own suite.
-- =====================================================================

/*
 * `security definer` because the trigger runs as whoever GoTrue authenticated
 * as, which has no rights on `public.profiles`. The search_path is pinned for
 * the usual reason: a definer function that resolves names through a
 * caller-controlled path is a privilege escalation waiting for someone to add
 * an unqualified call to it.
 *
 * Re-declared here rather than assumed, so this migration is self-contained
 * and the function and its trigger cannot drift apart again.
 */
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(new.raw_user_meta_data->>'display_name', ''))
  on conflict (id) do nothing;

  insert into public.notification_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

/*
 * Identities that already exist without a profile.
 *
 * On a fresh staging database this touches nothing. It matters the day this
 * migration reaches an environment where people signed up while the trigger
 * was missing: without it, those accounts stay broken forever and the only
 * symptom is an empty page.
 */
insert into public.profiles (id, display_name)
select u.id, nullif(u.raw_user_meta_data->>'display_name', '')
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

insert into public.notification_preferences (user_id)
select u.id
from auth.users u
where not exists (
  select 1 from public.notification_preferences n where n.user_id = u.id
);
