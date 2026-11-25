-- Post-migration fixtures, created the way production creates them:
--   * auth users via auth.users insert (trigger -> pending profile)
--   * admin promoted by hand (SQL editor = superuser)
--   * mentee linking done as service_role (what the invite-mentee function does)
--   * new rows written as the real API roles
\set ON_ERROR_STOP on
\i supabase/tests/ids.psql

insert into auth.users (id, email, email_confirmed_at) values
  (:'ua', 'alice@example.com', now()),
  (:'ub', 'bob@example.com',   now()),
  (:'uc', 'cara@example.com',  now()),
  (:'up', 'stranger@example.com', now());

-- Andres -> admin (docs/ANDRES_SETUP_STEPS.md step)
update public.profiles set role = 'admin', full_name = 'Andres' where email = 'andres@example.com';
update public.profiles set full_name = 'Mentor One', phone = '555-1111', booking_url = 'https://cal.example.com/m1'
 where id = :'m1';

-- invite-mentee emulation (service role)
begin;
set local role service_role;
select set_config('request.jwt.claims', :'j_svc', true);
update public.profiles set role = 'mentee' where id in (:'ua', :'ub', :'uc') and role in ('pending', 'mentee');
update public.mentees set mentee_user_id = :'ua', portal_access = 'invited' where id = :'ma' and mentee_user_id is null;
update public.mentees set mentee_user_id = :'ub', portal_access = 'invited' where id = :'mb' and mentee_user_id is null;
update public.mentees set mentee_user_id = :'uc', portal_access = 'invited' where id = :'mc' and mentee_user_id is null;
insert into public.invitations (mentee_id, invited_by, email, auth_user_id) values
  (:'ma', :'m1', 'alice@example.com', :'ua'),
  (:'mb', :'m1', 'bob@example.com',   :'ub'),
  (:'mc', :'m2', 'cara@example.com',  :'uc');
commit;

-- M1 writes: a new check-in for A (default shared), shares A1, keeps A2 private,
-- new shared feedback for A with private notes + rating.
begin;
set local role authenticated;
select set_config('request.jwt.claims', :'j_m1', true);
insert into public.check_ins (id, user_id, mentee_id, check_in_number, date, lead_generation_activity,
                              light_speed_vt_progress, lofty_crm_usage, total_closed, student_commitment,
                              commitment_due_date, next_check_in_date, next_check_in_format)
values (:'ci_a3', :'m1', :'ma', 3, '2026-02-02', 4, 4, 5, 3, 'Book 5 appointments', '2026-02-09', '2026-02-09', 'Zoom');
insert into public.check_in_private (check_in_id, mentee_id, general_assessment_notes, escalation_flag)
values (:'ci_a3', :'ma', 'PRIV-ASSESS-A3', false);
update public.check_ins set shared_with_mentee = true where id = :'ci_a1';
insert into public.mentor_feedback (id, user_id, mentee_id, date, strengths, recommended_actions)
values (:'fb_a2', :'m1', :'ma', '2026-02-03', 'Consistent follow-up', 'Ask for referrals');
insert into public.mentor_feedback_private (feedback_id, mentee_id, private_notes, overall_rating)
values (:'fb_a2', :'ma', 'PRIV-FB-A2', 1);
commit;

-- M2: new shared check-in for C
begin;
set local role authenticated;
select set_config('request.jwt.claims', :'j_m2', true);
insert into public.check_ins (id, user_id, mentee_id, check_in_number, date, total_closed)
values (:'ci_c2', :'m2', :'mc', 2, '2026-03-16', 3);
insert into public.check_in_private (check_in_id, mentee_id, general_assessment_notes)
values (:'ci_c2', :'mc', 'PRIV-ASSESS-C2');
commit;

-- Mentees accept + write their own rows
begin;
set local role authenticated;
select set_config('request.jwt.claims', :'j_a', true);
select public.accept_invitation();
insert into public.self_check_ins (mentee_id, week_of, lead_gen_self_score, wins)
values (:'ma', '2026-02-02', 4, 'WIN-A');
insert into public.help_requests (mentee_id, category, message) values (:'ma', 'transaction', 'HELP-A');
commit;
update public.self_check_ins set id = :'sci_a' where mentee_id = :'ma';
update public.help_requests  set id = :'hr_a'  where mentee_id = :'ma';

begin;
set local role authenticated;
select set_config('request.jwt.claims', :'j_b', true);
insert into public.self_check_ins (mentee_id, week_of, wins) values (:'mb', '2026-02-09', 'WIN-B');
insert into public.help_requests (mentee_id, category, urgency, message) values (:'mb', 'personal', 'urgent', 'HELP-B');
commit;
update public.self_check_ins set id = :'sci_b' where mentee_id = :'mb';
update public.help_requests  set id = :'hr_b'  where mentee_id = :'mb';
