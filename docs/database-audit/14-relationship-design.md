# 14 — Relationship Design

> Foreign keys, cardinalities, deletion policy, and proof that the graph is acyclic.
> The old schema had **four circular FK pairs** and an inconsistent cascade policy. Both are fixed here by rule, not by accident.

---

## 1. Deletion policy

Three rules decide every `ON DELETE` clause. There are no judgement calls.

| Rule | Applies to | Clause |
|---|---|---|
| **R1 — Ownership** | A child that has no meaning without its parent | `CASCADE` |
| **R2 — Reference** | A pointer to master or transactional data that must not vanish underneath | `RESTRICT` |
| **R3 — Attribution** | A pointer to *who did something*, where the record survives the person | `SET NULL` |

**Consequences of R2:** you cannot delete a `plan` that a subscription references, a `vehicle` with rental history, or a `user` with financial records. This is intentional — financial history must not be destroyed by a delete. DPDPA erasure is handled by **anonymisation** (`anonymise_user()` blanks personal fields in place), never by deletion. The old schema had the same intent but applied `CASCADE` to `users` in eleven places, which would have destroyed consent records and support tickets on a hard delete.

### Cascade map

| From | To | Rule | Clause |
|---|---|---|---|
| `user_addresses`, `user_related_persons`, `user_devices`, `rider_profiles`, `staff_profiles`, `kyc_documents`, `user_permission_overrides` | `users` | R1 | CASCADE |
| `consent_records`, `notification_messages`, `support_tickets` | `users` | R1 | CASCADE |
| `bookings`, `subscriptions`, `rentals`, `invoices`, `refunds`, `payment_orders`, `data_principal_requests` | `users` | **R2** | **RESTRICT** |
| every `*_by_user_id`, `assigned_to_user_id`, `actor_user_id`, `target_user_id` | `users` | R3 | SET NULL |
| `vehicle_model_media` | `vehicle_models` | R1 | CASCADE |
| `vehicles`, `plans` | `vehicle_models` | R2 | RESTRICT |
| `vehicle_documents`, `maintenance_tickets` | `vehicles` | R1 | CASCADE |
| `vehicle_disposals`, `rental_vehicle_assignments`, `incidents` | `vehicles` | R2 | RESTRICT |
| `booking_cancellations` | `bookings` | R1 | CASCADE |
| `subscriptions` | `bookings` | R2 | RESTRICT |
| `invoices` | `subscriptions` | R2 | RESTRICT |
| `invoices` | `invoice_series` | R2 | RESTRICT |
| `subscription_periods`, `subscription_pauses`, `subscription_adjustments` | `subscriptions` | R1 | CASCADE |
| `rentals`, `deposits` | `subscriptions` | R2 | RESTRICT |
| `rental_vehicle_assignments`, `rental_returns`, `rental_feedback` | `rentals` | R1 | CASCADE |
| `rental_settlements` | `rentals` | R2 | RESTRICT |
| `invoice_items` | `invoices` | R1 | CASCADE |
| `payment_orders`, `payment_allocations` | `invoices` | R2 | RESTRICT |
| `payment_transactions` | `payment_orders` | R2 | RESTRICT |
| `payment_allocations`, `refunds` | `payment_transactions` | R2 | RESTRICT |
| `damages` | `incidents` | R1 | CASCADE |
| `damage_disputes` | `damages` | R1 | CASCADE |
| `swap_station_qis_ids` | `swap_stations` | R1 | CASCADE |
| `support_ticket_messages` | `support_tickets` | R1 | CASCADE |
| `notification_messages` | `notification_events` | R1 | CASCADE |
| `notification_deliveries` | `notification_messages` | R1 | CASCADE |
| `notification_subscribers` | `notification_types` | R1 | CASCADE |
| `notification_events`, `notification_messages` | `notification_types` | R2 | RESTRICT |
| `permissions` | `modules` | R2 | RESTRICT |
| `role_permissions`, `user_permission_overrides`, `permission_profile_permissions` | `permissions` | R1 | CASCADE |
| `permission_profile_permissions` | `permission_profiles` | R1 | CASCADE |
| `retention_runs` | `retention_policies` | R2 | RESTRICT |
| `consent_records` | `consent_notices` | R2 | RESTRICT |

---

## 2. Cardinalities that carry meaning

Each of these is enforced by a constraint, not by convention.

