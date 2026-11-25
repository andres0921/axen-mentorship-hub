// Mentee portal screens. Every value that came from the database goes through esc().
import { esc, safeUrl } from '../../shared/esc.js';
import { formatDate, formatDateTime, daysInProgram, weekOf, PRIOR_COMMITMENT_LABELS } from '../../shared/format.js';
import { stageTarget, closedRequired, stageCount, scoreThreshold } from '../../shared/program.js';
import { buildTrendChart } from '../../shared/chart.js';
import { m } from '../data.js';

const INPUT = 'w-full border border-navy-200 rounded-xl px-4 py-3 text-base bg-white';
const CARD = 'card p-5';

// Mentees never see "escalated"; it's an internal mentor/admin state.
const STATUS_LABELS = { active: 'Active', escalated: 'Active', paused: 'Paused', graduated: 'Graduated', dropped: 'Inactive' };
export const HELP_CATEGORIES = [
  ['transaction', 'Transaction question'],
  ['compliance_legal', 'Compliance / legal'],
  ['systems_access', 'Systems access (Lofty, VT, SkySlope…)'],
  ['personal', 'Personal / wellbeing'],
  ['other', 'Other'],
];
const HELP_STATUS = {
  open: ['Waiting for your mentor', 'bg-amber-100 text-amber-800'],
  acknowledged: ['Your mentor is on it', 'bg-navy-100 text-navy-800'],
  resolved: ['Resolved', 'bg-emerald-100 text-emerald-800'],
  escalated: ['Passed to the program team', 'bg-navy-100 text-navy-800'],
  cancelled: ['Cancelled', 'bg-gray-100 text-gray-600'],
};

function firstName(full) {
  return String(full || '').trim().split(/\s+/)[0] || 'there';
}

function line(label, value) {
  if (value === null || value === undefined || value === '') return '';
  return `<div class="text-sm mt-1.5"><span class="text-navy-700/50">${esc(label)}:</span> ${esc(value)}</div>`;
}

function scorePill(label, v) {
  return `<div class="text-center"><div class="text-xs text-navy-700/50 mb-1">${esc(label)}</div>${v ? `<span class="score-pill score-${esc(v)}">${esc(v)}</span>` : '<span class="text-navy-700/40">—</span>'}</div>`;
}

export function mentorCard(mentor, { compact = false } = {}) {
  if (!mentor) return `<div class="${CARD} text-sm text-navy-700/60">Your mentor’s details will appear here.</div>`;
  const booking = safeUrl(mentor.booking_url);
  return `
    <div class="${CARD}">
      <div class="text-xs uppercase tracking-wide text-navy-700/50">Your mentor</div>
      <div class="font-semibold text-lg mt-1">${esc(mentor.full_name || mentor.email || 'Your mentor')}</div>
      ${compact ? '' : `
        ${mentor.email ? `<a href="mailto:${esc(mentor.email)}" class="block text-sm mt-1 underline break-all">${esc(mentor.email)}</a>` : ''}
        ${mentor.phone ? `<a href="tel:${esc(String(mentor.phone).replace(/[^0-9+]/g, ''))}" class="block text-sm mt-1 underline">${esc(mentor.phone)}</a>` : ''}
        ${booking ? `<a href="${esc(booking)}" target="_blank" rel="noopener noreferrer" class="inline-block mt-3 text-sm px-4 py-2 rounded-xl bg-navy-900 text-white">Book time with your mentor</a>` : ''}`}
    </div>`;
}

