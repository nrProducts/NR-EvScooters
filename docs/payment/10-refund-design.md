# 10 — Refund design

## Principles

1. **`refunds` is the single source of truth.** No table mirrors its status.
2. **A refund names the payment it reverses.** `payment_transaction_id` is NOT
   NULL, so "can we refund this?" is always answerable.
3. **Only the backend contacts the gateway.** The mobile app has no refund
   endpoint of any kind.
4. **Approval is a distinct permission from viewing.**
5. **Nothing is marked refunded until Razorpay says the money moved.**

---

## Reasons

`refund_reason`: `deposit_release`, `booking_cancellation`, `settlement`,
`goodwill`.

| Reason | Origin | Approval |
|---|---|---|
| `deposit_release` | deposit eligible after return | staff, `refunds.approve` |
| `booking_cancellation` | rider cancels a paid booking | staff, `refunds.approve` |
| `settlement` | end-of-rental `refund_due` | staff, `returns.approve` then `refunds.approve` |
| `goodwill` | `POST /invoices/:id/refund` | staff, `payments.refund` |

A cancellation refund is created `pending` with **no automatic follow-up**.
`POST /refunds/:id/retry` is both the approval step and the retry.

---

## Lifecycle

```
create (pending)  ── no money moves ──
        │
   staff approves → processRefund()
        │
        ├─ refuse if already succeeded / processing
        ├─ read the source payment off the refund itself
        ├─ status → processing, attempt_count += 1
        ├─ razorpay.payments.refund(paymentId, { amount, notes })
        │
        ├─ gateway returned "processed" → succeeded, completed_at set
        └─ anything else                → processing, await refund.processed
```

Razorpay commonly returns `pending` for an instant refund. That maps to **our
`processing`, not `succeeded`.** The deposit is released only on confirmation.
Marking it succeeded on submission is the same mistake the deleted mock branch
made, just with a real id attached.

---

## The four ceilings

| Guard | Where | Prevents |
|---|---|---|
| `assert_refund_within_payment()` — `FOR UPDATE` then sum non-failed refunds | DB trigger | total refunds exceeding the capture |
| `uq_refunds_open_per_transaction` partial UNIQUE | DB index | two concurrent approvals both reaching the gateway |
| `assert_refund_matches_payment()` | DB trigger | refunding a `failed` transaction, or paying the wrong person |
| status check at the top of `processRefund` | service | a sequential double-approval |

The lock in the first is essential: without it, two transactions each compute
the refunded total before the other commits, both pass the ceiling, and both
commit — a double payout that no amount of application-level checking catches.

### `assert_refund_matches_payment()` closes a real hole

`refunds.user_id` was previously free to name **anyone**. A bug or a crafted
call could have sent a rider's refund to a different user's Razorpay payment
trail. The trigger now requires `refunds.user_id` to equal the payer of the
named transaction, and requires that transaction to be `succeeded`.

That second condition became necessary in the same migration that made it
possible: recording declined attempts means `payment_transactions` now holds
rows that must never be refunded.

---

## Deposit release

`releaseDepositIfFullyRefunded()` moves a deposit to `released` only when the
refunded amount covers the full refundable balance.

There is no `partially_refunded` status, deliberately: a partly refunded
deposit genuinely still holds a balance, so it stays `held`. The old enum
carried that value and it mirrored `refunds.status` as an async sweep changed
it — two records of one fact, guaranteed to drift.

---

## Refund vs. settlement

`rental_settlements` is a **snapshot** with its arithmetic enforced by CHECK
constraints:

```sql
check (total_charges_amount = late_fee_amount + damage_amount + other_charges_amount)
check (net_amount = deposit_amount_snapshot - total_charges_amount)
check ((outcome = 'refund_due' and net_amount > 0) or …)
```

`refund_id` and `invoice_id` may each transition **once** from NULL, so the
settlement can be linked to what it produced without the money columns ever
becoming mutable. `trg_freeze_settlement_decision` enforces both halves.

- `refund_due` → a `refunds` row
- `amount_due` → an invoice the rider pays
- `balanced` → neither

---

## Staff and Admin

| Action | Permission | Effect |
|---|---|---|
| See the refunds queue | `refunds.view` | read only |
| Create a refund | `refunds.approve` | writes a `pending` row |
| Approve / retry a payout | `refunds.approve` | **contacts Razorpay** |
| Refund a settled invoice | `payments.refund` | writes a `goodwill` refund |
| See raw gateway payloads | `is_admin()` | `payment_webhook_events` |

The view/approve split was previously theatre: the router was gated on
`requireModule("refunds")`, which passes for *any* refunds permission, so
`refunds.view` alone authorised moving money. What kept staff out was that
nobody had granted the permission — a convention, not a control. The per-route
`requireAction` split is the actual gate, and it is what makes the two
permission rows meaningful.

Riders have **no** refund endpoint. A rider cancelling a booking creates a
cancellation record; the refund is created and approved server-side.

---

## What staff and admin never see

Card numbers, CVV, UPI PINs, bank credentials, `RAZORPAY_KEY_SECRET`,
`RAZORPAY_WEBHOOK_SECRET`.

`payment_transactions.raw_payload` holds Razorpay's own payment entity, which
carries at most the card network and last four digits. It is admin-reachable
only through the payment detail path, and `payment_webhook_events` — the fuller
payload — is `is_admin()`.

---

## Known gap

**Refund reconciliation is one-directional.** The Reconciliation report diffs
`payment_transactions` against Razorpay's payments list. It does **not** diff
`refunds` against Razorpay's refunds list, so a refund processed at the gateway
whose `refund.processed` webhook was never delivered stays `processing`
indefinitely with nothing detecting it.

`idx_refunds_retry` exists for a retry sweep over
`status in ('pending','failed')` — which does not cover `processing`.

Not a money-loss risk (the rider was paid; our record lags), and not a
correctness risk (the ceiling still holds). It is an operational blind spot,
and it is listed as an open item in
[12](12-production-checklist.md) rather than quietly omitted.
