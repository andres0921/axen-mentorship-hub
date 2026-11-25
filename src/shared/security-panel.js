// "Sign-in & security" panel: passkeys (everyone) and the authenticator app
// (admins only, mentor app). Rendered into a container element that the
// caller owns (mentor Profile sheet, mentee Account screen). Listeners are
// attached to that container, so re-rendering the screen drops them with it.
import { esc } from './esc.js';
import {
  OTP_LENGTH, cleanCode,
  passkeysSupported, listPasskeys, registerPasskeySafe, deletePasskey,
  totpStatus, startTotpEnrollment, cancelTotpEnrollment, verifyTotp, removeTotp,
} from './auth-methods.js';

const BTN = 'inline-flex items-center justify-center min-h-[44px] px-4 rounded-xl border border-navy-200 bg-white text-sm font-medium hover:bg-navy-50 transition';
const BTN_DANGER = 'inline-flex items-center justify-center min-h-[44px] px-3 rounded-xl text-sm text-red-700 hover:bg-red-50 transition';
const CODE_INPUT = 'auth-code-input w-full border border-navy-200 rounded-xl px-4 py-3 bg-white';

const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const PASSKEY_ICON = '<svg viewBox="0 0 24 24" class="h-5 w-5 shrink-0 text-navy-500" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="4"/><path d="M2.5 20c.7-3.4 3.3-5.5 6.5-5.5 1.3 0 2.5.3 3.5.9"/><circle cx="17.5" cy="15.5" r="2.5"/><path d="M17.5 18v3.5M17.5 20h1.5"/></svg>';

