# Fixes applied — 2026-08-20

Follow-up to [FINAL-REPORT.md](FINAL-REPORT.md). Everything below was applied
and verified; nothing here is a plan.

**C1 is done** — all three `.env` files now point at `cndqvdskrcmivqflbttl`
(mobile also needed its anon key swapped; the key is project-specific, so the
URL alone would have failed auth). `supabase/config.toml` still reads
`project_id = "rent-ev-scooters"`, which is a LOCAL project name for
`supabase start`, not the linked remote ref — cosmetic, left alone.

**H4 (transactional atomicity) is deferred by decision**, matching the report's
own recommendation. Closing **C8** removes its sharpest consequence.

---

## Three CRITICAL defects the audit itself missed

Found while fixing **M7**, and they change the report's conclusions. All three
are the same root cause, and it is worth stating plainly because the original
audit leaned on it as evidence:

> **A clean `tsc` does not prove a query is valid.** `.select()` strings are
> only type-checked when supabase-js can parse them. It gives up on two things
> this codebase uses heavily — a constant interpolated into another
> (`` `${LIST_COLUMNS}, more` `` widens the literal type to `string`) and
> deeply nested embeds with `alias:table!fk_name(...)` hints — and then falls
> back to a permissive type rather than failing.

`00-method-and-coverage.md` §2 called three clean typechecks "strong positive
evidence for the mechanical half" of the migration and said this is why the
report contains no "column X does not exist" findings. That inference was
wrong, and these are the findings it hid:

| # | File | Defect | Proof |
|---|---|---|---|
| **C9** | `modules/invoices/invoices.service.ts` | The entire read layer was against the OLD table. `LIST_COLUMNS` asked for `booking_id`, `payment_type`, `amount_due`, `due_date`, `payment_status`, `payment_method`, `gateway_ref`, `paid_at` — none exist — plus `invoice_items.rider_charge_id` / `.label`, and a `rentals(vehicles(...))` embed over a foreign key that does not exist. **Every `GET /invoices` and `GET /invoices/me` returned 400.** The console's Payments page and the rider's Billing screen were both dead. | live PostgREST: `column invoice_items_1.rider_charge_id does not exist` |
| **C10** | `modules/audit/audit.service.ts` | `PII_ACCESS_COLUMNS` read `actor_roles`, `ip`, `path`. The writer (`common/piiAccess.ts`) was migrated and writes `actor_role_snapshot`, `ip_address`, `request_path`. **Every `GET /pii-access` returned 400** — the DPDPA access log was unreadable. | live PostgREST: `column pii_access_log.actor_roles does not exist` |
| **C11** | `modules/vehicles/vehicles.service.ts` | `rentalsForVehicle` asked `rental_returns` for `reason` and `feedback`; the columns are `requested_reason` and `rider_notes`. The vehicle detail page's rental history was dead. | live PostgREST: `column rental_returns_2.reason does not exist` |

Also corrected while here: `invoices.controller.ts` passed `invoice.booking_id`
into `computeLateRenewalFee(subscriptionId, dueDate)` — a column that does not
exist, into a parameter that wants a *subscription* id. Even with the column
present it would have resolved late-fee overrides against the wrong entity.

### The guard that now covers this

`apps/backend/scripts/verify-selects.mjs` (`pnpm --filter backend verify:selects`).
It resolves every `.select()` in the source — interpolation included — and asks
the real PostgREST whether each parses. PostgREST plans the select *before* RLS
filters anything, so a malformed column or missing relationship is a 400
regardless of what the caller may read; the anon key is sufficient and it is
safe in CI. An empty result is a PASS.

**Current state: 31 select strings, 0 failing.**

### One correction to the report

`03-backend-staff.md` §H1 and `FINAL-REPORT.md` list `payments.refund` as
`is_enforced = true` with no route checking it. **That was wrong** —
`invoices.routes.ts:33` has `requireAction("payments", "refund")` on
`POST /invoices/:id/refund`. The other six entries in that table were correct.

