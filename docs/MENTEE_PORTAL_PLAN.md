# Mentee Portal: Plan

Status: **plan only**. Nothing in this document has been built or applied to Supabase.
Scope: add a mentee-facing portal (and an admin view for Andres) to the AXEN Mentorship Hub
(`mentorship.andresaviles.com`, a static site on Vercel backed by the `agent-mentorship-hub` Supabase project).

---

## 1. Current state (from the code)

### 1.1 App shape
| Piece | Facts |
|---|---|
| `index.html` (115 lines) | One page. Auth overlay with email+password and a **public "Sign up" toggle** (`index.html:45`). Fixed `w-64` sidebar plus `ml-64` main (`index.html:51`, `:93`), which is **not mobile-responsive**. Tailwind comes from the **Play CDN** (`cdn.tailwindcss.com`, `index.html:11`). The Play CDN is not meant for production. supabase-js loads from jsDelivr with an **unpinned `@2`** (`index.html:28`). |
| `js/app.js` (1,468 lines) | One global script with no modules and no build step. A global `state` object, `render()` switching on `state.currentView` (`app.js:460-476`). There is no URL routing, so the back button and deep links don't work. Views are HTML template strings set via `innerHTML`, with `esc()` for escaping (`app.js:29`). 13 inline `onclick="…"` handlers depend on globals (`openMentee`, `filterMentees`, `retryLoad`, `exportMenteePdf`, `state`). |
| Data loading | `loadFromSupabase()` (`app.js:70-130`) runs `select('*')` on **all six tables** and re-fetches everything after every save. |
| Writes | Insert-only for check-ins, feedback, kickoffs, escalations and graduations (`app.js:158-256`). Only mentees can be updated (`saveMentee`, `app.js:134`). |
| Side effects | A flagged check-in sets the mentee to `escalated` (`app.js:1003`). Submitting an escalation sets `escalated` (`app.js:1109`). **Submitting a graduation recommendation immediately sets `graduated`** (`app.js:1194`), with no approval step. |
| Export | "Export Data" dumps the whole `state` object, including the `user` object (`app.js:1438`). |
| `supabase/schema.sql` (290 lines) | Six tables. RLS on every table with own-row policies (`user_id = auth.uid()`). Child-table INSERT/UPDATE also require the referenced mentee to belong to the caller (`schema.sql:215-263`). Explicit grants go to `authenticated` and `service_role`, and `anon` is revoked (`:272-290`). |

### 1.2 Tables and columns
- **mentees**: `id, user_id (mentor), full_name, email, phone, program_start_date, current_stage (1–4), status (active|paused|escalated|graduated|dropped), notes, created_at, updated_at`
- **check_ins**: `id, user_id, mentee_id, check_in_number, date, stage_at_time, meeting_format, lead_generation_activity (1–5), light_speed_vt_progress (1–5), lofty_crm_usage (1–5), transactions_in_pipeline, total_closed, general_assessment_notes, specific_direction_given, prior_commitment_status (yes|partial|not), verification_notes, topics_discussed, key_coaching_points, student_commitment, commitment_due_date, escalation_flag, escalation_notes, next_check_in_date, next_check_in_format, created_at, updated_at`
- **escalations**: `id, user_id, mentee_id, date_of_submission, student_program_stage, escalation_type, situation_summary, actions_already_taken text[], recommended_next_step, additional_context, status (free text, default 'submitted'), created_at`
- **graduation_recommendations**: `id, user_id, mentee_id, date_of_submission, program_start_date, closed_transactions_confirmed, light_speed_vt_completed, nexa_lending_connected, lofty_crm_proficient, mentor_recommends, closed_transactions jsonb, mentor_recommendation_statement, status (free text), created_at`
- **mentor_feedback**: `id, user_id, mentee_id, date, feedback_type, strengths, areas_for_improvement, specific_observations, recommended_actions, overall_rating (1–5), private_notes, created_at`
- **kickoff_sessions**: `id, user_id, mentee_id, date_time, meeting_link, student_why_notes, expectations_notes, systems_activated text[], agreed_check_in_cadence, initial_commitment, next_check_in_date, created_at`

Only `mentees` and `check_ins` have `updated_at` triggers. The other four tables are append-only in practice.

### 1.3 What is mentor-private today
RLS works on rows, not columns. Once a mentee can SELECT a row, every column in it is readable through the REST API, whatever the UI chooses to show. Classification:

