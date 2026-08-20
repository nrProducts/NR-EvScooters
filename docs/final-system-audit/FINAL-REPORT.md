# FINAL REPORT — Full system consistency audit

**Date:** 2026-08-20 · **Branch:** `db-architecture-refactor`
**Nothing was modified** at the time this report was written. No code, no schema,
no migration, no configuration, no data.

> ## ⚠️ SUPERSEDED — see [FIXES-APPLIED.md](FIXES-APPLIED.md)
>
> These findings have since been fixed and verified. Read this report for the
> analysis; read `FIXES-APPLIED.md` for what is actually true of the codebase
> now.
>
> Two corrections to what is below:
>
> 1. **`payments.refund` IS enforced** — `invoices.routes.ts:33` has
>    `requireAction("payments", "refund")`. It is listed in the H1 table as
>    unenforced; that entry is wrong. The other six are correct.
>
> 2. **Three CRITICAL defects were MISSED**, and the reason matters.
>    §00 argues that three clean typechecks make column-level errors
>    impossible, which is why no finding below is of the form "column X does
>    not exist". That inference is wrong: a `.select()` string is only
>    type-checked when supabase-js can parse it, and it silently gives up on
>    interpolated constants and on nested `alias:table!fk(...)` embeds. Hidden
>    behind that: the whole `invoices` read layer, the PII access log read, and
>    the vehicle rental-history embed were all querying the OLD schema and
>    returning 400. See C9–C11 in `FIXES-APPLIED.md`.

**New database audited live:** `Swapngo` — `cndqvdskrcmivqflbttl` (62 tables, 6 views, 33 functions,
53 enums, 62 RLS policies).
**Surfaces audited:** `apps/backend` (Express API), `apps/mobile` (Rider), `apps/web`
(Staff + Admin console), `supabase/functions` (10 Edge Functions).

Method, tooling and the explicit limits of this audit's coverage are in
[00-method-and-coverage.md](00-method-and-coverage.md). In short: the live database was queried
directly, all three applications typecheck cleanly against generated types, and every query, route
guard and permission was extracted and cross-referenced mechanically before anything was read by
hand.

---

## Status table

| Area | Status | Critical Issues | Warnings |
|------|--------|-----------------|----------|
| New DB | **WARNING** | C3 (migration drift, both directions), C4 (no scheduled jobs) | C8's missing index; `admin_broadcast` missing from both seeds; GST not modelled |
| Backend | **WARNING** | C5 (all staff notifications silently dropped), C6 (20/26 rider notification codes absent) | H1, H2, H3, H4, M3, M8 |
| Rider | **PASS** | — | C6 blocks notifications; M5 referrals screen permanently errors; M8 double-booking |
| Staff | **WARNING** | — | H1 (`*.view` grant carries write power), M1, M2 |
| Admin | **WARNING** | C5 (Notification Manager configures codes nothing looks up) | L8 vendors unbuilt; M9 stale role claim |
| RLS/Security | **FAIL** | C2 (`is_staff()`/`is_admin()` can never be true), C7 (IDOR on `GET /users/:id`) | M9 |
| API Contracts | **PASS** | — | M7 (`due_date`/`expiry_date` keep old vocabulary) |
| Payments | **WARNING** | — | H3 (allocation capped by total, not balance — money can be captured and never allocated), H4 |
| Booking/Rental | **FAIL** | C8 (two riders can hold the same scooter) | M8, L5 |
| Timestamps | **WARNING** | — | H2 (UTC "today" in 14 places), M3 |
| Old References | **PASS** | — | M6 (one table-less retention constant) |
| **Configuration** | **FAIL** | **C1 (all three apps point at the OLD database)** | `supabase/config.toml` still linked to old project |

---

## CRITICAL ISSUES

### C1 — All three applications are configured against the OLD database

- **File:** `apps/backend/.env`, `apps/web/.env`, `apps/mobile/.env`
- **Code/value:** `SUPABASE_URL` / `VITE_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_URL` =
  `https://jeerugpvchfjlgssfoeb.supabase.co`. `supabase/config.toml` also still carries
  `project_id = "rent-ev-scooters"`.
- **Current behaviour:** the applications, fully rewritten for the new 62-table schema, connect to a
  database that has none of it. Every request fails at the first query.
- **Expected:** `https://cndqvdskrcmivqflbttl.supabase.co` with the matching anon and service-role
  keys.
