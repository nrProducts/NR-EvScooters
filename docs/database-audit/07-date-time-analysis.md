# 07 — Date / Time Analysis

> Every date and timestamp column in the 51 application tables: **130 columns across 50 tables**.
> Each is classified **A–E**, then the genuine duplicates are analysed.
>
> **Legitimate historical timestamps are explicitly preserved.** A column that records *when a real event happened* is not a duplicate, even when several such columns describe one workflow. The findings below distinguish carefully between the two.

## Classification key

| | Meaning |
|---|---|
| **A** | Same event as another column elsewhere — **duplicate** |
| **B** | A different event — legitimate |
| **C** | A validity period boundary (from/to, effective range) |
| **D** | Historical / audit information — must be preserved |
| **E** | Derived from other data — can be computed |

---

## 1. Type conventions

| Convention | Count | Assessment |
|---|---|---|
| `timestamptz` | 110 | **Correct.** No naive `timestamp` anywhere. |
| `date` | 20 | Used for calendar-day facts |
| `timestamp` (naive) | **0** | Good — a common defect this schema avoids |

`created_at` exists on 44 tables and is `NOT NULL DEFAULT now()` in every case. `updated_at` exists on 29 tables, maintained by 26 identical `set_updated_at` triggers. **This is a healthy, consistent convention and is not a problem** — the only observation is that 26 hand-written triggers could be one schema-wide rule.

### D-18 · `date` and `timestamptz` are mixed within one timeline

**CURRENT**

| On `bookings` (`date`) | On `rentals` (`timestamptz`) |
|---|---|
| `start_day date NOT NULL` | `started_at timestamptz NOT NULL` |
| `current_period_start date` | — |
| `next_due_at date` | `expires_at timestamptz` |
| `scheduled_start_date date` | `return_due_at timestamptz` |

**PROBLEM** One continuous rental timeline is stored in two types. Comparisons require conversion, and "is this overdue?" has two different answers depending on which side you ask.

**WHY** Bookings are a calendar concept — a rider picks a *day*. Rentals are an instant concept — handover happens at a *time*. Both readings are defensible; the defect is that they meet at the boundary (`next_due_at` vs `expires_at`) with no declared conversion rule.

**RECOMMENDATION** Fix a single rule: which facts are calendar days, which are instants, and what timezone a "day" means. This business runs in one timezone (IST), so a `date` is unambiguous — but that assumption should be written down, not inferred.

**CONFIDENCE** **Medium-high.** The mixed types are real; whether they are wrong depends on a business decision about day boundaries.

### D-19 · One `created_at` is named differently

`webhook_events.received_at` is the only "row created" column not called `created_at`. Arguably more precise (it records when the *gateway* event arrived), but it breaks the convention and means retention/reporting queries must special-case it.
**CONFIDENCE** Low impact, **high** certainty.

---

## 2. Full inventory by table

### 2.1 Pure convention (A/D — no problems)

These 22 tables have only `created_at` and/or `updated_at`: `audit_logs`, `auth_otp_attempts`, `consent_records`, `incident_reports`, `invoice_items`, `notification_recipients`, `notification_settings`, `payment_orders`, `pii_access_log`, `plans`, `referral_rewards`, `rental_feedback`, `staff_permissions`, `stations`, `vehicle_models`, `vehicle_photos`, `vendors`, `retention_policies` (`updated_at` only), `plan_renewal_settings` (`updated_at` only), `user_roles` (`created_at` only), `user_capabilities` (`granted_at` only — a naming deviation), `battery_stations` (+ `deleted_at`).

`user_capabilities.granted_at` is semantically a `created_at`. Minor naming inconsistency.

### 2.2 `bookings` — 11 date/time columns

| Column | Type | Class | Notes |
|---|---|---|---|
| `start_day` | date | **B** | The day the rider wants the scooter. Real, distinct. |
| `created_at` / `updated_at` | tstz | D | Convention |
| `cancelled_at` | tstz | **B/D** | Real event. Legitimate history. |
| `plan_activated_at` | tstz | **A** | Same event as `rentals.started_at` — see T-01 |
| `current_period_start` | date | **B** | Billing cursor. Moves every cycle. |
| `next_due_at` | date | **B/E** | Billing cursor. Derivable from `current_period_start + cycle length`, but authoritative in practice. |
| `plan_paused_at` | tstz | **A** | Same event as `plan_pause_events.paused_at` — see T-04 |
| `refund_initiated_at` | tstz | **A** | Same event as `refunds.initiated_at` — see T-02 |
| `refund_completed_at` | tstz | **A** | Same event as `refunds.processed_at` — see T-02 |
| `scheduled_start_date` | date | **B** | Future renewal period start. Real, distinct. |

**Four of eleven are duplicates of timestamps owned by other tables.**

