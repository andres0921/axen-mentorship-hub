// Data access for the mentor/admin app. Private fields are read from and
// written to the staff-only side tables (mentee_private_notes, check_in_private,
// mentor_feedback_private).
import { supabase } from '../shared/supabase.js';
import { throwIfError } from '../shared/format.js';
import { loadProgramSettings } from '../shared/program.js';
import { INVITE_FUNCTION, SUPABASE_URL, SUPABASE_ANON_KEY } from '../shared/config.js';
import { state, render, isAdmin } from './state.js';

export async function loadFromSupabase() {
  if (!state.user) return;
  const [menteesRes, checkInsRes, escalationsRes, graduationsRes, feedbackRes, kickoffsRes,
    notesRes, ciPrivRes, fbPrivRes, selfRes, helpRes, invRes, profilesRes] = await Promise.all([
    supabase.from('mentees').select('*').order('created_at', { ascending: false }),
    supabase.from('check_ins').select('*').order('date', { ascending: false }),
    supabase.from('escalations').select('*').order('created_at', { ascending: false }),
    supabase.from('graduation_recommendations').select('*').order('created_at', { ascending: false }),
    supabase.from('mentor_feedback').select('*').order('date', { ascending: false }),
    supabase.from('kickoff_sessions').select('*').order('date_time', { ascending: false }),
    supabase.from('mentee_private_notes').select('*'),
    supabase.from('check_in_private').select('*'),
    supabase.from('mentor_feedback_private').select('*'),
    supabase.from('self_check_ins').select('*').order('week_of', { ascending: false }),
    supabase.from('help_requests').select('*').order('created_at', { ascending: false }),
    supabase.from('invitations').select('*').order('sent_at', { ascending: false }),
    supabase.from('profiles').select('id, role, full_name, email'),
    loadProgramSettings(supabase),
  ]);
  throwIfError(menteesRes.error, 'Could not load mentees');
  throwIfError(checkInsRes.error, 'Could not load check-ins');
  throwIfError(escalationsRes.error, 'Could not load escalations');
  throwIfError(graduationsRes.error, 'Could not load graduation recommendations');
  throwIfError(feedbackRes.error, 'Could not load mentor feedback');
  throwIfError(kickoffsRes.error, 'Could not load kickoff sessions');
  throwIfError(notesRes.error, 'Could not load private notes');
  throwIfError(ciPrivRes.error, 'Could not load private check-in notes');
  throwIfError(fbPrivRes.error, 'Could not load private feedback notes');
  throwIfError(selfRes.error, 'Could not load self check-ins');
  throwIfError(helpRes.error, 'Could not load help requests');
  throwIfError(invRes.error, 'Could not load invitations');
  throwIfError(profilesRes.error, 'Could not load profiles');

  const notesBy = new Map((notesRes.data || []).map(n => [n.mentee_id, n.notes]));
  const ciPrivBy = new Map((ciPrivRes.data || []).map(p => [p.check_in_id, p]));
  const fbPrivBy = new Map((fbPrivRes.data || []).map(p => [p.feedback_id, p]));

  state.mentees = (menteesRes.data || []).map(m => ({
    id: m.id,
    userId: m.user_id,
    fullName: m.full_name,
    email: m.email,
    phone: m.phone,
    programStartDate: m.program_start_date,
    currentStage: m.current_stage,
    status: m.status,
    notes: notesBy.get(m.id) ?? null,
    menteeUserId: m.mentee_user_id,
    portalAccess: m.portal_access || 'none',
    createdAt: m.created_at,
    updatedAt: m.updated_at,
  }));
  state.checkIns = (checkInsRes.data || []).map(c => {
    const p = ciPrivBy.get(c.id) || {};
    return {
      id: c.id,
      userId: c.user_id,
      menteeId: c.mentee_id,
      checkInNumber: c.check_in_number,
      date: c.date,
      stageAtTime: c.stage_at_time,
      meetingFormat: c.meeting_format,
      leadGenerationActivity: c.lead_generation_activity,
      lightSpeedVtProgress: c.light_speed_vt_progress,
      loftyCrmUsage: c.lofty_crm_usage,
      transactionsInPipeline: c.transactions_in_pipeline,
      totalClosed: c.total_closed,
      generalAssessmentNotes: p.general_assessment_notes ?? null,
      specificDirectionGiven: c.specific_direction_given,
      priorCommitmentStatus: c.prior_commitment_status,
      verificationNotes: p.verification_notes ?? null,
      topicsDiscussed: c.topics_discussed,
      keyCoachingPoints: c.key_coaching_points,
      studentCommitment: c.student_commitment,
      commitmentDueDate: c.commitment_due_date,
      escalationFlag: !!p.escalation_flag,
      escalationNotes: p.escalation_notes ?? null,
      nextCheckInDate: c.next_check_in_date,
      nextCheckInFormat: c.next_check_in_format,
      sharedWithMentee: !!c.shared_with_mentee,
      createdAt: c.created_at,
    };
  });
  state.escalations = escalationsRes.data || [];
  state.graduations = graduationsRes.data || [];
  state.feedback = (feedbackRes.data || []).map(f => {
    const p = fbPrivBy.get(f.id) || {};
    return { ...f, private_notes: p.private_notes ?? null, overall_rating: p.overall_rating ?? null };
  });
  state.kickoffs = kickoffsRes.data || [];
  state.selfCheckIns = selfRes.data || [];
  state.helpRequests = helpRes.data || [];
  state.invitations = invRes.data || [];
  state.profiles = Object.fromEntries((profilesRes.data || []).map(p => [p.id, p]));
  render();
}

