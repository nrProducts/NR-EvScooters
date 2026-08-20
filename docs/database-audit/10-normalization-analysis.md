# 10 — Normalization Analysis

> 1NF / 2NF / 3NF assessed against the live schema — **but not applied dogmatically.**
>
> This is a production OLTP system. Several deliberate denormalisations here are *correct* and are defended as such below. The goal is to separate **accidental** denormalisation (a copy nobody decided to make) from **intentional** denormalisation (a snapshot or read model someone chose). Only the first is a defect.

## Headline

| Form | Verdict |
|---|---|
| **1NF** | **7 violations**, 5 of them defensible, 2 genuine |
| **2NF** | **Effectively clean** — almost every table uses a surrogate `uuid` PK, so partial-key dependency cannot arise. Three composite-PK tables checked and clean. |
| **3NF** | **Main problem area** — ~14 transitive dependencies, of which ~6 are legitimate snapshots and ~8 are accidental |

The schema is **not** badly normalised. Its problems are structural (duplication, single responsibility) far more than they are normalisation problems. That is worth stating up front, because a redesign that focuses on normal forms would fix the smaller issue and miss the larger one.

---

# 1. First Normal Form

*Every column holds a single atomic value; no repeating groups.*

## 1.1 Array and JSONB columns

| Table.column | Type | Verdict |
|---|---|---|
| `battery_stations.qis_ids` | `text[]` | **VIOLATION — genuine** (N-01) |
| `staff_permissions.actions` | `text[]` | **VIOLATION — genuine** (N-02) |
| `damages.photo_urls` | `text[]` | Violation, **defensible** (N-03) |
| `incident_reports.photo_urls` | `text[]` | Same; table is dead |
| `consent_notices.purposes` | `consent_purpose[]` | Violation, **defensible** — immutable versioned document |
| `pii_access_log.actor_roles` | `text[]` | **Correct** — an immutable audit snapshot of roles at access time |
| `pii_access_log.fields` | `text[]` | **Correct** — audit payload |
| `return_settlements.other_charges` | `jsonb` | **VIOLATION — genuine** (N-04) |
| `vehicle_models.features` | `jsonb` | **Correct** — unstructured marketing copy |
| `vehicle_models.safety_features` | `jsonb` | **Correct** — same |
| `audit_logs.before_data` / `after_data` / `request_context` | `jsonb` | **Correct** — schemaless by design |
| `notifications_log.payload` | `jsonb` | **Correct** — template variables |
| `payment_transactions.raw_payload` | `jsonb` | **Correct** — verbatim gateway response |
| `webhook_events.payload` | `jsonb` | **Correct** — verbatim webhook body |
| `data_principal_requests.requested_changes` | `jsonb` | Borderline — see N-05 |

**Principle applied:** an array or JSONB column is *correct* when it stores an **immutable payload** (an audit snapshot, a verbatim external document, unstructured content) and a *violation* when it stores **queryable business relationships**.

---

### N-01 · `battery_stations.qis_ids text[]`

**CURRENT** A station's QIS IDs are stored as a `text[]`, plus a denormalised `qis_ids_text` for `LIKE` searching, plus a whole trigger-maintained table `battery_station_qis_index (qis_id PK, station_id)` for exact lookup and cross-station uniqueness.

**PROBLEM** One relationship stored three ways, two of which exist purely to work around the first.

**WHY** The array was the natural first choice — a station "has some IDs". Then the map needed search, so `qis_ids_text` was added. Then uniqueness across stations had to be enforced, which an array cannot do, so the index table was added with a trigger to keep it in sync. **Each layer is a workaround for a limitation of the array.**

**RECOMMENDATION** The index table is already the correctly normalised child relation. It should be the storage, not a derived copy — at which point both the array and the text column disappear, along with `sync_battery_station_qis_index()`, `qis_ids_to_text()` and `text_array_has_duplicates()`.

**CONFIDENCE** **Very high.** The existence of a trigger whose only job is to normalise the array is conclusive.

---

### N-02 · `staff_permissions.actions text[]`

**CURRENT** `staff_permissions (user_id, module_key text, actions text[], granted_by, created_at)`, PK `(user_id, module_key)`.