function programOverview() {
  const n = stageCount();
  const stages = Array.from({ length: n }, (_, i) => i + 1);
  return `
    <div class="${CARD}">
      <h3 class="font-medium mb-3">How the program works</h3>
      <ol class="space-y-2 text-sm">
        ${stages.map(s => `<li class="flex justify-between gap-3"><span>Stage ${s}</span><span class="text-navy-700/60">target ${esc(stageTarget(s))} closed</span></li>`).join('')}
      </ol>
      <h4 class="font-medium mt-4 mb-2 text-sm">To graduate</h4>
      <ul class="text-sm space-y-1 list-disc ml-5">
        <li>${esc(closedRequired())} closed transactions</li>
        <li>All LightSpeed VT modules complete</li>
        <li>Proficient in Lofty CRM</li>
        <li>Connected with your Nexa Lending partner</li>
        <li>Your mentor’s recommendation, approved by the program</li>
      </ul>
    </div>`;
}

// ---------------------------------------------------------------------------
export function welcomeScreen() {
  const me = m.mentee;
  return `
    <div class="space-y-4">
      <div class="${CARD} bg-navy-900 text-white">
        <div class="font-display text-2xl">Welcome, ${esc(firstName(me.full_name))}!</div>
        <p class="text-sm text-white/80 mt-2">This is your AXEN mentorship portal: your progress, your sessions, weekly check-ins and a direct line to your mentor.</p>
      </div>
      ${mentorCard(m.mentor)}
      ${programOverview()}
      <form id="welcome-form" class="${CARD} space-y-3">
        <label class="block text-sm font-medium" for="welcome-phone">Confirm your phone number</label>
        <input id="welcome-phone" name="phone" type="tel" autocomplete="tel" value="${esc(me.phone || '')}" class="${INPUT}" placeholder="(555) 555-5555">
        <button type="submit" class="w-full btn-primary py-3 rounded-xl">Get started</button>
      </form>
    </div>`;
}

// ---------------------------------------------------------------------------
function latestSharedCheckIn() {
  return m.checkIns[0] || null; // ordered newest first
}

function thisWeeksSelfCheckIn() {
  const wk = weekOf();
  return m.selfCheckIns.find(s => s.week_of === wk) || null;
}

function nextCheckIn() {
  const ci = latestSharedCheckIn();
  if (ci && (ci.next_check_in_date || ci.next_check_in_format)) {
    return { date: ci.next_check_in_date, format: ci.next_check_in_format };
  }
  const k = m.kickoffs[0];
  if (k && (k.next_check_in_date || k.agreed_check_in_cadence)) {
    return { date: k.next_check_in_date, format: k.agreed_check_in_cadence, link: k.meeting_link };
  }
  return null;
}

function currentCommitment() {
  const ci = m.checkIns.find(c => c.student_commitment);
  if (ci) return { text: ci.student_commitment, due: ci.commitment_due_date };
  const k = m.kickoffs.find(x => x.initial_commitment);
  if (k) return { text: k.initial_commitment, due: k.next_check_in_date };
  return null;
}

const REC_LABEL = {
  not_started: 'Not yet submitted',
  submitted: 'Submitted, awaiting program approval',
  approved: 'Approved 🎓',
  declined: 'Not approved yet, talk to your mentor',
};

function progressCard() {
  const p = m.progress;
  if (!p) return '';
  const items = [
    { label: `${p.closed_required} closed transactions`, done: p.closed_done, detail: `${p.closed}/${p.closed_required}` },
    { label: 'LightSpeed VT complete', done: p.vt_complete },
    { label: 'Lofty CRM proficient', done: p.lofty_proficient },
    { label: 'Nexa Lending connected', done: p.nexa_connected },
    { label: 'Mentor recommendation', done: p.recommendation_status === 'approved', detail: REC_LABEL[p.recommendation_status] || p.recommendation_status },
  ];
  const done = items.filter(i => i.done).length;
  const pct = Math.round((done / items.length) * 100);
  return `
    <div class="${CARD}">
      <div class="flex items-baseline justify-between">
        <h3 class="font-medium">Graduation progress</h3>
        <span class="text-sm text-navy-700/60">${done}/${items.length}</span>
      </div>
      <div class="w-full bg-navy-100 rounded-full h-2 my-3"><div class="bg-gold-500 h-2 rounded-full" style="width:${pct}%"></div></div>
      <ul class="text-sm divide-y divide-navy-50">
        ${items.map(i => `<li class="flex justify-between gap-3 py-2"><span>${i.done ? '<span class="text-emerald-600">✓</span>' : '<span class="text-navy-700/40">○</span>'} ${esc(i.label)}</span>${i.detail ? `<span class="text-navy-700/60 text-right">${esc(i.detail)}</span>` : ''}</li>`).join('')}
      </ul>
      <p class="text-xs text-navy-700/50 mt-2">Based on the check-ins your mentor has shared with you. A score of ${esc(scoreThreshold())}+ counts as complete.</p>
    </div>`;
}

