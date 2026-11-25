-- 0004: mentee portal (MVP).
--
-- Requires 0003 (private columns dropped) — the mentee SELECT policies below
-- would otherwise leak private notes through the REST API.
-- Idempotent (safe to re-run).
--
-- Adds:
--   mentees.mentee_user_id / portal_access (+ column grants so API users can't set them)
--   private.my_mentee_id / my_mentor_id / accessible_mentee_ids / mentored_mentee_user_ids
--   invitations (audit, written by the invite-mentee Edge Function only)
--   shared_with_mentee on check_ins + mentor_feedback (existing rows: false; new rows: true)
--   self_check_ins, help_requests, program_settings
--   graduation approval workflow (status submitted|approved|declined, admin RPC)
--   mentee-safe RPCs

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'check_ins' and column_name = 'general_assessment_notes')
     or exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'mentor_feedback' and column_name in ('private_notes', 'overall_rating'))
     or exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'mentees' and column_name = 'notes') then
    raise exception '0004 requires 0003: private columns still exist on mentees/check_ins/mentor_feedback';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- mentees: link to a mentee login + portal state
-- ---------------------------------------------------------------------------
alter table public.mentees
  add column if not exists mentee_user_id uuid references auth.users (id) on delete set null,
  add column if not exists portal_access  text not null default 'none';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'mentees_mentee_user_id_key') then
    alter table public.mentees add constraint mentees_mentee_user_id_key unique (mentee_user_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'mentees_portal_access_chk') then
    alter table public.mentees add constraint mentees_portal_access_chk
      check (portal_access in ('none', 'invited', 'active', 'revoked'));
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- helpers that depend on mentee_user_id
-- ---------------------------------------------------------------------------
-- null unless the caller is a linked mentee (role read live => revocation is instant)
create or replace function private.my_mentee_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select m.id from public.mentees m
  join public.profiles p on p.id = m.mentee_user_id and p.role = 'mentee'
  where m.mentee_user_id = (select auth.uid())
$$;

create or replace function private.my_mentor_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select m.user_id from public.mentees m where m.id = private.my_mentee_id()
$$;

-- mentor's own, the mentee's own row, or everything (admin)
create or replace function private.accessible_mentee_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select m.id from public.mentees m
  where (m.user_id = (select auth.uid()) and private.is_mentor())
     or m.id = private.my_mentee_id()
     or private.is_admin()
$$;

-- auth user ids of the mentees the caller mentors (for profiles SELECT)
create or replace function private.mentored_mentee_user_ids()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select m.mentee_user_id from public.mentees m
  where m.user_id = (select auth.uid()) and private.is_mentor() and m.mentee_user_id is not null
$$;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- mentees policies / grants
-- ---------------------------------------------------------------------------
drop policy if exists mentees_select on public.mentees;
create policy mentees_select on public.mentees
  for select to authenticated
  using (id in (select private.accessible_mentee_ids()));

revoke all on public.mentees from anon;
revoke insert, update on public.mentees from authenticated;
grant select, delete on public.mentees to authenticated;
grant insert (user_id, full_name, email, phone, program_start_date, current_stage, status)
  on public.mentees to authenticated;
grant update (user_id, full_name, email, phone, program_start_date, current_stage, status, updated_at)
  on public.mentees to authenticated;
-- mentee_user_id / portal_access: no grant. Only service_role + security-definer RPCs.
grant all on public.mentees to service_role;

-- Only the admin (directly or via review_graduation) may set status = 'graduated'.
create or replace function private.guard_mentee_graduation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'graduated'
     and (tg_op = 'INSERT' or old.status is distinct from 'graduated')
     and current_user in ('authenticated', 'anon')
     and not private.is_admin() then
    raise exception 'Only the program admin can mark a mentee graduated (submit a graduation recommendation instead)'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists mentees_guard_graduation on public.mentees;
create trigger mentees_guard_graduation
  before insert or update of status on public.mentees
  for each row execute function private.guard_mentee_graduation();

-- profiles: mentors also see the profiles of their linked mentees
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or id in (select private.mentored_mentee_user_ids())
    or (select private.is_admin())
  );

