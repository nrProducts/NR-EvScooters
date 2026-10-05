# 11 — Test plan

## Result

```
Test Files  38 passed (38)
     Tests  488 passed (488)
```

**62 of those are payment tests, all new.** Before this work there were zero:
`tests/payments.test.ts` contained only `addDays` date assertions.

Those date tests were **kept**, not deleted — they were correct and useful,
just living in a file whose name lied about them. `git mv` moved them to
`tests/dates.test.ts`, which is where a reader looking for date behaviour would
have gone in the first place.

| File | Tests | Covers |
|---|---|---|
| `tests/payments.webhook.test.ts` | 23 | signature, event identity, idempotency, dispatch, settlement gating, currency |
| `tests/payments.verify.test.ts` | 19 | signature, IDOR, capture-vs-authorize, amount and order binding |
| `tests/payments.orders.test.ts` | 20 | amount authority, IDOR, idempotency, paise conversion, method mapping |
| `tests/helpers/fakeSupabase.ts` | — | chainable PostgREST stub |
| `tests/dates.test.ts` | 5 | preserved from the old `payments.test.ts` |

Run: `cd apps/backend && pnpm test`

---

## Approach

Tests drive the **real service functions** — `handleWebhook`, `verifyPayment`,
`createOrderForInvoice` — with Supabase and Razorpay faked at the module
boundary. That was chosen over extracting pure helpers because the defects
being guarded against (C1's missing column, H4's random event id, H2's
premature confirmation) all live in the *control flow*, not in a computation.
A pure-function test would not have caught any of them.

`tests/helpers/fakeSupabase.ts` records each fluent chain as
`{ table, op, payload, filters, single }` and hands it to a per-test handler.
Assertions are about behaviour — "did it insert a webhook event with
`is_signature_valid` false?" — rather than call ordering, so a refactor that
adds a column does not break every test.

---

## Coverage against the brief

### Success

| Case | Test |
|---|---|
| UPI payment success | `records the GATEWAY's amount and method` (method `upi`) |
| Card payment success | same, with `method: "card"` |
| Capture via webhook | `treats order.paid as a capture`, plus the settlement-gating suite |

### Failure

| Case | Test |
|---|---|
| Payment declined | `records a declined attempt and reports the gateway's reason` |
| Declined via webhook | `records a declined attempt on payment.failed` |
| Payment cancelled | mobile `PaymentCancelledError` (Razorpay code 2) — not backend-testable |
| Payment timeout / abandoned | `ignores an expired open order even at the right amount` + `expire_stale_payment_orders()` |
| Invalid signature | 5 tests across webhook and verify |
| Invalid order | `returns 404 rather than 403 for an unknown order`, `ignores a capture for an order we have never issued` |
| Invalid amount | `rejects an under-captured amount`, `rejects an over-captured amount` |

### Security

| Case | Test |
|---|---|
| Tampered amount | `rejects an under-/over-captured amount` — compared against `payments.fetch`, in paise |
| Tampered webhook body | `rejects a tampered body whose signature was valid for the ORIGINAL bytes` |
| Another user's booking/invoice | `refuses another rider's invoice, as a 404` + `does not reach the gateway` |
| Another user's payment | `refuses another rider's payment order, as a 404` + `does not record anything` |
| Forged payment id | `rejects a signature that was valid for a DIFFERENT payment id` |
| Forged signature | `rejects a forged signature`, `rejects a signature minted with a different secret` |
| Forged webhook | `never dispatches a forged event to the payment path`, `PERSISTS the forgery attempt` |
| Replayed webhook | `is a no-op when the same event was already processed` |
| Replayed payment across orders | `rejects a payment belonging to a different Razorpay order` |
| Duplicate payment request | `re-reads rather than erroring when a concurrent tap won the insert` |
| Duplicate refund | DB: `uq_refunds_open_per_transaction` + `assert_refund_within_payment` |
| Secret exposure | `never leaks the key secret to the client` |

### Reliability

| Case | Test |
|---|---|
| App closes during payment | `marks the event processed only after dispatch succeeds` — webhook completes it |
| Network disconnect | `is a no-op when the transaction already exists` |
| Backend retry | `REPROCESSES an event whose earlier dispatch never finished` |
| Webhook before client callback | both funnel through `applyPaymentSuccess`; second is a no-op |
| Client callback before webhook | same, asserted from both directions |
| Duplicate webhook | `does not double-apply when the transaction already exists` |
| Paid but no response reaches the app | `leaves processed_at null when dispatch throws, so Razorpay redelivers` |

### Concurrency

| Case | Covered by |
|---|---|
| Double-tap Pay | `re-reads rather than erroring when a concurrent tap won the insert` (23505 path) |
| Simultaneous payment requests | `gateway_payment_id` UNIQUE — `does not double-apply` |
| Simultaneous booking attempts | `allocate_vehicle_for_booking` `FOR UPDATE SKIP LOCKED` + `uq_bookings_held_vehicle_open` |

---

## <a name="live-database-guard-verification"></a>Live database guard verification

Run 2026-08-22 against `cndqvdskrcmivqflbttl` after applying migration 47, as a
single `DO` block that ends in a deliberate `RAISE` so **every write is rolled
back**. Row counts before and after were identical (all payment tables at 0).

**17/17 passed:**

```
PASS  1 IDOR blocked: Payment order user 8f370046… does not own invoice
PASS  2 currency mismatch blocked
PASS  3 valid order created
PASS  4 second open order blocked
PASS  5 expire_stale_payment_orders() expired 1
PASS  6 over-capture blocked
PASS  7 failed row requires a reason
PASS  8 failed row cannot claim capture time
PASS  9 declined attempt recorded
PASS 10 failed txn cannot be allocated
PASS 11 failed txn cannot be refunded
PASS 12 capture recorded, order paid
PASS 13 paid is terminal
PASS 14 refund must go to the payer
PASS 15 over-refund blocked
PASS 16 one in-flight refund per payment
PASS 17 over-allocation blocked
```

