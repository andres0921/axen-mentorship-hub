// Sign-in methods shared by the mentor app (/) and the mentee portal (/mentee/):
// 6-digit email code (+ the existing magic link in the same email), passkeys,
// Google, password, and optional TOTP two-step for admins. Protocol logic lives
// here only; src/shared/signin.js and src/shared/security-panel.js are the UI.
//
// Hard rules enforced here:
//   - Sign-ups stay off: every email OTP call passes shouldCreateUser: false.
//     Google relies on "Allow new users to sign up" being off in the dashboard.
//   - Neutral copy whether or not an account exists (no account enumeration).
//   - Every optional method degrades quietly when the project hasn't enabled it.
//   - Never log the anon key or any token.
import { supabase } from './supabase.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, SITE_URL, MENTEE_PORTAL_PATH, MENTOR_APP_PATH } from './config.js';

export const OTP_LENGTH = 6;
// Supabase lets the same address request one email per 60 seconds.
export const RESEND_COOLDOWN_SECONDS = 60;

// ---------------------------------------------------------------------------
// Redirect targets (always SITE_URL, so links in emails point at production
// even when the request came from a preview deploy; localhost uses its own
// origin, see config.js)
// ---------------------------------------------------------------------------
export function redirectsFor(app) {
  if (app === 'mentee') {
    return {
      email: `${SITE_URL}/auth/confirm?next=${encodeURIComponent(MENTEE_PORTAL_PATH)}`,
      oauth: `${SITE_URL}${MENTEE_PORTAL_PATH}`,
    };
  }
  return { email: `${SITE_URL}/auth/confirm`, oauth: `${SITE_URL}${MENTOR_APP_PATH}` };
}

// ---------------------------------------------------------------------------
// Error classification + friendly copy
// ---------------------------------------------------------------------------
const PASSKEY_OFF_CODES = new Set([
  'passkey_disabled', 'passkeys_disabled', 'webauthn_disabled', 'passkey_not_enabled', 'feature_disabled',
]);
const MFA_OFF_CODES = new Set([
  'mfa_totp_enroll_not_enabled', 'mfa_totp_verify_not_enabled', 'mfa_disabled',
]);

const codeOf = (err) => String((err && (err.code || err.error_code)) || '');
const msgOf = (err) => String((err && err.message) || err || '');
const statusOf = (err) => (err && typeof err.status === 'number' ? err.status : 0);
const causeName = (err) => String((err && err.cause && err.cause.name) || (err && err.name) || '');

// Seconds to wait from a rate-limit message ("...only request this after 42 seconds").
export function retryAfterSeconds(err) {
  const mt = /after (\d+) seconds?/i.exec(msgOf(err));
  return mt ? Math.max(1, Math.min(3600, Number(mt[1]))) : RESEND_COOLDOWN_SECONDS;
}

