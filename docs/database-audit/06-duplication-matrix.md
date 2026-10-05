# 06 — Duplication Matrix

> Forensic comparison of tables and columns in `jeerugpvchfjlgssfoeb`. Read-only; nothing was changed.
> Every major finding uses **CURRENT → PROBLEM → WHY → RECOMMENDATION → CONFIDENCE**.
> "WHY" answers *why did this happen*, not just *why is it bad* — the purpose of this review is to explain how the schema became complex.

---

# PART 1 — TABLE DUPLICATION

## 1.1 Same business concept under different names

### D-01 · `charge_rules` ↔ `discount_rules`

**CURRENT**

| `charge_rules` (16 cols) | `discount_rules` (16 cols) |
|---|---|
| `charge_code charge_code` | `discount_code discount_code` |
| `charge_name text` | `discount_name text` |
| `description text` | `description text` |
| `amount_type charge_amount_type` | `discount_type` **`charge_amount_type`** |
| `amount numeric` | `value numeric` |
| `frequency_type charge_frequency_type` | `frequency_type discount_frequency_type` |
| `frequency_n int` | `frequency_n int` |
| `scope charge_rule_scope` | `scope charge_rule_scope` |
| `vehicle_id`, `effective_from`, `effective_to`, `active`, `created_by`, `created_at`, `updated_at` | *identical* |

Their check constraints are also mirror images (`chk_charge_rules_vehicle_scope` ≡ `chk_discount_rules_vehicle_scope`, `chk_charge_rules_every_n` ≡ `chk_discount_rules_first_n`).

**PROBLEM** Two tables, two code enums, two frequency enums, and two service code paths model one concept: *a signed monetary adjustment applied on a schedule*.

**WHY** [20260817120000_discount_rules_engine.sql](supabase/migrations/20260817120000_discount_rules_engine.sql) was written three days after the charge engine by copying it. The give-away is line 25: `discount_type public.charge_amount_type` — the discount table **already reuses the charge enum**, because the author recognised mid-copy that the types were identical but did not go back and unify the tables.

**RECOMMENDATION** Treat as one concept in the new design: one rule table with a sign or a `direction` discriminator, one frequency enum, one applied-adjustment table. Keep the code vocabularies (`charge_code`, `discount_code`) distinct if the business genuinely reports on them separately — that is a reporting concern, not a structural one.

**CONFIDENCE** **Very high.** Structural identity is provable from the DDL, and the shared enum is direct evidence of intent.

---

### D-02 · `rider_charges` ↔ `rider_discounts`

**CURRENT** 14 columns each. `booking_id`, `*_rule_id`, `*_code`, `*_name`, `amount`, `billing_cycle_number`, `status`, `invoice_id`, `created_at` are common. `rider_charges` adds the waiver group (`waived_amount`, `waived_reason`, `waived_by`, `waived_at`); `rider_discounts` adds the cancel group (`cancel_reason`, `cancelled_by`, `cancelled_at`). `rider_discounts` also carries `discount_type charge_amount_type` — again the charge enum.

**PROBLEM** The same duplication as D-01, one level down. Both are inserted only by SQL functions (`apply_billing_cycle_charges`, `apply_billing_cycle_discounts`) and both land in `invoice_items` via separate nullable FKs (`rider_charge_id`, `rider_discount_id`).

**WHY** Same copy-paste lineage. Note that `invoice_items` then has to carry **two** nullable FKs and an `item_type` enum to reunite them — a downstream cost paid to keep them apart.

**RECOMMENDATION** One "applied adjustment" table. `invoice_items` then needs one FK instead of two, and `invoice_item_type` collapses from three values to two (`base_rental`, `adjustment`) or disappears.

**CONFIDENCE** **Very high.**

---

### D-03 · `damages` ↔ `incident_reports`

**CURRENT**

