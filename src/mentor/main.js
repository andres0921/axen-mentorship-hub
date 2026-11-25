// AXEN Mentorship Hub — mentor / admin app entry point.
import '../styles.css';
import { supabase } from '../shared/supabase.js';
import { fetchRole, homePathForRole, signOut } from '../shared/auth.js';
import { mfaGateStatus, readAuthRedirectError, clearAuthRedirectParams, redirectErrorMessage, friendlyAuthMessage } from '../shared/auth-methods.js';
import { createSignIn } from '../shared/signin.js';
import { registerActions, installDelegation } from '../shared/actions.js';
import { esc } from '../shared/esc.js';
import { today, reportError, downloadBlob } from '../shared/format.js';
import { state, resetState, setRenderer, render, navigate, parseHash, isAdmin } from './state.js';
import * as data from './data.js';
import { dom } from './views/common.js';
import { renderDashboard, renderMentees, renderCommitments, filterMentees, renderDashboardSkeleton } from './views/dashboard.js';
import { renderMenteeDetail } from './views/menteeDetail.js';
import {
  renderCheckInForm, renderEscalationForm, renderGraduationForm, renderFeedbackForm, renderKickoffForm,
  openAddMenteeModal, openEditMenteeModal, openProfileModal, updateSelfCheckInHint, prefillFromSelfCheckIn,
} from './views/forms.js';
import { renderAdminMentees, renderAdminGraduations } from './views/admin.js';

// Read an OAuth return error (e.g. Google account not invited) before
// supabase-js handles the URL, then tidy the address bar.
const redirectError = readAuthRedirectError();
if (redirectError) clearAuthRedirectParams();

const authOverlay = document.getElementById('auth-overlay');
const signOutBtn = document.getElementById('signout-btn');
let loadedUserId = null;
let mfaPromptFor = null;

// ---------------------------------------------------------------------------
// Mobile chrome (below md / 768px): off-canvas sidebar drawer (hamburger or the
// "More" tab, swipe left to close), header "…" overflow menu, bottom tab bar,
// floating add button, bottom-sheet modals. On md+ the sidebar is always
// visible, every mobile control is display:none, and this state has no
// visual effect.
// ---------------------------------------------------------------------------
const body = document.body;
const sidebar = document.getElementById('sidebar');
const navToggle = document.getElementById('nav-toggle');
const navClose = document.getElementById('nav-close');
const navBackdrop = document.getElementById('nav-backdrop');
const headerMenu = document.getElementById('header-menu');
const headerMenuBtn = document.getElementById('header-menu-btn');
const tabMore = document.getElementById('tabbar-more');
const appHeader = document.getElementById('app-header');
const modalRoot = document.getElementById('modal-root');
const mq = (q) => (typeof window.matchMedia === 'function' ? window.matchMedia(q) : null);
const desktopMq = mq('(min-width: 768px)');
const reducedMotionMq = mq('(prefers-reduced-motion: reduce)');
const isDesktop = () => !!(desktopMq && desktopMq.matches);
const prefersReducedMotion = () => !!(reducedMotionMq && reducedMotionMq.matches);

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const visibleFocusables = (root) => [...root.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null);

// Drawer -------------------------------------------------------------------
let drawerOpener = navToggle;

function isDrawerOpen() {
  return sidebar.classList.contains('is-open');
}

function setDrawerExpanded(open) {
  navToggle.setAttribute('aria-expanded', String(open));
  navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  tabMore.setAttribute('aria-expanded', String(open));
}

function openDrawer(opener = navToggle) {
  if (isDesktop() || isDrawerOpen()) return;
  closeHeaderMenu({ restoreFocus: false });
  drawerOpener = opener;
  sidebar.classList.add('is-open');
  navBackdrop.classList.add('is-open');
  body.classList.add('nav-open');
  setDrawerExpanded(true);
  navClose.focus();
}

function closeDrawer({ restoreFocus = true } = {}) {
  if (!isDrawerOpen()) return;
  sidebar.classList.remove('is-open');
  navBackdrop.classList.remove('is-open');
  body.classList.remove('nav-open');
  setDrawerExpanded(false);
  if (restoreFocus && !isDesktop()) (drawerOpener || navToggle).focus();
}