| Table | Shareable with the mentee | **Mentor-private** | Open question |
|---|---|---|---|
| mentees | full_name, email, phone, program_start_date, current_stage | **notes** | `status` (does the mentee see `escalated`?) |
| check_ins | date, number, format, stage_at_time, pipeline/closed counts, specific_direction_given, prior_commitment_status, topics_discussed, key_coaching_points, student_commitment, commitment_due_date, next_check_in_* | **general_assessment_notes, verification_notes, escalation_flag, escalation_notes** | the three 1–5 scores |
| escalations | none | **the whole table** (mentor → National Director; types include `mental_health`, `financial_crisis`) | |
| graduation_recommendations | derived progress only | **the whole table** (statement, checklist, SkySlope numbers) | |
| mentor_feedback | strengths, areas_for_improvement, specific_observations, recommended_actions (when the mentor shares) | **private_notes** (the UI already labels it "mentor only", `app.js:1261`) | overall_rating |
| kickoff_sessions | all columns (the "why" notes are the mentee's own words) | | |

### 1.4 Inconsistencies to fix before mentees see numbers
- `stageTarget()` (`app.js:585`) shows targets of **2/4/8/12 closed** for stages 1–4. `buildReadiness()` (`app.js:788`) and the graduation form require **4 closed**. A mentee seeing "Target 12 closed" next to "4 required to graduate" will be confused. Andres needs to define which numbers are real.
- `buildReadiness()` hard-codes "Nexa Connected" as `done: false` (`app.js:791`).
- The escalation form says "Submit to National Director" (`app.js:1033`), but nobody receives it because no admin view exists.
- The escalation, graduation and kickoff forms ignore `prefillMenteeId` and call `menteeOptionsHtml(null)`.
- **Self sign-up is open.** Today any stranger can create an account and gets an empty "mentor" workspace, because `mentees_insert_own` only checks `user_id = auth.uid()`. That is harmless now but must be closed before roles exist.

---

## 2. Roles and auth

### 2.1 Roles
A `profiles` row per auth user, with `role ∈ {pending, mentee, mentor, admin}`.
- **pending**: the default for any new auth user. Has zero data access.
- **mentee**: linked to exactly one `mentees` row through `mentees.mentee_user_id`.
- **mentor**: owns `mentees` rows through `mentees.user_id`, as today.
- **admin** (Andres / National Director): reads everything, manages escalations, graduation approvals and mentor invites, and can reassign mentees.

Rules:
- **Role is never taken from `user_metadata`.** Users can rewrite their own metadata with `auth.updateUser({ data })`. Only the service role (Edge Function) or SQL editor writes `profiles.role`, and column-level grants enforce this (§5.3).
- Helpers read the role from the database on every request rather than from a JWT claim. Revoking access or changing a role therefore takes effect **immediately**, not when the JWT expires (up to 1 hour). A custom-access-token hook can come later as a performance optimisation.
- One role per user. A person who is both a mentor and a mentee is not supported in the MVP.

Backfill: existing auth users become `mentor`. Andres's account is set to `admin` by hand in the SQL editor.

### 2.2 Linking a mentee login to a `mentees` row
**Recommended: Edge Function invite with server-side linking.**

1. The mentor clicks **Invite to portal** on the mentee detail page. The mentee's `email` must be set.
2. The browser calls the Supabase Edge Function `invite-mentee` with `{ menteeId }` and the mentor's JWT.
3. The function:
   - Verifies the JWT (`verify_jwt = true`, plus `auth.getUser()`).
   - Reads the mentee **through a user-scoped client**, so RLS itself proves ownership. If the row comes back, the caller owns it (or is admin). It also checks that the caller's role is mentor or admin.
   - Normalises the email (`trim().toLowerCase()`) and rejects the request if the mentee is already linked to a different user.
   - Rate-limits to about 20 invites per mentor per hour by counting `invitations` rows.
   - Uses a service-role client to call `auth.admin.inviteUserByEmail(email, { redirectTo: 'https://mentorship.andresaviles.com/auth/confirm' })`.
   - If the address already has an account (the "already registered" / `email_exists` error), it looks up the id with a service-role-only SQL function. It refuses if that user is a mentor or admin or is linked elsewhere. Otherwise it links the account and tells the mentor: "Existing account linked; they can sign in at /mentee with a magic link."
   - Upserts `profiles(id, role='mentee')`, but only if the current role is `pending` or `mentee`.
   - Sets `mentees.mentee_user_id = <auth user id>, portal_access = 'invited'` with `… is('mentee_user_id', null)` as a race guard.
   - Inserts an `invitations` audit row.
4. The mentee clicks the email link, lands on `/auth/confirm`, clicks **Continue**, and the client calls `verifyOtp({ token_hash, type: 'invite' })`. They are then redirected to `/mentee/`. On first load the portal calls `accept_invitation()`, which flips `portal_access` to `active` and stamps `invitations.accepted_at`.

Companion functions in the MVP:
- `resend-invite`: the same checks, re-sent as an invite or magic link.
- `revoke-mentee-access`: sets `mentees.mentee_user_id = null`, `portal_access='revoked'`, `invitations.status='revoked'`, and bans the auth user with `auth.admin.updateUserById(id, { ban_duration: '876000h' })`. Data access is cut instantly because the helpers read `mentee_user_id` live.

**Alternatives considered (rejected):**
- *Client-side `signInWithOtp` plus a `claim_invitation(token)` RPC.* This works without an Edge Function. But it requires **public sign-ups to stay enabled** (`shouldCreateUser: true`), so anyone can create `pending` accounts and trigger OTP emails to arbitrary addresses. It also breaks cross-device if the client ever switches to the PKCE flow, because the code verifier lives in the *mentor's* browser. Keep it only as a fallback if Edge Functions are ruled out.
- *Auto-link by matching the auth email to `mentees.email`.* `mentees.email` is free text typed by mentors and is not unique across mentors. A typo, or a mentor entering someone else's address, would grant access to the wrong person. Rejected.

### 2.3 Auth settings (Supabase dashboard; Andres applies these, the plan doesn't)
- **Disable "Allow new users to sign up".** The admin invite API still works with sign-ups disabled. Remove the sign-up toggle from `index.html:45` / `app.js:329`. New mentors are invited by admin (Phase 3). Until then they are created by hand.
- Mentees sign in **by magic link only** (see Decision 5). Mentors keep their passwords and can also get a "Email me a link" option.
- Site URL: `https://mentorship.andresaviles.com`. Redirect allow-list: `https://mentorship.andresaviles.com/**` and `http://localhost:8000/**` (dev). Avoid a blanket `*.vercel.app` wildcard; if previews need auth, add the team-scoped pattern only.
- Expiry: invite link 24 h, magic link/OTP 1 h.
- **Email templates use `token_hash`, not `{{ .ConfirmationURL }}`**, for example:
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/mentee/`
  The confirm page requires a button click before calling `verifyOtp`. Corporate link scanners that pre-fetch URLs (common at brokerages using M365 or Google security) would otherwise consume the one-time token. This design also avoids PKCE/implicit-flow issues with server-initiated invites.

### 2.4 Email sending (Resend)
- Supabase's built-in email service is for testing only. It is heavily rate-limited and only delivers to the project's team members, so **custom SMTP is required** before any mentee can be invited.
- Resend setup:
  1. Verify a sending domain in Resend, e.g. `mail.andresaviles.com`, by adding the SPF, DKIM and (recommended) DMARC records in DNS.
  2. Create a **sending-only** API key restricted to that domain.
  3. Supabase → Auth → SMTP: host `smtp.resend.com`, port `465`, user `resend`, password = API key, sender `AXEN Mentorship Hub <mentorship@mail.andresaviles.com>`.
  4. Raise the Auth email rate limit (Auth → Rate Limits) from its low default.
  5. Brand the **Invite**, **Magic Link** and **Change Email** templates.
- **Transactional notifications** (new message, help request, self check-in submitted) do **not** go through Auth SMTP. A Database Webhook on insert calls the Edge Function `notify`, which uses the Resend HTTP API with a `RESEND_API_KEY` function secret (Phase 2).

---

## 3. Mentee experience

Mobile-first, because agents will mostly use phones: bottom tab bar (Home, Check-in, Messages, Resources, More) and a single-column layout. Served at `/mentee/`.

| # | Screen | What the mentee sees | Actions |
|---|---|---|---|
| 1 | **Sign in** (`/mentee/`) and `/auth/confirm` | Email field → "Check your email"; Continue button on confirm | Request a magic link |
| 2 | **Welcome** (first run) | Mentor name/photo/contact (`get_my_mentor()`), program overview of stages 1–4 and the graduation requirements | Confirm phone; accept → `accept_invitation()` |
| 3 | **Home / dashboard** | Stage badge ("Stage 2 of 4"), days in program; **graduation progress** (4 closed, LightSpeed VT, Lofty proficiency, Nexa connected, mentor recommendation) from `get_my_graduation_progress()`; next check-in (date, format/link from the latest check-in's `next_check_in_*`, falling back to the kickoff's `next_check_in_date` and `agreed_check_in_cadence`); **current commitment** and due date (latest shared `student_commitment`); open goals; latest shared feedback; unread message count | "Submit this week's check-in" CTA if none this week; quick "Ask for help" |
| 4 | **Weekly self check-in** | Form: self-scores 1–5 for lead gen / VT / Lofty, conversations and appointments, pipeline and closed counts, "Did you complete last commitment?" (yes/partial/not + note), wins, blockers, "I need help" toggle. History list with a "Reviewed by mentor" badge | Create one per week; **edit until the mentor marks it reviewed** |
| 5 | **Goals** | Goals list with progress bars (mentor-created and self-created) | Add a goal; update progress/status; delete own goals only |
| 6 | **Sessions** | Kickoff summary (systems activated, cadence, initial commitment, "my why"); shared check-in history (shared fields only, never the private ones); score trend chart if Decision 3 allows; past commitments with the mentor-verified status (`prior_commitment_status`) | Read-only in the MVP; Phase 4 adds request/reschedule |
| 7 | **Feedback** | `mentor_feedback` rows where `shared_with_mentee = true`: strengths, areas for improvement, observations, recommended actions | Acknowledge ("Got it"); reply goes to Messages |
| 8 | **Messages** | One thread with the mentor (realtime), with a note that it is visible to the program admin | Send; mark read |
| 9 | **Resources** | Program-wide plus mentor-specific links, grouped by category and stage (Lofty CRM, LightSpeed VT, Nexa Lending, SkySlope, scripts, compliance) | Open link |
| 10 | **Get help** | Form: category (transaction question, compliance/legal, systems access, personal/wellbeing, other), urgency (normal/urgent), message. List of my requests with status and mentor response. For "personal/wellbeing", static text: "Your mentor will reach out. If you're in crisis, call or text 988." | Submit; cancel while still open |
| 11 | **Account** | Name, email, phone, mentor | Update phone; sign out |

What a mentee can never do: change their stage or status, see escalations or graduation recommendations, see private notes or other mentees, or export data.

---

## 4. Mentor-side changes

1. **Portal access card** on the mentee detail page: status (`none / invited / active / revoked`), last invite sent, accepted date. Buttons: Invite / Resend / Revoke. Invite requires an email.
2. **Check-in form** (`renderCheckInForm`, `app.js:850`): visually group the private fields under a "Mentor-only" badge (assessment notes, verification, escalation). Add a **"Share this check-in with mentee"** toggle. Show the mentee's self check-in for that week beside the form and offer "Prefill from self check-in" (scores, pipeline/closed, commitment status). `saveCheckIn` now writes `check_ins` plus `check_in_private`.
3. **Feedback form** (`renderFeedbackForm`, `app.js:1202`): add a **Share with mentee** toggle. `private_notes` goes to `mentor_feedback_private`.
4. **Needs-attention inbox** (dashboard section and sidebar badge): unread messages, open help requests (urgent first), self check-ins awaiting review.
5. **Help request → "Convert to escalation"**: prefills the escalation form. This needs the `prefillMenteeId` fix from §1.4 and links back through `help_requests.escalation_id`.
6. **Goals** panel on the mentee detail page (create/edit). **Resources** manager for the mentor's own links.
7. **Loading**: add the new tables to `loadFromSupabase()`. Load messages lazily per mentee. Realtime subscription on `messages`, `help_requests` and `self_check_ins`.
8. **Graduation flow**: stop setting `graduated` on submission (`app.js:1194`). The recommendation becomes `status='submitted'`, and admin approval sets the mentee to `graduated` (Phase 3). Until then, keep the current behaviour.
9. **Export**: include the private side tables (mentor only). Stop exporting the `user` object.
10. **Auth UI**: remove the public sign-up toggle. Route by role after login (§6).
11. **Admin (Andres)**, in the mentor app behind `role = admin`: a mentor filter/switcher and an "All mentees" table with a mentor column; an **escalation queue** (`submitted → acknowledged → resolved`, with an admin note); **graduation approvals**; mentor invites; reassigning a mentee to another mentor.

---

## 5. Data model and RLS

All changes ship as **new migration files** (e.g. `supabase/migrations/20261201_01_roles.sql`, …), not edits to `schema.sql`. As `schema.sql:6-8` notes, `create table if not exists` will not alter existing tables. `schema.sql` can be regenerated as a snapshot afterwards.

### 5.1 Helper functions (`private` schema, `SECURITY DEFINER`)
They are `SECURITY DEFINER` so that policies on `mentees` can call them without recursive RLS. They live in a schema that is **not exposed** through the Data API, so they can't be called as `/rpc`.

```sql
create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.user_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = (select auth.uid())
$$;

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select role = 'admin' from public.profiles where id = (select auth.uid())), false)
$$;