**PROBLEM** Two untyped dimensions: `module_key` is free `text` with no FK to any module registry, and `actions` is a `text[]` with no constraint on its contents. A typo in either fails silently — the permission simply never matches.

**WHY** The module list lives in TypeScript (`permissionProfiles.ts`, duplicated across backend and web per `08` §1). Making it a database table would have meant keeping the two in sync, so it stayed as strings.

**RECOMMENDATION** Grants are a queryable relationship, not a payload — "who can approve refunds?" should be a join, not an array scan. The module and action vocabularies belong in the database.

**CONFIDENCE** **High.** This is an authorisation surface, where silent failure is the worst failure mode.

---

### N-03 · `damages.photo_urls text[]` — **defensible**

**CURRENT** An array of storage paths.

**ASSESSMENT** Technically a repeating group, but nothing queries *into* it — the application signs the URLs and returns them as a list ([damages.service.ts](apps/backend/src/modules/damages/damages.service.ts)). No ordering, no per-photo metadata, no per-photo lifecycle.

**RECOMMENDATION** **Leave as an array** unless per-photo metadata (caption, who uploaded it, which inspection) is needed. Note the inconsistency though: `vehicle_photos` is a proper child table with `is_primary` and `sort_order` for exactly the same kind of data. **Two patterns for photos in one schema** — pick one.

**CONFIDENCE** **High** that the array is acceptable; **high** that the inconsistency with `vehicle_photos` should be resolved.

---

### N-04 · `return_settlements.other_charges jsonb`

**CURRENT** `other_charges jsonb NOT NULL DEFAULT '[]'` alongside `other_charges_amount numeric`. Typed in the application as `OtherCharge[]` ([returns.types.ts](apps/backend/src/modules/returns/returns.types.ts)).

**PROBLEM** This is **money**, stored untyped, in a schema that already has a fully-featured typed charge system (`charge_rules` → `rider_charges` → `invoice_items`). An ad-hoc settlement charge bypasses the charge engine, so it never appears in `rider_charges`, never reaches `invoice_items`, and is invisible to any report built on those tables.

**WHY** The settlement screen needed free-form line items ("cleaning ₹200") and the charge engine required a pre-existing rule. JSONB was the fast path.

**RECOMMENDATION** Financial line items should be rows. This is the one JSONB column in the schema that holds money.

**CONFIDENCE** **High.**

---

### N-05 · `data_principal_requests.requested_changes jsonb` — **borderline**

Holds the proposed field changes for a `correction` request. Genuinely schemaless (any field of any table could be corrected) and it is a **record of what was asked**, not live data. **Defensible.** Keep.

---

## 1.2 Composite values in single columns

| Column | Issue | Verdict |
|---|---|---|
| `users.address_line_1/2`, `city`, `state`, `postal_code`, `country` | Address as six columns on the person | **Acceptable** — standard practice for one address per person |
| `stations.location geography` | PostGIS point | **Correct** — atomic to the type system |
| `battery_stations.latitude` / `longitude` | Split coordinate | **Acceptable**, but inconsistent with `stations` |
| `plans.billing_cycle text` | Free text where an enum belongs | Not a 1NF issue, but a typing defect (`05` §C3) |

---

# 2. Second Normal Form

*No non-key attribute depends on only part of a composite key.*

**2NF is structurally almost unreachable in this schema**: 48 of 51 tables use a single-column surrogate `uuid` PK, so there is no partial key to depend on.

The three composite-PK tables:

| Table | PK | Non-key attributes | Verdict |
|---|---|---|---|
| `user_roles` | `(user_id, role_id)` | `created_at`, `granted_by` | **CLEAN** — both describe the grant, not either part |
| `user_capabilities` | `(user_id, capability)` | `granted_by`, `granted_at` | **CLEAN** |
| `staff_permissions` | `(user_id, module_key)` | `actions`, `granted_by`, `created_at` | **CLEAN** for 2NF (see N-02 for the 1NF issue) |
| `retention_policies` | `category` (natural, single) | `description`, `retain_days`, `action`, `legal_basis`, `enabled` | **CLEAN** |

**Verdict: 2NF is satisfied throughout.**