// Swipe the open drawer to the left to close it (touch only; click, Escape and
// the close button keep working). Vertical drags still scroll the nav.
let drag = null;
function dragStart(e) {
  if (!isDrawerOpen() || e.touches.length !== 1) return;
  const t = e.touches[0];
  drag = { x: t.clientX, y: t.clientY, dx: 0, axis: null, at: Date.now() };
}
function dragMove(e) {
  if (!drag) return;
  const t = e.touches[0];
  const dx = t.clientX - drag.x;
  const dy = t.clientY - drag.y;
  if (!drag.axis && Math.abs(dx) + Math.abs(dy) > 8) drag.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
  if (drag.axis !== 'x') return;
  drag.dx = Math.min(0, dx);
  sidebar.classList.add('is-dragging');
  navBackdrop.classList.add('is-dragging');
  sidebar.style.transform = `translateX(${drag.dx}px)`;
  navBackdrop.style.opacity = String(Math.max(0, 1 + drag.dx / (sidebar.offsetWidth || 256)));
}
function dragEnd(e) {
  if (!drag) return;
  const { axis, at } = drag;
  // Decide from where the finger actually lifted (more reliable than the last
  // touchmove, which can be coalesced or stale).
  const lift = e && e.changedTouches && e.changedTouches[0];
  const dx = lift ? Math.min(0, lift.clientX - drag.x) : drag.dx;
  drag = null;
  sidebar.classList.remove('is-dragging');
  navBackdrop.classList.remove('is-dragging');
  sidebar.style.transform = '';
  navBackdrop.style.opacity = '';
  if (axis !== 'x') return;
  const flick = dx < -30 && Date.now() - at < 250;
  if (flick || dx < -(sidebar.offsetWidth || 256) * 0.3) closeDrawer();
}
for (const el of [sidebar, navBackdrop]) {
  el.addEventListener('touchstart', dragStart, { passive: true });
  el.addEventListener('touchmove', dragMove, { passive: true });
  el.addEventListener('touchend', dragEnd);
  el.addEventListener('touchcancel', dragEnd);
}

// Header "…" menu -----------------------------------------------------------
function isHeaderMenuOpen() {
  return headerMenu.classList.contains('is-open');
}

function openHeaderMenu() {
  if (isDesktop() || isHeaderMenuOpen()) return;
  headerMenu.classList.add('is-open');
  headerMenuBtn.setAttribute('aria-expanded', 'true');
  const first = visibleFocusables(headerMenu)[0];
  if (first) first.focus();
}

function closeHeaderMenu({ restoreFocus = true } = {}) {
  if (!isHeaderMenuOpen()) return;
  headerMenu.classList.remove('is-open');
  headerMenuBtn.setAttribute('aria-expanded', 'false');
  if (restoreFocus && !isDesktop()) headerMenuBtn.focus();
}

navToggle.addEventListener('click', () => (isDrawerOpen() ? closeDrawer() : openDrawer(navToggle)));
tabMore.addEventListener('click', () => (isDrawerOpen() ? closeDrawer() : openDrawer(tabMore)));
navClose.addEventListener('click', () => closeDrawer());
navBackdrop.addEventListener('click', () => closeDrawer());
headerMenuBtn.addEventListener('click', () => (isHeaderMenuOpen() ? closeHeaderMenu() : openHeaderMenu()));
// Any item in the menu closes it (the item's own listener still runs first).
headerMenu.addEventListener('click', (e) => {
  if (e.target.closest('button')) closeHeaderMenu({ restoreFocus: false });
});
document.addEventListener('click', (e) => {
  if (isHeaderMenuOpen() && !headerMenu.contains(e.target) && !headerMenuBtn.contains(e.target)) {
    closeHeaderMenu({ restoreFocus: false });
  }
});
document.addEventListener('keydown', (e) => {
  if (isDrawerOpen()) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeDrawer();
    } else if (e.key === 'Tab') {
      // Keep keyboard focus inside the open drawer.
      const items = visibleFocusables(sidebar);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !sidebar.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !sidebar.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    }
  } else if (isHeaderMenuOpen() && e.key === 'Escape') {
    e.preventDefault();
    closeHeaderMenu();
  }
});