| `damages` (18 cols, 3 rows, 5 code refs) | `incident_reports` (10 cols, 0 rows, **0 code refs**) |
|---|---|
| `booking_id`, `rental_id`, `reported_by` | `rental_id`, `vehicle_id`, `reported_by` |
| `description`, `photo_urls text[]` | `description`, `photo_urls text[]` |
| `status damage_status` | `status incident_status` |
| `amount`, `deposit_deduction`, `outstanding_amount` + 7 dispute columns | `incident_type incident_type` (includes `damage`) |

**PROBLEM** Two tables for "something went wrong with a vehicle". `incident_reports` is completely dead.

**WHY** `incident_reports` shipped in the original foundation wave ([20260720100400_support_ops.sql](supabase/migrations/20260720100400_support_ops.sql)). When the money work landed three weeks later, damage needed to be *financial* (an amount, a deposit deduction, a dispute window), and `damages` was created fresh in [20260810100400_deposits_damages_refunds.sql](supabase/migrations/20260810100400_deposits_damages_refunds.sql) rather than extending `incident_reports`. The older table was never removed.

**RECOMMENDATION** One concept. Note that `incident_type` (`accident`, `theft`, `vandalism`) captures real distinctions `damages` cannot express — carry that vocabulary forward rather than discarding it.

**CONFIDENCE** **Very high** that they are duplicates. **Medium** on whether non-damage incidents (theft, accident) are in scope — that is a business question.

---

### D-04 · `user_documents` ↔ `vehicle_documents`

**CURRENT** Both carry `doc_type` (separate enums), `doc_number text NOT NULL`, `expiry_date date`, timestamps. `vehicle_documents` adds `issued_date`; `user_documents` adds storage paths, verification workflow and `doc_number_last4`.
`vehicle_documents`: **0 rows, never written by any code.**

**PROBLEM** Two document tables. Worse, the *same* facts are stored a third time as columns: `vehicles.insurance_number` and `vehicles.insurance_expiry` duplicate a `vehicle_documents` row of `doc_type='insurance'`.

**WHY** `vehicle_documents` was part of the original fleet migration. The admin UI that would have populated it was never built, so when insurance data was needed it was added as columns on `vehicles` instead — the path of least resistance.

**RECOMMENDATION** Decide whether a document is a first-class entity (with storage, expiry tracking and verification) or an attribute. If first-class, one polymorphic document table serves both owners and `vehicles.insurance_*` goes away. If not, drop `vehicle_documents`.

**CONFIDENCE** **High.**

---

### D-05 · `subscriptions` ↔ the 12 plan columns on `bookings`

**CURRENT**

| `subscriptions` (0 rows) | `bookings` (the real implementation) |
|---|---|
| `user_id`, `plan_id` | `user_id`, `plan_id` |
| `status subscription_status` | `plan_status plan_status` |
| `starts_at`, `ends_at` | `plan_activated_at`, `current_period_start`, `next_due_at`, `plan_duration_days` |
| — | `plan_paused_at`, `plan_paused_days_total`, `billing_cycle_number`, `renewal_status`, `scheduled_start_date`, `scheduled_duration_days`, `renewal_invoice_id` |

**PROBLEM** The subscription is the central concept of this business and it is implemented as twelve columns on the reservation table, while the table actually named `subscriptions` sits empty with live FKs from `rentals` and `invoices`.

**WHY** `subscriptions` came from the original short-hire model, where a subscription was thin. When the product became subscription-first in August, the recurring-billing state had to attach to the thing that already had a plan, a price and a payment — which was `bookings`. Reviving `subscriptions` would have meant a data migration; adding columns did not.

**RECOMMENDATION** This is the single most consequential decision in the redesign. The subscription is a real entity with its own lifecycle (periods, pauses, renewals) that outlives any one booking or rental.

**CONFIDENCE** **Very high** that this is the core duplication. See `08` for the source-of-truth analysis.

---

### D-06 · Three representations of one battery-station ID list

**CURRENT** `battery_stations.qis_ids text[]` · `battery_stations.qis_ids_text text` (denormalised join of the array, via `qis_ids_to_text()`) · `battery_station_qis_index` (2-col table, 56 rows, PK on `qis_id`, maintained by `trg_battery_stations_qis_index`).