export function homeScreen() {
  const me = m.mentee;
  const sci = thisWeeksSelfCheckIn();
  const next = nextCheckIn();
  const commit = currentCommitment();
  const fb = m.feedback[0];
  const stage = me.current_stage;
  return `
    <div class="space-y-4">
      <div>
        <div class="font-display text-2xl">Hi ${esc(firstName(me.full_name))}</div>
        <div class="flex flex-wrap items-center gap-2 mt-2 text-sm">
          <span class="px-3 py-1 rounded-full bg-gold-100 text-gold-800 font-medium">Stage ${esc(stage || '—')} of ${esc(stageCount())}</span>
          <span class="px-3 py-1 rounded-full bg-navy-100">${daysInProgram(me.program_start_date)} days in program</span>
          <span class="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800">${esc(STATUS_LABELS[me.status] || 'Active')}</span>
        </div>
        ${stage ? `<div class="text-xs text-navy-700/60 mt-2">Stage ${esc(stage)} target: ${esc(stageTarget(stage))} closed transactions</div>` : ''}
      </div>

      ${sci
        ? `<div class="${CARD} flex items-center justify-between gap-3">
             <div><div class="font-medium">This week’s check-in is in ✓</div><div class="text-xs text-navy-700/60">${sci.reviewed_at ? 'Reviewed by your mentor' : 'You can edit it until your mentor reviews it'}</div></div>
             ${sci.reviewed_at ? '' : `<a href="#checkin/${esc(sci.id)}" class="text-sm px-4 py-2 rounded-xl border border-navy-200">Edit</a>`}
           </div>`
        : `<a href="#checkin" class="block w-full text-center btn-primary py-4 rounded-2xl text-base">Submit this week’s check-in</a>`}

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="${CARD}">
          <div class="text-xs uppercase tracking-wide text-navy-700/50">Next check-in</div>
          ${next ? `
            <div class="font-semibold text-lg mt-1">${next.date ? esc(formatDate(next.date)) : 'To be scheduled'}</div>
            ${next.format ? `<div class="text-sm text-navy-700/70 mt-1 break-words">${safeUrl(next.format) ? `<a class="underline" target="_blank" rel="noopener noreferrer" href="${esc(safeUrl(next.format))}">Join link</a>` : esc(next.format)}</div>` : ''}
            ${next.link && safeUrl(next.link) ? `<a class="text-sm underline" target="_blank" rel="noopener noreferrer" href="${esc(safeUrl(next.link))}">Meeting link</a>` : ''}`
            : '<div class="text-sm text-navy-700/60 mt-1">Your mentor will schedule it.</div>'}
        </div>
        <div class="${CARD}">
          <div class="text-xs uppercase tracking-wide text-navy-700/50">Current commitment</div>
          ${commit ? `
            <div class="mt-1">${esc(commit.text)}</div>
            ${commit.due ? `<div class="text-xs text-navy-700/60 mt-1">Due ${esc(formatDate(commit.due))}</div>` : ''}`
            : '<div class="text-sm text-navy-700/60 mt-1">No commitment yet.</div>'}
        </div>
      </div>

      ${progressCard()}

      ${fb ? `
        <a href="#feedback" class="block ${CARD}">
          <div class="text-xs uppercase tracking-wide text-navy-700/50">Latest feedback · ${esc(formatDate(fb.date))}</div>
          <div class="mt-1 text-sm line-clamp-3">${esc(fb.strengths || fb.recommended_actions || fb.areas_for_improvement || fb.specific_observations || 'View feedback')}</div>
          ${fb.mentee_acknowledged_at ? '' : '<div class="text-xs text-gold-700 mt-2 font-medium">New · tap to read</div>'}
        </a>` : ''}

      <a href="#help" class="block w-full text-center py-3 rounded-2xl border border-navy-200 bg-white">Ask your mentor for help</a>
      ${mentorCard(m.mentor, { compact: true })}
    </div>`;
}

