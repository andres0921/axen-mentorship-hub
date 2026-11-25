import { esc } from '../../shared/esc.js';
import { formatDate, daysInProgram } from '../../shared/format.js';
import { computeGraduationProgress } from '../../shared/program.js';
import { state, myMentees, isAdmin } from '../state.js';
import { dom, setHeader, statusClass, latestCheckIn, previousCheckIn, trendArrow, avgScore, dealsMeter, emptyState, CTA_CLASS } from './common.js';

const CHEVRON = '<svg viewBox="0 0 20 20" class="md:hidden h-5 w-5 text-navy-300" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 5l5 5-5 5"/></svg>';

// Placeholder while the first load (or a Retry) is in flight. The pulse is
// motion-safe only, so reduced-motion users get static blocks.
export function renderDashboardSkeleton() {
  const bar = (cls) => `<div class="rounded-md bg-navy-100 ${cls}"></div>`;
  const stat = `<div class="card p-3 md:p-6">${bar('h-3 w-14 md:w-24')}${bar('h-7 md:h-10 w-8 md:w-12 mt-2')}</div>`;
  const card = `<div class="card p-4 md:p-6">${bar('h-5 w-2/3')}${bar('h-2 w-full mt-4')}${bar('h-3 w-1/2 mt-3')}${bar('h-8 w-full mt-5')}</div>`;
  dom.app.innerHTML = `
    <div class="motion-safe:animate-pulse" aria-busy="true" data-skeleton>
      <span class="sr-only" role="status">Loading your mentees…</span>
      <div class="grid grid-cols-3 gap-2 md:gap-6 mb-6 md:mb-8" aria-hidden="true">${stat}${stat}${stat}</div>
      <div aria-hidden="true">${bar('h-6 w-40 mb-4')}</div>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6" aria-hidden="true">${card}${card}${card}</div>
    </div>`;
}

