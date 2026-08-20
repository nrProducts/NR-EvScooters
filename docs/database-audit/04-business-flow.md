# 04 — Business Flow

> Reconstructed from the application code and Edge Functions, not from the ERD. Where the code and the schema disagree, the code is what actually happens.

## 0. The flow in one line

```
SIGNUP → PROFILE → CONSENT → KYC → BROWSE MODELS → PICK PLAN → BOOK (holds a vehicle)
   → PAY (deposit + first period) → CONFIRMED → PICKUP (staff) → RENTAL ACTIVE
   → weekly billing cycles … → REQUEST RETURN → STAFF INSPECT → APPROVE
   → SETTLEMENT (deposit − late fee − damages) → REFUND or AMOUNT DUE → CLOSED
```

---

## 1. USER → PROFILE → CONSENT

| Step | What happens | Tables |
|---|---|---|
| Rider signs up | Phone OTP. Supabase Auth generates and verifies; `send-sms` only delivers via MSG91. Rate-limit attempts recorded. | `auth.users`, `auth_otp_attempts` |
| Profile row appears | **`handle_new_auth_user` trigger** inserts into `public.users`. `trg_set_referral_code` stamps a referral code. | `users` |
| Profile setup | `profile-setup.tsx` → `PATCH /users/me`. Sets `profile_completed = true`. | `users` |
| Consent | Rider is shown the active `consent_notices` row (EN/TA) and grants per-purpose consent. Append-only. Current state read via `v_current_consents`. | `consent_notices`, `consent_records` |

Staff accounts take a different path: created by an admin via `POST /users`, invited by email, `must_change_password = true` forces a reset on first login.

## 2. KYC

| Step | What happens | Tables |
|---|---|---|
| Upload | Rider uploads front/back images to the private `kyc-documents` bucket; a row per document. | `user_documents` |
| Auto-status | `trg_sync_user_kyc_status` fires on every insert/update/delete and recomputes `users.kyc_status` via `compute_kyc_status()`, against `mandatory_kyc_doc_types()`. | `users.kyc_status` |
| Review | Admin with the `kyc_reviewer` capability approves or rejects each document. `trg_guard_document_verification` constrains the transition. Every view of a document number is logged. | `user_documents`, `pii_access_log`, `audit_logs` |

**KYC status derivation flow**: `verification_status` per document → `compute_kyc_status()` → `users.kyc_status` ∈ {not_submitted, pending, partially_verified, verified, rejected}.

Gating is enforced **in the database**: `trg_enforce_kyc_before_booking` and `trg_enforce_kyc_before_rental` reject inserts for un-verified riders. The app also gates in `useBookingGate` / `useRentGate`, so the rule exists in two places.

## 3. DISCOVERY

- Rider browses **`vehicle_models`** (marketing catalogue: specs, features, images) — not individual scooters. Served by the `vehicle-catalog` module.
- Availability is a **count of `vehicles`** in `status='available'` for that model.
- **`stations`** (pickup hubs) are found via the `nearest_station()` PostGIS RPC.
- **`battery_stations`** are a completely separate network shown on a map, with clustering, area search via the geocode proxy, and per-station battery counts.

## 4. PLAN → BOOKING

A **plan** (`plans`) is `name + billing_cycle + price + duration_days + deposit_amount`, scoped to a `vehicle_model_id`.

| Step | What happens | Tables |
|---|---|---|
| Create booking | `createBooking` inserts `bookings` with `status='pending_payment'`, a `start_day`, the chosen plan and station. `trg_booking_start_day_not_past` rejects past dates. `trg_enforce_kyc_before_booking` rejects un-verified riders. | `bookings` |
| Hold a vehicle | `allocate_vehicle_for_booking()` picks an available `vehicles` row and reserves it — `vehicles.status → 'booked'`, `bookings.vehicle_id` set. | `vehicles`, `bookings` |
| Price it | Deposit from `plans.deposit_amount` (falling back to `DEFAULT_DEPOSIT_AMOUNT` env), snapshotted onto `bookings.deposit_amount_at_booking`. Referral discount into `bookings.referral_discount_amount`. Draft invoices created. | `invoices`, `deposits` |

**Timeout**: if the rider never pays, `booking-payment-expiry-sweep` (every 15–30 min) sets `status='expired'` after `BOOKING_PAYMENT_GRACE_MINUTES`, and `trg_release_vehicle_on_booking_close_fn` automatically frees the held vehicle. `failed-payment-retry` nudges the rider hourly first.

### `booking_status`

| From | To | Trigger |
|---|---|---|
| — | `pending_payment` | booking created |
| `pending_payment` | `confirmed` | payment succeeds (`applyBookingInitialSuccess`) |
| `pending_payment` | `expired` | expiry sweep |
| `pending_payment` / `confirmed` | `cancelled` | rider or admin cancels |
| `confirmed` | `fulfilled` | staff confirms pickup, rental created |
| `fulfilled` | `completed` | return approved |

