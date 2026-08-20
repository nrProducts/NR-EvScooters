# 09 — Single Responsibility Analysis

> The test applied to all 51 tables: **"Can this table be explained in one sentence, without using the word *and* to join unrelated ideas?"**
>
> A sentence may legitimately contain "and" when the joined ideas belong to one concept ("a rider's consent decision *and* the notice version it applied to"). It fails when "and" joins two lifecycles that could change independently.

## Scorecard

| Verdict | Count | Tables |
|---|---|---|
| **PASS** — one clear sentence | 34 | Most of the schema |
| **WEAK** — passes, but with a caveat | 9 | |
| **FAIL** — multiple responsibilities | 8 | `users`, `bookings`, `rentals`, `invoices`, `notifications_log`, `vehicles`, `vehicle_maintenance`, `return_settlements` |

Two-thirds of the schema is fine. **The failures are concentrated in exactly the tables the business runs on** — and they carry 36, 36, 29, 19, 17, 22, 16 and 20 columns respectively, i.e. 195 of the schema's 640 columns (30%) sit in 8 of 51 tables (16%).

---

# FAIL — tables with mixed responsibilities

## S-01 · `users` — 36 columns

**One-sentence attempt:** *"A person — rider or staff — with their profile, address, emergency contact, KYC state, onboarding progress, referral code, DPDPA nominee, erasure state, staff employment details and last login."*

**PROBLEM** Nine responsibilities in one table:

| Responsibility | Columns |
|---|---|
| Identity | `id`, `full_name`, `phone`, `email`, `date_of_birth`, `gender` |
| Address | `address_line_1/2`, `city`, `state`, `postal_code`, `country` |
| Emergency contact | `emergency_contact_name`, `emergency_contact_phone` |
| Media | `profile_photo_url` |
| Account lifecycle | `active`, `account_status`, `status_reason`, `status_changed_at`, `deleted_at` |
| KYC (derived) | `kyc_status` |
| Onboarding | `profile_completed` |
| Referral | `referral_code` |
| DPDPA nominee | `nominee_full_name`, `nominee_relationship`, `nominee_phone`, `nominee_email`, `nominee_updated_at` |
| DPDPA erasure | `erased_at`, `erasure_request_id` |
| Staff employment | `staff_code`, `must_change_password` |
| Device/session | `push_token`, `last_login_at` |

**WHY** `users` was the first table written ([20260720100100_identity.sql](supabase/migrations/20260720100100_identity.sql)) with 17 columns. Every subsequent wave needed *something* about a person, and the person table was already there. KYC added a status; onboarding added a flag; referrals added a code; DPDPA added seven columns; staff auth added two. **No wave was individually unreasonable.** The table grew 19 columns in five weeks because it was the path of least resistance every time.

**Concrete cost:**
- Every rider row carries nullable staff columns and vice versa; nothing distinguishes them but a join to `user_roles`.
- `nominee_*` is regulated data with its own retention rule, sitting in the same row as operational data with a different rule.
- `push_token` is device state that changes on every app reinstall, in the same row as immutable identity.
- A DPDPA export must extract 5 different concerns from one table.

**PROPOSED BOUNDARY** Separate by *who owns the data and how often it changes*:
- **Person / identity** — the stable core, FK to `auth.users`
- **Contact and address** — mutable profile data
- **Rider profile** — rider-specific (referral code, onboarding, KYC status)
- **Staff employment** — staff-specific (staff code, password policy)
- **Nominee** — regulated, separately retained, separately auditable
- **Device registration** — push tokens, one per device rather than one per user
- Account lifecycle stays on the core as one enum + transition timestamps (see `06` D-17)

**CONFIDENCE** **Very high** that this is a violation. **Medium** on the exact split — how far to decompose is a practical judgement, and over-splitting a table read by 13 files has its own cost.

---

## S-02 · `bookings` — 36 columns

**One-sentence attempt:** *"A rider's reservation of a scooter model for a start day — and their subscription, and its billing cycle position, and its cancellation record, and its refund progress, and its renewal schedule."*

**PROBLEM** Six responsibilities. The check constraints prove it: `bookings_cancellation_fields_chk`, `bookings_plan_fields_chk`, `bookings_plan_paused_chk`, `bookings_renewal_scheduled_chk` each guard a **column group that is all-null or all-populated together**. A constraint of the form "if A is set then B, C and D must be set" is the schema telling you those columns are a separate entity that happens to be optional.

