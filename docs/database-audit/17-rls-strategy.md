# 17 — Row-Level Security Strategy

> The old schema had RLS enabled on 46 of 51 tables. The five without it were `charge_rules`, `discount_rules`, `rider_charges`, `rider_discounts` and `invoice_items` — **the entire billing engine**, holding money owed by named riders (audit finding H1).
>
> In this design **every table has RLS enabled, with no exceptions — and every view is created `WITH (security_invoker = true)`.**
>
> **The second clause was missing from the first draft and is a CRITICAL fix (review C-3).** A Postgres view runs with its *owner's* privileges unless `security_invoker` is set, so six views would have bypassed every policy below them. `v_invoice_balances` would have exposed every rider's outstanding balance to any authenticated rider — underneath a document claiming complete RLS coverage. "RLS on every table" is not the same as "RLS on every readable object".

---

## 1. The security model, stated plainly

Something the old schema never wrote down, which made its RLS gaps invisible.

> **Correction (admin re-scan, 2026-08-19).** The first draft of this document claimed the admin console *"never trusted, all business reads go through the API."* That is wrong. The console holds two live Supabase Realtime channels and issues one direct PostgREST read ([01](01-project-discovery.md) §2.1). For those paths **RLS is the only access control** — there is no middleware in front of them.

| Layer | Postgres role | Path | RLS applies? |
|---|---|---|---|
| Backend API | **`service_role`** | Direct SQL | **No — bypasses RLS.** Authorisation is the middleware chain. |
| Edge Functions | `service_role` | Direct SQL | No. Same. |
| Rider app | `authenticated` | Backend REST only | N/A — never touches Postgres for data |
| Admin console — most reads | `authenticated` | Backend REST | N/A |
| **Admin console — realtime** | **`authenticated`** | **`postgres_changes` on 4 tables** | **YES — RLS is the sole control** |
| **Admin console — enrichment read** | **`authenticated`** | **Direct PostgREST** | **YES — RLS is the sole control** |

**So RLS is two different things at once**, and conflating them is what let the old schema lose RLS on five tables unnoticed:

| For | RLS is | If it is wrong |
|---|---|---|
| The ~54 tables no client queries directly | Defence-in-depth | Nothing breaks today; a future leak or a new browser-side feature is exposed |
| The published tables + the enrichment read | **The primary control** | **A real, present authorisation hole** — or, if too strict, a silently broken UI |

That second row is why the published set must be **deliberately chosen and kept small** (§9), and why its policies must be tested (§7) rather than assumed.

The rule follows: **enable RLS everywhere, deny by default, grant only what a client legitimately needs today, and treat the realtime publication as part of the security surface.**

## 2. Helper functions

Carried forward from the old schema, extended for the unified permission model.

| Function | Returns |
|---|---|
| `auth.uid()` | Supabase built-in — current user id |
| `current_role_name()` | the caller's `user_role` from the JWT claim |
| `is_staff()` | `current_role_name() IN ('staff','admin')` |
| `is_admin()` | `current_role_name() = 'admin'` |
| `has_permission(module_key, action)` | resolves `v_user_effective_permissions` for the caller |
| `owns_subscription(subscription_id)` | the caller is that subscription's rider |
| `owns_rental(rental_id)` | the caller is that rental's rider |

**The role is a single value, not a set.** `custom_access_token_hook` stamps one `role` claim into the JWT, so `is_staff()` and `is_admin()` are a string comparison against a claim — no table read, no array containment, nothing to join. The old design needed `user_roles` membership checks; this is strictly cheaper on a predicate that runs per row.

`has_permission()` is **`SECURITY DEFINER` and `STABLE`**, and the permission tables' own policies are role-based only — never permission-based — so evaluation cannot recurse (review M-14). It still **must not be used in a policy that runs per row on a large table** — the patterns below use it only on admin-facing tables.

## 3. Policy patterns

Four patterns cover 59 of 62 tables.

| Pattern | Read | Write |
|---|---|---|
| **P1 — Own data** | `user_id = auth.uid()` OR `is_staff()` | service_role only |
| **P2 — Own via parent** | `owns_*(parent_id)` OR `is_staff()` | service_role only |
| **P3 — Public catalogue** | any authenticated user | service_role only |
| **P4 — Staff only** | `is_staff()` or a specific permission | service_role only |

**Writes are service_role-only across the entire schema.** No client inserts, updates or deletes any business row directly. The old schema had `INSERT` policies for `authenticated` on `bookings`, `rentals`, `user_documents`, `support_requests`, `consent_records`, `data_principal_requests` and `incident_reports` — legacy from before the backend existed, and unused. They are not carried forward.