**PROBLEM** One list, three storage forms, two of them derived.

**WHY** The array came first. Searching inside a `text[]` is awkward, so `qis_ids_text` was added for `LIKE` matching; then the index table was added for exact lookup and uniqueness enforcement across stations. Each layer solved a query problem the previous representation could not.

**RECOMMENDATION** This is a normalisation issue (see `10`, N-01): a station has many QIS IDs — that is a child table, and the array plus the text column are both workarounds for not having one.

**CONFIDENCE** **Very high.**

---

### D-07 · Three ways to express a referral benefit

**CURRENT** `referral_rewards.amount` · `rider_discounts` where `discount_code='referral'` · `bookings.referral_discount_amount`.

**PROBLEM** Three mechanisms; no UI on either app uses any of them.

**WHY** `referrals`/`referral_rewards` shipped in July. `bookings.referral_discount_amount` was added by [20260728100000_referral_discount.sql](supabase/migrations/20260728100000_referral_discount.sql) to actually apply a discount at booking time. In August the generic discount engine arrived with a `referral` code, making the third path. None of the earlier two was retired.

**RECOMMENDATION** Pick one. If the generic discount engine stays, referral becomes a discount rule and `referral_rewards` becomes an event log at most.

**CONFIDENCE** **High** on the duplication; **low** on which to keep, since the feature has no UI and no rows — needs a product decision.

---

### D-08 · `stations` ↔ `battery_stations` — *not* a duplicate, but a naming collision

**CURRENT**

| | `stations` | `battery_stations` |
|---|---|---|
| Concept | Pickup hub (where a rider collects a scooter) | Battery swap point |
| Rows | 2 | 37 |
| Geometry | PostGIS `geography` | `latitude`/`longitude` float8 |
| Direct code refs | **0** (RPC + FK only) | 1 service, actively used |

**PROBLEM** Two genuinely different real-world things share a word, and they use two different spatial models in one database. `stations` also carries `capacity` — an attribute nothing reads.

**WHY** `stations` was designed for the original scooter-share (docks with capacity). Battery swap stations arrived in August as an unrelated feature and were built independently, with plain lat/lng because the map client needed them that way and PostGIS was more machinery than the feature required.

**RECOMMENDATION** Do **not** merge. Rename so the distinction is obvious (e.g. pickup hub vs swap station), and pick one spatial representation for both.

**CONFIDENCE** **High** that they should stay separate. **High** that the current naming and dual geometry are defects.

---

## 1.2 Tables with overlapping responsibilities

### D-09 · `bookings` ↔ `rentals`

**CURRENT** 36 and 29 columns. Circular FK: `bookings.active_rental_id → rentals` and `rentals.booking_id → bookings`. Overlapping facts:

| Fact | On `bookings` | On `rentals` |
|---|---|---|
| Plan identity | `plan_id`, `plan_duration_days` | `plan_id`, `plan_duration_days` |
| Plan price | `plan_price_at_cancellation` | `plan_price_at_pickup` |
| Period end | `next_due_at` | `expires_at`, `return_due_at` |
| Vehicle | `vehicle_id` | `vehicle_id` |
| Lifecycle | `status booking_status` (6 values) | `status rental_status` (4 values) |
| Late fee | `late_fee_override` | `days_late`, `late_penalty_amount`, `late_fee_per_day` |

**PROBLEM** The boundary is undefined. `booking_status` has `fulfilled` **and** `completed`; `completed` is only reached when the *rental* ends — so the booking's status is partly a mirror of the rental's.

**WHY** In the original model a booking was a short reservation and a rental was the ride — a clean split. Once plans became long-running, the subscription state had to live somewhere, and it was put on `bookings` while the physical-custody state stayed on `rentals`. Neither table was re-scoped, so both now carry plan data.