// ---------------------------------------------------------------------------
function radio1to5(name, value) {
  return `
    <div class="flex gap-2">
      ${[1, 2, 3, 4, 5].map(n => `
        <label class="cursor-pointer">
          <input type="radio" name="${name}" value="${n}" class="sr-only peer" ${Number(value) === n ? 'checked' : ''}>
          <div class="score-pill score-${n} peer-checked:ring-2 peer-checked:ring-gold-500 peer-checked:ring-offset-2">${n}</div>
        </label>`).join('')}
    </div>`;
}

function numberField(name, label, value) {
  return `<label class="block"><span class="block text-sm mb-1">${esc(label)}</span><input type="number" inputmode="numeric" min="0" name="${name}" value="${value ?? ''}" class="${INPUT}"></label>`;
}

export function checkInScreen(editId) {
  const existing = editId ? m.selfCheckIns.find(s => s.id === editId) : thisWeeksSelfCheckIn();
  const s = existing || {};
  const locked = !!s.reviewed_at;
  const wk = s.week_of || weekOf();
  const history = m.selfCheckIns.filter(x => x.id !== s.id);
  const form = locked ? `
      <div class="${CARD}">
        <div class="font-medium">Week of ${esc(formatDate(wk))}</div>
        <div class="text-xs text-emerald-700 mt-1">Reviewed by your mentor ${esc(formatDate(s.reviewed_at))} · locked</div>
        ${selfCheckInSummary(s)}
      </div>` : `
      <form id="self-checkin-form" class="space-y-4" data-id="${esc(s.id || '')}" data-week="${esc(wk)}">
        <div class="${CARD}">
          <div class="font-medium">Week of ${esc(formatDate(wk))}</div>
          <div class="text-xs text-navy-700/60">${existing ? 'Editing. You can change this until your mentor reviews it.' : 'Takes about 2 minutes.'}</div>
        </div>
        <div class="${CARD} space-y-4">
          <h3 class="font-medium">Rate yourself (1–5)</h3>
          <div><div class="text-sm mb-2">Lead generation activity</div>${radio1to5('lead_gen_self_score', s.lead_gen_self_score)}</div>
          <div><div class="text-sm mb-2">LightSpeed VT progress</div>${radio1to5('vt_self_score', s.vt_self_score)}</div>
          <div><div class="text-sm mb-2">Lofty CRM usage</div>${radio1to5('lofty_self_score', s.lofty_self_score)}</div>
        </div>
        <div class="${CARD} grid grid-cols-2 gap-3">
          ${numberField('conversations_count', 'Conversations', s.conversations_count)}
          ${numberField('appointments_set', 'Appointments set', s.appointments_set)}
          ${numberField('transactions_in_pipeline', 'In pipeline', s.transactions_in_pipeline)}
          ${numberField('total_closed', 'Total closed', s.total_closed)}
        </div>
        <div class="${CARD} space-y-3">
          <div class="text-sm font-medium">Did you complete your last commitment?</div>
          <div class="grid grid-cols-3 gap-2">
            ${[['yes', 'Yes'], ['partial', 'Partly'], ['not', 'No']].map(([v, l]) => `
              <label class="cursor-pointer"><input type="radio" name="prior_commitment_status" value="${v}" class="sr-only peer" ${s.prior_commitment_status === v ? 'checked' : ''}>
                <div class="text-center py-2 rounded-xl border border-navy-200 peer-checked:bg-navy-900 peer-checked:text-white">${l}</div></label>`).join('')}
          </div>
          <textarea name="prior_commitment_note" rows="2" maxlength="2000" placeholder="Anything to add?" class="${INPUT}">${esc(s.prior_commitment_note || '')}</textarea>
        </div>
        <div class="${CARD} space-y-3">
          <label class="block"><span class="block text-sm mb-1 font-medium">Wins this week</span><textarea name="wins" rows="3" maxlength="5000" class="${INPUT}">${esc(s.wins || '')}</textarea></label>
          <label class="block"><span class="block text-sm mb-1 font-medium">Blockers</span><textarea name="blockers" rows="3" maxlength="5000" class="${INPUT}">${esc(s.blockers || '')}</textarea></label>
          <label class="flex items-center gap-3"><input type="checkbox" name="help_needed" class="w-5 h-5 rounded" ${s.help_needed ? 'checked' : ''}><span>I need help from my mentor</span></label>
        </div>
        <button type="submit" class="w-full btn-primary py-4 rounded-2xl text-base">${existing ? 'Save changes' : 'Submit check-in'}</button>
      </form>`;
  return `
    <div class="space-y-4">
      <h2 class="font-display text-2xl">Weekly check-in</h2>
      ${form}
      <h3 class="font-medium pt-4">History</h3>
      ${history.length ? history.map(h => `
        <div class="${CARD}">
          <div class="flex items-center justify-between gap-2">
            <div class="font-medium">Week of ${esc(formatDate(h.week_of))}</div>
            ${h.reviewed_at
              ? '<span class="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">Reviewed by mentor</span>'
              : `<a href="#checkin/${esc(h.id)}" class="text-xs px-3 py-1.5 rounded-lg border border-navy-200">Edit</a>`}
          </div>
          ${selfCheckInSummary(h)}
        </div>`).join('') : '<div class="text-sm text-navy-700/60">No earlier check-ins.</div>'}
    </div>`;
}

