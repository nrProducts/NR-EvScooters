# 08 — Source of Truth Map

> For every duplicated business fact: which copy is authoritative *today*, which is legitimate history, which is derived, and which is an unnecessary duplicate.
>
> **Determined from the code, not from the schema.** Where two columns hold the same fact, the source of truth is whichever one the application writes *first* and reads when they disagree.

## Legend

| | Meaning |
|---|---|
| **SOT** | Current source of truth — the authoritative copy |
| **HIST** | Historical source of truth — an immutable record of what was true at a moment. **Legitimate; preserve.** |
| **DERIVED** | Computable from other data. May be materialised for performance, but must be a deliberate decision. |
| **DUPLICATE** | Unnecessary copy. No independent value. |

---

## 1. Identity and access

| Fact | Location | Verdict | Notes |
|---|---|---|---|
| User identity | `auth.users` | **SOT** | Supabase-owned. `public.users.id` is a FK. |
| User profile | `public.users` | **SOT** | Created by `handle_new_auth_user` trigger |
| Last login | `auth.users.last_sign_in_at` | **SOT** | Supabase maintains this |
| | `users.last_login_at` | **DUPLICATE** | App-maintained mirror. Can drift from the real session record. |
| Account usable? | `users.account_status` | **SOT** | Only column expressing `suspended` |
| | `users.active` | **DUPLICATE** | `active=false` ≡ `account_status='inactive'` |
| | `users.deleted_at` | **SOT** (soft delete) | Distinct concept — preserve |
| | `users.erased_at` | **HIST** | DPDPA erasure. Distinct from deletion — preserve. |
| Role | `user_roles` | **SOT** | |
| | JWT role claim (`custom_access_token_hook`) | **DERIVED** | Cache in the token; correctly derived at issue time |
| Module permissions | `staff_permissions` | **SOT** | |
| Capabilities | `user_capabilities` | **SOT** | |
| Permission profile defaults | `apps/backend/src/config/permissionProfiles.ts` | **SOT** | |
| | `apps/web/src/config/permissionProfiles.ts` | **DUPLICATE** | Copy in a second codebase; can drift |

**Finding.** Three authorisation stores plus a JWT cache plus a duplicated config file. The JWT derivation is correct practice; the duplicated TypeScript config is not.

## 2. KYC

| Fact | Location | Verdict | Notes |
|---|---|---|---|
| Document verification state | `user_documents.verification_status` | **SOT** | Per document |
| Overall KYC state | `users.kyc_status` | **DERIVED** | Computed by `compute_kyc_status()`, materialised by `trg_sync_user_kyc_status` |
| Which docs are mandatory | `mandatory_kyc_doc_types()` | **SOT** | A SQL function — i.e. business config as code |
| Document number | `user_documents.doc_number` | **SOT** | ⚠️ Full Aadhaar/DL. See `05` H2. |
| | `user_documents.doc_number_last4` | **DERIVED** | Prepared for the pending truncation migration |

**Assessment.** `users.kyc_status` is a **correctly implemented** materialised derivation: one function owns the rule, a trigger keeps it current, and it fires on insert, update *and* delete. This is the pattern the rest of the schema should have followed. Its only risk is that a direct SQL update to `users.kyc_status` would not be rejected.

## 3. Fleet

| Fact | Location | Verdict | Notes |
|---|---|---|---|
| Which model is this scooter | `vehicles.model_id` | **SOT** | FK to `vehicle_models` |
| | `vehicles.model` (text) | **DUPLICATE** | Legacy free text, `NOT NULL` so it cannot be dropped without backfill |
| | `vehicles.manufacturer` (text) | **DUPLICATE** | Derivable via `vehicle_models.vendor_id → vendors.name` |
| Vehicle availability | `vehicles.status` | **SOT** | Maintained **only** by triggers and `allocate_vehicle_for_booking()` |
| | `vehicles.active` (bool) | **DUPLICATE** | Duplicates `status='scrap'` |
| | `scrap_records` | **HIST** | The *reason* and *approver* are new facts — preserve those; the fact of being scrapped duplicates `status` |
| Battery charge | `vehicles.battery_percentage` | **SOT** | But see §3.1 |
| Battery identity | `vehicles.battery_number` (UNIQUE) | **SOT** | But see §3.1 |
| Insurance | `vehicles.insurance_number` / `insurance_expiry` | **SOT** (de facto) | Actually written |
| | `vehicle_documents` (`doc_type='insurance'`) | **DUPLICATE** | 0 rows, never written — the intended home, unused |
| Vehicle image | `vehicle_models.image` | **SOT** (de facto) | |
| | `vehicle_photos` | **DUPLICATE** | 0 rows |
| Station QIS IDs | `battery_stations.qis_ids` (array) | **SOT** | |
| | `battery_stations.qis_ids_text` | **DERIVED** | `qis_ids_to_text()` |
| | `battery_station_qis_index` | **DERIVED** | Trigger-maintained index |

