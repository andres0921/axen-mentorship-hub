-- RLS matrix (docs/MENTEE_PORTAL_PLAN.md §9.2).
-- Actors: mentee A, mentee B (both mentored by M1), mentor M1, mentor M2
-- (mentee C), admin ADM, pending P, anon. Each block impersonates one actor:
--   set local role authenticated;
--   set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}';
-- Read-only blocks end in ROLLBACK; blocks that change state COMMIT.
\set ON_ERROR_STOP on
\i supabase/tests/ids.psql

-- ===========================================================================
-- Cases 1-11: mentee A
-- ===========================================================================
begin;
set local role authenticated;
select set_config('request.jwt.claims', :'j_a', true);

-- 1
select tst.eq('01 A: mentees returns exactly 1 row', tst.cnt('select 1 from public.mentees'), 1::bigint);
select tst.eq('01 A: that row is A', (select id::text from public.mentees), :'ma');
select tst.eq('01 A: mentees.notes column does not exist', tst.err('select notes from public.mentees'), '42703');
-- 2
select tst.eq('02 A: check_ins = only A shared rows (A1, A3)', tst.cnt('select 1 from public.check_ins'), 2::bigint);
select tst.eq('02 A: unshared A2 invisible', tst.cnt(format('select 1 from public.check_ins where id = %L', :'ci_a2')), 0::bigint);
select tst.eq('02 A: no other mentee check-ins', tst.cnt(format('select 1 from public.check_ins where mentee_id <> %L', :'ma')), 0::bigint);
select tst.eq('02 A: check_ins private columns gone', tst.err('select general_assessment_notes from public.check_ins'), '42703');
-- 3
select tst.eq('03 A: check_in_private 0 rows',           tst.cnt('select 1 from public.check_in_private'), 0::bigint);
select tst.eq('03 A: mentor_feedback_private 0 rows',    tst.cnt('select 1 from public.mentor_feedback_private'), 0::bigint);
select tst.eq('03 A: mentee_private_notes 0 rows',       tst.cnt('select 1 from public.mentee_private_notes'), 0::bigint);
select tst.eq('03 A: escalations 0 rows',                tst.cnt('select 1 from public.escalations'), 0::bigint);
select tst.eq('03 A: graduation_recommendations 0 rows', tst.cnt('select 1 from public.graduation_recommendations'), 0::bigint);
select tst.eq('03 A: invitations 0 rows',                tst.cnt('select 1 from public.invitations'), 0::bigint);
select tst.eq('03 A: overall_rating not readable (column gone)', tst.err('select overall_rating from public.mentor_feedback'), '42703');
select tst.eq('03 A: private_notes not readable (column gone)',  tst.err('select private_notes from public.mentor_feedback'), '42703');
-- 4
select tst.eq('04 A: mentor_feedback = only A shared (A2)', tst.cnt('select 1 from public.mentor_feedback'), 1::bigint);
select tst.eq('04 A: unshared feedback A1 invisible', tst.cnt(format('select 1 from public.mentor_feedback where id = %L', :'fb_a1')), 0::bigint);
select tst.eq('04 A: kickoff_sessions = own (1)', tst.cnt('select 1 from public.kickoff_sessions'), 1::bigint);
-- 5
select tst.eq('05 A: insert self_check_in for B -> 42501',
  tst.err(format('insert into public.self_check_ins (mentee_id, week_of) values (%L, %L)', :'mb', '2026-03-02')), '42501');
select tst.eq('05 A: insert own self_check_in -> OK',
  tst.err(format('insert into public.self_check_ins (mentee_id, week_of, wins) values (%L, %L, %L)', :'ma', '2026-03-02', 'x')), 'OK');
select tst.eq('05 A: duplicate week -> unique violation',
  tst.err(format('insert into public.self_check_ins (mentee_id, week_of) values (%L, %L)', :'ma', '2026-02-02')), '23505');
select tst.eq('05 A: insert self_check_in with reviewed_at -> 42501',
  tst.err(format('insert into public.self_check_ins (mentee_id, week_of, reviewed_at) values (%L, %L, now())', :'ma', '2026-03-09')), '42501');