function selfCheckInSummary(s) {
  return `
    <div class="grid grid-cols-3 gap-2 mt-3">${scorePill('Lead Gen', s.lead_gen_self_score)}${scorePill('VT', s.vt_self_score)}${scorePill('CRM', s.lofty_self_score)}</div>
    ${line('Conversations', s.conversations_count)}${line('Appointments', s.appointments_set)}
    ${line('Pipeline', s.transactions_in_pipeline)}${line('Closed', s.total_closed)}
    ${line('Last commitment', PRIOR_COMMITMENT_LABELS[s.prior_commitment_status])}
    ${line('Wins', s.wins)}${line('Blockers', s.blockers)}
    ${s.help_needed ? '<div class="text-xs text-red-700 mt-2">You asked for help</div>' : ''}`;
}

export function readSelfCheckInForm(form) {
  const fd = new FormData(form);
  const num = (k) => { const v = fd.get(k); return v === null || v === '' ? null : Math.max(0, Math.floor(Number(v))); };
  const str = (k) => { const v = (fd.get(k) || '').toString().trim(); return v || null; };
  return {
    lead_gen_self_score: num('lead_gen_self_score'),
    vt_self_score: num('vt_self_score'),
    lofty_self_score: num('lofty_self_score'),
    conversations_count: num('conversations_count'),
    appointments_set: num('appointments_set'),
    transactions_in_pipeline: num('transactions_in_pipeline'),
    total_closed: num('total_closed'),
    prior_commitment_status: str('prior_commitment_status'),
    prior_commitment_note: str('prior_commitment_note'),
    wins: str('wins'),
    blockers: str('blockers'),
    help_needed: fd.get('help_needed') === 'on',
  };
}

