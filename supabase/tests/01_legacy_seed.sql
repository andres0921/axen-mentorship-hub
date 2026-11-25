-- Data in the OLD shape (schema.sql only, before any migration), as the live
-- project has it today: mentors with notes, private check-in fields, feedback
-- with private notes + ratings, escalations, graduation recs, kickoffs.
-- Run as superuser between schema.sql and the migrations.

insert into auth.users (id, email, email_confirmed_at) values
  ('10000000-0000-0000-0000-000000000001', 'm1@example.com',     now()),
  ('10000000-0000-0000-0000-000000000002', 'm2@example.com',     now()),
  ('10000000-0000-0000-0000-000000000003', 'Andres@Example.com', now());

insert into public.mentees (id, user_id, full_name, email, phone, program_start_date, current_stage, status, notes) values
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Alice A', 'alice@example.com', '555-0001', '2026-01-05', 2, 'active',    'PRIVATE-NOTE-A'),
  ('b0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Bob B',   'bob@example.com',   '555-0002', '2026-02-02', 1, 'escalated', 'PRIVATE-NOTE-B'),
  ('c0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'Cara C',  'cara@example.com',  '555-0003', '2026-03-02', 3, 'active',    'PRIVATE-NOTE-C'),
  ('d0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Dan D',   'dan@example.com',   null,       '2025-06-01', 4, 'graduated', null);

insert into public.check_ins (id, user_id, mentee_id, check_in_number, date, lead_generation_activity, light_speed_vt_progress,
                              lofty_crm_usage, total_closed, general_assessment_notes, verification_notes, escalation_flag,
                              escalation_notes, student_commitment, specific_direction_given) values
  ('ca000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 1, '2026-01-12', 3, 2, 3, 1, 'PRIV-ASSESS-A1', 'PRIV-VERIFY-A1', false, null,            'Call 20 leads', 'Focus on SOI'),
  ('ca000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 2, '2026-01-19', 4, 3, 4, 2, 'PRIV-ASSESS-A2', null,             true,  'PRIV-ESC-A2',   'Host open house', null),
  ('cb000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 1, '2026-02-09', 2, 1, 2, 0, 'PRIV-ASSESS-B1', null,             false, null,            null, null),
  ('cc000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 1, '2026-03-09', 5, 5, 5, 3, 'PRIV-ASSESS-C1', null,             false, null,            null, null),
  -- a check-in with no private content at all
  ('cd000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 9, '2025-12-01', 5, 5, 5, 4, null,             null,             false, null,            null, null);

insert into public.mentor_feedback (id, user_id, mentee_id, date, feedback_type, strengths, overall_rating, private_notes) values
  ('fa000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '2026-01-20', 'general', 'Great calls', 2, 'PRIV-FB-A1'),
  ('fb000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', '2026-02-10', 'general', 'Punctual',    null, 'PRIV-FB-B1'),
  ('fc000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', '2026-03-10', 'general', 'Driven',      5, null),
  ('fd000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', '2025-12-02', 'general', 'Done',        null, null);

insert into public.escalations (id, user_id, mentee_id, escalation_type, situation_summary) values
  ('ea000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'mental_health', 'PRIV-ESCALATION-A'),
  ('ec000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'other',         'PRIV-ESCALATION-C');

insert into public.graduation_recommendations (id, user_id, mentee_id, mentor_recommendation_statement, nexa_lending_connected, status) values
  ('9a000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'PRIV-GRAD-A', true,  'submitted'),
  ('9d000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'PRIV-GRAD-D', true,  'submitted'),
  ('9c000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'PRIV-GRAD-C', false, 'weird-legacy');

insert into public.kickoff_sessions (id, user_id, mentee_id, agreed_check_in_cadence, initial_commitment, student_why_notes) values
  ('0a000000-0000-0000-0000-00000000000e', '10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Weekly', 'Set up CRM', 'Family'),
  ('0c000000-0000-0000-0000-00000000000e', '10000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'Biweekly', 'VT module 1', 'Freedom');
