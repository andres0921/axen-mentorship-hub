// AXEN Mentorship Hub — mentee portal entry point (/mentee/).
// Mobile-first, hash-routed: #home #checkin[/id] #sessions #feedback #help #account
import '../styles.css';
import { supabase } from '../shared/supabase.js';
import { SITE_URL, MENTEE_PORTAL_PATH } from '../shared/config.js';
import { fetchRole, homePathForRole, signOut } from '../shared/auth.js';
import { registerActions, installDelegation } from '../shared/actions.js';
import { esc } from '../shared/esc.js';
import { weekOf } from '../shared/format.js';
import * as data from './data.js';
import { m } from './data.js';
import {
  welcomeScreen, homeScreen, checkInScreen, readSelfCheckInForm, sessionsScreen,
  feedbackScreen, helpScreen, accountScreen,
} from './views/screens.js';

const $ = (id) => document.getElementById(id);
const SECTIONS = ['signin', 'not-set-up', 'loading', 'app'];
const TABS = new Set(['home', 'checkin', 'sessions', 'feedback', 'help', 'account']);

let currentUser = null;
let enteringFor = null;
let flash = null; // { text, kind } shown once at the top of the next render

function showSection(id) {
  SECTIONS.forEach(s => $(s).classList.toggle('hidden', s !== id));
  $('tabbar').classList.toggle('hidden', id !== 'app' || !m.mentee || m.mentee.portal_access !== 'active');
}

function setFlash(text, kind = 'info') {
  flash = { text, kind };
}

function errorText(err) {
  return (err && err.message) ? err.message : String(err);
}

// ---------------------------------------------------------------------------
// Routing / rendering
// ---------------------------------------------------------------------------
function parseHash() {
  const raw = window.location.hash.replace(/^#/, '');
  const [tab, id] = raw.split('/');
  return { tab: TABS.has(tab) ? tab : 'home', id: id || null };
}

function render() {
  if (!m.mentee) return;
  const app = $('app');
  let html;
  let tab = 'home';
  if (m.mentee.portal_access !== 'active') {
    html = welcomeScreen();
    tab = null;
  } else {
    const route = parseHash();
    tab = route.tab;
    if (tab === 'checkin') html = checkInScreen(route.id);
    else if (tab === 'sessions') html = sessionsScreen();
    else if (tab === 'feedback') html = feedbackScreen();
    else if (tab === 'help') html = helpScreen();
    else if (tab === 'account') html = accountScreen(currentUser && currentUser.email);
    else html = homeScreen();
  }
  const banner = flash
    ? `<div class="mb-4 text-sm p-3 rounded-xl ${flash.kind === 'error' ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'}" role="status">${esc(flash.text)}</div>`
    : '';
  flash = null;
  app.innerHTML = banner + html;
  app.classList.add('view-enter');
  setTimeout(() => app.classList.remove('view-enter'), 250);
  document.querySelectorAll('.tab-btn').forEach(a => {
    const active = a.dataset.tab === tab;
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  showSection('app');
}

function go(hash) {
  if (window.location.hash === hash) render();
  else window.location.hash = hash; // hashchange -> render
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

async function refresh() {
  await data.loadMenteeRow();
  await data.loadAll();
}

// ---------------------------------------------------------------------------
// Sign-in / session
// ---------------------------------------------------------------------------
function showSignIn() {
  currentUser = null;
  enteringFor = null;
  m.mentee = null;
  $('app').innerHTML = '';
  showSection('signin');
}

function showNotSetUp(email) {
  $('not-set-up-email').textContent = email || '';
  showSection('not-set-up');
}

async function enter(session) {
  if (!session || !session.user) return;
  if (enteringFor === session.user.id) return;
  enteringFor = session.user.id;
  currentUser = session.user;
  showSection('loading');
  try {
    const { role } = await fetchRole(session.user.id);
    if (role === 'mentor' || role === 'admin') {
      window.location.replace(homePathForRole(role));
      return;
    }
    if (role !== 'mentee') {
      showNotSetUp(session.user.email);
      return;
    }
    const row = await data.loadMenteeRow();
    if (!row) {
      showNotSetUp(session.user.email);
      return;
    }
    await data.loadAll();
    render();
  } catch (err) {
    console.error(err);
    enteringFor = null;
    $('app').innerHTML = `
      <div class="card p-5 border border-red-200">
        <div class="font-medium text-red-700">Could not load your portal</div>
        <div class="text-sm mt-2">${esc(errorText(err))}</div>
        <button type="button" data-action="retry" class="mt-4 text-sm px-4 py-2 rounded-xl border border-navy-200">Try again</button>
      </div>`;
    SECTIONS.forEach(s => $(s).classList.toggle('hidden', s !== 'app'));
  }
}

$('signin-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const btn = form.querySelector('[type="submit"]');
  const msg = $('signin-message');
  const email = $('signin-email').value.trim();
  if (!email) return;
  btn.disabled = true;
  msg.classList.add('hidden');
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false, // sign-ups are off; only invited mentees have accounts
        emailRedirectTo: `${SITE_URL}/auth/confirm?next=${encodeURIComponent(MENTEE_PORTAL_PATH)}`,
      },
    });
    // Same message whether or not the account exists (no account enumeration).
    if (error && !/signups? not allowed|not found|otp_disabled|user not found/i.test(error.message)) {
      msg.textContent = /rate|seconds|too many/i.test(error.message)
        ? 'Too many requests. Please wait a minute and try again.'
        : `Could not send the link: ${error.message}`;
      msg.className = 'text-sm mt-4 text-red-700';
    } else {
      msg.textContent = 'If that email is enrolled, a sign-in link is on its way. Check your inbox (and spam) on this device.';
      msg.className = 'text-sm mt-4 text-emerald-700';
    }
  } catch (err) {
    msg.textContent = `Could not send the link: ${errorText(err)}`;
    msg.className = 'text-sm mt-4 text-red-700';
  } finally {
    btn.disabled = false;
  }
});

