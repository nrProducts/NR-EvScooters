# 05 — Initial Problems

> Observations only. No solutions, no proposed target model — that is the next phase.
> Every item is marked **Confirmed** (verified in both the live database and the application code) or **Needs investigation** (evidence is suggestive but a decision requires an answer from you or deeper tracing).

---

## A. Duplicated and overlapping concepts

### A1. Refund is modelled four different ways — **Confirmed**

| Where | Representation |
|---|---|
| `refunds` | Full record: `status refund_status` (pending/processing/success/failed), `initiated_at`, `processed_at`, `attempt_count` |
| `bookings` | `refund_status booking_refund_status` (pending/processing/failed/**processed**/not_required), `refund_amount`, `refund_initiated_at`, `refund_completed_at`, `refund_transaction_id` |
| `return_settlements` | `status return_settlement_status` (pending_refund/refund_processing/refund_completed/…), `refund_amount`, `refund_id`, `processed_at` |
| `deposits` | `status deposit_status` including `partially_refunded` / `refunded`, plus `refunded_at`, `refund_id` |

One real-world refund updates up to four tables with four different enums and four different timestamps. `refund_status.success` and `booking_refund_status.processed` mean the same thing in different words.

Related, though **deliberate rather than accidental**: `refunds.deposit_id` is `NOT NULL` for all three `refund_type` values. [20260815100000_refund_type_enum.sql](supabase/migrations/20260815100000_refund_type_enum.sql) explains the reasoning — a `deposits` row always exists once a booking reaches `confirmed`, so every refund kind has a real row to point at, and a cancellation refund's amount is simply allowed to exceed that deposit's own amount. Worth revisiting only because it makes `refunds.amount` semantically unrelated to `deposits.amount` on two of the three types.

### A2. Payment is modelled three ways — **Confirmed**

`payment_orders` (gateway intent, `payment_order_status`) → `payment_transactions` (capture, `payment_status`) → `invoices` (`status invoice_status` **and** `payment_status payment_status` **and** `payment_type` **and** `payment_method`).