-- ---------------------------------------------------------------------------
-- invitations (audit; service role writes)
-- ---------------------------------------------------------------------------
create table if not exists public.invitations (
  id           uuid primary key default gen_random_uuid(),
  mentee_id    uuid not null references public.mentees (id) on delete cascade,
  invited_by   uuid not null references auth.users (id) on delete cascade,
  email        text not null,
  auth_user_id uuid references auth.users (id) on delete set null,
  kind         text not null default 'invite' check (kind in ('invite', 'resend', 'existing_user_linked', 'revoke')),
  status       text not null default 'sent' check (status in ('sent', 'accepted', 'revoked', 'failed')),
  last_error   text,
  sent_at      timestamptz not null default now(),
  accepted_at  timestamptz
);
create index if not exists invitations_mentee_id_idx on public.invitations (mentee_id);
create index if not exists invitations_invited_by_sent_at_idx on public.invitations (invited_by, sent_at desc);

alter table public.invitations enable row level security;
drop policy if exists invitations_select on public.invitations;
create policy invitations_select on public.invitations
  for select to authenticated
  using (
    invited_by = (select auth.uid()) and (select private.is_mentor())
    or mentee_id in (select private.mentored_mentee_ids())
    or (select private.is_admin())
  );
revoke all on public.invitations from anon, authenticated;
grant select on public.invitations to authenticated;
grant all on public.invitations to service_role;

-- ---------------------------------------------------------------------------
-- sharing flags. Existing rows are backfilled FALSE (mentors wrote them
-- believing they were private); new rows default TRUE.
-- ---------------------------------------------------------------------------
alter table public.check_ins       add column if not exists shared_with_mentee boolean not null default false;
alter table public.check_ins       alter column shared_with_mentee set default true;
alter table public.mentor_feedback add column if not exists shared_with_mentee boolean not null default false;
alter table public.mentor_feedback alter column shared_with_mentee set default true;
alter table public.mentor_feedback add column if not exists shared_at timestamptz;
alter table public.mentor_feedback add column if not exists mentee_acknowledged_at timestamptz;

create or replace function private.stamp_shared_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.shared_with_mentee and (tg_op = 'INSERT' or not old.shared_with_mentee) then
    new.shared_at = now();
  end if;
  return new;
end;
$$;
drop trigger if exists mentor_feedback_stamp_shared_at on public.mentor_feedback;
create trigger mentor_feedback_stamp_shared_at
  before insert or update of shared_with_mentee on public.mentor_feedback
  for each row execute function private.stamp_shared_at();

-- mentee read policies (only safe because 0003 removed the private columns)
drop policy if exists check_ins_select_mentee on public.check_ins;
create policy check_ins_select_mentee on public.check_ins
  for select to authenticated
  using (shared_with_mentee and mentee_id = (select private.my_mentee_id()));

drop policy if exists mentor_feedback_select_mentee on public.mentor_feedback;
create policy mentor_feedback_select_mentee on public.mentor_feedback
  for select to authenticated
  using (shared_with_mentee and mentee_id = (select private.my_mentee_id()));

drop policy if exists kickoff_sessions_select_mentee on public.kickoff_sessions;
create policy kickoff_sessions_select_mentee on public.kickoff_sessions
  for select to authenticated
  using (mentee_id = (select private.my_mentee_id()));
-- escalations, graduation_recommendations: NO mentee policy, ever.

-- mentee_acknowledged_at is set via RPC only
revoke update on public.mentor_feedback from authenticated;
grant update (date, feedback_type, strengths, areas_for_improvement, specific_observations,
              recommended_actions, shared_with_mentee)
  on public.mentor_feedback to authenticated;

