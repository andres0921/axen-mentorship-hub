-- 0003: drop the old private columns now that they live in side tables.
--
-- MUST run before 0004 (which gives mentees SELECT on check_ins / mentor_feedback
-- / mentees); otherwise the private columns would be readable through the API.
--
-- Takes a backup first (Supabase dashboard -> Database -> Backups) on the live project.
-- The old app (js/app.js on main) stops working once these columns are gone,
-- so apply this right before merging/deploying the new app.
--
-- Idempotent: re-copy is guarded and drops use IF EXISTS.

-- Pick up anything written by the old app since 0002 ran.
select private.copy_legacy_private_data();

-- Safety net: refuse to drop if any row with private data has no side-table row.
-- (Once the new app is live the side tables are the source of truth, so a
-- side row whose value differs from the old column is NOT treated as loss.)
do $$
declare
  missing int;
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'mentees' and column_name = 'notes') then
    execute $q$
      select count(*) from public.mentees m
      where m.notes is not null and m.notes <> ''
        and not exists (select 1 from public.mentee_private_notes n where n.mentee_id = m.id)
    $q$ into missing;
    if missing > 0 then
      raise exception 'Refusing to drop mentees.notes: % row(s) missing from mentee_private_notes', missing;
    end if;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'check_ins' and column_name = 'general_assessment_notes') then
    execute $q$
      select count(*) from public.check_ins c
      where (c.general_assessment_notes is not null or c.verification_notes is not null
             or c.escalation_flag or c.escalation_notes is not null)
        and not exists (select 1 from public.check_in_private p where p.check_in_id = c.id)
    $q$ into missing;
    if missing > 0 then
      raise exception 'Refusing to drop check_ins private columns: % row(s) missing from side table', missing;
    end if;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'mentor_feedback' and column_name = 'private_notes') then
    execute $q$
      select count(*) from public.mentor_feedback f
      where (f.private_notes is not null or f.overall_rating is not null)
        and not exists (select 1 from public.mentor_feedback_private p where p.feedback_id = f.id)
    $q$ into missing;
    if missing > 0 then
      raise exception 'Refusing to drop mentor_feedback private columns: % row(s) missing from side table', missing;
    end if;
  end if;
end;
$$;

alter table public.mentees drop column if exists notes;

alter table public.check_ins
  drop column if exists general_assessment_notes,
  drop column if exists verification_notes,
  drop column if exists escalation_flag,
  drop column if exists escalation_notes;

alter table public.mentor_feedback
  drop column if exists private_notes,
  drop column if exists overall_rating;