// Bottom-sheet modals: lock page scroll while one is open; animate the sheet
// down on Cancel / backdrop (md+ and reduced motion: instant, as before).
new MutationObserver(() => body.classList.toggle('modal-open', !!modalRoot.firstElementChild))
  .observe(modalRoot, { childList: true });

function closeModal() {
  const shell = modalRoot.firstElementChild;
  if (!shell) return;
  if (isDesktop() || prefersReducedMotion()) {
    modalRoot.innerHTML = '';
    return;
  }
  shell.classList.add('is-closing');
  setTimeout(() => {
    // Only clear if no other modal replaced this one meanwhile.
    if (modalRoot.firstElementChild === shell) modalRoot.innerHTML = '';
  }, 190);
}

// Sticky header gets a divider shadow once the page scrolls (mobile CSS only).
let scrollTicking = false;
window.addEventListener('scroll', () => {
  if (scrollTicking) return;
  scrollTicking = true;
  requestAnimationFrame(() => {
    scrollTicking = false;
    appHeader.classList.toggle('is-scrolled', window.scrollY > 4);
  });
}, { passive: true });

// On-screen keyboard: while a text field has focus, hide the tab bar / FAB and
// let sticky form actions sit at the bottom edge (mobile CSS only).
const TEXT_FIELD = 'input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=reset]), textarea, select';
document.addEventListener('focusin', (e) => {
  if (e.target instanceof Element && e.target.matches(TEXT_FIELD)) body.classList.add('kb-open');
});
document.addEventListener('focusout', () => {
  setTimeout(() => {
    const el = document.activeElement;
    if (!(el instanceof Element && el.matches(TEXT_FIELD))) body.classList.remove('kb-open');
  }, 0);
});