select tst.eq('05 A: update own unreviewed self_check_in -> 1 row',
  tst.affected(format('update public.self_check_ins set wins = %L where id = %L', 'edited', :'sci_a')), 1::bigint);
select tst.eq('05 A: sees only own self_check_ins', tst.cnt('select 1 from public.self_check_ins'), 1::bigint);
-- 7
select tst.eq('07 A: set reviewed_at -> 42501',
  tst.err(format('update public.self_check_ins set reviewed_at = now() where id = %L', :'sci_a')), '42501');
select tst.eq('07 A: change mentee_id on self_check_in -> 42501',
  tst.err(format('update public.self_check_ins set mentee_id = %L where id = %L', :'mb', :'sci_a')), '42501');
-- 8
select tst.eq('08 A: insert into mentees -> 42501',
  tst.err(format('insert into public.mentees (user_id, full_name) values (%L, %L)', :'ua', 'Me')), '42501');
select tst.ok('08 A: update own current_stage denied/0 rows',
  tst.denied(format('update public.mentees set current_stage = 4 where id = %L', :'ma')));
select tst.ok('08 A: update own status denied/0 rows',
  tst.denied(format('update public.mentees set status = %L where id = %L', 'graduated', :'ma')));
select tst.eq('08 A: update mentee_user_id -> 42501',
  tst.err(format('update public.mentees set mentee_user_id = null where id = %L', :'ma')), '42501');
select tst.eq('08 A: update portal_access -> 42501',
  tst.err(format('update public.mentees set portal_access = %L where id = %L', 'active', :'ma')), '42501');
select tst.eq('08 A: delete own mentees row -> 0 rows', tst.affected(format('delete from public.mentees where id = %L', :'ma')), 0::bigint);
select tst.eq('08 A: update a check-in -> 0 rows', tst.affected(format('update public.check_ins set total_closed = 99 where id = %L', :'ci_a1')), 0::bigint);
-- 9
select tst.eq('09 A: update profiles.role -> 42501',
  tst.err(format('update public.profiles set role = %L where id = %L', 'admin', :'ua')), '42501');
select tst.eq('09 A: insert profile -> 42501',
  tst.err(format('insert into public.profiles (id, role) values (gen_random_uuid(), %L)', 'admin')), '42501');
select tst.eq('09 A: can update own profile full_name', tst.affected(format('update public.profiles set full_name = %L where id = %L', 'Alice', :'ua')), 1::bigint);
select tst.eq('09 A: sees only own profile', tst.cnt('select 1 from public.profiles'), 1::bigint);
-- 10 (messages are Phase 2; same isolation checked on help_requests)
select tst.eq('10 A: cannot read B help_requests', tst.cnt(format('select 1 from public.help_requests where mentee_id = %L', :'mb')), 0::bigint);
select tst.eq('10 A: cannot insert help_request for B -> 42501',
  tst.err(format('insert into public.help_requests (mentee_id, category, message) values (%L, %L, %L)', :'mb', 'other', 'x')), '42501');
select tst.eq('10 A: insert help_request with status -> 42501',
  tst.err(format('insert into public.help_requests (mentee_id, category, message, status) values (%L, %L, %L, %L)', :'ma', 'other', 'x', 'resolved')), '42501');