- **Why it is wrong:** this alone makes the system untestable end to end. Every other finding in
  this report is currently unobservable because of it.
- **Fix:** repoint all three `.env` files and the CI/deploy environments; decide explicitly what
  `supabase/config.toml` should link to.

### C2 — The access-token hook cannot read `public.users`, so `is_staff()` and `is_admin()` can never return true

- **File:** `supabase/v2/migrations/20260819100200_helpers.sql:92-115` (hook),
  `supabase/v2/migrations/20260819102500_revoke_internal_functions.sql:30-31` (grants)
- **Code:** the hook is `language plpgsql stable` — **not** `security definer` — and does
  `select u.role from public.users u where u.id = …`. The only grants written are `usage on schema
  public` and `execute on function` to `supabase_auth_admin`.
- **Verified live, four independent confirmations:**
  `has_table_privilege('supabase_auth_admin','public.users','SELECT')` = **false**;
  `prosecdef` = **false**; `pg_roles.rolbypassrls` for `supabase_auth_admin` = **false**;
  `rolsuper` = **false**; and `public.users` has exactly one policy, `to authenticated`.
- **Current behaviour:** if the hook **is** registered → `permission denied for table users` on
  every token mint → **nobody can log in at all**. If it is **not** registered → no `user_role`
  claim → `current_role_name()` falls back to its `'rider'` default → `is_staff()` and `is_admin()`
  are false **for everyone including admins** → every RLS policy predicated on them denies,
  silently, as an empty result rather than an error.
- **Expected:** `grant all on table public.users to supabase_auth_admin;` plus a permissive
  `for select to supabase_auth_admin using (true)` policy — the Supabase-documented shape — or make
  the function `security definer`.
- **Why it is wrong:** this is the single load-bearing dependency of the entire database
  authorisation layer. 20+ of the 62 policies resolve through it, and it is the only control on the
  admin console's realtime channels and direct read.
- **Fix:** add the grant and the policy, register the hook, then verify by decoding a freshly minted
  staff JWT and confirming the `user_role` claim is present.

### C3 — Repository and database have drifted apart, in both directions

- **File:** `supabase/v2/migrations/` (32 files) vs `supabase_migrations.schema_migrations` (19 rows)
- **Not applied:** `…102700_notification_type_codes` (live `notification_types` = **15**, not 38),
  `…102800_retention_data_exports` (export policy rows = **0**),
  `…102900_scheduled_jobs` (`pg_cron` **not installed**; `cron.job` does not exist).
- **Applied with no source file:** `20260818234755_profile_extension_integrity` (the live function
  `assert_profile_matches_role` cannot be rebuilt from the repo) and
  `20260819082051_seed_late_fee_pricing_rule`.
- **Why it is wrong:** the migration directory is supposed to *be* the schema. A clean re-apply today
  produces a materially different database from the one that exists.
- **Fix:** apply 30/31/32; export the two orphans into the directory with their applied timestamps;
  assert file-count == applied-count in CI.

### C4 — No scheduled job runs at all

- **File:** `supabase/v2/migrations/20260819102900_scheduled_jobs.sql` (never applied);
  `supabase/functions/` (10 functions, all correctly rewritten for the new schema, none invoked)
- **Current behaviour:** booking holds never expire; abandoned checkouts leave **`active`
  subscriptions with unpaid invoices forever** (`payments.service.ts:38-43` names
  `cancelAbandonedSubscription` as the mitigation, and nothing calls it); `subscription_periods`
  inserted as `scheduled` are never promoted to `current`, so after the first renewal `confirmPickup`
  refuses with *"This subscription has no current billing period"*; no payment reminders, no overdue
  sweep, no refund-eligibility sweep, no retention purge.
- **Expected:** pg_cron + pg_net installed, ten schedules registered.
- **Why it is wrong:** several core invariants are maintained *only* by these sweeps, not by the
  schema. The data will drift into states the application cannot recover from on its own.
- **Fix:** apply migration 32 after confirming the Vault secret it reads by name exists.

### C5 — Every staff and admin notification is silently discarded

- **File:** `apps/backend/src/modules/notifications/notify.service.ts:74-125,159-180`;
  `apps/backend/src/modules/notification-settings/notification-settings.service.ts:155-180`