// Crossing into md+ (rotate / resize): drop any mobile-only open state.
if (desktopMq) {
  const onBreakpoint = () => {
    if (!isDesktop()) return;
    closeDrawer({ restoreFocus: false });
    closeHeaderMenu({ restoreFocus: false });
  };
  if (typeof desktopMq.addEventListener === 'function') desktopMq.addEventListener('change', onBreakpoint);
  else if (typeof desktopMq.addListener === 'function') desktopMq.addListener(onBreakpoint);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
// Bottom tab for each view; every other view (forms, commitments, admin) lives
// behind "More".
const TAB_FOR_VIEW = { dashboard: 'dashboard', mentees: 'mentees', mentee: 'mentees', checkin: 'checkin' };

function setActiveNav(view) {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
  const tab = TAB_FOR_VIEW[view] || 'more';
  document.querySelectorAll('.mentor-tab').forEach(btn => {
    const on = btn.dataset.tab === tab;
    btn.classList.toggle('is-active', on);
    if (on && tab !== 'more') btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  });
  body.dataset.view = view;
}

const ADMIN_VIEWS = new Set(['admin-mentees', 'admin-graduations']);

function renderApp() {
  let view = state.currentView || 'dashboard';
  if (ADMIN_VIEWS.has(view) && !isAdmin()) view = 'dashboard';
  setActiveNav(view);
  // Safety net (e.g. back/forward while the drawer is open): show the new view.
  closeDrawer({ restoreFocus: false });
  const app = dom.app;
  if (!state.user) {
    // Signed out / session still restoring: placeholder behind the overlay,
    // never a misleading "no mentees" state.
    renderDashboardSkeleton();
    return;
  }
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
  // Skeleton until loadFromSupabase() renders the real view (or the error).
  renderDashboardSkeleton();
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
  'close-modal': () => closeModal(),
  'add-mentee': () => openAddMenteeModal(),
  'export-summary': (el) => exportMenteeSummary(el.dataset.menteeId),
  'edit-mentee': (el) => openEditMenteeModal(el.dataset.menteeId),
  'convert-help': (el) => {
    const h = state.helpRequests.find(x => x.id === el.dataset.id);
    if (h) navigate('escalation', { prefill: h.mentee_id, helpRequestId: h.id });
  },
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
  btn.addEventListener('click', () => {
    // On mobile, close the drawer first so focus returns to the hamburger and
    // the new view is visible; a no-op on md+.
    closeDrawer();
    navigate(btn.dataset.view);
  });
});
document.getElementById('add-mentee-btn').addEventListener('click', openAddMenteeModal);
document.getElementById('fab-add').addEventListener('click', openAddMenteeModal);
document.getElementById('profile-btn').addEventListener('click', openProfileModal);
document.getElementById('export-btn').addEventListener('click', exportAll);
window.addEventListener('popstate', () => {
  const { view, menteeId } = parseHash(window.location.hash);
  state.currentView = view;
  state.selectedMenteeId = menteeId;
  state.prefillMenteeId = null;
  state.escalationHelpId = null;
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
  downloadBlob(text, 'text/plain', `${(m.fullName || 'mentee').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'mentee'}-summary.txt`);
}

// ---------------------------------------------------------------------------
// Auth (no public sign-up: accounts are created by invitation / by hand).
// Sign-in UI + protocol: src/shared/signin.js and src/shared/auth-methods.js.
// ---------------------------------------------------------------------------
function showAuth() {
  authOverlay.classList.remove('hidden');
  body.classList.add('auth-open');
}

function hideAuth() {
  authOverlay.classList.add('hidden');
  body.classList.remove('auth-open');
}

const signin = createSignIn({
  root: authOverlay,
  prefix: 'auth',
  app: 'mentor',
  allowPassword: true,
  onSession: (session) => enterApp(session),
  onSignOut: (btn) => doSignOut(btn),
});

function showAuthMessage(text, kind = 'error') {
  signin.showMessage(text, kind);
}

function showPending(email) {
  body.classList.remove('app-ready');
  document.getElementById('auth-pending-email').textContent = email || '';
  signin.showPending();
  showAuth();
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
    signin.showEmail();
    showAuthMessage(err.message || String(err));
    showAuth();
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
  // Two-step gate: only people who turned on an authenticator app (admins,
  // from Profile) are asked for a code, and only while the session is aal1.
  const mfa = await mfaGateStatus();
  if (mfa.needed) {
    loadedUserId = null; // re-enter once the code is verified
    if (mfaPromptFor !== session.user.id) {
      mfaPromptFor = session.user.id;
      signin.showMfa(mfa.factorId, async (upgraded) => {
        mfaPromptFor = null;
        await enterApp(upgraded || session);
      });
    }
    showAuth();
    return;
  }
  mfaPromptFor = null;
  signin.stop();
  state.user = session.user;
  state.role = role;
  state.profile = profile;
  const initial = parseHash(window.location.hash);
  state.currentView = initial.view;
  state.selectedMenteeId = initial.menteeId;
  hideAuth();
  signOutBtn.classList.remove('hidden');
  body.classList.add('app-ready');
  signin.clearMessage();
  updateAdminNav();
  await reload();
}

function leaveApp({ message } = {}) {
  resetState();
  loadedUserId = null;
  mfaPromptFor = null;
  closeDrawer({ restoreFocus: false });
  closeHeaderMenu({ restoreFocus: false });
  document.getElementById('modal-root').innerHTML = '';
  signOutBtn.classList.add('hidden');
  body.classList.remove('app-ready', 'kb-open', 'modal-open');
  signin.showEmail();
  if (message) showAuthMessage(message, 'info');
  showAuth();
  window.scrollTo(0, 0);
  render();
}

async function doSignOut(btn) {
  if (btn) btn.disabled = true;
  try {
    await signOut();
    leaveApp();
  } catch (err) {
    reportError(err);
  } finally {
    if (btn) btn.disabled = false;
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
  if (sessionData && sessionData.session) {
    enterApp(sessionData.session);
    return;
  }
  signin.showEmail();
  if (redirectError) showAuthMessage(redirectErrorMessage(redirectError));
  else if (error) showAuthMessage(`Could not restore your session. ${friendlyAuthMessage(error)}`);
  showAuth();
});

// Initial render
render();
