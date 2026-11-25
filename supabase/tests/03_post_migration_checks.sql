-- Verifies the migrations on top of pre-existing data (run as superuser):
-- private data copied to side tables before the columns were dropped,
-- backfills, defaults and status normalisation.

select tst.eq('migr: mentees.notes dropped',
  (select count(*) from information_schema.columns where table_schema='public' and table_name='mentees' and column_name='notes'), 0::bigint);
select tst.eq('migr: check_ins private columns dropped',
  (select count(*) from information_schema.columns where table_schema='public' and table_name='check_ins'
     and column_name in ('general_assessment_notes','verification_notes','escalation_flag','escalation_notes')), 0::bigint);
select tst.eq('migr: mentor_feedback private columns dropped',
  (select count(*) from information_schema.columns where table_schema='public' and table_name='mentor_feedback'
     and column_name in ('private_notes','overall_rating')), 0::bigint);

select tst.eq('migr: 3 mentee notes copied', (select count(*) from public.mentee_private_notes), 3::bigint);
select tst.eq('migr: note A copied', (select notes from public.mentee_private_notes where mentee_id='a0000000-0000-0000-0000-000000000001'), 'PRIVATE-NOTE-A');
select tst.eq('migr: note C copied', (select notes from public.mentee_private_notes where mentee_id='c0000000-0000-0000-0000-000000000001'), 'PRIVATE-NOTE-C');
select tst.eq('migr: every legacy check-in has a private row', (select count(*) from public.check_in_private), 5::bigint);
select tst.ok('migr: check-in A2 private values copied',
  exists (select 1 from public.check_in_private where check_in_id='ca000000-0000-0000-0000-000000000002'
          and general_assessment_notes='PRIV-ASSESS-A2' and escalation_flag and escalation_notes='PRIV-ESC-A2'));
select tst.eq('migr: check-in A1 verification copied',
  (select verification_notes from public.check_in_private where check_in_id='ca000000-0000-0000-0000-000000000001'), 'PRIV-VERIFY-A1');
select tst.eq('migr: 3 feedback private rows (rows with notes or rating)', (select count(*) from public.mentor_feedback_private), 3::bigint);
select tst.ok('migr: feedback A1 note + rating copied',
  exists (select 1 from public.mentor_feedback_private where feedback_id='fa000000-0000-0000-0000-000000000001'
          and private_notes='PRIV-FB-A1' and overall_rating=2));
select tst.eq('migr: feedback C1 rating copied',
  (select overall_rating from public.mentor_feedback_private where feedback_id='fc000000-0000-0000-0000-000000000001'), 5);

select tst.eq('migr: existing users backfilled as mentor',
  (select count(*) from public.profiles where role='mentor'), 3::bigint);
select tst.eq('migr: profile email lower-cased',
  (select email from public.profiles where id='10000000-0000-0000-0000-000000000003'), 'andres@example.com');
select tst.eq('migr: existing check-ins backfilled unshared',
  (select count(*) from public.check_ins where shared_with_mentee), 0::bigint);
select tst.eq('migr: existing feedback backfilled unshared',
  (select count(*) from public.mentor_feedback where shared_with_mentee), 0::bigint);
select tst.eq('migr: check_ins.shared_with_mentee default is now true',
  (select column_default from information_schema.columns where table_schema='public' and table_name='check_ins' and column_name='shared_with_mentee'), 'true');
select tst.eq('migr: mentor_feedback.shared_with_mentee default is now true',
  (select column_default from information_schema.columns where table_schema='public' and table_name='mentor_feedback' and column_name='shared_with_mentee'), 'true');
select tst.eq('migr: rec for already-graduated mentee D -> approved',
  (select status from public.graduation_recommendations where id='9d000000-0000-0000-0000-000000000001'), 'approved');
select tst.eq('migr: rec for active mentee A stays submitted',
  (select status from public.graduation_recommendations where id='9a000000-0000-0000-0000-000000000001'), 'submitted');
select tst.eq('migr: unknown legacy status normalised to submitted',
  (select status from public.graduation_recommendations where id='9c000000-0000-0000-0000-000000000001'), 'submitted');
select tst.eq('migr: program_settings has one row', (select count(*) from public.program_settings), 1::bigint);
select tst.eq('migr: portal_access defaults to none', (select count(*) from public.mentees where portal_access <> 'none'), 0::bigint);
select tst.eq('migr: no RLS-disabled table in public',
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and not c.relrowsecurity), 0::bigint);
select tst.eq('migr: every SECURITY DEFINER function pins search_path',
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private') and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%')), 0::bigint);
select tst.eq('migr: anon has no table privileges in public',
  (select count(*) from information_schema.role_table_grants where grantee='anon' and table_schema='public'), 0::bigint);
select tst.eq('migr: anon cannot execute any public RPC except trigger helper',
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname <> 'set_updated_at' and has_function_privilege('anon', p.oid, 'execute')), 0::bigint);