**RECOMMENDATION** Three distinct lifecycles are tangled here: the **reservation** (intent to rent), the **subscription** (the commercial agreement and its billing periods), and the **custody** (which physical scooter is with which rider, when). Separating those three is the structural heart of the redesign.

**CONFIDENCE** **Very high.**

---

### D-10 · `notifications_log` is three tables in one

**CURRENT** 17 columns serving three distinct purposes:

| Purpose | Columns |
|---|---|
| Delivery log | `channel`, `template`, `status`, `sent_at`, `email` |
| Rider inbox | `read_at`, `user_id` |
| Event feed | `notification_type`, `reference_type`, `reference_id`, `booking_id`, `vehicle_id`, `rider_id` |

It carries **both** a generic polymorphic pointer (`reference_type`/`reference_id`) **and** three concrete FKs, and **two columns pointing at `users`** (`user_id` and `rider_id`).

**PROBLEM** A delivery attempt, a user-visible inbox item, and a business event have different lifecycles and different retention rules, but share one row. Retention purges message bodies from this table — which also destroys inbox history.

**WHY** It started as a send log ([20260723000000_notifications.sql](supabase/migrations/20260723000000_notifications.sql)). `read_at` made it an inbox. The notification-manager feature ([20260818100000_notification_manager.sql](supabase/migrations/20260818100000_notification_manager.sql)) added admin-facing event columns (`rider_id`, `vehicle_id`, `booking_id`, `email`) so the admin console could render "who did what" rows — hence a second user column, because `user_id` was already taken by the *recipient*.

**RECOMMENDATION** Split by lifecycle: the event that occurred, the message shown to a user, and each delivery attempt per channel.

**CONFIDENCE** **High.**

---

### D-11 · `deposits` ↔ `bookings.deposit_amount_at_booking`

**CURRENT** `deposits.booking_id` is **UNIQUE** — strictly 1:1 with `bookings`. `deposits.amount` and `bookings.deposit_amount_at_booking` hold the same number.

**PROBLEM** A 1:1 table whose principal value is duplicated back onto the parent.

**WHY** `bookings.deposit_amount_at_booking` was added as a *snapshot* (the deposit rule at the time of booking, immune to later changes in `plans.deposit_amount`). `deposits` was added later, in the money wave, as the thing with a lifecycle. Both survived.

**RECOMMENDATION** Snapshotting the amount is legitimate (see `10`, N-07) — but it should be snapshotted in exactly one place. Since `deposits` owns the lifecycle, that is the natural home.

**CONFIDENCE** **High.**

---

## 1.3 Tables that should be merged

| Merge | Rationale | Confidence |
|---|---|---|
| `charge_rules` + `discount_rules` | Structurally identical (D-01) | Very high |
| `rider_charges` + `rider_discounts` | Structurally identical (D-02) | Very high |
| `damages` + `incident_reports` | One is dead (D-03) | Very high |
| `scrap_records` → vehicle lifecycle | 8 cols, 0 rows, duplicates `vehicles.status='scrap'`; only `reason`/`approved_by`/`estimated_value` are new facts | High |
| `plan_pause_events` + `bookings.plan_paused_*` | The event log and the running totals are the same fact (see `08`) | Medium — the event log is legitimate history; the *totals* on `bookings` are the duplicate |
| `vehicle_photos` + `vehicle_models.image` | One image concept, two homes | Medium |
| `battery_station_qis_index` + `qis_ids` + `qis_ids_text` | One list (D-06) | Very high |

## 1.4 Tables that should be split

| Split | Responsibilities currently mixed | Confidence |
|---|---|---|
| `users` | Identity · contact/address · KYC state · onboarding · referral · DPDPA nominee · erasure state · staff employment · session state | Very high |
| `bookings` | Reservation · subscription · billing cursor · cancellation · refund tracking · renewal scheduling | Very high |
| `notifications_log` | Event · message · delivery attempt (D-10) | High |
| `invoices` | Invoice document · payment state · polymorphic link to 7 parents | High |
| `vehicles` | Asset registry · model attributes (`manufacturer`/`model`) · **battery** (`battery_number`, `battery_percentage`) · insurance document · service schedule · current status | High — see `09` for the battery argument |
| `vehicle_maintenance` | Ticket · triage decision · temp-vehicle assignment · replacement assignment | Medium |