create or replace function private.is_mentor() returns boolean   -- mentors and admin
language sql stable security definer set search_path = '' as $$
  select coalesce((select role in ('mentor','admin') from public.profiles where id = (select auth.uid())), false)
$$;

create or replace function private.my_mentee_id() returns uuid    -- null unless caller is a linked mentee
language sql stable security definer set search_path = '' as $$
  select m.id from public.mentees m
  join public.profiles p on p.id = m.mentee_user_id and p.role = 'mentee'
  where m.mentee_user_id = (select auth.uid())
$$;

create or replace function private.my_mentor_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select user_id from public.mentees where id = private.my_mentee_id()
$$;

create or replace function private.mentored_mentee_ids() returns setof uuid   -- mentees the caller mentors
language sql stable security definer set search_path = '' as $$
  select id from public.mentees
  where user_id = (select auth.uid()) and private.is_mentor()
$$;

create or replace function private.accessible_mentee_ids() returns setof uuid -- mentor's, own (mentee), or all (admin)
language sql stable security definer set search_path = '' as $$
  select id from public.mentees
  where (user_id = (select auth.uid()) and private.is_mentor())
     or mentee_user_id = (select auth.uid()) and private.user_role() = 'mentee'
     or private.is_admin()
$$;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;
```

Policies use `mentee_id in (select private.accessible_mentee_ids())` and `mentee_id = (select private.my_mentee_id())`. The `(select …)` wrapper lets Postgres evaluate each function once per statement instead of once per row.

### 5.2 New / changed tables

```sql
-- profiles -----------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        text not null default 'pending' check (role in ('pending','mentee','mentor','admin')),
  full_name   text,
  email       text,
  phone       text,
  booking_url text,          -- mentor's Calendly etc.
  photo_url   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- trigger on auth.users insert → insert into profiles (id, email) values (new.id, lower(new.email))
