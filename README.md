# AXEN Mentorship Hub

Web app for AXEN Xcelerate University mentors and their mentees, served at
`https://mentorship.andresaviles.com`. Vanilla JS (ES modules) built with **Vite**
(multi-page) and Tailwind (compiled via PostCSS). Data and auth are in **Supabase**
(project `agent-mentorship-hub`), and Row Level Security protects the data.

| Page | Who | Sign-in |
|---|---|---|
| `/` | mentors and admin (Andres) | 6-digit email code (or the link in the same email), passkey, Google, or password; optional authenticator app for admins |
| `/mentee/` | mentees (mobile-first, bottom tab bar) | 6-digit email code (or the link in the same email), passkey, or Google; never a password (invite from their mentor) |
| `/auth/confirm` | everyone arriving from an email link | **Continue** button → `verifyOtp` → redirect by role |

There is no public sign-up. Roles live in `public.profiles.role`
(`pending | mentee | mentor | admin`) and are never read from user metadata.

## Features
- **Mentors:** dashboard with needs-attention items, mentee list and filters, mentee
  detail (graduation progress, score trends, timeline, commitments), check-in /
  escalation / graduation / feedback / kickoff forms, edit mentee, open-commitments
  view, JSON export (sensitive; no auth user object) and per-mentee text summary.
  Mentor-only notes are kept in private side tables.
- **Portal access** per mentee: invite / resend / revoke through the `invite-mentee`
  Edge Function. Per-item share toggles plus "Share all past check-ins / feedback".
  Self check-ins (mark reviewed) and help requests (respond, resolve, convert to
  escalation) appear on the mentee page.
- **Admin:** all mentees with their mentor, and pending graduations to approve or
  decline. Submitting a recommendation no longer auto-graduates.
- **Mentees:** welcome / first-run, home (stage, graduation progress, next
  check-in, current commitment, latest feedback), weekly self check-in (editable
  until reviewed), sessions (kickoff plus shared check-ins and score trend),
  feedback ("Got it"), get help, account (phone, sign out).

Graduation requires **4 closed transactions** (confirmed by Andres; there are
no per-stage deal targets). The number lives in one place, `public.program_settings`,
with `src/shared/config.js` `PROGRAM` as the fallback.

## Project layout
```
index.html               mentor/admin page          -> src/mentor/main.js
mentee/index.html        mentee portal               -> src/mentee/main.js
auth/confirm/index.html  email-link confirm page     -> src/auth/confirm.js
src/shared/              supabase client, config, auth/role routing, redirect (next) sanitiser,
                         esc(), formatting, program rules, chart, event delegation
src/mentor/              data.js, state.js, views/*
src/mentee/              data.js (mentee-safe queries only), views/screens.js
src/styles.css           Tailwind + custom styles
public/assets/           logo (copied to dist/assets/)
supabase/schema.sql      original schema (already applied; do NOT re-run after migrations)
supabase/migrations/     0001..0004 + README (apply order, admin setup)
supabase/functions/invite-mentee/   Edge Function (invite / resend / revoke)
supabase/tests/, scripts/test-rls.sh  RLS test suite (local throwaway Postgres)
tests/                   vitest unit tests + dist smoke test
vercel.json              build config, clean URLs, security headers (CSP etc.)
docs/                    plan and Andres's launch steps
```

## Development
```bash
npm install
npm run dev        # http://localhost:5173  (/, /mentee/, /auth/confirm)
npm run build      # -> dist/
npm run preview    # serve dist/ on http://localhost:5173
```
The dev server talks to the live Supabase project (public URL and anon key in
`src/shared/config.js`; the anon key is public by design). `http://localhost:5173/**`
must be in Supabase Auth's redirect URLs for email links to come back to dev.
Never put the `service_role` key in this repo or in client code.

No inline scripts or `on*=` handlers: the CSP in `vercel.json` forbids them. Use
`data-action` attributes (`src/shared/actions.js`). Every database or user value
interpolated into HTML must go through `esc()`. URLs go through `safeUrl()`.

## Tests
```bash
npm test           # vitest unit tests (tests/**/*.test.js) + dist smoke test (needs a build first)
npm run test:unit  # unit tests only
npm run test:dist  # dist/ checks: pages exist, referenced files exist, no inline scripts/handlers, no secrets
npm run test:rls   # RLS/migration suite against a throwaway LOCAL Postgres
```
`test:rls` needs Postgres 17 binaries on PATH (`/usr/lib/postgresql/17/bin`) and a
local server (default socket `/tmp`, port `54329`; override with `PGHOST`, `PGPORT`,
`PGUSER`). It refuses non-local hosts.

## Deploying
Vercel builds from `vercel.json` (`npm ci && npm run build`, output `dist/`). The
one-time Supabase, Resend and DNS setup, migration timing, admin role and Edge
Function deploy are in **`docs/ANDRES_SETUP_STEPS.md`** and
**`supabase/migrations/README.md`**.

## Data and backups
All data lives in Supabase. Use Supabase backups for recovery. The mentor **Export
Data** button downloads a JSON snapshot that includes mentor-only notes, so treat it
as sensitive.
