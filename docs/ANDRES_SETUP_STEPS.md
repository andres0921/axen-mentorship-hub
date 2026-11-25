# Launch steps for the mentee portal (Andres)

Do these **in order**. Steps (a)–(d) can be done any time before launch. Steps (e)–(i)
happen together in one sitting on launch day, in the order shown.

Project: Supabase **agent-mentorship-hub** (ref `delfnadofjhlasxafvri`) · Site:
`https://mentorship.andresaviles.com` · DNS: Namecheap.

---

## (a) Resend: verify a sending domain

1. In Resend: **Domains → Add domain** → `mail.andresaviles.com` → pick a region
   (e.g. us-east-1).
2. Resend shows 3–4 DNS records. Add each one in **Namecheap → Domain List →
   andresaviles.com → Manage → Advanced DNS → Add new record**. They usually look
   like this (**copy the exact values Resend shows you**; the region and DKIM key
   differ per account):

   | Type | Host (Namecheap) | Value | Priority |
   |---|---|---|---|
   | MX | `send.mail` | `feedback-smtp.<region>.amazonses.com` | 10 |
   | TXT | `send.mail` | `v=spf1 include:amazonses.com ~all` | |
   | TXT | `resend._domainkey.mail` | `p=MIGfMA0…` (the long DKIM value) | |
   | TXT (recommended) | `_dmarc` | `v=DMARC1; p=none;` | |

   **Namecheap's Host field leaves out `andresaviles.com`.** Resend may show the
   name as `send.mail.andresaviles.com`. In Namecheap you type only `send.mail`,
   and Namecheap adds `.andresaviles.com` itself. If you paste the full name you get
   `send.mail.andresaviles.com.andresaviles.com`, which won't verify. TTL: Automatic.
   If a `_dmarc` record already exists for andresaviles.com, keep the existing one.
3. Back in Resend, click **Verify** and wait until the domain shows **Verified**.
   That usually takes minutes but can take up to a few hours.
