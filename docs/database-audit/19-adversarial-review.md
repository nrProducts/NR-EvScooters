# 19 — Adversarial Review of the Proposed Schema

> **Filename note.** This was requested as `18-adversarial-review.md`, but `18-admin-console-integration.md` already exists. Overwriting it would have destroyed work, so this is `19-`. Say the word if you want them renumbered.

> **Stance.** Independent Principal DBA. The proposed design in `11`–`18` is assumed wrong until it survives attack. Nothing here is softened because the same author wrote the design.
>
> **Read-only.** No file outside this one was touched, no migration written, no database changed.

---

## Verdict up front

**ARCHITECTURE STATUS: APPROVED WITH CHANGES**

The core architecture survives. Separating booking / subscription / rental is right, `rental_vehicle_assignments` genuinely fixes the stale-vehicle bug, and `payment_allocations` is a real improvement over a status flag.

But **4 CRITICAL and 11 HIGH** issues must be fixed before DDL. Two of them are architectural, not cosmetic:

1. **A paid booking cannot be traced to its payment.** `invoices` has no route back to `bookings`, and money changes hands before the subscription exists.
2. **The design's two source documents disagree on when a subscription is created.**

Plus one finding that undermines the design's own credibility: **the headline "52 → 31 enums, −40%" is false.** The actual count is 53. There is no reduction.

| Severity | Count |
|---|---|
| **CRITICAL** | 4 |
| **HIGH** | 11 |
| **MEDIUM** | 18 |
| **LOW** | 7 |

---

# CRITICAL

## C-1 · A booking's payment is untraceable

**SEVERITY** CRITICAL

**CURRENT DESIGN** `invoices` has exactly one parent FK — `subscription_period_id` — plus a `purpose` enum ([13](13-table-by-table-design.md)). `14` §6.1 step 2 issues the deposit + first-period invoice at **booking** time. `subscriptions` is created at step 5, **pickup**.

**PROBLEM** At booking time there is no subscription, therefore no `subscription_period`, therefore `subscription_period_id IS NULL`. The invoice has **no link to the booking**. The chain `bookings → ? → invoices → payment_orders → payment_transactions` is broken at the first hop.

You cannot answer *"has this booking been paid?"* — the single most important question in the entire flow. The `booking-payment-expiry-sweep` equivalent cannot function: it must find unpaid bookings past their grace window, and there is no join path.

This is the direct consequence of over-correcting `09` S-04. Collapsing seven nullable FKs to one was right in spirit, but the one retained is the only one that does not exist yet at the moment money is collected.

**RECOMMENDATION** Either:
- **(a)** Create the subscription at **payment**, not pickup — then `subscription_periods` exists and the FK works. Pickup creates only the `rental`. This also resolves C-2.
- **(b)** Add `bookings.id` as a second nullable parent on `invoices`, with a CHECK that exactly one of `booking_id` / `subscription_period_id` is set, discriminated by `purpose`.

**(a) is strictly better.** It matches the lifecycle diagram in `12`, and it is what a subscription *is*: the commercial agreement begins when the rider pays, not when they collect the scooter. A rider who pays and never turns up still has an agreement — and under (b) that state is unrepresentable.

**REASON** Payment traceability is not a nice-to-have; it is the integrity boundary of the whole money model. A design that cannot link a payment to what was bought fails at its primary job.

---

## C-2 · The design contradicts itself on when a subscription is created

**SEVERITY** CRITICAL

**CURRENT DESIGN**
- [12](12-proposed-new-erd.md) §1: `B -->|paid| S` — booking becomes subscription **on payment**.
- [14](14-relationship-design.md) §6.1: subscription created at step 5, **"Staff hand over"**.

**PROBLEM** Two authoritative documents specify different lifecycles. This is not a wording slip — it changes:
- whether `deposits.subscription_id NOT NULL` is satisfiable at payment time (**it is not**, under the `14` reading — the deposit is collected but has nowhere to live until pickup);
- whether `subscriptions.started_on` means "agreed on" or "collected on";
- whether a rider who pays but never collects has a subscription;
- whether C-1 has a fix at all.

**RECOMMENDATION** Fix on **payment**. Then: `subscriptions.started_on` = agreement date, `rentals.picked_up_at` = custody date, and the two are legitimately different facts rather than duplicates (see M-7). Update `14` §6.1.

**REASON** An internal contradiction in the spec means the implementation will pick one arbitrarily, and the other document becomes a lie that misleads the next reader.

---

## C-3 · Views will silently bypass RLS

**SEVERITY** CRITICAL

**CURRENT DESIGN** Six views: `v_current_consents`, `v_user_effective_permissions`, `v_invoice_balances`, `v_subscription_current_period`, `v_rental_current_vehicle`, `v_vehicle_availability` ([13](13-table-by-table-design.md)). [17](17-rls-strategy.md) states *"every table has RLS enabled, with no exceptions"* — and never mentions views.