// One word for what went wrong. `context` disambiguates generic statuses
// (e.g. a 404 from the passkey endpoints means "passkeys are off").
export function classifyAuthError(err, context = '') {
  if (!err) return null;
  const code = codeOf(err);
  const msg = msgOf(err);
  const status = statusOf(err);
  const isPasskey = context === 'passkey' || context === 'passkey-register' || context === 'passkey-list';

  // Browser-side WebAuthn outcomes (WebAuthnError / DOMException)
  if (code === 'ERROR_CEREMONY_ABORTED' || causeName(err) === 'AbortError') return 'cancelled';
  if (causeName(err) === 'NotAllowedError') return 'cancelled';
  if (code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED' || causeName(err) === 'InvalidStateError') return 'passkey_exists';
  if (code === 'ERROR_INVALID_DOMAIN' || code === 'ERROR_INVALID_RP_ID' || causeName(err) === 'SecurityError') return 'passkey_domain';
  if (/does not support webauthn/i.test(msg)) return 'passkey_unsupported';

  if (code === 'webauthn_challenge_expired') return 'challenge_expired';
  if (PASSKEY_OFF_CODES.has(code) || /passkeys?.{0,40}(not enabled|disabled|turned off)/i.test(msg)) return 'passkey_disabled';
  if (isPasskey && (status === 404 || status === 501 || code === 'provider_disabled')) return 'passkey_disabled';
  if (MFA_OFF_CODES.has(code) || (context === 'mfa' && /mfa.{0,40}(not enabled|disabled)/i.test(msg))) return 'mfa_disabled';
  if (code === 'mfa_verification_failed' || code === 'mfa_challenge_expired' || code === 'mfa_verification_rejected') return 'mfa_invalid';

  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || status === 429
      || /rate limit|only request this after|too many/i.test(msg)) return 'rate_limit';
  // shouldCreateUser:false for an unknown address (GoTrue answers otp_disabled /
  // "Signups not allowed for otp") and OAuth sign-ups being off.
  if (code === 'signup_disabled' || code === 'user_not_found' || code === 'otp_disabled'
      || /signups? not allowed|user not found/i.test(msg)) return 'no_account';
  if (code === 'otp_expired' || /token has expired|otp.{0,20}(expired|invalid)|invalid.{0,20}(token|otp)/i.test(msg)) return 'otp_invalid';
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(msg)) return 'invalid_credentials';
  if (code === 'email_not_confirmed') return 'email_not_confirmed';
  if (code === 'email_address_invalid' || (code === 'validation_failed' && /email/i.test(msg))) return 'email_invalid';
  if (code === 'provider_disabled' || code === 'oauth_provider_not_supported') return 'provider_disabled';
  if (err.name === 'AuthRetryableFetchError' || /failed to fetch|networkerror|load failed|network request failed/i.test(msg)) return 'network';
  return 'unknown';
}

// Plain-language message for a classified error. Empty string = say nothing.
export function friendlyAuthMessage(err, context = '') {
  const kind = classifyAuthError(err, context);
  switch (kind) {
    case null: return '';
    case 'cancelled': return context === 'passkey-conditional' ? '' : 'Cancelled.';
    case 'passkey_exists': return 'This device already has a passkey for your account.';
    case 'passkey_domain': return 'Passkeys only work on mentorship.andresaviles.com (not on preview links).';
    case 'passkey_unsupported': return 'This browser doesn’t support passkeys.';
    case 'challenge_expired': return 'That took a little too long. Please try again.';
    case 'passkey_disabled': return 'Passkeys aren’t turned on yet.';
    case 'mfa_disabled': return 'Authenticator apps aren’t turned on for this project.';
    case 'mfa_invalid': return 'That code didn’t match. Use the newest code in your authenticator app (and check your phone’s clock is set automatically).';
    case 'rate_limit': return `Please wait ${retryAfterSeconds(err)} seconds before asking for another code.`;
    case 'no_account': return context === 'google'
      ? 'This Google account hasn’t been invited yet. Sign in with the email your invite was sent to, or ask your mentor to invite this address.'
      : 'We couldn’t sign you in with that email. Check the address, or ask your mentor for an invite.';
    case 'otp_invalid': return 'That code didn’t work. It may have expired or been replaced by a newer one. If your email only has a sign-in button, tap that instead.';
    case 'invalid_credentials': return 'That email and password don’t match. Try again, or email yourself a code instead.';
    case 'email_not_confirmed': return 'This account hasn’t been confirmed yet. Email yourself a code instead.';
    case 'email_invalid': return 'Enter a valid email address.';
    case 'provider_disabled': return 'That sign-in method isn’t turned on yet.';
    case 'network': return 'You appear to be offline. Check your connection and try again.';
    default: return `Something went wrong: ${msgOf(err) || 'unknown error'}`;
  }
}

// ---------------------------------------------------------------------------
// Email: 6-digit code (the same email also carries the magic link)
// ---------------------------------------------------------------------------
export function normalizeEmail(value) {
  return String(value || '').trim();
}

export function isPlausibleEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

export function cleanCode(value) {
  return String(value || '').replace(/\D+/g, '').slice(0, OTP_LENGTH);
}

