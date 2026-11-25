// AXEN Mentorship Hub — mentor / admin app entry point.
import '../styles.css';
import { supabase } from '../shared/supabase.js';
import { SITE_URL } from '../shared/config.js';
import { fetchRole, homePathForRole, signOut } from '../shared/auth.js';
import { registerActions, installDelegation } from '../shared/actions.js';
import { esc } from '../shared/esc.js';
import { today, reportError, downloadBlob } from '../shared/format.js';
import { state, resetState, setRenderer, render, navigate, parseHash, isAdmin } from './state.js';
import * as data from './data.js';
import { dom } from './views/common.js';
import { renderDashboard, renderMentees, renderCommitments, filterMentees } from './views/dashboard.js';
import { renderMenteeDetail } from './views/menteeDetail.js';
import {
  renderCheckInForm, renderEscalationForm, renderGraduationForm, renderFeedbackForm, renderKickoffForm,
  openAddMenteeModal, openProfileModal, updateSelfCheckInHint, prefillFromSelfCheckIn,
} from './views/forms.js';
import { renderAdminMentees, renderAdminGraduations } from './views/admin.js';

const authOverlay = document.getElementById('auth-overlay');
const authForm = document.getElementById('auth-form');
const authMessage = document.getElementById('auth-message');
const pendingBox = document.getElementById('auth-pending');
const signOutBtn = document.getElementById('signout-btn');
let loadedUserId = null;

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function setActiveNav(view) {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
}

const ADMIN_VIEWS = new Set(['admin-mentees', 'admin-graduations']);

function renderApp() {
  let view = state.currentView || 'dashboard';
  if (ADMIN_VIEWS.has(view) && !isAdmin()) view = 'dashboard';
  setActiveNav(view);
  const app = dom.app;
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
  else if (view === 'admin-mentees') renderAdminMentees();
  else if (view === 'admin-graduations') renderAdminGraduations();
  updateAdminNav();
}
setRenderer(renderApp);

function updateAdminNav() {
  const pending = state.graduations.filter(g => g.status === 'submitted').length;
  document.querySelectorAll('[data-admin-only]').forEach(el => el.classList.toggle('hidden', !isAdmin()));
  const badge = document.getElementById('grad-badge');
  if (badge) {
    badge.textContent = pending ? String(pending) : '';
    badge.classList.toggle('hidden', !pending || !isAdmin());
  }
}

function renderLoadError(err) {
  const message = (err && err.message) ? err.message : String(err);
  dom.app.innerHTML = `
    <div class="card p-6 border border-red-200">
      <div class="font-medium text-red-700">Could not load your data</div>
      <div class="text-sm mt-2 text-navy-700/80">${esc(message)}</div>
      <button type="button" data-action="retry-load" class="mt-4 text-sm px-4 py-2 rounded-lg border border-navy-200">Retry</button>
    </div>
  `;
}

async function reload() {
  try {
    await data.loadFromSupabase();
  } catch (err) {
    reportError(err);
    renderLoadError(err);
  }
}

// ---------------------------------------------------------------------------
// Actions (event delegation; no inline handlers)
// ---------------------------------------------------------------------------
async function withButton(el, fn) {
  el.disabled = true;
  try {
    await fn();
  } catch (err) {
    reportError(err);
  } finally {
    el.disabled = false;
  }
}