## 4. Policies by table

### Identity

| Table | Pattern | Read policy |
|---|---|---|
| `users` | P1 | self, or `is_staff()` |
| `user_addresses`, `user_related_persons`, `user_devices` | P1 | `user_id = auth.uid()` or `is_staff()` |
| `rider_profiles` | P1 | self or staff |
| `staff_profiles` | P4 | `is_staff()` |
| `kyc_documents` | P1 + permission | self, or `has_permission('kyc','view')` |
| `modules`, `permissions` | P3 | any authenticated — the console renders its sidebar and permission matrix from these |
| `permission_profiles`, `permission_profile_permissions` | P4 | `is_admin()` |
| `role_permissions`, `user_permission_overrides` | P4 | self, or `is_admin()` |

**`kyc_documents` is the most sensitive table in the schema.** Read requires either ownership or an explicit permission — role alone is not enough. Decrypting `document_number_encrypted` additionally requires `kyc.reveal_number` and writes a `pii_access_log` row; that happens in the backend, since the key never enters the database.

### Fleet

| Table | Pattern | Read policy |
|---|---|---|
| `vendors`, `vehicle_models`, `vehicle_model_media` | P3 | authenticated, `WHERE deleted_at IS NULL AND is_active` |
| `hubs` | P3 | authenticated, active only |
| `swap_stations` | P3 | authenticated, `WHERE is_rider_visible AND deleted_at IS NULL`; staff see all |
| `swap_station_qis_ids` | P4 | `is_staff()` — riders never need QIS IDs |
| `vehicles` | P4 | `is_staff()`. **Riders see availability counts through the API, never rows.** |
| `vehicle_documents`, `vehicle_disposals` | P4 | `is_staff()` |
| `maintenance_tickets` | P2 + P4 | staff; a rider may read tickets on a vehicle currently assigned to their rental |
| `batteries`, `battery_swap_events` *(Phase 2)* | P4 | `is_staff()` |

The rider maintenance case is the one genuinely conditional policy: a rider needs to see "your scooter is being repaired, expected back Tuesday" without being able to browse the fleet's maintenance history. The predicate joins through `rental_vehicle_assignments` where `released_at IS NULL`.

### Commercial

| Table | Pattern | Read policy |
|---|---|---|
| `plans` | P3 | authenticated, active only; staff see all |
| `bookings` | P1 | `user_id = auth.uid()` or `is_staff()` |
| `booking_cancellations` | P2 | via `bookings` |
| `subscriptions` | P1 | own or staff |
| `subscription_periods`, `subscription_pauses`, `subscription_adjustments` | P2 | `owns_subscription()` or staff |
| `rentals` | P1 | `user_id = auth.uid()` or staff — **uses the denormalised `user_id` directly** |
| `rental_vehicle_assignments`, `rental_returns`, `rental_settlements`, `rental_feedback` | P2 | `owns_rental()` or staff |

**This is where `rentals.user_id` earns its place** (`14` §4). Five tables' policies resolve through `owns_rental()`, which reads `rentals.user_id` in one indexed lookup. Without it, every one of those predicates would join `rentals → subscriptions` per row.

### Billing — no longer an exception

| Table | Pattern | Read policy |
|---|---|---|
| `invoices` | P1 | `user_id = auth.uid()` or staff |
| `invoice_items` | P2 | via `invoices` — **was RLS-disabled** |
| `pricing_rules` | P4 | `is_staff()` — **was RLS-disabled** |
| `subscription_adjustments` | P2 | `owns_subscription()` or staff — **was RLS-disabled** (as `rider_charges`/`rider_discounts`) |
| `payment_orders` | P1 | own or staff |
| `payment_transactions` | P2 | via `payment_orders`, or staff |
| `payment_allocations` | P2 | via `invoices`, or staff |
| `deposits` | P2 | `owns_subscription()` or staff |
| `refunds` | P1 | `user_id = auth.uid()` or staff |
| `invoice_series` | P4 | `is_admin()` |
| `payment_webhook_events` | P4 | `is_admin()` — raw gateway payloads, admin only |

All five previously unprotected tables now behave like every other. `pricing_rules` is staff-only because a rider seeing the full discount rule set could infer eligibility they have not been granted.

### Operations and support

