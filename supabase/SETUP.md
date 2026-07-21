# Rent EV Scooters — Database Setup & Migration Workflow

This repo owns the schema for the `Rent EV Scooters` Supabase project
(`ap-southeast-2`, ref `jeerugpvchfjlgssfoeb`) as version-controlled SQL
migrations under `supabase/migrations/`. Nothing should ever be hand-typed
into the Supabase Dashboard SQL editor for schema changes again — every
change is a new migration file, committed and pushed like any other code.

## 1. One-time setup (per developer machine)

```bash
# Install the CLI (macOS/Linux via Homebrew; see docs for other OSes)
brew install supabase/tap/supabase

# Docker Desktop must be running — the CLI spins up a local Postgres +
# Studio + Auth stack in containers for local dev
supabase --version

# From the repo root, log in (opens a browser)
supabase login

# Link this repo to the actual hosted project (one-time)
supabase link --project-ref jeerugpvchfjlgssfoeb
```

`supabase link` stores the project ref in `supabase/.temp/` (gitignored) —
it does not store any secret, so this is safe to run per-developer.

## 2. Everyday local dev loop

```bash
# Start the local stack (Postgres, Studio at http://localhost:54323, Auth, etc.)
supabase start

# Apply every migration in supabase/migrations/ to your LOCAL db, then
# run seed.sql — this is your "does it apply cleanly from zero" test
supabase db reset

# Work against the local Studio / local connection string exactly like
# you would against production, without touching real data
```

Run `supabase db reset` after pulling any new migration from a teammate,
and before opening a PR that adds one — it's the fastest way to catch a
broken migration before it ever reaches staging.

## 3. Making a schema change (this is "how I change the DB" going forward)

```bash
# Creates an empty, correctly-timestamped file in supabase/migrations/
supabase migration new add_vehicle_insurance_reminder_flag

# Edit the generated file, write plain SQL (create/alter/etc.)

# Test it locally
supabase db reset

# Commit it like any other code change
git add supabase/migrations/*.sql
git commit -m "Add insurance reminder flag to vehicles"
git push
```

Rules that keep this system safe:
- **Never edit a migration file that has already been applied anywhere**
  (local is fine to reset, but once a file has been pushed to staging or
  prod, treat it as immutable). If you got something wrong, write a new
  migration that corrects it — exactly like you would with any other
  production database change.
- **Migrations run in filename order.** The timestamp prefix is what
  guarantees this — always use `supabase migration new`, never hand-name
  a file.
- **One logical change per migration** where practical (easier to review,
  easier to bisect if something breaks).

## 4. Pushing to the real (hosted) database

There are two ways, pick based on how much process you want:

### A. Direct push (fine for a solo/small-team pre-launch project)
```bash
supabase db push
```
This diffs your local `supabase/migrations/` against the hosted project's
migration history table and applies whatever's missing, in order.

### B. CI/CD (recommended once you have real riders/data)
Add `.github/workflows/deploy-migrations.yml` (included in this repo) so
merges to `main` push automatically, and PRs get a dry-run diff for
review. You'll need two GitHub Actions secrets:
- `SUPABASE_ACCESS_TOKEN` — generate at https://supabase.com/dashboard/account/tokens
- `SUPABASE_PROJECT_ID` — `jeerugpvchfjlgssfoeb`

This means: **no one pushes schema changes by hand, ever** — the only
path to production schema change is a merged PR.

## 5. Environments

Right now you have one Supabase project. Before real users:
- Create a **second Supabase project** for staging (`supabase projects create`),
  and point CI at it for every PR/branch; only `main` pushes to prod.
- Alternatively use **Supabase branching** (`supabase branches create`) if
  you want an ephemeral per-PR database instead of one long-lived staging
  project — costs a little more but gives true isolation per PR.

Never point `supabase db reset` or a dev branch's seed data at the
production project — `seed.sql` is destructive-by-design for local dev.

## 6. Migration order in this repo

| File | Contents |
|---|---|
| `20260720100000_extensions_and_enums.sql` | Extensions, enums, shared `updated_at` trigger fn |
| `20260720100100_identity.sql` | `users`, `roles`, `user_roles`, `user_documents` + auth signup trigger |
| `20260720100200_fleet.sql` | `stations`, `vehicles`, `vehicle_maintenance`, `vehicle_documents` |
| `20260720100300_commercial.sql` | `plans`, `subscriptions`, `rentals`, `invoices` (payments merged in) |
| `20260720100400_support_ops.sql` | `support_requests`, `rental_feedback`, `incident_reports`, `notifications_log` |
| `20260720100500_rls.sql` | `is_admin()` helper + RLS policies on all 16 tables |

## 7. Known operational behaviors (not bugs — read before you're surprised by them)

- **Deleting a rider from Supabase Auth will fail (by design) once they
  have any rental or invoice.** `rentals.user_id` and `invoices.user_id`
  are `ON DELETE RESTRICT` to protect financial/trip history, while
  `public.users` cascades from `auth.users`. Practical effect: never call
  `supabase.auth.admin.deleteUser()` on a rider with ride history. For
  "right to erasure" requests, anonymize the row (`full_name`, `email`,
  `phone` → null/redacted) and set `deleted_at`, rather than hard-deleting.
- **`vehicle_telemetry` partitions only exist through Aug 2026.** Before
  September, either enable `pg_partman` or add a `pg_cron` job that
  creates next month's partition ahead of time. An insert into an
  unpartitioned date range fails loudly — that's the intended safe
  failure mode, but don't let it lapse silently.
- **Zone/geofence enforcement is not a DB trigger.** `zones` stores
  polygons; nothing currently blocks a rental from ending outside an
  active zone. Enforce this in your "end rental" application/edge
  function logic using `ST_Contains`, once you've confirmed which zones
  are live.
- **`audit_logs` has no UPDATE/DELETE policy for any role** — it's
  effectively immutable once a row lands. Write to it only from a
  trusted server-side path (Edge Function or service role), never
  directly from a rider-facing client.
- **First admin user has no self-serve path**, by design. After your own
  account signs up (the new-user trigger creates your `public.users` row
  automatically), insert your first `user_roles` row with `role_id`
  matching `admin` using the SQL editor + service role, once, manually.