-- ---------------------------------------------------------------------------
-- self_check_ins (mentee-authored, editable until the mentor reviews it)
-- ---------------------------------------------------------------------------
create table if not exists public.self_check_ins (
  id                       uuid primary key default gen_random_uuid(),
  mentee_id                uuid not null references public.mentees (id) on delete cascade,
  submitted_by             uuid not null default auth.uid() references auth.users (id) on delete cascade,
  week_of                  date not null default date_trunc('week', current_date)::date,
  lead_gen_self_score      int check (lead_gen_self_score between 1 and 5),
  vt_self_score            int check (vt_self_score between 1 and 5),
  lofty_self_score         int check (lofty_self_score between 1 and 5),
  conversations_count      int check (conversations_count >= 0),
  appointments_set         int check (appointments_set >= 0),
  transactions_in_pipeline int check (transactions_in_pipeline >= 0),
  total_closed             int check (total_closed >= 0),
  prior_commitment_status  text check (prior_commitment_status in ('yes', 'partial', 'not')),
  prior_commitment_note    text check (char_length(prior_commitment_note) <= 2000),
  wins                     text check (char_length(wins) <= 5000),
  blockers                 text check (char_length(blockers) <= 5000),
  help_needed              boolean not null default false,
  reviewed_at              timestamptz,
  reviewed_by              uuid references auth.users (id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (mentee_id, week_of)
);

drop trigger if exists self_check_ins_set_updated_at on public.self_check_ins;
create trigger self_check_ins_set_updated_at
  before update on public.self_check_ins
  for each row execute function public.set_updated_at();

alter table public.self_check_ins enable row level security;

drop policy if exists sci_select on public.self_check_ins;
create policy sci_select on public.self_check_ins
  for select to authenticated
  using (mentee_id in (select private.accessible_mentee_ids()));

drop policy if exists sci_insert_mentee on public.self_check_ins;
create policy sci_insert_mentee on public.self_check_ins
  for insert to authenticated
  with check (mentee_id = (select private.my_mentee_id()) and submitted_by = (select auth.uid())
              and reviewed_at is null);

drop policy if exists sci_update_mentee on public.self_check_ins;
create policy sci_update_mentee on public.self_check_ins
  for update to authenticated
  using      (submitted_by = (select auth.uid()) and mentee_id = (select private.my_mentee_id()) and reviewed_at is null)
  with check (submitted_by = (select auth.uid()) and mentee_id = (select private.my_mentee_id()) and reviewed_at is null);

revoke all on public.self_check_ins from anon, authenticated;
grant select on public.self_check_ins to authenticated;
grant insert (mentee_id, week_of, lead_gen_self_score, vt_self_score, lofty_self_score, conversations_count,
              appointments_set, transactions_in_pipeline, total_closed, prior_commitment_status,
              prior_commitment_note, wins, blockers, help_needed)
  on public.self_check_ins to authenticated;
grant update (lead_gen_self_score, vt_self_score, lofty_self_score, conversations_count, appointments_set,
              transactions_in_pipeline, total_closed, prior_commitment_status, prior_commitment_note,
              wins, blockers, help_needed, updated_at)
  on public.self_check_ins to authenticated;
grant all on public.self_check_ins to service_role;

-- ---------------------------------------------------------------------------
-- help_requests
-- ---------------------------------------------------------------------------
create table if not exists public.help_requests (
  id              uuid primary key default gen_random_uuid(),
  mentee_id       uuid not null references public.mentees (id) on delete cascade,
  created_by      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category        text not null check (category in ('transaction', 'compliance_legal', 'systems_access', 'personal', 'other')),
  urgency         text not null default 'normal' check (urgency in ('normal', 'urgent')),
  message         text not null check (char_length(message) between 1 and 5000),
  status          text not null default 'open' check (status in ('open', 'acknowledged', 'resolved', 'escalated', 'cancelled')),
  mentor_response text check (char_length(mentor_response) <= 5000),
  escalation_id   uuid references public.escalations (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists help_requests_mentee_id_idx on public.help_requests (mentee_id);

drop trigger if exists help_requests_set_updated_at on public.help_requests;
create trigger help_requests_set_updated_at
  before update on public.help_requests
  for each row execute function public.set_updated_at();

alter table public.help_requests enable row level security;

drop policy if exists hr_select on public.help_requests;
create policy hr_select on public.help_requests
  for select to authenticated
  using (mentee_id in (select private.accessible_mentee_ids()));

drop policy if exists hr_insert_mentee on public.help_requests;
create policy hr_insert_mentee on public.help_requests
  for insert to authenticated
  with check (mentee_id = (select private.my_mentee_id()) and created_by = (select auth.uid())
              and status = 'open' and mentor_response is null and escalation_id is null);

drop policy if exists hr_update_staff on public.help_requests;
create policy hr_update_staff on public.help_requests
  for update to authenticated
  using      (mentee_id in (select private.mentored_mentee_ids()) or (select private.is_admin()))
  with check (mentee_id in (select private.mentored_mentee_ids()) or (select private.is_admin()));

revoke all on public.help_requests from anon, authenticated;
grant select on public.help_requests to authenticated;
grant insert (mentee_id, category, urgency, message) on public.help_requests to authenticated;
grant update (status, mentor_response, escalation_id, updated_at) on public.help_requests to authenticated;
grant all on public.help_requests to service_role;

-- ---------------------------------------------------------------------------
-- program_settings: ONE row, admin-editable. Clients read it and fall back to
-- src/shared/config.js (PROGRAM). Values are NOT yet confirmed by Andres.
-- ---------------------------------------------------------------------------
create table if not exists public.program_settings (
  id                         smallint primary key default 1 check (id = 1),
  stage_count                int not null default 4 check (stage_count between 1 and 10),
  stage_targets              jsonb not null default '{"1": 2, "2": 4, "3": 8, "4": 12}'::jsonb,
  graduation_closed_required int not null default 4 check (graduation_closed_required >= 0),
  graduation_score_threshold int not null default 4 check (graduation_score_threshold between 1 and 5),
  updated_at                 timestamptz not null default now(),
  updated_by                 uuid references auth.users (id) on delete set null
);
insert into public.program_settings (id) values (1) on conflict (id) do nothing;

-- Single DB source for graduation numbers (used by get_my_graduation_progress).
create or replace function private.program_value(p_key text, p_default int)
returns int
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select case p_key
              when 'graduation_closed_required' then s.graduation_closed_required
              when 'graduation_score_threshold' then s.graduation_score_threshold
            end
     from public.program_settings s where s.id = 1),
    p_default)
$$;

revoke all on function private.program_value(text, int) from public, anon;
grant execute on function private.program_value(text, int) to authenticated, service_role;

drop trigger if exists program_settings_set_updated_at on public.program_settings;
create trigger program_settings_set_updated_at
  before update on public.program_settings
  for each row execute function public.set_updated_at();

alter table public.program_settings enable row level security;
drop policy if exists program_settings_select on public.program_settings;
create policy program_settings_select on public.program_settings
  for select to authenticated
  using ((select private.user_role()) in ('mentee', 'mentor', 'admin'));
drop policy if exists program_settings_update_admin on public.program_settings;
create policy program_settings_update_admin on public.program_settings
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

revoke all on public.program_settings from anon, authenticated;
grant select on public.program_settings to authenticated;
grant update (stage_count, stage_targets, graduation_closed_required, graduation_score_threshold, updated_at, updated_by)
  on public.program_settings to authenticated;
grant all on public.program_settings to service_role;

-- ---------------------------------------------------------------------------
-- graduation workflow: submitted -> approved | declined (admin only)
-- ---------------------------------------------------------------------------
alter table public.graduation_recommendations
  add column if not exists reviewed_by uuid references auth.users (id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'graduation_status_chk') then
    -- Before this change, submitting a recommendation auto-graduated the mentee,
    -- so recs for mentees who are already graduated count as approved.
    update public.graduation_recommendations g
       set status = 'approved'
     where g.status = 'submitted'
       and exists (select 1 from public.mentees m where m.id = g.mentee_id and m.status = 'graduated');
    update public.graduation_recommendations
       set status = 'submitted'
     where status not in ('submitted', 'approved', 'declined');
    alter table public.graduation_recommendations
      add constraint graduation_status_chk check (status in ('submitted', 'approved', 'declined'));
  end if;
end;
$$;
alter table public.graduation_recommendations alter column status set default 'submitted';

-- mentors can't set status/review columns; review goes through review_graduation()
revoke insert, update on public.graduation_recommendations from authenticated;
grant insert (user_id, mentee_id, date_of_submission, program_start_date, closed_transactions_confirmed,
              light_speed_vt_completed, nexa_lending_connected, lofty_crm_proficient, mentor_recommends,
              closed_transactions, mentor_recommendation_statement)
  on public.graduation_recommendations to authenticated;
grant update (date_of_submission, program_start_date, closed_transactions_confirmed,
              light_speed_vt_completed, nexa_lending_connected, lofty_crm_proficient, mentor_recommends,
              closed_transactions, mentor_recommendation_statement)
  on public.graduation_recommendations to authenticated;

-- ---------------------------------------------------------------------------
-- explicit grants on pre-existing tables (anon gets nothing)
-- ---------------------------------------------------------------------------
revoke all on public.check_ins, public.escalations, public.graduation_recommendations,
              public.mentor_feedback, public.kickoff_sessions from anon;
grant all on public.check_ins, public.escalations, public.graduation_recommendations,
             public.mentor_feedback, public.kickoff_sessions to service_role;

-- ---------------------------------------------------------------------------
-- RPCs (SECURITY DEFINER, search_path = '', authenticated only)
-- ---------------------------------------------------------------------------

-- Mentee: who is my mentor?
create or replace function public.get_my_mentor()
returns table (full_name text, email text, phone text, booking_url text, photo_url text)
language sql stable security definer set search_path = ''
as $$
  select p.full_name, p.email, p.phone, p.booking_url, p.photo_url
  from public.profiles p
  where p.id = private.my_mentor_id()
$$;

-- Mentee: graduation progress. Booleans/counts only, never the statement.
-- Uses the latest SHARED check-in (consistent with what the mentee can see).
create or replace function public.get_my_graduation_progress()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_mentee    uuid := private.my_mentee_id();
  v_required  int  := private.program_value('graduation_closed_required', 4);
  v_threshold int  := private.program_value('graduation_score_threshold', 4);
  v_ci        record;
  v_rec       record;
  v_closed    int;
begin
  if v_mentee is null then
    return null;
  end if;

  select c.total_closed, c.light_speed_vt_progress, c.lofty_crm_usage
    into v_ci
    from public.check_ins c
   where c.mentee_id = v_mentee and c.shared_with_mentee
   order by c.date desc, c.created_at desc
   limit 1;

  select g.status, g.light_speed_vt_completed, g.lofty_crm_proficient, g.nexa_lending_connected,
         g.closed_transactions_confirmed
    into v_rec
    from public.graduation_recommendations g
   where g.mentee_id = v_mentee
   order by g.created_at desc
   limit 1;

  v_closed := coalesce(v_ci.total_closed, 0);

  return jsonb_build_object(
    'closed',                v_closed,
    'closed_required',       v_required,
    'closed_done',           v_closed >= v_required or coalesce(v_rec.closed_transactions_confirmed, false),
    'score_threshold',       v_threshold,
    'vt_complete',           coalesce(v_rec.light_speed_vt_completed, false) or coalesce(v_ci.light_speed_vt_progress, 0) >= v_threshold,
    'lofty_proficient',      coalesce(v_rec.lofty_crm_proficient, false) or coalesce(v_ci.lofty_crm_usage, 0) >= v_threshold,
    'nexa_connected',        coalesce(v_rec.nexa_lending_connected, false),
    'recommendation_status', coalesce(v_rec.status, 'not_started')
  );
end;
$$;

-- Mentee: first-run acceptance.
create or replace function public.accept_invitation()
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_mentee uuid := private.my_mentee_id();
begin
  if v_mentee is null then
    raise exception 'No portal access for this account' using errcode = '42501';
  end if;
  update public.mentees set portal_access = 'active'
   where id = v_mentee and portal_access in ('invited', 'none');
  update public.invitations
     set status = 'accepted', accepted_at = coalesce(accepted_at, now())
   where mentee_id = v_mentee and auth_user_id = (select auth.uid()) and status = 'sent';
  return 'active';
end;
$$;

-- Mentee: update own phone (mentees.phone + profiles.phone).
create or replace function public.update_my_phone(p_phone text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_mentee uuid := private.my_mentee_id();
  v_phone  text := nullif(trim(p_phone), '');
begin
  if v_mentee is null then
    raise exception 'No portal access for this account' using errcode = '42501';
  end if;
  if v_phone is not null and (char_length(v_phone) > 40 or v_phone !~ '^[0-9+().\-\s xX]+$') then
    raise exception 'Invalid phone number' using errcode = '22023';
  end if;
  update public.mentees  set phone = v_phone where id = v_mentee;
  update public.profiles set phone = v_phone where id = (select auth.uid());
end;
$$;

-- Mentee: acknowledge a shared feedback item.
create or replace function public.acknowledge_feedback(p_feedback_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  update public.mentor_feedback
     set mentee_acknowledged_at = coalesce(mentee_acknowledged_at, now())
   where id = p_feedback_id and shared_with_mentee and mentee_id = private.my_mentee_id();
  if not found then
    raise exception 'Feedback not found' using errcode = '42501';
  end if;
end;
$$;

-- Mentee: cancel own help request while it's still open.
create or replace function public.cancel_help_request(p_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  update public.help_requests
     set status = 'cancelled'
   where id = p_id and status = 'open'
     and mentee_id = private.my_mentee_id() and created_by = (select auth.uid());
  if not found then
    raise exception 'Help request not found or no longer open' using errcode = '42501';
  end if;
end;
$$;

-- Mentor: mark a self check-in reviewed (locks it for the mentee).
create or replace function public.mark_self_check_in_reviewed(p_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  update public.self_check_ins s
     set reviewed_at = now(), reviewed_by = (select auth.uid())
   where s.id = p_id and s.reviewed_at is null
     and (s.mentee_id in (select private.mentored_mentee_ids()) or private.is_admin());
  if not found then
    raise exception 'Self check-in not found or already reviewed' using errcode = '42501';
  end if;
end;
$$;

-- Mentor: share every existing check-in for one mentee.
create or replace function public.share_all_past_check_ins(p_mentee_id uuid)
returns int
language plpgsql volatile security definer set search_path = ''
as $$
declare
  n int;
begin
  if not (p_mentee_id in (select private.mentored_mentee_ids()) or private.is_admin()) then
    raise exception 'Not your mentee' using errcode = '42501';
  end if;
  update public.check_ins set shared_with_mentee = true
   where mentee_id = p_mentee_id and not shared_with_mentee;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Mentor: share every existing feedback item for one mentee.
create or replace function public.share_all_past_feedback(p_mentee_id uuid)
returns int
language plpgsql volatile security definer set search_path = ''
as $$
declare
  n int;
begin
  if not (p_mentee_id in (select private.mentored_mentee_ids()) or private.is_admin()) then
    raise exception 'Not your mentee' using errcode = '42501';
  end if;
  update public.mentor_feedback set shared_with_mentee = true
   where mentee_id = p_mentee_id and not shared_with_mentee;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Admin: approve / decline a graduation recommendation.
create or replace function public.review_graduation(p_id uuid, p_decision text, p_note text default null)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_mentee uuid;
begin
  if not private.is_admin() then
    raise exception 'Only the program admin can review graduations' using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'declined') then
    raise exception 'Decision must be approved or declined' using errcode = '22023';
  end if;

  update public.graduation_recommendations
     set status = p_decision, reviewed_by = (select auth.uid()), reviewed_at = now(),
         review_note = nullif(trim(p_note), '')
   where id = p_id and status = 'submitted'
  returning mentee_id into v_mentee;

  if v_mentee is null then
    raise exception 'Recommendation not found or already reviewed' using errcode = 'P0002';
  end if;

  if p_decision = 'approved' then
    update public.mentees set status = 'graduated' where id = v_mentee;
  end if;

  return jsonb_build_object('id', p_id, 'status', p_decision, 'mentee_id', v_mentee);
end;
$$;

-- Service role only: used by the invite-mentee Edge Function for existing accounts.
create or replace function public.auth_user_id_by_email(p_email text)
returns uuid
language sql stable security definer set search_path = ''
as $$
  select u.id from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1
$$;

revoke all on function public.get_my_mentor()                          from public, anon;
revoke all on function public.get_my_graduation_progress()             from public, anon;
revoke all on function public.accept_invitation()                      from public, anon;
revoke all on function public.update_my_phone(text)                    from public, anon;
revoke all on function public.acknowledge_feedback(uuid)               from public, anon;
revoke all on function public.cancel_help_request(uuid)                from public, anon;
revoke all on function public.mark_self_check_in_reviewed(uuid)        from public, anon;
revoke all on function public.share_all_past_check_ins(uuid)           from public, anon;
revoke all on function public.share_all_past_feedback(uuid)            from public, anon;
revoke all on function public.review_graduation(uuid, text, text)      from public, anon;
revoke all on function public.auth_user_id_by_email(text)              from public, anon, authenticated;

grant execute on function public.get_my_mentor()                       to authenticated, service_role;
grant execute on function public.get_my_graduation_progress()          to authenticated, service_role;
grant execute on function public.accept_invitation()                   to authenticated, service_role;
grant execute on function public.update_my_phone(text)                 to authenticated, service_role;
grant execute on function public.acknowledge_feedback(uuid)            to authenticated, service_role;
grant execute on function public.cancel_help_request(uuid)             to authenticated, service_role;
grant execute on function public.mark_self_check_in_reviewed(uuid)     to authenticated, service_role;
grant execute on function public.share_all_past_check_ins(uuid)        to authenticated, service_role;
grant execute on function public.share_all_past_feedback(uuid)         to authenticated, service_role;
grant execute on function public.review_graduation(uuid, text, text)   to authenticated, service_role;
grant execute on function public.auth_user_id_by_email(text)           to service_role;