### 2.3 `rentals` — 9 date/time columns

| Column | Type | Class | Notes |
|---|---|---|---|
| `started_at` | tstz | **B** | Handover. **Source of truth for "the ride began".** |
| `ended_at` | tstz | **B** | Ride closed |
| `created_at` / `updated_at` | tstz | D | Convention. Note `created_at` ≈ `started_at` (both default `now()` at insert) |
| `return_requested_at` | tstz | **B** | Rider asked to return. Real, distinct. |
| `return_due_at` | tstz | **B** | Deadline set by the return request |
| `expires_at` | tstz | **B** | Plan-derived deadline (`started_at + plan_duration_days`) — also **E**, it is computed |
| `return_approved_at` | tstz | **B** | Staff approved |
| `inspected_at` | tstz | **B** | Staff inspected |

**Assessment: `rentals`' timestamps are the *good* example in this schema** — eight distinct, real events in a workflow, each recorded once. Only `created_at` vs `started_at` overlaps, and that is harmless.

**But note:** `return_due_at` and `expires_at` are two deadlines requiring a reconciler — see T-03.

**There is no `returned_at`.** The moment of physical handback is captured by `ended_at`, `return_approved_at` and `inspected_at` — three related but distinct events. This is correct, not a gap.

### 2.4 `deposits` — 6 date/time columns

| Column | Class | Notes |
|---|---|---|
| `held_at` | **B/E** | Mirrors `status='held'` |
| `refund_eligible_at` | **B** | Real future deadline (return + 15 days) |
| `refunded_at` | **A/E** | Mirrors `status='refunded'` **and** duplicates `refunds.processed_at` |
| `forfeited_at` | **B/E** | Mirrors `status='forfeited'` |
| `created_at` / `updated_at` | D | Convention |

See T-05 (status-as-timestamps).

### 2.5 `refunds` — 4 date/time columns

| Column | Class | Notes |
|---|---|---|
| `initiated_at` | **B** | **Source of truth** for refund start |
| `last_attempted_at` | **B** | Retry bookkeeping. Distinct and legitimate. |
| `processed_at` | **B** | **Source of truth** for refund completion |
| `created_at` | D | Convention — note `created_at` ≈ `initiated_at` (both `now()` at insert), a mild redundancy |

### 2.6 `damages` — 3 date/time columns

`created_at` (D) · `disputed_at` (**B/E**, mirrors `status='disputed'`) · `dispute_resolved_at` (**B/E**, mirrors `status='resolved'`).
Guarded by `damages_dispute_resolution_chk` (resolution requires a dispute) — a check constraint compensating for state stored twice.

### 2.7 `return_settlements` — 2 date/time columns

`created_at` (D) · `processed_at` (**A** — same event as `refunds.processed_at` when the outcome is a refund; a *different* event when the outcome is `amount_due` and it means "the rider paid"). **One column with two meanings depending on `status`.**

### 2.8 `users` — 8 date/time columns

| Column | Class | Notes |
|---|---|---|
| `date_of_birth` | **B** | Attribute, not an event |
| `created_at` / `updated_at` | D | Convention |
| `deleted_at` | **B** | Soft delete |
| `erased_at` | **B** | DPDPA erasure — genuinely distinct from soft delete |
| `nominee_updated_at` | **B** | Field-level timestamp; the only one in the schema |
| `status_changed_at` | **B/E** | Paired with `status_reason`; overlaps `updated_at` |
| `last_login_at` | **B** | Session fact — duplicates `auth.users.last_sign_in_at` |

`nominee_updated_at` is a **field-level** `updated_at` on a table that already has a row-level one. It exists because DPDPA requires proving when nominee data changed. Legitimate need, inconsistent mechanism — no other regulated field gets this treatment.

### 2.9 Remaining tables