// Ask Supabase to email a code + link. Resolves to:
//   { ok: true }                                   sent, or unknown address (neutral)
//   { ok: true, rateLimited: true, retryAfter }    one was sent very recently
//   { ok: false, kind, message }                   real failure (network, etc.)
export async function sendEmailOtp(email, app) {
  const address = normalizeEmail(email);
  if (!isPlausibleEmail(address)) return { ok: false, kind: 'email_invalid', message: 'Enter a valid email address.' };
  let error = null;
  try {
    ({ error } = await supabase.auth.signInWithOtp({
      email: address,
      options: { shouldCreateUser: false, emailRedirectTo: redirectsFor(app).email },
    }));
  } catch (err) {
    error = err;
  }
  if (!error) return { ok: true };
  const kind = classifyAuthError(error, 'send');
  // Same outcome whether or not the account exists.
  if (kind === 'no_account') return { ok: true };
  // A code went out moments ago (double tap, came back to the page): let the
  // person type it instead of erroring.
  if (kind === 'rate_limit') return { ok: true, rateLimited: true, retryAfter: retryAfterSeconds(error) };
  return { ok: false, kind, message: friendlyAuthMessage(error, 'send') };
}

export async function verifyEmailOtp(email, code) {
  const token = cleanCode(code);
  if (token.length !== OTP_LENGTH) return { ok: false, kind: 'otp_short', message: `Enter the ${OTP_LENGTH}-digit code from the email.` };
  let data = null;
  let error = null;
  try {
    ({ data, error } = await supabase.auth.verifyOtp({ email: normalizeEmail(email), token, type: 'email' }));
  } catch (err) {
    error = err;
  }
  if (error) {
    const kind = classifyAuthError(error, 'verify');
    // An unknown address can't have a valid code: same copy as a wrong code.
    const message = kind === 'no_account' ? friendlyAuthMessage({ code: 'otp_expired' }) : friendlyAuthMessage(error, 'verify');
    return { ok: false, kind, message };
  }
  const session = data && data.session;
  if (!session) return { ok: false, kind: 'unknown', message: 'Sign-in did not return a session. Please try again.' };
  return { ok: true, session };
}

export async function signInWithPassword(email, password) {
  let data = null;
  let error = null;
  try {
    ({ data, error } = await supabase.auth.signInWithPassword({ email: normalizeEmail(email), password }));
  } catch (err) {
    error = err;
  }
  if (error) return { ok: false, kind: classifyAuthError(error, 'password'), message: friendlyAuthMessage(error, 'password') };
  const session = data && data.session;
  if (!session) return { ok: false, kind: 'unknown', message: 'Sign-in did not return a session. Please try again.' };
  return { ok: true, session };
}

// ---------------------------------------------------------------------------
// Public auth settings (which providers the project has switched on)
// ---------------------------------------------------------------------------
let settingsPromise = null;

// GET /auth/v1/settings with the public anon key. Resolves to the settings
// object, or null on any failure (callers then hide optional buttons).
export function fetchAuthSettings({ fetchImpl, timeoutMs = 6000, fresh = false } = {}) {
  if (settingsPromise && !fresh) return settingsPromise;
  const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!doFetch) return Promise.resolve(null);
  settingsPromise = (async () => {
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    try {
      const res = await doFetch(`${SUPABASE_URL}/auth/v1/settings`, {
        method: 'GET',
        headers: { apikey: SUPABASE_ANON_KEY, Accept: 'application/json' },
        signal: ctrl ? ctrl.signal : undefined,
        credentials: 'omit',
      });
      if (!res || !res.ok) return null;
      const json = await res.json();
      return json && typeof json === 'object' ? json : null;
    } catch {
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  })();
  return settingsPromise;
}

export function isGoogleEnabled(settings) {
  return !!(settings && settings.external && settings.external.google === true);
}

// ---------------------------------------------------------------------------
// Google (existing, invited users only; top-level redirect, no iframe)
// ---------------------------------------------------------------------------
export async function signInWithGoogle(app) {
  let error = null;
  try {
    ({ error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectsFor(app).oauth,
        queryParams: { prompt: 'select_account', access_type: 'online' },
      },
    }));
  } catch (err) {
    error = err;
  }
  if (error) return { ok: false, kind: classifyAuthError(error, 'google'), message: friendlyAuthMessage(error, 'google') };
  return { ok: true }; // the browser is navigating to Google
}

