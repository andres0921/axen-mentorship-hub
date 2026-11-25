// Admin (role = 'admin') views: all mentees with a mentor column, and the
// pending graduation approvals queue.
import { esc } from '../../shared/esc.js';
import { formatDate, daysInProgram } from '../../shared/format.js';
import { closedRequired } from '../../shared/program.js';
import { state, isAdmin, mentorName } from '../state.js';
import { dom, setHeader, statusClass, detailLine, emptyState } from './common.js';

function notAdmin() {
  setHeader('Not available', 'Admin only');
  dom.app.innerHTML = `<div class="card p-8 text-center text-navy-700/60">This page is only available to the program admin.</div>`;
}

export function renderAdminMentees() {
  if (!isAdmin()) return notAdmin();
  setHeader('All Mentees', `Every mentee in the program (${state.mentees.length})`);
  const rows = [...state.mentees].sort((a, b) =>
    mentorName(a.userId).localeCompare(mentorName(b.userId)) || (a.fullName || '').localeCompare(b.fullName || ''));
  dom.app.innerHTML = `
    <!-- Below md: one stacked card per mentee (same open action as a table row). -->
    <div class="md:hidden space-y-3">
      ${rows.map(m => `
        <button type="button" class="card p-4 w-full text-left block min-h-[44px]" data-action="open-mentee" data-mentee-id="${esc(m.id)}">
          <span class="flex items-start justify-between gap-3">
            <span class="min-w-0">
              <span class="block font-medium break-words">${esc(m.fullName)}</span>
              <span class="block text-sm text-navy-700/60 break-words">Mentor ${esc(mentorName(m.userId))}</span>
            </span>
            <span class="shrink-0 text-xs px-2.5 py-1 rounded-full ${statusClass(m.status)}">${esc(m.status)}</span>
          </span>
          <span class="mt-3 grid grid-cols-3 gap-2 text-sm">
            <span><span class="block text-navy-700/50 text-xs">Stage</span>${esc(m.currentStage) || '—'}</span>
            <span class="min-w-0 break-words"><span class="block text-navy-700/50 text-xs">Portal</span>${esc(m.portalAccess)}</span>
            <span><span class="block text-navy-700/50 text-xs">Days</span>${daysInProgram(m.programStartDate)}</span>
          </span>
        </button>`).join('') || emptyState({ icon: '☷', title: 'No mentees in the program yet', body: 'Mentees appear here as soon as any mentor adds one.' })}
    </div>
    <div class="hidden md:block card overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="text-left text-navy-700/60 border-b border-navy-100">
          <tr><th class="p-3">Mentee</th><th class="p-3">Mentor</th><th class="p-3">Stage</th><th class="p-3">Status</th><th class="p-3">Portal</th><th class="p-3">Days</th></tr>
        </thead>
        <tbody>
          ${rows.map(m => `
            <tr class="border-b border-navy-50 hover:bg-navy-50 cursor-pointer" data-action="open-mentee" data-mentee-id="${esc(m.id)}">
              <td class="p-3 font-medium">${esc(m.fullName)}</td>
              <td class="p-3">${esc(mentorName(m.userId))}</td>
              <td class="p-3">${esc(m.currentStage) || '—'}</td>
              <td class="p-3"><span class="text-xs px-2.5 py-1 rounded-full ${statusClass(m.status)}">${esc(m.status)}</span></td>
              <td class="p-3">${esc(m.portalAccess)}</td>
              <td class="p-3">${daysInProgram(m.programStartDate)}</td>
            </tr>`).join('') || '<tr><td colspan="6" class="p-6 text-center text-navy-700/50">No mentees yet.</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

function check(v) {
  return v ? '<span class="text-emerald-700">✓</span>' : '<span class="text-red-600">✗</span>';
}

export function renderAdminGraduations() {
  if (!isAdmin()) return notAdmin();
  const pending = state.graduations.filter(g => g.status === 'submitted')
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const reviewed = state.graduations.filter(g => g.status !== 'submitted')
    .sort((a, b) => new Date(b.reviewed_at || b.created_at) - new Date(a.reviewed_at || a.created_at)).slice(0, 20);
  setHeader('Pending Graduations', `${pending.length} awaiting your approval`);
  const required = closedRequired();
  const menteeName = id => (state.mentees.find(m => m.id === id) || {}).fullName || 'Unknown mentee';

  const card = (g) => {
    const tx = Array.isArray(g.closed_transactions) ? g.closed_transactions : [];
    return `
      <div class="card p-6">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <button type="button" data-action="open-mentee" data-mentee-id="${esc(g.mentee_id)}" class="font-semibold text-lg underline text-left break-words max-md:min-h-[44px]">${esc(menteeName(g.mentee_id))}</button>
            <div class="text-sm text-navy-700/60">Mentor ${esc(mentorName(g.user_id))} · submitted ${esc(formatDate(g.date_of_submission))}</div>
          </div>
          <span class="shrink-0 text-xs px-2.5 py-1 rounded-full ${g.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : g.status === 'declined' ? 'bg-red-100 text-red-800' : 'bg-gold-100 text-gold-800'}">${esc(g.status)}</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-1 text-sm mt-4">
          <div>${check(g.closed_transactions_confirmed)} ${esc(required)} closed transactions</div>
          <div>${check(g.light_speed_vt_completed)} LightSpeed VT complete</div>
          <div>${check(g.nexa_lending_connected)} Nexa Lending connected</div>
          <div>${check(g.lofty_crm_proficient)} Lofty CRM proficient</div>
          <div>${check(g.mentor_recommends)} Mentor recommends</div>
        </div>
        ${tx.length ? `<div class="mt-3 text-sm"><div class="text-navy-700/50">Closed transactions</div>
          <ul class="list-disc ml-5">${tx.map(t => `<li>${esc(t.propertyAddress)}${t.closeDate ? ` · ${esc(t.closeDate)}` : ''}${t.salePrice != null ? ` · $${esc(Number(t.salePrice).toLocaleString())}` : ''}${t.skySlopeFileNumber ? ` · SkySlope ${esc(t.skySlopeFileNumber)}` : ''}</li>`).join('')}</ul></div>` : ''}
        ${detailLine('Statement', g.mentor_recommendation_statement)}
        ${g.review_note ? detailLine('Review note', g.review_note) : ''}
        ${g.status === 'submitted' ? `
          <div class="mt-4 space-y-2">
            <textarea id="grad-note-${esc(g.id)}" rows="2" placeholder="Note to the mentor (optional)" class="w-full border border-navy-200 rounded-lg px-3 py-2 text-sm max-md:text-base"></textarea>
            <div class="flex flex-wrap gap-2">
              <button type="button" data-action="review-graduation" data-id="${esc(g.id)}" data-decision="approved" class="btn-primary px-5 py-2 rounded-lg text-sm max-md:min-h-[44px] max-md:flex-1">Approve &amp; graduate</button>
              <button type="button" data-action="review-graduation" data-id="${esc(g.id)}" data-decision="declined" class="px-5 py-2 rounded-lg text-sm border border-red-200 text-red-700 max-md:min-h-[44px] max-md:flex-1">Decline</button>
            </div>
          </div>` : ''}
      </div>`;
  };

  dom.app.innerHTML = `
    <div class="space-y-4 max-w-4xl">
      ${pending.length ? pending.map(card).join('') : emptyState({ icon: '🎓', title: 'Nothing waiting for approval', body: 'When a mentor recommends a mentee for graduation, it shows up here for your review.' })}
      ${reviewed.length ? `<h2 class="section-title text-2xl mt-8 mb-2">Recently reviewed</h2>${reviewed.map(card).join('')}` : ''}
    </div>
  `;
}