select tst.eq('10 A: cannot write mentor_response', tst.affected(format('update public.help_requests set mentor_response = %L where id = %L', 'self', :'hr_a')), 0::bigint);
select tst.eq('10 A: sees own help_request', tst.cnt('select 1 from public.help_requests'), 1::bigint);
select tst.eq('10 A: cancel own open help_request -> OK', tst.err(format('select public.cancel_help_request(%L)', :'hr_a')), 'OK');
select tst.eq('10 A: cancel B help_request -> 42501', tst.err(format('select public.cancel_help_request(%L)', :'hr_b')), '42501');
-- 11
select tst.eq('11 A: progress closed = latest shared check-in', (public.get_my_graduation_progress() ->> 'closed')::int, 3);
select tst.eq('11 A: progress closed_required from program_settings', (public.get_my_graduation_progress() ->> 'closed_required')::int, 4);
select tst.eq('11 A: progress vt_complete', (public.get_my_graduation_progress() ->> 'vt_complete')::boolean, true);
select tst.eq('11 A: progress nexa from rec', (public.get_my_graduation_progress() ->> 'nexa_connected')::boolean, true);
select tst.eq('11 A: progress recommendation_status', public.get_my_graduation_progress() ->> 'recommendation_status', 'submitted');
select tst.ok('11 A: progress has no statement text', public.get_my_graduation_progress()::text not like '%PRIV%');
select tst.eq('11 A: get_my_mentor -> M1', (select full_name from public.get_my_mentor()), 'Mentor One');
select tst.eq('11 A: program_settings readable', tst.cnt('select 1 from public.program_settings'), 1::bigint);
select tst.eq('11 A: program_settings not updatable', tst.affected('update public.program_settings set graduation_closed_required = 0'), 0::bigint);
select tst.eq('11 A: update_my_phone OK', tst.err($$select public.update_my_phone('555-9999')$$), 'OK');
select tst.eq('11 A: update_my_phone rejects junk', tst.err($$select public.update_my_phone('<script>')$$), '22023');
select tst.eq('11 A: acknowledge shared feedback OK', tst.err(format('select public.acknowledge_feedback(%L)', :'fb_a2')), 'OK');
select tst.eq('11 A: acknowledge unshared feedback -> 42501', tst.err(format('select public.acknowledge_feedback(%L)', :'fb_a1')), '42501');
select tst.eq('11 A: share_all_past_check_ins -> 42501', tst.err(format('select public.share_all_past_check_ins(%L)', :'ma')), '42501');
select tst.eq('11 A: mark own self check-in reviewed -> 42501', tst.err(format('select public.mark_self_check_in_reviewed(%L)', :'sci_a')), '42501');
select tst.eq('11 A: review_graduation -> 42501', tst.err(format('select public.review_graduation(%L, %L)', :'grad_a', 'approved')), '42501');
select tst.eq('11 A: auth_user_id_by_email -> 42501', tst.err($$select public.auth_user_id_by_email('m1@example.com')$$), '42501');
select tst.eq('11 A: private.is_admin() is false for a mentee',
  (select private.is_admin()), false);
rollback;

-- 9 (cont.): user-writable metadata never grants a role
update auth.users set raw_user_meta_data = '{"role":"admin"}', raw_app_meta_data = '{"role":"admin"}' where id = :'ua';
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-00000000000a","role":"authenticated","user_metadata":{"role":"admin"},"app_metadata":{"role":"admin"}}', true);
select tst.eq('09 A: metadata role=admin -> is_admin() still false', (select private.is_admin()), false);
select tst.eq('09 A: metadata role=admin -> still 1 mentee row', tst.cnt('select 1 from public.mentees'), 1::bigint);
rollback;

-- ===========================================================================
-- Case 12: mentee B
-- ===========================================================================
begin;
set local role authenticated;
select set_config('request.jwt.claims', :'j_b', true);
select tst.eq('12 B: mentees = B only', (select string_agg(id::text, ',') from public.mentees), :'mb');
select tst.eq('12 B: check_ins 0 (B1 unshared)', tst.cnt('select 1 from public.check_ins'), 0::bigint);
select tst.eq('12 B: feedback 0 (unshared)', tst.cnt('select 1 from public.mentor_feedback'), 0::bigint);
select tst.eq('12 B: private tables 0',
  tst.cnt('select 1 from public.check_in_private union all select 1 from public.mentor_feedback_private union all select 1 from public.mentee_private_notes'), 0::bigint);
select tst.eq('12 B: never sees A anywhere',
  tst.cnt(format($q$select 1 from public.mentees where id = %1$L
                   union all select 1 from public.check_ins where mentee_id = %1$L
                   union all select 1 from public.mentor_feedback where mentee_id = %1$L
                   union all select 1 from public.kickoff_sessions where mentee_id = %1$L
                   union all select 1 from public.self_check_ins where mentee_id = %1$L
                   union all select 1 from public.help_requests where mentee_id = %1$L$q$, :'ma')), 0::bigint);
select tst.eq('12 B: cannot edit A self check-in', tst.affected(format('update public.self_check_ins set wins = %L where id = %L', 'x', :'sci_a')), 0::bigint);
select tst.eq('12 B: sees own self check-in + help request', tst.cnt('select 1 from public.self_check_ins union all select 1 from public.help_requests'), 2::bigint);
select tst.eq('12 B: progress closed = 0 (nothing shared)', (public.get_my_graduation_progress() ->> 'closed')::int, 0);
rollback;

