# 08 — Idempotency design

Idempotency here is **a database property, not a UI one**. Every guarantee
below is a constraint or a lock. Button disabling exists in the app, but nothing
depends on it.

---

## The anchors

| # | Constraint | Guarantees |
|---|---|---|
| 1 | `payment_transactions.gateway_payment_id` UNIQUE | one payment is recorded once, however many callers report it |
| 2 | `payment_webhook_events.gateway_event_id` UNIQUE | one webhook event is processed once |
| 3 | `payment_orders.idempotency_key` UNIQUE (`invoice:<id>:<amount>`) | one order per invoice per price |
| 4 | `uq_payment_orders_open_per_invoice` partial UNIQUE | at most one *collectable* order per invoice, at any price |
| 5 | `uq_refunds_open_per_transaction` partial UNIQUE | at most one in-flight refund per captured payment |
| 6 | `subscriptions.booking_id` UNIQUE | one agreement per booking |
| 7 | `subscription_periods (subscription_id, sequence_number)` UNIQUE | a renewal advances once |
| 8 | `uq_subscription_periods_current` partial UNIQUE | one current period |
| 9 | `invoices.subscription_period_id` + `generate_period_invoice()` early return | one invoice per period |
| 10 | `assert_allocation_within_invoice()` — `FOR UPDATE` then sum | an invoice cannot be over-paid |
| 11 | `assert_transaction_within_order()` — `FOR UPDATE` then sum | an order cannot be over-captured |
| 12 | `assert_refund_within_payment()` — `FOR UPDATE` then sum | refunds cannot exceed the capture |
| 13 | `uq_bookings_held_vehicle_open` partial UNIQUE | two bookings cannot hold one scooter |

Numbers 10–12 take a **row lock before summing**. Without it they have a
phantom read under READ COMMITTED: two transactions each compute the sum before
the other commits, both pass, both commit. That is not theoretical here — the
webhook handler and the verify path are *designed* to run concurrently for one
payment.

---

## Scenario by scenario

### Rider double-taps Pay

Two `POST /payments/…/order` in flight.

Both read no reusable order, both attempt the insert. One wins; the other gets
`23505` — from anchor 3 or 4 — and the catch block **re-reads and returns the
winner's order**. The rider sees one checkout sheet. No error surfaces.

### Rider pays twice (two sheets, one invoice)

Anchor 4 makes the second sheet's order impossible while the first is open. If
the first was superseded (price change) and paid anyway, both captures are
recorded as transactions, but the second allocation is capped at the remaining
balance — zero — and is skipped. A `payment.unallocated_surplus` audit row is
written for a human to decide on. Nothing auto-refunds: a money movement
nobody asked for is not an improvement.

### Razorpay redelivers a webhook

Anchor 2 rejects the second insert. The handler then **re-reads the row** and
only returns early if `processed_at` is set.

This distinction is the fix for a real, expensive bug: short-circuiting on the
unique violation alone meant a dispatch that threw left the event recorded with
`processed_at` NULL, and the redelivery returned "already handled". The payment
stayed captured, the transaction row stayed written, and the allocation was
never made — permanently, with nothing retrying it.

Re-dispatching an unfinished event is safe because every downstream effect is
independently idempotent (anchors 1, 7, 10).

### Client callback and webhook race

Both call `applyPaymentSuccess()`. The first statement is the insert guarded by
anchor 1. The loser gets `23505` and returns before touching anything else.
Order of arrival has no observable consequence.

### App is killed after paying

The callback never fires. The webhook completes the payment. The rider re-opens
to a confirmed booking, read back from the database.

**This is the case that makes C1 critical**: while the webhook insert was
failing on the missing `is_signature_valid`, this rider was never confirmed and
nothing repaired it.

### Payment succeeds, client gets no response

Same as above. Additionally, `POST /payments/verify` is safe to retry: anchor 1
makes the second call a no-op.

### Network retry mid-order-creation

`ensureSubscription` (anchor 6), `generate_period_invoice` (anchor 9), the
deposit insert (`subscription_id` UNIQUE) and the order insert (anchors 3, 4)
are each individually idempotent, so a retry converges on the same rows rather
than creating a parallel set.

### Backend retries a refund

`processRefund` refuses if the refund is already `succeeded` or `processing`.
Anchor 5 stops a second concurrent approval reaching the gateway at all.

The Node SDK does **not** expose Razorpay's idempotency header on
`payments.refund` — its third parameter is a callback — so the guarantee is
ours, from anchor 5 plus the status check, and the code says so rather than
implying gateway-level protection it does not have.

### Two riders, last scooter

`allocate_vehicle_for_booking` selects `FOR UPDATE SKIP LOCKED`, so concurrent
bookings take *different* scooters rather than contending. Anchor 13 is the
backstop.

---

## What is deliberately *not* idempotent

**Order creation across a price change.** A late fee that has grown produces a
different idempotency key, and that is correct: the rider must be charged
today's amount. The stale order is superseded, not reused.

This is the H3 fix. Previously `findReusableOrder` matched on invoice alone and
returned the stale, cheaper order — silently under-charging and leaving the
invoice part-paid.

---

## What idempotency does not cover

Two *different* payments for two *different* invoices by the same rider at the
same time are independent and both proceed. That is correct: they are not
duplicates.

A rider who genuinely pays the same invoice twice through two superseded sheets
ends with a surplus that needs a human refund decision. The system detects it
(`payment.unallocated_surplus`) and refuses to guess.