// Inserts when the mentee has no database id yet, otherwise updates.
// On insert, the database-generated id is written back onto `mentee.id`.
// Private notes live in mentee_private_notes (saveMenteeNotes).
export async function saveMentee(mentee, { previousStatus } = {}) {
  // The DB trigger mentees_guard_graduation rejects non-admins setting
  // 'graduated'; fail early with a clear message instead.
  if (mentee.status === 'graduated' && !isAdmin() && previousStatus !== 'graduated') {
    throw new Error('Only the program admin can mark a mentee graduated. Submit a graduation recommendation instead.');
  }
  const payload = {
    full_name: mentee.fullName,
    email: mentee.email,
    phone: mentee.phone,
    program_start_date: mentee.programStartDate,
    current_stage: mentee.currentStage,
    status: mentee.status,
  };
  if (mentee.id) {
    payload.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from('mentees').update(payload).eq('id', mentee.id).select('id');
    throwIfError(error, 'Could not update mentee');
    if (!data || !data.length) throw new Error('Could not update mentee: you do not have permission to edit this mentee.');
  } else {
    payload.user_id = state.user.id;
    const { data, error } = await supabase.from('mentees').insert(payload).select().single();
    throwIfError(error, 'Could not create mentee');
    if (!data || !data.id) throw new Error('Could not create mentee: no id was returned');
    mentee.id = data.id;
  }
  return mentee;
}

export async function saveMenteeNotes(menteeId, notes) {
  const { error } = await supabase
    .from('mentee_private_notes')
    .upsert({ mentee_id: menteeId, notes: notes || null }, { onConflict: 'mentee_id' });
  throwIfError(error, 'Could not save private notes');
}