-- ===========================================================================
-- Cases 13-16: mentor M1
-- ===========================================================================
begin;
set local role authenticated;
select set_config('request.jwt.claims', :'j_m1', true);
-- 13
select tst.eq('13 M1: mentees A,B,D (not C)', tst.cnt('select 1 from public.mentees'), 3::bigint);
select tst.eq('13 M1: never C', tst.cnt(format('select 1 from public.mentees where id = %L', :'mc')), 0::bigint);
select tst.eq('13 M1: check_ins incl. unshared (A1,A2,A3,B1,D1)', tst.cnt('select 1 from public.check_ins'), 5::bigint);
select tst.eq('13 M1: check_in_private for own mentees', tst.cnt('select 1 from public.check_in_private'), 5::bigint);
select tst.eq('13 M1: reads private assessment', (select general_assessment_notes from public.check_in_private where check_in_id = :'ci_a2'), 'PRIV-ASSESS-A2');
select tst.eq('13 M1: mentee_private_notes A,B', tst.cnt('select 1 from public.mentee_private_notes'), 2::bigint);
select tst.eq('13 M1: mentor_feedback_private (A1,B1,A2)', tst.cnt('select 1 from public.mentor_feedback_private'), 3::bigint);
select tst.eq('13 M1: escalations own mentees only', tst.cnt('select 1 from public.escalations'), 1::bigint);
select tst.eq('13 M1: graduation recs own mentees', tst.cnt('select 1 from public.graduation_recommendations'), 2::bigint);
select tst.eq('13 M1: self_check_ins of A and B', tst.cnt('select 1 from public.self_check_ins'), 2::bigint);
select tst.eq('13 M1: help_requests of A and B', tst.cnt('select 1 from public.help_requests'), 2::bigint);
select tst.eq('13 M1: profiles = self + linked mentees', tst.cnt('select 1 from public.profiles'), 3::bigint);
select tst.eq('13 M1: invitations for own mentees', tst.cnt('select 1 from public.invitations'), 2::bigint);
select tst.eq('13 M1: no C data in any child table',
  tst.cnt(format($q$select 1 from public.check_ins where mentee_id = %1$L
                   union all select 1 from public.check_in_private where mentee_id = %1$L
                   union all select 1 from public.mentee_private_notes where mentee_id = %1$L
                   union all select 1 from public.escalations where mentee_id = %1$L
                   union all select 1 from public.kickoff_sessions where mentee_id = %1$L$q$, :'mc')), 0::bigint);
-- 14
select tst.eq('14 M1: insert check_in for C -> 42501',
  tst.err(format('insert into public.check_ins (user_id, mentee_id) values (%L, %L)', :'m1', :'mc')), '42501');
select tst.eq('14 M1: insert feedback for C -> 42501',
  tst.err(format('insert into public.mentor_feedback (user_id, mentee_id) values (%L, %L)', :'m1', :'mc')), '42501');
select tst.eq('14 M1: insert check_in_private for C -> 42501',
  tst.err(format('insert into public.check_in_private (check_in_id, mentee_id) values (%L, %L)', :'ci_c1', :'mc')), '42501');
select tst.eq('14 M1: insert check_in as M2 author -> 42501',
  tst.err(format('insert into public.check_ins (user_id, mentee_id) values (%L, %L)', :'m2', :'ma')), '42501');
select tst.eq('14 M1: insert check_in for A -> OK',
  tst.err(format('insert into public.check_ins (user_id, mentee_id) values (%L, %L)', :'m1', :'ma')), 'OK');
insert into public.check_ins (id, user_id, mentee_id) values ('cd000000-0000-0000-0000-000000000099', :'m1', :'md');
select tst.eq('14 M1: private side row with mismatched mentee -> FK error',
  tst.err(format('insert into public.check_in_private (check_in_id, mentee_id) values (%L, %L)', 'cd000000-0000-0000-0000-000000000099', :'ma')), '23503');