This moves the database guards from "asserted by reading" to "observed
rejecting the thing they exist to reject".

---

## <a name="live-gateway-smoke-test"></a>Live gateway smoke test

Run 2026-08-22 against Razorpay **test mode** (`rzp_test_TSn26xE6E1LLwU`),
through the same SDK the application uses. Nothing was written to our database.

| | Check | Result |
|---|---|---|
| 1 | order created via `orders.create` | `order_TSn4GjoAq9v2l9` |
| 2 | amount echoed in paise | `92410 INR` — conversion confirmed against a real gateway |
| 3 | order status | `created` |
| 4 | `partial_payment` echoed | **not returned by the API at all** — see below |
| 5 | `orders.fetch` round-trip | id matches |
| 6 | genuine checkout signature | accepted |
| 7 | forged checkout signature | rejected |
| 8 | genuine webhook signature | accepted |
| 9 | tampered webhook body, original signature | rejected |
| 10 | sub-minimum amount (50 paise) | rejected by the gateway |

**Finding on 4.** The Orders API does not return `partial_payment` — not when
unset, and not when explicitly sent as `true` (both probed; only `amount_paid`
and `amount_due` come back). The documented default is false, but it is **not
observable**, so no code can assert it. This is why gating confirmation on
`v_invoice_balances.is_paid` (the H2 fix) matters more than it first appeared:
the alternative rested on an unverifiable gateway default.

This closes the credential, order-creation, amount-conversion and signature
halves of H-B. What it does not cover is a real *payment* — no card or UPI
handle has been put through Checkout, so capture, `payments.fetch` status
transitions and webhook delivery remain unexercised.

---

## Honest limits

**The 62 vitest cases are unit tests with a faked database.** They prove the
service's control flow and its interaction contract. The live run above covers
the database guards. What neither covers:

- **Concurrency.** All 17 live assertions ran **sequentially in one session**.
  The `FOR UPDATE` locks in `assert_allocation_within_invoice`,
  `assert_transaction_within_order` and `assert_refund_within_payment` exist to
  defeat a phantom read between two *simultaneous* transactions, and a
  single-session test cannot produce one. Tests 15 and 17 show the ceilings
  hold sequentially — necessary, not sufficient. **The concurrent case remains
  argued, not demonstrated.**
- **Razorpay itself.** `payments.fetch` and `orders.create` are stubbed. **No
  test in this repo has ever contacted the gateway**, in test mode or
  otherwise. Payload shapes are assumed from documentation.

Closing these needs two concurrent sessions per lock path (`pg_sleep` inside an
open transaction while a second attempts the same write) and a Razorpay
test-mode E2E pass. Both are listed in [12](12-production-checklist.md) as
**prerequisites to going live**, not as nice-to-haves.

---

## Why the E2E pass cannot be automated from this repo

There is no browser automation and no device automation here — no Playwright,
Puppeteer, Cypress or Detox — and the rider payment surface is a **native**
React Native screen using `react-native-razorpay`. Razorpay Checkout is a
native modal on a device.

A capture therefore cannot be produced from a shell. It also cannot honestly be
*simulated* against the live database: `payment_transactions` and
`payment_allocations` are append-only by trigger, so a fabricated capture could
never be removed — it would permanently record money that never arrived, which
is precisely the C2 failure this work existed to eliminate.

If a fully automated pass is wanted, run it against a **throwaway Supabase
branch**, never the shared project.

### Prerequisites

```bash
# 1. Test-mode keys — already in apps/backend/.env
RAZORPAY_KEY_ID=rzp_test_…
RAZORPAY_KEY_SECRET=…
RAZORPAY_WEBHOOK_SECRET=…      # must match the dashboard

# 2. Razorpay cannot deliver a webhook to localhost. Expose the backend:
cloudflared tunnel --url http://localhost:4000
#   then set the dashboard webhook URL to
#   https://<tunnel-host>/api/v1/payments/webhook
#   with the six events from docs/payment/RAZORPAY-SETUP.md §8

# 3. A native build — an OTA JS update cannot add a native module
cd apps/mobile && npx expo run:android
```

### Razorpay test instruments

| | Value |
|---|---|
| Card | `4100 2800 0000 1007`, CVV `123`, expiry `12/26` |
| UPI success | `success@razorpay` |
| UPI failure | `failure@razorpay` |

## Manual E2E script (test mode) — NOT YET RUN

1. Rider books → `POST /payments/bookings/:id/order` → Checkout opens.
2. Pay with UPI success VPA → booking `confirmed`, deposit `held`,
   `v_invoice_balances.is_paid` true.
3. Repeat with a test card.
4. Pay with a failure VPA → `payment_transactions` row `status = 'failed'` with
   `failure_reason`, booking still `pending_payment`.
5. Kill the app immediately after paying → webhook alone confirms the booking.
6. Replay a captured webhook from the Razorpay dashboard → no second
   transaction, no second allocation.
7. Send a webhook with a wrong signature → 400, and a row appears in the
   Reconciliation page's invalid-signature list.
8. Staff issues a deposit refund → `processing` until `refund.processed`, then
   `succeeded` and the deposit `released`.
9. Attempt `POST /refunds/:id/retry` as a `refunds.view`-only staff account →
   403.
10. Run the Reconciliation report over the window → zero unmatched either way.