4. **API Keys → Create API key**: permission **Sending access**, domain
   `mail.andresaviles.com`. Copy the key now (it's shown only once). Don't put it
   in the repo, in chat, or in Vercel. It goes only into Supabase in step (b).

## (b) Supabase: custom SMTP

Dashboard → **Authentication → Emails → SMTP Settings** (older dashboards: Project
Settings → Authentication → SMTP) → **Enable custom SMTP**:

| Field | Value |
|---|---|
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | the Resend API key from (a) |
| Sender email | `mentorship@mail.andresaviles.com` |
| Sender name | `AXEN Mentorship Hub` |

Save. Then go to **Authentication → Rate Limits** and raise **"Rate limit for sending
emails"** from the default (2–4 per hour) to something like `60` per hour. You can
only change it once custom SMTP is on.

## (c) Supabase: URL configuration

**Authentication → URL Configuration**:
- **Site URL:** already set to `https://mentorship.andresaviles.com` (done, nothing to change).
- **Redirect URLs:** add both
  - `https://mentorship.andresaviles.com/**`
  - `http://localhost:5173/**` (local dev with `npm run dev`)

Don't add a blanket `*.vercel.app` wildcard.

## (d) Supabase: email templates

**Authentication → Emails → Templates.** The links must point at our `/auth/confirm`
page with `token_hash`, **not** `{{ .ConfirmationURL }}`. The confirm page waits for a
**Continue** click before using the token, so corporate link scanners can't burn it.
The page accepts `type` = `invite`, `magiclink`, `email`, `signup`, `email_change`.
`recovery` (password reset) is deliberately not accepted.

After sign-in the page sends people to the app for their **role**. `next` is used
only if it's a relative path inside that role's app. A mentor who uses a magic link
with `next=/mentee/` still lands on `/`.

**Invite user**, subject `You're invited to the AXEN Mentorship portal`:
```html
<h2>Welcome to AXEN Mentorship</h2>
<p>Your mentor has invited you to the AXEN Mentorship portal, where you can see your progress, submit weekly check-ins and ask your mentor for help.</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/mentee/">Open my mentorship portal</a></p>
<p>Or type this 6-digit code in the app:</p>
<p style="font-size:32px;font-weight:700;letter-spacing:8px;font-family:monospace">{{ .Token }}</p>
<p>On the page that opens, tap <strong>Continue</strong>. This link works once and expires in 24 hours. If it has expired, go to {{ .SiteURL }}/mentee/ and request a new sign-in link.</p>
<p>If you weren't expecting this, you can ignore this email.</p>
```

**Magic Link**, subject `Your AXEN Mentorship sign-in link`:
```html
<h2>Sign in to AXEN Mentorship</h2>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink&next=/mentee/">Sign in</a></p>
<p>Or type this 6-digit sign-in code in the app:</p>
<p style="font-size:32px;font-weight:700;letter-spacing:8px;font-family:monospace">{{ .Token }}</p>
<p>On the page that opens, tap <strong>Continue</strong>. This link works once and expires in 1 hour.</p>
<p>If you didn't ask to sign in, you can ignore this email.</p>
```

**Confirm signup**, subject `Confirm your AXEN Mentorship sign-in`. Public sign-ups are
off, but Supabase uses this template when an invited mentee who never clicked the
invite asks for a sign-in link, so set it too:
```html
<h2>Sign in to AXEN Mentorship</h2>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/mentee/">Confirm and sign in</a></p>
<p>Or type this 6-digit sign-in code in the app:</p>
<p style="font-size:32px;font-weight:700;letter-spacing:8px;font-family:monospace">{{ .Token }}</p>
<p>On the page that opens, tap <strong>Continue</strong>.</p>
```

**Change Email Address** (optional):
```html
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change">Confirm your new email address</a></p>
```

Optional, under **Authentication → Providers → Email**: set **Email OTP Expiration**
to `3600` (1 hour). Leave **Email OTP Length** at `6` (the app's code box expects 6 digits).

The `{{ .Token }}` block is the 6-digit code for in-app sign-in (see "Easier sign-in"
below). Keep the `token_hash` Continue links exactly as they are; both work from the same email.

---

## Launch day: do (e) → (i) in one sitting

### (e) Turn OFF public sign-ups (after the migrations, in the same sitting)
**Authentication → Sign In / Providers → "Allow new users to sign up" → OFF.**

Do this right after step (f). Migration 0001 marks every account that exists
*at that moment* as a mentor, so a stranger who signs up before it runs would become
a mentor. If you prefer, turn sign-ups off *before* (f). That's safe too and closes
the gap completely. Invites and magic links for existing accounts keep working with
sign-ups off.

### (f) Apply the database migrations (right before merging)
Follow `supabase/migrations/README.md`:
1. **Database → Backups**: confirm there's a recent backup, or take one.
2. SQL Editor: run `0001` → `0002` → `0003` → `0004`, one file at a time, in order.

From step 2 until (i) finishes deploying, the **old** app can't save notes, check-ins
or feedback, because 0003 removed those columns. Keep this window short.

### (g) Make yourself admin
In the SQL Editor:
```sql
update public.profiles
   set role = 'admin'
 where id = (select id from auth.users where lower(email) = lower('andres.e.aviles94@gmail.com'));

select p.email, p.role from public.profiles p
  join auth.users u on u.id = p.id
 where lower(u.email) = lower('andres.e.aviles94@gmail.com');   -- expect: admin
```

### (h) Deploy the Edge Function
From the repo on your machine (Supabase CLI installed and `supabase login` done):
```bash
supabase functions deploy invite-mentee --project-ref delfnadofjhlasxafvri
```
`supabase/config.toml` sets `verify_jwt = true` for this function, so requests
without a signed-in user are rejected before the code runs.

Environment variables the function reads (`supabase/functions/invite-mentee/index.ts`):

| Variable | Needed? | Notes |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | injected automatically | don't set them yourself |
| `SITE_URL` | optional | default `https://mentorship.andresaviles.com` (used as the invite `redirectTo`) |
| `ALLOWED_ORIGINS` | optional | comma-separated CORS allow-list. Default: `https://mentorship.andresaviles.com,http://localhost:5173,http://localhost:8000`. Vercel preview URLs are **not** allowed unless you add them |

To set an optional one: `supabase secrets set ALLOWED_ORIGINS=... --project-ref delfnadofjhlasxafvri`.
The service-role key stays in Supabase and never goes in Vercel or the repo.

### (i) Merge the PR
Merge `feat/mentee-portal` into `main`. Vercel builds using `vercel.json`
(`npm ci` → `npm run build` → serves `dist/`, with security headers). There are no
Vercel environment variables to set, because the public Supabase URL and anon key
are in `src/shared/config.js`. Wait for the deployment to show **Ready**.

---

## (j) Smoke test (about 15 minutes)

Use a test address you control, e.g. a Gmail alias `andres.e.aviles94+mentee1@gmail.com`.

1. **Mentor app:** open `https://mentorship.andresaviles.com/` and sign in with your
   password. The sidebar shows the **Admin** section (All Mentees, Graduations).
   Existing mentees and history load. Existing private notes show under the
   "Mentor-only" badges.
2. **Headers:** in the browser console there should be no CSP errors.
   (`curl -sI https://mentorship.andresaviles.com/ | grep -i content-security` shows the policy.)
3. **Invite:** add a test mentee with the alias email → open them → **Portal access →
   Invite**. You should see "Invite sent to …". The email arrives from
   `mentorship@mail.andresaviles.com` (check spam the first time).
4. **Accept:** open the email on your phone → **Continue** → you land on `/mentee/` →
   the Welcome screen → confirm phone → **Get started** → Home. Back in the mentor
   app, the portal card shows **Active**.
5. **Sharing:** new check-ins default to **shared**. Existing ones are hidden until
   you click **Share all past check-ins** (or toggle one). The mentee sees the three
   1–5 scores, direction and commitments, but never mentor-only notes or the
   feedback overall rating.
6. **Self check-in:** as the mentee, submit this week's check-in and edit it once.
   As the mentor, it appears on the mentee page. Click **Mark reviewed**, and the
   mentee can no longer edit it.
7. **Help:** as the mentee, send a help request. As the mentor, respond / resolve,
   and the mentee sees the response and status.
8. **Graduation:** submit a graduation recommendation as a mentor. The mentee does
   **not** become graduated. It shows under **Admin → Graduations**. Approve it, and
   the mentee status becomes Graduated. (Decline leaves the status as it was.)
9. **Magic link:** sign out of the portal → enter the alias email on `/mentee/` → a
   new link arrives → Continue → Home.
10. **Role routing:** while signed in as the mentee, open `/`, and you're sent to
    `/mentee/`. Signed in as yourself, opening `/mentee/` sends you to `/`.
11. **Revoke:** mentor → **Revoke**. Database access is cut immediately. On the
    mentee's next page load the portal shows "not set up", and they can't sign in
    again until re-invited.
12. **Sign-ups off:** on `/mentee/`, request a link for an address that has no
    account. You get the same neutral message and **no** email arrives.

Clean up: delete the test mentee (and the test auth user under Authentication → Users).

## Easier sign-in (email code, passkeys, Google, authenticator app)

The app now offers, on both `/` (mentors) and `/mentee/` (mentees):

1. **Email me a sign-in code** (the main path): type the email, get a 6-digit code, type it in the app.
2. **Face ID or passkey** (after someone adds a passkey from Profile / Account).
3. **Continue with Google** (only for people who are already invited).
4. **Use a password** (mentor app only; mentees never use passwords).
5. Optional for admins: **two-step verification** with an authenticator app.

Everything below is a **live production setting**. The code works safely before any
of it is done: each option stays hidden or falls back to email until you switch it on.
Sign-ups stay off throughout; none of these can create a new account.

### 1. Email templates: add the 6-digit code (needed for in-app codes)

**Authentication → Emails → Templates.** Paste the updated **Invite user**, **Magic Link**
and **Confirm signup** templates from section (d) above. Each keeps the existing
`/auth/confirm?token_hash=…` Continue link and adds a large `{{ .Token }}` code.

- Code path: `sendEmailOtp` / `verifyEmailOtp` in `src/shared/auth-methods.js`
  (`verifyOtp({ email, token, type: 'email' })`).
- **Until you do this:** emails only contain the link. The link still works. If someone
  types a code anyway, the app says the code didn't work and tells them to tap the
  sign-in button in the email.
- Codes are rate-limited to one email per address per 60 seconds; the app shows a
  60-second "Resend code" countdown.

### 2. Passkeys / Face ID / Touch ID

**Authentication → Passkeys** (it may be under **Sign In / Providers** depending on the
dashboard version) → **Enable**, with:

| Field | Value |
|---|---|
| Display name | `AXEN Mentorship Hub` |
| Relying Party ID (RP ID) | `andresaviles.com` |
| Allowed origins | `https://mentorship.andresaviles.com` and `http://localhost:5173` |

- Pick the RP ID once. **Changing it later breaks every passkey already created.**
  `andresaviles.com` lets passkeys work on any subdomain you add later.
- Passkeys do **not** work on Vercel preview URLs (`*.vercel.app` isn't under
  `andresaviles.com`). That's expected; test on the real domain or localhost.
- People add a passkey after signing in: mentors in **Profile → Sign-in & security**,
  mentees in **Account**. They need an existing confirmed account (invited users already have one).
- Code path: `signInWithPasskeySafe`, `registerPasskeySafe`, `listPasskeys`,
  `deletePasskey` in `src/shared/auth-methods.js`; passkey autofill on the email field
  (`autocomplete="username webauthn"`).
- **Until you do this:** the passkey button disappears the first time Supabase says
  passkeys are off (rechecked twice a day), and Profile/Account say "Passkeys aren't
  turned on yet."

### 3. Sign in with Google (invited users only)

a. **Google Cloud Console** → APIs & Services → **OAuth consent screen**: app name
   `AXEN Mentorship Hub`, user type **External**, publish it (scopes: the default
   `email`, `profile`, `openid` only).
b. **Credentials → Create credentials → OAuth client ID → Web application**:
   - Authorized JavaScript origins: `https://mentorship.andresaviles.com`
   - Authorized redirect URI: `https://delfnadofjhlasxafvri.supabase.co/auth/v1/callback`
c. **Supabase → Authentication → Sign In / Providers → Google** → enable, paste the
   **Client ID** and **Client secret**.
   - Leave **"Allow new users to sign up"** **OFF** (also check the global sign-up
     setting is still off from step (e)).
   - Leave **"Skip nonce checks"** **off**.
d. **URL Configuration:** nothing new. The existing `https://mentorship.andresaviles.com/**`
   redirect pattern already covers `/` and `/mentee/`.

- A Google account whose email matches an invited user signs in to that same account.
  Any other Google account gets: "This Google account hasn't been invited yet."
- Code path: `signInWithGoogle` (top-level redirect, `prompt=select_account`), and
  `fetchAuthSettings` reads `GET /auth/v1/settings` to decide whether to show the button.
- **Until you do this:** the "Continue with Google" button is hidden.
- **Caveat for you specifically:** your YouTube block has broken Google sign-in before,
  because Google's flow can pass through `accounts.youtube.com`. If it fails on your
  devices it may still work for everyone else; use the email code yourself.

### 4. Authenticator app (two-step) for admins

- **Authentication → Multi-Factor**: leave **TOTP (App Authenticator)** **enabled** (the
  default). Nothing to change unless someone turned it off.
- To turn it on for yourself: sign in → **Profile** → **Two-step verification** → **Set up
  authenticator app** → scan the QR (or type the key) → enter the 6-digit code → **Turn on**.
  From then on, after any sign-in method you'll be asked for the authenticator code
  before the app loads. Turn it off from the same place (asks to confirm).
- Only admins see the setup. Mentors and mentees without it are never asked.
- Code path: `mfaGateStatus`, `verifyTotp`, `startTotpEnrollment`, `removeTotp`.
- **If TOTP is disabled in the dashboard:** the setup section hides itself and sign-in
  is never blocked.
- Note: this is a sign-in step in the app. The database policies don't require it
  (`aal2`), so it protects against a stolen password/email, not a stolen session.

### Smoke test after switching things on (10 minutes, on https://mentorship.andresaviles.com)

1. `/` → type your email → **Email me a sign-in code** → the email has both the button and a
   6-digit code → typing the code signs you in.
2. Request a code for an email with no account: same "if it has an account…" screen, no email arrives.
3. Profile → **Add a passkey** → sign out → **Face ID or passkey** signs you in.
4. Sign out → **Continue with Google** with an invited Google account works; with a
   different Google account you see "hasn't been invited yet" and no user is created
   (check Authentication → Users).
5. Profile → set up the authenticator app → sign out and back in → you're asked for the code.
6. `/mentee/` with a test mentee: code sign-in works; Account shows the passkey section.

## Still to confirm
- **Program numbers:** confirmed: 4 closed transactions to graduate, no per-stage
  deal targets. To change it later, see "Program numbers" in
  `supabase/migrations/README.md` (one DB row plus `src/shared/config.js`).