| Responsibility | Columns | Guarding constraint |
|---|---|---|
| Reservation | `user_id`, `vehicle_model_id`, `station_id`, `plan_id`, `start_day`, `status`, `vehicle_id` | — |
| Subscription | `plan_status`, `plan_activated_at`, `plan_duration_days`, `deposit_amount_at_booking` | `bookings_plan_fields_chk` |
| Billing cursor | `current_period_start`, `next_due_at`, `billing_cycle_number` | — |
| Pause state | `plan_paused_at`, `plan_paused_days_total` | `bookings_plan_paused_chk` |
| Cancellation | `cancelled_at`, `cancelled_by`, `cancellation_reason`, `plan_price_at_cancellation`, `cancellation_penalty_amount` | `bookings_cancellation_fields_chk` |
| Refund mirror | `refund_amount`, `refund_status`, `refund_initiated_at`, `refund_completed_at`, `refund_transaction_id` | `bookings_cancellation_amounts_chk` |
| Renewal | `renewal_status`, `scheduled_start_date`, `scheduled_duration_days`, `renewal_invoice_id` | `bookings_renewal_scheduled_chk` |

**WHY** Documented in `06` D-05: when the product became subscription-first, the subscription state attached to the record that already had a plan, a price and a payment. Each later feature (cancellation, refund tracking, renewal) attached to the same record for the same reason.

**Concrete cost:** `bookings` is written by 9 files and read by 17. Every one of them loads 36 columns to use 5. Four independent lifecycles contend for one row and one `updated_at`.

**PROPOSED BOUNDARY**
- **Reservation** — intent to rent: who, what model, which day, current state
- **Subscription** — the commercial agreement: plan, activation, duration, deposit terms. Owns its own lifecycle and outlives any single reservation.
- **Billing period** — one row per cycle, replacing the three cursor columns. Makes `billing_cycle_number` a real thing rather than a counter, and makes renewal scheduling a future-dated period rather than four columns.
- **Cancellation** — an event, not a column group
- Refund mirror → derive from `refunds` (see `08` §6.2)

**CONFIDENCE** **Very high.** The check constraints are objective evidence.

---

## S-03 · `rentals` — 29 columns

**One-sentence attempt:** *"A rider's physical custody of a scooter — and the plan terms it was taken under, and the return request, and the inspection, and the late-fee calculation."*

**PROBLEM** Four responsibilities, again evidenced by grouped check constraints (`rentals_late_settlement_chk`, `rentals_plan_period_chk`, `rentals_return_request_chk`).

| Responsibility | Columns |
|---|---|
| Custody | `user_id`, `vehicle_id`, `booking_id`, `status`, `started_at`, `ended_at`, `start_battery_pct`, `end_battery_pct` |
| Plan snapshot | `plan_id`, `plan_duration_days`, `plan_price_at_pickup`, `expires_at`, `subscription_id` (dead) |
| Return workflow | `return_requested_at`, `return_reason`, `return_feedback`, `return_due_at`, `return_approved_at`, `return_approved_by`, `inspected_at`, `inspected_by` |
| Late fee | `days_late`, `late_penalty_amount`, `late_fee_per_day` |
| Legacy | `fare`, `reason` |

**Note:** `fare` is a leftover from the per-minute share model and is not used by the subscription flow.

**WHY** The return workflow grew from one column (`return_requested_at`, Jul 30) to eight across three migrations as approval and inspection gates were added.

**PROPOSED BOUNDARY** Custody is the core. The return is a **process with its own states and actors** — request, inspection, approval — which is exactly what `return_settlements` already partly is. The plan snapshot belongs to the subscription. The late-fee calculation is an output of the settlement, not an attribute of custody.

**CONFIDENCE** **High.** Less severe than S-02 — the return columns at least describe one coherent process.

---

## S-04 · `invoices` — 19 columns

**One-sentence attempt:** *"A bill owed by a user — for a subscription, or a rental, or a booking, or a deposit, or a damage, or a refund — and its payment state."*

**PROBLEM** Two failures at once:

1. **Polymorphic parent.** Seven nullable FKs (`subscription_id`, `rental_id`, `booking_id`, `payment_order_id`, `deposit_id`, `damage_id`, `refund_id`), intended as mutually exclusive. **`invoices` has zero check constraints** — nothing enforces that exactly one is set, or that `payment_type` agrees with whichever is.
2. **Two lifecycles.** The invoice document (`status invoice_status`: draft → issued → paid → void) and the payment (`payment_status`, `payment_method`, `gateway_ref`, `paid_at`) are different things with different owners.