- **Code:** call sites pass a **category** where a catalogue code is required —
  `notify({ notificationType: "kyc", …, template: "kyc_review_needed" })`. The seven values ever
  passed are `booking, cancellation, damage, kyc, maintenance, refund, return`. **None is a row in
  `notification_types`**, in the live 15 or in the 23 migration 30 would add. The real code sits in
  the adjacent `template` field and is buried in `payload`.
- **Current behaviour:** `getRecipients(type)` finds no matching type, returns
  `{ sendEmail:false, sendInApp:false, recipients:[] }`, and `notify()` returns at
  `if (recipients.length === 0) return;` — **before** it ever attempts an insert. No error, no log,
  no foreign-key violation, no notification. KYC review needed, maintenance ticket created, return
  requested, refund needs approval, damage recorded, booking created: **all gone.**
- **Expected:** `notificationType` should carry the catalogue code. The `notification_types` rows for
  those codes exist in migration 30 with the correct `default_audience:'staff'`,
  `requires_action:true` and `action_path` — the schema is already built for it; only the caller
  disagrees.
- **Why it is wrong:** it is invisible from every direction. The Notification Manager shows a healthy
  catalogue with subscribers attached, the business modules report success, and the console's entire
  approval-popup / task-queue mechanism — the reason `requires_action` and `action_path` exist — is
  dead.
- **Fix:** collapse `notificationType` and `template` into one field carrying the code, at all call
  sites; apply migration 30; then narrow `NotificationTypeCode` (L3) so it cannot recur.

### C6 — 20 of the 26 rider notification codes do not exist in the database

- **File:** `apps/backend/src/modules/notifications/notifications.service.ts:140-175`
  (`notifyUser`), `:285-335` (`broadcastNotification`)
- **Code:** `notification_type_code` is FK'd `ON DELETE RESTRICT` to `notification_types.code` on
  both `notification_events` and `notification_messages` (verified live).
- **Current behaviour:** the live catalogue has 15 codes; the backend emits 26; **20 do not exist**,
  including `pickup_confirmed`, `payment_success`, `rental_completed`, `vehicle_assigned`,
  `refund_initiated`, `refund_completed`, `damage_added` and all five maintenance codes. `notifyUser`
  catches and logs, so the rider's inbox is simply empty.
- **Additionally:** `admin_broadcast` is missing from **both** migration 27 and migration 30, and
  `broadcastNotification` uses `.single()` — so admin broadcasts will **500**, not degrade, even
  after C3 is fixed.
- **Fix:** apply migration 30; **add an `admin_broadcast` row**; narrow the type (L3).

### C7 — `GET /users/:id` has no authorisation check (IDOR on the most PII-dense endpoint)

- **File:** `apps/backend/src/modules/users/users.routes.ts:52-56`;
  `users.controller.ts:19-35`; `users.service.ts:214-227`
- **Code:** the route carries `validate({ params })` and nothing else — no `requireAction`, no
  `requireSelfOrStaff`. The only gate in the service is
  `if (row.deleted_at && actor.role !== "admin") throw notFound(...)`.
- **Current behaviour:** **any authenticated user, including any rider, can read any other user's
  full profile by UUID** — name, email, phone, date of birth, gender, role, status, full postal
  address, emergency-contact name and phone, KYC status, assigned vehicle, current plan and payment
  status. The handler then writes a `pii_access_log` row, so the disclosure is recorded as
  legitimate.
- **Expected:** the pattern already used **twice on the same router** —
  `if (id !== req.user!.id && !isStaff(req)) throw forbidden(...)`
  (`users.controller.ts:84` and `:188`). The purpose-built middleware `requireSelfOrStaff`
  **exists** at `authorize.middleware.ts:145-152` and is used by **zero routes**.
- **Why it is wrong:** UUIDs are not secrets — riders receive other users' ids through support
  threads, damage disputes and booking payloads. Under DPDPA this is an unauthorised disclosure, and
  the access-log entry makes it look authorised.
- **Fix:** add `requireSelfOrStaff()` to the route.

### C8 — Nothing prevents one vehicle being on two active rentals

- **File:** `supabase/v2/migrations/20260819101100_commercial_rentals.sql:61-62`;
  `apps/backend/src/modules/vehicles/vehicles.service.ts:661-670`;
  `apps/backend/src/modules/bookings/bookings.service.ts:1449-1450`
- **Code:** two service files document the guarantee explicitly — *"A partial unique index permits
  only one open (`released_at IS NULL`) assignment per vehicle"* and *"The unique index on open
  assignments is what makes this the real mutual exclusion."*
