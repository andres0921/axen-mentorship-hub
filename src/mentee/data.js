// Mentee portal data access. Queries ONLY mentee-safe tables/columns and RPCs;
// RLS enforces it anyway (private side tables, escalations and graduation
// recommendations return nothing to a mentee).
import { supabase } from '../shared/supabase.js';
import { throwIfError } from '../shared/format.js';
import { loadProgramSettings } from '../shared/program.js';

export const m = {
  mentee: null,
  mentor: null,
  progress: null,
  checkIns: [],
  kickoffs: [],
  feedback: [],
  selfCheckIns: [],
  helpRequests: [],
};

const CHECK_IN_COLUMNS = [
  'id', 'check_in_number', 'date', 'stage_at_time', 'meeting_format',
  'lead_generation_activity', 'light_speed_vt_progress', 'lofty_crm_usage',
  'transactions_in_pipeline', 'total_closed', 'specific_direction_given', 'prior_commitment_status',
  'topics_discussed', 'key_coaching_points', 'student_commitment', 'commitment_due_date',
  'next_check_in_date', 'next_check_in_format', 'created_at',
].join(', ');

const FEEDBACK_COLUMNS = 'id, date, feedback_type, strengths, areas_for_improvement, specific_observations, recommended_actions, shared_at, mentee_acknowledged_at, created_at';
const KICKOFF_COLUMNS = 'id, date_time, meeting_link, student_why_notes, expectations_notes, systems_activated, agreed_check_in_cadence, initial_commitment, next_check_in_date, created_at';

export async function loadMenteeRow() {
  const { data, error } = await supabase
    .from('mentees')
    .select('id, full_name, email, phone, program_start_date, current_stage, status, portal_access')
    .maybeSingle();
  throwIfError(error, 'Could not load your record');
  m.mentee = data;
  return data;
}

export async function loadAll() {
  const [ciRes, koRes, fbRes, sciRes, hrRes, mentorRes, progRes] = await Promise.all([
    supabase.from('check_ins').select(CHECK_IN_COLUMNS).order('date', { ascending: false }).order('created_at', { ascending: false }),
    supabase.from('kickoff_sessions').select(KICKOFF_COLUMNS).order('date_time', { ascending: false }),
    supabase.from('mentor_feedback').select(FEEDBACK_COLUMNS).order('date', { ascending: false }),
    supabase.from('self_check_ins').select('*').order('week_of', { ascending: false }),
    supabase.from('help_requests').select('id, category, urgency, message, status, mentor_response, created_at, updated_at').order('created_at', { ascending: false }),
    supabase.rpc('get_my_mentor'),
    supabase.rpc('get_my_graduation_progress'),
    loadProgramSettings(supabase),
  ]);
  throwIfError(ciRes.error, 'Could not load sessions');
  throwIfError(koRes.error, 'Could not load kickoff');
  throwIfError(fbRes.error, 'Could not load feedback');
  throwIfError(sciRes.error, 'Could not load your check-ins');
  throwIfError(hrRes.error, 'Could not load help requests');
  throwIfError(mentorRes.error, 'Could not load your mentor');
  throwIfError(progRes.error, 'Could not load graduation progress');
  m.checkIns = ciRes.data || [];
  m.kickoffs = koRes.data || [];
  m.feedback = fbRes.data || [];
  m.selfCheckIns = sciRes.data || [];
  m.helpRequests = hrRes.data || [];
  m.mentor = Array.isArray(mentorRes.data) ? (mentorRes.data[0] || null) : (mentorRes.data || null);
  m.progress = progRes.data || null;
}

export async function acceptInvitation() {
  const { error } = await supabase.rpc('accept_invitation');
  throwIfError(error, 'Could not activate your portal');
}

export async function updateMyPhone(phone) {
  const { error } = await supabase.rpc('update_my_phone', { p_phone: phone || null });
  throwIfError(error, 'Could not update your phone');
}

export async function saveSelfCheckIn(id, fields) {
  if (id) {
    const { data, error } = await supabase.from('self_check_ins').update(fields).eq('id', id).select('id');
    throwIfError(error, 'Could not update your check-in');
    if (!data || !data.length) throw new Error('This check-in has already been reviewed by your mentor and can no longer be edited.');
    return;
  }
  const { error } = await supabase.from('self_check_ins').insert({ ...fields, mentee_id: m.mentee.id });
  if (error && error.code === '23505') throw new Error('You already submitted a check-in for this week. Edit it instead.');
  throwIfError(error, 'Could not submit your check-in');
}

export async function submitHelpRequest({ category, urgency, message }) {
  const { error } = await supabase.from('help_requests').insert({ mentee_id: m.mentee.id, category, urgency, message });
  throwIfError(error, 'Could not send your request');
}

export async function cancelHelpRequest(id) {
  const { error } = await supabase.rpc('cancel_help_request', { p_id: id });
  throwIfError(error, 'Could not cancel the request');
}

export async function acknowledgeFeedback(id) {
  const { error } = await supabase.rpc('acknowledge_feedback', { p_feedback_id: id });
  throwIfError(error, 'Could not acknowledge');
}
