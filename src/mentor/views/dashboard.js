import { esc } from '../../shared/esc.js';
import { formatDate, daysInProgram } from '../../shared/format.js';
import { closedRequired } from '../../shared/program.js';
import { state, myMentees, isAdmin } from '../state.js';
import { dom, setHeader, statusClass, latestCheckIn, previousCheckIn, trendArrow, avgScore } from './common.js';

export function renderDashboard() {
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
  if (openHelp || toReview || pendingGrads) {
    const item = (menteeId, label, cls) => `
      <button type="button" data-action="open-mentee" data-mentee-id="${esc(menteeId)}" class="w-full text-left flex items-center justify-between gap-3 py-2 border-b border-navy-50 hover:bg-navy-50 px-2 rounded">
        <span class="font-medium">${esc(nameOf(menteeId))}</span>
        <span class="text-xs px-2 py-0.5 rounded-full ${cls}">${esc(label)}</span>
      </button>`;
    html += `<div class="card p-4 mb-6 text-sm">
      <div class="flex flex-wrap gap-3 items-center mb-2">
        <span class="font-medium">Needs attention:</span>
        ${openHelp ? `<span class="px-2.5 py-1 rounded-full bg-red-100 text-red-800">${openHelp} open help request${openHelp === 1 ? '' : 's'}</span>` : ''}
        ${toReview ? `<span class="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800">${toReview} self check-in${toReview === 1 ? '' : 's'} to review</span>` : ''}
        ${pendingGrads ? `<button type="button" data-action="nav" data-view="admin-graduations" class="px-2.5 py-1 rounded-full bg-gold-100 text-gold-800 underline">${pendingGrads} graduation${pendingGrads === 1 ? '' : 's'} awaiting approval</button>` : ''}
      </div>
      ${openHelpRows.map(h => item(h.mentee_id, h.urgency === 'urgent' ? 'Urgent help request' : 'Help request', h.urgency === 'urgent' ? 'bg-red-600 text-white' : 'bg-red-100 text-red-800')).join('')}
      ${toReviewRows.map(r => item(r.mentee_id, `Self check-in · week of ${formatDate(r.week_of)}`, 'bg-amber-100 text-amber-800')).join('')}
    </div>`;
  }

  html += `
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
      <input id="mentee-search" type="text" placeholder="Search name..." class="border border-navy-200 rounded-lg px-3 py-2 text-sm" data-input-action="filter-mentees">
      <select id="status-filter" class="border border-navy-200 rounded-lg px-3 py-2 text-sm" data-input-action="filter-mentees">
        <option value="">All statuses</option>
        <option value="active">Active</option>
        <option value="escalated">Escalated</option>
        <option value="graduated">Graduated</option>
        <option value="paused">Paused</option>
        <option value="dropped">Dropped</option>
      </select>
    </div>
    <div id="mentee-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  `;

  mine.forEach(m => {
    const latest = latestCheckIn(m.id);
    const prev = previousCheckIn(m.id);
    const score = avgScore(m.id);
    const days = daysInProgram(m.programStartDate);
    html += `
      <div class="card p-6 cursor-pointer" data-action="open-mentee" data-mentee-id="${esc(m.id)}">
        <div class="flex items-start justify-between">
          <div>
            <div class="font-semibold text-lg">${esc(m.fullName)}</div>
            <div class="text-sm text-navy-700/60 mt-0.5">Stage ${esc(m.currentStage) || '—'} · ${days} days · ${esc(latest?.totalClosed || 0)}/${esc(closedRequired())} closed to graduate</div>
          </div>
          <span class="text-xs px-2.5 py-1 rounded-full ${statusClass(m.status)}" data-status>${esc(m.status)}</span>
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
  if (mine.length === 0) {
    html += `<div class="text-center py-16 text-navy-700/50">No mentees yet. Click “Add Mentee” to get started.${isAdmin() ? ' As admin you can see every mentee under “All Mentees”.' : ''}</div>`;
  }
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
      dueEl.innerHTML = `<div class="card p-4 text-sm text-navy-700/60">All active mentees have recent feedback. ✓</div>`;
    } else {
      dueEl.innerHTML = due.map(x => `
        <div class="card p-4 mb-3 flex items-center justify-between">
          <div>
            <div class="font-medium">${esc(x.mentee.fullName)}</div>
            <div class="text-sm text-navy-700/60">${x.daysSince === null ? 'No feedback yet' : `Last feedback ${x.daysSince} days ago`}</div>
          </div>
          <button type="button" data-action="nav" data-view="feedback" data-mentee-id="${esc(x.mentee.id)}" class="text-sm px-4 py-2 rounded-lg bg-gold-500 text-navy-900 font-medium">Give Feedback</button>
        </div>
      `).join('');
    }
  }
}

export function filterMentees() {
  const q = (document.getElementById('mentee-search')?.value || '').toLowerCase();
  const status = document.getElementById('status-filter')?.value || '';
  document.querySelectorAll('#mentee-grid [data-mentee-id]').forEach(card => {
    const name = card.querySelector('.font-semibold')?.textContent.toLowerCase() || '';
    const st = card.querySelector('[data-status]')?.textContent || '';
    const matchQ = !q || name.includes(q);
    const matchS = !status || st === status;
    card.classList.toggle('hidden', !(matchQ && matchS));
  });
}

export function renderMentees() {
  renderDashboard(); // reuse for now
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
  dom.app.innerHTML = html;
}
