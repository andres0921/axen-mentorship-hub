// Axen Mentorship Hub — Supabase-backed
const SUPABASE_URL = 'https://chcmdibksurpfozbysqj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNoY21kaWJrc3VycGZvemJ5c3FqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5Mjk4OTQsImV4cCI6MjEwNzUwNTg5NH0.O6qpMcI1f6venAH51BPmi78WSxDgisSU2KbJNJKjoWg';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function emptyState() {
  return {
    mentees: [],
    checkIns: [],
    escalations: [],
    graduations: [],
    kickoffs: [],
    feedback: [],
    currentView: 'dashboard',
    selectedMenteeId: null,
    prefillMenteeId: null,
    user: null
  };
}

let state = emptyState();

function today() {
  return new Date().toISOString().slice(0, 10);
}

// HTML-escape any value before interpolating it into innerHTML / template strings.
function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Show an error to the user. Always logs to the console as well.
function reportError(err) {
  console.error(err);
  const message = (err && err.message) ? err.message : String(err);
  alert(message);
}

// Throw if a Supabase response carries an error.
function throwIfError(error, what) {
  if (error) throw new Error(`${what}: ${error.message}`);
}

// Run a form submission: disables the submit button while working and reports
// any error without navigating away. `fn` should only navigate after every
// save/load step succeeded.
async function runSubmit(form, fn) {
  const btn = form.querySelector('[type="submit"]');
  if (btn) btn.disabled = true;
  try {
    await fn();
  } catch (err) {
    reportError(err);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Data access
// ---------------------------------------------------------------------------

async function loadFromSupabase() {
  if (!state.user) return;
  const [menteesRes, checkInsRes, escalationsRes, graduationsRes, feedbackRes, kickoffsRes] = await Promise.all([
    supabaseClient.from('mentees').select('*').order('created_at', { ascending: false }),
    supabaseClient.from('check_ins').select('*').order('date', { ascending: false }),
    supabaseClient.from('escalations').select('*').order('created_at', { ascending: false }),
    supabaseClient.from('graduation_recommendations').select('*').order('created_at', { ascending: false }),
    supabaseClient.from('mentor_feedback').select('*').order('date', { ascending: false }),
    supabaseClient.from('kickoff_sessions').select('*').order('date_time', { ascending: false })
  ]);
  throwIfError(menteesRes.error, 'Could not load mentees');
  throwIfError(checkInsRes.error, 'Could not load check-ins');
  throwIfError(escalationsRes.error, 'Could not load escalations');
  throwIfError(graduationsRes.error, 'Could not load graduation recommendations');
  throwIfError(feedbackRes.error, 'Could not load mentor feedback');
  throwIfError(kickoffsRes.error, 'Could not load kickoff sessions');

  state.mentees = (menteesRes.data || []).map(m => ({
    id: m.id,
    fullName: m.full_name,
    email: m.email,
    phone: m.phone,
    programStartDate: m.program_start_date,
    currentStage: m.current_stage,
    status: m.status,
    notes: m.notes,
    createdAt: m.created_at,
    updatedAt: m.updated_at
  }));
  state.checkIns = (checkInsRes.data || []).map(c => ({
    id: c.id,
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
    generalAssessmentNotes: c.general_assessment_notes,
    specificDirectionGiven: c.specific_direction_given,
    priorCommitmentStatus: c.prior_commitment_status,
    verificationNotes: c.verification_notes,
    topicsDiscussed: c.topics_discussed,
    keyCoachingPoints: c.key_coaching_points,
    studentCommitment: c.student_commitment,
    commitmentDueDate: c.commitment_due_date,
    escalationFlag: c.escalation_flag,
    escalationNotes: c.escalation_notes,
    nextCheckInDate: c.next_check_in_date,
    nextCheckInFormat: c.next_check_in_format,
    createdAt: c.created_at
  }));
  state.escalations = escalationsRes.data || [];
  state.graduations = graduationsRes.data || [];
  state.feedback = feedbackRes.data || [];
  state.kickoffs = kickoffsRes.data || [];
  render();
}

// Inserts when the mentee has no database id yet, otherwise updates.
// On insert, the database-generated id is written back onto `mentee.id`.
async function saveMentee(mentee) {
  const payload = {
    full_name: mentee.fullName,
    email: mentee.email,
    phone: mentee.phone,
    program_start_date: mentee.programStartDate,
    current_stage: mentee.currentStage,
    status: mentee.status,
    notes: mentee.notes
  };
  if (mentee.id) {
    payload.updated_at = new Date().toISOString();
    const { error } = await supabaseClient.from('mentees').update(payload).eq('id', mentee.id);
    throwIfError(error, 'Could not update mentee');
  } else {
    payload.user_id = state.user.id;
    const { data, error } = await supabaseClient.from('mentees').insert(payload).select().single();
    throwIfError(error, 'Could not create mentee');
    if (!data || !data.id) throw new Error('Could not create mentee: no id was returned');
    mentee.id = data.id;
  }
  return mentee;
}

async function saveCheckIn(checkIn) {
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
    general_assessment_notes: checkIn.generalAssessmentNotes,
    specific_direction_given: checkIn.specificDirectionGiven,
    prior_commitment_status: checkIn.priorCommitmentStatus,
    verification_notes: checkIn.verificationNotes,
    topics_discussed: checkIn.topicsDiscussed,
    key_coaching_points: checkIn.keyCoachingPoints,
    student_commitment: checkIn.studentCommitment,
    commitment_due_date: checkIn.commitmentDueDate,
    escalation_flag: checkIn.escalationFlag,
    escalation_notes: checkIn.escalationNotes,
    next_check_in_date: checkIn.nextCheckInDate,
    next_check_in_format: checkIn.nextCheckInFormat
  };
  const { error } = await supabaseClient.from('check_ins').insert(payload);
  throwIfError(error, 'Could not save check-in');
}

async function saveFeedback(fb) {
  const payload = {
    user_id: state.user.id,
    mentee_id: fb.menteeId,
    date: fb.date,
    feedback_type: fb.feedbackType,
    strengths: fb.strengths,
    areas_for_improvement: fb.areasForImprovement,
    specific_observations: fb.specificObservations,
    recommended_actions: fb.recommendedActions,
    overall_rating: fb.overallRating,
    private_notes: fb.privateNotes
  };
  const { error } = await supabaseClient.from('mentor_feedback').insert(payload);
  throwIfError(error, 'Could not save feedback');
}

async function saveKickoff(k) {
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
    next_check_in_date: k.nextCheckInDate
  };
  const { error } = await supabaseClient.from('kickoff_sessions').insert(payload);
  throwIfError(error, 'Could not save kickoff session');
}

async function saveEscalation(escalation) {
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
    status: 'submitted'
  };
  const { error } = await supabaseClient.from('escalations').insert(payload);
  throwIfError(error, 'Could not save escalation');
}

async function saveGraduation(grad) {
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
    status: 'submitted'
  };
  const { error } = await supabaseClient.from('graduation_recommendations').insert(payload);
  throwIfError(error, 'Could not save graduation recommendation');
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

const authOverlay = document.getElementById('auth-overlay');
const authForm = document.getElementById('auth-form');
const authToggle = document.getElementById('auth-toggle');
const authMessage = document.getElementById('auth-message');
const signOutBtn = document.getElementById('signout-btn');
let isSignUp = false;
let loadedUserId = null;

function showAuthMessage(text, kind = 'error') {
  authMessage.textContent = text;
  authMessage.classList.toggle('text-red-600', kind === 'error');
  authMessage.classList.toggle('text-emerald-700', kind === 'info');
  authMessage.classList.remove('hidden');
}

