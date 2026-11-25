// Supabase Edge Function: invite-mentee
//
// One function, three actions (POST JSON body):
//   { "action": "invite", "menteeId": "<uuid>" }  send a portal invite (or link an existing account)
//   { "action": "resend", "menteeId": "<uuid>" }  re-send the invite / a magic link
//   { "action": "revoke", "menteeId": "<uuid>" }  unlink + ban the mentee login
// "action" defaults to "invite".
//
// Security model (docs/MENTEE_PORTAL_PLAN.md §2.2):
//   * verify_jwt = true (supabase/config.toml) + auth.getUser() here
//   * caller must have profiles.role mentor|admin (read live from the DB)
//   * ownership is proven by reading the mentee through a USER-SCOPED client,
//     so RLS decides: if the row comes back, the caller mentors it (or is admin)
//   * service-role client only for auth admin calls + writes to columns that
//     API users can't write (mentees.mentee_user_id / portal_access, invitations, profiles.role)
//   * rate limit: RATE_LIMIT_PER_HOUR invitations rows per caller per hour
//   * race guard: link only `where mentee_user_id is null`
//   * CORS allow-list; internal errors are logged, never echoed
//
// Env (SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected by Supabase):
//   ALLOWED_ORIGINS  optional, comma-separated (default: prod + localhost:5173 + localhost:8000)
//   SITE_URL         optional (default https://mentorship.andresaviles.com)

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.119.2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SITE_URL = (Deno.env.get('SITE_URL') ?? 'https://mentorship.andresaviles.com').replace(/\/+$/, '');
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ??
  'https://mentorship.andresaviles.com,http://localhost:5173,http://localhost:8000')
  .split(',').map((s) => s.trim()).filter(Boolean);
const RATE_LIMIT_PER_HOUR = 20;
const BAN_DURATION = '876000h'; // ~100 years
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Action = 'invite' | 'resend' | 'revoke';

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '600',
    'Vary': 'Origin',
  };
}

function json(status: number, body: unknown, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

function isEmailExistsError(err: { code?: string; status?: number; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === 'email_exists' || err.code === 'user_already_exists') return true;
  return /already (been )?registered|already exists/i.test(err.message ?? '');
}

async function rateLimit(admin: SupabaseClient, callerId: string) {
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count, error } = await admin
    .from('invitations')
    .select('id', { count: 'exact', head: true })
    .eq('invited_by', callerId)
    .gte('sent_at', since);
  if (error) throw error;
  if ((count ?? 0) >= RATE_LIMIT_PER_HOUR) {
    throw new HttpError(429, 'rate_limited', 'Too many invites in the last hour. Try again later.');
  }
}

// Make sure the auth user has a 'mentee' profile. Never demotes mentors/admins.
async function ensureMenteeProfile(admin: SupabaseClient, userId: string, email: string) {
  const { data: prof, error } = await admin.from('profiles').select('role').eq('id', userId).maybeSingle();
  if (error) throw error;
  if (!prof) {
    const { error: insErr } = await admin.from('profiles').insert({ id: userId, email, role: 'mentee' });
    if (insErr) throw insErr;
    return;
  }
  if (prof.role === 'mentee') return;
  if (prof.role !== 'pending') {
    throw new HttpError(409, 'staff_account', 'That email belongs to a mentor/admin account and cannot be linked as a mentee.');
  }
  const { error: upErr } = await admin.from('profiles').update({ role: 'mentee' }).eq('id', userId).eq('role', 'pending');
  if (upErr) throw upErr;
}

async function logInvitation(admin: SupabaseClient, row: Record<string, unknown>) {
  const { error } = await admin.from('invitations').insert(row);
  if (error) console.error('invitations insert failed', error);
}