**WHY** `invoices` was created in the ledger migration to be the universal "money owed" record. Each new money concept (deposit, damage, refund, renewal) added its own FK rather than a shared parent, because each arrived in a different migration.

**Concrete cost:** a query for "all invoices for this booking" must check `booking_id` *or* join through `rental_id` *or* through `deposit_id`. This is why `invoices` is read by 7 files with 7 different join shapes.

**PROPOSED BOUNDARY** One billable-subject reference with a typed discriminator, or a proper parent entity that all billable things belong to. Payment state moves to the payment.

**CONFIDENCE** **Very high.** The absence of any check constraint on a 7-way exclusive-or is objectively a defect.

---

## S-05 · `notifications_log` — 17 columns

**One-sentence attempt:** *"A message sent to a user — and the business event that caused it, and whether the rider has read it."*

**PROBLEM** Three lifecycles in one row (detailed in `06` D-10): the **event**, the **message**, the **delivery attempt**. Plus two user references (`user_id`, `rider_id`) and both a polymorphic pointer and three concrete FKs.

**Concrete cost:**
- A single event delivered on two channels needs two rows, duplicating the event data.
- Retention purges message bodies from this table — which also destroys the rider's inbox history and the admin event feed.
- Written by 11 files, the most of any table.

**PROPOSED BOUNDARY** Event → message → delivery attempt, three tables with three retention rules.

**CONFIDENCE** **High.**

---

## S-06 · `vehicles` — 22 columns

**One-sentence attempt:** *"A physical scooter — and its model attributes, and its battery, and its insurance document, and its service schedule, and its current operational state."*

**PROBLEM** Five responsibilities:

| Responsibility | Columns |
|---|---|
| Asset identity | `id`, `name`, `registration_number`, `vin`, `qr_code`, `imei`, `purchase_date`, `color` |
| Model attributes (duplicated) | `manufacturer`, `model`, `model_id` |
| **Battery** | `battery_number` (UNIQUE), `battery_percentage` |
| Insurance document | `insurance_number`, `insurance_expiry` |
| Service schedule | `last_service_date`, `next_service_due_date` |
| Operational state | `status`, `active`, `station_id` |

**WHY** Same mechanism as `users` — the first fleet table absorbed every subsequent fleet need.

**The battery is the significant finding.** As set out in `08` §3.1: this is a **battery-swap business**, but `battery_number` is a unique column on the scooter, asserting a permanent one-to-one bond between a scooter and a battery. That directly contradicts swapping. There is no battery entity and no swap history, and `battery_stations.battery_count` is an integer with no inventory behind it.

Importantly, this was **deliberate and correct when written** — the fleet migration says so in a comment — and only became wrong when the swap network shipped two weeks later. It is a stale assumption, not an error.

**PROPOSED BOUNDARY** Asset identity is the core. The battery is either a tracked entity (with its own location and history) or it is not tracked at all — but it cannot be a unique attribute of the scooter in a business whose name is *Swapngo*.

**CONFIDENCE** **High** on the SRP violation. **High** that the battery model is internally contradictory; **medium** on the resolution, which is a business decision.

---

## S-07 · `vehicle_maintenance` — 16 columns

**One-sentence attempt:** *"A maintenance ticket for a vehicle — and its triage decision, and the temporary vehicle given to the displaced rider, and the permanent replacement."*

**PROBLEM** Three FKs to `vehicles` in one row (`vehicle_id`, `temp_vehicle_id`, `replacement_vehicle_id`) plus `displaced_rider_id` and `booking_id`. The ticket, the triage outcome, and the two different kinds of vehicle substitution are one row.

**WHY** [20260731110000_maintenance_outcome_and_temp_vehicle.sql](supabase/migrations/20260731110000_maintenance_outcome_and_temp_vehicle.sql) added the outcome and temp-vehicle machinery to an existing 8-column ticket table.

**Concrete cost:** a vehicle substitution is an event with a start and an end (the rider gets a temp vehicle, then hands it back). Modelled as columns, there is no record of *when* the substitution began or ended — only which vehicle it was.

**PROPOSED BOUNDARY** Ticket, and vehicle-assignment change as a separate event. Note that `plan_pause_events` already models the *plan* side of this correctly — the vehicle side was never given the same treatment.

**CONFIDENCE** **Medium-high.**

---

## S-08 · `return_settlements` — 20 columns