delete from public.check_ins where id = 'cd000000-0000-0000-0000-000000000099';
-- 15
select tst.eq('15 M1: set mentee_user_id -> 42501',
  tst.err(format('update public.mentees set mentee_user_id = %L where id = %L', :'up', :'md')), '42501');
select tst.eq('15 M1: set portal_access -> 42501',
  tst.err(format('update public.mentees set portal_access = %L where id = %L', 'active', :'md')), '42501');
select tst.eq('15 M1: insert invitations -> 42501',
  tst.err(format('insert into public.invitations (mentee_id, invited_by, email) values (%L, %L, %L)', :'md', :'m1', 'x@y.z')), '42501');
-- 16
select tst.eq('16 M1: reassign A to M2 -> 42501 (with check)',
  tst.err(format('update public.mentees set user_id = %L where id = %L', :'m2', :'ma')), '42501');
select tst.eq('16 M1: update C -> 0 rows', tst.affected(format('update public.mentees set full_name = %L where id = %L', 'x', :'mc')), 0::bigint);
select tst.eq('16 M1: set mentee graduated directly -> 42501 (admin approval required)',
  tst.err(format('update public.mentees set status = %L where id = %L', 'graduated', :'ma')), '42501');
select tst.eq('16 M1: set mentee escalated -> OK',
  tst.err(format('update public.mentees set status = %L where id = %L', 'escalated', :'ma')), 'OK');
select tst.eq('16 M1: insert grad rec with status approved -> 42501',
  tst.err(format('insert into public.graduation_recommendations (user_id, mentee_id, status) values (%L, %L, %L)', :'m1', :'mb', 'approved')), '42501');
select tst.eq('16 M1: insert grad rec (no status) -> OK, status submitted',
  tst.err(format('insert into public.graduation_recommendations (user_id, mentee_id) values (%L, %L)', :'m1', :'mb')), 'OK');
select tst.eq('16 M1: update own grad rec status -> 42501',
  tst.err(format('update public.graduation_recommendations set status = %L where id = %L', 'approved', :'grad_a')), '42501');
select tst.eq('16 M1: review_graduation -> 42501', tst.err(format('select public.review_graduation(%L, %L)', :'grad_a', 'approved')), '42501');
select tst.eq('16 M1: update profiles.role -> 42501', tst.err(format('update public.profiles set role = %L where id = %L', 'admin', :'m1')), '42501');
select tst.eq('16 M1: update linked mentee profile -> 0 rows', tst.affected(format('update public.profiles set full_name = %L where id = %L', 'x', :'ua')), 0::bigint);
select tst.eq('16 M1: program_settings not updatable', tst.affected('update public.program_settings set graduation_closed_required = 0'), 0::bigint);
select tst.eq('16 M1: share_all_past_check_ins(C) -> 42501', tst.err(format('select public.share_all_past_check_ins(%L)', :'mc')), '42501');
select tst.eq('16 M1: share_all_past_check_ins(A) shares A2', public.share_all_past_check_ins(:'ma'), 1);
select tst.eq('16 M1: share_all_past_feedback(A) shares A1', public.share_all_past_feedback(:'ma'), 1);
select tst.eq('16 M1: respond to A help request',
  tst.affected(format('update public.help_requests set status = %L, mentor_response = %L where id = %L', 'acknowledged', 'On it', :'hr_a')), 1::bigint);
select tst.eq('16 M1: get_my_graduation_progress -> null', public.get_my_graduation_progress(), null::jsonb);
select tst.eq('16 M1: auth_user_id_by_email -> 42501', tst.err($$select public.auth_user_id_by_email('m2@example.com')$$), '42501');
rollback;

-- ===========================================================================
-- Case 17: mentor M2
-- ===========================================================================
begin;
set local role authenticated;
select set_config('request.jwt.claims', :'j_m2', true);
select tst.eq('17 M2: mentees = C only', (select string_agg(id::text, ',') from public.mentees), :'mc');
select tst.eq('17 M2: 0 rows of A/B help_requests', tst.cnt('select 1 from public.help_requests'), 0::bigint);
select tst.eq('17 M2: 0 rows of A/B self_check_ins', tst.cnt('select 1 from public.self_check_ins'), 0::bigint);
select tst.eq('17 M2: 0 rows of M1 check_ins', tst.cnt(format('select 1 from public.check_ins where mentee_id in (%L, %L)', :'ma', :'mb')), 0::bigint);
select tst.eq('17 M2: 0 rows of M1 private tables',
  tst.cnt(format($q$select 1 from public.check_in_private where mentee_id <> %1$L
                   union all select 1 from public.mentor_feedback_private where mentee_id <> %1$L
                   union all select 1 from public.mentee_private_notes where mentee_id <> %1$L$q$, :'mc')), 0::bigint);