## 1.5 Tables that are unnecessary

| Table | Rows | Refs | Basis |
|---|---|---|---|
| `incident_reports` | 0 | **0** | Dead. Superseded by `damages`. **Conclusive.** |
| `subscriptions` | 0 | 1 (a count) | Concept moved to `bookings`; only dead FKs remain. **Conclusive.** |
| `vehicle_documents` | 0 | 1 read | Never written; duplicated by `vehicles.insurance_*`. **High.** |
| `battery_station_qis_index` | 56 | 0 | Derived index, not a business table. **High.** |
| `qis_ids_text` (column) | — | — | Pure denormalisation of `qis_ids`. **High.** |
| `plan_renewal_settings` | 1 | 2 | Two config values as a single-row table. **High** — see 1.6. |
| `scrap_records` | 0 | 1 | Duplicates `vehicles.status`. **Medium.** |
| `referral_rewards` | 0 | 1 | Third referral mechanism, no UI. **Medium.** |
| `vendors` | 1 | 0 direct | Read-only via embed, no UI. **Low** — may be a real future entity. |

> **Caution on row counts.** This instance has 9 users and 11 bookings; it is a development database. Zero rows alone proves nothing. Only *0 rows **and** 0 code references* is conclusive — which applies to `incident_reports` alone.

## 1.6 Tables that are only configuration

| Table | Rows | Assessment |
|---|---|---|
| `roles` | 1 | Legitimate reference data (FK target). Keep. |
| `retention_policies` | 12 | Legitimate — policy rows are data an operator edits, with `legal_basis` per row. Keep. |
| `plans` | 4 | Legitimate — a product catalogue, referenced by FK. Keep. |
| `charge_rules` / `discount_rules` | 2 / 1 | Legitimate rule tables (time-bounded, scoped, auditable). Keep as one table (D-01). |
| `notification_settings` | 7 | Borderline — one row per `notification_type` enum value. A table whose row set is fixed by an enum. |
| `plan_renewal_settings` | **1** | **Not a table.** Two scalar values (`late_fee_enabled`, `late_fee_amount`) with a `uuid` PK and an `updated_at` trigger. |

**PROBLEM (config)** The boundary between *configuration*, *reference data* and *environment* is arbitrary. `DEFAULT_DEPOSIT_AMOUNT`, `BOOKING_PAYMENT_GRACE_MINUTES`, `DAMAGE_DISPUTE_WINDOW_HOURS` and `DEPOSIT_REFUND_ELIGIBILITY_DAYS` are business rules living in **environment variables**, while the late fee — an equally simple business rule — is a single-row table.

**WHY** Whatever needed an admin UI became a table; whatever did not stayed in `.env`. The driver was the UI, not the nature of the data.

**RECOMMENDATION** Adopt one deliberate rule for where a business parameter lives, based on *who changes it and how often*, not on whether a screen happened to be built.

**CONFIDENCE** **High.**

## 1.7 Tables that are only historical data

Append-only or effectively append-only. These are **legitimate** and should be preserved as a category.

| Table | Enforcement |
|---|---|
| `audit_logs` | `trg_audit_logs_immutable` blocks UPDATE and DELETE |
| `consent_records` | `trg_consent_records_append_only` |
| `pii_access_log` | `trg_pii_access_append_only` |
| `payment_transactions` | Not enforced, but insert-only in practice; unique `gateway_payment_id` is the idempotency anchor |
| `webhook_events` | Insert + a `processed` flag |
| `retention_runs` | Job log |
| `plan_pause_events` | Event log |
| `referral_rewards` | Ledger |
| `notifications_log` | Mixed — history *and* mutable inbox state (D-10) |

**Observation:** three tables have immutability triggers and three equally sensitive financial tables (`payment_transactions`, `refunds`, `invoices`) do not. The protection was applied for DPDPA reasons, not for financial-integrity reasons.