**PROBLEM** A Postgres view executes with the privileges of its **owner**, not the caller, unless created with `security_invoker = true` (PG15+). Created normally by a superuser or `postgres`, **these views bypass every RLS policy underneath them**.

`v_invoice_balances` is the concrete danger: it exposes `total_amount`, `allocated_amount` and `balance_amount` per invoice. Any authenticated rider selecting from it would see **every rider's outstanding balance**. `v_current_consents` and `v_rental_current_vehicle` leak comparably.

The old schema had the same latent issue with `v_current_consents`, and this design inherited it while adding five more views and simultaneously claiming complete RLS coverage — which makes the gap worse, not better, because it is now covered by a false assurance.

**RECOMMENDATION** Every view is created `WITH (security_invoker = true)`. Add it to the `17` policy table as an explicit row, and add an RLS test asserting a rider selecting each view returns only their own rows. Supabase runs PG15+, so this is available.

**REASON** "RLS on every table" is not the same as "RLS on every readable object". The claim as written is false, and a false security assurance is more dangerous than a known gap.

---

## C-4 · Over-allocation and over-refund triggers have a read-write race

**SEVERITY** CRITICAL

**CURRENT DESIGN** [16](16-constraint-strategy.md) §4: constraint triggers assert `SUM(payment_allocations.amount) <= invoices.total_amount` and `SUM(refunds.amount) <= payment_transactions.amount`.

**PROBLEM** Classic phantom read. Two concurrent transactions each insert an allocation, each reads `SUM(...)` **before** the other commits, each sees a passing total, both commit. The invoice is now over-allocated and no constraint fired.

Under Postgres READ COMMITTED — Supabase's default — this is not a theoretical race. The webhook handler and the client-side `verifyPayment` path both call the same apply logic, deliberately, for idempotency. They are *designed* to run concurrently for the same payment.

The same applies to refunds, where the retry sweep and a manual admin retry can overlap.

**RECOMMENDATION** Take a row lock on the parent inside the trigger — `SELECT ... FROM invoices WHERE id = ... FOR UPDATE` before computing the sum — or use a serializable transaction. The lock is the cheaper and more predictable fix.

**REASON** The design's stated purpose for these triggers is preventing over-allocation of money. As specified, they do not prevent it under exactly the concurrency the system is built to tolerate.

---

# HIGH

## H-1 · The enum-reduction claim is false

**SEVERITY** HIGH *(accuracy, not runtime)*

**CURRENT DESIGN** [11](11-proposed-new-schema.md) §7 claims *"52 enums for 51 tables → 30 enums for 59 tables"*, and §8 reports **−42%**. [13](13-table-by-table-design.md) §Enum inventory is headed *"31 types"*.

**PROBLEM** Counting the enums actually listed in `13`: Identity 8, Fleet 7, Commercial 9, Billing 14, Operations 7, Notifications 3, Compliance 5 = **53** (54 with `battery_status`).

The old schema had 52. **The new design has more enums, not 40% fewer.**

The underlying critique in `05` §C1 was sound — `refund_status.success` vs `booking_refund_status.processed` were genuine synonyms and those *are* merged. But roughly as many new enums were introduced by decomposition (`period_status`, `assignment_reason`, `return_status`, `settlement_outcome`, `adjustment_status`, `dispute_outcome`, `delivery_status`, `notification_audience`, `pause_reason`, `refund_reason`, `invoice_purpose`, `related_person_role`, `address_type`, `device_platform`, `maintenance_type`…).

**RECOMMENDATION** Correct both numbers to 53. Either drop the enum-count metric from `11` §8 entirely, or replace it with the claim that is actually true: **synonym enums eliminated — 20 retired, one word per concept**. Recount before any DDL, since the enum list is what the migration will be generated from.

**REASON** A headline metric that is off by 76% discredits every other number in the document. The design is good enough not to need an inflated statistic.

## H-2 · `deposits.status` mirrors refund state — the design's own banned pattern

**SEVERITY** HIGH

**CURRENT DESIGN** `deposits.status deposit_status` = `pending | held | partially_refunded | refunded | forfeited`. [13](13-table-by-table-design.md) states: *"No `refunded_at` or `refund_id`: refund progress is read from `refunds`, removing one of the audit's highest-risk mirrors."*

**PROBLEM** The timestamps were removed but **the status was not**. `partially_refunded` and `refunded` are refund state, living on `deposits`, which must track `refunds.status` as it changes asynchronously (the retry sweep updates refunds on a schedule). That is the textbook definition of a *mirror* per [10](10-normalization-analysis.md) §5 — a mutable value tracking something that changes elsewhere, with two writers and no enforced agreement.