function hideAuthMessage() {
  authMessage.classList.add('hidden');
}

function renderLoadError(err) {
  const message = (err && err.message) ? err.message : String(err);
  app.innerHTML = `
    <div class="card p-6 border border-red-200">
      <div class="font-medium text-red-700">Could not load your data</div>
      <div class="text-sm mt-2 text-navy-700/80">${esc(message)}</div>
      <button type="button" onclick="retryLoad()" class="mt-4 text-sm px-4 py-2 rounded-lg border border-navy-200">Retry</button>
    </div>
  `;
}

async function retryLoad() {
  try {
    await loadFromSupabase();
  } catch (err) {
    reportError(err);
    renderLoadError(err);
  }
}

// Enter the app for a confirmed session. Safe to call repeatedly; data is only
// loaded once per signed-in user.
async function enterApp(session) {
  if (!session || !session.user) return;
  state.user = session.user;
  authOverlay.classList.add('hidden');
  signOutBtn.classList.remove('hidden');
  hideAuthMessage();
  if (loadedUserId === session.user.id) return;
  loadedUserId = session.user.id;
  try {
    await loadFromSupabase();
  } catch (err) {
    reportError(err);
    renderLoadError(err);
  }
}

function leaveApp() {
  state = emptyState();
  loadedUserId = null;
  document.getElementById('modal-root').innerHTML = '';
  document.getElementById('auth-password').value = '';
  signOutBtn.classList.add('hidden');
  authOverlay.classList.remove('hidden');
  render();
}

authToggle.onclick = () => {
  isSignUp = !isSignUp;
  document.getElementById('auth-submit').textContent = isSignUp ? 'Create Account' : 'Sign In';
  authToggle.textContent = isSignUp ? 'Already have an account? Sign in' : 'Need an account? Sign up';
  hideAuthMessage();
};

authForm.onsubmit = async (e) => {
  e.preventDefault();
  const email = document.getElementById('auth-email').value;
  const password = document.getElementById('auth-password').value;
  const submitBtn = document.getElementById('auth-submit');
  hideAuthMessage();
  submitBtn.disabled = true;
  try {
    const result = isSignUp
      ? await supabaseClient.auth.signUp({ email, password })
      : await supabaseClient.auth.signInWithPassword({ email, password });
    if (result.error) {
      showAuthMessage(result.error.message);
      return;
    }
    const session = result.data && result.data.session;
    if (session) {
      await enterApp(session);
    } else if (isSignUp && result.data && result.data.user) {
      // Email confirmation is required: no session until the link is clicked.
      showAuthMessage('Account created. Check your email to confirm your account, then sign in.', 'info');
    } else {
      showAuthMessage('Sign-in did not return a session. Please try again.');
    }
  } catch (err) {
    showAuthMessage(err.message || String(err));
  } finally {
    submitBtn.disabled = false;
  }
};

signOutBtn.onclick = async () => {
  signOutBtn.disabled = true;
  try {
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
      reportError(new Error(`Could not sign out: ${error.message}`));
      return;
    }
    leaveApp();
  } finally {
    signOutBtn.disabled = false;
  }
};

// Keep the UI in sync with auth state (token refresh, sign-out in another tab,
// confirmed session restored, etc.). Supabase calls are deferred out of the
// callback to avoid blocking the auth client.
supabaseClient.auth.onAuthStateChange((event, session) => {
  setTimeout(() => {
    if (session && session.user) {
      enterApp(session);
    } else if (event === 'SIGNED_OUT' || state.user) {
      leaveApp();
    }
  }, 0);
});