## 1.8 Tables that are only derived / cache data

| Object | Derived from | Maintained by | Assessment |
|---|---|---|---|
| `battery_station_qis_index` | `battery_stations.qis_ids` | Trigger | Pure derived index |
| `battery_stations.qis_ids_text` | `qis_ids` | `qis_ids_to_text()` | Pure denormalisation |
| `v_current_consents` | `consent_records` | View | **Correct pattern** — derived data as a view, not a table |
| `users.kyc_status` | `user_documents.verification_status` | `compute_kyc_status()` + trigger | Materialised derivation. Defensible (read on every request) but it *can* drift |
| `bookings.active_rental_id` | `rentals` where `status='active'` | Application | Derived pointer, creates the circular FK |
| `return_settlements.total_charges`, `net_settlement` | Its own sibling columns | Application, **unenforced** | See `10`, N-08 |
| `damages.outstanding_amount` | `amount − deposit_deduction` | Application | Derived, unenforced |

`v_current_consents` shows the team knew the right pattern. It was simply not applied consistently.

---

# PART 2 — COLUMN DUPLICATION

## 2.1 Person references

| Column | Tables | Verdict |
|---|---|---|
| `user_id` | 17 tables + 1 view | **Consistent — good.** The dominant convention. |
| `rider_id` | `notifications_log` only | **Duplicate.** Same table already has `user_id`. `user_id` = recipient, `rider_id` = subject. Two different roles sharing one entity, distinguished by inconsistent naming. |
| `actor_id` | `audit_logs`, `consent_records`, `pii_access_log` | **Legitimate** — "who performed this", distinct from subject. |
| `target_user_id` | `audit_logs`, `pii_access_log` | **Legitimate** — subject of an audited action. |
| `displaced_rider_id` | `vehicle_maintenance` | Role-specific; fine, but a fourth naming style for a user. |
| `referrer_id` / `referee_id` | `referrals` | **Legitimate** — self-referencing roles. |
| 15 actor-role columns | `created_by`, `reported_by`, `granted_by`, `approved_by`, `processed_by`, `triaged_by`, `waived_by`, `verified_by`, `cancelled_by`, `inspected_by`, `return_approved_by`, `disputed_by`, `dispute_resolved_by`, `assigned_to`, `updated_by` | **Legitimate individually**, but no naming convention — `*_by` vs `assigned_to` vs `*_id`. |

**No `customer_id` exists** — that duplication the user asked about is absent. The real one is `user_id` vs `rider_id` in `notifications_log`.

**CONFIDENCE** **High** on `rider_id`; **high** that the rest are legitimate role distinctions needing only a naming convention.

## 2.2 Vehicle references

| Column | Tables | Verdict |
|---|---|---|
| `vehicle_id` | 12 tables | Consistent — good |
| `model_id` | `vehicles` | **Naming inconsistency** — same FK target as… |
| `vehicle_model_id` | `bookings`, `plans` | …this. One target, two names. |
| `temp_vehicle_id`, `replacement_vehicle_id` | `vehicle_maintenance` | Legitimate roles, but three vehicle FKs in one row |

**No `scooter_id` exists.**

### D-12 · `vehicles.manufacturer` + `vehicles.model` + `vehicles.model_id`

**CURRENT** `vehicles` stores `manufacturer text NOT NULL`, `model text NOT NULL` **and** `model_id uuid → vehicle_models`.

**PROBLEM** The same fact three ways. `vehicle_models` already has `name`, and its `vendor_id → vendors` supplies the manufacturer.

**WHY** `vehicles` shipped in the July fleet migration with free-text make/model. `vehicle_models` arrived a day later for the rider-facing catalogue ([20260721090000_vehicle_catalog.sql](supabase/migrations/20260721090000_vehicle_catalog.sql)). `model_id` was added as a nullable FK to link them, but the original NOT NULL text columns could not be dropped without a backfill, so all three remain.