### N-06 · Surrogate keys applied inconsistently

**CURRENT** Three join tables correctly use composite PKs. But `notification_recipients` — a pure join table — has `id uuid PRIMARY KEY` **plus** `UNIQUE (notification_setting_id, user_id)`.

**PROBLEM** A redundant surrogate key on a table whose natural key is already declared unique.

**WHY** Convention drift — the `id uuid DEFAULT gen_random_uuid()` pattern was applied by reflex.

**RECOMMENDATION** Minor. Pick one convention for join tables.

**CONFIDENCE** **High** on the observation, **low** on the impact.

### Redundant 1:1 tables

Three tables have a UNIQUE constraint on their parent FK, making them strictly 1:1:

| Table | Unique FK | Assessment |
|---|---|---|
| `deposits` | `booking_id` | 1:1 with `bookings`. Justified — it has its own lifecycle, status and money. **Keep.** |
| `return_settlements` | `rental_id` | 1:1 with `rentals`. Justified — a distinct financial event. **Keep.** |
| `rental_feedback` | `rental_id` | 1:1 with `rentals`. **Borderline** — 3 real columns (`rating`, `comment`, `user_id`); could be columns on `rentals`. Kept separate presumably because feedback is optional and arrives later. **Defensible.** |

None of these is a defect. Splitting a 1:1 relationship is correct when the child has an independent lifecycle — all three do.

---

# 3. Third Normal Form

*No non-key attribute depends transitively on the key via another non-key attribute.*

**This is where the real violations are.** Each is classified **ACCIDENTAL** (a copy nobody decided to make — fix) or **INTENTIONAL** (a snapshot or read model — keep, but declare).

## 3.1 Intentional and correct — temporal snapshots

### N-07 · Contractual price snapshots — **KEEP**

| Column | Transitive path | Verdict |
|---|---|---|
| `rentals.plan_price_at_pickup` | `rentals → plan_id → plans.price` | **INTENTIONAL — correct** |
| `bookings.plan_price_at_cancellation` | `bookings → plan_id → plans.price` | **INTENTIONAL — correct** |
| `bookings.deposit_amount_at_booking` | `bookings → plan_id → plans.deposit_amount` | **INTENTIONAL — correct** |
| `bookings.plan_duration_days` | `bookings → plan_id → plans.duration_days` | **INTENTIONAL — correct** |
| `rentals.late_fee_per_day` | `→ plan_renewal_settings.late_fee_amount` | **INTENTIONAL — correct** |
| `return_settlements.deposit_amount`, `late_fee_amount`, `damage_fee_amount` | from `deposits`, `rentals`, `damages` | **INTENTIONAL — correct** |
| `consent_records.notice_version` | `→ notice_id → consent_notices.version` | **INTENTIONAL — correct** |
| `pii_access_log.actor_roles` | `→ actor_id → user_roles` | **INTENTIONAL — correct** |

**These are textbook 3NF violations and they are all right.** A plan's price can change tomorrow; what the rider agreed to today must not. Normalising these away would be a serious design error — the contract would silently rewrite itself whenever a price changed.

The naming convention (`*_at_pickup`, `*_at_booking`, `*_at_cancellation`) makes the intent explicit, which is good practice. **Only `rentals.late_fee_per_day` lacks such a suffix**, making it ambiguous whether it is a snapshot or a live value.

**RECOMMENDATION** Preserve every one. Extend the naming convention so a snapshot is always identifiable from its name.

**CONFIDENCE** **Very high** that these must be kept.

## 3.2 Accidental — genuine violations

### N-08 · `return_settlements` computed columns, unenforced

**CURRENT**
```
total_charges   = late_fee_amount + damage_fee_amount + other_charges_amount
net_settlement  = deposit_amount − total_charges
refund_amount   = net_settlement > 0 ? net_settlement : 0
due_amount      = net_settlement < 0 ? −net_settlement : 0
```
All four are stored, all four are computed in TypeScript ([returns.service.ts](apps/backend/src/modules/returns/returns.service.ts)), and **`return_settlements` has zero check constraints.**