--   (security definer, search_path = '', on conflict do nothing). Role stays 'pending'.
-- backfill: insert into profiles (id, email, role) select id, lower(email), 'mentor' from auth.users;
--           update profiles set role = 'admin' where email = '<andres's login email>';

-- mentees: link + portal state ---------------------------------------------
alter table public.mentees
  add column mentee_user_id uuid unique references auth.users (id) on delete set null,
  add column portal_access  text not null default 'none'
    check (portal_access in ('none','invited','active','revoked'));

-- invitations (audit; written only by Edge Functions) ------------------------
create table public.invitations (
  id            uuid primary key default gen_random_uuid(),
  mentee_id     uuid not null references public.mentees (id) on delete cascade,
  invited_by    uuid not null references auth.users (id),
  email         text not null,
  auth_user_id  uuid references auth.users (id) on delete set null,
  kind          text not null default 'invite' check (kind in ('invite','resend','existing_user_linked')),
  status        text not null default 'sent' check (status in ('sent','accepted','revoked','failed')),
  last_error    text,
  sent_at       timestamptz not null default now(),
  accepted_at   timestamptz
);

-- private side tables (mentor/admin only) ----------------------------------
create table public.mentee_private_notes (
  mentee_id  uuid primary key references public.mentees (id) on delete cascade,
  notes      text,
  updated_at timestamptz not null default now()
);

alter table public.check_ins add constraint check_ins_id_mentee_uniq unique (id, mentee_id);
create table public.check_in_private (
  check_in_id              uuid primary key,
  mentee_id                uuid not null,
  general_assessment_notes text,
  verification_notes       text,
  escalation_flag          boolean not null default false,
  escalation_notes         text,
  updated_at               timestamptz not null default now(),
  foreign key (check_in_id, mentee_id) references public.check_ins (id, mentee_id) on delete cascade
);   -- composite FK keeps the denormalised mentee_id honest for RLS

alter table public.check_ins
  add column shared_with_mentee boolean not null default true;   -- see Decision 3 for backfill

create table public.mentor_feedback_private (
  feedback_id    uuid primary key references public.mentor_feedback (id) on delete cascade,
  mentee_id      uuid not null references public.mentees (id) on delete cascade,
  private_notes  text,
  overall_rating int check (overall_rating between 1 and 5)  -- only if Decision 3 keeps ratings private
);
alter table public.mentor_feedback
  add column shared_with_mentee boolean not null default false,
  add column shared_at timestamptz,
  add column mentee_acknowledged_at timestamptz;   -- set via RPC