### 3.1 · The battery has no source of truth

**CURRENT** This is a **battery-swap** business — 37 swap stations, `battery_count` per station, a whole rider-facing map. Yet a battery is modelled as two columns on the scooter: `vehicles.battery_number` (UNIQUE) and `vehicles.battery_percentage`.

**PROBLEM** After a swap, the physical battery in the scooter changes. The unique constraint on `battery_number` says a battery belongs to exactly one scooter forever — which contradicts the business model. There is **no battery entity**, no swap history, and `battery_stations.battery_count` is a bare integer with no inventory behind it.

**WHY** This was a **deliberate decision, correct when it was made**. [20260720100200_fleet.sql](supabase/migrations/20260720100200_fleet.sql) states it explicitly:

> `-- vehicles: master data. Battery is tracked directly on the vehicle`
> `-- (battery_number + live battery_percentage) rather than as its own table.`

At that date (20 July) there was no swap network — a scooter had one battery, and modelling it as an attribute was the right call. `battery_stations` arrived on **3 August**, two weeks later, as a *map feature* showing riders where to go. Nobody revisited the July decision in light of the August feature, so the unique constraint asserting one-battery-per-scooter-forever survived into a business that swaps batteries.

**This is the clearest example in the audit of a sound decision going stale** — not a mistake, but an assumption that outlived its premise.

**RECOMMENDATION** Decide whether batteries are tracked assets. If swaps are a real operational event, the battery is an entity with its own identity, location (a scooter or a station) and history. If the map is purely informational, then `battery_number` should not be unique.

**CONFIDENCE** **High** that the current model is internally contradictory. **Medium** on which way to resolve it — this is a business decision about whether Swapngo tracks battery inventory.

## 4. Plan and subscription — the central question

| Fact | Location | Verdict | Notes |
|---|---|---|---|
| Plan catalogue | `plans` | **SOT** | |
| Plan price rule | `plans.price` | **SOT** | Current rule |
| Price the rider agreed to | `rentals.plan_price_at_pickup` | **HIST** | **Legitimate snapshot — preserve** |
| | `bookings.plan_price_at_cancellation` | **HIST** | **Legitimate snapshot — preserve** |
| Deposit rule | `plans.deposit_amount` | **SOT** | |
| | `DEFAULT_DEPOSIT_AMOUNT` (env) | **SOT** (fallback) | Business rule outside the database |
| Deposit agreed at booking | `bookings.deposit_amount_at_booking` | **HIST** | Snapshot |
| Deposit actually held | `deposits.amount` | **SOT** | The money that exists |
| Deposit at settlement | `return_settlements.deposit_amount` | **HIST** | Snapshot |
| **Subscription state** | `bookings.plan_status` | **SOT** | |
| | `subscriptions.status` | **DUPLICATE** | Table has 0 rows — the concept moved |
| Subscription started | `bookings.plan_activated_at` | **DUPLICATE** | Same event as `rentals.started_at` |
| | `rentals.started_at` | **SOT** | |
| Current billing period | `bookings.current_period_start`, `next_due_at` | **SOT** | Only `payment-overdue-sweep` moves these |
| Cycle counter | `bookings.billing_cycle_number` | **SOT** | |
| Plan duration | `plans.duration_days` | **SOT** (rule) | |
| | `bookings.plan_duration_days` | **HIST** | Snapshot — legitimate |
| | `rentals.plan_duration_days` | **DUPLICATE** | Third copy; derivable from `bookings` |
| Plan paused now? | `bookings.plan_paused_at` | **DERIVED** | The open `plan_pause_events` row |
| Total days paused | `bookings.plan_paused_days_total` | **DERIVED** | `SUM(plan_pause_events.days_paused)` |
| Pause history | `plan_pause_events` | **HIST** | **Preserve** |

**The chain of snapshots is correct in principle.** A plan's price can change; what the rider agreed to must not. Snapshotting at contractual moments is proper design, not duplication — see `10` N-07.

**The defect is that there are four snapshot points for the deposit and no declared authority.** When `bookings.deposit_amount_at_booking` and `deposits.amount` disagree, nothing in the schema or the code says which wins.