// Check existing session
supabaseClient.auth.getSession().then(({ data, error }) => {
  if (error) {
    showAuthMessage(`Could not restore session: ${error.message}`);
    authOverlay.classList.remove('hidden');
    return;
  }
  if (data && data.session) {
    enterApp(data.session);
  } else {
    authOverlay.classList.remove('hidden');
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysInProgram(start) {
  if (!start) return 0;
  const d = Math.floor((Date.now() - new Date(start).getTime()) / 86400000);
  return Math.max(0, d);
}

function previousCheckIn(menteeId) {
  const list = state.checkIns
    .filter(c => c.menteeId === menteeId)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  return list[1] || null;
}

function latestCheckIn(menteeId) {
  return state.checkIns
    .filter(c => c.menteeId === menteeId)
    .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
}

function trendArrow(current, previous) {
  if (current == null || previous == null) return '';
  if (current > previous) return '<span class="text-emerald-600 text-xs ml-0.5">↑</span>';
  if (current < previous) return '<span class="text-red-600 text-xs ml-0.5">↓</span>';
  return '<span class="text-navy-700/40 text-xs ml-0.5">→</span>';
}

function avgScore(menteeId) {
  const latest = latestCheckIn(menteeId);
  if (!latest) return null;
  const scores = [latest.leadGenerationActivity, latest.lightSpeedVtProgress, latest.loftyCrmUsage].filter(Boolean);
  if (!scores.length) return null;
  return (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const app = document.getElementById('app');
const titleEl = document.getElementById('page-title');
const subtitleEl = document.getElementById('page-subtitle');

function setActiveNav(view) {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
}

function render() {
  const view = state.currentView || 'dashboard';
  setActiveNav(view);
  app.innerHTML = '';
  app.classList.add('view-enter');
  setTimeout(() => app.classList.remove('view-enter'), 250);

  if (view === 'dashboard') renderDashboard();
  else if (view === 'mentees') renderMentees();
  else if (view === 'mentee') renderMenteeDetail(state.selectedMenteeId);
  else if (view === 'checkin') renderCheckInForm();
  else if (view === 'escalation') renderEscalationForm();
  else if (view === 'graduation') renderGraduationForm();
  else if (view === 'feedback') renderFeedbackForm();
  else if (view === 'kickoff') renderKickoffForm();
  else if (view === 'commitments') renderCommitments();
}

function renderDashboard() {
  titleEl.textContent = 'Dashboard';
  subtitleEl.textContent = 'Overview of your mentees';

  const active = state.mentees.filter(m => m.status === 'active').length;
  const escalated = state.mentees.filter(m => m.status === 'escalated').length;
  const graduated = state.mentees.filter(m => m.status === 'graduated').length;

  let html = `
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      <div class="card p-6">
        <div class="text-sm text-navy-700/60">Active Mentees</div>
        <div class="text-4xl font-display mt-1">${active}</div>
      </div>
      <div class="card p-6">
        <div class="text-sm text-navy-700/60">Escalated</div>
        <div class="text-4xl font-display mt-1 text-amber-700">${escalated}</div>
      </div>
      <div class="card p-6">
        <div class="text-sm text-navy-700/60">Graduated</div>
        <div class="text-4xl font-display mt-1 text-emerald-700">${graduated}</div>
      </div>
    </div>
    <h2 class="section-title text-2xl mb-4">Feedback Due</h2>
    <div id="feedback-due" class="mb-8"></div>
    <h2 class="section-title text-2xl mb-4">Your Mentees</h2>
    <div class="mb-4 flex gap-3">
      <input id="mentee-search" type="text" placeholder="Search name..." class="border border-navy-200 rounded-lg px-3 py-2 text-sm" oninput="filterMentees()">
      <select id="status-filter" class="border border-navy-200 rounded-lg px-3 py-2 text-sm" onchange="filterMentees()">
        <option value="">All statuses</option>
        <option value="active">Active</option>
        <option value="escalated">Escalated</option>
        <option value="graduated">Graduated</option>
        <option value="paused">Paused</option>
      </select>
    </div>
    <div id="mentee-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  `;

  state.mentees.forEach(m => {
    const latest = latestCheckIn(m.id);
    const prev = previousCheckIn(m.id);
    const score = avgScore(m.id);
    const days = daysInProgram(m.programStartDate);
    html += `
      <div class="card p-6 cursor-pointer" data-mentee-id="${esc(m.id)}" onclick="openMentee(this.dataset.menteeId)">
        <div class="flex items-start justify-between">
          <div>
            <div class="font-semibold text-lg">${esc(m.fullName)}</div>
            <div class="text-sm text-navy-700/60 mt-0.5">Stage ${esc(m.currentStage) || '—'} · ${days} days · Target ${esc(stageTarget(m.currentStage))} closed</div>
          </div>
          <span class="text-xs px-2.5 py-1 rounded-full ${statusClass(m.status)}">${esc(m.status)}</span>
        </div>
        <div class="mt-5 flex items-center gap-4">
          ${score ? `<div class="score-pill score-${Math.round(score)}">${esc(score)}</div>` : '<div class="text-sm text-navy-700/40">No scores yet</div>'}
          <div class="text-sm text-navy-700/70">
            ${latest ? `Last check-in ${esc(formatDate(latest.date))}` : 'No check-ins'}
          </div>
        </div>
        ${latest ? `
          <div class="mt-4 grid grid-cols-3 gap-2 text-xs">
            <div class="text-center"><div class="text-navy-700/50">Lead Gen</div><div class="font-medium">${esc(latest.leadGenerationActivity) || '—'}${trendArrow(latest.leadGenerationActivity, prev && prev.leadGenerationActivity)}</div></div>
            <div class="text-center"><div class="text-navy-700/50">VT</div><div class="font-medium">${esc(latest.lightSpeedVtProgress) || '—'}${trendArrow(latest.lightSpeedVtProgress, prev && prev.lightSpeedVtProgress)}</div></div>
            <div class="text-center"><div class="text-navy-700/50">CRM</div><div class="font-medium">${esc(latest.loftyCrmUsage) || '—'}${trendArrow(latest.loftyCrmUsage, prev && prev.loftyCrmUsage)}</div></div>
          </div>
        ` : ''}
      </div>
    `;
  });

  html += `</div>`;
  if (state.mentees.length === 0) {
    html += `<div class="text-center py-16 text-navy-700/50">No mentees yet. Click “Add Mentee” to get started.</div>`;
  }
  app.innerHTML = html;

  // Feedback reminders (no feedback in last 7 days for active mentees)
  const dueEl = document.getElementById('feedback-due');
  if (dueEl) {
    const sevenDaysAgo = Date.now() - 7 * 86400000;
    const due = state.mentees
      .filter(m => m.status === 'active')
      .map(m => {
        const latest = (state.feedback || [])
          .filter(f => f.mentee_id === m.id)
          .sort((a, b) => new Date(b.date || b.created_at) - new Date(a.date || a.created_at))[0];
        const lastDate = latest ? new Date(latest.date || latest.created_at).getTime() : 0;
        return { mentee: m, lastDate, daysSince: lastDate ? Math.floor((Date.now() - lastDate) / 86400000) : null };
      })
      .filter(x => !x.lastDate || x.lastDate < sevenDaysAgo);

    if (due.length === 0) {
      dueEl.innerHTML = `<div class="card p-4 text-sm text-navy-700/60">All active mentees have recent feedback. ✓</div>`;
    } else {
      dueEl.innerHTML = due.map(x => `
        <div class="card p-4 mb-3 flex items-center justify-between">
          <div>
            <div class="font-medium">${esc(x.mentee.fullName)}</div>
            <div class="text-sm text-navy-700/60">${x.daysSince === null ? 'No feedback yet' : `Last feedback ${x.daysSince} days ago`}</div>
          </div>
          <button data-mentee-id="${esc(x.mentee.id)}" onclick="state.currentView='feedback'; state.prefillMenteeId=this.dataset.menteeId; render()" class="text-sm px-4 py-2 rounded-lg bg-gold-500 text-navy-900 font-medium">Give Feedback</button>
        </div>
      `).join('');
    }
  }
}

function stageTarget(stage) {
  const map = { 1: 2, 2: 4, 3: 8, 4: 12 };
  return map[stage] || '—';
}

function filterMentees() {
  const q = (document.getElementById('mentee-search')?.value || '').toLowerCase();
  const status = document.getElementById('status-filter')?.value || '';
  document.querySelectorAll('#mentee-grid .card').forEach(card => {
    const name = card.querySelector('.font-semibold')?.textContent.toLowerCase() || '';
    const st = card.querySelector('[class*="rounded-full"]')?.textContent || '';
    const matchQ = !q || name.includes(q);
    const matchS = !status || st === status;
    card.style.display = matchQ && matchS ? '' : 'none';
  });
}

function statusClass(status) {
  const map = {
    active: 'bg-emerald-100 text-emerald-800',
    paused: 'bg-amber-100 text-amber-800',
    escalated: 'bg-red-100 text-red-800',
    graduated: 'bg-gold-100 text-gold-800',
    dropped: 'bg-gray-100 text-gray-600'
  };
  return map[status] || 'bg-gray-100';
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function openMentee(id) {
  state.selectedMenteeId = id;
  state.currentView = 'mentee';
  render();
}

function renderCommitments() {
  titleEl.textContent = 'Open Commitments';
  subtitleEl.textContent = 'Student commitments across all mentees';
  const items = [];
  state.checkIns.forEach(c => {
    if (c.studentCommitment) {
      const m = state.mentees.find(x => x.id === c.menteeId);
      items.push({
        mentee: m ? m.fullName : 'Unknown',
        commitment: c.studentCommitment,
        due: c.commitmentDueDate,
        date: c.date,
        status: c.priorCommitmentStatus
      });
    }
  });
  items.sort((a, b) => (a.due || '9999') > (b.due || '9999') ? 1 : -1);
  let html = `<div class="space-y-3">`;
  if (!items.length) html += `<div class="card p-8 text-center text-navy-700/50">No commitments recorded yet.</div>`;
  else items.forEach(i => {
    html += `
      <div class="card p-4 flex justify-between items-start">
        <div>
          <div class="font-medium">${esc(i.mentee)}</div>
          <div class="text-sm mt-1">${esc(i.commitment)}</div>
          <div class="text-xs text-navy-700/50 mt-1">From check-in ${esc(formatDate(i.date))}${i.due ? ` · Due ${esc(formatDate(i.due))}` : ''}</div>
        </div>
        ${i.status ? `<span class="text-xs px-2 py-1 rounded-full bg-navy-100">${esc(i.status)}</span>` : ''}
      </div>
    `;
  });
  html += `</div>`;
  app.innerHTML = html;
}

function renderMentees() {
  titleEl.textContent = 'Mentees';
  subtitleEl.textContent = 'All students in the program';
  renderDashboard(); // reuse for now
}

// One labelled line for the check-in history; omitted when the value is empty.
function detailLine(label, value) {
  if (value === null || value === undefined || value === '') return '';
  return `<div class="text-sm mt-1"><span class="text-navy-700/50">${esc(label)}:</span> ${esc(value)}</div>`;
}

const PRIOR_COMMITMENT_LABELS = { yes: 'Fully completed', partial: 'Partially completed', not: 'Not completed' };

function renderKickoffs(menteeId) {
  const kickoffs = (state.kickoffs || [])
    .filter(k => k.mentee_id === menteeId)
    .sort((a, b) => new Date(b.date_time || b.created_at) - new Date(a.date_time || a.created_at));
  if (!kickoffs.length) {
    return `<div class="card p-6 text-sm text-navy-700/50">No kickoff session recorded yet.</div>`;
  }
  return kickoffs.map(k => {
    const systems = Array.isArray(k.systems_activated) ? k.systems_activated : [];
    const link = k.meeting_link && /^https?:\/\//i.test(k.meeting_link)
      ? `<div class="text-sm mt-1"><span class="text-navy-700/50">Meeting link:</span> <a href="${esc(k.meeting_link)}" target="_blank" rel="noopener noreferrer" class="underline">${esc(k.meeting_link)}</a></div>`
      : detailLine('Meeting link', k.meeting_link);
    return `
      <div class="card p-5">
        <div class="font-medium mb-2">Kickoff · ${esc(formatDateTime(k.date_time))}</div>
        <div class="text-sm mt-1"><span class="text-navy-700/50">Systems activated:</span> ${systems.length ? systems.map(s => `<span class="inline-block text-xs px-2 py-0.5 rounded-full bg-navy-100 mr-1">${esc(s)}</span>`).join('') : '—'}</div>
        ${detailLine('Check-in cadence', k.agreed_check_in_cadence)}
        ${detailLine('Initial commitment', k.initial_commitment)}
        ${k.next_check_in_date ? detailLine('Next check-in', formatDate(k.next_check_in_date)) : ''}
        ${link}
        ${detailLine('Student’s why', k.student_why_notes)}
        ${detailLine('Expectations covered', k.expectations_notes)}
      </div>
    `;
  }).join('');
}

function renderMenteeDetail(id) {
  const m = state.mentees.find(x => x.id === id);
  if (!m) return renderDashboard();

  titleEl.textContent = m.fullName;
  subtitleEl.textContent = `Stage ${m.currentStage || '—'} · Started ${formatDate(m.programStartDate)}`;

  const checkIns = state.checkIns
    .filter(c => c.menteeId === id)
    .sort((a, b) => new Date(a.date) - new Date(b.date)); // oldest first for chart

  const trendChart = buildTrendChart(checkIns);

  let html = `
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div class="lg:col-span-1 space-y-6">
        <div class="card p-6">
          <h3 class="font-medium mb-4">Profile</h3>
          <div class="space-y-3 text-sm">
            <div><span class="text-navy-700/50">Email</span><div>${esc(m.email) || '—'}</div></div>
            <div><span class="text-navy-700/50">Phone</span><div>${esc(m.phone) || '—'}</div></div>
            <div><span class="text-navy-700/50">Status</span><div class="mt-1"><span class="text-xs px-2.5 py-1 rounded-full ${statusClass(m.status)}">${esc(m.status)}</span></div></div>
            <div><span class="text-navy-700/50">Days in program</span><div>${daysInProgram(m.programStartDate)}</div></div>
          </div>
          ${m.notes ? `<div class="mt-4 pt-4 border-t text-sm text-navy-700/80">${esc(m.notes)}</div>` : ''}
        </div>
        <button data-mentee-id="${esc(m.id)}" onclick="state.currentView='checkin'; state.prefillMenteeId=this.dataset.menteeId; render()" class="w-full btn-primary py-3 rounded-xl">New Check-In</button>
        <button data-mentee-id="${esc(m.id)}" onclick="exportMenteePdf(this.dataset.menteeId)" class="w-full py-2 rounded-xl border text-sm">Export Summary</button>
        <div class="card p-6">
          <h3 class="font-medium mb-3">Graduation Readiness</h3>
          ${buildReadiness(m, checkIns)}
        </div>
      </div>
      <div class="lg:col-span-2 space-y-6">
        <div class="card p-6">
          <h3 class="section-title text-xl mb-4">Score Trends</h3>
          ${trendChart}
        </div>
        <div>
          <h3 class="section-title text-xl mb-4">Kickoff Sessions</h3>
          <div class="space-y-4">${renderKickoffs(m.id)}</div>
        </div>
        <div>
          <h3 class="section-title text-xl mb-4">Check-In History</h3>
          <div class="space-y-4">
  `;

  if (checkIns.length === 0) {
    html += `<div class="card p-8 text-center text-navy-700/50">No check-ins yet.</div>`;
  } else {
    checkIns.forEach(c => {
      html += `
        <div class="card p-5">
          <div class="flex items-center justify-between mb-3">
            <div class="font-medium">Check-In #${esc(c.checkInNumber)} · ${esc(formatDate(c.date))}${c.meetingFormat ? ` · ${esc(c.meetingFormat)}` : ''}</div>
            <div class="flex gap-2">
              ${c.leadGenerationActivity ? `<span class="score-pill score-${esc(c.leadGenerationActivity)}">${esc(c.leadGenerationActivity)}</span>` : ''}
              ${c.lightSpeedVtProgress ? `<span class="score-pill score-${esc(c.lightSpeedVtProgress)}">${esc(c.lightSpeedVtProgress)}</span>` : ''}
              ${c.loftyCrmUsage ? `<span class="score-pill score-${esc(c.loftyCrmUsage)}">${esc(c.loftyCrmUsage)}</span>` : ''}
            </div>
          </div>
          ${c.studentCommitment ? `<div class="text-sm"><span class="text-navy-700/50">Commitment:</span> ${esc(c.studentCommitment)}${c.commitmentDueDate ? ` <span class="text-navy-700/50">(due ${esc(formatDate(c.commitmentDueDate))})</span>` : ''}</div>` : ''}
          ${c.generalAssessmentNotes ? `<div class="text-sm mt-2 text-navy-700/80">${esc(c.generalAssessmentNotes)}</div>` : ''}
          ${detailLine('Direction given', c.specificDirectionGiven)}
          ${detailLine('Prior commitment', PRIOR_COMMITMENT_LABELS[c.priorCommitmentStatus] || c.priorCommitmentStatus)}
          ${detailLine('Verification', c.verificationNotes)}
          ${detailLine('Topics discussed', c.topicsDiscussed)}
          ${detailLine('Key coaching points', c.keyCoachingPoints)}
          ${c.nextCheckInDate || c.nextCheckInFormat ? detailLine('Next check-in', [c.nextCheckInDate ? formatDate(c.nextCheckInDate) : '', c.nextCheckInFormat || ''].filter(Boolean).join(' · ')) : ''}
          ${c.escalationFlag ? `<div class="mt-3 text-xs text-red-700 font-medium">⚑ Escalation flagged${c.escalationNotes ? `: ${esc(c.escalationNotes)}` : ''}</div>` : ''}
        </div>
      `;
    });
  }

  html += `</div></div></div></div>`;
  app.innerHTML = html;
}

function buildReadiness(m, checkIns) {
  const latest = checkIns[checkIns.length - 1] || {};
  const closed = latest.totalClosed || 0;
  const items = [
    { label: '4 Closed Transactions', done: closed >= 4, detail: `${closed}/4` },
    { label: 'LightSpeed VT Complete', done: (latest.lightSpeedVtProgress || 0) >= 4, detail: `Score ${latest.lightSpeedVtProgress || '—'}` },
    { label: 'Lofty CRM Proficient', done: (latest.loftyCrmUsage || 0) >= 4, detail: `Score ${latest.loftyCrmUsage || '—'}` },
    { label: 'Nexa Connected', done: false, detail: 'Confirm in graduation form' },
    { label: 'Mentor Recommendation', done: (state.graduations || []).some(g => g.mentee_id === m.id), detail: 'Submit when ready' }
  ];
  const doneCount = items.filter(i => i.done).length;
  const pct = Math.round((doneCount / items.length) * 100);
  return `
    <div class="text-sm mb-2">${doneCount}/${items.length} complete · ${pct}%</div>
    <div class="w-full bg-navy-100 rounded-full h-2 mb-3"><div class="bg-gold-500 h-2 rounded-full" style="width:${pct}%"></div></div>
    ${items.map(i => `<div class="flex justify-between text-sm py-1 border-b border-navy-50"><span>${i.done ? '✓' : '○'} ${esc(i.label)}</span><span class="text-navy-700/50">${esc(i.detail)}</span></div>`).join('')}
  `;
}

function buildTrendChart(checkIns) {
  if (!checkIns.length) return `<div class="text-sm text-navy-700/50">No check-ins yet to chart.</div>`;
  const series = [
    { key: 'leadGenerationActivity', label: 'Lead Gen', color: '#1e2a4a' },
    { key: 'lightSpeedVtProgress', label: 'VT', color: '#c9a227' },
    { key: 'loftyCrmUsage', label: 'CRM', color: '#059669' }
  ];
  const w = 480, h = 120, pad = 20;
  const points = checkIns.map((_, i) => pad + (i / Math.max(1, checkIns.length - 1)) * (w - pad * 2));
  let svg = `<svg viewBox="0 0 ${w} ${h}" class="w-full h-32" aria-label="Score trends">`;
  // grid
  [1,2,3,4,5].forEach(s => {
    const y = h - pad - ((s - 1) / 4) * (h - pad * 2);
    svg += `<line x1="${pad}" y1="${y}" x2="${w - pad}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>`;
  });
  series.forEach(s => {
    const pts = checkIns.map((c, i) => {
      const val = Number(c[s.key]);
      if (c[s.key] == null || Number.isNaN(val)) return null;
      const y = h - pad - ((val - 1) / 4) * (h - pad * 2);
      return `${points[i]},${y}`;
    }).filter(Boolean);
    if (pts.length > 1) {
      svg += `<polyline points="${pts.join(' ')}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round"/>`;
    }
    checkIns.forEach((c, i) => {
      const val = Number(c[s.key]);
      if (c[s.key] == null || Number.isNaN(val)) return;
      const y = h - pad - ((val - 1) / 4) * (h - pad * 2);
      svg += `<circle cx="${points[i]}" cy="${y}" r="3" fill="${s.color}"/>`;
    });
  });
  svg += `</svg>`;
  const legend = series.map(s => `<span class="inline-flex items-center gap-1 mr-4 text-xs"><span class="w-2 h-2 rounded-full" style="background:${s.color}"></span>${s.label}</span>`).join('');
  return svg + `<div class="mt-2">${legend}</div>`;
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

function menteeOptionsHtml(selectedId) {
  return state.mentees
    .map(m => `<option value="${esc(m.id)}" ${selectedId && selectedId === m.id ? 'selected' : ''}>${esc(m.fullName)}</option>`)
    .join('');
}

function renderCheckInForm() {
  titleEl.textContent = 'New Check-In';
  subtitleEl.textContent = 'Record a mentor session';

  const menteeOptions = menteeOptionsHtml(state.prefillMenteeId);

  app.innerHTML = `
    <form id="checkin-form" class="max-w-3xl space-y-8">
      <div class="card p-6 space-y-4">
        <h3 class="font-medium">Session Information</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm mb-1">Mentee</label>
            <select name="menteeId" required class="w-full border border-navy-200 rounded-lg px-3 py-2">${menteeOptions}</select>
          </div>
          <div>
            <label class="block text-sm mb-1">Date</label>
            <input type="date" name="date" value="${today()}" required class="w-full border border-navy-200 rounded-lg px-3 py-2">
          </div>
          <div>
            <label class="block text-sm mb-1">Check-In #</label>
            <input type="number" name="checkInNumber" min="1" value="1" class="w-full border border-navy-200 rounded-lg px-3 py-2">
          </div>
          <div>
            <label class="block text-sm mb-1">Meeting Format</label>
            <input type="text" name="meetingFormat" placeholder="Zoom, phone, in-person..." class="w-full border border-navy-200 rounded-lg px-3 py-2">
          </div>
        </div>
      </div>

      <div class="card p-6 space-y-5">
        <h3 class="font-medium">Assess — Where is the student right now?</h3>
        ${scoreRow('Lead Generation Activity', 'leadGenerationActivity')}
        ${scoreRow('LightSpeed VT Progress', 'lightSpeedVtProgress')}
        ${scoreRow('Lofty CRM Usage', 'loftyCrmUsage')}
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm mb-1">Transactions in Pipeline</label>
            <input type="number" name="transactionsInPipeline" min="0" class="w-full border border-navy-200 rounded-lg px-3 py-2">
          </div>
          <div>
            <label class="block text-sm mb-1">Total Closed (to date)</label>
            <input type="number" name="totalClosed" min="0" class="w-full border border-navy-200 rounded-lg px-3 py-2">
          </div>
        </div>
        <div>
          <label class="block text-sm mb-1">General Assessment Notes</label>
          <textarea name="generalAssessmentNotes" rows="3" class="w-full border border-navy-200 rounded-lg px-3 py-2"></textarea>
        </div>
      </div>

      <div class="card p-6 space-y-4">
        <h3 class="font-medium">Direct & Verify</h3>
        <div>
          <label class="block text-sm mb-1">Specific Direction Given</label>
          <textarea name="specificDirectionGiven" rows="2" class="w-full border border-navy-200 rounded-lg px-3 py-2"></textarea>
        </div>
        <div>
          <label class="block text-sm mb-1">Prior Commitment Status</label>
          <select name="priorCommitmentStatus" class="w-full border border-navy-200 rounded-lg px-3 py-2">
            <option value="">—</option>
            <option value="yes">Yes — fully completed</option>
            <option value="partial">Partially completed</option>
            <option value="not">Not completed</option>
          </select>
        </div>
        <div>
          <label class="block text-sm mb-1">Verification Notes</label>
          <textarea name="verificationNotes" rows="2" class="w-full border border-navy-200 rounded-lg px-3 py-2"></textarea>
        </div>
      </div>

      <div class="card p-6 space-y-4">
        <h3 class="font-medium">Strategize & Hold the Line</h3>
        <div>
          <label class="block text-sm mb-1">Topics Discussed</label>
          <textarea name="topicsDiscussed" rows="2" class="w-full border border-navy-200 rounded-lg px-3 py-2"></textarea>
        </div>
        <div>
          <label class="block text-sm mb-1">Key Coaching Points</label>
          <textarea name="keyCoachingPoints" rows="2" class="w-full border border-navy-200 rounded-lg px-3 py-2"></textarea>
        </div>
        <div>
          <label class="block text-sm mb-1">Student Commitment for Next Session</label>
          <textarea name="studentCommitment" rows="2" class="w-full border border-navy-200 rounded-lg px-3 py-2"></textarea>
        </div>
        <div>
          <label class="block text-sm mb-1">Due Before Next Check-In</label>
          <input type="date" name="commitmentDueDate" class="w-full border border-navy-200 rounded-lg px-3 py-2">
        </div>
      </div>

      <div class="card p-6 space-y-4">
        <h3 class="font-medium">Escalation & Next</h3>
        <label class="flex items-center gap-2">
          <input type="checkbox" name="escalationFlag" class="rounded">
          <span>Escalation required</span>
        </label>
        <div>
          <label class="block text-sm mb-1">Escalation Notes</label>
          <textarea name="escalationNotes" rows="2" class="w-full border border-navy-200 rounded-lg px-3 py-2"></textarea>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm mb-1">Next Check-In Date</label>
            <input type="date" name="nextCheckInDate" class="w-full border border-navy-200 rounded-lg px-3 py-2">
          </div>
          <div>
            <label class="block text-sm mb-1">Next Format / Link</label>
            <input type="text" name="nextCheckInFormat" class="w-full border border-navy-200 rounded-lg px-3 py-2">
          </div>
        </div>
      </div>

      <div class="flex gap-3">
        <button type="submit" class="btn-primary px-8 py-3 rounded-xl">Save Check-In</button>
        <button type="button" onclick="state.currentView='dashboard'; render()" class="px-6 py-3 rounded-xl border">Cancel</button>
      </div>
    </form>
  `;

  document.getElementById('checkin-form').onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    const data = Object.fromEntries(fd.entries());
    const mentee = state.mentees.find(x => x.id === data.menteeId);
    const checkIn = {
      menteeId: data.menteeId,
      checkInNumber: Number(data.checkInNumber) || 1,
      date: data.date,
      stageAtTime: mentee ? (Number(mentee.currentStage) || null) : null,
      meetingFormat: data.meetingFormat || null,
      leadGenerationActivity: data.leadGenerationActivity ? Number(data.leadGenerationActivity) : null,
      lightSpeedVtProgress: data.lightSpeedVtProgress ? Number(data.lightSpeedVtProgress) : null,
      loftyCrmUsage: data.loftyCrmUsage ? Number(data.loftyCrmUsage) : null,
      transactionsInPipeline: data.transactionsInPipeline ? Number(data.transactionsInPipeline) : null,
      totalClosed: data.totalClosed ? Number(data.totalClosed) : null,
      generalAssessmentNotes: data.generalAssessmentNotes || null,
      specificDirectionGiven: data.specificDirectionGiven || null,
      priorCommitmentStatus: data.priorCommitmentStatus || null,
      verificationNotes: data.verificationNotes || null,
      topicsDiscussed: data.topicsDiscussed || null,
      keyCoachingPoints: data.keyCoachingPoints || null,
      studentCommitment: data.studentCommitment || null,
      commitmentDueDate: data.commitmentDueDate || null,
      escalationFlag: !!data.escalationFlag,
      escalationNotes: data.escalationNotes || null,
      nextCheckInDate: data.nextCheckInDate || null,
      nextCheckInFormat: data.nextCheckInFormat || null
    };
    await runSubmit(form, async () => {
      await saveCheckIn(checkIn);
      if (checkIn.escalationFlag && mentee && mentee.status !== 'escalated') {
        await saveMentee({ ...mentee, status: 'escalated' });
      }
      await loadFromSupabase();
      state.currentView = 'mentee';
      state.selectedMenteeId = checkIn.menteeId;
      state.prefillMenteeId = null;
      render();
    });
  };
}

function scoreRow(label, name) {
  return `
    <div>
      <label class="block text-sm mb-2">${label}</label>
      <div class="flex gap-2">
        ${[1,2,3,4,5].map(n => `
          <label class="cursor-pointer">
            <input type="radio" name="${name}" value="${n}" class="sr-only peer">
            <div class="score-pill score-${n} peer-checked:ring-2 peer-checked:ring-gold-500 peer-checked:ring-offset-2">${n}</div>
          </label>
        `).join('')}
      </div>
    </div>
  `;
}

function renderEscalationForm() {
  titleEl.textContent = 'Escalation Document';
  subtitleEl.textContent = 'Submit to National Director';
  const menteeOptions = menteeOptionsHtml(null);
  app.innerHTML = `
    <form id="escalation-form" class="max-w-3xl space-y-6">
      <div class="card p-6 space-y-4">
        <h3 class="font-medium">Parties Involved</h3>
        <div>
          <label class="block text-sm mb-1">Mentee</label>
          <select name="menteeId" required class="w-full border border-navy-200 rounded-lg px-3 py-2">${menteeOptions}</select>
        </div>
        <div>
          <label class="block text-sm mb-1">Date of Submission</label>
          <input type="date" name="dateOfSubmission" value="${today()}" required class="w-full border border-navy-200 rounded-lg px-3 py-2">
        </div>
        <div>
          <label class="block text-sm mb-1">Student Program Stage</label>
          <input type="text" name="studentProgramStage" class="w-full border border-navy-200 rounded-lg px-3 py-2">
        </div>
      </div>
      <div class="card p-6 space-y-4">
        <h3 class="font-medium">Escalation Type</h3>
        <select name="escalationType" required class="w-full border border-navy-200 rounded-lg px-3 py-2">
          <option value="disengaged">Disengaged Student</option>
          <option value="compliance_legal">Compliance / Legal Question</option>
          <option value="mental_health">Mental Health or Personal Crisis</option>
          <option value="financial_crisis">Financial Crisis</option>
          <option value="family_emergency">Family Emergency</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div class="card p-6 space-y-4">
        <h3 class="font-medium">Situation Summary</h3>
        <textarea name="situationSummary" rows="4" required placeholder="What happened? When did it start? Check-ins affected?" class="w-full border border-navy-200 rounded-lg px-3 py-2"></textarea>
      </div>
      <div class="card p-6 space-y-4">
        <h3 class="font-medium">Actions Already Taken</h3>
        <textarea name="actionsAlreadyTaken" rows="3" placeholder="One action per line" class="w-full border border-navy-200 rounded-lg px-3 py-2"></textarea>
        <textarea name="additionalContext" rows="2" placeholder="Additional context" class="w-full border border-navy-200 rounded-lg px-3 py-2"></textarea>
      </div>
      <div class="card p-6 space-y-4">
        <h3 class="font-medium">Recommended Next Step</h3>
        <select name="recommendedNextStep" class="w-full border border-navy-200 rounded-lg px-3 py-2">
          <option value="guidance">Guidance on how to proceed</option>
          <option value="student_review">Student review / intervention</option>
          <option value="program_pause">Student placed on formal program pause</option>
          <option value="outside_support">Referred to outside professional support</option>
          <option value="compliance_review">Compliance / legal review</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div class="flex gap-3">
        <button type="submit" class="btn-primary px-8 py-3 rounded-xl">Submit Escalation</button>
        <button type="button" onclick="state.currentView='dashboard'; render()" class="px-6 py-3 rounded-xl border">Cancel</button>
      </div>
    </form>
  `;
  document.getElementById('escalation-form').onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    const data = Object.fromEntries(fd.entries());
    const escalation = {
      menteeId: data.menteeId,
      dateOfSubmission: data.dateOfSubmission,
      studentProgramStage: data.studentProgramStage || null,
      escalationType: data.escalationType,
      situationSummary: data.situationSummary,
      actionsAlreadyTaken: data.actionsAlreadyTaken
        ? data.actionsAlreadyTaken.split('\n').map(s => s.trim()).filter(Boolean)
        : [],
      recommendedNextStep: data.recommendedNextStep,
      additionalContext: data.additionalContext || null
    };
    await runSubmit(form, async () => {
      await saveEscalation(escalation);
      const m = state.mentees.find(x => x.id === escalation.menteeId);
      if (m) await saveMentee({ ...m, status: 'escalated' });
      await loadFromSupabase();
      state.currentView = 'dashboard';
      render();
    });
  };
}

function renderGraduationForm() {
  titleEl.textContent = 'Graduation Recommendation';
  subtitleEl.textContent = 'Submit when the student is ready';
  const menteeOptions = menteeOptionsHtml(null);
  app.innerHTML = `
    <form id="graduation-form" class="max-w-3xl space-y-6">
      <div class="card p-6 space-y-4">
        <h3 class="font-medium">Student & Mentor Information</h3>
        <div>
          <label class="block text-sm mb-1">Mentee</label>
          <select name="menteeId" required class="w-full border border-navy-200 rounded-lg px-3 py-2">${menteeOptions}</select>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm mb-1">Date of Submission</label>
            <input type="date" name="dateOfSubmission" value="${today()}" required class="w-full border border-navy-200 rounded-lg px-3 py-2">
          </div>
          <div>
            <label class="block text-sm mb-1">Program Start Date</label>
            <input type="date" name="programStartDate" class="w-full border border-navy-200 rounded-lg px-3 py-2">
          </div>
        </div>
      </div>
      <div class="card p-6 space-y-3">
        <h3 class="font-medium">Graduation Requirements (all must be confirmed)</h3>
        <label class="flex items-center gap-2"><input type="checkbox" name="closedTransactionsConfirmed"> 4 Closed Residential Transactions</label>
        <label class="flex items-center gap-2"><input type="checkbox" name="lightSpeedVtCompleted"> All LightSpeed VT Modules Completed</label>
        <label class="flex items-center gap-2"><input type="checkbox" name="nexaLendingConnected"> Connected with Nexa Lending Partner</label>
        <label class="flex items-center gap-2"><input type="checkbox" name="loftyCrmProficient"> Proficient in Lofty CRM</label>
        <label class="flex items-center gap-2"><input type="checkbox" name="mentorRecommends"> Mentor Graduation Recommendation</label>
      </div>
      <div class="card p-6 space-y-4">
        <h3 class="font-medium">Closed Transactions (list up to 4)</h3>
        <textarea name="closedTransactions" rows="5" placeholder="One per line: Address | Close Date | Sale Price | SkySlope File #" class="w-full border border-navy-200 rounded-lg px-3 py-2"></textarea>
      </div>
      <div class="card p-6 space-y-4">
        <h3 class="font-medium">Mentor Recommendation Statement</h3>
        <textarea name="mentorRecommendationStatement" rows="4" required placeholder="Why is this student ready to graduate?" class="w-full border border-navy-200 rounded-lg px-3 py-2"></textarea>
      </div>
      <div class="flex gap-3">
        <button type="submit" class="btn-primary px-8 py-3 rounded-xl">Submit Recommendation</button>
        <button type="button" onclick="state.currentView='dashboard'; render()" class="px-6 py-3 rounded-xl border">Cancel</button>
      </div>
    </form>
  `;
  document.getElementById('graduation-form').onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    const data = Object.fromEntries(fd.entries());
    const transactions = data.closedTransactions
      ? data.closedTransactions.split('\n').map(s => s.trim()).filter(Boolean).map(line => {
          const parts = line.split('|').map(p => p.trim());
          const price = parts[2] ? Number(parts[2].replace(/[$,\s]/g, '')) : null;
          return {
            propertyAddress: parts[0] || '',
            closeDate: parts[1] || null,
            salePrice: Number.isFinite(price) ? price : null,
            skySlopeFileNumber: parts[3] || null
          };
        })
      : [];
    const grad = {
      menteeId: data.menteeId,
      dateOfSubmission: data.dateOfSubmission,
      programStartDate: data.programStartDate || null,
      closedTransactionsConfirmed: !!data.closedTransactionsConfirmed,
      lightSpeedVtCompleted: !!data.lightSpeedVtCompleted,
      nexaLendingConnected: !!data.nexaLendingConnected,
      loftyCrmProficient: !!data.loftyCrmProficient,
      mentorRecommends: !!data.mentorRecommends,
      closedTransactions: transactions,
      mentorRecommendationStatement: data.mentorRecommendationStatement
    };
    await runSubmit(form, async () => {
      await saveGraduation(grad);
      const m = state.mentees.find(x => x.id === grad.menteeId);
      if (m) await saveMentee({ ...m, status: 'graduated' });
      await loadFromSupabase();
      state.currentView = 'dashboard';
      render();
    });
  };
}

function renderFeedbackForm() {
  titleEl.textContent = 'Mentor Feedback';
  subtitleEl.textContent = 'Record structured feedback on a mentee';
  const menteeOptions = menteeOptionsHtml(state.prefillMenteeId);
  app.innerHTML = `
    <form id="feedback-form" class="max-w-3xl space-y-6">
      <div class="card p-6 space-y-4">
        <h3 class="font-medium">Feedback Details</h3>
        <div>
          <label class="block text-sm mb-1">Mentee</label>
          <select name="menteeId" required class="w-full border border-navy-200 rounded-lg px-3 py-2">${menteeOptions}</select>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm mb-1">Date</label>
            <input type="date" name="date" value="${today()}" required class="w-full border border-navy-200 rounded-lg px-3 py-2">
          </div>
          <div>
            <label class="block text-sm mb-1">Feedback Type</label>
            <select name="feedbackType" class="w-full border border-navy-200 rounded-lg px-3 py-2">
              <option value="general">General</option>
              <option value="strengths">Strengths Focus</option>
              <option value="areas_to_improve">Areas to Improve</option>
              <option value="session_recap">Session Recap</option>
              <option value="progress_note">Progress Note</option>
            </select>
          </div>
        </div>
        <div>
          <label class="block text-sm mb-1">Overall Rating (1–5)</label>
          <select name="overallRating" class="w-full border border-navy-200 rounded-lg px-3 py-2">
            <option value="">—</option>
            <option value="5">5 – Excellent</option>
            <option value="4">4 – Strong</option>
            <option value="3">3 – On track</option>
            <option value="2">2 – Needs support</option>
            <option value="1">1 – Significant concerns</option>
          </select>
        </div>
      </div>
      <div class="card p-6 space-y-4">
        <h3 class="font-medium">Observations</h3>
        <div>
          <label class="block text-sm mb-1">Strengths</label>
          <textarea name="strengths" rows="3" placeholder="What is the mentee doing well?" class="w-full border border-navy-200 rounded-lg px-3 py-2"></textarea>
        </div>
        <div>
          <label class="block text-sm mb-1">Areas for Improvement</label>
          <textarea name="areasForImprovement" rows="3" placeholder="Where do they need to focus?" class="w-full border border-navy-200 rounded-lg px-3 py-2"></textarea>
        </div>
        <div>
          <label class="block text-sm mb-1">Specific Observations</label>
          <textarea name="specificObservations" rows="3" placeholder="Concrete examples from recent activity or conversations" class="w-full border border-navy-200 rounded-lg px-3 py-2"></textarea>
        </div>
      </div>
      <div class="card p-6 space-y-4">
        <h3 class="font-medium">Recommended Actions</h3>
        <textarea name="recommendedActions" rows="3" placeholder="What should the mentee do next?" class="w-full border border-navy-200 rounded-lg px-3 py-2"></textarea>
        <div>
          <label class="block text-sm mb-1">Private Notes (mentor only)</label>
          <textarea name="privateNotes" rows="2" placeholder="Internal notes not shared" class="w-full border border-navy-200 rounded-lg px-3 py-2"></textarea>
        </div>
      </div>
      <div class="flex gap-3">
        <button type="submit" class="btn-primary px-8 py-3 rounded-xl">Save Feedback</button>
        <button type="button" onclick="state.currentView='dashboard'; render()" class="px-6 py-3 rounded-xl border">Cancel</button>
      </div>
    </form>
  `;
  document.getElementById('feedback-form').onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    const data = Object.fromEntries(fd.entries());
    const fb = {
      menteeId: data.menteeId,
      date: data.date,
      feedbackType: data.feedbackType || 'general',
      strengths: data.strengths || null,
      areasForImprovement: data.areasForImprovement || null,
      specificObservations: data.specificObservations || null,
      recommendedActions: data.recommendedActions || null,
      overallRating: data.overallRating ? Number(data.overallRating) : null,
      privateNotes: data.privateNotes || null
    };
    await runSubmit(form, async () => {
      await saveFeedback(fb);
      await loadFromSupabase();
      state.currentView = 'dashboard';
      state.prefillMenteeId = null;
      render();
    });
  };
}

function renderKickoffForm() {
  titleEl.textContent = 'Kickoff Session';
  subtitleEl.textContent = 'Capture the starting point and systems setup';
  const menteeOptions = menteeOptionsHtml(null);
  app.innerHTML = `
    <form id="kickoff-form" class="max-w-3xl space-y-6">
      <div class="card p-6 space-y-4">
        <h3 class="font-medium">Session</h3>
        <div>
          <label class="block text-sm mb-1">Mentee</label>
          <select name="menteeId" required class="w-full border border-navy-200 rounded-lg px-3 py-2">${menteeOptions}</select>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm mb-1">Date & Time</label>
            <input type="datetime-local" name="dateTime" required class="w-full border border-navy-200 rounded-lg px-3 py-2">
          </div>
          <div>
            <label class="block text-sm mb-1">Meeting Link</label>
            <input type="url" name="meetingLink" placeholder="https://..." class="w-full border border-navy-200 rounded-lg px-3 py-2">
          </div>
        </div>
      </div>
      <div class="card p-6 space-y-4">
        <h3 class="font-medium">The “Why” & Expectations</h3>
        <textarea name="studentWhyNotes" rows="3" placeholder="Student’s stated why" class="w-full border border-navy-200 rounded-lg px-3 py-2"></textarea>
        <textarea name="expectationsNotes" rows="3" placeholder="Program expectations covered" class="w-full border border-navy-200 rounded-lg px-3 py-2"></textarea>
      </div>
      <div class="card p-6 space-y-3">
        <h3 class="font-medium">Systems Activated</h3>
        <label class="flex items-center gap-2"><input type="checkbox" name="sys_lofty"> Lofty CRM</label>
        <label class="flex items-center gap-2"><input type="checkbox" name="sys_vt"> LightSpeed VT</label>
        <label class="flex items-center gap-2"><input type="checkbox" name="sys_nexa"> Nexa Lending</label>
        <label class="flex items-center gap-2"><input type="checkbox" name="sys_skyslope"> SkySlope</label>
      </div>
      <div class="card p-6 space-y-4">
        <h3 class="font-medium">Agreements</h3>
        <input type="text" name="agreedCheckInCadence" placeholder="e.g. Weekly on Tuesdays" class="w-full border border-navy-200 rounded-lg px-3 py-2">
        <textarea name="initialCommitment" rows="2" placeholder="First commitment" class="w-full border border-navy-200 rounded-lg px-3 py-2"></textarea>
        <input type="date" name="nextCheckInDate" class="w-full border border-navy-200 rounded-lg px-3 py-2">
      </div>
      <div class="flex gap-3">
        <button type="submit" class="btn-primary px-8 py-3 rounded-xl">Save Kickoff</button>
        <button type="button" onclick="state.currentView='dashboard'; render()" class="px-6 py-3 rounded-xl border">Cancel</button>
      </div>
    </form>
  `;
  document.getElementById('kickoff-form').onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const fd = new FormData(form);
    const data = Object.fromEntries(fd.entries());
    const systems = [];
    if (data.sys_lofty) systems.push('Lofty CRM');
    if (data.sys_vt) systems.push('LightSpeed VT');
    if (data.sys_nexa) systems.push('Nexa Lending');
    if (data.sys_skyslope) systems.push('SkySlope');
    const k = {
      menteeId: data.menteeId,
      dateTime: data.dateTime ? new Date(data.dateTime).toISOString() : null,
      meetingLink: data.meetingLink || null,
      studentWhyNotes: data.studentWhyNotes || null,
      expectationsNotes: data.expectationsNotes || null,
      systemsActivated: systems,
      agreedCheckInCadence: data.agreedCheckInCadence || null,
      initialCommitment: data.initialCommitment || null,
      nextCheckInDate: data.nextCheckInDate || null
    };
    await runSubmit(form, async () => {
      await saveKickoff(k);
      await loadFromSupabase();
      state.currentView = 'mentee';
      state.selectedMenteeId = k.menteeId;
      render();
    });
  };
}

// ---------------------------------------------------------------------------
// Navigation & Modals
// ---------------------------------------------------------------------------

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.onclick = () => {
    state.currentView = btn.dataset.view;
    if (btn.dataset.view !== 'mentee') state.selectedMenteeId = null;
    render();
  };
});