select tst.eq('17 M2: 0 profiles of M1 mentees', tst.cnt(format('select 1 from public.profiles where id in (%L, %L)', :'ua', :'ub')), 0::bigint);
select tst.eq('17 M2: mark A self check-in reviewed -> 42501', tst.err(format('select public.mark_self_check_in_reviewed(%L)', :'sci_a')), '42501');
select tst.eq('17 M2: respond to A help request -> 0 rows',
  tst.affected(format('update public.help_requests set mentor_response = %L where id = %L', 'x', :'hr_a')), 0::bigint);
select tst.eq('17 M2: invitations = own only', tst.cnt('select 1 from public.invitations'), 1::bigint);
select tst.eq('17 M2: sees own C private notes', (select notes from public.mentee_private_notes), 'PRIVATE-NOTE-C');
rollback;

-- ===========================================================================
-- Case 6: mentor reviews -> mentee can no longer edit
-- ===========================================================================
begin;
set local role authenticated;
select set_config('request.jwt.claims', :'j_m1', true);
select public.mark_self_check_in_reviewed(:'sci_a');
select tst.ok('06 M1: mark A self check-in reviewed -> OK', (select reviewed_by::text = :'m1' from public.self_check_ins where id = :'sci_a'));
select tst.eq('06 M1: mark again -> error', tst.err(format('select public.mark_self_check_in_reviewed(%L)', :'sci_a')), '42501');
commit;
begin;
set local role authenticated;
select set_config('request.jwt.claims', :'j_a', true);
select tst.eq('06 A: update reviewed self_check_in -> 0 rows',
  tst.affected(format('update public.self_check_ins set wins = %L where id = %L', 'late edit', :'sci_a')), 0::bigint);
select tst.ok('06 A: reviewed_at visible to mentee', (select reviewed_at is not null from public.self_check_ins where id = :'sci_a'));
rollback;

-- ===========================================================================
-- Case 18: admin
-- ===========================================================================
begin;
set local role authenticated;
select set_config('request.jwt.claims', :'j_adm', true);
select tst.eq('18 ADM: all mentees', tst.cnt('select 1 from public.mentees'), 4::bigint);
select tst.eq('18 ADM: all check_ins', tst.cnt('select 1 from public.check_ins'), 7::bigint);
select tst.eq('18 ADM: all check_in_private', tst.cnt('select 1 from public.check_in_private'), 7::bigint);
select tst.eq('18 ADM: all mentee_private_notes', tst.cnt('select 1 from public.mentee_private_notes'), 3::bigint);
select tst.eq('18 ADM: all mentor_feedback_private', tst.cnt('select 1 from public.mentor_feedback_private'), 4::bigint);
select tst.eq('18 ADM: all escalations', tst.cnt('select 1 from public.escalations'), 2::bigint);
select tst.eq('18 ADM: all graduation recs', tst.cnt('select 1 from public.graduation_recommendations'), 3::bigint);
select tst.eq('18 ADM: all self_check_ins', tst.cnt('select 1 from public.self_check_ins'), 2::bigint);
select tst.eq('18 ADM: all help_requests', tst.cnt('select 1 from public.help_requests'), 2::bigint);
select tst.eq('18 ADM: all profiles', tst.cnt('select 1 from public.profiles'), 7::bigint);
select tst.eq('18 ADM: all invitations', tst.cnt('select 1 from public.invitations'), 3::bigint);
select tst.eq('18 ADM: all kickoffs', tst.cnt('select 1 from public.kickoff_sessions'), 2::bigint);
select tst.eq('18 ADM: update escalation status', tst.affected($$update public.escalations set status = 'acknowledged'$$), 2::bigint);
select tst.eq('18 ADM: update program_settings', tst.affected('update public.program_settings set graduation_closed_required = 5'), 1::bigint);
select tst.eq('18 ADM: still cannot write profiles.role via API', tst.err($$update public.profiles set role = 'mentor'$$), '42501');
select tst.eq('18 ADM: auth_user_id_by_email -> 42501', tst.err($$select public.auth_user_id_by_email('m1@example.com')$$), '42501');
rollback;