export async function saveCheckIn(checkIn) {
  const payload = {
    user_id: state.user.id,
    mentee_id: checkIn.menteeId,
    check_in_number: checkIn.checkInNumber,
    date: checkIn.date,
    stage_at_time: checkIn.stageAtTime,
    meeting_format: checkIn.meetingFormat,
    lead_generation_activity: checkIn.leadGenerationActivity,
    light_speed_vt_progress: checkIn.lightSpeedVtProgress,
    lofty_crm_usage: checkIn.loftyCrmUsage,
    transactions_in_pipeline: checkIn.transactionsInPipeline,
    total_closed: checkIn.totalClosed,
    specific_direction_given: checkIn.specificDirectionGiven,
    prior_commitment_status: checkIn.priorCommitmentStatus,
    topics_discussed: checkIn.topicsDiscussed,
    key_coaching_points: checkIn.keyCoachingPoints,
    student_commitment: checkIn.studentCommitment,
    commitment_due_date: checkIn.commitmentDueDate,
    next_check_in_date: checkIn.nextCheckInDate,
    next_check_in_format: checkIn.nextCheckInFormat,
    shared_with_mentee: !!checkIn.sharedWithMentee,
  };
  const { data, error } = await supabase.from('check_ins').insert(payload).select('id').single();
  throwIfError(error, 'Could not save check-in');
  const { error: privErr } = await supabase.from('check_in_private').upsert({
    check_in_id: data.id,
    mentee_id: checkIn.menteeId,
    general_assessment_notes: checkIn.generalAssessmentNotes,
    verification_notes: checkIn.verificationNotes,
    escalation_flag: !!checkIn.escalationFlag,
    escalation_notes: checkIn.escalationNotes,
  }, { onConflict: 'check_in_id' });
  if (privErr) {
    // Best-effort rollback so we don't keep a check-in without its private half.
    await supabase.from('check_ins').delete().eq('id', data.id);
    throwIfError(privErr, 'Could not save check-in private notes');
  }
}

export async function saveFeedback(fb) {
  const payload = {
    user_id: state.user.id,
    mentee_id: fb.menteeId,
    date: fb.date,
    feedback_type: fb.feedbackType,
    strengths: fb.strengths,
    areas_for_improvement: fb.areasForImprovement,
    specific_observations: fb.specificObservations,
    recommended_actions: fb.recommendedActions,
    shared_with_mentee: !!fb.sharedWithMentee,
  };
  const { data, error } = await supabase.from('mentor_feedback').insert(payload).select('id').single();
  throwIfError(error, 'Could not save feedback');
  if (fb.privateNotes || fb.overallRating) {
    const { error: privErr } = await supabase.from('mentor_feedback_private').upsert({
      feedback_id: data.id,
      mentee_id: fb.menteeId,
      private_notes: fb.privateNotes,
      overall_rating: fb.overallRating,
    }, { onConflict: 'feedback_id' });
    if (privErr) {
      await supabase.from('mentor_feedback').delete().eq('id', data.id);
      throwIfError(privErr, 'Could not save private feedback notes');
    }
  }
}

export async function saveKickoff(k) {
  const payload = {
    user_id: state.user.id,
    mentee_id: k.menteeId,
    date_time: k.dateTime,
    meeting_link: k.meetingLink,
    student_why_notes: k.studentWhyNotes,
    expectations_notes: k.expectationsNotes,
    systems_activated: k.systemsActivated,
    agreed_check_in_cadence: k.agreedCheckInCadence,
    initial_commitment: k.initialCommitment,
    next_check_in_date: k.nextCheckInDate,
  };
  const { error } = await supabase.from('kickoff_sessions').insert(payload);
  throwIfError(error, 'Could not save kickoff session');
}

export async function saveEscalation(escalation) {
  const payload = {
    user_id: state.user.id,
    mentee_id: escalation.menteeId,
    date_of_submission: escalation.dateOfSubmission,
    student_program_stage: escalation.studentProgramStage,
    escalation_type: escalation.escalationType,
    situation_summary: escalation.situationSummary,
    actions_already_taken: escalation.actionsAlreadyTaken,
    recommended_next_step: escalation.recommendedNextStep,
    additional_context: escalation.additionalContext,
    status: 'submitted',
  };
  const { data, error } = await supabase.from('escalations').insert(payload).select('id').single();
  throwIfError(error, 'Could not save escalation');
  return data ? data.id : null;
}