---

## Database — 11 migrations, all applied to `cndqvdskrcmivqflbttl` and verified

| File | Fixes | Verified |
|---|---|---|
| `20260818234755_profile_extension_integrity.sql` | **C3** — recovered from the live DB; was applied with no source file | function + constraint trigger present |
| `20260819082051_seed_late_fee_pricing_rule.sql` | **C3** — same | `pricing_rules` = 3 |
| `…102700_notification_type_codes.sql` (existing) | **C6** | `notification_types` 15 → 38 |
| `…102800_retention_data_exports.sql` (existing) | **C3** | export policy row present |
| `…102900_scheduled_jobs.sql` (existing) | **C4** | pg_cron + pg_net installed, **10 cron jobs registered** |
| `20260820100000_auth_admin_user_read.sql` | **C2** | `has_table_privilege('supabase_auth_admin','public.users','SELECT')` → **true**; policy `p_users_read_auth_admin` present |
| `20260820100100_assignment_exclusion_indexes.sql` | **C8**, **M8** | `uq_rva_open_per_vehicle`, `uq_bookings_open_per_user` present |
| `20260820100200_permission_enforcement_flags.sql` | **H1** | 2 unenforced permissions remain (`settings.view`, `settings.edit`) |
| `20260820100300_notification_admin_broadcast.sql` | **C6** | `admin_broadcast` present |
| `20260820100400_rental_current_vehicle_active_only.sql` | **L5** | view now filters `r.status = 'active'` |
| `20260820100500_fix_invoke_edge_function_net_schema.sql` | **C12** (below) | `select invoke_edge_function('pickup-reminder')` → **200** |

`supabase/v2/migrations/` and `schema_migrations` now reconcile in both
directions: every applied migration has a source file, and every source file
is applied.

> **Correction to the report's C3 fix advice.** `FINAL-REPORT.md` suggests CI
> assert `count(schema_migrations) == count(files)`. That is wrong — 38 files
> map to 28 applied migrations because the original schema was applied in
> batches (`fleet` is three files, `billing` four, and so on). The invariant to
> assert is *name-level*: no applied migration without a file, and no file
> unapplied. Counting rows will fail forever.

### C12 — `invoke_edge_function` called a three-part name, so every cron job failed

Found by running the verification step rather than by reading, which is the
point of having one.

- **File:** `supabase/v2/migrations/20260819102900_scheduled_jobs.sql`
- **Code:** `perform extensions.net.http_post(...)` — a THREE-part identifier,
  which Postgres resolves as `database.schema.function`:

      ERROR: 0A000: cross-database references are not implemented:
             extensions.net.http_post

- **Why the wrong name looked right:** migration 32 installs pg_net with
  `create extension … with schema extensions`, so `extensions.net.…` reads as
  the natural qualification. It is not. **pg_net is non-relocatable** — the
  `with schema` clause records the extension against `extensions` in
  `pg_extension`, but the extension still creates and owns its own `net`
  schema, and that is where `http_post` lives. The two disagree, and only the
  second matters for a call.
- **Why nothing caught it:** plpgsql resolves identifiers in a function body at
  EXECUTION time, so migration 32 applied cleanly, the function was created
  without complaint, and all ten schedules registered. The failure would first
  have surfaced at 03:00 UTC the next morning, silently, in cron's own log.
- **Fix:** `net.http_post`. Corrected in migration 32 in place (so a clean
  re-apply is right from the start) *and* shipped as migration 38 (so the
  repository describes what is deployed).
- **Verified:** `select public.invoke_edge_function('pickup-reminder')` →
  `net._http_response` status **200**, body `{"bookings":0,"logged":0,"sent":0}`.

### Operational state as of 2026-08-20