const REDIRECT_ERROR_KEYS = ['error', 'error_code', 'error_description'];

// An OAuth return such as ?error=access_denied&error_code=signup_disabled
// (query or hash). Read it at module load, before supabase-js tidies the URL.
export function readAuthRedirectError(loc = typeof window !== 'undefined' ? window.location : null) {
  if (!loc) return null;
  const q = new URLSearchParams(loc.search || '');
  const h = new URLSearchParams(String(loc.hash || '').replace(/^#/, ''));
  const get = (k) => q.get(k) || h.get(k);
  const error = get('error');
  const code = get('error_code');
  const description = get('error_description');
  if (!error && !code && !description) return null;
  return { error, code, description };
}

export function clearAuthRedirectParams(win = typeof window !== 'undefined' ? window : null) {
  if (!win || !win.history || typeof win.history.replaceState !== 'function') return;
  const url = new URL(win.location.href);
  let changed = false;
  for (const k of REDIRECT_ERROR_KEYS) {
    if (url.searchParams.has(k)) { url.searchParams.delete(k); changed = true; }
  }
  const h = new URLSearchParams(url.hash.replace(/^#/, ''));
  if (REDIRECT_ERROR_KEYS.some(k => h.has(k)) || h.has('sb')) { url.hash = ''; changed = true; }
  if (changed) win.history.replaceState(win.history.state, '', url.pathname + url.search + url.hash);
}

export function redirectErrorMessage(info) {
  if (!info) return '';
  const code = String(info.code || '');
  const desc = String(info.description || '');
  if (code === 'signup_disabled' || code === 'user_not_found' || /signups? not allowed|not invited|user not found/i.test(desc)) {
    return friendlyAuthMessage({ code: 'signup_disabled' }, 'google');
  }
  if (info.error === 'access_denied' && !code) return 'Google sign-in was cancelled.';
  if (code === 'provider_disabled' || /provider is not enabled|unsupported provider/i.test(desc)) {
    return 'Google sign-in isn’t turned on yet. Use your email instead.';
  }
  return `Sign-in didn’t finish${desc ? `: ${desc}` : '.'} Try again, or use your email instead.`;
}

// ---------------------------------------------------------------------------
// Passkeys (WebAuthn). The project must enable them in the dashboard; until
// then every call fails with a "disabled" error and the UI hides the option.
// ---------------------------------------------------------------------------
const PASSKEY_OFF_KEY = 'axen.passkeysOff';
const PASSKEY_OFF_TTL_MS = 12 * 60 * 60 * 1000; // re-check twice a day

export function passkeysSupported(win = typeof window !== 'undefined' ? window : null) {
  return !!(win && win.PublicKeyCredential && win.navigator && win.navigator.credentials);
}

export function passkeysKnownOff() {
  try {
    const at = Number(window.localStorage.getItem(PASSKEY_OFF_KEY) || 0);
    return at > 0 && Date.now() - at < PASSKEY_OFF_TTL_MS;
  } catch {
    return false;
  }
}

export function rememberPasskeysOff(off = true) {
  try {
    if (off) window.localStorage.setItem(PASSKEY_OFF_KEY, String(Date.now()));
    else window.localStorage.removeItem(PASSKEY_OFF_KEY);
  } catch { /* storage unavailable (private mode): ignore */ }
}

export async function conditionalMediationAvailable(win = typeof window !== 'undefined' ? window : null) {
  try {
    const PKC = win && win.PublicKeyCredential;
    return !!(PKC && typeof PKC.isConditionalMediationAvailable === 'function' && await PKC.isConditionalMediationAvailable());
  } catch {
    return false;
  }
}

// Sign in with a passkey. `conditional: true` uses passkey autofill on the
// email field (autocomplete="username webauthn"); pass a `signal` you own so
// the pending autofill request can be aborted before a modal ceremony or when
// the sign-in screen goes away. Retries once on webauthn_challenge_expired.
// Resolves to { ok: true, session } or { ok: false, kind, message } where
// message is '' when the UI should stay quiet.
export async function signInWithPasskeySafe({ conditional = false, signal } = {}) {
  const context = conditional ? 'passkey-conditional' : 'passkey';
  if (!passkeysSupported()) return { ok: false, kind: 'passkey_unsupported', message: conditional ? '' : friendlyAuthMessage({ message: 'Browser does not support WebAuthn' }) };
  for (let attempt = 0; attempt < 2; attempt++) {
    const options = {};
    if (conditional) options.mediation = 'conditional';
    if (signal) options.signal = signal;
    let res;
    try {
      res = await supabase.auth.signInWithPasskey({ options });
    } catch (err) {
      res = { data: null, error: err };
    }
    const error = res && res.error;
    if (!error) {
      const session = res.data && res.data.session;
      if (session) {
        rememberPasskeysOff(false);
        return { ok: true, session };
      }
      return { ok: false, kind: 'unknown', message: 'Sign-in did not return a session. Please try again.' };
    }
    const kind = classifyAuthError(error, 'passkey');
    if (kind === 'challenge_expired' && attempt === 0 && !(signal && signal.aborted)) continue;
    if (kind === 'passkey_disabled') rememberPasskeysOff(true);
    const quiet = kind === 'passkey_disabled' || (conditional && ['cancelled', 'challenge_expired', 'passkey_domain', 'unknown', 'network'].includes(kind));
    return { ok: false, kind, message: quiet ? '' : friendlyAuthMessage(error, context) };
  }
  return { ok: false, kind: 'challenge_expired', message: conditional ? '' : friendlyAuthMessage({ code: 'webauthn_challenge_expired' }) };
}

export async function registerPasskeySafe() {
  if (!passkeysSupported()) return { ok: false, kind: 'passkey_unsupported', message: friendlyAuthMessage({ message: 'Browser does not support WebAuthn' }) };
  let res;
  try {
    res = await supabase.auth.registerPasskey();
  } catch (err) {
    res = { data: null, error: err };
  }
  if (res && res.error) {
    const kind = classifyAuthError(res.error, 'passkey-register');
    if (kind === 'passkey_disabled') rememberPasskeysOff(true);
    return { ok: false, kind, message: friendlyAuthMessage(res.error, 'passkey-register') };
  }
  rememberPasskeysOff(false);
  return { ok: true, passkey: res ? res.data : null };
}

export async function listPasskeys() {
  const api = supabase.auth.passkey;
  if (!api || typeof api.list !== 'function') return { ok: false, kind: 'passkey_disabled', message: friendlyAuthMessage({ code: 'passkey_disabled' }) };
  let res;
  try {
    res = await api.list();
  } catch (err) {
    res = { data: null, error: err };
  }
  if (res && res.error) {
    const kind = classifyAuthError(res.error, 'passkey-list');
    if (kind === 'passkey_disabled') rememberPasskeysOff(true);
    return { ok: false, kind, message: friendlyAuthMessage(res.error, 'passkey-list') };
  }
  return { ok: true, passkeys: Array.isArray(res && res.data) ? res.data : [] };
}

export async function deletePasskey(passkeyId) {
  let res;
  try {
    res = await supabase.auth.passkey.delete({ passkeyId });
  } catch (err) {
    res = { error: err };
  }
  if (res && res.error) return { ok: false, kind: classifyAuthError(res.error, 'passkey-list'), message: friendlyAuthMessage(res.error, 'passkey-list') };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// TOTP authenticator-app two-step (admins opt in from Profile)
// ---------------------------------------------------------------------------
// Does this session still need an authenticator code? Only when the user has a
// VERIFIED TOTP factor and the session is aal1. Any error -> not needed (the
// gate never locks out people who never enrolled).
export async function mfaGateStatus() {
  try {
    const mfa = supabase.auth.mfa;
    if (!mfa) return { needed: false };
    const { data: aal, error } = await mfa.getAuthenticatorAssuranceLevel();
    if (error || !aal) return { needed: false };
    if (aal.currentLevel === 'aal2' || aal.nextLevel !== 'aal2') return { needed: false };
    const { data: factors, error: listError } = await mfa.listFactors();
    if (listError || !factors) return { needed: false };
    const totp = (factors.totp || factors.all || []).find(f => f.factor_type !== 'phone' && f.status === 'verified'
      && (f.factor_type === 'totp' || !f.factor_type));
    return totp ? { needed: true, factorId: totp.id } : { needed: false };
  } catch {
    return { needed: false };
  }
}

export async function verifyTotp(factorId, code) {
  const token = cleanCode(code);
  if (token.length !== OTP_LENGTH) return { ok: false, kind: 'otp_short', message: `Enter the ${OTP_LENGTH}-digit code from your authenticator app.` };
  let res;
  try {
    res = await supabase.auth.mfa.challengeAndVerify({ factorId, code: token });
  } catch (err) {
    res = { data: null, error: err };
  }
  if (res && res.error) return { ok: false, kind: classifyAuthError(res.error, 'mfa'), message: friendlyAuthMessage(res.error, 'mfa') };
  // The verify response is token fields, not a Session: read the upgraded
  // (aal2) session back from the client.
  let session = null;
  try {
    const { data } = await supabase.auth.getSession();
    session = (data && data.session) || null;
  } catch { /* the auth listener still fires MFA_CHALLENGE_VERIFIED */ }
  return { ok: true, session };
}

// Current TOTP state for the Profile panel.
//   { ok: true, verified: factor|null }  or  { ok: false, kind, message }
export async function totpStatus() {
  try {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) return { ok: false, kind: classifyAuthError(error, 'mfa'), message: friendlyAuthMessage(error, 'mfa') };
    const all = (data && (data.all || data.totp)) || [];
    const verified = all.find(f => (f.factor_type === 'totp' || !f.factor_type) && f.status === 'verified') || null;
    return { ok: true, verified };
  } catch (err) {
    return { ok: false, kind: classifyAuthError(err, 'mfa'), message: friendlyAuthMessage(err, 'mfa') };
  }
}

const safeQr = (qr) => (typeof qr === 'string' && /^data:image\/(svg\+xml|png)[;,]/i.test(qr) ? qr : '');

// Start enrolling: tidy up abandoned unverified TOTP factors first (otherwise a
// second attempt can hit a name conflict), then create a new one.
export async function startTotpEnrollment() {
  try {
    const mfa = supabase.auth.mfa;
    const { data: listed } = await mfa.listFactors();
    for (const f of ((listed && listed.all) || [])) {
      if ((f.factor_type === 'totp' || !f.factor_type) && f.status === 'unverified') {
        try { await mfa.unenroll({ factorId: f.id }); } catch { /* best effort */ }
      }
    }
    const { data, error } = await mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator app', issuer: 'AXEN Mentorship Hub' });
    if (error) return { ok: false, kind: classifyAuthError(error, 'mfa'), message: friendlyAuthMessage(error, 'mfa') };
    const totp = (data && data.totp) || {};
    return { ok: true, factorId: data.id, qr: safeQr(totp.qr_code), secret: String(totp.secret || ''), uri: String(totp.uri || '') };
  } catch (err) {
    return { ok: false, kind: classifyAuthError(err, 'mfa'), message: friendlyAuthMessage(err, 'mfa') };
  }
}

export async function cancelTotpEnrollment(factorId) {
  if (!factorId) return;
  try { await supabase.auth.mfa.unenroll({ factorId }); } catch { /* best effort */ }
}

export async function removeTotp(factorId) {
  try {
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) {
      const kind = classifyAuthError(error, 'mfa');
      const message = /aal2|insufficient/i.test(`${codeOf(error)} ${msgOf(error)}`)
        ? 'Sign out and back in with your authenticator code, then try again.'
        : friendlyAuthMessage(error, 'mfa');
      return { ok: false, kind, message };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, kind: classifyAuthError(err, 'mfa'), message: friendlyAuthMessage(err, 'mfa') };
  }
}
