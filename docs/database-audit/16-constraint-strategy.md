# 16 — Constraint Strategy

> The old schema had **389 check constraints across 640 columns** — yet `invoices` and `return_settlements`, the two tables holding the most consequential money, had **zero**. Constraints were applied where they were easy, not where they mattered.
>
> This design uses roughly **120** constraints, placed by rule.

---

## 1. Policy

| Rule | Meaning |
|---|---|
| **C1 — Enforce arithmetic** | Every stored total has a constraint proving it equals its parts. Non-negotiable for money. |
| **C2 — Enforce exclusivity** | Where at most one of several columns may be set, a constraint says so. |
| **C3 — Enforce ordering** | If `b_at` must follow `a_at`, a constraint says so. |
| **C4 — Enforce domain** | Amounts ≥ 0, ratings 1–5, percentages 0–100. |
| **C5 — Do not enforce workflow in constraints** | Which status may follow which is application logic, not a CHECK. The old schema's grouped column checks were compensating for bad structure — this design removes the structure instead. |
| **C6 — Immutability by trigger** | Snapshot columns and append-only tables are protected by triggers, which CHECK cannot express. |

**C5 is the important departure.** The old schema had constraints like `bookings_plan_fields_chk` ("if `plan_status` is set then `plan_activated_at`, `plan_duration_days` and `plan_price_at_cancellation` must all be set"). That is a constraint apologising for four columns that should have been a separate table. Here they *are* a separate table, and the constraint is unnecessary — the columns are simply `NOT NULL`.

---

## 2. `NOT NULL` as the primary tool

Most integrity comes from nullability, not from CHECK. The rule: **a column is nullable only when "not yet known" is a real business state.**

| Nullable, correctly | Because |
|---|---|
| `rentals.returned_at` | The ride is still running |
| `refunds.completed_at` | Not finished |
| `subscription_pauses.resumed_at` | Still paused |
| `rental_vehicle_assignments.released_at` | **This is the current vehicle** — the null carries meaning |
| `users.deleted_at`, `erased_at` | Has not happened |
| `invoices.subscription_period_id` | Only `purpose='subscription_period'` has one |
| `invoices.rental_id` | Only `purpose='settlement'` has one |

| NOT NULL, deliberately | Because |
|---|---|
| every `*_snapshot` | A snapshot with no value is a bug |
| `plans.deposit_amount` | The rule always lives here — no env fallback |
| `refunds.payment_transaction_id` | You can only refund money you took |
| `rental_settlements.total_charges_amount`, `net_amount` | Computed at insert, always |
| `subscriptions.plan_price_snapshot` | The contract must have a price |

---

## 3. Uniqueness

### Natural keys
`users.phone`, `users.email` · `staff_profiles.staff_code` · `modules.key` · `permissions (module_key, action)` · `vendors.name` · `plans.name` · `vehicles.registration_number`, `vin`, `imei`, `qr_code` · `hubs.code` · `swap_stations.code`, `serial_number` · `consent_notices.version` · `invoices (invoice_series_code, invoice_number)` · `pricing_rules.code` · `notification_types.code`

### Constraint naming — load-bearing, not cosmetic

All constraints keep the **Postgres default names**: `<table>_<column>_fkey`, `<table>_pkey`, `<table>_<column>_key`.

