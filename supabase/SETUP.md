# Swapngo — Database Setup & Migration Workflow

The schema lives in `supabase/migrations/` as version-controlled SQL. Nothing
is ever hand-typed into a dashboard SQL editor for a schema change — every
change is a new migration file, committed and pushed like any other code.
What the schema is and why it is shaped this way: [SCHEMA.md](SCHEMA.md).

## Environments

| Environment | Supabase project | Purpose |
|---|---|---|
| UAT / QA | `cndqvdskrcmivqflbttl` (Swapngo, ap-south-1) | Testing. Test data and the scripts in `scripts/` are allowed here. |
| Production | separate Supabase **account** | Real riders. Migrations only — never `seed.sql`, never `scripts/`. |

The old `Rent EV Scooters` project (`jeerugpvchfjlgssfoeb`) and its migrations
are retired; nothing in this folder targets it.

`config.toml` configures the **local** stack only. Hosted projects are chosen
with `supabase link --project-ref <ref>`; their auth, hooks, SMTP and secrets
are set in each project's dashboard / `supabase secrets set`.

## 1. One-time setup (per machine)

```bash
# Windows: scoop install supabase   (or run every command via `npx supabase`)
# macOS:   brew install supabase/tap/supabase
supabase --version
supabase login          # opens a browser
```

Docker Desktop is needed only for the local stack (`supabase start`,
`db reset`). Linking and pushing to a hosted project do not need it.

## 2. Local loop

```bash
supabase start          # local Postgres, Studio at http://localhost:54323, Auth
supabase db reset       # applies every migration from zero, then seed.sql
```

`db reset` is the "does the folder build a database from nothing" test. Run it
after pulling a new migration and before opening a PR that adds one.

## 3. Making a schema change

```bash
supabase migration new add_vehicle_insurance_reminder_flag
# edit the generated file — plain SQL
supabase db reset       # test locally
git add supabase/migrations/*.sql && git commit
```

Rules:
- **Never edit a migration that has been applied anywhere.** Write a new one
  that corrects it. (Exception made once, 2026-10-05, during the UAT/prod
  split — see "History" below.)
- **Filename order is apply order**, and every version prefix must be unique.
  Always use `supabase migration new`; never hand-name a file.
- **Reference data every environment needs goes in a migration** (permissions,
  notification types, …). Test data goes in `seed.sql` (local only).
- **Data fixes for specific UAT rows do not go in this folder.** A migration
  naming a row id will fail or misbehave on production. Run those in the UAT
  SQL editor instead.

## 4. Applying to a hosted project

```bash
supabase link --project-ref <ref>
supabase db push --dry-run   # shows exactly what would run
supabase db push
```

Always UAT first, then production. `db push` compares this folder with the
project's `supabase_migrations.schema_migrations` table and applies what is
missing, in order. Manual pushes are for emergencies; the normal path is CI.

**CI** — `.github/workflows/deploy-migrations.yml`:

| Event | Job | Target |
|---|---|---|
| PR into `develop` touching `supabase/**` | `uat-plan` — `db push --dry-run` | UAT, nothing applied |
| Push to `develop` | `uat-deploy` — `db push` + `functions deploy` | UAT |
| Push to `main` | `prod-plan` — `db push --dry-run` | production, nothing applied |
| …then | `prod-deploy` — waits for approval, then `db push` + `functions deploy` | production |

Flow: feature branch → PR → `develop` (UAT) → test → PR `develop` → `main`
→ read `prod-plan`'s log → approve `prod-deploy`.

GitHub → Settings → Environments, each holding `SUPABASE_ACCESS_TOKEN`,
`SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID`:
`uat` (UAT account), `production-plan` and `production` (prod account; both
restricted to branch `main`; `production` has the required reviewer).
CI does not set Auth settings, Vault secrets or function secrets — those are
one-time per environment.

## 5. History — why UAT needs a one-off repair

Until 2026-10-05 migrations were applied to UAT through the MCP/SQL editor,
which recorded them under different version numbers than the files
(e.g. UAT has `20260818231236_helpers`, the file is
`20260819100200_helpers.sql`), and some files were applied without being
recorded at all. On 2026-10-05:

- `supabase/v2/migrations` became this folder; the old project's folder was
  deleted.
- Two files dated before `extensions` and four duplicate version prefixes
  were renamed (`…102610`, `…102620`, `…100001`, `…100101`, `…100201`,
  `…100001`) so the folder applies cleanly from zero.
- `20260904155921_legal_documents.sql` was restored (it had been committed to
  the old folder) and `20261005100000_reconcile_uat_drift.sql` restates the
  function definitions that had drifted on UAT.
- `20260915110000_render_keepalive_temporary.sql` was made opt-in (it had the
  UAT backend URL hardcoded).

Before the first `db push` to UAT, its history table must be rewritten to
match this folder (95 versions marked applied; `20261005100000` left for the
first deploy to apply). Until then, `db push` against UAT will refuse to run.
The old rows are kept in `supabase_migrations.schema_migrations_backup_20261006`.

## 6. Operational notes

- **Riders with financial history cannot be hard-deleted from Auth.**
  `bookings`, `subscriptions`, `rentals`, `invoices`, `payment_orders` and
  `refunds` reference `users` with `ON DELETE RESTRICT`. Erasure requests use
  `public.anonymise_user(uuid, uuid)` — see
  `apps/backend/src/modules/privacy/privacy.erasure.ts` and
  [docs/dpdpa/README.md](../docs/dpdpa/README.md).
- **Append-only tables** — `audit_logs`, `pii_access_log`, `consent_records`,
  `payment_transactions`, `payment_allocations` — reject UPDATE and DELETE by
  trigger, for the service role too. DELETE is allowed only inside a
  transaction that sets `app.purge_mode = 'on'` (the retention functions and
  the test scripts do this).
- **Invoice series must be rolled over every financial year.** Invoice
  numbers come from the single active `invoice_series` row
  (`SNG-FY2627` → `SNG/2627/000001`…). Nothing creates next year's row; before
  1 April add it and deactivate the old one in the same transaction:
  ```sql
  begin;
  update public.invoice_series set is_active = false where code = 'SNG-FY2627';
  insert into public.invoice_series (code, financial_year, prefix)
  values ('SNG-FY2728', '2027-28', 'SNG/2728/');
  commit;
  ```
- **The first admin has no self-serve path.** After the person signs in once
  (the auth trigger creates their `public.users` row as a rider), run in the
  SQL editor — both statements in one transaction, because the role/profile
  check is deferred to commit:
  ```sql
  begin;
  insert into public.staff_profiles (user_id, staff_code)
  select id, 'STF-ADMIN-01' from public.users where email = 'admin@example.com';
  update public.users set role = 'admin' where email = 'admin@example.com';
  commit;
  ```
  Then register the Custom Access Token hook (Dashboard → Authentication →
  Hooks → `public.custom_access_token_hook`) if not already done, or the role
  never reaches the JWT.
- **Scheduled jobs need two Vault secrets** — `functions_base_url` and
  `service_role_key`. Without them every cron job logs a warning and does
  nothing.
- **Test scripts** in `scripts/` (`reset-rider-journey.sql`,
  `shift-plan-cycle.sql`, `delete-user-data.sql`) are for UAT only.
