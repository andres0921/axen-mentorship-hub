import { esc } from '../../shared/esc.js';
import { closedRequired } from '../../shared/program.js';
import { state, myMentees } from '../state.js';

export const dom = {
  get app() { return document.getElementById('app'); },
  get title() { return document.getElementById('page-title'); },
  get subtitle() { return document.getElementById('page-subtitle'); },
};

export function setHeader(title, subtitle) {
  dom.title.textContent = title;
  dom.subtitle.textContent = subtitle;
}

export function statusClass(status) {
  const map = {
    active: 'bg-emerald-100 text-emerald-800',
    paused: 'bg-amber-100 text-amber-800',
    escalated: 'bg-red-100 text-red-800',
    graduated: 'bg-gold-100 text-gold-800',
    dropped: 'bg-gray-100 text-gray-600',
  };
  return map[status] || 'bg-gray-100';
}

// One labelled line for history cards; omitted when the value is empty.
export function detailLine(label, value) {
  if (value === null || value === undefined || value === '') return '';
  return `<div class="text-sm mt-1"><span class="text-navy-700/50">${esc(label)}:</span> ${esc(value)}</div>`;
}

export function previousCheckIn(menteeId) {
  const list = state.checkIns
    .filter(c => c.menteeId === menteeId)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  return list[1] || null;
}

export function latestCheckIn(menteeId) {
  return state.checkIns
    .filter(c => c.menteeId === menteeId)
    .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
}

export function trendArrow(current, previous) {
  if (current == null || previous == null) return '';
  if (current > previous) return '<span class="text-emerald-600 text-xs ml-0.5">↑</span>';
  if (current < previous) return '<span class="text-red-600 text-xs ml-0.5">↓</span>';
  return '<span class="text-navy-700/40 text-xs ml-0.5">→</span>';
}

export function avgScore(menteeId) {
  const latest = latestCheckIn(menteeId);
  if (!latest) return null;
  const scores = [latest.leadGenerationActivity, latest.lightSpeedVtProgress, latest.loftyCrmUsage].filter(Boolean);
  if (!scores.length) return null;
  return (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
}

// Forms only offer mentees the user mentors (RLS rejects writes for anyone else).
export function menteeOptionsHtml(selectedId) {
  return myMentees()
    .map(m => `<option value="${esc(m.id)}" ${selectedId && selectedId === m.id ? 'selected' : ''}>${esc(m.fullName)}</option>`)
    .join('');
}

export function scoreRow(label, name) {
  return `
    <div>
      <label class="block text-sm mb-2">${esc(label)}</label>
      <div class="flex flex-wrap gap-2">
        ${[1, 2, 3, 4, 5].map(n => `
          <label class="cursor-pointer">
            <input type="radio" name="${esc(name)}" value="${n}" class="sr-only peer">
            <div class="score-pill score-pill-tap score-${n} peer-checked:ring-2 peer-checked:ring-gold-500 peer-checked:ring-offset-2">${n}</div>
          </label>
        `).join('')}
      </div>
    </div>
  `;
}

export function sharedBadge(shared) {
  return shared
    ? '<span class="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">Shared with mentee</span>'
    : '<span class="text-xs px-2 py-0.5 rounded-full bg-navy-100 text-navy-700">Not shared</span>';
}

// "X of N deals closed" meter (N = closedRequired(), the graduation target).
// Stepped segments for small targets, a continuous bar otherwise.
export function dealsMeter(closed, required = closedRequired()) {
  const req = Math.max(1, Number(required) || 1);
  const n = Math.max(0, Number(closed) || 0);
  const filled = Math.min(n, req);
  const done = n >= req;
  const fill = done ? 'bg-emerald-500' : 'bg-gold-500';
  const track = req <= 8
    ? Array.from({ length: req }, (_, i) => `<span class="h-2 flex-1 rounded-full ${i < filled ? fill : 'bg-navy-100'}"></span>`).join('')
    : `<span class="h-2 flex-1 rounded-full bg-navy-100 overflow-hidden"><span class="block h-full rounded-full ${fill}" style="width:${Math.round((filled / req) * 100)}%"></span></span>`;
  return `
    <div data-deals-meter>
      <div class="flex items-baseline justify-between gap-2 text-sm">
        <span class="font-medium text-navy-900">${esc(n)} of ${esc(req)} deals closed</span>
        <span class="text-xs ${done ? 'text-emerald-700 font-medium' : 'text-navy-700/50'}">${done ? 'Graduation goal met' : `${esc(req - filled)} to go`}</span>
      </div>
      <div class="mt-1.5 flex gap-1" role="progressbar" aria-label="Closed deals toward graduation" aria-valuemin="0" aria-valuemax="${esc(req)}" aria-valuenow="${esc(filled)}">${track}</div>
    </div>`;
}

// Friendly empty state: icon, one-line title, short sentence, optional CTA.
export function emptyState({ icon = '', title, body = '', action = '' }) {
  return `
    <div class="card px-6 py-10 md:p-10 text-center" data-empty-state>
      ${icon ? `<div class="mx-auto mb-3 h-12 w-12 rounded-full bg-gold-50 text-2xl flex items-center justify-center" aria-hidden="true">${icon}</div>` : ''}
      <div class="font-medium text-navy-900">${esc(title)}</div>
      ${body ? `<p class="text-sm text-navy-700/60 mt-1 max-w-sm mx-auto">${esc(body)}</p>` : ''}
      ${action ? `<div class="mt-5">${action}</div>` : ''}
    </div>`;
}

export const CTA_CLASS = 'btn-primary px-6 py-3 rounded-xl min-h-[44px] max-md:w-full';

export const MENTOR_ONLY_BADGE = '<span class="text-xs px-2 py-0.5 rounded-full bg-gold-100 text-gold-800 font-medium">Mentor-only · never shown to mentee</span>';