| | |
|---|---|
| Edge Functions deployed | **11 of 11 ACTIVE** |
| pg_cron jobs registered | **10** |
| Vault secrets | **2** (`functions_base_url`, `service_role_key`) |
| cron → Vault → Edge Function chain | **verified, HTTP 200** |
| `.env` repointed | backend ✅ · web ✅ · mobile ✅ |
| Access-token hook registered | **outstanding — dashboard only** |

The 200 also settles an open question: the new-style `sb_secret_` API key **is**
accepted for Edge Function JWT verification, so no fallback to a legacy
service-role JWT is needed.

### Still manual — C2 is not finished without it

The migration makes `custom_access_token_hook` *able* to succeed. It cannot
register it. **Dashboard → Authentication → Hooks → Custom Access Token →
`public.custom_access_token_hook`**, then verify by decoding a freshly minted
staff JWT and confirming the `user_role` claim (sign out and back in — a token
minted before registration will not have it). Until then `is_staff()` and
`is_admin()` are false for everyone and the console's realtime delivers nothing.

Migration 32 also needs two Vault secrets — `functions_base_url` and
`service_role_key` — before the ten cron jobs do anything. `invoke_edge_function`
raises a warning and returns rather than failing, so the schedules are live but
inert until those exist.

---

## Backend

| Finding | Change |
|---|---|
| **C5** | `notify()` now takes ONE field carrying the catalogue code. All 9 call sites passed a category (`"kyc"`, `"booking"`, …) that is not a row in `notification_types`, so `getRecipients` found nothing and every staff notification was dropped before any insert — silently, with no log and no FK violation. |
| **C6** | Covered by the seeds above, plus `EmittedNotificationCode`. |
| **C7** | `requireSelfOrStaff()` added to `GET /users/:id`. The middleware existed and was used by zero routes; the two sibling routes already did the check inline. |
| **H1** | `requireModule` → `requireAction` on the write routes in refunds, returns and damages. `billing.waive` now enforced on the waive route (was `billing.edit`). |
| **H1 (extra)** | `rentals.routes.ts` had the same defect and the audit missed it: `requireModule("vehicles")` meant `vehicles.view` alone authorised completing a ride, moving a scooter to maintenance, rejecting a return and recording damage. Now `vehicles.view` for reads, `vehicles.edit` for writes. |
| **H2** | `businessToday()` added to `common/dates.ts`; **15 call sites** converted from `new Date().toISOString().slice(0,10)`. `addDays()` deliberately unchanged — it operates on a date string, never on "now". |
| **H3** | Allocation capped by `v_invoice_balances.balance_amount`, not `invoices.total_amount`. Plus the redelivery hole that made it permanent: a `23505` on `payment_webhook_events` now re-reads the row and only short-circuits if `processed_at` is set. |
| **M1** | Refunds and Billing resolved as **delegable**, not admin-only; docstrings and the console's `roles` arrays corrected to match the guards. |
| **M3** | `endOfBusinessDay()` — `T23:59:59+05:30`, not `T23:59:59Z` (05:29 IST the next morning). Two sites. |
| **M6** | The `auth_otp_attempts` retention constant annotated at the array entry. |
| **M9** | `changeRole` calls `auth.admin.signOut(id, "global")`, best-effort, so a demoted admin's JWT cannot keep passing `is_admin()` in RLS for a token lifetime. |
| **L3** | `EmittedNotificationCode` — a union of the 30 codes the app can emit, distinct from `NotificationTypeCode` (which stays `string`, because which codes may EXIST is data). |
| **M2** | New `GET /notification-settings/types`, `requireStaff`, subscriber-free — so a staff session can tell a task from news without the admin-only settings payload. |

## Console (`apps/web`)