| Table | Columns | Notable |
|---|---|---|
| `charge_rules` / `discount_rules` | `effective_from`, `effective_to` + convention | **C** — proper validity periods. **The correct pattern.** |
| `consent_notices` | `effective_from`, `retired_at`, `created_at` | **C** — validity period with a third name for "to" |
| `data_principal_requests` | `sla_due_at`, `grace_ends_at`, `completed_at` + convention | **B** throughout — legitimate |
| `invoices` | `due_date` (date), `paid_at` + convention | `paid_at` is **A** — same event as `payment_transactions.applied_at` |
| `payment_transactions` | `applied_at`, `created_at` | Near-identical (both `now()` at insert) |
| `plan_pause_events` | `paused_at`, `resumed_at`, `old_next_due_at`, `new_next_due_at`, `created_at` | **D** — event log. `old_/new_next_due_at` is a before/after audit pair: **correct**. |
| `notifications_log` | `sent_at`, `read_at`, + convention | **B** — distinct events, correctly modelled |
| `referrals` | `qualified_at`, `rewarded_at` | **B/E** — mirror `status` (T-05) |
| `retention_runs` | `started_at`, `finished_at` | **B** — job duration. Correct. |
| `rider_charges` | `waived_at`, `created_at` | **B/E** — mirrors `status='waived'` |
| `rider_discounts` | `cancelled_at`, `created_at` | **B/E** — mirrors `status='cancelled'` |
| `scrap_records` | `scrapped_on` (date) + convention | **B** — but `scrapped_on` vs `*_at` is a naming deviation |
| `subscriptions` | `starts_at`, `ends_at` | **C** — dead table |
| `support_requests` | `resolved_at` + convention | **B/E** — mirrors `status='resolved'` |
| `user_documents` | `verified_at`, `expiry_date`, `submitted_at` + convention | **B** — legitimate; `expiry_date` is **C** |
| `vehicle_documents` | `issued_date`, `expiry_date` + convention | **C** — validity period. Dead table. |
| `vehicle_maintenance` | `resolved_at`, `expected_ready_at`, `triaged_at` + convention | **B** — legitimate |
| `vehicles` | `last_service_date`, `next_service_due_date`, `purchase_date`, `insurance_expiry` + convention | `next_service_due_date` is **E**; `insurance_expiry` is **A** (duplicates `vehicle_documents.expiry_date`) |
| `webhook_events` | `received_at`, `processed_at` | **B** — correct |

---

# The genuine duplicates

## T-01 · "The rental began" — recorded three times

**CURRENT**
- `rentals.started_at` — set at handover
- `bookings.plan_activated_at` — set in the same operation
- `bookings.current_period_start` — the first billing period, also that day

**PROBLEM** One real-world moment (staff hands over the scooter) writes three columns in two tables, with two different types (`timestamptz`, `timestamptz`, `date`).

**WHY** `rentals.started_at` is the original. When plans moved onto `bookings`, the subscription needed its own activation instant — and because `bookings` was the plan owner, it got its own copy rather than reading through `active_rental_id`.

**RECOMMENDATION** One event, one column. `current_period_start` is a genuinely different thing (it moves every cycle; the others never move) and should be kept — but its *initial value* is derived from the activation, not independent.

**CONFIDENCE** **High.**

## T-02 · "The refund" — recorded in three tables

**CURRENT**

| Event | `refunds` | `bookings` | `deposits` | `return_settlements` |
|---|---|---|---|---|
| Started | `initiated_at` | `refund_initiated_at` | — | — |
| Completed | `processed_at` | `refund_completed_at` | `refunded_at` | `processed_at` |

Plus `refunds.last_attempted_at` for retries.

**PROBLEM** Two events, seven columns, four tables. Nothing enforces agreement. A failed-then-retried refund updates `refunds` but the mirrors on `bookings` and `deposits` are updated by separate statements that can fail independently.

**WHY** `refunds` is the owner (created Aug 10). `bookings.refund_*` was added Aug 15 by [20260815100200_booking_cancellation_refund_tracking.sql](supabase/migrations/20260815100200_booking_cancellation_refund_tracking.sql) so the rider's booking-history screen could show refund progress **without joining** — a read-convenience denormalisation. `deposits.refunded_at` predates both. `return_settlements.processed_at` came last.

**RECOMMENDATION** `refunds` owns both timestamps. The others are read-model convenience and should be derived, not stored — or if stored for performance, declared as such and maintained in one place.

**CONFIDENCE** **Very high.** This is the clearest timestamp duplication in the schema.

## T-03 · "When is this rental due back" — two deadlines needing a reconciler

**CURRENT** `rentals.expires_at` (plan-derived: `started_at + plan_duration_days`) and `rentals.return_due_at` (set when the rider requests a return). Plus `bookings.next_due_at` (the *payment* deadline, a different thing).