This is a requirement, not a preference. PostgREST resolves embedded selects by **constraint name** when a table has more than one FK to the same target, and the admin console relies on exactly that — [RealtimeProvider.tsx:67](apps/web/src/providers/RealtimeProvider.tsx#L67) embeds `users!bookings_user_id_fkey(full_name)`. Renaming that constraint breaks the query at runtime with no compile-time warning. See [18](18-admin-console-integration.md) §3.

Explicit names are used only for check constraints, where there is no default worth keeping: `chk_<table>_<rule>`.

### Idempotency keys — the ones that protect money
`payment_orders.gateway_order_id`, `payment_orders.idempotency_key`, **`payment_transactions.gateway_payment_id`**, `refunds.gateway_refund_id`, `payment_webhook_events.gateway_event_id`.

`payment_transactions.gateway_payment_id` is the single most important constraint in the schema. It is what makes a duplicate webhook a no-op rather than a double activation. Carried forward from the old design unchanged.

### Cardinality-enforcing
`subscriptions.booking_id` · `deposits.subscription_id` · `subscription_periods (subscription_id, sequence_number)` · `invoice_items (invoice_id, line_number)` · `swap_station_qis_ids (qis_id)` **globally** · `user_devices.push_token`

### Partial unique — the interesting ones

| Constraint | Enforces |
|---|---|
| `rental_vehicle_assignments (rental_id) WHERE released_at IS NULL` | **A rental has at most one current vehicle** |
| `subscription_periods (subscription_id) WHERE status = 'current'` | **A subscription has at most one current period** |
| `subscription_pauses (subscription_id) WHERE resumed_at IS NULL` | **A subscription has at most one open pause** |
| `user_addresses (user_id) WHERE is_primary` | One primary address |
| `vehicle_model_media (vehicle_model_id) WHERE is_primary` | One primary image |
| `rentals (subscription_id) WHERE status = 'active'` | **One active rental per subscription** |
| **`bookings (held_vehicle_id) WHERE held_vehicle_id IS NOT NULL AND status IN ('pending_payment','confirmed')`** | **Two bookings can never hold the same scooter** |

These seven replace what would otherwise be application invariants nobody enforces. Each is also a useful index (`15`).

> **The last one was added after review H-3.** The first draft had `bookings.held_vehicle_id` as a plain column with no uniqueness. Two riders booking the last scooter of a model concurrently would both read it as `available`, both write `held_vehicle_id`, and both commit — two riders arriving at the hub for one scooter.
>
> The old schema at least funnelled allocation through `allocate_vehicle_for_booking()`, a single SQL function that could hold a lock; the redesign removed that function and replaced it with nothing. Allocation must additionally select its candidate with **`FOR UPDATE SKIP LOCKED`**, so concurrent bookings pick *different* scooters rather than contending for one.

### Gap-free invoice numbering

`invoices (invoice_series_code, invoice_number)` is UNIQUE, and the number is allocated by incrementing `invoice_series.last_number` **under `FOR UPDATE` inside the invoice's own transaction**.

A Postgres sequence is explicitly *not* used: sequences are non-transactional, so a rolled-back insert burns a number permanently. Indian invoicing requires a consecutive, gap-free series per financial year (review H-7). The row lock serialises invoice creation, which is acceptable — invoices are created at human pace, not machine pace.

---

## 4. Financial arithmetic — C1

**This is the section that fixes audit finding N-08.** The old `return_settlements` stored four computed money columns with no constraint at all.

| Table | Constraint |
|---|---|
| `rental_settlements` | `total_charges_amount = late_fee_amount + damage_amount + other_charges_amount` |
| `rental_settlements` | `net_amount = deposit_amount_snapshot - total_charges_amount` |
| `invoices` | `total_amount = subtotal_amount` *(tax removed — review H-7)* |
| `rental_settlements` | `outcome = 'refund_due'` ⟺ `net_amount > 0` |
| `rental_settlements` | `outcome = 'amount_due'` ⟺ `net_amount < 0` |
| `rental_settlements` | `outcome = 'balanced'` ⟺ `net_amount = 0` |
| `invoice_items` | `amount = round(quantity * unit_amount, 2)` |
| `payment_allocations` | `amount > 0` |
| `refunds` | `amount > 0` |
| `deposits` | `amount >= 0` |
| `pricing_rules` | `amount >= 0` (sign comes from `kind`) |
| `pricing_rules` | `amount_type = 'percentage'` → `amount <= 100` |
| `damages` | `assessed_amount >= 0` |
| `damage_disputes` | `amount_held >= 0` |
| `maintenance_tickets` | `cost_amount >= 0` |
| `vehicle_disposals` | `salvage_amount >= 0` |

### Two invariants a CHECK cannot express — and they must take a lock

CHECK constraints see one row. These need triggers:

| Invariant | Mechanism |
|---|---|
| `SUM(payment_allocations.amount)` for an invoice must not exceed `invoices.total_amount` | Constraint trigger on insert/update of `payment_allocations` |
| `SUM(refunds.amount)` against a payment must not exceed `payment_transactions.amount` | Constraint trigger on insert/update of `refunds` |

Both prevent over-allocation and over-refunding — two failure modes the old schema could not detect at all.

> **Revised after review C-4 — the naive version does not work.** As first specified, both triggers had a read-write race: two concurrent transactions each compute `SUM(...)` **before** the other commits, both see a passing total, both commit, and the invoice is over-allocated with no constraint firing.
>
> Under READ COMMITTED — Supabase's default — this is not theoretical. The webhook handler and the client-side `verifyPayment` path are *deliberately* designed to run concurrently for the same payment, and the refund retry sweep can overlap a manual admin retry.
>
> **Each trigger must lock its parent row before summing:**
> - `payment_allocations` → `SELECT ... FROM invoices WHERE id = NEW.invoice_id FOR UPDATE`, then sum, then compare.
> - `refunds` → `SELECT ... FROM payment_transactions WHERE id = NEW.payment_transaction_id FOR UPDATE`, then sum, then compare.
>
> The lock serialises only writes against the same invoice or payment, which is exactly the contention that must be serialised, and is far cheaper than raising the isolation level globally.

`invoice_items.amount` is signed (credits negative), so `invoices.subtotal_amount` should equal the sum of its items. That is deferred to a nightly reconciliation check rather than a trigger, because items are written in batches and a per-row trigger would fire on every intermediate state.

### Rounding — specified, not assumed

*Added after review M-16.* Applying two percentage adjustments to one base gives different totals depending on whether each is rounded or only the sum is, and the difference then fails the `invoices` arithmetic CHECK.

**Rule:** every monetary value is rounded **half-up to 2 decimal places at the point it is written to a row**, using Postgres `round(numeric, 2)` (which is half-up, unlike float). Totals then sum the already-rounded values — never the unrounded inputs. Concretely:

1. `subscription_adjustments.amount` is rounded when the adjustment is created.
2. `invoice_items.amount` is rounded when the line is written.
3. `invoices.subtotal_amount` sums rounded line amounts.
4. `rental_settlements.total_charges_amount` sums rounded components.

This makes every arithmetic CHECK in §4 satisfiable by construction rather than by luck.

---

## 5. Temporal ordering — C3

| Table | Constraint |
|---|---|
| `rentals` | `returned_at >= picked_up_at` |
| `rental_returns` | `inspected_at >= requested_at`, `approved_at >= inspected_at` |
| `subscription_pauses` | `resumed_at > paused_at` |
| `subscription_pauses` | `resumed_at IS NULL` = `days_paused IS NULL` |
| `subscription_periods` | `ends_on > starts_on`, `due_on >= starts_on` |
| `subscriptions` | `ends_on >= started_on` |
| `rental_vehicle_assignments` | `released_at > assigned_at` |
| `pricing_rules` | `effective_to >= effective_from` |
| `vehicle_documents` | `expires_on >= issued_on` |
| `kyc_documents` | `expires_on >= issued_on` |
| `consent_notices` | `retired_at > effective_from` |
| `invoices` | `due_on >= issued_on` |
| `retention_runs` | `finished_at >= started_at` |
| `refunds` | `completed_at >= initiated_at` |
| `damage_disputes` | `resolved_at >= raised_at` |

## 5b. Timezone — one helper, mandated everywhere

*Added after review H-6.*

The design states that a `date` means an **IST calendar day**. Nothing enforced it, and **Supabase databases run UTC** — so every `CURRENT_DATE`, `now()::date` and date-typed default in a cron predicate evaluates in UTC. Between 00:00 and 05:30 IST the UTC date is the *previous* day.

Concrete failures the first draft would have shipped:
- the payment-due sweep fires a day early for any run before 05:30 IST;
- `deposits.refund_eligible_on = returned_at::date + 15` is off by one for any evening return;
- `bookings.requested_start_on >= CURRENT_DATE` rejects a legitimate same-day booking made after 18:30 IST.

**Rule:** one immutable helper, `business_today()`, returning `(now() AT TIME ZONE 'Asia/Kolkata')::date`. It is mandatory in:

| Where | Instead of |
|---|---|
| every column default on a `date` | `CURRENT_DATE` |
| every CHECK comparing a `date` to today | `CURRENT_DATE` |
| every cron/Edge Function date predicate | `now()::date` |
| every `*_on` computation from a `timestamptz` | `<ts>::date` |

The timezone is a **schema-level constant**, declared once in the helper, not repeated as prose. Changing cities later means changing one function.

`timestamptz` columns are unaffected — they store absolute instants correctly regardless of session timezone. This rule governs only the `date`-typed calendar facts.

## 6. Domain constraints — C4

`rental_feedback.rating BETWEEN 1 AND 5` · `batteries.health_pct BETWEEN 0 AND 100` · `swap_stations.battery_count >= 0` · `subscription_periods.sequence_number > 0` · `plans.duration_days > 0` · `pricing_rules.frequency_n > 0` · `invoice_items.quantity > 0` · `refunds.attempt_count >= 0` · `users.date_of_birth < CURRENT_DATE` · `bookings.requested_start_on >= created_at::date` (enforced at insert by trigger, since `now()` is not immutable)

## 7. Exclusivity — C2

| Table | Constraint |
|---|---|
| `batteries` *(Phase 2)* | exactly one of `current_vehicle_id`, `current_swap_station_id` is non-null |
| `rental_settlements` | `refund_id` set ⟹ `outcome = 'refund_due'`; `invoice_id` set ⟹ `outcome = 'amount_due'` |
| `invoices` | `purpose='subscription_period'` ⟺ `subscription_period_id IS NOT NULL`; `purpose='settlement'` ⟺ `rental_id IS NOT NULL` (review C-1) |
| `invoices` | cannot be voided while `payment_allocations` exist (review M-5) |
| `users` | `role='rider'` ⟹ a `rider_profiles` row; `role IN ('staff','admin')` ⟹ a `staff_profiles` row |
| `pricing_rules` | `scope = 'global'` ⟺ `scope_ref_id IS NULL` |
| `subscription_adjustments` | `kind = 'charge'` ⟹ `amount > 0`; `kind = 'discount'` ⟹ `amount < 0` |
| `user_permission_overrides` | — none needed; `is_granted` is NOT NULL boolean |

The `subscription_adjustments` sign constraint is what makes merging charges and discounts safe: the sign and the kind can never disagree, so `SUM(amount)` is always the correct net.

## 8. Triggers — C6

| Trigger | Applies to | Purpose |
|---|---|---|
| `set_updated_at` | 30 tables with `updated_at` | One shared function, as before |
| `enforce_snapshot_immutability` | every table with `*_snapshot` columns | Rejects any UPDATE that changes a snapshot column. **This is what makes the snapshot convention real rather than aspirational.** |
| `freeze_settlement_decision` | `rental_settlements`, `booking_cancellations` | Freezes money columns + `outcome`; allows `refund_id`/`invoice_id` to transition **once from NULL** (review H-9) |
| `recompute_vehicle_status` | `bookings`, `rental_vehicle_assignments`, `maintenance_tickets`, `vehicle_disposals` | **One function owns all four transitions** of `vehicles.status` (review H-4) |
| `allocate_invoice_number` | `invoices` | Gap-free series allocation under `FOR UPDATE` (review H-7) |
| `assert_message_type_matches_event` | `notification_messages` | Guards denormalisation D2 |
| `enforce_append_only` | `consent_records`, `pii_access_log`, `payment_transactions`, `payment_allocations`, `payment_webhook_events` | Blocks UPDATE and DELETE |
| `enforce_immutable` | `audit_logs` | Blocks UPDATE and DELETE |
| `sync_rider_kyc_status` | `kyc_documents` → `rider_profiles.kyc_status` | Carried forward — the old schema's best derivation |
| `assert_rental_user_matches_subscription` | `rentals` | Guards intentional denormalisation D1 (`14` §4) |
| `assert_message_type_matches_event` | `notification_messages` | Guards intentional denormalisation D2 (`14` §4) |
| `assert_allocation_within_invoice` | `payment_allocations` | §4 |
| `assert_refund_within_payment` | `refunds` | §4 |
| `enforce_booking_start_not_past` | `bookings` | Insert-time only |
| `release_vehicle_on_booking_close` | `bookings` | Frees `held_vehicle_id` on cancel/expire |
| `sync_vehicle_status_on_assignment` | `rental_vehicle_assignments` | `assigned` on open, `available` on release |

**Note on `payment_transactions`:** the old schema left its most sensitive financial table mutable while applying immutability triggers to three compliance tables. Here financial records get the same protection compliance records do.

---

## 9. What is deliberately *not* constrained

| Not constrained | Why |
|---|---|
| Status transition legality | C5 — application logic. A CHECK cannot see the previous row without a trigger, and encoding a state machine in constraints makes every product change a migration. |
| `invoices.subtotal_amount` = sum of items | Batch writes; verified by nightly reconciliation instead |
| Snapshot values matching their source | The whole point is that they may diverge. Only immutability is enforced. |
| `subscriptions.ends_on` reflecting pause days | Recomputed by the application on resume; a constraint would fight it |
| Cross-table date consistency (e.g. rental within subscription dates) | Legitimate edge cases exist — an over-run rental is exactly what a late fee is for |

---

## 10. Comparison

| | Old | New |
|---|---|---|
| Check constraints | 389 | ~120 |
| …on `invoices` | **0** | 2 + trigger |
| …on `return_settlements` / `rental_settlements` | **0** | 5 |
| Grouped "if A then B and C" constraints | 7 | **0** (structure fixed instead) |
| Money columns with unenforced arithmetic | 6 | **0** |
| Financial tables with immutability protection | 0 | 3 |
| Partial unique constraints encoding invariants | 0 | 6 |

Two-thirds fewer constraints, and the ones that remain guard things that actually matter. The reduction comes almost entirely from **eliminating the seven grouped column constraints** — each of which existed to hold together an entity that should have been its own table, and each of which is now unnecessary because it is one.