export function mountSecurityPanel(container, { totp = false, deps = {} } = {}) {
  if (!container) return null;
  const api = {
    passkeysSupported, listPasskeys, registerPasskeySafe, deletePasskey,
    totpStatus, startTotpEnrollment, cancelTotpEnrollment, verifyTotp, removeTotp,
    ...deps,
  };
  const st = {
    passkeys: { loading: true, list: [], off: false, error: '', note: '', busy: false },
    totp: { loading: totp, enabled: totp, verified: null, off: false, enrolling: null, error: '', note: '', busy: false },
  };
  let alive = true;

  const msg = (text, kind) => (text
    ? `<p class="text-sm mt-2 ${kind === 'error' ? 'text-red-700' : 'text-emerald-700'}" role="status">${esc(text)}</p>`
    : '');

  function passkeysHtml() {
    const p = st.passkeys;
    const supported = api.passkeysSupported();
    let body;
    if (p.loading) body = '<p class="text-sm text-navy-700/60 mt-2">Loading…</p>';
    else if (p.off) body = '<p class="text-sm text-navy-700/60 mt-2">Passkeys aren’t turned on yet.</p>';
    else {
      const rows = p.list.map(k => `
        <li class="flex items-center gap-3 py-2 border-t border-navy-100 first:border-t-0">
          ${PASSKEY_ICON}
          <div class="min-w-0 flex-1">
            <div class="text-sm font-medium truncate">${esc(k.friendly_name || 'Passkey')}</div>
            <div class="text-xs text-navy-700/60">Added ${esc(fmtDate(k.created_at) || '—')}${k.last_used_at ? ` · Last used ${esc(fmtDate(k.last_used_at))}` : ''}</div>
          </div>
          <button type="button" class="${BTN_DANGER}" data-sec-action="remove-passkey" data-id="${esc(k.id)}" aria-label="Remove passkey ${esc(k.friendly_name || '')}">Remove</button>
        </li>`).join('');
      body = `
        ${p.list.length ? `<ul class="mt-2">${rows}</ul>` : '<p class="text-sm text-navy-700/60 mt-2">No passkeys yet.</p>'}
        ${supported
          ? `<button type="button" class="${BTN} mt-3 w-full sm:w-auto" data-sec-action="add-passkey"${p.busy ? ' disabled' : ''}>Add a passkey</button>`
          : '<p class="text-xs text-navy-700/60 mt-2">This browser can’t create passkeys. Try Safari or Chrome on your phone.</p>'}`;
    }
    return `
      <div data-sec="passkeys">
        <div class="font-medium">Passkeys</div>
        <p class="text-xs text-navy-700/60 mt-0.5">Sign in with Face ID, Touch ID or your device PIN. No code needed.</p>
        ${body}
        ${msg(p.error, 'error')}${msg(p.note, 'info')}
      </div>`;
  }

  function totpHtml() {
    const t = st.totp;
    if (!t.enabled || t.off) return '';
    let body;
    if (t.loading) body = '<p class="text-sm text-navy-700/60 mt-2">Loading…</p>';
    else if (t.enrolling) {
      const e = t.enrolling;
      body = `
        <ol class="text-sm mt-2 space-y-1 list-decimal pl-5">
          <li>Open your authenticator app (Google Authenticator, 1Password, Authy…) and scan this code.</li>
          <li>Type the ${OTP_LENGTH}-digit code it shows.</li>
        </ol>
        ${e.qr ? `<img src="${esc(e.qr)}" alt="QR code for your authenticator app" class="mt-3 h-44 w-44 rounded-lg border border-navy-100 bg-white p-2" width="176" height="176">` : ''}
        <div class="mt-3 text-xs text-navy-700/60">Can’t scan? Enter this key by hand:</div>
        <code class="block mt-1 text-sm font-mono break-all select-all bg-navy-50 rounded-lg px-3 py-2">${esc(e.secret)}</code>
        <form data-sec-form="totp-verify" class="mt-3 space-y-2" novalidate>
          <label class="block text-sm" for="sec-totp-code">${OTP_LENGTH}-digit code</label>
          <input id="sec-totp-code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="${OTP_LENGTH}" class="${CODE_INPUT}" required>
          <div class="flex gap-2 flex-wrap">
            <button type="submit" class="btn-primary min-h-[44px] px-5 rounded-xl"${t.busy ? ' disabled' : ''}>Turn on</button>
            <button type="button" class="${BTN}" data-sec-action="cancel-totp">Cancel</button>
          </div>
        </form>`;
    } else if (t.verified) {
      body = `
        <p class="text-sm mt-2"><span class="inline-block px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-medium">On</span> You’ll enter a code from your authenticator app after signing in.</p>
        <button type="button" class="${BTN_DANGER} mt-2 -ml-3" data-sec-action="remove-totp" data-id="${esc(t.verified.id)}"${t.busy ? ' disabled' : ''}>Turn off two-step verification</button>`;
    } else {
      body = `
        <p class="text-sm text-navy-700/60 mt-2">Optional for admins: after signing in, also ask for a code from an authenticator app.</p>
        <button type="button" class="${BTN} mt-3 w-full sm:w-auto" data-sec-action="start-totp"${t.busy ? ' disabled' : ''}>Set up authenticator app</button>`;
    }
    return `
      <div data-sec="totp" class="pt-4 mt-4 border-t border-navy-100">
        <div class="font-medium">Two-step verification</div>
        ${body}
        ${msg(t.error, 'error')}${msg(t.note, 'info')}
      </div>`;
  }

  function render() {
    if (!alive || !container.isConnected) { alive = false; return; }
    const focusedId = document.activeElement && container.contains(document.activeElement) ? document.activeElement.id : '';
    container.innerHTML = `
      <section aria-labelledby="sec-heading">
        <h4 id="sec-heading" class="font-display text-lg mb-2">Sign-in &amp; security</h4>
        ${passkeysHtml()}
        ${totpHtml()}
      </section>`;
    if (focusedId) {
      const again = document.getElementById(focusedId);
      if (again) again.focus();
    }
  }

  async function loadPasskeys() {
    const res = await api.listPasskeys();
    st.passkeys.loading = false;
    if (res.ok) st.passkeys.list = res.passkeys;
    else if (res.kind === 'passkey_disabled') st.passkeys.off = true;
    else st.passkeys.error = res.message || 'Couldn’t load your passkeys.';
    render();
  }

  async function loadTotp() {
    if (!totp) return;
    const res = await api.totpStatus();
    st.totp.loading = false;
    if (res.ok) st.totp.verified = res.verified;
    else if (res.kind === 'mfa_disabled') st.totp.off = true;
    else st.totp.error = res.message;
    render();
  }

  async function onAction(action, btn) {
    const p = st.passkeys;
    const t = st.totp;
    if (action === 'add-passkey') {
      p.busy = true; p.error = ''; p.note = '';
      render();
      const res = await api.registerPasskeySafe();
      p.busy = false;
      if (res.ok) {
        p.note = 'Passkey added. Next time, tap “Face ID or passkey” on the sign-in screen.';
        await loadPasskeys();
        return;
      }
      if (res.kind === 'passkey_disabled') p.off = true;
      else if (res.kind === 'cancelled') p.note = 'Cancelled.';
      else p.error = res.message;
      render();
    } else if (action === 'remove-passkey') {
      if (!confirm('Remove this passkey? You can still sign in with an email code.')) return;
      p.error = ''; p.note = '';
      btn.disabled = true;
      const res = await api.deletePasskey(btn.dataset.id);
      if (res.ok) {
        p.note = 'Passkey removed.';
        await loadPasskeys();
      } else {
        p.error = res.message;
        render();
      }
    } else if (action === 'start-totp') {
      t.busy = true; t.error = ''; t.note = '';
      render();
      const res = await api.startTotpEnrollment();
      t.busy = false;
      if (res.ok) t.enrolling = res;
      else if (res.kind === 'mfa_disabled') t.off = true;
      else t.error = res.message;
      render();
      const input = container.querySelector('#sec-totp-code');
      if (input) input.focus();
    } else if (action === 'cancel-totp') {
      const id = t.enrolling && t.enrolling.factorId;
      t.enrolling = null; t.error = ''; t.note = '';
      render();
      await api.cancelTotpEnrollment(id);
    } else if (action === 'remove-totp') {
      if (!confirm('Turn off two-step verification? You’ll sign in without an authenticator code.')) return;
      t.busy = true; t.error = ''; t.note = '';
      render();
      const res = await api.removeTotp(btn.dataset.id);
      t.busy = false;
      if (res.ok) {
        t.verified = null;
        t.note = 'Two-step verification is off.';
      } else {
        t.error = res.message;
      }
      render();
    }
  }

  async function onVerify(form) {
    const t = st.totp;
    const input = form.querySelector('input[name=code]');
    const code = cleanCode(input && input.value);
    if (code.length !== OTP_LENGTH) {
      t.error = `Enter the ${OTP_LENGTH}-digit code from your authenticator app.`;
      render();
      const again = container.querySelector('#sec-totp-code');
      if (again) { again.value = code; again.focus(); }
      return;
    }
    t.busy = true; t.error = '';
    render();
    const res = await api.verifyTotp(t.enrolling.factorId, code);
    t.busy = false;
    if (res.ok) {
      t.enrolling = null;
      t.note = 'Two-step verification is on.';
      await loadTotp();
      return;
    }
    t.error = res.message;
    render();
    const again = container.querySelector('#sec-totp-code');
    if (again) again.focus();
  }

  container.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-sec-action]');
    if (!btn || !container.contains(btn) || btn.disabled) return;
    e.preventDefault();
    e.stopPropagation();
    onAction(btn.dataset.secAction, btn);
  });
  container.addEventListener('submit', (e) => {
    const form = e.target.closest('[data-sec-form="totp-verify"]');
    if (!form) return;
    e.preventDefault();
    e.stopPropagation(); // keep page-level form handlers out of it
    onVerify(form);
  });
  container.addEventListener('input', (e) => {
    if (e.target.id !== 'sec-totp-code') return;
    const digits = cleanCode(e.target.value);
    if (e.target.value !== digits) e.target.value = digits;
  });

  render();
  loadPasskeys();
  loadTotp();

  return {
    // Abandon an unfinished enrollment when the sheet closes.
    destroy() {
      alive = false;
      if (st.totp.enrolling) api.cancelTotpEnrollment(st.totp.enrolling.factorId);
    },
  };
}
