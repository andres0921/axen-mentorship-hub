-- Minimal emulation of the pieces of a Supabase database that schema.sql and
-- the migrations rely on. Used ONLY by scripts/test-rls.sh against a throwaway
-- local Postgres. Never run this against the real project.
--
-- Emulates:
--   * API roles anon / authenticated / service_role (service_role bypasses RLS)
--   * auth.users, auth.uid(), auth.role(), auth.jwt() reading request.jwt.claims
--   * Supabase's default privileges: new tables/functions in `public` are
--     granted to anon, authenticated and service_role automatically. This makes
--     the tests stricter: every migration must revoke what it doesn't want.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end;
$$;

-- Supabase keeps extensions out of public.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists auth;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  raw_app_meta_data  jsonb not null default '{}'::jsonb,
  banned_until       timestamptz,
  email_confirmed_at timestamptz,
  created_at         timestamptz not null default now()
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ), '')::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.role', true),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
    ), '')::text
$$;

create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
grant all on auth.users to service_role;

grant usage on schema public to anon, authenticated, service_role;

-- Supabase-style default privileges for objects created by postgres in public.
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
