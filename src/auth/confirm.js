// /auth/confirm — finishes an email-link sign-in.
//
// Email templates link here with ?token_hash=…&type=invite|magiclink|email&next=/mentee/
// The user must click Continue before verifyOtp runs (link scanners that
// pre-fetch URLs would otherwise burn the one-time token). After verifying, the
// user is sent to the app for their role; `next` is honoured only if it is a
// safe relative path inside that app (see src/shared/redirect.js).
import '../styles.css';
import { supabase } from '../shared/supabase.js';
import { fetchRole, signOut } from '../shared/auth.js';
import { destinationFor, CONFIRM_TYPES } from '../shared/redirect.js';

const params = new URLSearchParams(window.location.search);
const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
const tokenHash = params.get('token_hash');
const type = params.get('type');
const next = params.get('next');

const $ = (id) => document.getElementById(id);
function show(id) {
  ['confirm-ready', 'confirm-working', 'confirm-pending', 'confirm-error'].forEach(s => $(s).classList.toggle('hidden', s !== id));
}
function showError(text) {
  $('confirm-error-text').textContent = text; // textContent: never HTML
  show('confirm-error');
}

async function routeSignedIn(user) {
  const { role } = await fetchRole(user.id);
  const dest = destinationFor(role, next);
  if (!dest) {
    show('confirm-pending');
    return;
  }
  window.location.replace(dest);
}

function friendlyError(message) {
  if (/expired|invalid|not found|already been used/i.test(message || '')) {
    return 'This sign-in link has expired or was already used. Request a new one below.';
  }
  return `Could not sign you in: ${message}`;
}

async function onContinue() {
  const btn = $('confirm-continue');
  btn.disabled = true;
  show('confirm-working');
  $('confirm-working').textContent = 'Signing you in…';
  try {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) throw error;
    const user = data && (data.user || (data.session && data.session.user));
    if (!user) throw new Error('No session was returned.');
    // Strip the one-time token from the address bar / history.
    window.history.replaceState(null, '', window.location.pathname);
    await routeSignedIn(user);
  } catch (err) {
    showError(friendlyError(err && err.message ? err.message : String(err)));
  } finally {
    btn.disabled = false;
  }
}

$('confirm-continue').addEventListener('click', onContinue);
$('confirm-signout').addEventListener('click', async () => {
  try { await signOut(); } catch (err) { console.error(err); }
  window.location.replace('/mentee/');
});

async function init() {
  const linkError = params.get('error_description') || hashParams.get('error_description');
  if (linkError) {
    showError(friendlyError(linkError));
    return;
  }
  if (tokenHash) {
    if (!CONFIRM_TYPES.includes(type)) {
      showError('This sign-in link is not valid. Request a new one below.');
      return;
    }
    show('confirm-ready');
    return;
  }
  // No token: maybe already signed in (or an implicit-flow link put the session
  // in the URL hash, which supabase-js picks up automatically).
  const { data } = await supabase.auth.getSession();
  if (data && data.session && data.session.user) {
    await routeSignedIn(data.session.user);
    return;
  }
  showError('This sign-in link is missing information. Request a new one below.');
}

init().catch(err => showError(friendlyError(err && err.message ? err.message : String(err))));