This is precisely audit finding `08` #1, reintroduced in the table that was supposed to fix it.

**RECOMMENDATION** `deposit_status` = `pending | held | released | forfeited`, where `released` means "no longer held by us" and the *financial* outcome is read from `refunds` and `rental_settlements`. Or drop the status and derive it.

**REASON** The design's central lesson is snapshot-vs-mirror. Shipping a mirror in the deposit table repeats the exact bug the redesign exists to remove.

## H-3 · Nothing prevents two bookings holding the same vehicle

**SEVERITY** HIGH

**CURRENT DESIGN** `bookings.held_vehicle_id → vehicles SET NULL`, `hold_expires_at`. `vehicles.status = 'reserved'`. No uniqueness stated in [16](16-constraint-strategy.md) §3.

**PROBLEM** Two riders book the last scooter of a model concurrently. Both transactions read `vehicles WHERE status = 'available'`, both pick the same row, both write `held_vehicle_id`. Nothing at the database level rejects the second.

The old schema at least funnelled this through `allocate_vehicle_for_booking()`, a single SQL function that could hold a lock. The new design removed that function and replaced it with a plain column and no constraint.

**RECOMMENDATION** Partial unique index: `UNIQUE (held_vehicle_id) WHERE held_vehicle_id IS NOT NULL AND status IN ('pending_payment','confirmed')`. Add to `16` §3 alongside the other six partial uniques. Allocation should additionally `SELECT ... FOR UPDATE SKIP LOCKED` when picking a vehicle.

**REASON** Double-allocating a physical asset is a real operational failure — two riders arrive at the hub for one scooter. This is the highest-frequency race in the system and it is currently unguarded.

## H-4 · `vehicles.status` is a mirror of two other tables

**SEVERITY** HIGH

**CURRENT DESIGN** `vehicles.status` = `available | reserved | assigned | maintenance | retired`, maintained by the `sync_vehicle_status_on_assignment` trigger ([16](16-constraint-strategy.md) §8).

**PROBLEM** `reserved` mirrors "an open `bookings.held_vehicle_id` points here". `assigned` mirrors "an open `rental_vehicle_assignments` row points here". `maintenance` mirrors "an open `maintenance_tickets` row". `retired` mirrors "a `vehicle_disposals` row exists".

**Four of five values are derived from four different tables**, and the named trigger only maintains one of those transitions. The other three are left to application code — which is exactly how the old schema's `bookings.vehicle_id` went stale.

**RECOMMENDATION** Either accept it explicitly as a **materialised derivation** — like `rider_profiles.kyc_status`, which `08` §2 praises — with *one* function owning all four transitions and triggers on all four source tables; or derive it in `v_vehicle_availability` and drop the column.

Materialising is defensible (availability is read on every booking screen). Leaving it half-maintained is not.

**REASON** A status with four independent writers and one trigger is the same failure mode the redesign was built to eliminate.

## H-5 · `vehicle_models.specifications jsonb` is a regression

**SEVERITY** HIGH

**CURRENT DESIGN** `specifications jsonb NOT NULL DEFAULT '{}'` — "range, top speed, motor, charge time". Justified as *"unstructured marketing content, never queried arithmetically."*

**PROBLEM** That justification is factually wrong. The **old schema had these as typed columns**: `battery_range_km numeric(6,2)`, `top_speed_kmph numeric(6,2)`, `charging_time_hours numeric(5,2)`, `motor_power_watts integer`. The rider browse screen sorts and filters on them.

Collapsing typed, filterable numerics into JSONB makes range filtering an unindexed JSON extraction with no type safety, no CHECK constraints, and no way to express "range between 60 and 90 km" efficiently. This is under-normalisation introduced *by the redesign*, in a table the old schema modelled correctly.

`features` and `safety_features` as JSONB are fine — those genuinely are unstructured lists.

**RECOMMENDATION** Restore the four typed spec columns. Keep JSONB only for `features` / `safety_features`.

**REASON** The redesign's own rule is *"JSONB only for verbatim external payloads and genuinely schemaless audit data"*. Scooter specifications are neither, and the old design already had this right.

## H-6 · Timezone assumption is documented but unenforced

**SEVERITY** HIGH

**CURRENT DESIGN** [11](11-proposed-new-schema.md) §3: *"Business runs in one timezone (IST); a `date` means an IST calendar day."* Date columns: `subscription_periods.due_on`, `starts_on`, `ends_on`, `bookings.requested_start_on`, `deposits.refund_eligible_on`, `invoices.due_on`.

**PROBLEM** Nothing in the schema enforces this, and Supabase databases run **UTC**. Any cron job or default comparing a `date` to `CURRENT_DATE` or `now()::date` evaluates in UTC. Between 00:00 and 05:30 IST, the UTC date is the *previous* day.

