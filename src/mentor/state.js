// Global mentor-app state + tiny hash router.
export function emptyState() {
  return {
    mentees: [],
    checkIns: [],
    escalations: [],
    graduations: [],
    kickoffs: [],
    feedback: [],
    selfCheckIns: [],
    helpRequests: [],
    invitations: [],
    profiles: {},
    currentView: 'dashboard',
    selectedMenteeId: null,
    prefillMenteeId: null,
    user: null,
    role: null,
    profile: null,
  };
}

export const state = emptyState();

export function resetState() {
  const fresh = emptyState();
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, fresh);
}

let renderer = () => {};
export function setRenderer(fn) {
  renderer = fn;
}
export function render() {
  renderer();
}

export const VIEWS = ['dashboard', 'mentees', 'mentee', 'checkin', 'escalation', 'graduation', 'feedback',
  'kickoff', 'commitments', 'admin-mentees', 'admin-graduations'];

export function hashFor(view, menteeId) {
  return view === 'mentee' && menteeId ? `#/mentee/${menteeId}` : `#/${view}`;
}

export function parseHash(hash) {
  const parts = String(hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
  const view = VIEWS.includes(parts[0]) ? parts[0] : 'dashboard';
  return { view, menteeId: view === 'mentee' ? (parts[1] || null) : null };
}

// Navigate to a view; updates the URL hash so back/forward and deep links work.
export function navigate(view, { menteeId = null, prefill = null } = {}) {
  state.currentView = view;
  state.selectedMenteeId = view === 'mentee' ? menteeId : null;
  state.prefillMenteeId = prefill;
  const hash = hashFor(view, state.selectedMenteeId);
  if (typeof window !== 'undefined' && window.location.hash !== hash) {
    window.history.pushState(null, '', hash);
  }
  render();
}

export function isAdmin() {
  return state.role === 'admin';
}

// Mentees this user personally mentors (admins see everyone in state.mentees).
export function myMentees() {
  return state.mentees.filter(m => state.user && m.userId === state.user.id);
}

export function isMyMentee(menteeId) {
  return myMentees().some(m => m.id === menteeId);
}

export function mentorName(userId) {
  const p = state.profiles[userId];
  if (!p) return '—';
  return p.full_name || p.email || '—';
}
