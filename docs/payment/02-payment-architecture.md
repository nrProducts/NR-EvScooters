# 02 — Payment architecture

## The one rule

**The backend decides what is owed and whether it was paid. The client reports
and displays; it never determines.**

Everything below is a consequence of that sentence.

---

## Why an order needs an invoice first

The v2 constraint chain is:

```
payment_orders.invoice_id   NOT NULL
invoices.subscription_id    NOT NULL
subscriptions.booking_id    NOT NULL UNIQUE
```

To take money you need an order; an order names an invoice; an invoice belongs
to a subscription. So the commercial agreement — subscription, deposit,
period #1, opening invoice — is created **when checkout starts**, and capture
is what **confirms** it.

That is a deliberate deviation from "the subscription is created on payment
capture", and the constraint chain is what forces it. The cost is that an
abandoned checkout leaves an `active` subscription with an unpaid invoice
behind, because `subscription_status` has no `pending` value.
`booking-payment-expiry-sweep` is what cleans those up, and it checks
`payment_allocations` — real money — rather than an order status.

The alternative, making `invoice_id` nullable, was rejected: it would restore
exactly the ambiguity the v2 schema removed, where an order could be claimed
to have settled any number of invoices.

---

## The flow

```
RIDER                    BACKEND                      RAZORPAY            DB
  │
  │ POST /payments/bookings/:id/order
  ├──────────────────────────▶
  │                    ┌─ verify booking.user_id == caller  (404 if not)
  │                    ├─ ensureSubscription()      ────────────────────▶ subscriptions
  │                    │                                                  subscription_periods
  │                    │                                                  deposits (pending)
  │                    ├─ ensureInitialInvoice()
  │                    │    └─ rpc generate_period_invoice() ───────────▶ invoices + items
  │                    │       (+ deposit line)                           subscription_adjustments
  │                    ├─ amount = v_invoice_balances.balance
  │                    │           + computeLateRenewalFee()
  │                    │           ── NEVER from the client ──
  │                    ├─ supersede open orders at a different amount ──▶ payment_orders (expired)
  │                    ├─ orders.create(paise) ─────▶
  │                    │                        ◀──── order_XXX
  │                    └─ insert ───────────────────────────────────────▶ payment_orders (created)
  │ { orderId, gatewayOrderId, amount, currency, keyId, expiresAt }
  ◀──────────────────────────┤
  │
  │ RazorpayCheckout.open({ key: keyId, order_id, amount })
  ├───────────────────────────────────────────────▶ UPI / card
  │                                            ◀─── { payment_id, order_id, signature }
  │
  │ POST /payments/verify          ┌──────── AND, INDEPENDENTLY ────────┐
  ├──────────────────────────▶     │  POST /payments/webhook            │
  │              ┌─ HMAC check     │      ◀─────────────────────────────┤ Razorpay
  │              ├─ fetch payment ─┼─▶    ┌─ HMAC over RAW body         │
  │              │   ◀─────────────┼──    ├─ record event (valid t/f)   │
  │              ├─ captured?      │      ├─ dedupe on event id         │
  │              ├─ order matches? │      └─ dispatch                   │
  │              ├─ amount matches?│                                    │
  │              └────────┬────────┴────────────────┬───────────────────┘
  │                       ▼                         ▼
  │                  applyPaymentSuccess()  ── the single idempotent core ──
  │                       ├─ insert payment_transactions (UNIQUE gateway_payment_id)
  │                       ├─ payment_orders -> paid
  │                       ├─ insert payment_allocations (capped at balance)
  │                       ├─ IF v_invoice_balances.is_paid:
  │                       │     booking -> confirmed, deposit -> held
  │                       └─ ELSE: audit `payment.partial`, advance nothing
  │
  │ GET /bookings/me  (authoritative status, read back from the DB)
  ◀──────────────────────────┤
```

### Two writers, one core

The client callback and the webhook are **designed to race**. Either may arrive
first; both may arrive; one may never arrive. That is not an edge case to be
avoided, it is the normal operating condition, and the design accommodates it
rather than trying to serialise it:

- Both funnel into `applyPaymentSuccess()`.
- Its first act is an insert whose `gateway_payment_id` is UNIQUE. The loser
  gets `23505` and returns.
- Every downstream effect is separately guarded (`.eq("status", …)` on the
  booking update, a unique index on `(subscription_id, sequence_number)` for
  the next period, the allocation's own over-allocation trigger).

So "which one won" has no observable consequence.

### Why the client callback exists at all

It is a **latency optimisation, not an authority**. The webhook can take
seconds; a rider staring at a spinner needs an answer sooner. Since the
callback performs the full verification — signature, then a live
`payments.fetch` for status, order binding, amount and currency — it reaches
the same conclusion the webhook would, just earlier.

If it were removed entirely, the system would still be correct. If the webhook
were removed, it would not be.

---

## Trust boundaries

| Actor | Reaches | Controls | Never sees |
|---|---|---|---|
| Rider app | Backend REST only | A booking/invoice **UUID** | `KEY_SECRET`, `WEBHOOK_SECRET`, any other rider's data |
| Razorpay | `POST /payments/webhook`, unauthenticated | Nothing until the HMAC passes | — |
| Backend | Postgres as `service_role` (bypasses RLS) | Everything; middleware is the control | — |
| Staff console | Backend REST + realtime on 4 tables | Per-`module.action` permissions | `KEY_SECRET`, `WEBHOOK_SECRET`, `payment_webhook_events` |
| Admin console | As staff, plus admin-only reads | All permissions unconditionally | `KEY_SECRET`, `WEBHOOK_SECRET` |

The rider app never touches Postgres directly. The consoles do, for realtime on
`bookings`, `vehicles`, `payment_allocations` and `notification_messages` —
and for those four, **RLS is the only control**, which is why the publication
membership is asserted in a migration rather than clicked in a dashboard.

---

## What is authoritative for what

| Question | Answered by | Never by |
|---|---|---|
| What is owed? | `v_invoice_balances.balance_amount` + `computeLateRenewalFee()` | any client field |
| Was it paid? | `v_invoice_balances.is_paid`, derived from `payment_allocations` | a `payment_status` column (there isn't one) |
| Did the money arrive? | `payments.fetch().status === "captured"` | the checkout signature |
| Which scooter? | the open `rental_vehicle_assignments` row | `bookings.held_vehicle_id` after pickup |
| How much can be refunded? | `payment_transactions.amount` minus non-failed `refunds` | a stored "refundable" figure |

Each of these has exactly one source. The v2 schema's central discipline is
that no fact is mirrored, and the payment work does not introduce a mirror.
