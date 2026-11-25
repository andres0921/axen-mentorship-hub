// Sign-in protocol helpers against a mocked Supabase client (never the live
// project): email code, friendly errors, auth settings probe, passkeys, MFA.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const auth = {
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  signInWithPassword: vi.fn(),
  signInWithOAuth: vi.fn(),
  signInWithPasskey: vi.fn(),
  registerPasskey: vi.fn(),
  getSession: vi.fn(async () => ({ data: { session: { user: { id: 'u1' }, access_token: 't' } }, error: null })),
  passkey: { list: vi.fn(), delete: vi.fn() },
  mfa: {
    getAuthenticatorAssuranceLevel: vi.fn(),
    listFactors: vi.fn(),
    challengeAndVerify: vi.fn(),
    enroll: vi.fn(),
    unenroll: vi.fn(),
  },
};
vi.mock('../src/shared/supabase.js', () => ({ supabase: { auth } }));

const m = await import('../src/shared/auth-methods.js');
const { SUPABASE_ANON_KEY, SITE_URL } = await import('../src/shared/config.js');

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('email code', () => {
  it('sends with shouldCreateUser: false and the right redirect per app', async () => {
    auth.signInWithOtp.mockResolvedValue({ error: null });
    expect(await m.sendEmailOtp('  a@b.co ', 'mentor')).toEqual({ ok: true });
    expect(auth.signInWithOtp).toHaveBeenLastCalledWith({
      email: 'a@b.co',
      options: { shouldCreateUser: false, emailRedirectTo: `${SITE_URL}/auth/confirm` },
    });
    await m.sendEmailOtp('a@b.co', 'mentee');
    expect(auth.signInWithOtp.mock.calls[1][0].options).toEqual({
      shouldCreateUser: false,
      emailRedirectTo: `${SITE_URL}/auth/confirm?next=%2Fmentee%2F`,
    });
  });

  it('never creates accounts: every call passes shouldCreateUser false', async () => {
    auth.signInWithOtp.mockResolvedValue({ error: null });
    for (const app of ['mentor', 'mentee', undefined]) await m.sendEmailOtp('x@y.io', app);
    for (const [arg] of auth.signInWithOtp.mock.calls) expect(arg.options.shouldCreateUser).toBe(false);
  });

  it('is neutral for unknown addresses (no account enumeration)', async () => {
    auth.signInWithOtp.mockResolvedValue({ error: { code: 'otp_disabled', message: 'Signups not allowed for otp', status: 422 } });
    expect(await m.sendEmailOtp('nobody@b.co', 'mentee')).toEqual({ ok: true });
  });

  it('treats a recent send as "go type the code" with the server cooldown', async () => {
    auth.signInWithOtp.mockResolvedValue({ error: { code: 'over_email_send_rate_limit', status: 429, message: 'For security purposes, you can only request this after 37 seconds.' } });
    expect(await m.sendEmailOtp('a@b.co', 'mentor')).toEqual({ ok: true, rateLimited: true, retryAfter: 37 });
  });

  it('rejects malformed addresses without calling Supabase', async () => {
    const res = await m.sendEmailOtp('not-an-email', 'mentor');
    expect(res.ok).toBe(false);
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it('reports network failures plainly', async () => {
    auth.signInWithOtp.mockRejectedValue(new TypeError('Failed to fetch'));
    const res = await m.sendEmailOtp('a@b.co', 'mentor');
    expect(res).toMatchObject({ ok: false, kind: 'network' });
    expect(res.message).toMatch(/offline/i);
  });

  it('verifies a 6-digit code with type "email"', async () => {
    const session = { user: { id: 'u1' } };
    auth.verifyOtp.mockResolvedValue({ data: { session }, error: null });
    expect(await m.verifyEmailOtp('a@b.co', '123 456')).toEqual({ ok: true, session });
    expect(auth.verifyOtp).toHaveBeenCalledWith({ email: 'a@b.co', token: '123456', type: 'email' });
  });

  it('asks for all 6 digits before calling Supabase', async () => {
    const res = await m.verifyEmailOtp('a@b.co', '12345');
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/6-digit/);
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  it('explains a bad/expired code and points at the link in the email', async () => {
    auth.verifyOtp.mockResolvedValue({ data: {}, error: { code: 'otp_expired', message: 'Token has expired or is invalid', status: 403 } });
    const res = await m.verifyEmailOtp('a@b.co', '000000');
    expect(res).toMatchObject({ ok: false, kind: 'otp_invalid' });
    expect(res.message).toMatch(/tap that instead/i);
  });
});

describe('friendly errors', () => {
  it.each([
    [{ code: 'invalid_credentials', message: 'Invalid login credentials' }, 'password', /don’t match/],
    [{ code: 'over_request_rate_limit', status: 429, message: 'Too many requests' }, '', /wait 60 seconds/],
    [{ code: 'signup_disabled', message: 'Signups not allowed for this instance' }, 'google', /hasn’t been invited/],
    [{ code: 'mfa_verification_failed', message: 'Invalid TOTP code entered' }, 'mfa', /didn’t match/],
    [{ code: 'mfa_totp_enroll_not_enabled', message: 'MFA enroll is disabled for TOTP' }, 'mfa', /aren’t turned on/],
    [{ code: 'passkey_disabled', message: 'Passkeys are disabled' }, 'passkey', /Passkeys aren’t turned on yet/],
    [{ code: 'ERROR_INVALID_RP_ID', message: 'rp id' }, 'passkey', /mentorship\.andresaviles\.com/],
  ])('%j (%s)', (err, ctx, re) => {
    expect(m.friendlyAuthMessage(err, ctx)).toMatch(re);
  });

  it('maps a 404 from the passkey endpoints to "disabled" but not elsewhere', () => {
    expect(m.classifyAuthError({ status: 404, message: 'Not Found' }, 'passkey')).toBe('passkey_disabled');
    expect(m.classifyAuthError({ status: 404, message: 'Not Found' }, 'send')).toBe('unknown');
  });

  it('turns OAuth return errors into plain copy', () => {
    const info = m.readAuthRedirectError({ search: '?error=access_denied&error_code=signup_disabled&error_description=Signups+not+allowed', hash: '' });
    expect(info).toEqual({ error: 'access_denied', code: 'signup_disabled', description: 'Signups not allowed' });
    expect(m.redirectErrorMessage(info)).toMatch(/Google account hasn’t been invited yet/);
    expect(m.readAuthRedirectError({ search: '', hash: '#error=access_denied' })).toEqual({ error: 'access_denied', code: null, description: null });
    expect(m.redirectErrorMessage({ error: 'access_denied' })).toMatch(/cancelled/);
    expect(m.readAuthRedirectError({ search: '?x=1', hash: '#dashboard' })).toBeNull();
  });
});

describe('auth settings / Google', () => {
  const resp = (body, ok = true) => ({ ok, json: async () => body });

  it('sends the anon key as a header and reads external.google', async () => {
    const fetchImpl = vi.fn(async () => resp({ external: { google: true } }));
    const settings = await m.fetchAuthSettings({ fetchImpl, fresh: true });
    expect(m.isGoogleEnabled(settings)).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toMatch(/\/auth\/v1\/settings$/);
    expect(url).not.toContain(SUPABASE_ANON_KEY); // key never in the URL
    expect(init.headers.apikey).toBe(SUPABASE_ANON_KEY);
  });

  it('hides Google when it is off, missing, or the probe fails', async () => {
    expect(m.isGoogleEnabled(await m.fetchAuthSettings({ fetchImpl: async () => resp({ external: { google: false } }), fresh: true }))).toBe(false);
    expect(m.isGoogleEnabled(await m.fetchAuthSettings({ fetchImpl: async () => resp({}), fresh: true }))).toBe(false);
    expect(m.isGoogleEnabled(await m.fetchAuthSettings({ fetchImpl: async () => resp({}, false), fresh: true }))).toBe(false);
    expect(await m.fetchAuthSettings({ fetchImpl: async () => { throw new Error('offline'); }, fresh: true })).toBeNull();
  });

  it('redirects to Google top-level with prompt=select_account, back to the right app', async () => {
    auth.signInWithOAuth.mockResolvedValue({ error: null });
    await m.signInWithGoogle('mentee');
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: `${SITE_URL}/mentee/`, queryParams: { prompt: 'select_account', access_type: 'online' } },
    });
    await m.signInWithGoogle('mentor');
    expect(auth.signInWithOAuth.mock.calls[1][0].options.redirectTo).toBe(`${SITE_URL}/`);
    expect(auth.signInWithOAuth.mock.calls[1][0].options.skipBrowserRedirect).toBeUndefined();
  });
});