-- mentee-authored self check-ins (separate from mentor check_ins) -----------
create table public.self_check_ins (
  id                       uuid primary key default gen_random_uuid(),
  mentee_id                uuid not null references public.mentees (id) on delete cascade,
  submitted_by             uuid not null default auth.uid() references auth.users (id),
  week_of                  date not null default date_trunc('week', current_date)::date,
  lead_gen_self_score      int check (lead_gen_self_score between 1 and 5),
  vt_self_score            int check (vt_self_score between 1 and 5),
  lofty_self_score         int check (lofty_self_score between 1 and 5),
  conversations_count      int check (conversations_count >= 0),
  appointments_set         int check (appointments_set >= 0),
  transactions_in_pipeline int check (transactions_in_pipeline >= 0),
  total_closed             int check (total_closed >= 0),
  prior_commitment_status  text check (prior_commitment_status in ('yes','partial','not')),
  prior_commitment_note    text,
  wins                     text,
  blockers                 text,
  help_needed              boolean not null default false,
  reviewed_at              timestamptz,     -- set only via RPC
  reviewed_by              uuid references auth.users (id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (mentee_id, week_of)
);

-- goals ----------------------------------------------------------------------
create table public.goals (
  id            uuid primary key default gen_random_uuid(),
  mentee_id     uuid not null references public.mentees (id) on delete cascade,
  created_by    uuid not null default auth.uid() references auth.users (id),
  title         text not null check (char_length(title) <= 200),
  description   text,
  metric        text,               -- e.g. 'appointments', 'closed'
  target_value  numeric,
  current_value numeric,
  due_date      date,
  stage         int check (stage between 1 and 4),
  status        text not null default 'open' check (status in ('open','in_progress','done','dropped')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- messages (one thread per mentee; append-only) -------------------------------
create table public.messages (
  id         uuid primary key default gen_random_uuid(),
  mentee_id  uuid not null references public.mentees (id) on delete cascade,
  sender_id  uuid not null default auth.uid() references auth.users (id),
  body       text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  read_at    timestamptz            -- set via RPC by the recipient
);
create index on public.messages (mentee_id, created_at desc);

-- help requests ----------------------------------------------------------------
create table public.help_requests (
  id              uuid primary key default gen_random_uuid(),
  mentee_id       uuid not null references public.mentees (id) on delete cascade,
  created_by      uuid not null default auth.uid() references auth.users (id),
  category        text not null check (category in ('transaction','compliance_legal','systems_access','personal','other')),
  urgency         text not null default 'normal' check (urgency in ('normal','urgent')),
  message         text not null check (char_length(message) between 1 and 5000),
  status          text not null default 'open' check (status in ('open','acknowledged','resolved','escalated','cancelled')),
  mentor_response text,
  escalation_id   uuid references public.escalations (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- resources ----------------------------------------------------------------------
create table public.resources (
  id              uuid primary key default gen_random_uuid(),
  owner_mentor_id uuid references auth.users (id) on delete cascade,  -- null = program-wide (admin)
  title           text not null,
  url             text not null check (url ~* '^https://'),
  description     text,
  category        text,
  stage           int check (stage between 1 and 4),
  is_active       boolean not null default true,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now()
);

-- admin workflow on existing tables (Phase 3) ------------------------------------
alter table public.escalations
  add constraint escalations_status_chk check (status in ('submitted','acknowledged','resolved')),
  add column admin_notes text, add column resolved_at timestamptz;
alter table public.graduation_recommendations
  add constraint graduation_status_chk check (status in ('submitted','approved','returned')),
  add column reviewed_by uuid references auth.users (id), add column reviewed_at timestamptz;
```

Every new table gets RLS enabled, `revoke all … from anon`, explicit grants as in §5.3, and `updated_at` triggers where the table has that column.

### 5.3 Policies

**Rule of thumb:** RLS decides *which rows* a user sees. Column-level `GRANT`s decide which columns *any* API user may write. Column grants cannot express "a mentor may read X but a mentee may not", because both use the same Postgres role (`authenticated`). That is why private columns move to side tables.

Note: a column-level `REVOKE` has no effect while a table-level grant exists. You must `revoke update on t from authenticated` first, then grant the columns.

**profiles**
```sql
-- select: self, your mentees (mentor), everyone (admin). Mentees read their mentor via RPC get_my_mentor().
create policy profiles_select on public.profiles for select to authenticated using (
  id = (select auth.uid())
  or id in (select mentee_user_id from public.mentees where id in (select private.mentored_mentee_ids()))
  or (select private.is_admin()));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- no insert/delete policies (trigger + service role only)
revoke insert, update, delete on public.profiles from authenticated;
grant update (full_name, phone, booking_url, photo_url, updated_at) on public.profiles to authenticated;  -- role NOT grantable
```

**mentees** (replaces `mentees_*_own`)
```sql
create policy mentees_select on public.mentees for select to authenticated
  using (id in (select private.accessible_mentee_ids()));
create policy mentees_insert on public.mentees for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.is_mentor()));
create policy mentees_update on public.mentees for update to authenticated
  using      ((user_id = (select auth.uid()) and (select private.is_mentor())) or (select private.is_admin()))
  with check ((user_id = (select auth.uid()) and (select private.is_mentor())) or (select private.is_admin()));
create policy mentees_delete on public.mentees for delete to authenticated
  using (user_id = (select auth.uid()) and (select private.is_mentor()));

revoke insert, update on public.mentees from authenticated;
grant insert (user_id, full_name, email, phone, program_start_date, current_stage, status)
  on public.mentees to authenticated;
grant update (user_id, full_name, email, phone, program_start_date, current_stage, status, updated_at)
  on public.mentees to authenticated;
-- mentee_user_id and portal_access: no grant, so only service_role (Edge Functions) and security-definer RPCs write them.
```
A mentee SELECTs their own row but gets no UPDATE: the update policy requires `is_mentor()`. Phone changes go through the RPC `update_my_phone(text)`.

**Mentor-authored child tables** (`check_ins`, `escalations`, `graduation_recommendations`, `mentor_feedback`, `kickoff_sessions`). Replace `*_select_own` with ownership via the **mentee**, not the author's `user_id`. This makes admin reassignment work: a new mentor sees history written by the previous mentor.
```sql
-- mentor/admin read
create policy <t>_select_staff on public.<t> for select to authenticated using (
  mentee_id in (select private.mentored_mentee_ids()) or (select private.is_admin()));
-- insert: author = caller, caller is a mentor of that mentee
create policy <t>_insert_staff on public.<t> for insert to authenticated with check (
  user_id = (select auth.uid()) and mentee_id in (select private.mentored_mentee_ids()));
-- update/delete: author only (admin may update escalations/graduation status in Phase 3)
create policy <t>_update_author on public.<t> for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and mentee_id in (select private.mentored_mentee_ids()));
create policy <t>_delete_author on public.<t> for delete to authenticated using (user_id = (select auth.uid()));
create policy escalations_update_admin on public.escalations for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));   -- same for graduation_recommendations
```
Mentee read policies, **only after the private columns have been moved out** (see §9 ordering):
```sql
create policy check_ins_select_mentee on public.check_ins for select to authenticated
  using (shared_with_mentee and mentee_id = (select private.my_mentee_id()));
create policy mentor_feedback_select_mentee on public.mentor_feedback for select to authenticated
  using (shared_with_mentee and mentee_id = (select private.my_mentee_id()));
create policy kickoff_sessions_select_mentee on public.kickoff_sessions for select to authenticated
  using (mentee_id = (select private.my_mentee_id()));
-- escalations, graduation_recommendations: NO mentee policy, ever.
```

**Private side tables** (`mentee_private_notes`, `check_in_private`, `mentor_feedback_private`): staff only.
```sql
create policy <t>_staff_all on public.<t> for all to authenticated
  using      (mentee_id in (select private.mentored_mentee_ids()) or (select private.is_admin()))
  with check (mentee_id in (select private.mentored_mentee_ids()));
```

**self_check_ins.** Mentee-submitted. The mentee can edit until the mentor reviews it.
```sql
create policy sci_select on public.self_check_ins for select to authenticated
  using (mentee_id in (select private.accessible_mentee_ids()));
create policy sci_insert_mentee on public.self_check_ins for insert to authenticated
  with check (mentee_id = (select private.my_mentee_id()) and submitted_by = (select auth.uid()));
create policy sci_update_mentee on public.self_check_ins for update to authenticated
  using      (submitted_by = (select auth.uid()) and reviewed_at is null)
  with check (submitted_by = (select auth.uid()) and mentee_id = (select private.my_mentee_id()) and reviewed_at is null);
-- no delete. Mentor marks reviewed via RPC mark_self_check_in_reviewed(id) (security definer; checks mentored_mentee_ids()).
revoke insert, update on public.self_check_ins from authenticated;
grant insert (mentee_id, week_of, lead_gen_self_score, vt_self_score, lofty_self_score, conversations_count,
              appointments_set, transactions_in_pipeline, total_closed, prior_commitment_status,
              prior_commitment_note, wins, blockers, help_needed) on public.self_check_ins to authenticated;
grant update (lead_gen_self_score, vt_self_score, lofty_self_score, conversations_count, appointments_set,
              transactions_in_pipeline, total_closed, prior_commitment_status, prior_commitment_note,
              wins, blockers, help_needed, updated_at) on public.self_check_ins to authenticated;
-- reviewed_at / reviewed_by / submitted_by / mentee_id are not updatable from the API at all.
```

**goals**
```sql
create policy goals_select on public.goals for select to authenticated
  using (mentee_id in (select private.accessible_mentee_ids()));