- **Verified live:** the complete set of unique indexes on `rental_vehicle_assignments` is
  `rental_vehicle_assignments_pkey` and `uq_rva_open_per_rental` — which constrains **`rental_id`**,
  not `vehicle_id`. The index both comments describe **does not exist**. The only other index on
  `vehicle_id` is the non-unique `idx_rva_vehicle`.
- **Current behaviour:** two staff members confirming two different bookings onto the same scooter —
  one via `confirmPickup`'s manual `input.vehicle_id` override, one via `assignVehicleToUser` —
  both read `vehicles.status = 'available'`, both insert an assignment, both succeed. Two riders hold
  one physical scooter; `v_rental_current_vehicle` returns two rows for it. The check-then-act read
  between them is two HTTP round trips wide.
- **Expected:**
  ```sql
  create unique index uq_rva_open_per_vehicle
      on public.rental_vehicle_assignments (vehicle_id) where released_at is null;
  ```
- **Why it is critical:** it is exactly the scenario the brief asks about, the code believes it is
  protected, and **both call sites already handle the `23505` this index would raise, with the
  correct message and the correct compensating writes.** The error handling was written; the index
  was not.
- **Fix:** create the index. No application change is needed.

---

## HIGH ISSUES

### H1 — A `*.view` grant carries write power in refunds, returns and damages

- **File:** `refunds.routes.ts:11`, `returns.routes.ts:11`, `damages.routes.ts:38-45`
- **Code:** `router.use(requireAuth, requireModule("refunds"))` — `requireModule` is documented at
  `authorize.middleware.ts:60-73` as the *coarse* gate, "does the caller hold **any** permission
  within the module".
- **Current:** `refunds.view` alone authorises `POST /refunds` and `POST /refunds/:id/retry`;
  `returns.view` alone authorises `POST /returns/:id/approve`; `damages.view` alone authorises
  `POST /damages/:id/resolve`.
- **Expected:** `requireAction("refunds","approve")`, `requireAction("returns","approve")`,
  `requireAction("damages","edit")`.
- **Why it is wrong:** those permissions **exist in the live catalogue with `is_enforced = true`** —
  a flag documented (`types/index.ts:91-96`) as meaning "a route actually checks this". So the
  permission matrix actively tells an administrator that granting *Refunds — view* is read-only, and
  it is not. The same is true of `payments.refund`, `billing.waive`, `settings.view` and
  `settings.edit`, none of which any route checks.
- **Fix:** switch the three write routes to `requireAction`; set `is_enforced = false` on the
  permissions nothing enforces.

### H2 — The backend computes "today" in UTC, not the IST business day

- **File:** 14 sites — `payments.service.ts:751`, `renewalFee.ts:43`, `returns.service.ts:337-338`,
  `deposits.service.ts:132,191`, `damages.service.ts:300,513`, `bookings.service.ts:1081`,
  `kyc.service.ts:86`, `refunds.service.ts:224`, `rentals.service.ts:452`, `users.service.ts:270`,
  `vehicles.service.ts:598`
- **Code:** `new Date().toISOString().slice(0, 10)`
- **Current:** between **00:00 and 05:30 IST every day**, this returns yesterday's date in IST terms.
  A renewal paid at 01:00 IST on the day after its due date is scored on time and no late fee is
  charged; the next period's `starts_on` is written as yesterday, shifting the subscription schedule
  back a day permanently; a settlement invoice is issued and due yesterday, i.e. born overdue; a
  deposit that became eligible today is invisible until 05:30; a KYC document expiring today is
  still valid.
- **Expected:** `business_today()`. The schema calls this **mandatory** for every date comparison
  (`helpers.sql:8-20`), and **the Edge Functions were fixed for it** —
  `supabase/functions/_shared/dates.ts:15-20` calls the RPC. The Express backend has no equivalent.
- **Why it is wrong:** half the system honours the rule and half does not, so the two halves
  disagree for 23% of every day. `common/dates.ts → addDays()` is correct and needs no change.
- **Fix:** add `businessToday()` to `apps/backend/src/common/dates.ts` calling the RPC (already
  granted); replace all 14 sites; lint the pattern.

### H3 — Payment allocation is capped by invoice total, not remaining balance — money can be captured and never allocated