registerActions({
  'nav': (el) => navigate(el.dataset.view, { prefill: el.dataset.menteeId || null }),
  'open-mentee': (el) => navigate('mentee', { menteeId: el.dataset.menteeId }),
  'filter-mentees': () => filterMentees(),
  'retry-load': () => reload(),
  'close-modal': () => { document.getElementById('modal-root').innerHTML = ''; },
  'export-summary': (el) => exportMenteeSummary(el.dataset.menteeId),
  'checkin-mentee-changed': () => updateSelfCheckInHint(),
  'prefill-from-self': (el) => prefillFromSelfCheckIn(el.dataset.id),

  'portal': (el) => withButton(el, async () => {
    const action = el.dataset.portalAction;
    if (action === 'revoke' && !confirm('Revoke portal access? The mentee is signed out of the portal immediately and can be re-invited later.')) return;
    const res = await data.portalAccess(action, el.dataset.menteeId);
    await data.loadFromSupabase();
    if (res && res.message) alert(res.message);
  }),
  'share-all-checkins': (el) => withButton(el, async () => {
    if (!confirm('Share ALL past check-ins for this mentee? They will see scores, direction, commitments and next steps (never your mentor-only notes).')) return;
    const n = await data.shareAllPastCheckIns(el.dataset.menteeId);
    await data.loadFromSupabase();
    alert(`${n} check-in${n === 1 ? '' : 's'} shared.`);
  }),
  'share-all-feedback': (el) => withButton(el, async () => {
    if (!confirm('Share ALL past feedback for this mentee? Ratings and private notes stay hidden.')) return;
    const n = await data.shareAllPastFeedback(el.dataset.menteeId);
    await data.loadFromSupabase();
    alert(`${n} feedback item${n === 1 ? '' : 's'} shared.`);
  }),
  'toggle-share-checkin': (el) => withButton(el, async () => {
    await data.setCheckInShared(el.dataset.id, el.dataset.shared !== '1');
    await data.loadFromSupabase();
  }),
  'toggle-share-feedback': (el) => withButton(el, async () => {
    await data.setFeedbackShared(el.dataset.id, el.dataset.shared !== '1');
    await data.loadFromSupabase();
  }),
  'review-self-checkin': (el) => withButton(el, async () => {
    await data.markSelfCheckInReviewed(el.dataset.id);
    await data.loadFromSupabase();
  }),
  'help-respond': (el) => withButton(el, async () => {
    const box = document.getElementById(`hr-resp-${el.dataset.id}`);
    await data.respondToHelpRequest(el.dataset.id, { status: el.dataset.status, response: box ? box.value.trim() : null });
    await data.loadFromSupabase();
  }),
  'review-graduation': (el) => withButton(el, async () => {
    const decision = el.dataset.decision;
    const box = document.getElementById(`grad-note-${el.dataset.id}`);
    const msg = decision === 'approved'
      ? 'Approve this recommendation and mark the mentee graduated?'
      : 'Decline this recommendation? The mentee keeps their current status.';
    if (!confirm(msg)) return;
    await data.reviewGraduation(el.dataset.id, decision, box ? box.value.trim() : null);
    await data.loadFromSupabase();
  }),
});
installDelegation(document);

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => navigate(btn.dataset.view));
});
document.getElementById('add-mentee-btn').addEventListener('click', openAddMenteeModal);
document.getElementById('profile-btn').addEventListener('click', openProfileModal);
document.getElementById('export-btn').addEventListener('click', exportAll);
window.addEventListener('popstate', () => {
  const { view, menteeId } = parseHash(window.location.hash);
  state.currentView = view;
  state.selectedMenteeId = menteeId;
  state.prefillMenteeId = null;
  render();
});

// ---------------------------------------------------------------------------
// Export (sensitive: includes mentor-private notes; never the auth user object)
// ---------------------------------------------------------------------------
function exportAll() {
  const payload = {
    exportedAt: new Date().toISOString(),
    warning: 'SENSITIVE: contains mentor-only notes, ratings and escalations. Do not share with mentees.',
    mentees: state.mentees,
    checkIns: state.checkIns,
    escalations: state.escalations,
    graduations: state.graduations,
    kickoffs: state.kickoffs,
    feedback: state.feedback,
    selfCheckIns: state.selfCheckIns,
    helpRequests: state.helpRequests,
    invitations: state.invitations,
  };
  downloadBlob(JSON.stringify(payload, null, 2), 'application/json', `axen-mentorship-export-SENSITIVE-${today()}.json`);
}

function exportMenteeSummary(id) {
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
    ...checks.slice(0, 5).map(c => `#${c.checkInNumber} ${c.date} — Lead:${c.leadGenerationActivity || '—'} VT:${c.lightSpeedVtProgress || '—'} CRM:${c.loftyCrmUsage || '—'}`),
  ].join('\n');
  downloadBlob(text, 'text/plain', `${(m.fullName || 'mentee').replace(/\s+/g, '-')}-summary.txt`);
}

// ---------------------------------------------------------------------------
// Auth (no public sign-up: accounts are created by invitation / by hand)
// ---------------------------------------------------------------------------
function showAuthMessage(text, kind = 'error') {
  authMessage.textContent = text;
  authMessage.classList.toggle('text-red-600', kind === 'error');
  authMessage.classList.toggle('text-emerald-700', kind === 'info');
  authMessage.classList.remove('hidden');
}