**PROBLEM** Four derived money columns with no database-level guarantee they agree with their own inputs. A bug or a manual correction can produce a settlement whose parts do not sum to its total, and nothing will detect it.

**WHY** Written last, computed once at approval, stored for display. The arithmetic was never expressed as a constraint.

**RECOMMENDATION** Keep the columns — as an immutable snapshot of a financial decision they are legitimate (see N-07). But the arithmetic must be enforced, either by check constraints or by generated columns. Compare `bookings`, which has five check constraints guarding far less consequential invariants.

**CONFIDENCE** **Very high.** This is the most serious integrity gap found in the audit.

---

### N-09 · `damages.outstanding_amount`

**CURRENT** `outstanding_amount = amount − deposit_deduction`, stored, with only a `>= 0` check.

**PROBLEM** Same class as N-08 — derived, stored, arithmetic unenforced.
**RECOMMENDATION** Generated column, or a check constraint.
**CONFIDENCE** **High.**

---

### N-10 · `vehicles.manufacturer` and `vehicles.model`

**CURRENT** `vehicles → model_id → vehicle_models.name` and `→ vendor_id → vendors.name` already provide both facts. The text columns are `NOT NULL` legacy.
**Verdict** **ACCIDENTAL** — a transitive dependency left behind by an incomplete migration (see `06` D-12).
**CONFIDENCE** **Very high.**

---

### N-11 · `bookings` refund mirror

**CURRENT** `refund_amount`, `refund_status`, `refund_initiated_at`, `refund_completed_at`, `refund_transaction_id` all depend on `refunds` (via `refunds.booking_id`), not on `bookings.id`.
**Verdict** **ACCIDENTAL** in form, *intentional* in motive — added as a read model so the rider's booking-history screen could avoid a join.
**PROBLEM** Unlike the snapshots in N-07, these are **not immutable**. They must track a value that changes asynchronously (retry sweeps update `refunds` on a schedule). A read model over mutable data must be maintained by one mechanism; here it is maintained by several.
**RECOMMENDATION** Derive, or maintain in one place. **This is the highest-risk 3NF violation in the schema** — see `08` §6.2.
**CONFIDENCE** **Very high.**

---

### N-12 · `invoices` payment mirror

`payment_status`, `paid_at`, `gateway_ref`, `payment_method` all depend on `payment_order_id → payment_transactions`, not on `invoices.id`.
**Verdict** **ACCIDENTAL.** Same class as N-11, lower risk (set in the same statement).
**CONFIDENCE** **High.**

---

### N-13 · `notifications_log.email`

Depends on `user_id → users.email`.
**Verdict** **Ambiguous.** If it records the address actually used, it is a legitimate snapshot (N-07 class). Nothing declares this and no code treats it as immutable — so today it is an accidental copy that happens to be useful.
**RECOMMENDATION** Decide and declare.
**CONFIDENCE** **Medium.**

---

### N-14 · `bookings.plan_paused_days_total` and `plan_paused_at`

Both derivable from `plan_pause_events` (`SUM(days_paused)`; the open event).
**Verdict** **ACCIDENTAL** — the running totals predate the event log and were not retired when it arrived.
**Note** `bookings_plan_paused_chk` enforces `plan_status='paused' ⟺ plan_paused_at IS NOT NULL`, but nothing ties either to `plan_pause_events`.
**CONFIDENCE** **High.**

---

### N-15 · `bookings.active_rental_id`

Derivable as `rentals WHERE booking_id = ? AND status = 'active'`. Creates one of the four circular FKs (`05` §E1).
**Verdict** **ACCIDENTAL**, though a defensible performance shortcut.
**RECOMMENDATION** If kept, enforce that it points at a rental of this booking. Nothing currently does.
**CONFIDENCE** **High.**

---

### N-16 · `rentals.plan_id` and `rentals.plan_duration_days`

Derivable via `rentals.booking_id → bookings`. A third copy of the plan reference.
**Verdict** **ACCIDENTAL** — though note `rentals.booking_id` is nullable (`ON DELETE SET NULL`), which may be the reason. If a rental can genuinely exist without a booking, `plan_id` is not transitive and this is correct. **Needs verification.**
**CONFIDENCE** **Medium** — depends on whether booking-less rentals are real.