## 5. PAYMENT

Razorpay. **All three entry points converge on one idempotent function**, `applyPaymentSuccess` in [payments.service.ts](apps/backend/src/modules/payments/payments.service.ts):

```
createOrderForBooking / createOrderForInvoice
        → payment_orders (status 'created')
        → rider pays in Razorpay Checkout
        → verifyPayment (client callback)  ─┐
        → handleWebhook (server-to-server) ─┴→ applyPaymentSuccess
```

`applyPaymentSuccess` then, in order:
1. Inserts `payment_transactions`. **The unique constraint on `gateway_payment_id` is the idempotency anchor** — a duplicate webhook hits `23505` and returns as a no-op.
2. `payment_orders.status → 'paid'`.
3. `invoices` → `status='paid'`, `payment_status='succeeded'`, `paid_at`, `gateway_ref`.
4. Branches on `payment_orders.purpose`:
   - `booking_initial` → `applyBookingInitialSuccess`: booking → `confirmed`, deposit → `held`.
   - `weekly_due` → `applyWeeklyDueSuccess`: advances the billing cycle or schedules a renewal.
   - `damage_settlement` → closes `return_settlements` to `settlement_completed`.
5. Notifies the rider and the admin channel.

`webhook_events` records every inbound webhook with `signature_valid` for later reconciliation.

### Status vocabularies in play at this moment
`payment_order_status` (created→attempted→paid/failed/expired) · `payment_status` (pending→processing→succeeded/failed/refunded) · `invoice_status` (draft→issued→paid/overdue/void) — **three enums advancing in lockstep for one real-world event.**

## 6. PICKUP → RENTAL

| Step | What happens | Tables |
|---|---|---|
| Pickup queue | Staff see `confirmed` bookings whose `start_day` has arrived. `pickup-reminder` pushed the rider yesterday. | `bookings` |
| Confirm pickup | `confirmPickup` creates the `rentals` row, sets `bookings.status='fulfilled'` and `bookings.active_rental_id`, and moves `vehicles.status → 'assigned'`. | `rentals`, `bookings`, `vehicles` |
| Plan activation | `bookings.plan_activated_at`, `current_period_start`, `next_due_at`, `plan_status='active'`, `billing_cycle_number` begins. `rentals.expires_at = started_at + plan_duration_days`. | `bookings`, `rentals` |

### `rental_status`
`active` → `completed` (normal return approved) · `force_ended` (admin ends it) · `cancelled`.

### `vehicle_status`
`available` → `booked` (held by a pending booking) → `assigned` (rider has it) → `available` (returned) · `maintenance` · `scrap`. Moved by `allocate_vehicle_for_booking`, `trg_release_vehicle_on_booking_close_fn` and `trg_sync_vehicle_status_fn` — **never by application code directly**.

## 7. RECURRING BILLING

Weekly cycles while the rental is active:

```
fn_generate_weekly_invoice(booking_id)
   ├── apply_billing_cycle_charges(booking, cycle, vehicle)
   │      reads charge_rules (global or per-vehicle, frequency-matched)
   │      writes rider_charges
   ├── apply_billing_cycle_discounts(booking, cycle, vehicle, base)
   │      reads discount_rules
   │      writes rider_discounts
   └── writes invoices + invoice_items (base_rental | charge | discount)
```

- `payment-due-reminder` pushes at −3d, −1d and on `bookings.next_due_at`.
- `payment-overdue-sweep` runs past the due date and does **one** of two things: activate a pre-paid scheduled period (`renewal_status='scheduled'` — the "pay now, activate later" design), or mark `plan_status='due'`.
- **Paying early never moves `current_period_start` / `next_due_at`.** Only the overdue sweep does, and only once the old period has actually run out.
- Late fees come from `plan_renewal_settings` (global toggle + amount), overridable per booking by `bookings.late_fee_override`.

## 8. MAINTENANCE (and plan pause)

| Outcome | What happens |
|---|---|
| `quick_fix` | Vehicle repaired, rider keeps it, no pause. |
| `standard_temp` | Rider gets a **temp vehicle** (`vehicle_maintenance.temp_vehicle_id`); plan pauses while they wait. |
| `not_repairable` | Vehicle scrapped, rider reassigned to a `replacement_vehicle_id`. |

Pause/resume math lives in [plans.service.ts](apps/backend/src/modules/plans/plans.service.ts) (`pausePlanForBooking`, `resumePlanForBooking`, `computePlanResume`): `bookings.plan_status='paused'`, `plan_paused_at` set, and on resume `next_due_at` is shifted by the paused days, accumulating into `plan_paused_days_total`. Each pause is also logged to `plan_pause_events`.