Concrete failures: the payment-due sweep fires a day early for anything running before 05:30 IST; `refund_eligible_on` computed as `returned_at::date + 15` is off by one for any evening return; `bookings.requested_start_on >= CURRENT_DATE` rejects a legitimate same-day booking made after 18:30 IST.

The old schema had the same latent bug. The redesign documented the assumption without closing it.

**RECOMMENDATION** Define one immutable helper — `business_today()` returning `(now() AT TIME ZONE 'Asia/Kolkata')::date` — and mandate it in every default, CHECK and cron predicate that compares a `date`. State the timezone as a schema-level constant, not prose.

**REASON** Off-by-one-day errors in billing are silent, customer-visible, and produce refund disputes. A convention that only exists in documentation is not a convention.

## H-7 · Invoice numbering will not satisfy Indian GST

**SEVERITY** HIGH

**CURRENT DESIGN** `invoices.invoice_number text UNIQUE NOT NULL`, described as "sequence-generated". `invoices.tax_amount numeric(12,2)`.

**PROBLEM** Two separate compliance gaps for an Indian business issuing tax invoices:

1. **Gaps.** A Postgres sequence is non-transactional — a rolled-back insert consumes a number permanently. GST rules require a **consecutive, gap-free** series per financial year. The design has no series concept and no financial-year reset.
2. **Tax structure.** A single `tax_amount` cannot express CGST/SGST/IGST, which is mandatory on a GST invoice. `invoice_items` carries no tax rate or HSN/SAC code, so per-line tax cannot be represented at all. There is also no seller identity anywhere in the schema — no company record, no GSTIN.

The old schema had no tax handling whatsoever, so this is not a regression — but the new design introduces a `tax_amount` column that implies compliance it cannot deliver.

**RECOMMENDATION** Decide explicitly whether GST invoicing is in scope. If yes: an `invoice_series` table (series code, financial year, last number) with gap-free allocation under a row lock; per-line `tax_rate_pct`, `hsn_sac_code`, and CGST/SGST/IGST columns; and a company/GSTIN entity. If no: **remove `tax_amount`** rather than shipping a field that implies tax handling exists.

**REASON** A half-implemented tax field is worse than none — it will be trusted by whoever builds the invoice PDF.

## H-8 · `subscriptions.ends_on` is a mutable derived value

**SEVERITY** HIGH

**CURRENT DESIGN** `ends_on date` — *"`started_on + duration + paused days`"*.

**PROBLEM** It changes every time a pause resolves. It is therefore a **mirror** of `started_on + duration_days_snapshot + SUM(subscription_pauses.days_paused)` — mutable, derived, multi-writer, with no constraint proving agreement. Banned by the design's own rule 4.

`bookings.plan_paused_days_total` was removed for exactly this reason ([10](10-normalization-analysis.md) N-14). The same pattern was then reintroduced one table over.

**RECOMMENDATION** Derive it in `v_subscription_current_period`, or keep the column and add a constraint trigger asserting it equals the computed value — the same treatment `rentals.user_id` gets.

**REASON** Consistency with the design's own rule. A mirror that shifts on every pause is precisely the drift risk the redesign targets.

## H-9 · `rental_settlements` is declared immutable but has mutable FKs

**SEVERITY** HIGH

**CURRENT DESIGN** Classified **SNAPSHOT**, with *"no `updated_at` — immutable"*. Carries `refund_id → refunds` and `invoice_id → invoices`, both set after the row exists ([14](14-relationship-design.md) §5 lists them as deferred forward references).

**PROBLEM** The table cannot be both immutable and hold FKs populated by a later UPDATE. If the immutability trigger is applied as specified, setting `refund_id` fails and the settlement can never be linked to its refund. If it is not applied, the SNAPSHOT classification is untrue and the computed money columns are unprotected.

Same contradiction on `booking_cancellations.refund_id`.

**RECOMMENDATION** Make the immutability trigger column-scoped: freeze the money columns and `outcome`, permit `refund_id` / `invoice_id` to transition **once** from NULL. Or invert the FK so `refunds.rental_settlement_id` points the other way, keeping the settlement genuinely write-once.

**REASON** A classification the schema cannot honour will be silently dropped at implementation time, taking the money-column protection with it.

## H-10 · Staff receive every rider's notification content over realtime

**SEVERITY** HIGH *(privacy)*

**CURRENT DESIGN** `notification_messages` policy: `user_id = auth.uid()` OR `is_staff()` ([17](17-rls-strategy.md) §4), and the table is in the realtime publication (§9).

**PROBLEM** Realtime evaluates policies as the subscribing user. Every staff member with an open console therefore receives a **live stream of every rider's notification `title` and `body`** — KYC rejections, payment failures, refund notices. That is bulk personal-data access with no `pii_access_log` entry, which the DPDPA work elsewhere in this schema is careful to record for far less.