## 5. Booking / rental

| Fact | Location | Verdict |
|---|---|---|
| Reservation exists | `bookings` | **SOT** |
| Physical custody | `rentals` | **SOT** |
| Which vehicle | `rentals.vehicle_id` | **SOT** (during custody) |
| | `bookings.vehicle_id` | **SOT** (during hold, pre-pickup) — then a stale copy |
| Which rental is active | `rentals` where `status='active'` | **SOT** |
| | `bookings.active_rental_id` | **DERIVED** | Creates the circular FK |
| Booking lifecycle | `bookings.status` | **SOT** |
| Rental lifecycle | `rentals.status` | **SOT** |
| Booking is finished | `bookings.status='completed'` | **DERIVED** | Only reachable when the rental completes |
| Which plan | `bookings.plan_id` | **SOT** |
| | `rentals.plan_id` | **DUPLICATE** |

**Finding.** `bookings.vehicle_id` and `rentals.vehicle_id` are both authoritative, but at *different phases* — the booking holds a vehicle before pickup, the rental owns it after. After pickup, `bookings.vehicle_id` is a stale copy that nothing updates if the vehicle is later swapped for a temp vehicle during maintenance. **This is a live drift risk**, not just a modelling concern.

**CONFIDENCE** **High.** `vehicle_maintenance.temp_vehicle_id` exists precisely because a rider's vehicle can change mid-rental.

## 6. Money

| Fact | Location | Verdict | Notes |
|---|---|---|---|
| Gateway order | `payment_orders` | **SOT** | Unique `gateway_order_id`, `idempotency_key` |
| **Payment captured** | `payment_transactions` | **SOT** | Unique `gateway_payment_id` — **the idempotency anchor for the whole system** |
| Raw gateway event | `webhook_events` | **HIST** | Preserve |
| Invoice document | `invoices` | **SOT** | |
| Invoice paid? | `payment_transactions` | **SOT** | |
| | `invoices.payment_status` | **DERIVED** | Mirror |
| | `invoices.status='paid'` | **DERIVED** | Second mirror |
| | `invoices.paid_at` | **DERIVED** | Mirrors `payment_transactions.applied_at` |
| | `invoices.gateway_ref` | **DUPLICATE** | Copy of `gateway_payment_id` |
| Invoice line detail | `invoice_items` | **SOT** | Written only by `fn_generate_weekly_invoice()` |
| Charge/discount rules | `charge_rules`, `discount_rules` | **SOT** | |
| Applied adjustments | `rider_charges`, `rider_discounts` | **SOT** | Written only by SQL functions |
| Deposit held | `deposits` | **SOT** | |
| **Refund** | `refunds` | **SOT** | |
| | `bookings.refund_status` / `refund_amount` / `refund_initiated_at` / `refund_completed_at` / `refund_transaction_id` | **DUPLICATE** ×5 | Read-convenience mirror for the rider's booking-history screen |
| | `deposits.refunded_at` / `status` | **DERIVED** | Should follow `refunds` |
| | `return_settlements.refund_amount` / `status` | **HIST** + mirror | The computed settlement is history; the refund *status* is a mirror |
| Damage owed | `damages.amount` | **SOT** | |
| | `damages.outstanding_amount` | **DERIVED** | `amount − deposit_deduction` |
| | `return_settlements.damage_fee_amount` | **HIST** | Snapshot at settlement |
| Late fee owed | `rentals.late_penalty_amount` | **SOT** | Computed at return |
| | `return_settlements.late_fee_amount` | **HIST** | Snapshot |
| Late fee *rule* | `plan_renewal_settings.late_fee_amount` | **SOT** (global) | |
| | `bookings.late_fee_override` | **SOT** (per booking, wins) | |
| | `rentals.late_fee_per_day` | **HIST** | Snapshot of the rate used |
| | `charge_rules` (`late_*_fee`) | **SOT** (generic engine) | **Competing authority** — see below |
| Settlement totals | `return_settlements.total_charges`, `net_settlement`, `refund_amount`, `due_amount` | **DERIVED** | Computed in TypeScript, **unenforced** |

### 6.1 · The late fee has two competing sources of truth

**CURRENT** `plan_renewal_settings` + `bookings.late_fee_override` is one authority chain. `charge_rules` with `charge_code IN ('late_payment_fee','late_return_fee')` is another. Both are live.

**PROBLEM** Two independent mechanisms can each claim to define the late fee, and nothing reconciles them. Whether a rider is charged twice depends on which code path runs.