create policy goals_insert on public.goals for insert to authenticated with check (
  created_by = (select auth.uid())
  and (mentee_id = (select private.my_mentee_id()) or mentee_id in (select private.mentored_mentee_ids())));
create policy goals_update on public.goals for update to authenticated
  using      (mentee_id = (select private.my_mentee_id()) or mentee_id in (select private.mentored_mentee_ids()))
  with check (mentee_id = (select private.my_mentee_id()) or mentee_id in (select private.mentored_mentee_ids()));
create policy goals_delete on public.goals for delete to authenticated using (
  created_by = (select auth.uid()) or mentee_id in (select private.mentored_mentee_ids()));
-- grant update on everything except created_by, mentee_id, created_at.
```

**messages**
```sql
create policy messages_select on public.messages for select to authenticated
  using (mentee_id in (select private.accessible_mentee_ids()));
create policy messages_insert on public.messages for insert to authenticated with check (
  sender_id = (select auth.uid())
  and (mentee_id = (select private.my_mentee_id()) or mentee_id in (select private.mentored_mentee_ids())));
-- no update/delete policies. Read receipts via RPC mark_thread_read(p_mentee_id), which sets read_at
-- where sender_id <> auth.uid() and the caller can access the thread.
grant select, insert (mentee_id, body) on public.messages to authenticated;
```

**help_requests**
```sql
create policy hr_select on public.help_requests for select to authenticated
  using (mentee_id in (select private.accessible_mentee_ids()));
create policy hr_insert_mentee on public.help_requests for insert to authenticated
  with check (mentee_id = (select private.my_mentee_id()) and created_by = (select auth.uid()));
create policy hr_update_staff on public.help_requests for update to authenticated
  using      (mentee_id in (select private.mentored_mentee_ids()) or (select private.is_admin()))
  with check (mentee_id in (select private.mentored_mentee_ids()) or (select private.is_admin()));
-- mentee cancel → RPC cancel_help_request(id) (only while status = 'open').
grant insert (mentee_id, category, urgency, message) on public.help_requests to authenticated;
grant update (status, mentor_response, escalation_id, updated_at) on public.help_requests to authenticated;
```

**resources**
```sql
create policy res_select on public.resources for select to authenticated using (
  (is_active and (owner_mentor_id is null or owner_mentor_id = (select private.my_mentor_id())))
  or owner_mentor_id = (select auth.uid())
  or (select private.is_admin()));
create policy res_write on public.resources for all to authenticated
  using      ((owner_mentor_id = (select auth.uid()) and (select private.is_mentor())) or (select private.is_admin()))
  with check ((owner_mentor_id = (select auth.uid()) and (select private.is_mentor())) or (select private.is_admin()));
```
Mentors also see program-wide resources: add `or (owner_mentor_id is null and (select private.is_mentor()))`.

**invitations**: `select` where `invited_by = auth.uid() or is_admin()`. No insert/update/delete grants to `authenticated`, so only the service role writes.

### 5.4 Public RPCs (`SECURITY DEFINER`, `search_path = ''`, `grant execute … to authenticated` only)
| Function | Purpose |
|---|---|
| `get_my_graduation_progress() → jsonb` | For the mentee. Returns booleans and counts only, never the recommendation statement: `closed` (latest check-in `total_closed`), `closed_required` (4), `vt_complete`, `lofty_proficient`, `nexa_connected` (from the latest graduation rec's booleans, falling back to check-in scores ≥ 4 as in `buildReadiness`), `recommendation_status` (`not_started / submitted / approved`). A twin `get_graduation_progress(mentee_id)` for mentors replaces the client-side `buildReadiness()` (`app.js:784`), so both sides use one definition. |
| `get_my_mentor() → table(full_name, email, phone, booking_url, photo_url)` | For the mentee. |
| `accept_invitation()` | Sets `portal_access='active'` and `invitations.accepted_at` for `mentee_user_id = auth.uid()`. |
| `update_my_phone(text)` | Mentee updates `mentees.phone` and `profiles.phone`. |
| `mark_thread_read(uuid)`, `mark_self_check_in_reviewed(uuid)`, `acknowledge_feedback(uuid)`, `cancel_help_request(uuid)` | Narrow state changes that column grants can't express per role. |
| `auth_user_id_by_email(text)` | **service_role only** (`revoke execute from public, anon, authenticated`). Used by `invite-mentee` for existing accounts. |

### 5.5 Mentor vs mentee check-ins
`check_ins` stays **mentor-authored**: it is the toolkit's Assess / Direct & Verify / Strategize record, it carries mentor-only fields, and it is "owned" by the mentor's `user_id`. Mentee input goes into **`self_check_ins`** (a separate table) rather than a `source` / `submitted_by` column on `check_ins`, because:
- A mixed table would need per-row column rules (a mentee must never set `escalation_flag`, `check_in_number` or mentor scores). RLS can't do that, and column grants can't separate the two roles.
- The mentee's edit window ("until reviewed") is easy to express on its own table and awkward on a shared one.
- The mentor UI unifies the two anyway: the timeline shows both, and the check-in form can prefill from the week's self check-in.

Mentee edits: allowed until `reviewed_at` is set. There is no delete, which keeps an honest record for verification.

### 5.6 Migration order (important)
1. `profiles`, trigger, backfill, `private.*` helpers. Replace the mentor policies (adding `is_mentor()`, mentee-based select, admin read). Disable sign-ups.
2. Create the private side tables and **copy the data** (`insert … select` from `mentees.notes`, the four `check_ins` private columns, `mentor_feedback.private_notes`).
3. Deploy the app version that reads and writes the side tables.
4. **Drop the old private columns** (`alter table … drop column`). Verify with tests.
5. Only then add `mentee_user_id`, the mentee SELECT policies, the new tables and the Edge Functions.

Adding a mentee SELECT policy on `check_ins` or `mentor_feedback` before step 4 would leak the private notes through the REST API, even if the UI never shows them.

---

## 6. Architecture

### 6.1 Honest assessment of `app.js`
At 1,468 lines it is readable and consistent for a single-role tool: clear sections, `esc()` used throughout, and careful error handling (`runSubmit`, `throwIfError`). It will not absorb a second role cleanly:
- Global `state` with `select('*')` on everything means a mentee build would share loaders that *expect* private columns. That makes accidental exposure (or crashes) more likely.
- There is no router (`state.currentView` only), so mentee deep links from emails ("open your feedback") are impossible.
- `innerHTML` templates are fine, but mentee-authored content (messages, help requests, self check-ins) will now render **inside mentor and admin sessions**. That is a new stored-XSS surface, and every new template must use `esc()`.
- Inline `onclick` handlers block a strict Content-Security-Policy.
- The Play CDN for Tailwind and unpinned supabase-js are not production-grade.
- The layout isn't responsive.

Adding about 11 mentee screens plus admin views would roughly double the file.

### 6.2 Recommendation
**Stay vanilla JS. Split into ES modules and add a small Vite build.** Do not move to a framework yet.
- Vite multi-page build: `index.html` (mentor/admin), `mentee/index.html` (mentee), `auth/confirm/index.html`. Tailwind is compiled through PostCSS (dropping the Play CDN). supabase-js comes from npm with a pinned version. On Vercel this is just `npm run build` with output `dist/`.
- Module layout:
  ```
  src/shared/   supabase.js (client), auth.js (session, role lookup, redirect), esc.js, format.js, router.js (hash router)
  src/mentor/   data.js, views/{dashboard,mentee,checkin,escalation,graduation,feedback,kickoff,commitments,inbox,admin}.js
  src/mentee/   data.js (only queries mentee-safe tables/RPCs), views/{home,selfcheckin,goals,sessions,feedback,messages,resources,help,account}.js
  ```
- Replace inline `onclick` with event delegation (`data-action` attributes), which enables a CSP.
- A framework rewrite (React, Svelte, …) would cost about 1–2 weeks just for parity, and the problems above are solved by modules, a router and a build. Revisit if the app grows past about 25 views or needs heavy client state.

### 6.3 One app or separate routes
Use **one repo and one Vercel project with separate entry points** (`/` for mentor/admin, `/mentee/` for mentees), sharing `src/shared`.
- After sign-in, `auth.js` reads `profiles.role`. A mentee who lands on `/` is redirected to `/mentee/`, and a mentor on `/mentee/` goes to `/`. A `pending` user sees "Your account isn't set up yet; contact your mentor."
- Separate shells allow a mobile-first mentee UI without reworking the mentor sidebar layout, and keep mentor-only code paths out of the mentee bundle. That is not a security boundary (RLS is), but it reduces mistakes.
- Admin uses the mentor app with extra nav items gated on `role = 'admin'`.

### 6.4 Hosting and server pieces
- **Vercel**: static output plus `vercel.json` with `cleanUrls`, rewrites for the entry points, and security headers: `Content-Security-Policy` (self; `connect-src` for the Supabase URL and `wss://` realtime; fonts), `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`.
- **Supabase Edge Functions** (Deno). The service-role key stays in function secrets and never reaches Vercel or the repo. `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically. Functions:
  `invite-mentee`, `resend-invite`, `revoke-mentee-access` (MVP) · `notify` (Phase 2, DB webhook → Resend) · `invite-mentor` (Phase 3, admin only) · `weekly-digest` (Phase 4, `pg_cron`).
  CORS is restricted to `https://mentorship.andresaviles.com` and `http://localhost:8000`.