document.getElementById('add-mentee-btn').onclick = () => {
  const modal = document.getElementById('modal-root');
  modal.innerHTML = `
    <div class="fixed inset-0 bg-navy-900/60 z-50 flex items-center justify-center" onclick="this.remove()">
      <div class="bg-white rounded-2xl p-6 w-full max-w-md" onclick="event.stopPropagation()">
        <h3 class="font-display text-xl mb-4">Add Mentee</h3>
        <form id="new-mentee-form" class="space-y-3">
          <input name="fullName" placeholder="Full name" required class="w-full border border-navy-200 rounded-lg px-3 py-2">
          <input name="email" type="email" placeholder="Email" class="w-full border border-navy-200 rounded-lg px-3 py-2">
          <input name="phone" placeholder="Phone" class="w-full border border-navy-200 rounded-lg px-3 py-2">
          <div class="grid grid-cols-2 gap-3">
            <input name="programStartDate" type="date" value="${today()}" class="border border-navy-200 rounded-lg px-3 py-2">
            <select name="currentStage" class="border border-navy-200 rounded-lg px-3 py-2">
              <option value="1">Stage 1</option>
              <option value="2">Stage 2</option>
              <option value="3">Stage 3</option>
              <option value="4">Stage 4</option>
            </select>
          </div>
          <textarea name="notes" placeholder="Notes" rows="2" class="w-full border border-navy-200 rounded-lg px-3 py-2"></textarea>
          <div class="flex gap-2 pt-2">
            <button type="submit" class="btn-primary px-6 py-2 rounded-lg">Create</button>
            <button type="button" onclick="document.getElementById('modal-root').innerHTML=''" class="px-6 py-2 rounded-lg border">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  `;
  document.getElementById('new-mentee-form').onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form).entries());
    // No `id` here: saveMentee INSERTs and assigns the database id.
    const mentee = {
      fullName: data.fullName.trim(),
      email: data.email || null,
      phone: data.phone || null,
      programStartDate: data.programStartDate || today(),
      currentStage: Number(data.currentStage) || 1,
      status: 'active',
      notes: data.notes || null
    };
    await runSubmit(form, async () => {
      await saveMentee(mentee);
      await loadFromSupabase();
      document.getElementById('modal-root').innerHTML = '';
      openMentee(mentee.id);
    });
  };
};

document.getElementById('export-btn').onclick = () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `axen-mentorship-export-${today()}.json`;
  a.click();
};

function exportMenteePdf(id) {
  const m = state.mentees.find(x => x.id === id);
  if (!m) return;
  const checks = state.checkIns.filter(c => c.menteeId === id);
  const text = [
    `Mentorship Summary: ${m.fullName}`,
    `Stage ${m.currentStage} · Status: ${m.status}`,
    `Started: ${m.programStartDate}`,
    `Email: ${m.email || '—'} · Phone: ${m.phone || '—'}`,
    '',
    'Recent Check-Ins:',
    ...checks.slice(0, 5).map(c => `#${c.checkInNumber} ${c.date} — Lead:${c.leadGenerationActivity||'—'} VT:${c.lightSpeedVtProgress||'—'} CRM:${c.loftyCrmUsage||'—'}`)
  ].join('\n');
  const blob = new Blob([text], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${(m.fullName || 'mentee').replace(/\s+/g, '-')}-summary.txt`;
  a.click();
}

// Initial render
state.currentView = state.currentView || 'dashboard';
render();