**WHY** The generic charge engine (Aug 17) was built to be the single mechanism. The per-booking override (Aug 19) was added *after* it, to the older mechanism — meaning the newer, more general system was bypassed rather than extended.

**RECOMMENDATION** This needs verification against live behaviour before the redesign: does a rider with a `late_return_fee` charge rule *and* a `late_fee_override` get charged once or twice? Flagged in `05` §I.

**CONFIDENCE** **Medium-high** that this is a real conflict; **needs runtime verification** to confirm whether it is currently reachable.

### 6.2 · The refund mirror on `bookings` is the largest single duplication

Five columns on `bookings` mirror `refunds`. They exist so the rider's booking-history screen can render refund progress without a join. Every refund state change must update two tables in two statements — and the sweeps (`failed-refund-retry`, `refund-eligibility-sweep`) update `refunds` on a schedule.

**RECOMMENDATION** `refunds` is unambiguously the SOT. The mirror is a read model.
**CONFIDENCE** **Very high.**

## 7. Notifications

| Fact | Location | Verdict |
|---|---|---|
| Delivery attempt | `notifications_log` (`channel`, `status`, `sent_at`) | **SOT** |
| Rider read state | `notifications_log.read_at` | **SOT** |
| Recipient | `notifications_log.user_id` | **SOT** |
| Subject rider | `notifications_log.rider_id` | **DUPLICATE naming** — a second user reference in the same row |
| Recipient email | `notifications_log.email` | **DERIVED** — from `users.email` |
| Which staff get what | `notification_settings` + `notification_recipients` | **SOT** |

`notifications_log.email` is a snapshot of the address used. **Arguably HIST** (proving what address a message went to has value), but it is not declared as such and there is no code that treats it as immutable.

## 8. Compliance

| Fact | Location | Verdict |
|---|---|---|
| Consent decisions | `consent_records` | **HIST** — append-only, trigger-enforced |
| Current consent | `v_current_consents` | **DERIVED** — a view. **The correct pattern.** |
| Notice text | `consent_notices` | **HIST** — versioned, `body_sha256` |
| Rights requests | `data_principal_requests` | **SOT** |
| Erasure link | `users.erasure_request_id` | **SOT** |
| PII access | `pii_access_log` | **HIST** — append-only |
| Audit trail | `audit_logs` | **HIST** — immutable |
| Retention rules | `retention_policies` | **SOT** |
| Retention runs | `retention_runs` | **HIST** |

**The compliance subsystem is the best-designed part of this schema.** Append-only enforced by triggers, current state derived by a view, versioned notices with content hashes, policy as data with a `legal_basis` per row. It should be the model for the rest of the redesign.

---

## Summary — the duplicate register

Ranked by risk of the copies disagreeing in production:

| # | Fact | SOT | Unnecessary duplicates | Risk |
|---|---|---|---|---|
| 1 | Refund progress | `refunds` | 5 cols on `bookings`, 2 on `deposits`, status on `return_settlements` | **High** — sweeps update one side asynchronously |
| 2 | Vehicle assigned to a rider | `rentals.vehicle_id` | `bookings.vehicle_id` after pickup | **High** — temp-vehicle swaps do not update the booking |
| 3 | Invoice paid | `payment_transactions` | 4 cols on `invoices` | **Medium** — same statement, but unenforced |
| 4 | Late fee rule | *ambiguous* | Two competing mechanisms | **Medium** — possible double charge |
| 5 | Subscription state | `bookings.plan_*` | `subscriptions` (dead) | Low — dead table |
| 6 | Plan identity/duration | `bookings` | `rentals.plan_id`, `plan_duration_days` | Low — set once at pickup |
| 7 | Deposit amount | `deposits.amount` | `bookings.deposit_amount_at_booking` | Low — both immutable after booking |
| 8 | Model/manufacturer | `vehicles.model_id` | `model`, `manufacturer` text | Low — cosmetic |
| 9 | Account state | `account_status` | `active` | Low |
| 10 | Settlement totals | its own components | `total_charges`, `net_settlement` | **Medium** — computed in app, zero DB constraints |

**Legitimate historical data — preserve without question:** all contractual snapshots (`plan_price_at_pickup`, `plan_price_at_cancellation`, `deposit_amount_at_booking`, `return_settlements.*`), all append-only compliance tables, `plan_pause_events`, `webhook_events`, `payment_transactions`, `scrap_records`' reason and approver.

**The pattern:** every high-risk duplicate is a **read-model mirror** — a copy written so a screen could avoid a join. None was created carelessly; each solved a real query problem. The cost is that nine facts now have two writers and no declared authority.