function hideAuthMessage() {
  authMessage.classList.add('hidden');
}

function showPending(email) {
  authForm.classList.add('hidden');
  document.getElementById('auth-magic').classList.add('hidden');
  pendingBox.classList.remove('hidden');
  document.getElementById('auth-pending-email').textContent = email || '';
  authOverlay.classList.remove('hidden');
}

// Enter the app for a confirmed session. Safe to call repeatedly; data is only
// loaded once per signed-in user.
async function enterApp(session) {
  if (!session || !session.user) return;
  if (loadedUserId === session.user.id) return;
  loadedUserId = session.user.id;
  let role;
  let profile;
  try {
    ({ role, profile } = await fetchRole(session.user.id));
  } catch (err) {
    loadedUserId = null;
    showAuthMessage(err.message || String(err));
    authOverlay.classList.remove('hidden');
    return;
  }
  if (role === 'mentee') {
    window.location.replace(homePathForRole('mentee'));
    return;
  }
  if (role !== 'mentor' && role !== 'admin') {
    showPending(session.user.email);
    return;
  }
  state.user = session.user;
  state.role = role;
  state.profile = profile;
  const initial = parseHash(window.location.hash);
  state.currentView = initial.view;
  state.selectedMenteeId = initial.menteeId;
  authOverlay.classList.add('hidden');
  signOutBtn.classList.remove('hidden');
  hideAuthMessage();
  updateAdminNav();
  await reload();
}

function leaveApp() {
  resetState();
  loadedUserId = null;
  document.getElementById('modal-root').innerHTML = '';
  document.getElementById('auth-password').value = '';
  signOutBtn.classList.add('hidden');
  authForm.classList.remove('hidden');
  document.getElementById('auth-magic').classList.remove('hidden');
  pendingBox.classList.add('hidden');
  authOverlay.classList.remove('hidden');
  render();
}

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const submitBtn = document.getElementById('auth-submit');
  hideAuthMessage();
  submitBtn.disabled = true;
  try {
    const result = await supabase.auth.signInWithPassword({ email, password });
    if (result.error) {
      showAuthMessage(result.error.message);
      return;
    }
    const session = result.data && result.data.session;
    if (session) await enterApp(session);
    else showAuthMessage('Sign-in did not return a session. Please try again.');
  } catch (err) {
    showAuthMessage(err.message || String(err));
  } finally {
    submitBtn.disabled = false;
  }
});

document.getElementById('auth-magic').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const email = document.getElementById('auth-email').value.trim();
  hideAuthMessage();
  if (!email) {
    showAuthMessage('Enter your email first.');
    return;
  }
  btn.disabled = true;
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: `${SITE_URL}/auth/confirm` },
    });
    // Same message whether or not the account exists (no account enumeration).
    if (error && !/signups not allowed|not found|otp_disabled/i.test(error.message)) {
      showAuthMessage(error.message);
    } else {
      showAuthMessage('If that email has an account, a sign-in link is on its way. Check your inbox.', 'info');
    }
  } finally {
    btn.disabled = false;
  }
});

async function doSignOut(btn) {
  btn.disabled = true;
  try {
    await signOut();
    leaveApp();
  } catch (err) {
    reportError(err);
  } finally {
    btn.disabled = false;
  }
}
signOutBtn.addEventListener('click', () => doSignOut(signOutBtn));
document.getElementById('auth-pending-signout').addEventListener('click', (e) => doSignOut(e.currentTarget));

// Keep the UI in sync with auth state (token refresh, sign-out in another tab,
// etc.). Supabase calls are deferred out of the callback to avoid blocking the
// auth client.
supabase.auth.onAuthStateChange((event, session) => {
  setTimeout(() => {
    if (session && session.user) {
      enterApp(session);
    } else if (event === 'SIGNED_OUT' || state.user) {
      leaveApp();
    }
  }, 0);
});

supabase.auth.getSession().then(({ data: sessionData, error }) => {
  if (error) {
    showAuthMessage(`Could not restore session: ${error.message}`);
    authOverlay.classList.remove('hidden');
    return;
  }
  if (sessionData && sessionData.session) {
    enterApp(sessionData.session);
  } else {
    authOverlay.classList.remove('hidden');
  }
});

// Initial render
render();