// ---------------------------------------------------------------------------
// Actions (event delegation, no inline handlers)
// ---------------------------------------------------------------------------
async function withButton(el, fn) {
  el.disabled = true;
  try {
    await fn();
  } catch (err) {
    console.error(err);
    setFlash(errorText(err), 'error');
    render();
  } finally {
    el.disabled = false;
  }
}

registerActions({
  'sign-out': (el) => withButton(el, async () => {
    await signOut();
    showSignIn();
  }),
  'retry': () => { enteringFor = null; supabase.auth.getSession().then(({ data: s }) => (s.session ? enter(s.session) : showSignIn())); },
  'ack-feedback': (el) => withButton(el, async () => {
    await data.acknowledgeFeedback(el.dataset.id);
    await data.loadAll();
    render();
  }),
  'cancel-help': (el) => withButton(el, async () => {
    if (!confirm('Cancel this help request?')) return;
    await data.cancelHelpRequest(el.dataset.id);
    await data.loadAll();
    setFlash('Request cancelled.');
    render();
  }),
  'help-category': (el) => {
    const note = $('help-personal-note');
    if (note) note.classList.toggle('hidden', el.value !== 'personal');
  },
});
installDelegation(document);

// Form submissions (delegated: forms are re-rendered on every view change).
async function onSubmit(form) {
  if (form.id === 'welcome-form') {
    const phone = (new FormData(form).get('phone') || '').toString().trim();
    if (phone !== (m.mentee.phone || '')) await data.updateMyPhone(phone);
    await data.acceptInvitation();
    await refresh();
    setFlash('You’re all set. Welcome to the program!');
    go('#home');
  } else if (form.id === 'self-checkin-form') {
    const fields = readSelfCheckInForm(form);
    const id = form.dataset.id || null;
    if (!id) fields.week_of = form.dataset.week || weekOf();
    await data.saveSelfCheckIn(id, fields);
    await data.loadAll();
    setFlash(id ? 'Check-in updated.' : 'Check-in submitted. Your mentor will review it.');
    if (fields.help_needed) setFlash(`${id ? 'Check-in updated.' : 'Check-in submitted.'} You asked for help: add details on the Help tab so your mentor knows what you need.`);
    go('#home');
  } else if (form.id === 'help-form') {
    const fd = new FormData(form);
    const message = (fd.get('message') || '').toString().trim();
    if (!message) throw new Error('Please describe what you need help with.');
    await data.submitHelpRequest({
      category: fd.get('category'),
      urgency: fd.get('urgency') === 'urgent' ? 'urgent' : 'normal',
      message,
    });
    await data.loadAll();
    setFlash('Sent. Your mentor will get back to you.');
    render();
  } else if (form.id === 'phone-form') {
    await data.updateMyPhone((new FormData(form).get('phone') || '').toString().trim());
    await data.loadMenteeRow();
    setFlash('Phone saved.');
    render();
  }
}

document.addEventListener('submit', async (e) => {
  const form = e.target;
  if (!(form instanceof HTMLFormElement) || !$('app').contains(form)) return;
  e.preventDefault();
  const btn = form.querySelector('[type="submit"]');
  if (btn) btn.disabled = true;
  try {
    await onSubmit(form);
  } catch (err) {
    console.error(err);
    setFlash(errorText(err), 'error');
    render();
  } finally {
    if (btn) btn.disabled = false;
  }
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
supabase.auth.onAuthStateChange((event, session) => {
  // Defer Supabase calls out of the auth callback.
  setTimeout(() => {
    if (session && session.user) enter(session);
    else if (event === 'SIGNED_OUT') showSignIn();
  }, 0);
});

supabase.auth.getSession().then(({ data: sessionData, error }) => {
  if (error || !sessionData || !sessionData.session) {
    showSignIn();
    return;
  }
  enter(sessionData.session);
});