`invoices` alone carries four status/type columns. `applyPaymentSuccess` advances all three tables in one function ([payments.service.ts:497](apps/backend/src/modules/payments/payments.service.ts#L497)), which is the clearest evidence they are one concept split three ways.

### A3. `invoices` is an untyped polymorphic association — **Confirmed**

Seven nullable FKs, all `ON DELETE SET NULL`, intended to be mutually exclusive:

```
subscription_id | rental_id | booking_id | payment_order_id | deposit_id | damage_id | refund_id
```

Nothing enforces that exactly one is set. `subscription_id` points at a table with zero rows. The real discriminator is `payment_type`, which is nullable and unconstrained against the FKs.

### A4. Charge and discount engines are mirror twins — **Confirmed**

| `charge_rules` (16 cols) | `discount_rules` (16 cols) |
|---|---|
| `charge_code charge_code` | `discount_code discount_code` |
| `charge_name` | `discount_name` |
| `amount_type charge_amount_type` | `discount_type **charge_amount_type**` |
| `amount` | `value` |
| `frequency_type charge_frequency_type` | `frequency_type discount_frequency_type` |
| `frequency_n`, `scope`, `vehicle_id`, `effective_from/to`, `active`, `created_by`, timestamps | *identical* |

`rider_charges` (14 cols) and `rider_discounts` (14 cols) mirror each other the same way. Note that `discount_rules.discount_type` **already reuses the `charge_amount_type` enum**, which is itself evidence the two were understood to be the same thing.

Four tables and four enums encode one concept: *a signed monetary adjustment applied on a schedule*.

### A5. Two unrelated things are both called a "station" — **Confirmed**

| | `stations` | `battery_stations` |
|---|---|---|
| Meaning | Pickup hub | Battery swap point |
| Rows | 2 | 37 |
| Geometry | PostGIS `geography` | plain `latitude` / `longitude` floats |
| Code refs | **0 direct** (RPC + FK only) | 1 service, actively used |
| Enum casing | — | `SCREAMING_CASE` (the only one) |

Two spatial models coexist in one schema. Plus `battery_station_qis_index` is a **third** representation of `battery_stations.qis_ids` (which is already stored twice: as `text[]` and as `qis_ids_text`).

### A6. Plan / subscription state is scattered across five places — **Confirmed**

| Location | What it holds |
|---|---|
| `plans` | The catalogue definition |
| `subscriptions` | The original model — **0 rows, dead**, but still FK'd from `rentals` and `invoices` |
| `bookings` | The *actual* subscription state: `plan_status`, `plan_activated_at`, `plan_duration_days`, `current_period_start`, `next_due_at`, `plan_paused_at`, `plan_paused_days_total`, `billing_cycle_number`, `renewal_status`, `scheduled_start_date`, `scheduled_duration_days`, `renewal_invoice_id` — **12 columns** |
| `rentals` | `plan_id`, `plan_duration_days`, `plan_price_at_pickup`, `expires_at` |
| `plan_pause_events` | Pause history, duplicating `bookings.plan_paused_at` / `plan_paused_days_total` |

### A7. `bookings` and `rentals` overlap heavily — **Confirmed**

36 and 29 columns, with a **circular FK**: `bookings.active_rental_id → rentals` and `rentals.booking_id → bookings`. Both carry plan fields, both carry lifecycle timestamps, both are updated at every stage of the same journey. It is unclear from the schema alone where the boundary is meant to be.

### A8. Damage vs incident — **Confirmed**

`damages` (18 cols, 3 rows, actively used) and `incident_reports` (10 cols, 0 rows, **zero code references**) both record "something went wrong with a vehicle". `incident_type` includes `damage`. `incident_reports` is the original design, orphaned by the money work in wave 3.

### A9. Three ways to express a referral benefit — **Confirmed**

`referral_rewards.amount` · `rider_discounts` with `discount_code='referral'` · `bookings.referral_discount_amount`. All three exist; neither app has a referral UI.

### A10. Document tables duplicated — **Confirmed**

`user_documents` and `vehicle_documents` both carry `doc_type` + `doc_number` + `expiry_date` with separate enums (`kyc_doc_type`, `vehicle_doc_type`). `vehicle_documents` has **0 rows and is never written** — and its content is duplicated *again* by `vehicles.insurance_number` / `vehicles.insurance_expiry`.

### A11. Notification stack fragmented — **Confirmed**

`notifications_log` (17 cols) is simultaneously:
- a delivery log (`channel`, `template`, `status`, `sent_at`),
- the rider's in-app inbox (`read_at`),
- an event feed (`notification_type`, `reference_type`, `reference_id`),
- and a denormalised join table (`booking_id`, `vehicle_id`, `rider_id`, `email`).

It carries **both** a generic polymorphic pointer and three concrete FKs, and **two columns pointing at `users`** (`user_id` and `rider_id`). Written by 11 different files.

### A12. Three authorisation systems — **Needs investigation**

`roles`/`user_roles` (coarse), `staff_permissions` (per-module, untyped `text` key + `text[]` actions), `user_capabilities` (three DPDPA capabilities). Plus role claims in the JWT via `custom_access_token_hook`, plus `permissionProfiles.ts` duplicated between backend and web.

*Question to answer:* are all three layers actually load-bearing, or did capabilities get added because module permissions could not express them?

---

## B. Duplicated date/time fields

### B1. Baseline (not a problem)
`created_at` on 44 tables, `updated_at` on 29, the latter maintained by 26 identical `set_updated_at` triggers. Consistent and fine — but worth making a schema-wide convention rather than 26 hand-written triggers.

### B2. Genuinely duplicated semantics — **Confirmed**

| Real-world moment | Recorded in |
|---|---|
| **Refund completed** | `refunds.processed_at` · `bookings.refund_completed_at` · `deposits.refunded_at` · `return_settlements.processed_at` |
| **Refund started** | `refunds.initiated_at` · `refunds.last_attempted_at` · `bookings.refund_initiated_at` |
| **Booking/discount cancelled** | `bookings.cancelled_at` · `rider_discounts.cancelled_at` |
| **Issue resolved** | `support_requests.resolved_at` · `vehicle_maintenance.resolved_at` · `damages.dispute_resolved_at` |
| **Rental started** | `rentals.started_at` · `bookings.plan_activated_at` · `bookings.current_period_start` |
| **Plan paused** | `bookings.plan_paused_at` · `plan_pause_events.paused_at` |
| **Plan/rental ends** | `rentals.expires_at` · `rentals.return_due_at` · `bookings.next_due_at` — `effectiveDueAt()` in [rentals.service.ts:92](apps/backend/src/modules/rentals/rentals.service.ts#L92) exists purely to reconcile the first two |
| **Document expiry** | `user_documents.expiry_date` · `vehicle_documents.expiry_date` · `vehicles.insurance_expiry` |

### B3. Status expressed as a column of timestamps — **Confirmed**

`deposits` has `held_at`, `refund_eligible_at`, `refunded_at`, `forfeited_at` **and** `status deposit_status` covering the same four states. `damages` has `disputed_at` + `dispute_resolved_at` **and** `status damage_status`. `referrals` has `qualified_at` + `rewarded_at` **and** `status referral_status`. The state is stored twice and can drift.

### B4. Inconsistent soft-delete — **Confirmed**
`deleted_at` exists on exactly 2 of 51 tables (`users`, `battery_stations`). `users` additionally has `erased_at`, `active` and `account_status`. Everything else is hard-deleted or never deleted. There is no schema-wide deletion policy.

### B5. Date vs timestamp inconsistency — **Needs investigation**
`bookings.start_day`, `current_period_start`, `next_due_at`, `scheduled_start_date` are `date`; `rentals.started_at`, `expires_at`, `return_due_at` are `timestamptz`. Both describe the same rental timeline. Given a single-timezone business (IST) this may be deliberate, but the mixed types force conversion in `effectiveDueAt` and the reminder crons.

---

## C. Status field sprawl

### C1. 52 enums for 51 tables — **Confirmed**
A bare `status` column appears on **20 tables**, each with its own enum type. Near-synonyms across the set:

| Concept | Competing enums |
|---|---|
| "it worked" | `refund_status.success` · `booking_refund_status.processed` · `payment_status.succeeded` |
| "in flight" | `payment_status.processing` · `booking_refund_status.processing` · `refund_status.processing` · `return_settlement_status.refund_processing` |
| "open ticket" | `support_status.open` · `incident_status.open` · `maintenance_status.reported` · `dp_request_status.open` |
| "done" | `support_status.resolved` · `maintenance_status.resolved` · `damage_status.resolved` · `dp_request_status.completed` · `rental_status.completed` · `booking_status.completed` |
| "cancelled" | 7 different enums carry a `cancelled` label |

### C2. Account state stored four ways — **Confirmed**
`users.active` (bool) + `users.account_status` (enum) + `users.deleted_at` + `users.erased_at`. Similarly `vehicles.active` (bool) duplicates `vehicles.status='scrap'`, and `scrap_records` duplicates it a third time.

### C3. Free text where an enum belongs — **Confirmed**
`plans.billing_cycle` is plain `text` — in a schema with 52 enums, the one field genuinely enumerable (`daily`/`weekly`/`monthly`) is untyped. Likewise `audit_logs.entity_type`, `pii_access_log.resource`, `staff_permissions.module_key`, `notifications_log.reference_type` are all untyped polymorphic discriminators.

---

## D. Table ownership and single responsibility

### D1. `users` is a god table — **Confirmed**
36 columns spanning eight unrelated concerns: identity, address, emergency contact, KYC status, onboarding state, referral, nominee (DPDPA), erasure state, staff fields (`staff_code`, `must_change_password`), and session state (`last_login_at`). It also holds **both riders and staff** with no discriminator other than `user_roles`.

### D2. `bookings` is a god table — **Confirmed**
36 columns covering reservation, cancellation, refund tracking, subscription state, billing cursor, and renewal scheduling. 21 files reference it, 9 write to it.

### D3. `return_settlements` denormalises four derivable FKs — **Confirmed**
Carries `rental_id`, `booking_id`, `user_id`, `vehicle_id` — the last three all derivable from the first. It also stores `other_charges` as untyped **jsonb** alongside the typed `rider_charges` table, meaning ad-hoc settlement charges bypass the charge engine entirely.

### D4. Config stored as tables — **Confirmed**
`plan_renewal_settings` is a single-row table holding two values. `retention_policies` (12 rows) is closer to legitimate reference data. Meanwhile genuine business rules live in **environment variables** (`DEFAULT_DEPOSIT_AMOUNT`, `BOOKING_PAYMENT_GRACE_MINUTES`, `DAMAGE_DISPUTE_WINDOW_HOURS`, `DEPOSIT_REFUND_ELIGIBILITY_DAYS`) — the boundary between config, env and data is arbitrary.

### D5. Business logic is spread across four layers — **Confirmed**
Triggers (KYC gating, vehicle status), SQL functions (billing, allocation), TypeScript services (settlement, cancellation, pause/resume), and Edge Functions (expiry, period advance, eligibility). No single layer owns invariants, and the same rule sometimes exists twice — KYC gating is enforced by both `trg_enforce_kyc_before_booking` and `useBookingGate`.

---

## E. Relationships

### E1. Four circular FK pairs — **Confirmed**

| Pair |
|---|
| `bookings.active_rental_id → rentals` ⇄ `rentals.booking_id → bookings` |
| `deposits.refund_id → refunds` ⇄ `refunds.deposit_id → deposits` |
| `bookings.renewal_invoice_id → invoices` ⇄ `invoices.booking_id → bookings` |
| `rider_charges.invoice_id → invoices` ⇄ `invoice_items.rider_charge_id → rider_charges` |

These make insert ordering awkward and make any future data migration require deferred constraints or two-pass inserts.

### E2. Dead FKs to a dead table — **Confirmed**
`rentals.subscription_id` and `invoices.subscription_id` both point at `subscriptions`, which has **0 rows**.

### E3. `vehicle_maintenance` holds three FKs to `vehicles` — **Confirmed**
`vehicle_id`, `temp_vehicle_id`, `replacement_vehicle_id`, plus `displaced_rider_id` and `booking_id`. The temp-vehicle swap is modelled as columns rather than as a relationship.

### E4. Redundant model reference — **Confirmed**
`vehicles.manufacturer` (text) + `vehicles.model` (text) + `vehicles.model_id` (FK to `vehicle_models`) describe the same fact three ways.

---

## F. Likely dead or unused

| Table | Rows | Code refs | Assessment |
|---|---|---|---|
| `incident_reports` | 0 | **0** | **Confirmed dead.** Superseded by `damages`. |
| `subscriptions` | 0 | 1 (a count) | **Confirmed dead as a concept**, but FK'd from 2 tables. |
| `vehicle_documents` | 0 | 1 (read) | **Confirmed unused.** Duplicated by `vehicles.insurance_*`. |
| `vendors` | 1 | 0 direct | Read-only via embed. No UI. |
| `stations` | 2 | 0 direct | Reachable only via RPC + FK. 14-line service. |
| `battery_station_qis_index` | 56 | 0 | Trigger-maintained derived index, not a business table. |
| `invoice_items` | 11 | 0 | Written by SQL function, **never read by the app**. |
| `referrals`, `referral_rewards` | 0, 0 | 1 each | Service exists, **no UI on either app**. |
| `notification_recipients` | 0 | 1 | Feature built, never populated. |
| `plan_pause_events` | 0 | 2 | Written on pause; no pause has occurred yet. |
| `scrap_records` | 0 | 1 | Duplicates `vehicles.status='scrap'`. |
| `vehicle_photos` | 0 | 1 | Overlaps `vehicle_models.image`. |
| `webhook_events` | 0 | 2 | Live code path; no production webhooks yet. |
| `auth_otp_attempts` | 0 | 3 | Purged aggressively by retention — emptiness is expected. |
| `support_requests` | 0 | 1 | Live feature, no tickets yet. |
| `data_principal_requests` | 0 | 3 | Live feature, no requests yet. |
| `rider_charges` | 0 | 1 | Live; charge rules exist but no cycle has generated one. |

**Caution:** 15 tables have 0 rows, but this database has only 9 users and 11 bookings — it is a development/early instance. Emptiness alone is weak evidence. Only the combination *0 rows + 0 code references* (`incident_reports`) is conclusive; the rest need the business context you have.

---

## G. Naming inconsistency

| Pattern | Instances |
|---|---|
| Log table naming | `audit_logs` (plural) · `notifications_log` (singular suffix) · `pii_access_log` (singular suffix) |
| Enum casing | `battery_station_status` uses `WORKING`/`NOT_WORKING`/`MAINTENANCE`; **all 51 others** use `snake_case` |
| Amount columns | `amount` · `value` (`discount_rules`) · `price` (`plans`) · `fare` (`rentals`) · `amount_due` (`invoices`) — all the same kind of thing |
| Actor columns | `created_by` · `reported_by` · `granted_by` · `approved_by` · `processed_by` · `triaged_by` · `waived_by` · `verified_by` · `cancelled_by` · `inspected_by` · `return_approved_by` · `disputed_by` · `dispute_resolved_by` · `actor_id` · `assigned_to` |
| Table naming | `plan_renewal_settings` and `notification_settings` are settings; `retention_policies` and `charge_rules` are rules; `plan_pause_events` is an event log — three naming conventions for three kinds of config |
| Timestamps | `expiry_date` (date) vs `expires_at` (timestamptz) vs `ends_at` vs `effective_to` vs `retired_at` — five names for "when it stops" |

---

## H. Security and integrity gaps

### H1. RLS disabled on the entire billing engine — **Confirmed**
`charge_rules`, `discount_rules`, `rider_charges`, `rider_discounts`, `invoice_items` have `relrowsecurity = false`. Every other application table has RLS on with 1–3 policies. `auth_otp_attempts` has RLS on but **zero policies**.

Not currently exploitable — all access goes through the service-role backend — but it means the five tables holding *money owed by a named rider* have no defence-in-depth, while 46 less sensitive tables do. This is an accident of migration ordering, not a decision.

### H2. Full Aadhaar and driving-licence numbers still stored — **Confirmed, blocking**
`user_documents.doc_number` holds full identity numbers. The migration to drop it is parked at `supabase/migrations/20260814999999_kyc_doc_number_drop.sql.PENDING`, blocked on a legal opinion and a two-week soak, and its own header notes that even after running it, the numbers survive in PITR backups until the retention window expires.

The file itself states: *"holding full Aadhaar numbers is the single largest concentration of risk in the schema."* **The new database's KYC design must resolve this deliberately** — inheriting the column would carry the problem forward.

### H3. 389 check constraints across 640 columns — **Needs investigation**
Roughly 0.6 checks per column. Some are enum-adjacent guards, some are cross-column invariants. Worth auditing to see how many are compensating for weak modelling (e.g. enforcing that exactly one of `invoices`' seven FKs is set) versus expressing genuine domain rules.

### H4. Geocoding processor has no agreement — **Confirmed** (documented, non-schema)
`GEOCODE_URL` defaults to `photon.komoot.io`, a free public instance. Flagged in `.env.example` and `docs/dpdpa/processor-dpa-checklist.md` as needing a contract or self-hosting before launch.

---

## I. Areas requiring deeper investigation

Ordered by how much they will shape the new design:

1. **Where is the boundary between `bookings`, `rentals` and the plan/subscription?** This single decision determines the shape of roughly a third of the schema. The current answer is "all three, overlapping."
2. **Should money be a ledger?** Six tables (`payment_orders`, `payment_transactions`, `invoices`, `invoice_items`, `deposits`, `refunds`) plus `rider_charges`/`rider_discounts` plus `return_settlements` model movements of money in eight shapes. Whether the target is a double-entry ledger or a simpler set of documents is the second-biggest decision.
3. **Is the charge/discount engine one thing?** They are already column-for-column identical and share an enum.
4. **What is the real station model?** Two networks, two spatial representations, one dead.
5. **Are referrals, incidents, subscriptions, vendors and vehicle documents in scope at all?** Five features are built but unused. Keeping them costs schema; dropping them loses work already done. **This needs your business input, not further code reading.**
6. **How much logic belongs in the database?** Currently split four ways. Choosing one home for invariants would remove a large class of drift.
7. **Which layer owns status?** The `status` + `*_at` duplication (B3) is systemic and needs a single convention.
8. **What is the retention and deletion policy?** Soft delete exists on 2 of 51 tables; DPDPA requires a coherent answer across all of them.
9. **Does the schema need to distinguish riders from staff?** Currently one `users` table serves both, with staff-only columns nullable for every rider.
10. **KYC document storage** — see H2. Blocking, and legal input is required before the design can be fixed.