It is also a firehose: one row per rider per event, delivered to every staff browser.

**RECOMMENDATION** Split the policy. Riders: `user_id = auth.uid()`. Staff: only messages whose `notification_type_code` has `default_audience IN ('staff','both')`. Rider-directed messages should not reach staff over realtime at all; staff who need to inspect one should go through the API, which logs it.

**REASON** The console needs a *badge and approval popups*, not every rider's message body. The current policy grants far more than the feature requires.

## H-11 · Encrypted KYC numbers cannot be searched for duplicates

**SEVERITY** HIGH

**CURRENT DESIGN** `document_number_encrypted bytea` (AES-256-GCM, key in app env) + `document_number_last4 text`.

**PROBLEM** AES-GCM is non-deterministic — the same Aadhaar encrypts differently every time. So *"has this Aadhaar already been used by another account?"* is unanswerable without decrypting every row. Duplicate-identity detection is a standard fraud control for a rental business, and `last4` alone yields ~10,000 false positives per match at scale.

**RECOMMENDATION** Add a deterministic **blind index**: `document_number_hmac bytea`, HMAC-SHA256 under a separate pepper, with a unique or non-unique index. Equality search works; the value is not reversible.

**REASON** Encryption at rest solved confidentiality and removed a capability nobody noticed was needed. The blind index restores it without weakening the encryption.

---

# MEDIUM

## M-1 · `rider_profiles` and `staff_profiles` are over-normalised
**CURRENT** Two 1:1 tables, two real columns each (`kyc_status`, `onboarding_completed_at`; `staff_code`, `must_change_password`).
**PROBLEM** With `users.role` now present, the "riders carry null staff columns" justification is weaker — four nullable columns cost less than two tables, two PKs, two RLS policies and a join on every session load. The design's own §2 rule 5 says split when *lifecycles* differ; these do not.
**RECOMMENDATION** Either fold both into `users` (net −2 tables, 55 total), or keep them and drop the justification, which no longer holds.
**REASON** Splitting for tidiness rather than lifecycle is the over-normalisation the brief explicitly warned against.

## M-2 · Duplicate snapshot on `booking_cancellations`
**CURRENT** `booking_cancellations.plan_price_snapshot` alongside `bookings.plan_price_snapshot`.
**PROBLEM** Both are frozen at booking creation and can never differ. A duplicated snapshot is still a duplicate.
**RECOMMENDATION** Drop it; read through `booking_id`.

## M-3 · `plan_id` duplicated on `subscriptions`
**CURRENT** `subscriptions.plan_id` and `bookings.plan_id`, with `subscriptions.booking_id` UNIQUE NOT NULL.
**PROBLEM** Transitively derivable. This is the same class as `rentals.plan_id`, which the design removed and criticised as N-16.
**RECOMMENDATION** Drop, or declare it as a snapshot with the suffix and immutability trigger the convention requires.

## M-4 · No hub is recorded on pickup or return
**CURRENT** `bookings.hub_id`; `rentals` and `rental_returns` have none.
**PROBLEM** A replacement scooter may come from a different hub, and a rider may return to a different hub. Neither is representable, so fleet redistribution and per-hub utilisation cannot be reported.
**RECOMMENDATION** `rental_vehicle_assignments.assigned_hub_id` and `rental_returns.returned_hub_id`.

## M-5 · Invoices can be voided after payment
**CURRENT** `invoice_status` = `draft | issued | void`, no constraint tied to allocations.
**PROBLEM** Nothing prevents voiding an invoice with `payment_allocations` against it, silently orphaning captured money.
**RECOMMENDATION** Constraint trigger: void requires zero allocations, or requires a matching credit note.

## M-6 · Refunds cannot span two payments, and cash cannot be refunded
**CURRENT** `refunds.payment_transaction_id NOT NULL`, single-valued. `payment_method` includes `cash`.
**PROBLEM** A deposit collected across two transactions (initial failure, retry) cannot be refunded in one record. And a cash payment has no gateway transaction to reverse — the schema has no offline-refund path.
**RECOMMENDATION** Allow `payment_transaction_id` to be nullable with a `refund_method` discriminator (`gateway | offline`), or add `refund_allocations` mirroring `payment_allocations`.

## M-7 · `subscriptions.started_on` vs `rentals.picked_up_at`
**CURRENT** Two near-simultaneous timestamps, different types (`date` vs `timestamptz`).
**PROBLEM** Under the `14` reading (subscription created at pickup) these are the *same event* recorded twice in two granularities — audit finding T-01 reproduced. Under the `12` reading they are genuinely different.
**RECOMMENDATION** Resolve C-2 first; if subscription is created on payment, document the distinction explicitly so nobody "tidies" them together later.

