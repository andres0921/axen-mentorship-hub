-- 0002: mentor-private side tables + copy existing private data into them.
--
-- RLS works on rows, not columns, so anything a mentee must never read moves
-- out of the tables mentees will be able to SELECT (check_ins, mentor_feedback,
-- mentees). Staff-only tables:
--   mentee_private_notes     <- mentees.notes
--   check_in_private         <- check_ins.general_assessment_notes, verification_notes,
--                               escalation_flag, escalation_notes
--   mentor_feedback_private  <- mentor_feedback.private_notes, overall_rating
--
-- Idempotent. The copy only runs while the old columns still exist (0003 drops
-- them) and never overwrites rows that are already in the side tables.

-- composite keys so the denormalised mentee_id on side tables can't drift
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'check_ins_id_mentee_uniq') then
    alter table public.check_ins add constraint check_ins_id_mentee_uniq unique (id, mentee_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'mentor_feedback_id_mentee_uniq') then
    alter table public.mentor_feedback add constraint mentor_feedback_id_mentee_uniq unique (id, mentee_id);
  end if;
end;
$$;

create table if not exists public.mentee_private_notes (
  mentee_id  uuid primary key references public.mentees (id) on delete cascade,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.check_in_private (
  check_in_id              uuid primary key,
  mentee_id                uuid not null,
  general_assessment_notes text,
  verification_notes       text,
  escalation_flag          boolean not null default false,
  escalation_notes         text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint check_in_private_check_in_fk
    foreign key (check_in_id, mentee_id) references public.check_ins (id, mentee_id) on delete cascade
);
create index if not exists check_in_private_mentee_id_idx on public.check_in_private (mentee_id);

create table if not exists public.mentor_feedback_private (
  feedback_id    uuid primary key,
  mentee_id      uuid not null,
  private_notes  text,
  overall_rating int check (overall_rating between 1 and 5),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint mentor_feedback_private_feedback_fk
    foreign key (feedback_id, mentee_id) references public.mentor_feedback (id, mentee_id) on delete cascade
);
create index if not exists mentor_feedback_private_mentee_id_idx on public.mentor_feedback_private (mentee_id);

do $$
declare
  t text;
begin
  foreach t in array array['mentee_private_notes', 'check_in_private', 'mentor_feedback_private']
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t);

    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I on public.%I', t || '_staff_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (mentee_id in (select private.mentored_mentee_ids()) or (select private.is_admin()))',
      t || '_staff_select', t);

    execute format('drop policy if exists %I on public.%I', t || '_staff_insert', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (mentee_id in (select private.mentored_mentee_ids()))',
      t || '_staff_insert', t);

    execute format('drop policy if exists %I on public.%I', t || '_staff_update', t);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using (mentee_id in (select private.mentored_mentee_ids()))
         with check (mentee_id in (select private.mentored_mentee_ids()))',
      t || '_staff_update', t);

    execute format('drop policy if exists %I on public.%I', t || '_staff_delete', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated
         using (mentee_id in (select private.mentored_mentee_ids()))',
      t || '_staff_delete', t);

    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Copy existing private data (only while the source columns still exist).
-- Shared with 0003, which re-runs it right before dropping the columns to pick
-- up anything the old app wrote in between.
-- ---------------------------------------------------------------------------
create or replace function private.copy_legacy_private_data()
returns void
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'mentees' and column_name = 'notes') then
    execute $q$
      insert into public.mentee_private_notes (mentee_id, notes)
      select m.id, m.notes from public.mentees m
      where m.notes is not null and m.notes <> ''
      on conflict (mentee_id) do nothing
    $q$;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'check_ins' and column_name = 'general_assessment_notes') then
    execute $q$
      insert into public.check_in_private
        (check_in_id, mentee_id, general_assessment_notes, verification_notes, escalation_flag, escalation_notes)
      select c.id, c.mentee_id, c.general_assessment_notes, c.verification_notes,
             coalesce(c.escalation_flag, false), c.escalation_notes
      from public.check_ins c
      on conflict (check_in_id) do nothing
    $q$;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'mentor_feedback' and column_name = 'private_notes') then
    execute $q$
      insert into public.mentor_feedback_private (feedback_id, mentee_id, private_notes, overall_rating)
      select f.id, f.mentee_id, f.private_notes, f.overall_rating
      from public.mentor_feedback f
      where f.private_notes is not null or f.overall_rating is not null
      on conflict (feedback_id) do nothing
    $q$;
  end if;
end;
$$;

revoke all on function private.copy_legacy_private_data() from public, anon, authenticated;

select private.copy_legacy_private_data();