Resume is normally **event-driven** (called directly by `assignTempVehicle`, the handback branch, and `reassignAfterScrap`). `maintenance-plan-resume-safety-net` is a daily backstop for the case where that path did not fire.

## 9. RETURN → SETTLEMENT

The most complex flow in the product. Orchestrated by `approveReturnSettlement` in [returns.service.ts](apps/backend/src/modules/returns/returns.service.ts).

| Step | What happens |
|---|---|
| 1. Rider requests return | `rentals.return_requested_at`, `return_reason`, `return_feedback`, and `return_due_at` set. `plan-expiry-reminder` stops nagging. |
| 2. Staff inspect | `rentals.inspected_at` / `inspected_by`. Damages recorded individually into `damages` — **without** their usual per-item invoice, because the settlement bills one combined amount. |
| 3. Compute settlement | `deposit_amount` − (`late_fee_amount` + `damage_fee_amount` + `other_charges_amount`) = `net_settlement`. Late fee from `computeLateReturnPenalty` (days late × per-day rate). |
| 4. Close the ride | Reuses `completeRide`: `rentals.status='completed'`, `bookings.status='completed'`, `vehicles.status='available'`. |
| 5. Settle | If `net_settlement > 0` → a `refunds` row and `processRefund` calls the gateway. If `< 0` → an "amount due" `invoices` row of type `damage`, closed later by `applyPaymentSuccess`. |

### `return_settlement_status`
`pending_refund` → `refund_processing` → `refund_completed` · `no_refund_required` · `amount_due` → `settlement_completed`

### Deposit and refund lifecycle
- `deposit_status`: `pending` → `held` (payment succeeds) → `partially_refunded` / `refunded` / `forfeited`.
- `refund-eligibility-sweep` creates a `pending` refund for deposits past the 15-day hold (`DEPOSIT_REFUND_ELIGIBILITY_DAYS`) with no open dispute. It does **not** call the gateway — an admin must act, or `failed-refund-retry` picks up failures.
- `refund_status`: `pending` → `processing` → `success` / `failed` (with `attempt_count`).

### Damage disputes
A rider has `DAMAGE_DISPUTE_WINDOW_HOURS` (72) to dispute. `damage_status`: `recorded` → `disputed` → `resolved`. A disputed amount is held (`disputed_amount_held`) and blocks the deposit refund until resolved.

## 10. CANCELLATION

`computeCancellationCharge` applies a penalty from [cancellation.constants.ts](apps/backend/src/modules/bookings/cancellation.constants.ts) based on how close to `start_day` the cancellation is. It snapshots `plan_price_at_cancellation` and `cancellation_penalty_amount` onto the booking, then creates a refund of type `booking_cancellation`. Refund progress is tracked **both** on `refunds` and on `bookings.refund_status` / `refund_initiated_at` / `refund_completed_at` / `refund_transaction_id`.

## 11. SIDE FLOWS

| Flow | State | Notes |
|---|---|---|
| **Vendor** | 1 row, read-only | Manufacturer behind a `vehicle_model`. No UI. |
| **Vehicle model** | Seeded, read-only | Marketing catalogue. Not editable in the admin console. |
| **Subscription** | **0 rows, dead** | The original recurring-billing model; replaced by plan fields on `bookings`. FKs survive on `rentals` and `invoices`. |
| **Referrals** | 0 rows | Code generated per user; `referrals` → `referral_rewards`. **No UI on either app.** |
| **Support** | 0 rows | Rider raises a ticket, admin assigns and resolves. |
| **Incidents** | Dead | `incident_reports` was the original damage model. Never used. |
| **Notifications** | Active | `notify()` writes `notifications_log` first, then best-effort sends (Expo push / Resend email). `notification_settings` + `notification_recipients` decide which staff hear about what. The same table is the rider's in-app inbox via `read_at`. |
| **Compliance** | Active | Consent ledger, rights requests with SLA + cooling-off, PII access logging on every sensitive read, daily retention purge driven by `retention_policies`. |
| **Admin/staff** | Active | Role + per-module permission + capability, three independent layers. |

## 12. Where state actually changes

A summary worth keeping, because it is scattered:

| Mechanism | Owns |
|---|---|
| **DB triggers** | KYC status derivation, KYC gating, vehicle hold/release, vehicle status sync, referral code, append-only guards, `updated_at` |
| **SQL functions** | Vehicle allocation, weekly invoice generation, charge/discount application, anonymisation, retention purges |
| **Backend services** | Booking, cancellation math, payment application, settlement math, plan pause/resume, maintenance triage |
| **Edge Functions (cron)** | Booking expiry, plan period advance, late-fee marking, refund eligibility, retries, reminders, retention |
| **Frontends** | Nothing — display and API calls only |

Four layers can change the same row. This is the central structural finding of the audit and is expanded in `05`.