---

### N-17 · `users.kyc_status`

Derivable from `user_documents.verification_status` via `compute_kyc_status()`.
**Verdict** **INTENTIONAL and correctly implemented** — a materialised derivation with a single owning function and a trigger firing on insert, update and delete. Read on nearly every request, so materialising it is justified.
**Only gap:** a direct SQL update to `users.kyc_status` would not be rejected.
**CONFIDENCE** **High** that this is correct practice. **This is the model the other derivations should follow.**

---

### N-18 · `return_settlements` denormalised FKs

`booking_id`, `user_id`, `vehicle_id` are derivable via the unique `rental_id`.
**Verdict** **Borderline.** As snapshot columns on an immutable settlement record they are defensible (N-07 class); as live copies they are transitive dependencies. Nothing declares which. Same ambiguity as N-13.
**CONFIDENCE** **Medium.**

---

# 4. Beyond 3NF — brief notes

**BCNF:** No violations found. No table has overlapping candidate keys where a non-trivial determinant is not a superkey.

**4NF:** No multi-valued dependencies. `vehicle_maintenance` comes closest — `temp_vehicle_id` and `replacement_vehicle_id` are independent facts about one ticket — but they are single-valued, so this is a single-responsibility issue (`09` S-07), not a 4NF one.

---

# 5. Summary

## Violation register

| # | Location | Form | Class | Severity |
|---|---|---|---|---|
| N-08 | `return_settlements` totals | 3NF | Accidental | **High** — money, zero constraints |
| N-11 | `bookings` refund mirror | 3NF | Accidental | **High** — mutable, async writers |
| N-01 | `battery_stations.qis_ids` | 1NF | Accidental | **High** — three representations |
| N-02 | `staff_permissions.actions` | 1NF | Accidental | **High** — authorisation, silent failure |
| N-04 | `return_settlements.other_charges` | 1NF | Accidental | **Medium** — untyped money |
| N-09 | `damages.outstanding_amount` | 3NF | Accidental | Medium |
| N-10 | `vehicles.manufacturer`/`model` | 3NF | Accidental | Medium |
| N-12 | `invoices` payment mirror | 3NF | Accidental | Medium |
| N-14 | `bookings.plan_paused_*` | 3NF | Accidental | Medium |
| N-15 | `bookings.active_rental_id` | 3NF | Accidental | Low |
| N-16 | `rentals.plan_id` | 3NF | Needs verification | Low |
| N-13 | `notifications_log.email` | 3NF | Ambiguous | Low |
| N-18 | `return_settlements` FKs | 3NF | Ambiguous | Low |
| N-06 | `notification_recipients.id` | 2NF-adjacent | Convention | Negligible |

## Denormalisations to preserve

**N-07** (all eight contractual snapshots) · **N-17** (`users.kyc_status`) · **N-03** (`damages.photo_urls`) · `pii_access_log` arrays · all verbatim-payload JSONB · the three 1:1 tables.

## What this analysis actually shows

Normalisation is **not** this schema's main problem. 2NF is clean, 1NF has two genuine violations, and half the 3NF violations are correct temporal snapshots.

The real finding is a **missing distinction**. The schema contains two kinds of redundancy that look identical in the DDL:

- **Snapshots** — immutable, recorded once at a contractual moment. `plan_price_at_pickup`. Correct, and named clearly.
- **Mirrors** — mutable, must track a value that keeps changing elsewhere. `bookings.refund_status`. Dangerous, and named exactly like a normal column.

Both are 3NF violations. One is good design and one is a drift bug waiting to happen, and **nothing in the schema tells them apart** — no naming rule, no comment, no constraint. The snapshots got a naming convention (`*_at_pickup`); the mirrors got nothing.

Every high-severity item in the register above is a **mirror**. Every item safe to keep is a **snapshot**.

**RECOMMENDATION** Make the distinction explicit and enforceable: snapshots are immutable and named as such; mirrors either do not exist, or are maintained by exactly one mechanism with a constraint proving they agree with their source.

**CONFIDENCE** **High.** This distinction explains the severity ordering of every violation found, and it is the single most transferable lesson for the new design.
