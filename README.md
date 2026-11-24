# AXEN Mentorship Hub

A static web app that AXEN Xcelerate University mentors use to track their mentees. Data is stored in **Supabase** (Postgres + Auth). Each mentor signs in with email and password and sees only their own records, which Row Level Security enforces.

## Features
- Email/password sign-up and sign-in (Supabase Auth), with a Sign out button
- Dashboard with mentee cards, scores, trends, status filter, and "feedback due" reminders
- Mentee detail: profile, graduation readiness, score trend chart, kickoff sessions, full check-in history
- Forms: Check-In (matches the mentor toolkit), Escalation, Graduation Recommendation, Mentor Feedback, Kickoff Session
- Open-commitments view across all mentees
- JSON export of loaded data and a per-mentee text summary

## Project layout
```
index.html            App shell, Tailwind config, auth overlay
css/styles.css        Custom styles
js/app.js             All app logic and the Supabase client
supabase/schema.sql   Database schema, RLS policies (run once in Supabase)
assets/               Logo
```

## One-time Supabase setup (Andres)
The app expects six tables: `mentees`, `check_ins`, `escalations`, `graduation_recommendations`, `mentor_feedback`, and `kickoff_sessions`. You create them yourself; the app never runs migrations.

1. Open the Supabase project → **SQL Editor** → **New query**.
2. Paste the full contents of `supabase/schema.sql` and click **Run**.
   - The script is idempotent, so you can re-run it safely after schema changes.
   - It enables RLS on every table and adds own-row SELECT/INSERT/UPDATE/DELETE policies (`user_id = auth.uid()`).
3. **Authentication → Providers → Email** must be enabled.

### Email confirmation
If **Confirm email** is on in Supabase Auth (the default), sign-up does **not** create a session. The app keeps the login screen open and shows *"Check your email to confirm your account."* The user clicks the link in the email and then signs in. If the confirmation link redirects somewhere unexpected, set **Authentication → URL Configuration → Site URL** to wherever the app is served (for example `http://localhost:8000` or your production domain).

### Client configuration
`js/app.js` sets the Supabase project URL and the public **anon** key at the top of the file. The anon key is meant to be public, and RLS is what protects the data. Never put the `service_role` key in this repo or in any client code.

## Run locally
This is a static site with no build step. Serve the folder over HTTP rather than opening the file directly, so that Supabase Auth redirects and storage behave normally:

```bash
cd axen-mentorship-hub
python3 -m http.server 8000
# or
npx serve .
```

Then visit http://localhost:8000, create an account (confirm it by email if required), and sign in.

## Deploying
Any static host works: Netlify, Vercel, Cloudflare Pages, or GitHub Pages. After deploying, add the production URL to **Supabase → Authentication → URL Configuration** (Site URL and Redirect URLs) so that confirmation emails link back to the live app.

## Data & backups
All data lives in Supabase. The **Export Data** button downloads a JSON snapshot of what is currently loaded for the signed-in mentor. Use Supabase's own backups for full database recovery.

## Next improvements
- Edit/delete for check-ins, feedback, and kickoffs
- Escalation and graduation history on the mentee page
- Multi-mentor / admin views