// ---------------------------------------------------------------------------
export function sessionsScreen() {
  const k = m.kickoffs[0];
  const chartRows = [...m.checkIns].reverse().map(c => ({
    leadGenerationActivity: c.lead_generation_activity,
    lightSpeedVtProgress: c.light_speed_vt_progress,
    loftyCrmUsage: c.lofty_crm_usage,
  }));
  return `
    <div class="space-y-4">
      <h2 class="font-display text-2xl">Sessions</h2>
      ${k ? `
        <div class="${CARD}">
          <div class="font-medium">Kickoff · ${esc(formatDateTime(k.date_time))}</div>
          <div class="text-sm mt-2"><span class="text-navy-700/50">Systems activated:</span> ${(k.systems_activated || []).map(s => `<span class="inline-block text-xs px-2 py-0.5 rounded-full bg-navy-100 mr-1 mb-1">${esc(s)}</span>`).join('') || '—'}</div>
          ${line('Check-in cadence', k.agreed_check_in_cadence)}
          ${line('Initial commitment', k.initial_commitment)}
          ${line('My why', k.student_why_notes)}
        </div>` : ''}
      ${m.checkIns.length > 1 ? `<div class="${CARD}"><h3 class="font-medium mb-2">Your scores over time</h3>${buildTrendChart(chartRows)}</div>` : ''}
      ${m.checkIns.length ? m.checkIns.map(c => `
        <div class="${CARD}">
          <div class="font-medium">Check-in${c.check_in_number ? ` #${esc(c.check_in_number)}` : ''} · ${esc(formatDate(c.date))}</div>
          ${c.meeting_format ? `<div class="text-xs text-navy-700/60">${esc(c.meeting_format)}</div>` : ''}
          <div class="grid grid-cols-3 gap-2 mt-3">${scorePill('Lead Gen', c.lead_generation_activity)}${scorePill('VT', c.light_speed_vt_progress)}${scorePill('CRM', c.lofty_crm_usage)}</div>
          ${line('Pipeline', c.transactions_in_pipeline)}${line('Total closed', c.total_closed)}
          ${line('Direction', c.specific_direction_given)}
          ${line('Last commitment', PRIOR_COMMITMENT_LABELS[c.prior_commitment_status])}
          ${line('Topics', c.topics_discussed)}
          ${line('Key coaching points', c.key_coaching_points)}
          ${c.student_commitment ? line('Your commitment', c.student_commitment + (c.commitment_due_date ? ` (due ${formatDate(c.commitment_due_date)})` : '')) : ''}
          ${c.next_check_in_date || c.next_check_in_format ? line('Next check-in', [c.next_check_in_date ? formatDate(c.next_check_in_date) : '', c.next_check_in_format || ''].filter(Boolean).join(' · ')) : ''}
        </div>`).join('') : `<div class="${CARD} text-sm text-navy-700/60">Your mentor hasn’t shared any check-ins yet.</div>`}
    </div>`;
}

// ---------------------------------------------------------------------------
export function feedbackScreen() {
  return `
    <div class="space-y-4">
      <h2 class="font-display text-2xl">Feedback</h2>
      ${m.feedback.length ? m.feedback.map(f => `
        <div class="${CARD}">
          <div class="text-xs uppercase tracking-wide text-navy-700/50">${esc(formatDate(f.date))}</div>
          ${line('Strengths', f.strengths)}
          ${line('Areas for improvement', f.areas_for_improvement)}
          ${line('Observations', f.specific_observations)}
          ${line('Recommended actions', f.recommended_actions)}
          ${f.mentee_acknowledged_at
            ? `<div class="text-xs text-emerald-700 mt-3">✓ Acknowledged ${esc(formatDate(f.mentee_acknowledged_at))}</div>`
            : `<button type="button" data-action="ack-feedback" data-id="${esc(f.id)}" class="mt-3 text-sm px-4 py-2 rounded-xl bg-navy-900 text-white">Got it</button>`}
        </div>`).join('') : `<div class="${CARD} text-sm text-navy-700/60">No feedback shared yet.</div>`}
    </div>`;
}

