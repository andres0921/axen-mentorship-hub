// Axen Mentorship Hub — Supabase-backed
const SUPABASE_URL = 'https://chcmdibksurpfozbysqj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNoY21kaWJrc3VycGZvemJ5c3FqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5Mjk4OTQsImV4cCI6MjEwNzUwNTg5NH0.O6qpMcI1f6venAH51BPmi78WSxDgisSU2KbJNJKjoWg';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let state = {
  mentees: [],
  checkIns: [],
  escalations: [],
  graduations: [],
  kickoffs: [],
  feedback: [],
  currentView: 'dashboard',
  user: null
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function uid() {
  return crypto.randomUUID();
}

async function loadFromSupabase() {
  if (!state.user) return;
  const { data: mentees } = await supabase.from('mentees').select('*').order('created_at', { ascending: false });
  const { data: checkIns } = await supabase.from('check_ins').select('*').order('date', { ascending: false });
  const { data: escalations } = await supabase.from('escalations').select('*').order('created_at', { ascending: false });
  const { data: graduations } = await supabase.from('graduation_recommendations').select('*').order('created_at', { ascending: false });
  const { data: feedback } = await supabase.from('mentor_feedback').select('*').order('date', { ascending: false });
  const { data: kickoffs } = await supabase.from('kickoff_sessions').select('*').order('date_time', { ascending: false });
  state.mentees = (mentees || []).map(m => ({
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
  state.checkIns = (checkIns || []).map(c => ({
    id: c.id,
    menteeId: c.mentee_id,
    checkInNumber: c.check_in_number,
    date: c.date,
    leadGenerationActivity: c.lead_generation_activity,
    lightSpeedVtProgress: c.light_speed_vt_progress,
    loftyCrmUsage: c.lofty_crm_usage,
    transactionsInPipeline: c.transactions_in_pipeline,
    totalClosed: c.total_closed,
    generalAssessmentNotes: c.general_assessment_notes,
    studentCommitment: c.student_commitment,
    escalationFlag: c.escalation_flag,
    createdAt: c.created_at
  }));
  state.escalations = escalations || [];
  state.graduations = graduations || [];
  state.feedback = feedback || [];
  state.kickoffs = kickoffs || [];
  render();
}

async function saveMentee(mentee) {
  const payload = {
    user_id: state.user.id,
    full_name: mentee.fullName,
    email: mentee.email,
    phone: mentee.phone,
    program_start_date: mentee.programStartDate,
    current_stage: mentee.currentStage,
    status: mentee.status,
    notes: mentee.notes
  };
  if (mentee.id && mentee.id.length > 20) {
    await supabase.from('mentees').update(payload).eq('id', mentee.id);
  } else {
    const { data } = await supabase.from('mentees').insert(payload).select().single();
    if (data) mentee.id = data.id;
  }
}

async function saveCheckIn(checkIn) {
  const payload = {
    user_id: state.user.id,
    mentee_id: checkIn.menteeId,
    check_in_number: checkIn.checkInNumber,
    date: checkIn.date,
    lead_generation_activity: checkIn.leadGenerationActivity,
    light_speed_vt_progress: checkIn.lightSpeedVtProgress,
    lofty_crm_usage: checkIn.loftyCrmUsage,
    transactions_in_pipeline: checkIn.transactionsInPipeline,
    total_closed: checkIn.totalClosed,
    general_assessment_notes: checkIn.generalAssessmentNotes,
    student_commitment: checkIn.studentCommitment,
    escalation_flag: checkIn.escalationFlag
  };
  await supabase.from('check_ins').insert(payload);
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
  await supabase.from('mentor_feedback').insert(payload);
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
  await supabase.from('kickoff_sessions').insert(payload);
}

// Auth UI
const authOverlay = document.getElementById('auth-overlay');
const authForm = document.getElementById('auth-form');
const authToggle = document.getElementById('auth-toggle');
const authMessage = document.getElementById('auth-message');
let isSignUp = false;

authToggle.onclick = () => {
  isSignUp = !isSignUp;
  document.getElementById('auth-submit').textContent = isSignUp ? 'Create Account' : 'Sign In';
  authToggle.textContent = isSignUp ? 'Already have an account? Sign in' : 'Need an account? Sign up';
  authMessage.classList.add('hidden');
};

authForm.onsubmit = async (e) => {
  e.preventDefault();
  const email = document.getElementById('auth-email').value;
  const password = document.getElementById('auth-password').value;
  authMessage.classList.add('hidden');
  let result;
  if (isSignUp) {
    result = await supabase.auth.signUp({ email, password });
  } else {
    result = await supabase.auth.signInWithPassword({ email, password });
  }
  if (result.error) {
    authMessage.textContent = result.error.message;
    authMessage.classList.remove('hidden');
  } else if (result.data.user) {
    state.user = result.data.user;
    authOverlay.classList.add('hidden');
    await loadFromSupabase();
  }
};

// Check existing session
supabase.auth.getSession().then(({ data: { session } }) => {
  if (session) {
    state.user = session.user;
    authOverlay.classList.add('hidden');
    loadFromSupabase();
  } else {
    authOverlay.classList.remove('hidden');
  }
});

function saveState() {
  // no-op; persistence is via Supabase
}

function loadState() {
  return state;
}

// Rest of the original app logic continues below...


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
      <div class="card p-6 cursor-pointer" onclick="openMentee('${m.id}')">
        <div class="flex items-start justify-between">
          <div>
            <div class="font-semibold text-lg">${m.fullName}</div>
            <div class="text-sm text-navy-700/60 mt-0.5">Stage ${m.currentStage || '—'} · ${days} days · Target ${stageTarget(m.currentStage)} closed</div>
          </div>
          <span class="text-xs px-2.5 py-1 rounded-full ${statusClass(m.status)}">${m.status}</span>
        </div>
        <div class="mt-5 flex items-center gap-4">
          ${score ? `<div class="score-pill score-${Math.round(score)}">${score}</div>` : '<div class="text-sm text-navy-700/40">No scores yet</div>'}
          <div class="text-sm text-navy-700/70">
            ${latest ? `Last check-in ${formatDate(latest.date)}` : 'No check-ins'}
          </div>
        </div>
        ${latest ? `
          <div class="mt-4 grid grid-cols-3 gap-2 text-xs">
            <div class="text-center"><div class="text-navy-700/50">Lead Gen</div><div class="font-medium">${latest.leadGenerationActivity || '—'}${trendArrow(latest.leadGenerationActivity, prev && prev.leadGenerationActivity)}</div></div>
            <div class="text-center"><div class="text-navy-700/50">VT</div><div class="font-medium">${latest.lightSpeedVtProgress || '—'}${trendArrow(latest.lightSpeedVtProgress, prev && prev.lightSpeedVtProgress)}</div></div>
            <div class="text-center"><div class="text-navy-700/50">CRM</div><div class="font-medium">${latest.loftyCrmUsage || '—'}${trendArrow(latest.loftyCrmUsage, prev && prev.loftyCrmUsage)}</div></div>
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
            <div class="font-medium">${x.mentee.fullName}</div>
            <div class="text-sm text-navy-700/60">${x.daysSince === null ? 'No feedback yet' : `Last feedback ${x.daysSince} days ago`}</div>
          </div>
          <button onclick="state.currentView='feedback'; state.prefillMenteeId='${x.mentee.id}'; render()" class="text-sm px-4 py-2 rounded-lg bg-gold-500 text-navy-900 font-medium">Give Feedback</button>
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
          <div class="font-medium">${i.mentee}</div>
          <div class="text-sm mt-1">${i.commitment}</div>
          <div class="text-xs text-navy-700/50 mt-1">From check-in ${formatDate(i.date)}${i.due ? ` · Due ${formatDate(i.due)}` : ''}</div>
        </div>
        ${i.status ? `<span class="text-xs px-2 py-1 rounded-full bg-navy-100">${i.status}</span>` : ''}
      </div>
    `;
  });
  html += `</div>`;
  app.innerHTML = html;
}
  titleEl.textContent = 'Mentees';
  subtitleEl.textContent = 'All students in the program';
  renderDashboard(); // reuse for now
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
            <div><span class="text-navy-700/50">Email</span><div>${m.email || '—'}</div></div>
            <div><span class="text-navy-700/50">Phone</span><div>${m.phone || '—'}</div></div>
            <div><span class="text-navy-700/50">Status</span><div class="mt-1"><span class="text-xs px-2.5 py-1 rounded-full ${statusClass(m.status)}">${m.status}</span></div></div>
            <div><span class="text-navy-700/50">Days in program</span><div>${daysInProgram(m.programStartDate)}</div></div>
          </div>
          ${m.notes ? `<div class="mt-4 pt-4 border-t text-sm text-navy-700/80">${m.notes}</div>` : ''}
        </div>
        <button onclick="state.currentView='checkin'; state.prefillMenteeId='${m.id}'; render()" class="w-full btn-primary py-3 rounded-xl">New Check-In</button>
        <button onclick="exportMenteePdf('${m.id}')" class="w-full py-2 rounded-xl border text-sm">Export Summary</button>
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
            <div class="font-medium">Check-In #${c.checkInNumber} · ${formatDate(c.date)}</div>
            <div class="flex gap-2">
              ${c.leadGenerationActivity ? `<span class="score-pill score-${c.leadGenerationActivity}">${c.leadGenerationActivity}</span>` : ''}
              ${c.lightSpeedVtProgress ? `<span class="score-pill score-${c.lightSpeedVtProgress}">${c.lightSpeedVtProgress}</span>` : ''}
              ${c.loftyCrmUsage ? `<span class="score-pill score-${c.loftyCrmUsage}">${c.loftyCrmUsage}</span>` : ''}
            </div>
          </div>
          ${c.studentCommitment ? `<div class="text-sm"><span class="text-navy-700/50">Commitment:</span> ${c.studentCommitment}</div>` : ''}
          ${c.generalAssessmentNotes ? `<div class="text-sm mt-2 text-navy-700/80">${c.generalAssessmentNotes}</div>` : ''}
          ${c.escalationFlag ? `<div class="mt-3 text-xs text-red-700 font-medium">⚑ Escalation flagged</div>` : ''}
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
    ${items.map(i => `<div class="flex justify-between text-sm py-1 border-b border-navy-50"><span>${i.done ? '✓' : '○'} ${i.label}</span><span class="text-navy-700/50">${i.detail}</span></div>`).join('')}
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
      const val = c[s.key];
      if (val == null) return null;
      const y = h - pad - ((val - 1) / 4) * (h - pad * 2);
      return `${points[i]},${y}`;
    }).filter(Boolean);
    if (pts.length > 1) {
      svg += `<polyline points="${pts.join(' ')}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round"/>`;
    }
    checkIns.forEach((c, i) => {
      const val = c[s.key];
      if (val == null) return;
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

function renderCheckInForm() {
  titleEl.textContent = 'New Check-In';
  subtitleEl.textContent = 'Record a mentor session';

  const menteeOptions = state.mentees.map(m => `<option value="${m.id}" ${state.prefillMenteeId === m.id ? 'selected' : ''}>${m.fullName}</option>`).join('');

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
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());
    const checkIn = {
      id: uid(),
      menteeId: data.menteeId,
      checkInNumber: Number(data.checkInNumber) || 1,
      date: data.date,
      stageAtTime: null,
      meetingFormat: data.meetingFormat || null,
      leadGenerationActivity: data.leadGenerationActivity ? Number(data.leadGenerationActivity) : null,
      lightSpeedVtProgress: data.lightSpeedVtProgress ? Number(data.lightSpeedVtProgress) : null,
      loftyCrmUsage: data.loftyCrmUsage ? Number(data.loftyCrmUsage) : null,
      transactionsInPipeline: data.transactionsInPipeline ? Number(data.transactionsInPipeline) : null,
      totalClosed: data.totalClosed ? Number(data.totalClosed) : null,
      generalAssessmentNotes: data.generalAssessmentNotes || null,
      specificDirectionGiven: data.specificDirectionGiven || null,
      resourcesDirectedTo: [],
      priorCommitmentStatus: data.priorCommitmentStatus || null,
      verificationNotes: data.verificationNotes || null,
      topicsDiscussed: data.topicsDiscussed || null,
      keyCoachingPoints: data.keyCoachingPoints || null,
      studentCommitment: data.studentCommitment || null,
      commitmentDueDate: data.commitmentDueDate || null,
      escalationFlag: !!data.escalationFlag,
      escalationNotes: data.escalationNotes || null,
      nextCheckInDate: data.nextCheckInDate || null,
      nextCheckInFormat: data.nextCheckInFormat || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    state.checkIns.push(checkIn);
    if (checkIn.escalationFlag) {
      const m = state.mentees.find(x => x.id === checkIn.menteeId);
      if (m) m.status = 'escalated';
    }
    await saveCheckIn(checkIn);
    await loadFromSupabase();
    state.currentView = 'mentee';
    state.selectedMenteeId = checkIn.menteeId;
    state.prefillMenteeId = null;
    render();
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

async function saveEscalation(esc) {
  const payload = {
    user_id: state.user.id,
    mentee_id: esc.menteeId,
    date_of_submission: esc.dateOfSubmission,
    student_program_stage: esc.studentProgramStage,
    escalation_type: esc.escalationType,
    situation_summary: esc.situationSummary,
    actions_already_taken: esc.actionsAlreadyTaken,
    recommended_next_step: esc.recommendedNextStep,
    additional_context: esc.additionalContext,
    status: 'submitted'
  };
  await supabase.from('escalations').insert(payload);
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
  await supabase.from('graduation_recommendations').insert(payload);
}

function renderEscalationForm() {
  titleEl.textContent = 'Escalation Document';
  subtitleEl.textContent = 'Submit to National Director';
  const menteeOptions = state.mentees.map(m => `<option value="${m.id}">${m.fullName}</option>`).join('');
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
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());
    const esc = {
      menteeId: data.menteeId,
      dateOfSubmission: data.dateOfSubmission,
      studentProgramStage: data.studentProgramStage || null,
      escalationType: data.escalationType,
      situationSummary: data.situationSummary,
      actionsAlreadyTaken: data.actionsAlreadyTaken ? data.actionsAlreadyTaken.split('\\n').filter(Boolean) : [],
      recommendedNextStep: data.recommendedNextStep,
      additionalContext: data.additionalContext || null
    };
    await saveEscalation(esc);
    const m = state.mentees.find(x => x.id === esc.menteeId);
    if (m) {
      m.status = 'escalated';
      await saveMentee(m);
    }
    await loadFromSupabase();
    state.currentView = 'dashboard';
    render();
  };
}

function renderGraduationForm() {
  titleEl.textContent = 'Graduation Recommendation';
  subtitleEl.textContent = 'Submit when the student is ready';
  const menteeOptions = state.mentees.map(m => `<option value="${m.id}">${m.fullName}</option>`).join('');
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
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());
    const transactions = data.closedTransactions
      ? data.closedTransactions.split('\\n').filter(Boolean).map(line => {
          const parts = line.split('|').map(p => p.trim());
          return { propertyAddress: parts[0] || '', closeDate: parts[1] || null, salePrice: parts[2] ? Number(parts[2]) : null, skySlopeFileNumber: parts[3] || null };
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
    await saveGraduation(grad);
    const m = state.mentees.find(x => x.id === grad.menteeId);
    if (m) {
      m.status = 'graduated';
      await saveMentee(m);
    }
    await loadFromSupabase();
    state.currentView = 'dashboard';
    render();
  };
}

function renderFeedbackForm() {
  titleEl.textContent = 'Mentor Feedback';
  subtitleEl.textContent = 'Record structured feedback on a mentee';
  const menteeOptions = state.mentees.map(m => `<option value="${m.id}" ${state.prefillMenteeId === m.id ? 'selected' : ''}>${m.fullName}</option>`).join('');
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
    const fd = new FormData(e.target);
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
    await saveFeedback(fb);
    await loadFromSupabase();
    state.currentView = 'dashboard';
    render();
  };
}

  };
}

function renderKickoffForm() {
  titleEl.textContent = 'Kickoff Session';
  subtitleEl.textContent = 'Capture the starting point and systems setup';
  const menteeOptions = state.mentees.map(m => `<option value="${m.id}">${m.fullName}</option>`).join('');
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
    const fd = new FormData(e.target);
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
    await saveKickoff(k);
    await loadFromSupabase();
    state.currentView = 'dashboard';
    render();
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
    const data = Object.fromEntries(new FormData(e.target).entries());
    const mentee = {
      id: uid(),
      fullName: data.fullName.trim(),
      email: data.email || null,
      phone: data.phone || null,
      programStartDate: data.programStartDate || today(),
      currentStage: Number(data.currentStage) || 1,
      status: 'active',
      notes: data.notes || null
    };
    await saveMentee(mentee);
    document.getElementById('modal-root').innerHTML = '';
    await loadFromSupabase();
    openMentee(mentee.id);
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
  ].join('\\n');
  const blob = new Blob([text], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${m.fullName.replace(/\\s+/g, '-')}-summary.txt`;
  a.click();
}

// Initial render
state.currentView = state.currentView || 'dashboard';
render();