**RECOMMENDATION** `model_id` is the source of truth; the text columns are legacy.

**CONFIDENCE** **Very high.**

## 2.3 Booking / rental / plan references

| Column | Tables | Verdict |
|---|---|---|
| `booking_id` | 12 tables | Consistent |
| `rental_id` | 6 tables | Consistent |
| `plan_id` | `bookings`, `rentals`, `subscriptions` | **Duplicated fact** — `rentals.plan_id` is derivable from `rentals.booking_id → bookings.plan_id` |
| `subscription_id` | `invoices`, `rentals` | **Dead FKs** — target has 0 rows |
| `active_rental_id` | `bookings` | Derived pointer; source of a circular FK |

**No `reservation_id` or `package_id` exists.**

### D-13 · `return_settlements` carries four FKs, three of them derivable

**CURRENT** `rental_id` (UNIQUE), `booking_id`, `user_id`, `vehicle_id`.

**PROBLEM** Given `rental_id` is unique and `rentals` already has `booking_id`, `user_id` and `vehicle_id`, the other three are pure denormalisation.

**WHY** Written for query convenience — the admin settlements list filters by rider and vehicle without a join.

**RECOMMENDATION** This is a **defensible** denormalisation *if* the values are immutable snapshots. They are not declared as such, and nothing enforces agreement with `rentals`. Either make the intent explicit or derive them.

**CONFIDENCE** **Medium** — this is a judgement call, not a defect. See `10`, N-06.

## 2.4 Monetary columns

45 monetary columns across 21 tables, under **seven** different naming conventions for the same kind of quantity:

| Name | Where |
|---|---|
| `amount` | `charge_rules`, `damages`, `deposits`, `invoice_items`, `payment_orders`, `payment_transactions`, `referral_rewards`, `refunds`, `rider_charges`, `rider_discounts` |
| `value` | `discount_rules` |
| `price` | `plans` |
| `fare` | `rentals` |
| `amount_due` | `invoices` |
| `*_amount` | `refund_amount`, `deposit_amount`, `late_fee_amount`, `damage_fee_amount`, `other_charges_amount`, `cancellation_penalty_amount`, `referral_discount_amount`, `late_penalty_amount`, `disputed_amount_held`, `waived_amount`, `due_amount`, `deposit_amount_at_booking` |
| `estimated_value`, `total_charges`, `net_settlement`, `deposit_deduction`, `outstanding_amount`, `late_fee_per_day`, `late_fee_override`, `plan_price_at_*` | one-offs |

**All are `numeric(10,2)`** — the type is consistent, which is good. **No currency column exists anywhere** except `payment_orders.currency` (defaulted `'INR'`).

### D-14 · The deposit amount is stored in four places

**CURRENT** `plans.deposit_amount` (the rule) → `bookings.deposit_amount_at_booking` (snapshot) → `deposits.amount` (the held amount) → `return_settlements.deposit_amount` (snapshot at settlement). Plus `DEFAULT_DEPOSIT_AMOUNT` in the environment as a fallback.

**PROBLEM** Four copies plus an env fallback, with no enforced relationship.

**WHY** Each was added by a different wave, each for a legitimate reason (rule / booking-time snapshot / lifecycle / settlement snapshot). The problem is not any single copy but that no layer declares which is authoritative when they disagree.

**RECOMMENDATION** Snapshots at contractual moments are correct (see `10`, N-07). Reduce to two: the rule, and the snapshot on the record that owns the money. Analysed in `08`.

**CONFIDENCE** **High.**

### D-15 · Late fee is configured in four places

`plan_renewal_settings.late_fee_amount` (global) · `bookings.late_fee_override` (per booking) · `rentals.late_fee_per_day` + `late_penalty_amount` (computed at return) · `charge_rules` with `charge_code IN ('late_payment_fee','late_return_fee')` (the generic engine).