// ---------------------------------------------------------------------------
export function helpScreen() {
  return `
    <div class="space-y-4">
      <h2 class="font-display text-2xl">Get help</h2>
      <form id="help-form" class="${CARD} space-y-3">
        <label class="block"><span class="block text-sm mb-1">What do you need help with?</span>
          <select name="category" required class="${INPUT}" data-input-action="help-category">
            ${HELP_CATEGORIES.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}
          </select></label>
        <div id="help-personal-note" class="hidden text-sm p-3 rounded-xl bg-red-50 text-red-800">Your mentor will reach out. If you’re in crisis, call or text <a href="tel:988" class="underline font-semibold">988</a> (Suicide &amp; Crisis Lifeline).</div>
        <label class="block"><span class="block text-sm mb-1">Urgency</span>
          <select name="urgency" class="${INPUT}"><option value="normal">Normal</option><option value="urgent">Urgent</option></select></label>
        <label class="block"><span class="block text-sm mb-1">Message</span>
          <textarea name="message" rows="4" required maxlength="5000" class="${INPUT}" placeholder="Describe what’s going on"></textarea></label>
        <p class="text-xs text-navy-700/50">Your mentor and the program admin can see help requests.</p>
        <button type="submit" class="w-full btn-primary py-3 rounded-xl">Send to my mentor</button>
      </form>
      <h3 class="font-medium pt-2">My requests</h3>
      ${m.helpRequests.length ? m.helpRequests.map(h => {
        const [label, cls] = HELP_STATUS[h.status] || [h.status, 'bg-gray-100'];
        const cat = (HELP_CATEGORIES.find(c => c[0] === h.category) || [null, h.category])[1];
        return `
          <div class="${CARD}">
            <div class="flex items-center justify-between gap-2">
              <div class="font-medium">${esc(cat)}${h.urgency === 'urgent' ? ' <span class="text-xs text-red-700">· urgent</span>' : ''}</div>
              <span class="text-xs px-2 py-0.5 rounded-full ${cls}">${esc(label)}</span>
            </div>
            <div class="text-sm mt-2 whitespace-pre-wrap">${esc(h.message)}</div>
            <div class="text-xs text-navy-700/50 mt-1">${esc(formatDateTime(h.created_at))}</div>
            ${h.mentor_response ? `<div class="text-sm mt-3 p-3 rounded-xl bg-navy-50"><span class="text-navy-700/60">Mentor:</span> ${esc(h.mentor_response)}</div>` : ''}
            ${h.status === 'open' ? `<button type="button" data-action="cancel-help" data-id="${esc(h.id)}" class="mt-3 text-sm px-4 py-2 rounded-xl border border-navy-200">Cancel request</button>` : ''}
          </div>`;
      }).join('') : '<div class="text-sm text-navy-700/60">No requests yet.</div>'}
    </div>`;
}

// ---------------------------------------------------------------------------
export function accountScreen(email) {
  const me = m.mentee;
  return `
    <div class="space-y-4">
      <h2 class="font-display text-2xl">Account</h2>
      <div class="${CARD} space-y-2 text-sm">
        <div><span class="text-navy-700/50">Name</span><div class="font-medium">${esc(me.full_name)}</div></div>
        <div><span class="text-navy-700/50">Sign-in email</span><div class="break-all">${esc(email || me.email || '—')}</div></div>
        <div><span class="text-navy-700/50">Program start</span><div>${esc(formatDate(me.program_start_date))}</div></div>
      </div>
      <form id="phone-form" class="${CARD} space-y-3">
        <label class="block"><span class="block text-sm mb-1">Phone</span>
          <input name="phone" type="tel" autocomplete="tel" value="${esc(me.phone || '')}" class="${INPUT}"></label>
        <button type="submit" class="w-full py-3 rounded-xl border border-navy-200 bg-white">Save phone</button>
      </form>
      ${mentorCard(m.mentor)}
      <button type="button" data-action="sign-out" class="w-full py-3 rounded-xl border border-red-200 text-red-700 bg-white">Sign out</button>
    </div>`;
}