async function handle(req: Request, origin: string | null): Promise<Response> {
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) throw new HttpError(401, 'unauthorized', 'Sign in required.');

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) throw new HttpError(401, 'unauthorized', 'Sign in required.');
  const caller = userData.user;

  const { data: callerProfile, error: profErr } = await admin
    .from('profiles').select('role').eq('id', caller.id).maybeSingle();
  if (profErr) throw profErr;
  if (!callerProfile || !['mentor', 'admin'].includes(callerProfile.role)) {
    throw new HttpError(403, 'forbidden', 'Only mentors can manage portal access.');
  }

  let body: { action?: string; menteeId?: string };
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, 'bad_request', 'Invalid JSON body.');
  }
  const action = (body.action ?? 'invite') as Action;
  if (!['invite', 'resend', 'revoke'].includes(action)) throw new HttpError(400, 'bad_request', 'Unknown action.');
  const menteeId = String(body.menteeId ?? '');
  if (!UUID_RE.test(menteeId)) throw new HttpError(400, 'bad_request', 'menteeId must be a UUID.');

  // Ownership via RLS: only returns the row if the caller mentors it (or is admin).
  const { data: mentee, error: menteeErr } = await userClient
    .from('mentees')
    .select('id, user_id, full_name, email, mentee_user_id, portal_access')
    .eq('id', menteeId)
    .maybeSingle();
  if (menteeErr) throw menteeErr;
  if (!mentee) throw new HttpError(404, 'not_found', 'Mentee not found.');

  const redirectTo = `${SITE_URL}/auth/confirm`;

  // ------------------------------------------------------------------ revoke
  if (action === 'revoke') {
    const linkedUserId: string | null = mentee.mentee_user_id;
    const { error: upErr } = await admin
      .from('mentees').update({ mentee_user_id: null, portal_access: 'revoked' }).eq('id', menteeId);
    if (upErr) throw upErr;
    await admin.from('invitations').update({ status: 'revoked' })
      .eq('mentee_id', menteeId).in('status', ['sent', 'accepted']);
    if (linkedUserId) {
      await admin.from('profiles').update({ role: 'pending' }).eq('id', linkedUserId).eq('role', 'mentee');
      const { error: banErr } = await admin.auth.admin.updateUserById(linkedUserId, { ban_duration: BAN_DURATION });
      if (banErr) console.error('ban failed', banErr);
    }
    await logInvitation(admin, {
      mentee_id: menteeId, invited_by: caller.id, email: (mentee.email ?? '').toLowerCase() || 'n/a',
      auth_user_id: linkedUserId, kind: 'revoke', status: 'revoked',
    });
    return json(200, { status: 'revoked', message: 'Portal access revoked.' }, origin);
  }

  const email = String(mentee.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'missing_email', 'Add a valid email to this mentee first.');

  await rateLimit(admin, caller.id);

  // ------------------------------------------------------------------ resend
  if (action === 'resend') {
    if (!mentee.mentee_user_id || !['invited', 'active'].includes(mentee.portal_access)) {
      throw new HttpError(409, 'not_invited', 'This mentee has no pending or active portal access. Use Invite.');
    }
    const { data: authUser, error: getErr } = await admin.auth.admin.getUserById(mentee.mentee_user_id);
    if (getErr || !authUser?.user) throw getErr ?? new Error('linked auth user missing');
    if ((authUser.user.email ?? '').toLowerCase() !== email) {
      throw new HttpError(409, 'email_changed',
        'The mentee email no longer matches the linked login. Revoke access and invite again.');
    }
    let kindSent = 'invite';
    let sendErr: unknown = null;
    if (!authUser.user.email_confirmed_at) {
      // Never accepted: re-send the invite email.
      const { error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
      sendErr = error;
    }
    if (authUser.user.email_confirmed_at || sendErr) {
      // Confirmed (or invite re-send refused): send a magic link instead.
      kindSent = 'magiclink';
      const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const { error } = await anon.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: redirectTo } });
      sendErr = error;
    }
    if (sendErr) {
      console.error('resend failed', sendErr);
      await logInvitation(admin, { mentee_id: menteeId, invited_by: caller.id, email, auth_user_id: mentee.mentee_user_id, kind: 'resend', status: 'failed', last_error: 'send_failed' });
      throw new HttpError(502, 'send_failed', 'Could not send the email. Check Auth SMTP settings and try again.');
    }
    await logInvitation(admin, { mentee_id: menteeId, invited_by: caller.id, email, auth_user_id: mentee.mentee_user_id, kind: 'resend', status: 'sent' });
    return json(200, {
      status: 'resent',
      message: kindSent === 'invite' ? 'Invite re-sent.' : 'Sign-in link sent.',
    }, origin);
  }

  // ------------------------------------------------------------------ invite
  if (mentee.mentee_user_id) {
    throw new HttpError(409, 'already_linked', 'This mentee already has a portal login. Use Resend or Revoke.');
  }

  let authUserId: string | null = null;
  let kind: 'invite' | 'existing_user_linked' = 'invite';

  const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { full_name: mentee.full_name },
  });

  if (inviteErr && isEmailExistsError(inviteErr)) {
    const { data: existingId, error: rpcErr } = await admin.rpc('auth_user_id_by_email', { p_email: email });
    if (rpcErr) throw rpcErr;
    if (!existingId) throw new Error('email_exists but no user found');
    authUserId = existingId as string;
    kind = 'existing_user_linked';
  } else if (inviteErr) {
    console.error('inviteUserByEmail failed', inviteErr);
    await logInvitation(admin, { mentee_id: menteeId, invited_by: caller.id, email, kind: 'invite', status: 'failed', last_error: inviteErr.code ?? 'invite_failed' });
    throw new HttpError(502, 'send_failed', 'Could not send the invite. Check Auth SMTP settings and try again.');
  } else {
    authUserId = invited?.user?.id ?? null;
  }
  if (!authUserId) throw new Error('no auth user id after invite');

  // Refuse if that login is already linked to a different mentee record.
  const { data: linkedElsewhere, error: leErr } = await admin
    .from('mentees').select('id').eq('mentee_user_id', authUserId).neq('id', menteeId).limit(1);
  if (leErr) throw leErr;
  if (linkedElsewhere && linkedElsewhere.length) {
    throw new HttpError(409, 'linked_elsewhere', 'That login is already linked to another mentee record.');
  }

  await ensureMenteeProfile(admin, authUserId, email);

  // Race guard: only link while still unlinked.
  const { data: linked, error: linkErr } = await admin
    .from('mentees')
    .update({ mentee_user_id: authUserId, portal_access: 'invited' })
    .eq('id', menteeId)
    .is('mentee_user_id', null)
    .select('id');
  if (linkErr) {
    if ((linkErr as { code?: string }).code === '23505') {
      throw new HttpError(409, 'linked_elsewhere', 'That login is already linked to another mentee record.');
    }
    throw linkErr;
  }
  if (!linked || !linked.length) {
    throw new HttpError(409, 'already_linked', 'This mentee was linked by someone else just now. Refresh.');
  }

  if (kind === 'existing_user_linked') {
    // A previously revoked login is banned; lift the ban when re-linking.
    const { error: unbanErr } = await admin.auth.admin.updateUserById(authUserId, { ban_duration: 'none' });
    if (unbanErr) console.error('unban failed', unbanErr);
  }

  await logInvitation(admin, { mentee_id: menteeId, invited_by: caller.id, email, auth_user_id: authUserId, kind, status: 'sent' });

  return json(200, {
    status: kind === 'invite' ? 'invited' : 'linked_existing',
    message: kind === 'invite'
      ? `Invite sent to ${email}.`
      : 'Existing account linked; they can sign in at /mentee with a magic link.',
  }, origin);
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin');
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return new Response('Origin not allowed', { status: 403 });
  }
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' }, origin);
  try {
    return await handle(req, origin);
  } catch (err) {
    if (err instanceof HttpError) return json(err.status, { error: err.code, message: err.message }, origin);
    console.error('invite-mentee internal error', err);
    return json(500, { error: 'internal', message: 'Something went wrong. Please try again.' }, origin);
  }
});
