# 9 — Financial consistency

## 9.1 The money chain, and where each fact lives

| Fact | Single source of truth | Enforced by |
|---|---|---|
| List price of a plan | `plans.price_amount` | — |
| Price the rider agreed to | `bookings.plan_price_snapshot` → `subscriptions.plan_price_snapshot` | `trg_freeze_snapshots` — any column ending `_snapshot` raises on UPDATE |
| Deposit agreed | `bookings.deposit_amount_snapshot` → `deposits.amount` | same trigger |
| Period base amount | `subscription_periods.base_amount_snapshot` | same trigger |
| What is billed | `invoices.total_amount` + `invoice_items` | — |
| Invoice number | `invoices.invoice_number` | `trg_allocate_invoice_number` + `invoice_series.last_number` — gap-free, sequence deliberately avoided so a rollback burns no number |
| Money asked for | `payment_orders.amount`, one order per invoice (`invoice_id` NOT NULL) | — |
| Money received | `payment_transactions.amount` | `gateway_payment_id` UNIQUE |
| **Whether an invoice is paid** | **derived** — `v_invoice_balances.is_paid` | no stored `payment_status` column exists |
| Money applied to a bill | `payment_allocations.amount` | `assert_allocation_within_invoice` (`FOR UPDATE` then sum) |
| Money returned | `refunds.amount` | `assert_refund_within_payment` (`FOR UPDATE` then sum, excluding `failed`) |
| Charges / discounts | `pricing_rules` → `subscription_adjustments` (signed) | one signed path; `SUM` is the net |
| Return settlement | `rental_settlements`, one row per rental | four CHECK constraints, verified live |

**No duplicated amounts and no mirror flags were found.** This is the strongest part of the whole
refactor and it is worth being specific about why:

- **Paid-ness is derived, not stored.** `invoices.payment_status` does not exist. There is nothing
  to fall out of step with the money.
- **The current vehicle is derived**, from the open `rental_vehicle_assignments` row, exposed as
  `v_rental_current_vehicle`. The old schema had three tables holding three answers.
- **Refund progress lives only in `refunds`.** No mirrored status on `deposits` or `bookings`.
- **`rental_settlements` proves its own arithmetic** — verified live on the new project:

  | Constraint | Definition |
  |---|---|
  | `chk_rental_settlements_total` | `total_charges_amount = late_fee_amount + damage_amount + other_charges_amount` |
  | `chk_rental_settlements_net` | `net_amount = deposit_amount_snapshot - total_charges_amount` |
  | `chk_rental_settlements_outcome` | `refund_due ⇔ net > 0`, `amount_due ⇔ net < 0`, `balanced ⇔ net = 0` |
  | `chk_rental_settlements_refund_link` / `_invoice_link` | `refund_id` only when `refund_due`; `invoice_id` only when `amount_due` |

  A settlement that does not add up cannot be inserted. The old `return_settlements` had four
  computed money columns and zero checks.

- **The settlement row is written in one place** (`completeRide`), not in the return flow, so a
  plain ride completion and a full damage review produce the same shape by construction rather than
  by inspection (`returns.service.ts:17-30`).

## 9.2 Duplicate-payment handling — PASS

Three independent idempotency layers, all real:

1. `payment_webhook_events.gateway_event_id` UNIQUE → a redelivered webhook short-circuits at
   `23505` before any business logic runs.
2. `payment_transactions.gateway_payment_id` UNIQUE → `applyPaymentSuccess` returns on `23505`, so
   the webhook path and the client-verify path racing over the same payment apply once.
3. `assert_allocation_within_invoice` takes `FOR UPDATE` on the invoice row **before** summing
   allocations, so two concurrent transactions cannot both pass the check. The comment at
   `functions.sql:109-115` is right that this is not theoretical — the webhook and verify paths are
   *designed* to run concurrently for one payment.

The same pattern is used correctly for renewals: `subscription_periods (subscription_id,
sequence_number)` UNIQUE makes a duplicate delivery a no-op.

## 9.3 Findings

### H3 — Allocation is capped at the invoice **total**, not the remaining **balance**

- **File:** `apps/backend/src/modules/payments/payments.service.ts:630-640`
- **Code:**

  ```ts
  const allocated = Math.min(input.amount, Number(invoice?.total_amount ?? input.amount));
  ```

- **Current behaviour:** consider a partially-paid invoice. `total_amount = 1000`, already allocated
  `500`, so `v_invoice_balances.balance_amount = 500`. A period renewal is late, so
  `createOrderForInvoiceInternal` correctly asks for `balance + lateFee = 600`. The rider pays 600.
  `applyPaymentSuccess` then computes `min(600, 1000) = 600` and inserts a 600 allocation — bringing
  total allocations to **1100 against a 1000 invoice**. `assert_allocation_within_invoice` raises
  `check_violation`.