## M-8 · Three overlapping return statuses
**CURRENT** `rental_returns.status`, `rentals.status`, `rental_settlements.outcome`.
**PROBLEM** `rental_returns.status = 'approved'` implies `rentals.status = 'completed'` implies a settlement exists. Three enums, partially redundant, no constraint linking them.
**RECOMMENDATION** Acceptable if deliberate — each belongs to a different table's own lifecycle — but document the implication chain and consider a constraint trigger.

## M-9 · `payment_allocations` aggregate is an N+1 on every invoice list
**CURRENT** `v_invoice_balances` computes `SUM(payment_allocations.amount)` per invoice.
**PROBLEM** An admin invoice list of 50 rows runs 50 aggregates. Indexed, but it grows with payment history per invoice and is on the hottest admin screen.
**RECOMMENDATION** Fine at current volume. Benchmark at 10k invoices; if slow, a `LATERAL` join or a maintained `paid_amount` column with a trigger — declared as a materialised derivation, not a mirror.

## M-10 · No partitioning for the unbounded tables
**CURRENT** `audit_logs`, `pii_access_log`, `notification_events`, `notification_messages`, `notification_deliveries` grow without limit; retention purges by `DELETE ... WHERE created_at < cutoff`.
**PROBLEM** Bulk DELETE on a large table is slow, bloats, and needs aggressive vacuum. The notification split multiplies row count roughly 3× versus the old single table.
**RECOMMENDATION** Range-partition by month; retention becomes `DROP PARTITION`. Decide now — converting later is painful.

## M-11 · `pricing_rules` resolution index does not serve the range predicate
**CURRENT** `(is_active, scope, scope_ref_id, effective_from)`.
**PROBLEM** The real query is `effective_from <= today AND (effective_to IS NULL OR effective_to >= today)`. A btree can use only the leading range column; `effective_to` is unindexed.
**RECOMMENDATION** A GiST index on `daterange(effective_from, effective_to)`, or accept a scan on a small table and say so.

## M-12 · No plan price history
**CURRENT** `plans.price_amount` is mutable; contracts are protected by snapshots.
**PROBLEM** Existing agreements are safe, but there is no record of what a plan cost last month — so revenue analysis and dispute resolution ("what was advertised on the 3rd?") are impossible.
**RECOMMENDATION** Either version plans with `effective_from`/`effective_to` like `pricing_rules`, or accept it explicitly.

## M-13 · JWT role claim goes stale on demotion
**CURRENT** `is_staff()` / `is_admin()` read a claim stamped at token issue.
**PROBLEM** Demoting an admin leaves their existing JWT valid until expiry — they retain admin RLS access for up to an hour.
**RECOMMENDATION** Acceptable with a short access-token TTL, but state the window. For immediate revocation the policy must read `users.role`, at a per-row cost.

## M-14 · `has_permission()` in a policy risks recursion
**CURRENT** `has_permission()` resolves `v_user_effective_permissions`, which reads `permissions`, `role_permissions`, `user_permission_overrides` — all of which have RLS policies.
**PROBLEM** If any of those policies calls `has_permission()`, the evaluation recurses. Even without recursion, a view read inside a per-row predicate is expensive.
**RECOMMENDATION** Make the helper `SECURITY DEFINER` and `STABLE`, and keep the underlying permission tables' policies role-based only — never permission-based.

## M-15 · Period transition has no atomic guarantee
**CURRENT** Partial unique on `subscription_periods (subscription_id) WHERE status = 'current'`.
**PROBLEM** Advancing a period requires closing the current one and promoting the next. The unique index forces close-then-open, leaving a window with no current period — during which a concurrent payment cannot find one.
**RECOMMENDATION** Do both in one transaction with the subscription row locked, and document the ordering.

## M-16 · Rounding rules for percentage adjustments are unspecified
**CURRENT** `numeric(12,2)` throughout; `pricing_rules.amount_type = 'percentage'`.
**PROBLEM** Applying two percentage discounts to a base — round each, or round the sum? The two differ by up to ₹0.01 per line, and totals then fail the `invoices` arithmetic CHECK.
**RECOMMENDATION** Specify: each `invoice_item.amount` rounds half-up to 2dp at insert; totals sum the rounded values. Write it into `16`.

## M-17 · Photo storage is inconsistent
**CURRENT** `incidents.photo_paths text[]`; `vehicle_model_media` is a table.
**PROBLEM** The design acknowledges the inconsistency and keeps it. Incident photos plausibly *do* need per-item metadata — who uploaded, when, which inspection.
**RECOMMENDATION** Either accept and document the rule crisply, or make incident photos a child table for consistency with damages evidence handling.

## M-18 · No company / seller entity
**CURRENT** Nothing represents Swapngo itself.
**PROBLEM** Invoices need a seller identity; multi-city expansion would need per-entity numbering and GSTIN. Also blocks any future franchise model.
**RECOMMENDATION** Out of scope today, but note it — retrofitting a tenant key across 59 tables is expensive.

