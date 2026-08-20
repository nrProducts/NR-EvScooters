# 0 — Method and coverage

**Audit date:** 2026-08-20 · **Branch:** `db-architecture-refactor` · **Nothing was modified.**

## What "the new database" means here

| | Project | Ref | Role in this audit |
|---|---|---|---|
| Old | Rent EV Scooters | `jeerugpvchfjlgssfoeb` | Reference only. `supabase/migrations/` (71 files). |
| **New** | **Swapngo** | **`cndqvdskrcmivqflbttl`** | The target. `supabase/v2/migrations/` (32 files). **Queried live during this audit.** |

The new project was inspected *directly* — `information_schema`, `pg_policy`, `pg_proc`,
`pg_indexes`, `pg_constraint`, `pg_roles`, `supabase_migrations.schema_migrations`, and the
Supabase security advisors — rather than inferred from the migration files. Where the files and the
live database disagree, that disagreement is itself a finding.

## Techniques used

1. **Live schema extraction** — 62 tables, 6 views, 33 functions, 53 enums, all unique indexes on
   the concurrency-critical tables, all FK/CHECK constraints, all 62 RLS policies, and every
   function `EXECUTE` grant.

2. **Whole-program typecheck** of all three applications:

   | App | Command | Result |
   |---|---|---|
   | `apps/backend` | `tsc -p tsconfig.json --noEmit` | **clean** |
   | `apps/web` | `tsc --noEmit` | **clean** |
   | `apps/mobile` | `tsc --noEmit` | **clean** |

   This matters more than usual here. `supabaseAdmin` and both browser clients are
   `createClient<Database>` over a `database.types.ts` generated from the new schema, so **every
   `.from(table).select("col, col")` string is type-checked against the live 62-table schema.** A
   wrong table name or a wrong column name in a query is a compile error. Three clean typechecks
   are therefore strong positive evidence for the mechanical half of "does the code match the new
   database" — and they are why this report contains no findings of the form "column X does not
   exist".

   > Incidental: `apps/backend/tsconfig.parts/README.md` documents that a whole-project check needs
   > more than 3.4 GB of heap and cannot complete on this machine. That is no longer true — the
   > project is on `typescript@^7` and the full check completed. The split-slice machinery is now
   > optional rather than necessary.

3. **Query-surface extraction** — every `.from("…")` and `.rpc("…")` in `apps/backend`,
   `apps/web`, `apps/mobile` and `supabase/functions`, cross-referenced against the live table,
   view and function lists.

4. **Route-guard extraction** — every `router.<verb>(...)` across all 31 backend modules parsed and
   classified by which authorisation middleware it carries; every `requireAction(module, action)`
   pair cross-referenced against the live `public.permissions` catalogue.

5. **Targeted reading** of the critical paths: checkout → payment → subscription → pickup → rental
   → return → settlement → refund; the auth and authorization middleware; the notification fan-out;
   the RLS, helper and operational-function migrations; and the two direct-database surfaces in the
   admin console.

## What this audit does NOT claim

- It is **not** a line-by-line read of all ~21k LOC of backend or all 21 console page groups.
  Modules not named in a finding were checked at the query, route, type and permission level
  (techniques 1–4), not read in full. A logic bug inside an unnamed module's handler body would not
  necessarily have been caught.
- **No test was executed and no flow was exercised end to end**, because the applications cannot
  currently reach the new database at all — see finding **C1**. Every behavioural statement in this
  report is derived from code and schema, not from observation.
- Whether the Custom Access Token hook is *registered* in the Supabase dashboard cannot be read over
  SQL. Finding **C2** shows that it cannot succeed even if it is registered.