-- Admin approvals + reassignment (committed)
begin;
set local role authenticated;
select set_config('request.jwt.claims', :'j_adm', true);
select tst.eq('18 ADM: approve A graduation', public.review_graduation(:'grad_a', 'approved', 'Well done') ->> 'status', 'approved');
select tst.eq('18 ADM: approved -> mentee graduated', (select status from public.mentees where id = :'ma'), 'graduated');
select tst.eq('18 ADM: re-review -> error', tst.err(format('select public.review_graduation(%L, %L)', :'grad_a', 'declined')), 'P0002');
select tst.eq('18 ADM: decline C graduation', public.review_graduation(:'grad_c', 'declined', 'Not yet') ->> 'status', 'declined');
select tst.eq('18 ADM: declined -> C status unchanged', (select status from public.mentees where id = :'mc'), 'active');
select tst.eq('18 ADM: invalid decision -> 22023', tst.err(format('select public.review_graduation(%L, %L)', :'grad_c', 'maybe')), '22023');
select tst.eq('18 ADM: reassign C to M1', tst.affected(format('update public.mentees set user_id = %L where id = %L', :'m1', :'mc')), 1::bigint);
update public.mentees set user_id = :'m1' where id = :'mc';
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', :'j_a', true);
select tst.eq('11 A: progress shows approved', public.get_my_graduation_progress() ->> 'recommendation_status', 'approved');
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claims', :'j_m1', true);
select tst.eq('18 M1 after reassign: sees C history written by M2', tst.cnt(format('select 1 from public.check_ins where mentee_id = %L', :'mc')), 2::bigint);
select tst.eq('18 M1 after reassign: sees C private notes', (select notes from public.mentee_private_notes where mentee_id = :'mc'), 'PRIVATE-NOTE-C');
select tst.eq('18 M1 after reassign: sees C escalation', tst.cnt(format('select 1 from public.escalations where mentee_id = %L', :'mc')), 1::bigint);
select tst.eq('18 M1 after reassign: cannot edit M2-authored check-in', tst.affected(format('update public.check_ins set total_closed = 9 where id = %L', :'ci_c1')), 0::bigint);
select tst.eq('18 M1 after reassign: can share M2-authored check-ins via RPC', public.share_all_past_check_ins(:'mc'), 1);
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claims', :'j_m2', true);
select tst.eq('18 M2 after reassign: sees nothing of C', tst.cnt('select 1 from public.mentees union all select 1 from public.check_ins union all select 1 from public.check_in_private'), 0::bigint);
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claims', :'j_c', true);
select tst.eq('18 C after reassign: still sees own shared check-in', tst.cnt('select 1 from public.check_ins'), 1::bigint);
select tst.eq('18 C after reassign: mentor is now M1', (select full_name from public.get_my_mentor()), 'Mentor One');
rollback;

-- ===========================================================================
-- Case 19: pending user (self sign-up / never invited)
-- ===========================================================================
begin;
set local role authenticated;
select set_config('request.jwt.claims', :'j_p', true);
select tst.eq('19 P: 0 rows in ' || t, tst.cnt('select 1 from public.' || t), 0::bigint)
from unnest(array['mentees','check_ins','escalations','graduation_recommendations','mentor_feedback','kickoff_sessions',
                  'mentee_private_notes','check_in_private','mentor_feedback_private','invitations','self_check_ins',
                  'help_requests','program_settings']) t;
select tst.eq('19 P: sees only own profile', tst.cnt('select 1 from public.profiles'), 1::bigint);
select tst.eq('19 P: insert mentees -> 42501',
  tst.err(format('insert into public.mentees (user_id, full_name) values (%L, %L)', :'up', 'Fake')), '42501');
select tst.eq('19 P: insert check_in -> 42501',
  tst.err(format('insert into public.check_ins (user_id, mentee_id) values (%L, %L)', :'up', :'ma')), '42501');