export function renderDashboard({ listOnly = false } = {}) {
  setHeader('Dashboard', 'Overview of your mentees');
  const mine = myMentees();

  const active = mine.filter(m => m.status === 'active').length;
  const escalated = mine.filter(m => m.status === 'escalated').length;
  const graduated = mine.filter(m => m.status === 'graduated').length;

  const mineIds = new Set(mine.map(m => m.id));
  const nameOf = id => (state.mentees.find(m => m.id === id) || {}).fullName || 'Unknown mentee';
  const openHelpRows = state.helpRequests
    .filter(h => h.status === 'open' && mineIds.has(h.mentee_id))
    .sort((a, b) => (a.urgency === 'urgent' ? 0 : 1) - (b.urgency === 'urgent' ? 0 : 1)
      || new Date(a.created_at) - new Date(b.created_at));
  const toReviewRows = state.selfCheckIns.filter(s => !s.reviewed_at && mineIds.has(s.mentee_id));
  const openHelp = openHelpRows.length;
  const toReview = toReviewRows.length;
  const pendingGrads = isAdmin() ? state.graduations.filter(g => g.status === 'submitted').length : 0;

  let html = '';
  if (!listOnly && (openHelp || toReview || pendingGrads)) {
    const item = (menteeId, label, cls) => `
      <button type="button" data-action="open-mentee" data-mentee-id="${esc(menteeId)}" class="w-full text-left flex items-center justify-between gap-3 py-2 border-b border-navy-50 hover:bg-navy-50 px-2 rounded max-md:flex-wrap max-md:gap-y-1 max-md:min-h-[44px]">
        <span class="font-medium min-w-0 break-words">${esc(nameOf(menteeId))}</span>
        <span class="text-xs px-2 py-0.5 rounded-full ${cls}">${esc(label)}</span>
      </button>`;
    html += `<div class="card p-4 mb-6 text-sm">
      <h2 class="font-medium mb-2">Needs attention</h2>
      <div class="flex flex-wrap gap-2 mb-2">
        ${openHelp ? `<span class="px-2.5 py-1 rounded-full bg-red-100 text-red-800">${openHelp} open help request${openHelp === 1 ? '' : 's'}</span>` : ''}
        ${toReview ? `<span class="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800">${toReview} self check-in${toReview === 1 ? '' : 's'} to review</span>` : ''}
        ${pendingGrads ? `<button type="button" data-action="nav" data-view="admin-graduations" class="px-2.5 py-1 rounded-full bg-gold-100 text-gold-800 underline max-md:min-h-[44px] max-md:px-3">${pendingGrads} graduation${pendingGrads === 1 ? '' : 's'} awaiting approval</button>` : ''}
      </div>
      ${openHelpRows.map(h => item(h.mentee_id, h.urgency === 'urgent' ? 'Urgent help request' : 'Help request', h.urgency === 'urgent' ? 'bg-red-600 text-white' : 'bg-red-100 text-red-800')).join('')}
      ${toReviewRows.map(r => item(r.mentee_id, `Self check-in · week of ${formatDate(r.week_of)}`, 'bg-amber-100 text-amber-800')).join('')}
    </div>`;
  }

  if (!listOnly) html += `
    <div class="grid grid-cols-3 gap-2 mb-6 md:gap-6 md:mb-8">
      <div class="card p-3 md:p-6">
        <div class="text-xs md:text-sm text-navy-700/60">Active<span class="max-md:hidden"> Mentees</span></div>
        <div class="text-2xl md:text-4xl font-display mt-0.5 md:mt-1">${active}</div>
      </div>
      <div class="card p-3 md:p-6">
        <div class="text-xs md:text-sm text-navy-700/60">Escalated</div>
        <div class="text-2xl md:text-4xl font-display mt-0.5 md:mt-1 text-amber-700">${escalated}</div>
      </div>
      <div class="card p-3 md:p-6">
        <div class="text-xs md:text-sm text-navy-700/60">Graduated</div>
        <div class="text-2xl md:text-4xl font-display mt-0.5 md:mt-1 text-emerald-700">${graduated}</div>
      </div>
    </div>`;
  // Phones: "Your Mentees" comes first so mentee cards are above the fold;
  // md+: original order (Feedback Due, then Your Mentees). The Mentees view
  // (listOnly) is just the searchable list.
  html += `
    <div class="flex flex-col">
    ${listOnly ? '' : `<section class="max-md:order-2">
      <h2 class="section-title text-xl md:text-2xl mb-3 md:mb-4">Feedback Due</h2>
      <div id="feedback-due" class="mb-6 md:mb-8"></div>
    </section>`}
    <section class="max-md:order-1 max-md:mb-6">
    ${listOnly ? '' : '<h2 class="section-title text-xl md:text-2xl mb-3 md:mb-4">Your Mentees</h2>'}
    <div class="mb-4 flex gap-3${mine.length ? '' : ' hidden'}">
      <input id="mentee-search" type="search" placeholder="Search name..." aria-label="Search mentees by name" class="border border-navy-200 rounded-lg px-3 py-2 text-sm max-sm:flex-1 max-sm:min-w-0 max-md:min-h-[44px] max-md:text-base" data-input-action="filter-mentees">
      <select id="status-filter" aria-label="Filter by status" class="border border-navy-200 rounded-lg px-3 py-2 text-sm max-sm:w-36 max-sm:shrink-0 max-md:min-h-[44px] max-md:text-base" data-input-action="filter-mentees">
        <option value="">All statuses</option>
        <option value="active">Active</option>
        <option value="escalated">Escalated</option>
        <option value="graduated">Graduated</option>
        <option value="paused">Paused</option>
        <option value="dropped">Dropped</option>
      </select>
    </div>
    <div id="mentee-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6">
  `;

  mine.forEach(m => {
    const latest = latestCheckIn(m.id);
    const prev = previousCheckIn(m.id);
    const score = avgScore(m.id);
    const days = daysInProgram(m.programStartDate);
    // Same definition as the mentee portal / SQL (closed deals vs closedRequired()).
    const progress = computeGraduationProgress({ total_closed: latest ? latest.totalClosed : 0 }, null);
    html += `
      <div class="mentee-card tap-row card p-6 max-md:p-4 cursor-pointer" data-action="open-mentee" data-mentee-id="${esc(m.id)}">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="font-semibold text-lg break-words leading-snug max-md:line-clamp-2" title="${esc(m.fullName)}">${esc(m.fullName)}</div>
          </div>
          <div class="shrink-0 flex items-center gap-1 pt-0.5">
            <span class="text-xs px-2.5 py-1 rounded-full whitespace-nowrap ${statusClass(m.status)}" data-status>${esc(m.status)}</span>
            ${CHEVRON}
          </div>
        </div>
        <div class="mt-3 md:mt-4">${dealsMeter(progress.closed, progress.closed_required)}</div>
        <div class="text-sm text-navy-700/60 mt-3">Stage ${esc(m.currentStage) || '—'} · ${days} days in program</div>
        <div class="mt-3 md:mt-4 pt-3 border-t border-navy-50 flex items-center gap-4">
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
  html += `<div id="mentee-filter-empty" class="hidden">${emptyState({ icon: '🔍', title: 'No mentees match', body: 'Try a different name or status filter.' })}</div>`;
  if (mine.length === 0) {
    html += emptyState({
      icon: '👋',
      title: 'No mentees yet',
      body: `Add your first mentee to start tracking check-ins and their progress toward graduation.${isAdmin() ? ' As admin you can also see every mentee under “All Mentees”.' : ''}`,
      action: `<button type="button" data-action="add-mentee" class="${CTA_CLASS}">Add mentee</button>`,
    });
  }
  html += `</section></div>`;
  dom.app.innerHTML = html;

  // Feedback reminders (no feedback in last 7 days for active mentees)
  const dueEl = document.getElementById('feedback-due');
  if (dueEl) {
    const sevenDaysAgo = Date.now() - 7 * 86400000;
    const due = mine
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
      const anyActive = mine.some(m => m.status === 'active');
      dueEl.innerHTML = `
        <div class="card p-4 text-sm text-navy-700/60 flex items-center gap-3">
          <span class="shrink-0 h-8 w-8 rounded-full ${anyActive ? 'bg-emerald-50 text-emerald-700' : 'bg-navy-50 text-navy-400'} flex items-center justify-center" aria-hidden="true">${anyActive ? '✓' : '•'}</span>
          <span>${anyActive ? 'All active mentees have recent feedback.' : 'Feedback reminders show up here for your active mentees.'}</span>
        </div>`;
    } else {
      dueEl.innerHTML = due.map(x => `
        <div class="card p-4 mb-3 max-md:p-3 max-md:pl-4 max-md:mb-2 flex items-center justify-between gap-3">
          <div class="min-w-0">
            <div class="font-medium max-md:truncate">${esc(x.mentee.fullName)}</div>
            <div class="text-sm max-md:text-xs text-navy-700/60">${x.daysSince === null ? 'No feedback yet' : `Last feedback ${x.daysSince} days ago`}</div>
          </div>
          <button type="button" data-action="nav" data-view="feedback" data-mentee-id="${esc(x.mentee.id)}" class="shrink-0 text-sm px-4 py-2 rounded-lg bg-gold-500 text-navy-900 font-medium max-md:min-h-[44px] max-md:px-3">Give Feedback</button>
        </div>
      `).join('');
    }
  }
}

export function filterMentees() {
  const q = (document.getElementById('mentee-search')?.value || '').toLowerCase();
  const status = document.getElementById('status-filter')?.value || '';
  let shown = 0;
  const cards = document.querySelectorAll('#mentee-grid [data-mentee-id]');
  cards.forEach(card => {
    const name = card.querySelector('.font-semibold')?.textContent.toLowerCase() || '';
    const st = card.querySelector('[data-status]')?.textContent || '';
    const matchQ = !q || name.includes(q);
    const matchS = !status || st === status;
    card.classList.toggle('hidden', !(matchQ && matchS));
    if (matchQ && matchS) shown++;
  });
  document.getElementById('mentee-filter-empty')?.classList.toggle('hidden', !cards.length || shown > 0);
}

export function renderMentees() {
  renderDashboard({ listOnly: true });
  setHeader('Mentees', 'All students in the program');
}

export function renderCommitments() {
  setHeader('Open Commitments', 'Student commitments across all mentees');
  const items = [];
  const mine = new Set(myMentees().map(m => m.id));
  state.checkIns.forEach(c => {
    if (c.studentCommitment && mine.has(c.menteeId)) {
      const m = state.mentees.find(x => x.id === c.menteeId);
      items.push({
        mentee: m ? m.fullName : 'Unknown',
        commitment: c.studentCommitment,
        due: c.commitmentDueDate,
        date: c.date,
        status: c.priorCommitmentStatus,
      });
    }
  });
  items.sort((a, b) => (a.due || '9999') > (b.due || '9999') ? 1 : -1);
  let html = `<div class="space-y-3">`;
  if (!items.length) {
    html += emptyState({
      icon: '📌',
      title: 'No commitments yet',
      body: 'When you record a student commitment in a check-in, it shows up here with its due date.',
      action: myMentees().length ? `<button type="button" data-action="nav" data-view="checkin" class="${CTA_CLASS}">New check-in</button>` : '',
    });
  }
  else items.forEach(i => {
    html += `
      <div class="card p-4 flex justify-between items-start gap-3">
        <div class="min-w-0">
          <div class="font-medium">${esc(i.mentee)}</div>
          <div class="text-sm mt-1 break-words">${esc(i.commitment)}</div>
          <div class="text-xs text-navy-700/50 mt-1">From check-in ${esc(formatDate(i.date))}${i.due ? ` · Due ${esc(formatDate(i.due))}` : ''}</div>
        </div>
        ${i.status ? `<span class="shrink-0 text-xs px-2 py-1 rounded-full bg-navy-100">${esc(i.status)}</span>` : ''}
      </div>
    `;
  });
  html += `</div>`;
  dom.app.innerHTML = html;
}