// Status is set by the database ('submitted'); only the admin can approve.
export async function saveGraduation(grad) {
  const payload = {
    user_id: state.user.id,
    mentee_id: grad.menteeId,
    date_of_submission: grad.dateOfSubmission,
    program_start_date: grad.programStartDate,
    closed_transactions_confirmed: grad.closedTransactionsConfirmed,
    light_speed_vt_completed: grad.lightSpeedVtCompleted,
    nexa_lending_connected: grad.nexaLendingConnected,
    lofty_crm_proficient: grad.loftyCrmProficient,
    mentor_recommends: grad.mentorRecommends,
    closed_transactions: grad.closedTransactions,
    mentor_recommendation_statement: grad.mentorRecommendationStatement,
  };
  const { error } = await supabase.from('graduation_recommendations').insert(payload);
  throwIfError(error, 'Could not save graduation recommendation');
}

// --- sharing -----------------------------------------------------------------
export async function setCheckInShared(id, shared) {
  const { data, error } = await supabase.from('check_ins').update({ shared_with_mentee: shared }).eq('id', id).select('id');
  throwIfError(error, 'Could not update sharing');
  if (!data || !data.length) throw new Error('Only the mentor who wrote this check-in can change its sharing. Use "Share all past check-ins" instead.');
}

export async function setFeedbackShared(id, shared) {
  const { data, error } = await supabase.from('mentor_feedback').update({ shared_with_mentee: shared }).eq('id', id).select('id');
  throwIfError(error, 'Could not update sharing');
  if (!data || !data.length) throw new Error('Only the mentor who wrote this feedback can change its sharing.');
}

export async function shareAllPastCheckIns(menteeId) {
  const { data, error } = await supabase.rpc('share_all_past_check_ins', { p_mentee_id: menteeId });
  throwIfError(error, 'Could not share check-ins');
  return data;
}

export async function shareAllPastFeedback(menteeId) {
  const { data, error } = await supabase.rpc('share_all_past_feedback', { p_mentee_id: menteeId });
  throwIfError(error, 'Could not share feedback');
  return data;
}

// --- mentee-authored items ---------------------------------------------------
export async function markSelfCheckInReviewed(id) {
  const { error } = await supabase.rpc('mark_self_check_in_reviewed', { p_id: id });
  throwIfError(error, 'Could not mark reviewed');
}

export async function respondToHelpRequest(id, { status, response }) {
  const { error } = await supabase
    .from('help_requests')
    .update({ status, mentor_response: response || null })
    .eq('id', id);
  throwIfError(error, 'Could not update help request');
}

// Help request converted into an escalation: link it and mark it escalated.
export async function linkHelpRequestToEscalation(helpRequestId, escalationId) {
  const { error } = await supabase
    .from('help_requests')
    .update({ status: 'escalated', escalation_id: escalationId })
    .eq('id', helpRequestId);
  throwIfError(error, 'Escalation saved, but the help request could not be linked to it');
}

// --- portal access (Edge Function) -------------------------------------------
// POST ${SUPABASE_URL}/functions/v1/invite-mentee {action, menteeId}.
// Errors come back as JSON {error, message}.
export async function portalAccess(action, menteeId) {
  if (!['invite', 'resend', 'revoke'].includes(action)) throw new Error('Unknown portal action.');
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  throwIfError(sessionErr, 'Could not read your session');
  const token = sessionData && sessionData.session && sessionData.session.access_token;
  if (!token) throw new Error('Your session has expired. Please sign in again.');

  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/${INVITE_FUNCTION}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, menteeId }),
    });
  } catch (err) {
    throw new Error(`Could not reach the invite service: ${err && err.message ? err.message : err}`);
  }
  let body = null;
  try {
    body = await res.json();
  } catch { /* non-JSON response */ }
  if (!res.ok) {
    const message = (body && (body.message || body.error)) || `Invite service error (HTTP ${res.status})`;
    throw new Error(message);
  }
  return body;
}

// --- admin -------------------------------------------------------------------
export async function reviewGraduation(id, decision, note) {
  if (!isAdmin()) throw new Error('Only the program admin can review graduations.');
  const { error } = await supabase.rpc('review_graduation', { p_id: id, p_decision: decision, p_note: note || null });
  throwIfError(error, 'Could not review graduation');
}

export async function updateMyProfile(fields) {
  const { error } = await supabase.from('profiles').update(fields).eq('id', state.user.id);
  throwIfError(error, 'Could not update your profile');
}
