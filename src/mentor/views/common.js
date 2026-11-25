import { esc } from '../../shared/esc.js';
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
      <div class="flex gap-2">
        ${[1, 2, 3, 4, 5].map(n => `
          <label class="cursor-pointer">
            <input type="radio" name="${esc(name)}" value="${n}" class="sr-only peer">
            <div class="score-pill score-${n} peer-checked:ring-2 peer-checked:ring-gold-500 peer-checked:ring-offset-2">${n}</div>
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

export const MENTOR_ONLY_BADGE = '<span class="text-xs px-2 py-0.5 rounded-full bg-gold-100 text-gold-800 font-medium">Mentor-only · never shown to mentee</span>';