| Relationship | Cardinality | Enforced by |
|---|---|---|
| `users` → `rider_profiles` | 1 : 0..1 | `user_id` is the PK |
| `users` → `staff_profiles` | 1 : 0..1 | `user_id` is the PK |
| `bookings` → `subscriptions` | 1 : 0..1 | `subscriptions.booking_id` UNIQUE |
| `subscriptions` → `deposits` | 1 : 0..1 | `deposits.subscription_id` UNIQUE |
| `subscriptions` → `subscription_periods` | 1 : N | UNIQUE `(subscription_id, sequence_number)` |
| `subscriptions` → `rentals` | **1 : N** | — *(the key modelling decision)* |
| `subscriptions` → `invoices` | 1 : N | always at least the `initial` invoice |
| `rentals` → `rental_vehicle_assignments` | **1 : N, exactly one open** | partial unique index on `released_at IS NULL` |
| `rentals` → `rental_returns` | 1 : 0..1 | `rental_id` is the PK |
| `rentals` → `rental_settlements` | 1 : 0..1 | `rental_id` is the PK |
| `rentals` → `rental_feedback` | 1 : 0..1 | `rental_id` is the PK |
| `bookings` → `booking_cancellations` | 1 : 0..1 | `booking_id` is the PK |
| `incidents` → `damages` | 1 : N | one incident may cost several things |
| `damages` → `damage_disputes` | 1 : 0..1 | `damage_id` is the PK |
| `invoices` → `payment_allocations` | 1 : N | supports partial payment |
| `payment_transactions` → `payment_allocations` | 1 : N | one payment may settle several invoices |
| `swap_stations` → `swap_station_qis_ids` | 1 : N, **globally unique** | UNIQUE `(qis_id)` |

### Why `subscriptions → rentals` is one-to-many

This is the relationship the old schema could not express, and the reason its `bookings.vehicle_id` went stale.

A rider subscribes for 90 days. On day 12 the scooter breaks down. Operations issue a temp scooter, then a permanent replacement. That is **one agreement, one deposit, one billing schedule — and three rentals**.

The old schema modelled this as one `rentals` row whose `vehicle_id` was mutated, with `vehicle_maintenance.temp_vehicle_id` recording the swap separately and `bookings.vehicle_id` never updated at all. Three tables held three answers to "which scooter does this rider have?"

Here the answer is a query with one right result:

```
v_rental_current_vehicle
  = rental_vehicle_assignments WHERE released_at IS NULL
```

---

## 3. Snapshot boundaries

Where a value is deliberately copied, and why. **Every one of these is immutable after insert** and named with a `_snapshot` suffix — the convention that makes the audit's snapshot/mirror distinction visible in the schema itself.

| Snapshot | Copied from | Frozen at | Why |
|---|---|---|---|
| `bookings.plan_price_snapshot` | `plans.price_amount` | booking creation | The price quoted to the rider |
| `bookings.deposit_amount_snapshot` | `plans.deposit_amount` | booking creation | The deposit quoted |
| `bookings.duration_days_snapshot` | `plans.duration_days` | booking creation | The term quoted |
| `subscriptions.plan_price_snapshot` | `bookings` | subscription start | The price **agreed** — the contract |
| `subscriptions.deposit_amount_snapshot` | `bookings` | subscription start | Contractual |
| `subscriptions.billing_period_snapshot` | `plans.billing_period` | subscription start | Cycle length cannot change mid-agreement |
| `subscription_periods.base_amount_snapshot` | `subscriptions` | period creation | What this cycle bills |
| `subscription_adjustments.code_snapshot`, `name_snapshot` | `pricing_rules` | application | The rule may be renamed later |
| `rental_settlements.deposit_amount_snapshot` | `deposits.amount` | settlement | The reckoning must stay reproducible |
| `consent_records.notice_version_snapshot` | `consent_notices.version` | consent | Legal evidence |
| `pii_access_log.actor_role_snapshot` | `users.role` | access | Who they were *then* — singular now that a person holds one role |

**Deliberately not snapshotted** — because these are mirrors, and mirrors are what went wrong before:

| Not stored | Read instead from |
|---|---|
| Refund status on `deposits`, `booking_cancellations`, `rental_settlements` | `refunds.status` via `refund_id` |
| Payment status on `invoices` | `v_invoice_balances` |
| Current vehicle on `rentals` | `v_rental_current_vehicle` |
| Current period on `subscriptions` | `v_subscription_current_period` |
| Total days paused | `SUM(subscription_pauses.days_paused)` |
| Manufacturer on `vehicles` | `vehicle_models → vendors` |

