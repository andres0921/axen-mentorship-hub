-- 0001: profiles + roles, private.* helpers, tightened mentor policies.
--
-- Runs on top of supabase/schema.sql. Idempotent (safe to re-run).
-- After this migration:
--   * every auth user has a public.profiles row; role ∈ pending|mentee|mentor|admin
--   * existing auth users are backfilled as 'mentor'; new users start 'pending'
--   * role can only be written by service_role / SQL editor (no column grant)
--   * mentor tables are readable by the mentor of the MENTEE (not the author)
--     and by admins; pending users see nothing.

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        text not null default 'pending'
                check (role in ('pending', 'mentee', 'mentor', 'admin')),
  full_name   text,
  email       text,
  phone       text,
  booking_url text,
  photo_url   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- private schema: helpers that are NOT exposed through the Data API.
-- SECURITY DEFINER so policies can call them without recursive RLS.
-- Role is always read live from public.profiles (never from JWT metadata).
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

-- New auth user -> pending profile.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, lower(new.email), nullif(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Backfill: everyone who already has an account today is a mentor.
-- (Andres sets his own row to 'admin' by hand, see docs/ANDRES_SETUP_STEPS.md.)
insert into public.profiles (id, email, role)
select u.id, lower(u.email), 'mentor'
from auth.users u
on conflict (id) do nothing;

create or replace function private.user_role()
returns text
language sql stable security definer set search_path = ''
as $$
  select p.role from public.profiles p where p.id = (select auth.uid())
$$;

create or replace function private.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select p.role = 'admin' from public.profiles p where p.id = (select auth.uid())), false)
$$;

-- mentors AND admins
create or replace function private.is_mentor()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((select p.role in ('mentor', 'admin') from public.profiles p where p.id = (select auth.uid())), false)
$$;

-- mentees the caller mentors (owns via mentees.user_id)
create or replace function private.mentored_mentee_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select m.id from public.mentees m
  where m.user_id = (select auth.uid()) and private.is_mentor()
$$;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- profiles RLS + grants (0004 widens SELECT so mentors can see their mentees)
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()));

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- No insert/delete policies: rows come from the trigger / service role only.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
-- role / email / id are NOT grantable to API users.
grant update (full_name, phone, booking_url, photo_url, updated_at) on public.profiles to authenticated;
grant all on public.profiles to service_role;

-- ---------------------------------------------------------------------------
-- mentees: replace own-row policies
-- ---------------------------------------------------------------------------
drop policy if exists "mentees_select_own" on public.mentees;
drop policy if exists "mentees_insert_own" on public.mentees;
drop policy if exists "mentees_update_own" on public.mentees;
drop policy if exists "mentees_delete_own" on public.mentees;

drop policy if exists mentees_select on public.mentees;
create policy mentees_select on public.mentees
  for select to authenticated
  using (id in (select private.mentored_mentee_ids()) or (select private.is_admin()));

drop policy if exists mentees_insert on public.mentees;
create policy mentees_insert on public.mentees
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.is_mentor()));

drop policy if exists mentees_update on public.mentees;
create policy mentees_update on public.mentees
  for update to authenticated
  using      ((user_id = (select auth.uid()) and (select private.is_mentor())) or (select private.is_admin()))
  with check ((user_id = (select auth.uid()) and (select private.is_mentor())) or (select private.is_admin()));

drop policy if exists mentees_delete on public.mentees;
create policy mentees_delete on public.mentees
  for delete to authenticated
  using (user_id = (select auth.uid()) and (select private.is_mentor()));

-- ---------------------------------------------------------------------------
-- Mentor-authored child tables: visibility follows the MENTEE (so a mentee
-- reassigned by admin brings their history along), writes stay author-only.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'check_ins', 'escalations', 'graduation_recommendations', 'mentor_feedback', 'kickoff_sessions'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);

    execute format('drop policy if exists %I on public.%I', t || '_select_staff', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (mentee_id in (select private.mentored_mentee_ids()) or (select private.is_admin()))',
      t || '_select_staff', t);

    execute format('drop policy if exists %I on public.%I', t || '_insert_staff', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (user_id = (select auth.uid()) and mentee_id in (select private.mentored_mentee_ids()))',
      t || '_insert_staff', t);

    execute format('drop policy if exists %I on public.%I', t || '_update_author', t);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using (user_id = (select auth.uid()) and (select private.is_mentor()))
         with check (user_id = (select auth.uid()) and mentee_id in (select private.mentored_mentee_ids()))',
      t || '_update_author', t);

    execute format('drop policy if exists %I on public.%I', t || '_delete_author', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated
         using (user_id = (select auth.uid()) and (select private.is_mentor()))',
      t || '_delete_author', t);
  end loop;
end;
$$;

-- Admin (National Director) can work escalations.
drop policy if exists escalations_update_admin on public.escalations;
create policy escalations_update_admin on public.escalations
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