**One-sentence attempt:** *"The financial reckoning when a rental ends."*

That sentence actually works — the table has **one** responsibility. It fails for a different reason:

**PROBLEM**
1. **Four denormalised FKs** (`rental_id` UNIQUE, plus `booking_id`, `user_id`, `vehicle_id` — all derivable from the first).
2. **`other_charges jsonb`** alongside the typed `rider_charges` table — ad-hoc settlement charges bypass the charge engine entirely.
3. **Computed columns with zero enforcement.** `total_charges`, `net_settlement`, `refund_amount`, `due_amount` are calculated in TypeScript. **`return_settlements` has zero check constraints** — nothing verifies that `total_charges = late_fee_amount + damage_fee_amount + other_charges_amount`, or that `net_settlement = deposit_amount − total_charges`.

**WHY** Written last (Aug 20), as a self-contained summary record so the admin settlement screen could render without joins.

**RECOMMENDATION** As a **snapshot of a financial decision, this table is legitimate and should stay** — recording what was computed at settlement time is proper. The defects are the unenforced arithmetic and the untyped `other_charges` escape hatch.

**CONFIDENCE** **High** on the arithmetic gap. **Low** that the table should be removed — it should not.

---

# WEAK — passes with a caveat

| Table | Sentence | Caveat |
|---|---|---|
| `damages` | "A damage recorded against a rental." | 7 of 18 columns are the dispute sub-workflow — arguably its own process |
| `deposits` | "The security deposit held for a booking." | 1:1 with `bookings` (unique FK); four lifecycle timestamps mirror the status enum |
| `refunds` | "A refund of money to a rider." | `deposit_id NOT NULL` forces all three refund types through a deposit link |
| `data_principal_requests` | "A DPDPA rights request." | 5 request types with different required fields share one shape; `requested_changes jsonb` is the escape hatch |
| `plan_pause_events` | "A period during which a booking's plan was paused." | Good design; only its duplication onto `bookings` is a problem |
| `staff_permissions` | "Which modules a staff member may act on." | `module_key text` and `actions text[]` have no referential integrity |
| `battery_stations` | "A battery swap station." | Three representations of `qis_ids`; `battery_count` with no inventory |
| `audit_logs` | "An audited change to an entity." | `entity_type`/`entity_id` as untyped text — no FK integrity |
| `pii_access_log` | "A staff member's access to personal data." | Same untyped polymorphic pattern |

The last two are a **deliberate and correct** trade-off: an audit log must survive the deletion of what it references, so an untyped pointer is the right call. Noted here only so it is not mistaken for the same defect as `invoices`.

---

# PASS — clean single responsibility

`roles` · `user_roles` · `user_capabilities` · `user_documents` · `auth_otp_attempts` · `consent_notices` · `consent_records` · `retention_policies` · `retention_runs` · `vehicle_models` · `vehicle_photos` · `vehicle_documents` · `scrap_records` · `incident_reports` · `vendors` · `stations` · `battery_station_qis_index` · `plans` · `plan_renewal_settings` · `subscriptions` · `rental_feedback` · `payment_orders` · `payment_transactions` · `webhook_events` · `invoice_items` · `charge_rules` · `discount_rules` · `rider_charges` · `rider_discounts` · `referrals` · `referral_rewards` · `support_requests` · `notification_settings` · `notification_recipients`

Several of these pass the sentence test while still being duplicates of *each other* (`charge_rules`/`discount_rules`) or dead (`incident_reports`, `subscriptions`). **Single responsibility and non-duplication are independent properties** — a table can be perfectly focused and still unnecessary.

---

## Summary

**The mechanism is consistent and worth stating plainly:**

> The tables that failed are the ones that existed **first**. `users`, `bookings`, `rentals`, `vehicles` and `invoices` were all created in the first two waves. Every subsequent feature needed to attach data to a person, a reservation, a ride, a scooter or a bill — and the table was already there. Adding a column was always cheaper than creating an entity, and the additive-only migration policy (`06`, Summary) made it the *only* cheap option.

The result is that **30% of the schema's columns live in 16% of its tables**, and those 8 tables are precisely the ones every business flow touches.

**Two objective signals identify these tables without judgement:**
1. **Grouped check constraints** of the form "if A is set, B and C must be set" — `bookings` has four, `rentals` has three. Each marks an optional sub-entity modelled as columns.
2. **Column count** — the 8 failures average 24 columns; the 34 passes average 8.

Both are mechanically checkable, and either would have flagged these tables months ago.