- **Realtime**: enable it for `messages`, `help_requests` and `self_check_ins` only. `postgres_changes` respects RLS.
- **Local dev**: Supabase CLI (`supabase start`) for migrations, functions and the RLS tests (§9.2).

---

## 7. Phased build (rough effort, one developer)

| Phase | Contents | Days |
|---|---|---|
| **0. Foundation** | Split `app.js` into modules, Vite and compiled Tailwind, pin supabase-js, hash router, event delegation, `vercel.json` headers. Migrations folder and local Supabase. pgTAP harness. No behaviour change for mentors. | 2–3 |
| **1. MVP** | `profiles` and roles, `private.*` helpers, tightened mentor policies (`is_mentor`, mentee-based select, admin read). Private side tables and migration (§5.6). Sign-ups disabled. Resend SMTP and branded templates. `/auth/confirm`. `invite-mentee`, `resend-invite`, `revoke-mentee-access`. **Mentee:** sign in, welcome, home (stage, graduation progress RPC, next check-in, current commitment), sessions (kickoff and shared check-ins), shared feedback, weekly self check-in (edit until reviewed), get help. **Mentor:** portal access card, share toggles, self check-ins and help requests on mentee detail, mark reviewed. RLS test suite green. | 7–9 |
| **2. Engagement** | Messages (realtime, unread, read receipts). Goals (both sides). Mentor needs-attention inbox and badges. `notify` Edge Function (new message, urgent help request, self check-in submitted) via Resend. Help request → convert to escalation (with the prefill fix). | 4–5 |
| **3. Admin and program** | Admin console: all mentors and mentees, escalation queue with statuses, graduation approval (and stop auto-`graduated` on submission), mentee reassignment, `invite-mentor`. Resources library (program-wide and per-mentor). Optional: mentee-logged closed transactions that prefill the graduation form's `closed_transactions`. | 4–6 |
| **4. Polish** | Scheduling (`meetings` table, request/reschedule, ICS / booking_url). Weekly reminder digest via `pg_cron` and `weekly-digest`. PWA install and push-ready manifest. Audit log (role changes, invites, revokes). Cohort progress analytics for admin. | 4–6 |

Total: about **21–29 days**. The MVP is usable on its own after Phases 0–1 (about 9–12 days).

---

## 8. Open decisions (with recommendations)