---

# LOW

| # | Issue | Recommendation |
|---|---|---|
| L-1 | `invoice_items.line_number` races on concurrent insert | Assign in one statement, or drop the unique and order by `created_at` |
| L-2 | `invoices (user_id, issued_on DESC)` — draft invoices have NULL `issued_on` | Add `NULLS LAST` or make it partial on `status <> 'draft'` |
| L-3 | No index on `notification_messages.notification_event_id` | Add — needed for cascade delete and event→messages lookup |
| L-4 | `deposit_status.forfeited` appears in no documented flow | Define when forfeiture happens, or drop the value |
| L-5 | `swap_stations.battery_count` is operator-typed with no validation | Already flagged as Phase 2; add a CHECK ≥ 0 meanwhile |
| L-6 | `user_related_persons` merges nominee and emergency contact despite different retention rules | Fine, but retention must filter on `person_role` |
| L-7 | Subscription cancellation mid-term is not walked through | Add to `14` §6 — it must end the rental and force a settlement |

---

# Review coverage

| # | Area | Findings |
|---|---|---|
| 1 | Duplicate concepts | M-2, M-3, H-2 |
| 2 | Missing entities | H-7 (tax, company), M-18, M-6 |
| 3 | Incorrect relationships | **C-1**, M-4 |
| 4 | Incorrect foreign keys | **C-1**, H-9, M-6 |
| 5 | Wrong ownership | H-2, H-4 |
| 6 | Over-normalization | M-1 |
| 7 | Under-normalization | **H-5**, M-17 |
| 8 | Historical data loss | M-12, H-9 |
| 9 | Duplicate timestamps | M-7 |
| 10 | Duplicate statuses | H-2, M-8 |
| 11 | Booking lifecycle | **C-1**, **C-2**, H-3 |
| 12 | Rental lifecycle | M-4, M-8, L-7 |
| 13 | Subscription lifecycle | **C-2**, H-8, M-15 |
| 14 | Payment consistency | **C-4**, M-9 |
| 15 | Invoice consistency | **C-1**, H-7, M-5, M-16 |
| 16 | Refund consistency | H-2, M-6 |
| 17 | Deposit consistency | **C-2**, H-2, L-4 |
| 18 | Vehicle availability | **H-3**, H-4 |
| 19 | Concurrent bookings | **H-3** |
| 20 | Race conditions | **C-4**, H-3, M-15, L-1 |
| 21 | Timezone handling | **H-6** |
| 22 | Money precision | M-16, H-7 |
| 23 | RLS / security | **C-3**, H-10, H-11, M-13, M-14 |
| 24 | Indexing | M-9, M-11, L-2, L-3 |
| 25 | Scalability | M-10, M-9 |

---

# ARCHITECTURE STATUS: **APPROVED WITH CHANGES**

## What survives attack

- **Booking / subscription / rental separation.** Correct and load-bearing. The 1:N subscription→rental relationship genuinely solves the stale-vehicle defect.
- **`rental_vehicle_assignments`.** The strongest single idea in the design — makes the current vehicle unfalsifiable and gives swap history free.
- **`payment_allocations`.** Turning paid-ness into a derived fact over real money movements is right, and enables partial payments the old model could not express.
- **Merging charges and discounts** into a signed adjustment. Provable from the old DDL.
- **Snapshot-vs-mirror discipline**, with a naming convention and immutability triggers. The best idea in the whole body of work — which is why H-2 and H-8 matter: they are violations of the design's own best rule.
- **Compliance domain** carried forward largely untouched. Correct.

## Blocking before DDL

| # | Fix |
|---|---|
| **C-1** | Give a booking's payment a traceable path — preferably by creating the subscription on payment |
| **C-2** | Resolve the subscription-creation contradiction between `12` and `14` |
| **C-3** | `security_invoker = true` on all six views, plus tests |
| **C-4** | Row-lock the parent inside the over-allocation and over-refund triggers |
| **H-1** | Correct the enum count (53, not 31) before generating DDL from that list |
| **H-3** | Partial unique on `held_vehicle_id` |
| **H-5** | Restore typed vehicle-model spec columns |
| **H-6** | `business_today()` helper, mandated in every date comparison |

## Not a redesign

C-1 and C-2 look severe, and they are — but both resolve with the *same* change: move subscription creation to payment. That is a one-line lifecycle decision, not a structural rework. Everything else is a constraint, an index, a policy flag, or a corrected number.

The design is sound. It is not finished.

## One closing observation

Three of the four highest-severity design defects — H-2, H-4, H-8 — are **violations of rules this design itself introduced**. The snapshot/mirror distinction is genuinely the most valuable output of the whole audit, and the design broke it three times while claiming zero mirrors.