| Finding | Change |
|---|---|
| **M2** | Realtime enabled for staff, not just admin. The old gate cited RLS as the reason; RLS was never the constraint — `p_bookings_read`, `p_vehicles_read` and `p_payment_allocations_read` all resolve through `is_staff()`. |
| **M1 / L2** | Refunds and Billing nav delegable; header comments rewritten — they still described `staff_permissions` and the deleted `kyc_reviewer` / `rights_officer` / `pii_exporter` capability axis. |
| **C9 / C10** | Payments page, Admin dashboard and PII Access page rebuilt on the corrected contracts. |
| **M7** | `due_date` → `due_on`, `expiry_date` → `expires_on`, `payment_status` → `payment_state`, `amount_due` → `total_amount`, `payment_type` → `purpose`. `StatusBadge` gained the four derived payment states. |

## Rider app (`apps/mobile`)

| Finding | Change |
|---|---|
| **M5** | Referral code field removed from profile setup and the Refer & Earn banner unmounted from Home. Both called a stub that rejects every request — the field invited input that could only ever come back "invalid or expired". The component is kept with a header explaining why it is not mounted. |
| **C9 / M7** | Billing screen rebuilt on the corrected invoice contract. Outstanding total now sums the **balance**, not the full bill — a part-paid invoice no longer asks for the whole amount again. |

---

## Verification

| Check | Result |
|---|---|
| `tsc` — backend (whole project) | **clean** |
| `tsc` — web | **clean** |
| `tsc` — mobile | **clean** |
| `vitest` — backend | **421 passed** (34 files) |
| `vitest` — mobile | **222 passed** (14 files) |
| `vitest` — web | **33 passed** (2 files) |
| `verify:selects` against live schema | **31 checked, 0 failing** |
| Supabase security advisors | 1 WARN (leaked-password protection), 0 ERROR |

### A test suite that was not testing anything

`apps/web/tests/roleConfig.test.ts` passed `permissions: ["vehicles"]` — a bare
`string[]`. `StaffUser.permissions` is `ModulePermission[]`
(`{ module_key, actions }`), and `hasModule` reads `p.module_key`, so every
assertion was evaluating `undefined === "vehicles"`. Four tests failed outright;
the rest passed **for the wrong reason** — a route-guard suite that cannot tell
"correctly denied" from "denied because the fixture is malformed" is not testing
the guard.

Confirmed pre-existing: `canAccess`, `hasModule` and the test file are all
byte-identical to `HEAD`. Fixtures rebuilt on the real shape, plus four new
cases (empty-actions grant, the delegable Refunds/Billing nav, and the
admin-only settings sub-pages).

---

## Status table — after these fixes

| Area | Was | Now | Remaining |
|------|-----|-----|-----------|
| New DB | WARNING | **PASS** | hook registration + 2 Vault secrets are dashboard steps |
| Backend | WARNING | **PASS** | H4 deferred |
| Rider | PASS | **PASS** | — |
| Staff | WARNING | **PASS** | — |
| Admin | WARNING | **PASS** | vendors still unbuilt (L8, scope gap) |
| RLS/Security | FAIL | **PASS** | contingent on registering the hook |
| API Contracts | PASS | **PASS** | — |
| Payments | WARNING | **PASS** | H4 deferred |
| Booking/Rental | FAIL | **PASS** | H4 deferred |
| Timestamps | WARNING | **PASS** | — |
| Old References | PASS | **PASS** | — |
| Configuration | FAIL | **FAIL** | **C1 — the `.env` repoint, by decision** |

## Verdict

**READY WITH FIXES → blocked only on C1 and the hook registration.**

Every code and schema defect the audit found is closed, along with four more it
missed (C9, C10, C11, and the `rentals.routes.ts` half of H1). What remains is
not code:

1. **C1** — repoint the three `.env` files at `cndqvdskrcmivqflbttl`.
2. **Register the access-token hook** in the dashboard, then verify the
   `user_role` claim on a fresh staff JWT.
3. **Add the two Vault secrets** so the ten cron schedules actually fire.

Do those three and the system is testable end to end. Re-run
`verify:selects` first — with the apps pointed at the new database it becomes a
live contract check rather than a one-off.