1. **Build tooling: plain ES modules with no build, or Vite?** **Recommend Vite** (vanilla, multi-page). It is the only clean way off the Tailwind Play CDN, it pins dependencies, and it costs half a day on Vercel. A no-build ES-module split is acceptable if Andres wants zero tooling, but keep the module layout either way.
2. **How to keep private fields private: side tables or RPC-only read models?** **Recommend side tables** (§5.2). They are RLS-native, mentees use normal queries, and it is easy to prove with tests. The alternative (mentees get *no* base-table policies and read only through `SECURITY DEFINER` functions) needs no data migration, but every function must re-implement filtering and PostgREST filtering/embedding is lost. Use RPCs only for *derived* data such as graduation progress.
3. **What mentor assessments does a mentee see?** **Recommend:** share the three 1–5 check-in scores (the rubric is the program's language, and the trend chart motivates). Keep `mentor_feedback.overall_rating` private (move it to `mentor_feedback_private`; "1 – Significant concerns" belongs in a conversation, not a dashboard). Map `status = 'escalated'` to "Active" in the mentee UI. For **existing** check-ins, backfill `shared_with_mentee = false` and add a "Share all past check-ins" button per mentee, since mentors wrote them believing they were private. New check-ins default to shared. Separately, settle the stage targets (2/4/8/12 vs 4) before launch.
4. **Self check-ins: separate table, or a `source` column on `check_ins`?** **Recommend a separate `self_check_ins` table** (§5.5), with the mentee editing until the mentor reviews it.
5. **Mentee login method: magic link only, or also a password?** **Recommend magic link only** for the MVP. It means no password resets and suits phone use. Add an optional "set a password" in Account later if mentees complain about email round-trips. Sessions persist, so most mentees sign in rarely.

---

## 9. Risks, security checklist and test plan

### 9.1 Security checklist
- [ ] Service-role key only in Edge Function secrets. Grep the repo and the built `dist/` for `service_role` / `sb_secret_` before each deploy.
- [ ] Public sign-ups disabled and the sign-up toggle removed. `pending` users have zero access.
- [ ] Role is never read from `user_metadata` or `app_metadata` written by clients. `profiles.role` is not column-granted to `authenticated`.
- [ ] `mentees.mentee_user_id` / `portal_access` are not column-granted, so a mentor can't link an arbitrary user to their mentee record.
- [ ] Migration order from §5.6 followed: private columns dropped **before** any mentee SELECT policy exists.
- [ ] All `SECURITY DEFINER` functions use `set search_path = ''`, fully qualified names, `revoke … from public, anon`, and live in `private` unless they are deliberately public RPCs.
- [ ] Edge Functions: `verify_jwt` on, role check, ownership proven via an RLS-scoped read, email normalised, rate limit, CORS allow-list, no echo of internal errors.
- [ ] Redirect allow-list is exact. Email templates use `token_hash` and the confirm page needs a click (resists link scanners).
- [ ] Resend domain has SPF, DKIM and DMARC. Sending-only API key scoped to the domain.
- [ ] **Stored XSS:** every mentee-authored field rendered in mentor/admin views goes through `esc()`. Admin is the highest-value target because they see everything. Add a test that renders `<img src=x onerror=alert(1)>` in a message.
- [ ] CSP is enforced once the inline handlers are gone.
- [ ] supabase-js pinned. No third-party script CDNs remain at runtime (fonts excepted).
- [ ] Realtime enabled only on the intended tables.
- [ ] Revocation: `revoke-mentee-access` both unlinks and bans the user. Data access stops immediately (helpers read live) even though the JWT stays valid until it expires.
- [ ] Mentee export: none. Mentor export includes private tables and is labelled as sensitive.
- [ ] Privacy notice in Messages and Help that the program admin can see them. Messages may contain client PII (addresses, prices), so retention needs a decision (keep while the mentee is active plus N months).
- [ ] Graduated or dropped mentees: decide whether portal access is read-only for 30 days and then revoked automatically (Phase 4 `pg_cron`).
- [ ] Run Supabase Security Advisor after each migration (no RLS-disabled tables, no mutable `search_path`).

### 9.2 Test plan
**Database (pgTAP via `supabase test db`, local stack).** Each test impersonates a user:
```sql
set local role authenticated;
set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}';
```
Fixtures: **M1** (mentor) with mentees **A** and **B** (both linked to logins), **M2** (mentor) with mentee **C**, **ADM** (admin), **P** (pending self-signup), and `anon`. Each mentee has shared and unshared check-ins, feedback with private notes, an escalation and a graduation rec.

| # | Actor | Action | Expected |
|---|---|---|---|
| 1 | A | `select * from mentees` | exactly 1 row (A). No `notes` column exists |
| 2 | A | `select` from check_ins | only A's rows with `shared_with_mentee = true` |
| 3 | A | `select` from check_in_private, mentor_feedback_private, mentee_private_notes, escalations, graduation_recommendations | 0 rows each |
| 4 | A | `select` from mentor_feedback | only A's shared rows |
| 5 | A | insert self_check_in with `mentee_id = B` | RLS violation (42501) |
| 6 | A | update own self_check_in after `reviewed_at` is set | 0 rows affected |
| 7 | A | `update self_check_ins set reviewed_at = now()` | permission denied (column grant) |
| 8 | A | insert into mentees / update `mentees.current_stage` | denied / 0 rows |
| 9 | A | `update profiles set role = 'admin'` | permission denied. Then `auth.updateUser({data:{role:'admin'}})` → `private.is_admin()` is still false |
| 10 | A | select or insert messages in B's thread | 0 rows / denied |
| 11 | A | `get_my_graduation_progress()` | A's numbers only. No statement text |
| 12 | B | repeat 1–4 | sees only B. Never A |
| 13 | M1 | select mentees / check_ins / messages | A and B including private side tables. Never C |
| 14 | M1 | insert check_in or feedback for C | denied |
| 15 | M1 | `update mentees set mentee_user_id = …` | permission denied |
| 16 | M1 | `update mentees set user_id = M2` | denied (with-check) |
| 17 | M2 | read A's help_requests, self_check_ins, messages | 0 rows |
| 18 | ADM | select across all tables | everything. Can update escalation status. Can reassign C to M1, after which M1 sees C's history written by M2 |
| 19 | P | any select or insert | 0 rows / denied (including `mentees` insert) |
| 20 | anon | any table | permission denied |
| 21 | A (revoked) | after `revoke-mentee-access`, same JWT | 0 rows everywhere |

**Edge Functions** (Deno tests against the local stack): no JWT → 401; mentee or pending caller → 403; mentor inviting another mentor's mentee → 404/403; missing or invalid email → 400; mentee already linked to a different user → 409; existing mentor account email → 409; 21st invite in an hour → 429; disallowed Origin → no CORS headers; success writes `profiles.role = 'mentee'`, `mentees.mentee_user_id` and an `invitations` row.

**End-to-end (Playwright, staging project):** mentor invites → the invite lands in a test inbox (Resend test address or Mailpit locally) → confirm page → mentee portal home. Mentee submits a self check-in → mentor sees it, prefills a check-in and marks it reviewed → mentee can no longer edit. Message round-trip in realtime. Help request → convert to escalation → mentee never sees the escalation. Role redirects (`/` ↔ `/mentee/`). XSS payload in a message renders inert in the mentor and admin views.

**Pre-launch:** a pilot with 1 mentor and 2 mentees for one week, Security Advisor clean, a backup taken before the §5.6 column drops.