- **File:** `apps/backend/src/modules/payments/payments.service.ts:630-640`
- **Code:** `const allocated = Math.min(input.amount, Number(invoice?.total_amount ?? input.amount));`
- **Current:** on a partly-paid invoice (`total 1000`, allocated `500`), a correctly-sized payment of
  `balance 500 + lateFee 100 = 600` allocates `min(600, 1000) = 600`, bringing allocations to 1100
  against a 1000 invoice. `assert_allocation_within_invoice` raises. The `payment_webhook_events`
  row was already committed, so Razorpay's redelivery hits the `gateway_event_id` `23505` branch and
  **returns early as "already seen"**. Net: money captured, `payment_transactions` row present,
  allocation permanently missing, invoice reads unpaid forever, nothing retries.
- **Expected:** cap by `v_invoice_balances.balance_amount` — the same source the order amount was
  computed from.
- **Fix:** change the cap; and only short-circuit on `23505` when the existing webhook row has
  `processed_at IS NOT NULL`; and reconcile on `processed_at is null`.

### H4 — No transactional atomicity anywhere in the backend

- **File:** structural — `bookings.service.ts:1416-1470`, `payments.service.ts:591-673`,
  `returns.service.ts:300-372`, `vehicles.service.ts:740-775`
- **Current:** every multi-row business operation is a sequence of independent PostgREST calls with
  hand-written compensating writes, which are themselves un-transacted. A process death between the
  `rentals` insert and the `rental_vehicle_assignments` insert leaves an **active rental with no
  vehicle attached** — which `vehicles.service.ts:765-767` correctly identifies as worse than no
  rental at all, because `recompute_vehicle_status` then leaves the scooter `available` while the
  rider believes they have it.
- **Expected:** the four operations that must be atomic — `confirmPickup`, `applyPaymentSuccess`,
  `assignVehicleToUser`, `approveReturnSettlement` — belong in `plpgsql` functions called by
  `.rpc()`, in the style migration 29 already established.
- **Why it matters:** this also resolves **C8** for free, since the whole sequence would hold its
  locks.

---

## MEDIUM ISSUES

| # | File | Issue | Fix |
|---|---|---|---|
| **M1** | `refunds.routes.ts:9`, `billing.routes.ts:9` | Docstrings say "Admin-only"; guards are delegable permissions. `roleConfig.ts` compounds it by listing both nav items as `roles:["admin"]` — frontend hiding, not security. Today the only thing keeping staff out is that nobody grants the permission. | Add `requireAdmin`, or correct both docstrings and the `roles` arrays. |
| **M2** | `RealtimeProvider.tsx:51-58` | Realtime hard-gated to `role === "admin"` with the comment *"the RLS on the published tables only passes realtime rows through to the 'admin' role"* — **factually wrong**. `p_bookings_read`, `p_vehicles_read` and `p_payment_allocations_read` all use `is_staff()`. Staff operators get no live pickup queue. | Allow `isStaffRole`, or keep the restriction and fix the comment. |
| **M3** | `bookings.service.ts:1407` | ``dueBackAt = `${nextDueAt}T23:59:59Z` `` turns an IST calendar day into 05:29:59 IST the *next* morning. Every rental gets 5½ free hours. | Use `T23:59:59+05:30`. |
| **M5** | `referrals.service.ts`, `routes/index.ts`, `apps/mobile/src/lib/api.ts` | Referrals are correctly out of scope and the stub is well reasoned — but **the rider app still ships the screen and still calls the endpoint**, so it is a visibly broken feature rather than an absent one. | Hide the entry point in `apps/mobile`. Leave the stub. |
| **M6** | `privacy/retention.constants.ts:75` | `{ category: "auth_otp_attempts", … }` — a retention policy for a table that does not exist. The only non-comment survivor of the old schema. Known and handled, but the live `retention_policies` (9 rows) should be reconciled against this list, especially since migration 31 was never applied. | Drop it, or annotate it. |
| **M7** | `invoices.types.ts`, KYC/vehicle-document surfaces (all 3 apps) | API DTOs keep old vocabulary: `due_date` ← `due_on`, `expiry_date` ← `expires_on`. Mappings are correct, but a `_date` suffix now means "could be either", defeating the schema's whole `_on`/`_at` distinction and producing 30+ false positives in any old-name grep. | Rename the DTO fields in one pass, or document the mapping in one place. |
| **M8** | `bookings.service.ts:578-589` | `hasActiveBookingForUser` is check-then-act with no supporting unique index. A double-tapped "Book now" creates two `pending_payment` bookings holding **two different scooters**, and checkout on both creates two subscriptions. | `create unique index uq_bookings_open_per_user on bookings (user_id) where status in ('pending_payment','confirmed');` and map 23505 to the existing 409. |
| **M9** | `helpers.sql:64-89` | `current_role_name()` reads a JWT claim stamped at mint. A demoted admin keeps `user_role: admin` in RLS for up to a token lifetime. The backend layer is unaffected (it re-reads the DB per request); the exposure is the 4 realtime tables plus 1 read. | Force global sign-out on role change. |