**PROBLEM** Four mechanisms; the generic charge engine was built to replace the others but did not.
**WHY** Chronology: rental late fees (Aug 4) → global settings (Aug 19) → charge engine (Aug 17) → per-booking override (Aug 19). The engine arrived *between* the two bespoke mechanisms and superseded neither.
**RECOMMENDATION** One mechanism. The charge engine already models scope and time-bounding.
**CONFIDENCE** **High.**

**No `total`, `subtotal`, `final_amount` or `paid_amount` columns exist.** `total_charges`, `net_settlement` and `due_amount` on `return_settlements` are the closest, and they are computed — see `10`, N-08.

## 2.5 Status columns

A bare `status` column exists on **20 tables**, each with a private enum. Full analysis in `05` §C; the duplication view:

| Real-world state | Competing representations |
|---|---|
| Payment succeeded | `payment_status.succeeded` · `payment_order_status.paid` · `invoice_status.paid` · `booking_refund_status.processed` · `refund_status.success` |
| In progress | `payment_status.processing` · `refund_status.processing` · `booking_refund_status.processing` · `return_settlement_status.refund_processing` · `maintenance_status.in_progress` · `support_status.in_progress` · `dp_request_status.in_progress` |
| Cancelled | 7 enums carry `cancelled` |
| Resolved / done | `support_status.resolved` · `maintenance_status.resolved` · `damage_status.resolved` · `dp_request_status.completed` · `rental_status.completed` · `booking_status.completed` |

### D-16 · `invoices` carries four status/type columns

**CURRENT** `status invoice_status` · `payment_status payment_status` · `payment_type payment_type` · `payment_method payment_method`.

**PROBLEM** `status='paid'` and `payment_status='succeeded'` are set by the same statement in [payments.service.ts:526](apps/backend/src/modules/payments/payments.service.ts#L526) — they cannot legally disagree, yet both exist and nothing enforces it.

**WHY** `invoice_status` is the document lifecycle (draft → issued → paid → void); `payment_status` was added when the gateway landed, mirroring `payment_transactions`. The two lifecycles were never reconciled.

**RECOMMENDATION** An invoice has one lifecycle. Payment state belongs to the payment, and the invoice's paid-ness is derived from it.

**CONFIDENCE** **High.**

### D-17 · Account state is stored four ways on `users`

`active boolean` · `account_status account_status` (active/inactive/suspended) · `deleted_at` · `erased_at`.

**PROBLEM** `active=false` and `account_status='inactive'` are the same assertion. Four columns, no declared precedence.
**WHY** `active` came from the original identity migration; `account_status` was added for suspension (a state a boolean cannot express); `deleted_at` for soft delete; `erased_at` for DPDPA. Each addition was reasonable; none removed its predecessor.
**RECOMMENDATION** One lifecycle enum plus timestamps that record *when* each transition happened — not four parallel flags.
**CONFIDENCE** **Very high.**

The same pattern repeats on `vehicles`: `active boolean` duplicates `status='scrap'`, and `scrap_records` duplicates it a third time.

---

## Summary — the mechanism of complexity

Every duplication above has the same shape:

1. A concept ships in wave 1, fit for the business as it was then.
2. The business changes. The concept needs a new capability.
3. **A new table or column is added beside the old one**, because changing the old one requires a data migration and the migration policy forbids editing what has shipped. [supabase/SETUP.md](supabase/SETUP.md) states the rule: *"**Never edit a migration file that has already been applied anywhere** … treat it as immutable. If you got something wrong, write a new one."* Migration authors cite it in turn — [20260815100000_refund_type_enum.sql](supabase/migrations/20260815100000_refund_type_enum.sql): *"Additive only — nothing already applied is edited, per supabase/SETUP.md."*
4. The old one is never retired, because nothing forces it to be.

**The additive-only migration policy is the proximate cause of the complexity.** It is a sound policy for a live production database — but with no periodic consolidation step, five weeks of it produced three coexisting business models. The new database is the consolidation step that never happened.

**CONFIDENCE** **High.** This is directly evidenced by the migration chronology in `02` §6 and by the stated policy in `supabase/SETUP.md`.