The application has a dedicated function to resolve them — [rentals.service.ts:92](apps/backend/src/modules/rentals/rentals.service.ts#L92):

```ts
export function effectiveDueAt(row): string | null {
    return row.return_due_at ?? row.expires_at;
}
```

**PROBLEM** The existence of `effectiveDueAt()` is the evidence: neither column alone answers the question the business asks.

**WHY** The code comment explains it well — `expires_at` is the plan's own limit, and a return request *overrides* it with the (necessarily earlier) request-day deadline, clamped so it can never extend past the plan. Both facts are real.

**RECOMMENDATION** **These are class B, not A — two genuinely different facts.** The defect is only that the *effective* deadline is not represented, so every consumer must remember to call the reconciler. A generated/derived column or a view would make the answer unambiguous. **Do not collapse these two into one column** — that would lose the distinction between "the plan allows until X" and "you asked to return, so it's due Y".

**CONFIDENCE** **High** that both should be kept; **high** that a derived effective value is missing.

## T-04 · "The plan was paused" — recorded twice

**CURRENT** `bookings.plan_paused_at` + `bookings.plan_paused_days_total` (running state) and `plan_pause_events.paused_at` / `resumed_at` / `days_paused` (event log).

**PROBLEM** The same pause writes both. `plan_paused_days_total` is a running sum of `plan_pause_events.days_paused`.

**WHY** The running fields came first (needed to shift `next_due_at`). The event log was added later for auditability.

**RECOMMENDATION** **The event log is legitimate history — keep it.** `plan_paused_at` is class **E** (derivable: the open event) and `plan_paused_days_total` is class **E** (derivable: `SUM(days_paused)`). Whether to keep them as a materialised running total is a performance decision, but it should be an explicit one.

**CONFIDENCE** **High.** Note the check constraint `bookings_plan_paused_chk` (`plan_status='paused'` ⟺ `plan_paused_at IS NOT NULL`) — again a constraint compensating for state stored twice.

## T-05 · Status stored as both an enum and a set of timestamps

**CURRENT** Six tables store their state twice:

| Table | Enum | Parallel timestamps |
|---|---|---|
| `deposits` | `deposit_status` (pending/held/partially_refunded/refunded/forfeited) | `held_at`, `refunded_at`, `forfeited_at` |
| `damages` | `damage_status` (recorded/disputed/resolved) | `disputed_at`, `dispute_resolved_at` |
| `referrals` | `referral_status` (pending/qualified/rewarded) | `qualified_at`, `rewarded_at` |
| `rider_charges` | `rider_charge_status` (…/waived/…) | `waived_at` |
| `rider_discounts` | `rider_discount_status` (…/cancelled) | `cancelled_at` |
| `support_requests` | `support_status` (…/resolved/closed) | `resolved_at` |

**PROBLEM** The enum and the timestamps can disagree. `deposits.status='refunded'` with `refunded_at IS NULL` is representable and nothing prevents it.

**WHY** The timestamps answer *when*, which an enum cannot. Both are needed — the mistake is treating the enum as independent state rather than as a projection of the timestamps.

**RECOMMENDATION** **Do not delete the timestamps** — they are legitimate history and answer questions the enum cannot. Either derive the status from the timestamps, or (if the enum stays for query convenience) enforce the correspondence. `damages` and `bookings` already do this with check constraints; the other four do not.

**CONFIDENCE** **High.** This is the most systemic timestamp pattern in the schema.

## T-06 · "Invoice paid" — recorded twice

`invoices.paid_at` and `payment_transactions.applied_at` record the same moment, set by the same function ([payments.service.ts:497](apps/backend/src/modules/payments/payments.service.ts#L497)). `payment_transactions` is the source of truth (it has the unique gateway ID); `invoices.paid_at` is a read convenience.
**CONFIDENCE** **High.**

## T-07 · Document expiry — three places

`user_documents.expiry_date` (KYC docs) · `vehicle_documents.expiry_date` (dead table) · `vehicles.insurance_expiry` (the live one).
The first is a different domain and legitimate. The second and third are the same fact — see `06`, D-04.
**CONFIDENCE** **High.**

## T-08 · Five names for "when it stops"

`expiry_date` · `expires_at` · `ends_at` · `effective_to` · `retired_at` — plus `next_service_due_date`, `sla_due_at`, `grace_ends_at`, `due_date`, `return_due_at`, `next_due_at`.

**PROBLEM** Naming only; each is semantically fine.
**WHY** Different authors, different waves, no convention document.
**RECOMMENDATION** One convention: `*_at` for instants, `*_date`/`*_on` for calendar days, and a fixed pair for validity ranges (`effective_from`/`effective_to` is already the best of these — used correctly by `charge_rules` and `discount_rules`).
**CONFIDENCE** **High.**

---

## Summary

| Class | Count | Verdict |
|---|---|---|
| **A — duplicate of another column** | ~12 | Remove or derive |
| **B — distinct real event** | ~70 | **Preserve** |
| **C — validity period** | ~10 | Preserve; unify naming |
| **D — audit/history** | ~30 | **Preserve** |
| **E — derived** | ~8 | Compute, or materialise deliberately |

**The headline:** of 130 date/time columns, only about **12 are genuine duplicates**, and 9 of those come from two causes — refund progress mirrored onto `bookings`/`deposits` (T-02), and plan activation mirrored onto `bookings` (T-01). Both were read-convenience denormalisations added so a screen could avoid a join.

The larger and more systemic issue is not duplication at all but **T-05**: six tables storing their state twice, once as an enum and once as timestamps, with only two of the six enforcing agreement between them.

**This schema's timestamp discipline is better than its table discipline.** `rentals` in particular models eight distinct workflow events cleanly. The problems are concentrated in the money tables, and they follow the same additive-only pattern documented in `06`.