## 4. The two intentional denormalisations

Both are declared, immutable, and trigger-enforced. Contrast the old schema, where ten facts were duplicated with no record of intent and no enforcement.

### D1 · `rentals.user_id` duplicates `subscriptions.user_id`

**Why it is kept:** every RLS policy on `rentals` and its four child tables must answer "is this row mine?" Without it, each policy needs a join to `subscriptions` on every row read, and RLS predicates run per row.

**Why it is safe:** a rental's rider **never changes**. It is set once at pickup and is immutable — a snapshot in everything but name.

**Enforcement:** `assert_rental_user_matches_subscription` constraint trigger on insert.

### D2 · `notification_messages.notification_type_code` duplicates `notification_events.notification_type_code`

*Added after the admin-console re-scan.*

**Why it is kept:** this table is in the realtime publication, and **realtime payloads are raw, unjoined rows**. The admin console must decide, from the arriving row alone, whether a message opens a blocking approval popup or merely increments the bell badge. That decision is made on the notification type. Without this column every arriving message costs a round trip — which is exactly the cost the old design paid, and the reason [RealtimeProvider.tsx:67](apps/web/src/providers/RealtimeProvider.tsx#L67) issues a direct enrichment query today.

**Why it is safe:** a message's type is fixed by the event that created it and never changes.

**Enforcement:** `assert_message_type_matches_event` constraint trigger on insert.

### The rule these two share

> A derived value may be stored when **(a)** it is immutable, **(b)** the consumer genuinely cannot join — an RLS predicate or an unjoined realtime payload — and **(c)** a trigger proves it agrees with its source.

All three conditions must hold. This is the boundary between the *snapshots* that are correct design and the *mirrors* that caused the old schema's drift bugs ([10](10-normalization-analysis.md) §5). Neither of these is a mirror: a mirror tracks a value that keeps changing, and both of these are frozen at insert.

---

## 5. Acyclicity

The old schema had four circular FK pairs (`05` §E1), which forced two-pass inserts and complicated any data migration:

| Old cycle | How it is broken here |
|---|---|
| `bookings.active_rental_id` ⇄ `rentals.booking_id` | `rentals` has no back-pointer; `rentals → subscriptions → bookings` is one direction only |
| `deposits.refund_id` ⇄ `refunds.deposit_id` | `deposits` holds no refund reference; `refunds → payment_transactions` |
| `bookings.renewal_invoice_id` ⇄ `invoices.booking_id` | Renewal is a `subscription_periods` row; `invoices → subscription_periods` only |
| `rider_charges.invoice_id` ⇄ `invoice_items.rider_charge_id` | `invoice_items → subscription_adjustments` only; adjustments hold no invoice pointer |

### Insertion order

The graph is a strict DAG. Every entity can be inserted in one pass, in this order:

```
1  modules · retention_policies · notification_types · consent_notices
1b permissions (needs modules) · permission_profiles
1c role_permissions · permission_profile_permissions (need permissions)
2  vendors · hubs · swap_stations
3  users
4  rider_profiles · staff_profiles · user_addresses · user_permission_overrides
5  vehicle_models · plans · pricing_rules
6  vehicles · vehicle_documents · swap_station_qis_ids
7  kyc_documents · consent_records
8  bookings
9  subscriptions          (needs bookings)
10 subscription_periods · deposits · invoice_series
11 invoices               (needs subscriptions; period/rental optional)
12 invoice_items · payment_orders
13 payment_transactions
14 payment_allocations · refunds
15 rentals                (needs subscriptions)
16 rental_vehicle_assignments · rental_returns
17 incidents · damages · damage_disputes
18 subscription_adjustments
19 rental_settlements     (needs refunds, invoices)
```

**Two nullable forward references** remain, and neither creates a cycle because both are set by a later `UPDATE`, not at insert:

- `rental_settlements.refund_id` → `refunds` (step 19 → 14, backwards: fine)
- `booking_cancellations.refund_id` → `refunds` (same)

Both are `SET NULL` and optional, so a settlement or cancellation can be inserted before its refund exists.

---

## 6. Lifecycle walkthroughs

### 6.1 Happy path — book, ride, return

> **Revised after review C-1/C-2.** The subscription is created **when payment is captured**, not at pickup. The earlier version created it at pickup, which left the deposit with no parent and the invoice with no path back to the booking.

| # | Action | Writes |
|---|---|---|
| 1 | Rider books | `bookings` (`pending_payment`); `held_vehicle_id` set under the partial unique + `FOR UPDATE SKIP LOCKED`; `vehicles.status → reserved` via `recompute_vehicle_status` |
| 2 | Rider pays | `payment_orders` → `payment_transactions` |
| 3 | **Payment applied — the agreement begins** | `subscriptions` (`active`) · `deposits` (`held`) · `subscription_periods` #1 (`current`) · `invoices` (`purpose='initial'`, numbered from `invoice_series`) · `invoice_items` · `payment_allocations` · `bookings.status → confirmed` |
| 4 | Staff hand over | `rentals` (`active`) · `rental_vehicle_assignments` (`initial`, `assigned_hub_id`) · `vehicles.status → assigned` · `bookings.status → fulfilled` |
| 5 | Period ends | period #1 → `closed`, period #2 → `current`, `invoices` (`purpose='subscription_period'`) |
| 6 | Rider requests return | `rental_returns` (`requested`) |
| 7 | Staff inspect | `rental_returns.status → inspected` |
| 8 | Damage found | `incidents` → `damages` → `subscription_adjustments` |
| 9 | Settlement approved | `rental_settlements` · `rentals.status → completed` · `subscriptions.status → ended`, `ended_at` set · assignment `released_at` + `released_hub_id` set · `vehicles.status → available` |
| 10 | Refund due | `refunds` (`pending` → `succeeded`) · `deposits.status → released` · `rental_settlements.refund_id` set (the one permitted post-insert write) |

**Nothing in this path writes the same fact twice.** Step 10 updates `refunds`; `deposits.status` records only that the money is no longer held, and no table mirrors the refund's progress.

### Why the deposit invoice is traceable now

`invoices.subscription_id` is NOT NULL and the subscription exists from step 3, so the chain is unbroken:

```
bookings → subscriptions → invoices → payment_orders → payment_transactions → payment_allocations
```

*"Has this booking been paid?"* is `bookings → subscriptions → invoices → v_invoice_balances`. The expiry sweep finds unpaid bookings as `status = 'pending_payment' AND hold_expires_at < now()` — a booking that never reached payment has no subscription at all, which is itself the answer.

### 6.2 Breakdown mid-subscription

| # | Action | Writes |
|---|---|---|
| 1 | Rider reports fault | `incidents` (`breakdown`) · `maintenance_tickets` (`reported`) |
| 2 | Triage → temp vehicle | `maintenance_tickets` (`triaged`, outcome `temp_vehicle`) |
| 3 | Plan paused | `subscription_pauses` (open) · `subscriptions.status → paused` |
| 4 | Temp scooter issued | assignment #1 `released_at` set · assignment #2 (`temp_swap`) opened |
| 5 | Plan resumed | `subscription_pauses.resumed_at` + `days_paused` · `subscriptions.status → active` · future `subscription_periods` shifted |
| 6 | Original repaired, handed back | assignment #2 released · assignment #3 (`replacement`) opened |

**One subscription, one deposit, one billing schedule, three vehicle assignments.** At every moment `v_rental_current_vehicle` has exactly one right answer.

### 6.3 Cancellation before pickup

`booking_cancellations` inserted with the penalty · `bookings.status → cancelled` · `held_vehicle_id` released, `vehicles.status → available` · `refunds` created against the original `payment_transactions` row · `booking_cancellations.refund_id` set when the refund exists.

**No subscription is ever created**, so there is no plan state to unwind — the failure mode that made cancellation complex in the old schema.

---

## 7. Referential integrity summary

| Property | Old | New |
|---|---|---|
| Foreign keys | 119 | ~104 |
| Circular pairs | 4 | **0** |
| Polymorphic FK groups | 2 (`invoices` ×7, `notifications_log` ×3+2) | **0** in business tables |
| Untyped pointers | 4 | 2 — `audit_logs` and `pii_access_log` only, **deliberately** |
| `CASCADE` to `users` | 11 tables, including financial | 7 tables, none financial |
| Tables reachable from `users` by cascade | ~15 | 8 |

The two remaining untyped pointers are correct: an audit record must outlive the row it describes, so a real FK would defeat its purpose. Every other polymorphic association in the old schema has been replaced with a typed relationship.