select tst.eq('19 P: insert self_check_in -> 42501',
  tst.err(format('insert into public.self_check_ins (mentee_id) values (%L)', :'ma')), '42501');
select tst.eq('19 P: insert help_request -> 42501',
  tst.err(format('insert into public.help_requests (mentee_id, category, message) values (%L, %L, %L)', :'ma', 'other', 'x')), '42501');
select tst.eq('19 P: get_my_graduation_progress -> null', public.get_my_graduation_progress(), null::jsonb);
select tst.eq('19 P: get_my_mentor -> 0 rows', tst.cnt('select * from public.get_my_mentor()'), 0::bigint);
select tst.eq('19 P: accept_invitation -> 42501', tst.err('select public.accept_invitation()'), '42501');
select tst.eq('19 P: share_all_past_check_ins -> 42501', tst.err(format('select public.share_all_past_check_ins(%L)', :'ma')), '42501');
select tst.eq('19 P: role escalation -> 42501', tst.err(format('update public.profiles set role = %L where id = %L', 'mentor', :'up')), '42501');
rollback;

-- ===========================================================================
-- Case 20: anon
-- ===========================================================================
begin;
set local role anon;
select set_config('request.jwt.claims', :'j_anon', true);
select tst.eq('20 anon: permission denied on ' || t, tst.err('select 1 from public.' || t), '42501')
from unnest(array['mentees','check_ins','escalations','graduation_recommendations','mentor_feedback','kickoff_sessions',
                  'mentee_private_notes','check_in_private','mentor_feedback_private','invitations','self_check_ins',
                  'help_requests','program_settings','profiles']) t;
select tst.eq('20 anon: RPC ' || f || ' -> 42501', tst.err('select public.' || f), '42501')
from unnest(array['get_my_graduation_progress()', 'accept_invitation()', 'get_my_mentor()',
                  $$auth_user_id_by_email('m1@example.com')$$, $$update_my_phone('1')$$]) f;
select tst.eq('20 anon: private helpers not executable', tst.err('select private.is_admin()'), '42501');
rollback;

-- ===========================================================================
-- service_role can do what invite-mentee needs
-- ===========================================================================
begin;
set local role service_role;
select set_config('request.jwt.claims', :'j_svc', true);
select tst.eq('svc: auth_user_id_by_email finds user (case-insensitive)', public.auth_user_id_by_email(' ALICE@example.com ')::text, :'ua');
select tst.eq('svc: auth_user_id_by_email unknown -> null', public.auth_user_id_by_email('nobody@example.com'), null::uuid);
rollback;

-- ===========================================================================
-- Case 21: revoked mentee keeps a valid JWT but loses all access
-- (what revoke action of invite-mentee does, as service_role)
-- ===========================================================================
begin;
set local role service_role;
select set_config('request.jwt.claims', :'j_svc', true);
update public.mentees set mentee_user_id = null, portal_access = 'revoked' where id = :'ma';
update public.profiles set role = 'pending' where id = :'ua' and role = 'mentee';
update public.invitations set status = 'revoked' where mentee_id = :'ma';
commit;

begin;
set local role authenticated;
select set_config('request.jwt.claims', :'j_a', true);
select tst.eq('21 A revoked: 0 rows in ' || t, tst.cnt('select 1 from public.' || t), 0::bigint)
from unnest(array['mentees','check_ins','mentor_feedback','kickoff_sessions','self_check_ins','help_requests',
                  'program_settings','check_in_private','escalations']) t;
select tst.eq('21 A revoked: update_my_phone -> 42501', tst.err($$select public.update_my_phone('1')$$), '42501');
select tst.eq('21 A revoked: progress -> null', public.get_my_graduation_progress(), null::jsonb);
select tst.eq('21 A revoked: insert self check-in -> 42501',
  tst.err(format('insert into public.self_check_ins (mentee_id, week_of) values (%L, %L)', :'ma', '2026-04-06')), '42501');
rollback;

-- B unaffected by A's revocation
begin;
set local role authenticated;
select set_config('request.jwt.claims', :'j_b', true);
select tst.eq('21 B unaffected by A revoke', tst.cnt('select 1 from public.mentees'), 1::bigint);
rollback;