| Table | Pattern | Read policy |
|---|---|---|
| `incidents` | P2 | rider may read incidents on their own rental; staff read all |
| `damages` | P2 | via `incidents` |
| `damage_disputes` | P2 | via `damages` — a rider must see their own dispute |
| `support_tickets` | P1 | own or staff |
| `support_ticket_messages` | P2 | via `support_tickets`, **excluding `is_internal_note = true` for riders** |

`support_ticket_messages` is the only policy that filters by column value rather than ownership. Internal staff notes live in the same thread as rider-visible replies, and RLS is the right place to keep them apart — a mistake in the API would otherwise leak them.

### Notifications

| Table | Pattern | Read policy |
|---|---|---|
| `notification_types` | P4 | `is_staff()` |
| `notification_subscribers` | P4 | self or `is_admin()` |
| `notification_events` | P4 | `is_staff()` |
| `notification_messages` | P1 (split) | rider: `user_id = auth.uid()`. **staff: only where the type's `default_audience IN ('staff','both')`** |
| `notification_deliveries` | P4 | `is_staff()` — delivery mechanics are not rider-facing |

> **`notification_messages` policy revised after review H-10.** The first draft used the ordinary P1 shape — `user_id = auth.uid() OR is_staff()`. Because this table is in the realtime publication and realtime evaluates policies as the **subscribing user**, that granted every staff member with an open console a **live stream of every rider's notification title and body** — KYC rejections, payment failures, refund notices. Bulk personal-data access, with no `pii_access_log` entry, in a schema that carefully logs far less.
>
> Staff now see only staff-directed messages, resolved through `notification_types.default_audience`. The console's badge and approval popups work unchanged; a staff member who legitimately needs to read a rider's message goes through the API, which logs it.

Splitting the old single table improves this: a rider reads only `notification_messages`, and never sees the event feed or delivery diagnostics that the old `notifications_log` mixed into the same rows.

### Compliance

| Table | Pattern | Read policy |
|---|---|---|
| `consent_notices` | P3 | authenticated — riders must be able to read what they consented to |
| `consent_records` | P1 | own or `has_permission('privacy','view')` |
| `data_principal_requests` | P1 | own or `has_permission('privacy','view')` |
| `pii_access_log` | P4 | `has_permission('privacy','view')` **plus** the rider's own rows — DPDPA gives a data principal the right to know who accessed their data |
| `audit_logs` | P4 | `is_admin()` |
| `retention_policies`, `retention_runs` | P4 | `is_admin()` |

`pii_access_log` is the one table where a rider reads rows about *staff* activity — specifically rows where they are the `target_user_id`. That is a DPDPA transparency requirement, and it is expressed as a policy rather than left to the API.

## 5. Deny-by-default

RLS enabled with no matching policy means no access. That is the intended state for:

- Any client access to a table not listed above
- Every `INSERT`, `UPDATE` and `DELETE` from `authenticated` or `anon`, on every table
- `anon` access to everything — the schema exposes **nothing** to unauthenticated users

The marketing website reads no database, so there is no anon surface at all.

## 6. What RLS cannot do here

Stated so the boundary is not forgotten:

| Concern | Enforced by |
|---|---|
| Can this staff member approve a refund? | Backend middleware via `has_permission()` |
| Can this rider book without KYC? | Trigger on `bookings` |
| Can this invoice be paid twice? | `payment_transactions.gateway_payment_id` UNIQUE |
| Is this settlement's arithmetic right? | Check constraints (`16` §4) |
| Should this KYC number be revealed? | Backend permission check + `pii_access_log` write |

**RLS answers only "may this identity see this row?"** Everything else is a different mechanism. The old schema blurred this — some rules in RLS, some in triggers, some in TypeScript, with no statement of which layer owned what.

## 7. Testing

RLS is invisible when the backend uses `service_role`, so the policies will not be exercised by normal use. They need explicit tests, which the old schema had none of:

1. **Per-table isolation test** — as rider A, attempt to read a row belonging to rider B; expect zero rows. Run for all 24 rider-reachable tables.
2. **Write-denial test** — as `authenticated`, attempt an INSERT/UPDATE/DELETE on each table; expect failure everywhere.
3. **Anon test** — as `anon`, attempt to read each table; expect zero rows everywhere.
4. **Staff scope test** — as a `technician`, attempt to read `audit_logs` and `payment_webhook_events`; expect denial.
5. **Internal-note test** — as a rider, read a support thread containing an internal note; expect the note to be absent.
6. **Realtime delivery test** *(new — see §9)* — subscribe as rider A, write a row belonging to rider B to each published table, assert nothing is delivered. Then subscribe as staff and assert the change *is* delivered. This is the only test that covers the paths where RLS is the sole control.
7. **Publication membership test** — assert `pg_publication_tables` for `supabase_realtime` contains exactly the four tables in §9 and nothing else. A table accidentally added to the publication is a silent data leak to every subscribed browser.
8. **View isolation test** *(review C-3)* — as rider A, select from each of the six views; assert only A's rows return. Also assert every view has `reloptions` containing `security_invoker=true`, so the flag cannot be dropped by a future `CREATE OR REPLACE`.