---

## LOW ISSUES

| # | File | Issue |
|---|---|---|
| **L1** | Supabase project settings | Leaked-password protection disabled (the only advisor finding on the whole project; zero ERROR-level lints). |
| **L2** | `apps/web/src/routes/roleConfig.ts:30-58` | Comments still describe the deleted `staff_permissions` table and the deleted DPDPA capability model (`kyc_reviewer`, `rights_officer`, `pii_exporter`). The code is correct; the documentation is a schema behind. |
| **L3** | `apps/backend/src/types/index.ts:168` | `export type NotificationTypeCode = string;` — no compile-time safety on the one field with a `RESTRICT` foreign key behind it. **This is why C5 and C6 both went unnoticed**, when every other table/column error in the codebase is a compile error. Derive it from `Enums` or generate a union from the catalogue. |
| **L4** | `supabase/config.toml:5` | `project_id = "rent-ev-scooters"` — still the old project. |
| **L5** | `20260819102100_views.sql` (`v_rental_current_vehicle`) | Filters only `a.released_at is null`, not `r.status = 'active'`. An assignment left open on a completed rental still reads as the rider's current vehicle — reachable given H4. |
| **L6** | `apps/backend/tsconfig.parts/README.md` | Documents that a whole-project typecheck needs >3.4 GB and cannot complete. On `typescript@^7` it now completes fine (verified). The split-slice machinery is optional, not necessary — and the README's warning that maintenance/support/app.ci "are NOT verified locally" no longer applies. |
| **L7** | `supabase/v2/README.md` "Manual steps" | Storage buckets (`kyc-documents`, `vehicle-photos`, `damage-photos`, `user-photos`), KYC encryption secrets and hook registration are manual and asserted nowhere. Nothing fails loudly if a bucket is missing. |
| **L8** | — | `public.vendors` is modelled with an RLS policy and referenced by `vehicle_models.vendor_id`, but no backend module reads or writes it and there is no console page. Vendors are creatable only by direct SQL. |

---

## The ten questions

**1. Is the NEW database correctly implemented?**
**Largely yes — the design is genuinely strong — but not correctly *deployed*.** All 62 tables have
RLS with a policy, all 6 views are `security_invoker`, writes are service-role-only everywhere,
money arithmetic is CHECK-enforced, snapshots are trigger-frozen, over-allocation and over-refund
take row locks before summing, and the RPC surface is locked down (verified against live
`has_function_privilege`, not assumed). Against that: three migrations were never applied and two
applied migrations have no source file (**C3**); the access-token hook cannot function (**C2**);
scheduled jobs do not exist (**C4**); and one documented uniqueness guarantee was never created
(**C8**).

**2. Is the backend correctly updated?**
**Structurally yes, behaviourally no.** Every table, column, view and RPC it touches is
new-schema-correct — proven by a clean whole-project typecheck against generated types, which makes
that a mechanical certainty rather than an opinion. But the notification layer is entirely dead
(**C5**, **C6**), the IST business-day rule is not honoured (**H2**), one authorisation check is
missing outright (**C7**), and three write endpoints are under-guarded (**H1**).

**3. Is Rider correctly updated?**
**Yes.** Zero direct database access — REST only, exactly as the RLS trust model assumes. Every
endpoint it calls exists. Its problems are inherited: no notifications (**C6**), a permanently
erroring referrals screen (**M5**), and a double-booking race (**M8**).

**4. Is Staff correctly updated?**
**Mostly.** Every feature maps UI → API → backend → database correctly. The authorisation model —
role and permissions read fresh from the database per request, never from the JWT — is well built.
The defects are that a `*.view` grant silently carries write power in three money-touching modules
(**H1**), that "admin-only" is convention rather than control in two more (**M1**), and that staff
receive no realtime for a reason that is stated incorrectly (**M2**).

