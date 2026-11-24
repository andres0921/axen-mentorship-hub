-- AXEN Mentorship Hub — Supabase schema
--
-- Run this once in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- It is idempotent: tables/indexes are created only if missing and policies are
-- dropped and recreated, so it is safe to re-run.
-- Caveat: `create table if not exists` will NOT add new columns or change
-- constraints on a table that already exists; schema changes to existing
-- tables need explicit `alter table` statements.
--
-- Every table is owned per-mentor via user_id (defaults to auth.uid()), has Row
-- Level Security enabled, and has own-row SELECT/INSERT/UPDATE/DELETE policies.
-- Child tables additionally require that the referenced mentee belongs to the
-- same user, so one mentor can't attach records to another mentor's mentee.

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at current
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- mentees
-- ---------------------------------------------------------------------------
create table if not exists public.mentees (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  full_name          text not null,
  email              text,
  phone              text,
  program_start_date date,
  current_stage      int check (current_stage between 1 and 4),
  status             text not null default 'active'
                       check (status in ('active', 'paused', 'escalated', 'graduated', 'dropped')),
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists mentees_user_id_idx on public.mentees (user_id);

drop trigger if exists mentees_set_updated_at on public.mentees;
create trigger mentees_set_updated_at
  before update on public.mentees
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- check_ins
-- ---------------------------------------------------------------------------
create table if not exists public.check_ins (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  mentee_id                uuid not null references public.mentees (id) on delete cascade,
  check_in_number          int,
  date                     date not null default current_date,
  stage_at_time            int,
  meeting_format           text,
  lead_generation_activity int check (lead_generation_activity between 1 and 5),
  light_speed_vt_progress  int check (light_speed_vt_progress between 1 and 5),
  lofty_crm_usage          int check (lofty_crm_usage between 1 and 5),
  transactions_in_pipeline int check (transactions_in_pipeline >= 0),
  total_closed             int check (total_closed >= 0),
  general_assessment_notes text,
  specific_direction_given text,
  prior_commitment_status  text check (prior_commitment_status in ('yes', 'partial', 'not')),
  verification_notes       text,
  topics_discussed         text,
  key_coaching_points      text,
  student_commitment       text,
  commitment_due_date      date,
  escalation_flag          boolean not null default false,
  escalation_notes         text,
  next_check_in_date       date,
  next_check_in_format     text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists check_ins_user_id_idx   on public.check_ins (user_id);
create index if not exists check_ins_mentee_id_idx on public.check_ins (mentee_id);

drop trigger if exists check_ins_set_updated_at on public.check_ins;
create trigger check_ins_set_updated_at
  before update on public.check_ins
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- escalations
-- ---------------------------------------------------------------------------
create table if not exists public.escalations (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null default auth.uid() references auth.users (id) on delete cascade,
  mentee_id             uuid not null references public.mentees (id) on delete cascade,
  date_of_submission    date not null default current_date,
  student_program_stage text,
  escalation_type       text not null,
  situation_summary     text not null,
  actions_already_taken text[] not null default '{}',
  recommended_next_step text,
  additional_context    text,
  status                text not null default 'submitted',
  created_at            timestamptz not null default now()
);

create index if not exists escalations_user_id_idx   on public.escalations (user_id);
create index if not exists escalations_mentee_id_idx on public.escalations (mentee_id);

-- ---------------------------------------------------------------------------
-- graduation_recommendations
-- closed_transactions: JSON array of
--   { propertyAddress, closeDate, salePrice, skySlopeFileNumber }
-- ---------------------------------------------------------------------------
create table if not exists public.graduation_recommendations (
  id                              uuid primary key default gen_random_uuid(),
  user_id                         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  mentee_id                       uuid not null references public.mentees (id) on delete cascade,
  date_of_submission              date not null default current_date,
  program_start_date              date,
  closed_transactions_confirmed   boolean not null default false,
  light_speed_vt_completed        boolean not null default false,
  nexa_lending_connected          boolean not null default false,
  lofty_crm_proficient            boolean not null default false,
  mentor_recommends               boolean not null default false,
  closed_transactions             jsonb not null default '[]'::jsonb,
  mentor_recommendation_statement text,
  status                          text not null default 'submitted',
  created_at                      timestamptz not null default now()
);

create index if not exists graduation_recommendations_user_id_idx   on public.graduation_recommendations (user_id);
create index if not exists graduation_recommendations_mentee_id_idx on public.graduation_recommendations (mentee_id);

-- ---------------------------------------------------------------------------
-- mentor_feedback
-- ---------------------------------------------------------------------------
create table if not exists public.mentor_feedback (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null default auth.uid() references auth.users (id) on delete cascade,
  mentee_id             uuid not null references public.mentees (id) on delete cascade,
  date                  date not null default current_date,
  feedback_type         text not null default 'general',
  strengths             text,
  areas_for_improvement text,
  specific_observations text,
  recommended_actions   text,
  overall_rating        int check (overall_rating between 1 and 5),
  private_notes         text,
  created_at            timestamptz not null default now()
);

create index if not exists mentor_feedback_user_id_idx   on public.mentor_feedback (user_id);
create index if not exists mentor_feedback_mentee_id_idx on public.mentor_feedback (mentee_id);

-- ---------------------------------------------------------------------------
-- kickoff_sessions
-- ---------------------------------------------------------------------------
create table if not exists public.kickoff_sessions (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null default auth.uid() references auth.users (id) on delete cascade,
  mentee_id               uuid not null references public.mentees (id) on delete cascade,
  date_time               timestamptz,
  meeting_link            text,
  student_why_notes       text,
  expectations_notes      text,
  systems_activated       text[] not null default '{}',
  agreed_check_in_cadence text,
  initial_commitment      text,
  next_check_in_date      date,
  created_at              timestamptz not null default now()
);

create index if not exists kickoff_sessions_user_id_idx   on public.kickoff_sessions (user_id);
create index if not exists kickoff_sessions_mentee_id_idx on public.kickoff_sessions (mentee_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.mentees                    enable row level security;
alter table public.check_ins                  enable row level security;
alter table public.escalations                enable row level security;
alter table public.graduation_recommendations enable row level security;
alter table public.mentor_feedback            enable row level security;
alter table public.kickoff_sessions           enable row level security;

-- mentees: own rows only
drop policy if exists "mentees_select_own" on public.mentees;
drop policy if exists "mentees_insert_own" on public.mentees;
drop policy if exists "mentees_update_own" on public.mentees;
drop policy if exists "mentees_delete_own" on public.mentees;

create policy "mentees_select_own" on public.mentees
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "mentees_insert_own" on public.mentees
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "mentees_update_own" on public.mentees
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "mentees_delete_own" on public.mentees
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Child tables: own rows only, and the referenced mentee must also be yours.
do $$
declare
  t text;
begin
  foreach t in array array[
    'check_ins',
    'escalations',
    'graduation_recommendations',
    'mentor_feedback',
    'kickoff_sessions'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);

    execute format(
      'create policy %I on public.%I for select to authenticated
         using (user_id = (select auth.uid()))',
      t || '_select_own', t);

    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (
           user_id = (select auth.uid())
           and exists (select 1 from public.mentees m
                       where m.id = mentee_id and m.user_id = (select auth.uid()))
         )',
      t || '_insert_own', t);

    execute format(
      'create policy %I on public.%I for update to authenticated
         using (user_id = (select auth.uid()))
         with check (
           user_id = (select auth.uid())
           and exists (select 1 from public.mentees m
                       where m.id = mentee_id and m.user_id = (select auth.uid()))
         )',
      t || '_update_own', t);

    execute format(
      'create policy %I on public.%I for delete to authenticated
         using (user_id = (select auth.uid()))',
      t || '_delete_own', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Table privileges
-- RLS policies only filter rows; the role also needs table-level privileges.
-- Don't rely on Supabase's default grants (newer projects may not expose new
-- public tables to the API automatically). The browser app only talks to the
-- database as `authenticated`; `anon` gets nothing.
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on
  public.mentees,
  public.check_ins,
  public.escalations,
  public.graduation_recommendations,
  public.mentor_feedback,
  public.kickoff_sessions
to authenticated, service_role;

revoke all on
  public.mentees,
  public.check_ins,
  public.escalations,
  public.graduation_recommendations,
  public.mentor_feedback,
  public.kickoff_sessions
from anon;
