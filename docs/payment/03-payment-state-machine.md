# 03 — Payment state machine

Four lifecycles, each with exactly one owner. They are deliberately **not**
mirrors of each other: the whole point is that no two can disagree.

The generic `CREATED / PENDING / AUTHORIZED / CAPTURED / …` vocabulary from the
brief is **not** adopted verbatim, because v2 already has enums with different
and better-chosen labels, and adding parallel values would create exactly the
near-synonym problem (`succeeded` / `success` / `processed` all meaning "it
worked") that the v2 enum rewrite was done to eliminate.

---

## 1. `payment_orders.status` — the collection attempt

Enum `payment_order_status`: `created`, `attempted`, `paid`, `failed`, `expired`.

```
                 ┌──────────────────────────────────┐
                 │                                  │
   [new] ──▶ created ──▶ attempted ──▶ paid ◀───────┤ (terminal)
                 │           │          ▲           │
                 │           │          │           │
                 ├───────────┴──▶ failed ───────────┤
                 │                                  │
                 └──────────────▶ expired ──────────┘
```

| Transition | Trigger |
|---|---|
| → `created` | order inserted, Razorpay order minted |
| `created` → `attempted` | `payment.authorized` webhook, or a verify call for an uncaptured payment |
| any → `paid` | `applyPaymentSuccess()` — a succeeded `payment_transactions` row exists |
| `created`/`attempted` → `failed` | `payment.failed` webhook |
| `created`/`attempted` → `expired` | superseded by a re-price, or `expire_stale_payment_orders()` |

**`paid` is terminal**, enforced by `assert_payment_order_transition()`. Nothing
may move an order out of it.

### The two transitions that look wrong and are not

`failed → paid` and `expired → paid` are both **permitted**, deliberately.

- A rider whose first attempt on an order declines may retry the *same*
  Razorpay order and succeed.
- A rider holding a checkout sheet we superseded after a late fee accrued may
  still complete it.

In both cases the money is real and has arrived. Refusing the transition would
leave a captured payment with nowhere to land — a `payment_transactions` row
and an allocation written against an order still labelled `failed`, with the
ledger and the order disagreeing about the same payment. A surprising state
change is strictly better than a silent inconsistency in a financial record.

The over-allocation trigger is what makes it safe: the money can be recorded,
but it cannot over-pay the invoice.

`FAILED → CAPTURED` in the brief's vocabulary is therefore **allowed here on
purpose**, and this paragraph is the justification the brief asked for.

---

## 2. `payment_transactions.status` — money, append-only

Enum `payment_status`: `pending`, `processing`, `succeeded`, `failed`.

There is **no state machine**, because there are no transitions. The table is
append-only by trigger; a row is written once, at its final value.

| Value | Written by | `captured_at` |
|---|---|---|
| `succeeded` | `applyPaymentSuccess()` | NOT NULL |
| `failed` | `recordFailedAttempt()` | NULL, `failure_reason` required |
| `pending`, `processing` | nothing today | NULL |

`chk_payment_transactions_captured` enforces
`(status = 'succeeded') = (captured_at IS NOT NULL)`, so a declined attempt can
never claim a capture time.

Only `succeeded` rows may be allocated or refunded
(`assert_allocation_transaction_succeeded`, `assert_refund_matches_payment`).

---

## 3. Invoice — a document lifecycle, with paid-ness kept out of it

Enum `invoice_status`: `draft`, `issued`, `void`.

```
draft ──▶ issued ──▶ void
             │        (only while nothing is allocated)
             └──────▶ (stays `issued` forever once paid)
```

**There is no `paid` status and no `payment_status` column.** Paid-ness is
`SUM(payment_allocations.amount) >= total_amount`, served by
`v_invoice_balances.is_paid`.

That is the single most important decision in this design. A status flag can be
set when the money did not arrive, or left unset when it did; a sum over real
allocations cannot. It also makes partial payment representable at all.

`assert_invoice_void_unallocated()` refuses to void an invoice with money
against it.

---

## 4. `refunds.status` — the only record of a refund

Enum `refund_status`: `pending`, `processing`, `succeeded`, `failed`.

```
pending ──▶ processing ──▶ succeeded  (terminal)
   ▲             │
   │             └──────▶ failed ──┐
   └────────────────────────────────┘  (retry)
```

| Transition | Trigger |
|---|---|
| → `pending` | staff/system creates the refund; **no money moves** |
| `pending` → `processing` | `processRefund()` starts; attempt counted |
| `processing` → `succeeded` | Razorpay returned `status: "processed"`, **or** the `refund.processed` webhook |
| `processing` → `failed` | gateway error, or the `refund.failed` webhook |
| `failed` → `processing` | `POST /refunds/:id/retry` |

A Razorpay refund commonly returns `pending` rather than `processed`. That maps
to **our** `processing`, not `succeeded` — the deposit is not released until the
webhook confirms the payout. Marking it succeeded on submission is the same
mistake the deleted mock branch made, just with a real id attached.

`uq_refunds_open_per_transaction` permits at most one `pending`-or-`processing`
refund per captured payment, so two concurrent approvals cannot both proceed.

No other table mirrors this status. `deposits.status` describes only whether we
still hold the money (`pending` / `held` / `released` / `forfeited`) and is
never a copy of refund progress.

---

## 5. Booking, and how it couples to payment

Enum `booking_status`: `pending_payment`, `confirmed`, `cancelled`, `expired`,
`fulfilled`.

The only payment-driven transition is:

```
pending_payment ──▶ confirmed
```

and its precondition is **`v_invoice_balances.is_paid === true`**, not "a
payment arrived". This is the H2 fix. A capture smaller than the invoice total
leaves the booking `pending_payment`, writes a `payment.partial` audit row, and
sends no success notification.

Guarded by `.eq("status", "pending_payment")` on the update, so a second
delivery matches nothing rather than re-running the effects.

### The states that cannot exist

| Impossible state | What prevents it |
|---|---|
| payment succeeded, booking unpaid | `applyPaymentSuccess` writes the allocation and confirms in the same call; a failure mid-way leaves `processed_at` null and Razorpay redelivers |
| booking confirmed, payment failed | confirmation requires `is_paid`, which requires allocations, which require a `succeeded` transaction |
| invoice over-paid | `assert_allocation_within_invoice()` — `FOR UPDATE` then sum |
| refunded more than captured | `assert_refund_within_payment()` — same lock pattern |
| deposit held with no money | `deposits → held` happens only inside the `is_paid` branch |
| two riders holding one scooter | `uq_bookings_held_vehicle_open` |
| two open orders for one invoice | `uq_payment_orders_open_per_invoice` |

---

## Timeouts and abandonment

| Clock | Column | Swept by |
|---|---|---|
| Vehicle hold | `bookings.hold_expires_at` | `booking-payment-expiry-sweep` → `expired` |
| Checkout session | `payment_orders.expires_at` (TTL = `PAYMENT_ORDER_TTL_MINUTES`, defaulting to the hold) | `expire_stale_payment_orders()` |

The order TTL defaults to the vehicle-hold grace period because an order
outliving its hold would send a rider to Checkout for a scooter already given
away.

`expire_stale_payment_orders()` **never** expires an order with a succeeded
transaction against it, so a capture landing mid-sweep is safe.

A `payment.authorized` webhook extends the order's expiry, so a rider who is
genuinely mid-payment does not have the session closed underneath them.