- **What happens next is the real problem.** The `payment_webhook_events` row was inserted and
  committed *before* dispatch. The thrown error propagates out of `handleWebhook`, so:
  - `processed_at` is never set (good — the failure is detectable);
  - the webhook returns non-2xx and Razorpay redelivers;
  - on redelivery the `gateway_event_id` UNIQUE hits `23505` and `handleWebhook` **returns early**,
    treating it as already seen.

  Net result: **the money is captured, `payment_transactions` has the row, and the allocation is
  permanently missing.** The invoice reads unpaid forever and nothing retries.
- **Expected:** `const allocated = Math.min(input.amount, Number(balance.balance_amount))`, reading
  `v_invoice_balances` rather than `invoices.total_amount` — the same source the order amount was
  computed from.
- **Why it is wrong:** it uses a different denominator on the way in than on the way out. The order
  is sized from the balance; the allocation is capped by the total. Those agree only when nothing
  has been allocated yet.
- **Fix:** cap by remaining balance. Separately, make the redelivery path safe: only short-circuit
  on `23505` when the existing row has `processed_at IS NOT NULL`, otherwise re-dispatch. And add a
  reconciliation check for `payment_webhook_events where processed_at is null`.

### H4 — No transactional atomicity anywhere in the backend

- **Files:** structural — e.g. `bookings.service.ts:1416-1470` (`confirmPickup`),
  `payments.service.ts:591-673` (`applyPaymentSuccess`), `returns.service.ts:300-372`.
- **Current:** every multi-row business operation is a *sequence of independent PostgREST calls*.
  There is no `BEGIN`/`COMMIT`. The code compensates by hand — `confirmPickup` writes the booking,
  inserts the rental, inserts the assignment, and on failure at step 3 deletes the rental and
  restores the booking.
- **Why it is wrong:** the compensating writes are themselves un-transacted and can fail. If the
  process dies between the `rentals` insert and the `rental_vehicle_assignments` insert,
  `confirmPickup` leaves an **active rental with no vehicle attached** — which the code's own
  comment (`vehicles.service.ts:765-767`) calls out as worse than no rental at all, because
  `recompute_vehicle_status` leaves the scooter `available` while the rider believes they have it.
  The same shape appears in `applyPaymentSuccess` (transaction → order status → allocation →
  subscription effects, four separate round trips) and in the settlement flow.
- **Fix:** the operations that must be atomic are few and identifiable — `confirmPickup`,
  `applyPaymentSuccess`, `assignVehicleToUser`, `approveReturnSettlement`. Move each into a single
  `plpgsql` function called by `.rpc()`, in the same style as the operational functions migration 29
  already established. This also fixes **C8** for free, since the whole sequence would then hold its
  locks.

### M3 — The rental due-back instant is 5½ hours late

- **File:** `apps/backend/src/modules/bookings/bookings.service.ts:1407`
- **Code:** ``const dueBackAt = `${context.nextDueAt}T23:59:59Z`;``
- **Current:** `nextDueAt` is a `date` — an **IST calendar day**, per `business_today()`. Appending
  `T23:59:59Z` makes it 23:59:59 **UTC**, which is 05:29:59 IST the *following* morning.
- **Expected:** `T23:59:59+05:30`, or the corresponding `18:29:59Z`.
- **Why it is wrong:** `rentals.due_back_at` drives `computeLateReturnPenalty` and
  `effectiveDueAt`. Every rental gets 5½ free hours, and a return between midnight and 05:30 IST on
  the day *after* the due date is scored as on-time. Same root cause as **H2**.

## 9.4 What was checked and found clean

- No duplicated amount columns; no denormalised money mirrors.
- Historical values are correct: price, duration and deposit are snapshotted onto the booking at
  creation and frozen by trigger, so a later price change cannot rewrite an agreed contract.
- Payment status values match the live `payment_status` / `refund_status` enums
  (`pending, processing, succeeded, failed`).
- Refund over-refund protection is real and locks before summing; `failed` refunds are correctly
  excluded from the sum.
- Deposit lifecycle CHECKs are complete (`held ⇒ held_at`, `released ⇒ released_at`,
  `forfeited ⇒ forfeited_at AND forfeit_reason`).
- A voided invoice with allocations is blocked by `assert_invoice_void_unallocated`.
- Refund gateway failures during settlement are caught and the settlement still stands, with the
  refund left `pending` and retryable — the right trade (`returns.service.ts:313-322`).

## 9.5 Open, and correctly flagged by the team already

`supabase/v2/README.md` lists **GST invoicing** as an open decision: `invoices` has no tax column,
no per-line tax, no HSN/SAC and no seller GSTIN. `invoice_series` gives gap-free numbering, which is
the hard half. This is a scoped piece of work, not a defect, and it is out of scope for this audit —
but it is a launch blocker for an Indian rental business and belongs on the same list as everything
in [FINAL-REPORT.md](FINAL-REPORT.md).
