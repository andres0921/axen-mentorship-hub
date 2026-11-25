# Database migrations

`supabase/schema.sql` is the original schema (already applied to the live
`agent-mentorship-hub` project, ref `delfnadofjhlasxafvri`). Everything since is in
this folder and must be applied **in order**:

| File | What it does |
|---|---|
| `0001_profiles_roles.sql` | `profiles` table + roles (`pending/mentee/mentor/admin`), new-user trigger, backfills **every existing auth user as `mentor`**, `private.*` helper functions, tightened mentor policies |
| `0002_private_side_tables.sql` | `mentee_private_notes`, `check_in_private`, `mentor_feedback_private` + copies the existing private data into them |
| `0003_drop_old_private_columns.sql` | re-copies anything new, verifies nothing would be lost, then **drops** `mentees.notes`, `check_ins.general_assessment_notes / verification_notes / escalation_flag / escalation_notes`, `mentor_feedback.private_notes / overall_rating` |
| `0004_mentee_portal.sql` | mentee link columns, invitations, share flags, `self_check_ins`, `help_requests`, `program_settings`, graduation approval workflow, mentee RPCs. Refuses to run unless 0003 has run |

All four are idempotent (safe to re-run).

## ⚠️ Timing: 0003 breaks the old app

The app currently deployed from `main` (`js/app.js`) reads and writes the columns
0003 drops. From the moment 0003 runs until the new app is live, the old app's
notes, check-in and feedback saves fail. So:

1. Take a backup first: Supabase dashboard → **Database → Backups** (or download a
   `pg_dump`).
2. Apply 0001 → 0004 **immediately before merging the PR** (or right after merging,
   before anyone signs in), then merge so Vercel deploys the new app within minutes.
3. Tell mentors not to use the hub during that window (a few minutes).

## How to apply

**Option A: SQL Editor (no tooling).** Dashboard → **SQL Editor → New query**.
For each file in order (`0001`, `0002`, `0003`, `0004`): paste the whole file, click
**Run**, and confirm "Success. No rows returned" before moving to the next one. If a
file errors, stop and don't run the next one. 0003 aborts with "Refusing to drop …"
rather than lose data.

**Option B: Supabase CLI.**
```bash
supabase link --project-ref delfnadofjhlasxafvri
supabase db push        # applies 0001..0004 in filename order
```

**Do NOT re-run `supabase/schema.sql` after these migrations.** It re-creates the
old own-row policies and table-wide grants, which would undo the role checks and
column grants added here.

## Make Andres the admin

0001 backfills every existing account as `mentor`. Then, in the SQL Editor:

```sql
update public.profiles
   set role = 'admin'
 where id = (select id from auth.users where lower(email) = lower('andres.e.aviles94@gmail.com'));

-- check: should return one row with role = admin
select p.id, p.email, p.role
  from public.profiles p
  join auth.users u on u.id = p.id
 where lower(u.email) = lower('andres.e.aviles94@gmail.com');
```

If the `select` returns nothing, that account doesn't exist yet. Create it
(Authentication → Users → Add user), then run the `update` again.

Other roles are managed the same way. A new mentor account starts as `pending`;
promote it with `update public.profiles set role = 'mentor' where id = (select id from auth.users where lower(email) = lower('<their email>'));`.
Role is never taken from user metadata, and API users can't write `profiles.role`.

## Program numbers (unconfirmed)

Stage targets (2/4/8/12 closed) and the graduation requirement (4 closed, scores ≥ 4)
are **not yet confirmed**. They live in `public.program_settings` (one row, `id = 1`),
with `src/shared/config.js` `PROGRAM` as the client fallback. To change them:

```sql
update public.program_settings
   set stage_targets = '{"1": 2, "2": 4, "3": 8, "4": 12}',
       graduation_closed_required = 4,
       graduation_score_threshold = 4
 where id = 1;
```
Then update `PROGRAM` in `src/shared/config.js` to match.

## Local tests

`bash scripts/test-rls.sh` (or `npm run test:rls`) builds a throwaway local Postgres
database, applies schema + migrations twice (idempotency), and runs the RLS matrix.
It refuses to run against a non-local host.
