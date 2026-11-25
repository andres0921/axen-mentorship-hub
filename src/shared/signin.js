// Sign-in screen controller shared by the mentor app and the mentee portal.
// The markup lives in each page's HTML (same structure, different ID prefix:
// "auth-" on /, "signin-" on /mentee/). Steps are siblings marked with
// data-auth-step="loading|email|code|mfa|pending"; exactly one is visible.
//
// Primary path: email -> "Email me a sign-in code" -> type the 6-digit code.
// Secondary (equal-weight buttons, each shown only when usable): passkey /
// Face ID, Continue with Google, Use a password (mentor app only).
import {
  OTP_LENGTH, RESEND_COOLDOWN_SECONDS, normalizeEmail, cleanCode, isPlausibleEmail,
  sendEmailOtp, verifyEmailOtp, signInWithPassword, signInWithGoogle,
  fetchAuthSettings, isGoogleEnabled,
  passkeysSupported, passkeysKnownOff, conditionalMediationAvailable, signInWithPasskeySafe,
  verifyTotp,
} from './auth-methods.js';

const STEPS = ['loading', 'email', 'code', 'mfa', 'pending'];

// deps is injectable for tests; production uses the real helpers.
export function createSignIn({
  root,
  prefix,
  app,
  allowPassword = false,
  onSession = () => {},
  onSignOut = () => {},
  deps = {},
}) {
  const api = {
    sendEmailOtp, verifyEmailOtp, signInWithPassword, signInWithGoogle, fetchAuthSettings, isGoogleEnabled,
    passkeysSupported, passkeysKnownOff, conditionalMediationAvailable, signInWithPasskeySafe, verifyTotp,
    ...deps,
  };
  const el = (name) => root.querySelector(`#${prefix}-${name}`);
  const steps = Object.fromEntries(STEPS.map(s => [s, root.querySelector(`[data-auth-step="${s}"]`)]));

  const emailForm = el('form');
  const emailInput = el('email');
  const submitBtn = el('submit');
  const passwordRow = el('password-row');
  const passwordInput = el('password');
  const usePasswordBtn = el('use-password');
  const useCodeBtn = el('magic'); // "Email me a code instead" (password mode only)
  const altBox = el('alt');
  const passkeyBtn = el('passkey');
  const googleBtn = el('google');
  const codeForm = el('code-form');
  const codeInput = el('code');
  const codeEmail = el('code-email');
  const codeSubmit = el('code-submit');
  const resendBtn = el('code-resend');
  const backBtn = el('code-back');
  const mfaForm = el('mfa-form');
  const mfaInput = el('mfa-code');
  const mfaSubmit = el('mfa-submit');
  const mfaSignOut = el('mfa-signout');
  const message = el('message');
  const lead = el('lead');
  const leadCodeText = lead ? lead.textContent : '';

  let mode = 'code'; // 'code' | 'password'
  let sentTo = '';
  let cooldownUntil = 0;
  let cooldownTimer = null;
  let conditionalCtrl = null;
  let mfaFactorId = null;
  let mfaDone = null;
  let busy = false;
  let googleOn = false;
  let passkeyOn = api.passkeysSupported() && !api.passkeysKnownOff();

  const show = (node, on) => { if (node) node.classList.toggle('hidden', !on); };

  // ---- messages -----------------------------------------------------------
  function showMessage(text, kind = 'error') {
    if (!message) return;
    if (!text) { clearMessage(); return; }
    message.textContent = text; // textContent: never HTML
    message.dataset.kind = kind;
    message.classList.remove('hidden');
  }
  function clearMessage() {
    if (!message) return;
    message.textContent = '';
    delete message.dataset.kind;
    message.classList.add('hidden');
  }

  // ---- steps --------------------------------------------------------------
  let current = null;
  function showStep(step, { keepMessage = false } = {}) {
    current = step;
    for (const s of STEPS) show(steps[s], s === step);
    if (!keepMessage) clearMessage();
    if (step === 'email') startConditional();
    else stopConditional();
  }

  function renderAlternatives() {
    show(passkeyBtn, passkeyOn);
    show(googleBtn, googleOn);
    show(passwordRow, mode === 'password');
    show(usePasswordBtn, allowPassword && mode === 'code');
    show(useCodeBtn, allowPassword && mode === 'password');
    if (passwordInput) passwordInput.required = mode === 'password';
    if (submitBtn) submitBtn.textContent = mode === 'password' ? 'Sign in' : 'Email me a sign-in code';
    if (lead && lead.dataset.passwordText) lead.textContent = mode === 'password' ? lead.dataset.passwordText : leadCodeText;
    const anyAlt = [passkeyBtn, googleBtn, usePasswordBtn, useCodeBtn].some(b => b && !b.classList.contains('hidden'));
    show(altBox, anyAlt);
  }

  function setMode(next) {
    mode = next === 'password' && allowPassword ? 'password' : 'code';
    renderAlternatives();
    clearMessage();
    if (mode === 'password' && passwordInput) {
      (normalizeEmail(emailInput.value) ? passwordInput : emailInput).focus();
    } else if (emailInput) {
      emailInput.focus();
    }
  }

  // ---- resend cooldown -----------------------------------------------------
  function tickCooldown() {
    if (!resendBtn) return;
    const left = Math.ceil((cooldownUntil - Date.now()) / 1000);
    if (left > 0) {
      resendBtn.disabled = true;
      resendBtn.textContent = `Resend code in ${left}s`;
    } else {
      resendBtn.disabled = false;
      resendBtn.textContent = 'Resend code';
      clearInterval(cooldownTimer);
      cooldownTimer = null;
    }
  }
  function startCooldown(seconds = RESEND_COOLDOWN_SECONDS) {
    cooldownUntil = Date.now() + seconds * 1000;
    clearInterval(cooldownTimer);
    cooldownTimer = setInterval(tickCooldown, 1000);
    tickCooldown();
  }

  // ---- email code -----------------------------------------------------------
  async function sendCode({ resend = false } = {}) {
    const email = resend ? sentTo : normalizeEmail(emailInput.value);
    if (!isPlausibleEmail(email)) {
      showMessage('Enter a valid email address.');
      emailInput.focus();
      return;
    }
    const btn = resend ? resendBtn : submitBtn;
    busy = true;
    if (btn) btn.disabled = true;
    clearMessage();
    try {
      const res = await api.sendEmailOtp(email, app);
      if (!res.ok) {
        showMessage(res.message);
        return;
      }
      sentTo = email;
      if (codeEmail) codeEmail.textContent = email;
      if (!resend) {
        codeInput.value = '';
        showStep('code');
      }
      startCooldown(res.rateLimited ? res.retryAfter : RESEND_COOLDOWN_SECONDS);
      if (res.rateLimited) showMessage('We sent a code a moment ago. Check your email for it.', 'info');
      else if (resend) showMessage('Sent. Use the code from the newest email.', 'info');
      codeInput.focus();
    } finally {
      busy = false;
      if (btn && !(btn === resendBtn && cooldownUntil > Date.now())) btn.disabled = false;
    }
  }

  async function submitCode() {
    if (busy) return;
    const code = cleanCode(codeInput.value);
    if (code.length !== OTP_LENGTH) {
      showMessage(`Enter the ${OTP_LENGTH}-digit code from the email.`);
      codeInput.focus();
      return;
    }
    busy = true;
    codeSubmit.disabled = true;
    clearMessage();
    try {
      const res = await api.verifyEmailOtp(sentTo, code);
      if (!res.ok) {
        showMessage(res.message);
        codeInput.select();
        return;
      }
      showMessage('Signed in.', 'info');
      await onSession(res.session, 'otp');
    } finally {
      busy = false;
      codeSubmit.disabled = false;
    }
  }

  async function submitPassword() {
    const email = normalizeEmail(emailInput.value);
    if (!isPlausibleEmail(email)) {
      showMessage('Enter a valid email address.');
      emailInput.focus();
      return;
    }
    if (!passwordInput.value) {
      showMessage('Enter your password.');
      passwordInput.focus();
      return;
    }
    submitBtn.disabled = true;
    clearMessage();
    try {
      const res = await api.signInWithPassword(email, passwordInput.value);
      if (!res.ok) {
        showMessage(res.message);
        return;
      }
      await onSession(res.session, 'password');
    } finally {
      submitBtn.disabled = false;
    }
  }

  // ---- passkeys ---------------------------------------------------------------
  function hidePasskeys() {
    passkeyOn = false;
    renderAlternatives();
  }

  async function startConditional() {
    if (!passkeyOn || conditionalCtrl || !emailInput) return;
    if (!(await api.conditionalMediationAvailable())) return;
    if (current !== 'email' || conditionalCtrl || !passkeyOn) return;
    const ctrl = new AbortController();
    conditionalCtrl = ctrl;
    const res = await api.signInWithPasskeySafe({ conditional: true, signal: ctrl.signal });
    if (conditionalCtrl === ctrl) conditionalCtrl = null;
    if (ctrl.signal.aborted) return;
    if (res.ok) {
      await onSession(res.session, 'passkey');
      return;
    }
    if (res.kind === 'passkey_disabled' || res.kind === 'passkey_domain') hidePasskeys();
    else if (res.message) showMessage(res.message);
  }

  function stopConditional() {
    if (conditionalCtrl) {
      conditionalCtrl.abort();
      conditionalCtrl = null;
    }
  }

  async function passkeyClick() {
    stopConditional(); // never two WebAuthn requests at once
    passkeyBtn.disabled = true;
    clearMessage();
    try {
      const res = await api.signInWithPasskeySafe();
      if (res.ok) {
        await onSession(res.session, 'passkey');
        return;
      }
      if (res.kind === 'passkey_disabled') {
        hidePasskeys();
        showMessage('Passkey sign-in isn’t available yet. Use your email instead.', 'info');
      } else if (res.message) {
        showMessage(res.message, res.kind === 'cancelled' ? 'info' : 'error');
      }
      if (current === 'email') startConditional();
    } finally {
      passkeyBtn.disabled = false;
    }
  }

  // ---- Google ---------------------------------------------------------------
  async function googleClick() {
    stopConditional();
    googleBtn.disabled = true;
    clearMessage();
    const res = await api.signInWithGoogle(app);
    if (!res.ok) {
      googleBtn.disabled = false;
      showMessage(res.message);
      if (current === 'email') startConditional();
    }
    // ok: the page is navigating to Google; leave the button disabled.
  }

  // ---- MFA ----------------------------------------------------------------------
  function showMfa(factorId, onVerified) {
    if (!mfaForm) return false;
    mfaFactorId = factorId;
    mfaDone = onVerified;
    if (current !== 'mfa') {
      mfaInput.value = '';
      showStep('mfa');
    }
    mfaInput.focus();
    return true;
  }

  async function submitMfa() {
    if (busy) return;
    const code = cleanCode(mfaInput.value);
    if (code.length !== OTP_LENGTH) {
      showMessage(`Enter the ${OTP_LENGTH}-digit code from your authenticator app.`);
      mfaInput.focus();
      return;
    }
    busy = true;
    mfaSubmit.disabled = true;
    clearMessage();
    try {
      const res = await api.verifyTotp(mfaFactorId, code);
      if (!res.ok) {
        showMessage(res.message);
        mfaInput.select();
        return;
      }
      const done = mfaDone;
      mfaDone = null;
      if (done) await done(res.session);
    } finally {
      busy = false;
      mfaSubmit.disabled = false;
    }
  }

  // ---- code inputs: digits only, auto-submit on the 6th digit -------------------
  function wireCodeInput(input, submit) {
    if (!input) return;
    input.addEventListener('input', () => {
      const digits = cleanCode(input.value);
      if (input.value !== digits) input.value = digits;
      if (digits.length === OTP_LENGTH && !busy) submit();
    });
  }

  // ---- listeners -----------------------------------------------------------------
  if (emailForm) {
    emailForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (mode === 'password') submitPassword();
      else sendCode();
    });
  }
  if (usePasswordBtn) usePasswordBtn.addEventListener('click', () => setMode('password'));
  if (useCodeBtn) useCodeBtn.addEventListener('click', () => setMode('code'));
  if (passkeyBtn) passkeyBtn.addEventListener('click', passkeyClick);
  if (googleBtn) googleBtn.addEventListener('click', googleClick);
  if (codeForm) {
    codeForm.addEventListener('submit', (e) => { e.preventDefault(); submitCode(); });
    wireCodeInput(codeInput, submitCode);
  }
  if (resendBtn) resendBtn.addEventListener('click', () => sendCode({ resend: true }));
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      showStep('email');
      emailInput.focus();
    });
  }
  if (mfaForm) {
    mfaForm.addEventListener('submit', (e) => { e.preventDefault(); submitMfa(); });
    wireCodeInput(mfaInput, submitMfa);
  }
  if (mfaSignOut) mfaSignOut.addEventListener('click', () => onSignOut(mfaSignOut));

  renderAlternatives();
  // Show "Continue with Google" only when the project has it switched on.
  const settingsReady = Promise.resolve(api.fetchAuthSettings()).then((settings) => {
    googleOn = !!api.isGoogleEnabled(settings);
    renderAlternatives();
  }).catch(() => {});

  return {
    showStep,
    // Back to the email step (after sign-out, or first paint without a session).
    showEmail({ keepMessage = false } = {}) {
      setModeQuiet('code');
      if (passwordInput) passwordInput.value = '';
      showStep('email', { keepMessage });
    },
    showPending() { showStep('pending', { keepMessage: true }); },
    showMfa,
    showMessage,
    clearMessage,
    // Abort any pending passkey autofill (call when the app takes over).
    stop() {
      stopConditional();
      clearInterval(cooldownTimer);
      cooldownTimer = null;
    },
    get step() { return current; },
    settingsReady,
  };

  function setModeQuiet(next) {
    mode = next === 'password' && allowPassword ? 'password' : 'code';
    renderAlternatives();
  }
}
