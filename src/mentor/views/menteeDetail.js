import { esc, safeUrl } from '../../shared/esc.js';
import { formatDate, formatDateTime, daysInProgram, PRIOR_COMMITMENT_LABELS } from '../../shared/format.js';
import { computeGraduationProgress } from '../../shared/program.js';
import { buildTrendChart } from '../../shared/chart.js';
import { state, isAdmin, isMyMentee, mentorName } from '../state.js';
import { dom, setHeader, statusClass, detailLine, sharedBadge, MENTOR_ONLY_BADGE } from './common.js';
import { renderDashboard } from './dashboard.js';

export const HELP_CATEGORY_LABELS = {
  transaction: 'Transaction question',
  compliance_legal: 'Compliance / legal',
  systems_access: 'Systems access',
  personal: 'Personal / wellbeing',
  other: 'Other',
};

const PORTAL_LABELS = {
  none: ['Not invited', 'bg-navy-100 text-navy-700'],
  invited: ['Invited (not yet signed in)', 'bg-amber-100 text-amber-800'],
  active: ['Active', 'bg-emerald-100 text-emerald-800'],
  revoked: ['Revoked', 'bg-red-100 text-red-800'],
};

function renderKickoffs(menteeId) {
  const kickoffs = (state.kickoffs || [])
    .filter(k => k.mentee_id === menteeId)
    .sort((a, b) => new Date(b.date_time || b.created_at) - new Date(a.date_time || a.created_at));
  if (!kickoffs.length) {
    return `<div class="card p-6 text-sm text-navy-700/50">No kickoff session recorded yet.</div>`;
  }
  return kickoffs.map(k => {
    const systems = Array.isArray(k.systems_activated) ? k.systems_activated : [];
    const url = safeUrl(k.meeting_link);
    const link = url
      ? `<div class="text-sm mt-1"><span class="text-navy-700/50">Meeting link:</span> <a href="${esc(url)}" target="_blank" rel="noopener noreferrer" class="underline break-all">${esc(url)}</a></div>`
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

export function latestGraduation(menteeId) {
  return (state.graduations || [])
    .filter(g => g.mentee_id === menteeId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null;
}

const REC_STATUS = { submitted: 'Submitted · awaiting admin approval', approved: 'Approved by admin', declined: 'Declined by admin' };

// Same definition as public.get_my_graduation_progress(); numbers come from
// program_settings (fallback src/shared/config.js PROGRAM).
export function buildReadiness(m, checkIns) {
  const latest = checkIns[checkIns.length - 1] || {};
  const rec = latestGraduation(m.id);
  const p = computeGraduationProgress({
    total_closed: latest.totalClosed,
    light_speed_vt_progress: latest.lightSpeedVtProgress,
    lofty_crm_usage: latest.loftyCrmUsage,
  }, rec);
  const required = p.closed_required;
  const closed = p.closed;
  const items = [
    { label: `${required} Closed Transactions`, done: p.closed_done, detail: `${closed}/${required}` },
    { label: 'LightSpeed VT Complete', done: p.vt_complete, detail: `Score ${latest.lightSpeedVtProgress || '—'}` },
    { label: 'Lofty CRM Proficient', done: p.lofty_proficient, detail: `Score ${latest.loftyCrmUsage || '—'}` },
    { label: 'Nexa Connected', done: p.nexa_connected, detail: rec ? (rec.nexa_lending_connected ? 'Confirmed' : 'Not confirmed') : 'Confirm in graduation form' },
    { label: 'Mentor Recommendation', done: !!rec, detail: rec ? (REC_STATUS[rec.status] || rec.status) : 'Submit when ready' },
  ];
  const doneCount = items.filter(i => i.done).length;
  const pct = Math.round((doneCount / items.length) * 100);
  return `
    <div class="text-sm mb-2">${doneCount}/${items.length} complete · ${pct}%</div>
    <div class="w-full bg-navy-100 rounded-full h-2 mb-3"><div class="bg-gold-500 h-2 rounded-full" style="width:${pct}%"></div></div>
    ${items.map(i => `<div class="flex justify-between text-sm py-1 border-b border-navy-50"><span>${i.done ? '✓' : '○'} ${esc(i.label)}</span><span class="text-navy-700/50 text-right">${esc(i.detail)}</span></div>`).join('')}
  `;
}

function renderPortalCard(m, canManage) {
  const [label, cls] = PORTAL_LABELS[m.portalAccess] || PORTAL_LABELS.none;
  const invites = state.invitations.filter(i => i.mentee_id === m.id);
  const lastSent = invites.find(i => ['invite', 'resend', 'existing_user_linked'].includes(i.kind) && i.status !== 'failed');
  const accepted = invites.find(i => i.accepted_at);
  const lastFailed = invites[0] && invites[0].status === 'failed' ? invites[0] : null;
  const unsharedCheckIns = state.checkIns.filter(c => c.menteeId === m.id && !c.sharedWithMentee).length;
  const unsharedFeedback = state.feedback.filter(f => f.mentee_id === m.id && !f.shared_with_mentee).length;
  const id = esc(m.id);

  let buttons = '';
  if (canManage) {
    if (m.portalAccess === 'invited' || m.portalAccess === 'active') {
      buttons = `
        <button type="button" data-action="portal" data-portal-action="resend" data-mentee-id="${id}" class="text-sm px-3 py-2 rounded-lg border border-navy-200 max-md:min-h-[44px]">Resend link</button>
        <button type="button" data-action="portal" data-portal-action="revoke" data-mentee-id="${id}" class="text-sm px-3 py-2 rounded-lg border border-red-200 text-red-700 max-md:min-h-[44px]">Revoke access</button>`;
    } else {
      buttons = m.email
        ? `<button type="button" data-action="portal" data-portal-action="invite" data-mentee-id="${id}" class="text-sm px-3 py-2 rounded-lg bg-gold-500 text-navy-900 font-medium max-md:min-h-[44px]">Invite to portal</button>`
        : `<div class="text-xs text-navy-700/60">Add an email address to invite this mentee.</div>`;
    }
  }

  return `
    <div class="card p-6" id="portal-card">
      <h3 class="font-medium mb-3">Mentee Portal Access</h3>
      <div class="text-sm space-y-2">
        <div><span class="text-xs px-2.5 py-1 rounded-full ${cls}">${esc(label)}</span></div>
        <div><span class="text-navy-700/50">Last invite sent:</span> ${lastSent ? esc(formatDateTime(lastSent.sent_at)) : '—'}</div>
        <div><span class="text-navy-700/50">Accepted:</span> ${accepted ? esc(formatDateTime(accepted.accepted_at)) : '—'}</div>
        ${lastFailed ? `<div class="text-xs text-red-700">Last attempt failed (${esc(formatDateTime(lastFailed.sent_at))}).</div>` : ''}
      </div>
      <div class="flex flex-wrap gap-2 mt-4">${buttons}</div>
      ${canManage ? `
        <div class="mt-4 pt-4 border-t border-navy-100 space-y-2">
          <div class="text-xs text-navy-700/60">Check-ins and feedback written before the portal existed are hidden from the mentee until you share them.</div>
          <button type="button" data-action="share-all-checkins" data-mentee-id="${id}" class="w-full text-sm px-3 py-2 rounded-lg border border-navy-200 max-md:min-h-[44px]" ${unsharedCheckIns ? '' : 'disabled'}>Share all past check-ins (${unsharedCheckIns} hidden)</button>
          <button type="button" data-action="share-all-feedback" data-mentee-id="${id}" class="w-full text-sm px-3 py-2 rounded-lg border border-navy-200 max-md:min-h-[44px]" ${unsharedFeedback ? '' : 'disabled'}>Share all past feedback (${unsharedFeedback} hidden)</button>
        </div>` : ''}
    </div>
  `;
}

function scoreLine(label, v) {
  return v ? `<span class="inline-flex items-center gap-1 mr-3"><span class="text-navy-700/50 text-xs">${esc(label)}</span><span class="score-pill score-${esc(v)}">${esc(v)}</span></span>` : '';
}

function renderSelfCheckIns(menteeId, canManage) {
  const rows = state.selfCheckIns.filter(s => s.mentee_id === menteeId)
    .sort((a, b) => (b.week_of || '').localeCompare(a.week_of || ''));
  if (!rows.length) return `<div class="card p-6 text-sm text-navy-700/50">No self check-ins submitted yet.</div>`;
  return rows.map(s => `
    <div class="card p-5">
      <div class="flex flex-wrap items-center justify-between mb-2 gap-2">
        <div class="font-medium">Week of ${esc(formatDate(s.week_of))}${s.help_needed ? ' <span class="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-800 ml-1">Asked for help</span>' : ''}</div>
        ${s.reviewed_at
          ? `<span class="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">Reviewed ${esc(formatDate(s.reviewed_at))}</span>`
          : (canManage ? `<button type="button" data-action="review-self-checkin" data-id="${esc(s.id)}" class="text-xs px-3 py-1.5 rounded-lg bg-gold-500 text-navy-900 font-medium max-md:min-h-[44px] max-md:text-sm">Mark reviewed</button>` : '<span class="text-xs text-navy-700/50">Awaiting review</span>')}
      </div>
      <div class="flex flex-wrap items-center mb-1">
        ${scoreLine('Lead Gen', s.lead_gen_self_score)}${scoreLine('VT', s.vt_self_score)}${scoreLine('CRM', s.lofty_self_score)}
      </div>
      ${detailLine('Conversations', s.conversations_count)}
      ${detailLine('Appointments set', s.appointments_set)}
      ${detailLine('Pipeline', s.transactions_in_pipeline)}
      ${detailLine('Total closed', s.total_closed)}
      ${detailLine('Last commitment', PRIOR_COMMITMENT_LABELS[s.prior_commitment_status] || s.prior_commitment_status)}
      ${detailLine('Commitment note', s.prior_commitment_note)}
      ${detailLine('Wins', s.wins)}
      ${detailLine('Blockers', s.blockers)}
      <div class="text-xs text-navy-700/40 mt-2">Submitted ${esc(formatDateTime(s.created_at))}${s.updated_at && s.updated_at !== s.created_at ? ` · edited ${esc(formatDateTime(s.updated_at))}` : ''}</div>
    </div>
  `).join('');
}

const HELP_STATUS_CLASS = {
  open: 'bg-red-100 text-red-800',
  acknowledged: 'bg-amber-100 text-amber-800',
  resolved: 'bg-emerald-100 text-emerald-800',
  escalated: 'bg-gold-100 text-gold-800',
  cancelled: 'bg-gray-100 text-gray-600',
};

function renderHelpRequests(menteeId, canManage, canEscalate) {
  const rows = state.helpRequests.filter(h => h.mentee_id === menteeId);
  if (!rows.length) return `<div class="card p-6 text-sm text-navy-700/50">No help requests.</div>`;
  return rows.map(h => {
    const id = esc(h.id);
    const closed = ['resolved', 'cancelled'].includes(h.status);
    return `
      <div class="card p-5">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div class="font-medium">${esc(HELP_CATEGORY_LABELS[h.category] || h.category)}${h.urgency === 'urgent' ? ' <span class="text-xs px-2 py-0.5 rounded-full bg-red-600 text-white ml-1">Urgent</span>' : ''}</div>
          <span class="text-xs px-2 py-0.5 rounded-full ${HELP_STATUS_CLASS[h.status] || 'bg-gray-100'}">${esc(h.status)}</span>
        </div>
        <div class="text-sm whitespace-pre-wrap break-words">${esc(h.message)}</div>
        <div class="text-xs text-navy-700/40 mt-1">${esc(formatDateTime(h.created_at))}</div>
        ${h.category === 'personal' ? '<div class="text-xs mt-2 text-red-700">Personal / wellbeing request: reach out directly. Crisis line: call or text 988.</div>' : ''}
        ${h.mentor_response ? `<div class="text-sm mt-3 p-3 rounded-lg bg-navy-50"><span class="text-navy-700/50">Your response:</span> ${esc(h.mentor_response)}</div>` : ''}
        ${canManage && !closed ? `
          <div class="mt-3 space-y-2">
            <textarea id="hr-resp-${id}" rows="2" placeholder="Response the mentee will see" class="w-full border border-navy-200 rounded-lg px-3 py-2 text-sm max-md:text-base">${esc(h.mentor_response || '')}</textarea>
            <div class="flex flex-wrap gap-2">
              <button type="button" data-action="help-respond" data-id="${id}" data-status="acknowledged" class="text-xs px-3 py-1.5 rounded-lg border border-navy-200 max-md:min-h-[44px] max-md:text-sm">Send / acknowledge</button>
              <button type="button" data-action="help-respond" data-id="${id}" data-status="resolved" class="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white max-md:min-h-[44px] max-md:text-sm">Resolve</button>
              ${canEscalate && h.status !== 'escalated' ? `<button type="button" data-action="convert-help" data-id="${id}" class="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-700 max-md:min-h-[44px] max-md:text-sm">Convert to escalation</button>` : ''}
            </div>
          </div>` : ''}
      </div>
    `;
  }).join('');
}

function renderFeedbackList(menteeId) {
  const rows = state.feedback.filter(f => f.mentee_id === menteeId)
    .sort((a, b) => new Date(b.date || b.created_at) - new Date(a.date || a.created_at));
  if (!rows.length) return `<div class="card p-6 text-sm text-navy-700/50">No feedback recorded yet.</div>`;
  return rows.map(f => {
    const own = state.user && f.user_id === state.user.id;
    return `
      <div class="card p-5">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div class="font-medium">${esc(formatDate(f.date))} · ${esc(f.feedback_type)}</div>
          <div class="flex items-center gap-2">
            ${sharedBadge(f.shared_with_mentee)}
            ${own ? `<button type="button" data-action="toggle-share-feedback" data-id="${esc(f.id)}" data-shared="${f.shared_with_mentee ? '1' : '0'}" class="text-xs underline max-md:min-h-[44px] max-md:px-2">${f.shared_with_mentee ? 'Hide from mentee' : 'Share'}</button>` : ''}
          </div>
        </div>
        ${detailLine('Strengths', f.strengths)}
        ${detailLine('Areas for improvement', f.areas_for_improvement)}
        ${detailLine('Observations', f.specific_observations)}
        ${detailLine('Recommended actions', f.recommended_actions)}
        ${f.mentee_acknowledged_at ? `<div class="text-xs text-emerald-700 mt-2">Mentee acknowledged ${esc(formatDate(f.mentee_acknowledged_at))}</div>` : ''}
        ${f.overall_rating || f.private_notes ? `
          <div class="mentor-only rounded-lg p-3 mt-3">
            ${MENTOR_ONLY_BADGE}
            ${detailLine('Overall rating', f.overall_rating)}
            ${detailLine('Private notes', f.private_notes)}
          </div>` : ''}
      </div>
    `;
  }).join('');
}

export function renderMenteeDetail(id) {
  const m = state.mentees.find(x => x.id === id);
  if (!m) return renderDashboard();

  const canManage = isMyMentee(m.id) || isAdmin();
  const mid = esc(m.id);
  setHeader(m.fullName, `Stage ${m.currentStage || '—'} · Started ${formatDate(m.programStartDate)}`);

  const checkIns = state.checkIns
    .filter(c => c.menteeId === id)
    .sort((a, b) => new Date(a.date) - new Date(b.date)); // oldest first for chart

  const trendChart = buildTrendChart(checkIns);

  let html = `
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div class="lg:col-span-1 space-y-6">
        <div class="card p-6">
          <h3 class="font-medium mb-4">Profile</h3>
          <div class="space-y-3 text-sm break-words">
            <div><span class="text-navy-700/50">Email</span><div>${esc(m.email) || '—'}</div></div>
            <div><span class="text-navy-700/50">Phone</span><div>${esc(m.phone) || '—'}</div></div>
            <div><span class="text-navy-700/50">Status</span><div class="mt-1"><span class="text-xs px-2.5 py-1 rounded-full ${statusClass(m.status)}">${esc(m.status)}</span></div></div>
            <div><span class="text-navy-700/50">Days in program</span><div>${daysInProgram(m.programStartDate)}</div></div>
            ${isAdmin() ? `<div><span class="text-navy-700/50">Mentor</span><div>${esc(mentorName(m.userId))}</div></div>` : ''}
          </div>
          ${m.notes ? `<div class="mt-4 pt-4 border-t text-sm text-navy-700/80 whitespace-pre-wrap"><div class="mb-1">${MENTOR_ONLY_BADGE}</div>${esc(m.notes)}</div>` : ''}
        </div>
        ${isMyMentee(m.id) ? `
          <button type="button" data-action="nav" data-view="checkin" data-mentee-id="${mid}" class="w-full btn-primary py-3 rounded-xl">New Check-In</button>
          <div class="grid grid-cols-2 gap-2">
            <button type="button" data-action="nav" data-view="feedback" data-mentee-id="${mid}" class="py-2 rounded-xl border text-sm max-md:min-h-[44px] max-md:px-2">Feedback</button>
            <button type="button" data-action="nav" data-view="kickoff" data-mentee-id="${mid}" class="py-2 rounded-xl border text-sm max-md:min-h-[44px] max-md:px-2">Kickoff</button>
            <button type="button" data-action="nav" data-view="escalation" data-mentee-id="${mid}" class="py-2 rounded-xl border text-sm max-md:min-h-[44px] max-md:px-2">Escalate</button>
            <button type="button" data-action="nav" data-view="graduation" data-mentee-id="${mid}" class="py-2 rounded-xl border text-sm max-md:min-h-[44px] max-md:px-2">Recommend graduation</button>
          </div>` : ''}
        ${canManage ? `<button type="button" data-action="edit-mentee" data-mentee-id="${mid}" class="w-full py-2 rounded-xl border text-sm max-md:min-h-[44px]">Edit Mentee</button>` : ''}
        <button type="button" data-action="export-summary" data-mentee-id="${mid}" class="w-full py-2 rounded-xl border text-sm max-md:min-h-[44px]">Export Summary</button>
        ${renderPortalCard(m, canManage)}
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
          <h3 class="section-title text-xl mb-4">Help Requests</h3>
          <div class="space-y-4">${renderHelpRequests(m.id, canManage, isMyMentee(m.id))}</div>
        </div>
        <div>
          <h3 class="section-title text-xl mb-4">Weekly Self Check-Ins</h3>
          <div class="space-y-4">${renderSelfCheckIns(m.id, canManage)}</div>
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
      const own = state.user && c.userId === state.user.id;
      const hasPrivate = c.generalAssessmentNotes || c.verificationNotes || c.escalationFlag;
      html += `
        <div class="card p-5">
          <div class="flex flex-wrap items-center justify-between mb-3 gap-2">
            <div class="font-medium">Check-In #${esc(c.checkInNumber)} · ${esc(formatDate(c.date))}${c.meetingFormat ? ` · ${esc(c.meetingFormat)}` : ''}</div>
            <div class="flex gap-2">
              ${c.leadGenerationActivity ? `<span class="score-pill score-${esc(c.leadGenerationActivity)}">${esc(c.leadGenerationActivity)}</span>` : ''}
              ${c.lightSpeedVtProgress ? `<span class="score-pill score-${esc(c.lightSpeedVtProgress)}">${esc(c.lightSpeedVtProgress)}</span>` : ''}
              ${c.loftyCrmUsage ? `<span class="score-pill score-${esc(c.loftyCrmUsage)}">${esc(c.loftyCrmUsage)}</span>` : ''}
            </div>
          </div>
          <div class="flex items-center gap-2 mb-2">
            ${sharedBadge(c.sharedWithMentee)}
            ${own ? `<button type="button" data-action="toggle-share-checkin" data-id="${esc(c.id)}" data-shared="${c.sharedWithMentee ? '1' : '0'}" class="text-xs underline max-md:min-h-[44px] max-md:px-2">${c.sharedWithMentee ? 'Hide from mentee' : 'Share'}</button>` : ''}
          </div>
          ${c.studentCommitment ? `<div class="text-sm"><span class="text-navy-700/50">Commitment:</span> ${esc(c.studentCommitment)}${c.commitmentDueDate ? ` <span class="text-navy-700/50">(due ${esc(formatDate(c.commitmentDueDate))})</span>` : ''}</div>` : ''}
          ${detailLine('Direction given', c.specificDirectionGiven)}
          ${detailLine('Prior commitment', PRIOR_COMMITMENT_LABELS[c.priorCommitmentStatus] || c.priorCommitmentStatus)}
          ${detailLine('Topics discussed', c.topicsDiscussed)}
          ${detailLine('Key coaching points', c.keyCoachingPoints)}
          ${c.nextCheckInDate || c.nextCheckInFormat ? detailLine('Next check-in', [c.nextCheckInDate ? formatDate(c.nextCheckInDate) : '', c.nextCheckInFormat || ''].filter(Boolean).join(' · ')) : ''}
          ${hasPrivate ? `
            <div class="mentor-only rounded-lg p-3 mt-3">
              ${MENTOR_ONLY_BADGE}
              ${c.generalAssessmentNotes ? `<div class="text-sm mt-2 text-navy-700/80">${esc(c.generalAssessmentNotes)}</div>` : ''}
              ${detailLine('Verification', c.verificationNotes)}
              ${c.escalationFlag ? `<div class="mt-2 text-xs text-red-700 font-medium">⚑ Escalation flagged${c.escalationNotes ? `: ${esc(c.escalationNotes)}` : ''}</div>` : ''}
            </div>` : ''}
        </div>
      `;
    });
  }

  html += `</div></div>
        <div>
          <h3 class="section-title text-xl mb-4">Mentor Feedback</h3>
          <div class="space-y-4">${renderFeedbackList(m.id)}</div>
        </div>
      </div></div>`;
  dom.app.innerHTML = html;
}