That is worth more than the individual fixes: **any rule not mechanically enforced will be violated, including by its own author.** Before DDL, add a checklist pass that greps every proposed column against the rule set — mirrors, unenforced arithmetic, undeclared denormalisation, and derived status. The old schema's problem was never that its authors lacked judgement. It was that nothing checked their work.

---

# Post-review: changes applied

*Appended 2026-08-19, after the review was accepted. Every blocking item is now reflected in `11`–`17`.*

## CRITICAL — all 4 applied

| # | Applied |
|---|---|
| **C-1** | `invoices.subscription_id` is now NOT NULL and always present; `subscription_period_id` and `rental_id` are optional refinements guarded by a CHECK against `purpose`. The booking→payment chain is unbroken (`14` §6.1). |
| **C-2** | **Subscription is created on payment capture**, not pickup. `12` and `14` now agree; `13` states the rule and the three reasons for it. |
| **C-3** | Every view is `WITH (security_invoker = true)`; stated in `13` §Views and in the `17` header. RLS test suite 8 asserts both isolation and the flag itself. |
| **C-4** | Both over-allocation triggers take `FOR UPDATE` on the parent before summing (`16` §4). |

## HIGH — all 11 applied

| # | Applied |
|---|---|
| **H-1** | Enum count corrected to **53** (not 31). The −42% claim is removed from `11` §8 and replaced with what is actually true: 20 synonym enums retired. |
| **H-2** | `deposit_status` → `pending \| held \| released \| forfeited`. Refund state no longer mirrored on the deposit. `forfeited_at`/`forfeit_reason` added (also closes L-4). |
| **H-3** | Partial unique on `bookings.held_vehicle_id` + `FOR UPDATE SKIP LOCKED` allocation (`16` §3). |
| **H-4** | `vehicles.status` declared a materialised derivation with **one** owning function and triggers on **all four** source tables; `v_vehicle_availability` recomputes independently for reconciliation. |
| **H-5** | Typed spec columns restored on `vehicle_models`; JSONB kept only for `features`/`safety_features`. Indexes added. |
| **H-6** | `business_today()` helper mandated in every date default, CHECK and cron predicate (`16` §5b). |
| **H-7** | `tax_amount` **removed**; `invoice_series` added for gap-free per-financial-year numbering under a row lock. Full GST support flagged as a scoped decision, not a column. |
| **H-8** | `subscriptions.ends_on` removed; derived in `v_subscription_current_period`. `ended_at` retained as a real event. |
| **H-9** | Immutability on `rental_settlements` / `booking_cancellations` is column-scoped — money and `outcome` frozen, `refund_id`/`invoice_id` may transition once from NULL. |
| **H-10** | `notification_messages` policy split — staff see only staff-directed types, resolved via `notification_types.default_audience`. |
| **H-11** | `document_number_hmac` blind index added, with its own index. |

## MEDIUM — applied

M-2 (duplicate cancellation snapshot removed) · M-3 (`subscriptions.plan_id` removed) · M-4 (`assigned_hub_id`/`released_hub_id`) · M-5 (void blocked while allocations exist) · M-11 (GiST daterange on `pricing_rules`) · M-14 (`has_permission()` is SECURITY DEFINER + STABLE, permission tables role-gated only) · M-16 (rounding rule specified) · L-2, L-3, L-4 (index and column fixes).

## Deferred, with reasons

| # | Item | Why deferred |
|---|---|---|
| M-1 | Fold `rider_profiles`/`staff_profiles` into `users` | Genuine call either way; kept split so DPDPA-relevant rider state stays separable. Revisit if the join proves hot. |
| M-6 | Refund across two payments / offline refunds | Needs a product answer on whether cash is ever taken. |
| M-9 | `payment_allocations` aggregate cost | Correct at current volume; benchmark at 10k invoices before optimising. |
| M-10 | Partitioning the unbounded tables | Right call at scale, wrong call at 9 users. Decide before the first 10M rows. |
| M-12 | Plan price history | Contracts are already protected by snapshots; this is a reporting want. |
| M-13 | Stale JWT role on demotion | Accepted with a short access-token TTL; documented in `17` §2. |
| M-18 | Company / GSTIN entity | Tied to the H-7 GST decision. |

## Net effect

| | Before review | After |
|---|---|---|
| Tables | 59 | **60** (`invoice_series`) |
| Enums | claimed 31 / actual 53 | **53, stated correctly** |
| Mirrors in the design | 3 (`deposits.status`, `vehicles.status`, `subscriptions.ends_on`) | **0** |
| Views bypassing RLS | 6 | **0** |
| Unguarded money races | 2 | **0** |
| Unguarded vehicle double-hold | yes | **no** |

**Status: the eight blocking items are closed. The design is ready for DDL.**