describe('passkeys', () => {
  beforeEach(() => {
    window.PublicKeyCredential = function PublicKeyCredential() {};
    if (!navigator.credentials) Object.defineProperty(navigator, 'credentials', { value: {}, configurable: true });
  });

  it('maps passkey_disabled, stays quiet, and remembers it', async () => {
    auth.signInWithPasskey.mockResolvedValue({ data: null, error: { code: 'passkey_disabled', message: 'Passkeys are disabled', status: 422 } });
    const res = await m.signInWithPasskeySafe();
    expect(res).toEqual({ ok: false, kind: 'passkey_disabled', message: '' });
    expect(m.passkeysKnownOff()).toBe(true);
  });

  it('a user cancel is a short "Cancelled." (silent for autofill)', async () => {
    const cancel = { code: 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY', message: 'The operation either timed out or was not allowed.', cause: { name: 'NotAllowedError' } };
    auth.signInWithPasskey.mockResolvedValue({ data: null, error: cancel });
    expect(await m.signInWithPasskeySafe()).toMatchObject({ kind: 'cancelled', message: 'Cancelled.' });
    expect(await m.signInWithPasskeySafe({ conditional: true, signal: new AbortController().signal })).toMatchObject({ kind: 'cancelled', message: '' });
  });

  it('retries once on webauthn_challenge_expired', async () => {
    const session = { user: { id: 'u1' } };
    auth.signInWithPasskey
      .mockResolvedValueOnce({ data: null, error: { code: 'webauthn_challenge_expired', message: 'expired' } })
      .mockResolvedValueOnce({ data: { session, user: session.user }, error: null });
    expect(await m.signInWithPasskeySafe({ conditional: true })).toEqual({ ok: true, session });
    expect(auth.signInWithPasskey).toHaveBeenCalledTimes(2);
    expect(auth.signInWithPasskey.mock.calls[0][0].options.mediation).toBe('conditional');
  });

  it('reports "not supported" without calling Supabase when WebAuthn is missing', async () => {
    delete window.PublicKeyCredential;
    expect((await m.signInWithPasskeySafe()).kind).toBe('passkey_unsupported');
    expect(auth.signInWithPasskey).not.toHaveBeenCalled();
  });

  it('list() treats a disabled project as "off"', async () => {
    auth.passkey.list.mockResolvedValue({ data: null, error: { status: 404, message: 'Not Found' } });
    expect(await m.listPasskeys()).toMatchObject({ ok: false, kind: 'passkey_disabled' });
    auth.passkey.list.mockResolvedValue({ data: [{ id: 'p1' }], error: null });
    expect(await m.listPasskeys()).toEqual({ ok: true, passkeys: [{ id: 'p1' }] });
  });
});

describe('MFA gate', () => {
  it('requires a code when a verified TOTP factor exists and the session is aal1', async () => {
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null });
    auth.mfa.listFactors.mockResolvedValue({ data: { all: [], totp: [{ id: 'f1', factor_type: 'totp', status: 'verified' }] }, error: null });
    expect(await m.mfaGateStatus()).toEqual({ needed: true, factorId: 'f1' });
  });

  it('does nothing for people with no factor', async () => {
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null });
    expect(await m.mfaGateStatus()).toEqual({ needed: false });
    expect(auth.mfa.listFactors).not.toHaveBeenCalled();
  });

  it('does nothing once the session is already aal2', async () => {
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null });
    expect(await m.mfaGateStatus()).toEqual({ needed: false });
  });

  it('ignores unverified factors and never blocks on errors', async () => {
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal2' }, error: null });
    auth.mfa.listFactors.mockResolvedValue({ data: { all: [], totp: [{ id: 'f2', factor_type: 'totp', status: 'unverified' }] }, error: null });
    expect(await m.mfaGateStatus()).toEqual({ needed: false });
    auth.mfa.getAuthenticatorAssuranceLevel.mockRejectedValue(new Error('boom'));
    expect(await m.mfaGateStatus()).toEqual({ needed: false });
  });

  it('verifies a TOTP code and returns the upgraded session', async () => {
    auth.mfa.challengeAndVerify.mockResolvedValue({ data: { access_token: 'x' }, error: null });
    const res = await m.verifyTotp('f1', '654321');
    expect(auth.mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: 'f1', code: '654321' });
    expect(res.ok).toBe(true);
    expect(res.session.user.id).toBe('u1');
  });

  it('enrollment cleans up abandoned factors and only accepts a data: image QR', async () => {
    auth.mfa.listFactors.mockResolvedValue({ data: { all: [{ id: 'old', factor_type: 'totp', status: 'unverified' }] }, error: null });
    auth.mfa.unenroll.mockResolvedValue({ error: null });
    auth.mfa.enroll.mockResolvedValue({ data: { id: 'f9', totp: { qr_code: 'data:image/svg+xml;utf-8,<svg/>', secret: 'ABC', uri: 'otpauth://x' } }, error: null });
    const res = await m.startTotpEnrollment();
    expect(auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: 'old' });
    expect(auth.mfa.enroll).toHaveBeenCalledWith(expect.objectContaining({ factorType: 'totp' }));
    expect(res).toMatchObject({ ok: true, factorId: 'f9', secret: 'ABC', qr: 'data:image/svg+xml;utf-8,<svg/>' });
    auth.mfa.enroll.mockResolvedValue({ data: { id: 'f10', totp: { qr_code: 'javascript:alert(1)', secret: 'S' } }, error: null });
    expect((await m.startTotpEnrollment()).qr).toBe('');
  });

  it('hides enrollment when TOTP is disabled for the project', async () => {
    auth.mfa.listFactors.mockResolvedValue({ data: { all: [] }, error: null });
    auth.mfa.enroll.mockResolvedValue({ data: null, error: { code: 'mfa_totp_enroll_not_enabled', message: 'disabled' } });
    expect(await m.startTotpEnrollment()).toMatchObject({ ok: false, kind: 'mfa_disabled' });
  });
});
