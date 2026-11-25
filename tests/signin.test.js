// Sign-in screen controller against the real markup in index.html and
// mentee/index.html, with every protocol helper injected as a fake.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('../src/shared/supabase.js', () => ({ supabase: { auth: {} } }));
const { createSignIn } = await import('../src/shared/signin.js');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const load = (file, id) => {
  const doc = new DOMParser().parseFromString(readFileSync(resolve(root, file), 'utf8'), 'text/html');
  document.body.innerHTML = '';
  const el = doc.getElementById(id);
  document.body.appendChild(document.importNode(el, true));
  return document.getElementById(id);
};
const flush = () => new Promise(r => setTimeout(r, 0));
const visible = (el) => !!el && !el.classList.contains('hidden');

function fakes(over = {}) {
  return {
    sendEmailOtp: vi.fn(async () => ({ ok: true })),
    verifyEmailOtp: vi.fn(async () => ({ ok: true, session: { user: { id: 'u1' } } })),
    signInWithPassword: vi.fn(async () => ({ ok: true, session: { user: { id: 'u1' } } })),
    signInWithGoogle: vi.fn(async () => ({ ok: true })),
    fetchAuthSettings: vi.fn(async () => ({ external: { google: false } })),
    passkeysSupported: () => false,
    passkeysKnownOff: () => false,
    conditionalMediationAvailable: async () => false,
    signInWithPasskeySafe: vi.fn(async () => ({ ok: false, kind: 'cancelled', message: 'Cancelled.' })),
    verifyTotp: vi.fn(async () => ({ ok: true, session: { user: { id: 'u1' } } })),
    ...over,
  };
}

describe('mentor sign-in (index.html)', () => {
  it('email -> code -> session, primary path', async () => {
    const overlay = load('index.html', 'auth-overlay');
    const deps = fakes();
    const onSession = vi.fn();
    const s = createSignIn({ root: overlay, prefix: 'auth', app: 'mentor', allowPassword: true, onSession, deps });
    s.showEmail();
    expect(overlay.querySelector('#auth-submit').textContent).toMatch(/Email me a sign-in code/);
    overlay.querySelector('#auth-email').value = 'a@b.co';
    overlay.querySelector('#auth-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(deps.sendEmailOtp).toHaveBeenCalledWith('a@b.co', 'mentor');
    expect(s.step).toBe('code');
    expect(overlay.querySelector('#auth-code-email').textContent).toBe('a@b.co');
    expect(overlay.querySelector('#auth-code-resend').disabled).toBe(true); // 60s cooldown
    const code = overlay.querySelector('#auth-code');
    code.value = '12 34 56';
    code.dispatchEvent(new Event('input')); // auto-submits on the 6th digit
    await flush();
    expect(deps.verifyEmailOtp).toHaveBeenCalledWith('a@b.co', '123456');
    expect(onSession).toHaveBeenCalled();
    s.stop();
  });

  it('code inputs are numeric one-time-code fields', () => {
    const overlay = load('index.html', 'auth-overlay');
    for (const id of ['auth-code', 'auth-mfa-code']) {
      const el = overlay.querySelector(`#${id}`);
      expect(el.getAttribute('inputmode')).toBe('numeric');
      expect(el.getAttribute('autocomplete')).toBe('one-time-code');
      expect(el.getAttribute('maxlength')).toBe('6');
    }
    expect(overlay.querySelector('#auth-email').getAttribute('autocomplete')).toBe('username webauthn');
  });

  it('hides Google when settings say it is off, shows it when on', async () => {
    let overlay = load('index.html', 'auth-overlay');
    let s = createSignIn({ root: overlay, prefix: 'auth', app: 'mentor', allowPassword: true, deps: fakes() });
    await s.settingsReady;
    expect(visible(overlay.querySelector('#auth-google'))).toBe(false);
    overlay = load('index.html', 'auth-overlay');
    s = createSignIn({ root: overlay, prefix: 'auth', app: 'mentor', allowPassword: true, deps: fakes({ fetchAuthSettings: async () => ({ external: { google: true } }) }) });
    await s.settingsReady;
    expect(visible(overlay.querySelector('#auth-google'))).toBe(true);
  });

  it('password is a secondary option on the mentor app', async () => {
    const overlay = load('index.html', 'auth-overlay');
    const deps = fakes();
    const s = createSignIn({ root: overlay, prefix: 'auth', app: 'mentor', allowPassword: true, deps });
    s.showEmail();
    expect(visible(overlay.querySelector('#auth-password-row'))).toBe(false);
    overlay.querySelector('#auth-use-password').click();
    expect(visible(overlay.querySelector('#auth-password-row'))).toBe(true);
    expect(overlay.querySelector('#auth-lead').textContent).toMatch(/password/);
    overlay.querySelector('#auth-email').value = 'a@b.co';
    overlay.querySelector('#auth-password').value = 'pw';
    overlay.querySelector('#auth-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(deps.signInWithPassword).toHaveBeenCalledWith('a@b.co', 'pw');
    expect(deps.sendEmailOtp).not.toHaveBeenCalled();
    overlay.querySelector('#auth-magic').click();
    expect(visible(overlay.querySelector('#auth-password-row'))).toBe(false);
  });

  it('passkey button: shown only with WebAuthn, hidden after passkey_disabled', async () => {
    const overlay = load('index.html', 'auth-overlay');
    const deps = fakes({
      passkeysSupported: () => true,
      signInWithPasskeySafe: vi.fn(async () => ({ ok: false, kind: 'passkey_disabled', message: '' })),
    });
    const s = createSignIn({ root: overlay, prefix: 'auth', app: 'mentor', allowPassword: true, deps });
    s.showEmail();
    const btn = overlay.querySelector('#auth-passkey');
    expect(visible(btn)).toBe(true);
    btn.click();
    await flush();
    expect(visible(btn)).toBe(false);
  });

  it('shows the authenticator step and hands back the upgraded session', async () => {
    const overlay = load('index.html', 'auth-overlay');
    const deps = fakes();
    const s = createSignIn({ root: overlay, prefix: 'auth', app: 'mentor', allowPassword: true, deps });
    const done = vi.fn();
    s.showMfa('f1', done);
    expect(s.step).toBe('mfa');
    overlay.querySelector('#auth-mfa-code').value = '654321';
    overlay.querySelector('#auth-mfa-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(deps.verifyTotp).toHaveBeenCalledWith('f1', '654321');
    expect(done).toHaveBeenCalledWith({ user: { id: 'u1' } });
  });
});

describe('mentee sign-in (mentee/index.html)', () => {
  it('is passwordless, uses the mentee redirect app, and has updated copy', async () => {
    const section = load('mentee/index.html', 'signin');
    expect(section.querySelector('#signin-password, #signin-use-password')).toBeNull();
    expect(section.textContent).toMatch(/6-digit code/);
    expect(section.textContent).not.toMatch(/sign-in link, no password/);
    const deps = fakes();
    const s = createSignIn({ root: section, prefix: 'signin', app: 'mentee', deps });
    s.showEmail();
    await s.settingsReady;
    expect(visible(section.querySelector('#signin-alt'))).toBe(false); // nothing optional is on
    section.querySelector('#signin-email').value = 'm@b.co';
    section.querySelector('#signin-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(deps.sendEmailOtp).toHaveBeenCalledWith('m@b.co', 'mentee');
    expect(s.step).toBe('code');
    s.stop();
  });
});