**5. Is Admin correctly updated?**
**Yes at the backend layer** — 14 non-delegable endpoints are `requireAdmin`, and the admin
short-circuit is consistent across middleware, view and console. **No at the database layer**, until
**C2** is fixed. The Notification Manager is a working UI over a mechanism nothing consults
(**C5**), and `vendors` was never built (**L8**).

**6. Are RLS policies correct?**
**The policies themselves: yes, and they are well designed.** Every table covered; writes
service-role-only with no client write policy anywhere; ownership walked through joins rather than
denormalised; internal support notes hidden in the policy rather than the API; riders scoped to
maintenance on the scooter they currently hold. **But they cannot currently work**, because
`is_staff()` and `is_admin()` can never return true (**C2**).

**7. Are API contracts consistent?**
**Yes.** Every client call in `apps/mobile` and `apps/web` was matched to a real backend route, and
no orphan route was found in either direction. Three DTO field names deliberately retain old
vocabulary for wire stability (**M7**) — correct mappings, unhelpful naming.

**8. Are there obsolete old-schema references?**
**No.** Every one of the 51 old table names was searched across all four surfaces. Every survivor is
inside a comment documenting the rename. One non-comment exception: a retention constant for a
table that no longer exists (**M6**), already annotated as intentional. The real "old reference"
problem is in configuration, not code — all three apps point at the old *database* (**C1**).

**9. Are there remaining duplicated concepts?**
**No.** This is the strongest outcome of the refactor. Paid-ness is derived (`v_invoice_balances`,
no `payment_status` column exists); the current vehicle is derived (the open
`rental_vehicle_assignments` row, exposed as `v_rental_current_vehicle`); refund progress lives only
in `refunds`; charges and discounts collapsed into one signed `pricing_rules` →
`subscription_adjustments` path; roles/capabilities/staff-permissions collapsed into one column plus
one view. No duplicated amounts and no mirror flags were found anywhere.

**10. Is the entire system ready for end-to-end testing?**
**No.** The applications cannot reach the new database at all (**C1**), nobody may be able to log in
(**C2**), notifications are entirely dead (**C5**, **C6**), no sweep runs (**C4**), the migration
directory does not describe the deployed schema (**C3**), any rider can read any user's PII
(**C7**), and two riders can be handed the same scooter (**C8**).

---

# FINAL VERDICT

## READY WITH FIXES

The architecture is sound and the refactor is genuinely well executed. The three-way separation of
booking / subscription / rental holds throughout the code; duplication is gone; money is
constraint-enforced rather than convention-enforced; RLS is complete and thoughtfully written;
authorisation reads from the database rather than the token; the RPC surface is locked down; and
every deviation from the design plan that was found turned out to be reasoned and correct. Three
clean whole-program typechecks against generated types mean the mechanical half of the migration —
tables, columns, relationships, enums — is not merely plausible but proven.

What is not finished is deployment and the last mile of behaviour. Eight critical issues stand
between here and a testable system, and — importantly — **none of them is architectural**. Six are
configuration or one-line-of-SQL problems (`.env`, two grants, three unapplied migrations, one
missing index). Two are small code changes in known files (one middleware call, one field name at a
handful of call sites).

### Suggested order

| # | Fix | Effort |
|---|---|---|
| 1 | **C1** — repoint three `.env` files at `cndqvdskrcmivqflbttl` | minutes |
| 2 | **C2** — grant + policy for `supabase_auth_admin`, register the hook, verify the claim | minutes |
| 3 | **C3/C4/C6** — apply migrations 30, 31, 32; add the `admin_broadcast` row; export the two orphan migrations | ~1 hour |
| 4 | **C8** — `create unique index uq_rva_open_per_vehicle …` (no code change; both call sites already handle the 23505) | minutes |
| 5 | **C7** — add `requireSelfOrStaff()` to `GET /users/:id` | minutes |
| 6 | **C5** — pass the catalogue code, not the category, at every `notify()` call site | ~2 hours |
| 7 | **H1, H3** — `requireAction` on the three write routes; cap allocation by balance | ~2 hours |
| 8 | **H2, M3** — one `businessToday()` helper, 15 call sites | ~2 hours |
| 9 | Re-run this audit, then begin end-to-end testing | — |

**H4** (transactional atomicity) is real and worth doing, but it is a refactor rather than a fix and
should not gate the first end-to-end pass — provided **C8** is closed first, since the missing index
is the sharpest consequence of the missing transaction.