These belong in CI. Without them, an RLS regression is undetectable through the application, which is precisely how the old schema lost RLS on five tables without anyone noticing.

Tests 6 and 7 are the ones the old codebase most needed and least had: the realtime path has **no server-side authorisation whatsoever**, so a wrong policy there is not a defence-in-depth weakness but a live hole.

## 8. Summary

| | Old | New |
|---|---|---|
| Tables with RLS enabled | 46 / 51 | **62 / 62** |
| Views with `security_invoker` | 0 / 1 | **6 / 6** |
| Tables with RLS on but no policy | 1 | 0 |
| Billing tables unprotected | **5** | 0 |
| Client write policies | 7 | **0** |
| `anon` reachable tables | 0 | 0 |
| Tables in the realtime publication | 4 (undocumented) | 4 (**specified in §9**) |
| Tables where RLS is the *sole* control | 4 (**unrecognised**) | 4 (identified, tested) |
| RLS tests | 0 | 8 suites in CI |
| Documented trust boundary | none | §1 |

## 9. The realtime publication

*Added after the admin-console re-scan. The publication is part of the schema design, not an operational detail.*

### What the old schema published

`bookings`, `vehicles`, `invoices`, `notifications_log` — added by [20260801100000_enable_realtime_publication.sql](supabase/migrations/20260801100000_enable_realtime_publication.sql).

### What the new schema publishes

| Table | Replaces | Consumed for | Row is self-sufficient? |
|---|---|---|---|
| `bookings` | `bookings` | Pickup-queue invalidation, cancel/fulfil toasts, new-booking approval popup | `id`, `status` ✅ (names still need enrichment — see `18`) |
| `vehicles` | `vehicles` | Fleet cache invalidation, status-change toast | `display_name`, `registration_number`, `status` ✅ |
| **`payment_allocations`** | **`invoices`** | "Payment Received" toast, invoice/report invalidation | `invoice_id`, `amount`, `allocated_at` ✅ |
| **`notification_messages`** | **`notifications_log`** | Bell badge, approval popups | `user_id`, `notification_type_code`, `title`, `body` ✅ |

**Four tables, same as before.** Two are swapped for a better signal:

- **`invoices` → `payment_allocations`.** The new `invoices` has no `payment_status` — paid-ness is derived (`13`). But an *allocation insert* is a strictly better event than a status flip: it fires exactly when money lands on an invoice, carries the amount, and works for partial payments, which the old model could not represent at all.
- **`notifications_log` → `notification_messages`.** The message is the user-facing artefact. `notification_events` and `notification_deliveries` are deliberately **not** published — events are an internal stream and deliveries are provider diagnostics; neither belongs in a browser.

### Publication policy

1. **A table is published only if a client demonstrably consumes it.** Four today. Adding a fifth requires a named consumer.
2. **A published table must satisfy design rule 11** ([11](11-proposed-new-schema.md) §2) — every column the client routes on is in the row. This is what justifies `notification_messages.notification_type_code`.
3. **A published table's SELECT policy is a security control**, not defence-in-depth. It gets an explicit test (§10).
4. **Publication is asserted in a migration**, never clicked in the dashboard, so the set is reviewable in git.
5. **RLS predicates on published tables must be cheap.** They run per changed row, per subscriber. `payment_allocations` is the one to watch: its P2 policy joins to `invoices`. If that proves costly under load, the mitigation is a staff-only policy on this table plus client-side filtering — not removing RLS.

### Realtime and the RLS/role interaction

Realtime evaluates policies as the **subscribing user**, not `service_role`. Two consequences:

- Staff and admin both satisfy `is_staff()` on `bookings`, `vehicles` and `payment_allocations`, so **both will receive those changes**. The console currently restricts its `admin-realtime` channel to `role === 'admin'` in client code. That is a UX choice, not a security boundary, and it should stay in the client — encoding "admin only" in RLS would break the staff dashboard's need to read the same tables over REST.
- `notification_messages` is gated by `user_id = auth.uid()` for riders. The old code comment on `notificationRealtime.ts` already relies on exactly this, and it carries forward unchanged.
