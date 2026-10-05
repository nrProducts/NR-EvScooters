# 01 — Current payment audit

**Scope:** `supabase/v2`, `apps/backend`, `apps/mobile`, `apps/web`
**Date:** 2026-08-22 · **Branch:** `db-architecture-refactor`
**Status:** Phase 1–2 complete (audit + problem statement). No code changed.

---

## Headline

A Razorpay integration already exists and is **structurally sound**. The v2
schema models payments correctly and does not need a new payment schema.

It is **not production-ready**. Two defects are fatal:

1. **The webhook cannot execute.** `payment_webhook_events.is_signature_valid`
   is `NOT NULL` with no default; the insert omits it and is cast `as never`,
   so TypeScript never caught it. Every webhook delivery throws `23502`.
2. **A "mock mode" grants free rentals.** With `RAZORPAY_KEY_ID`/`SECRET`
   unset or blank, order creation calls `applyPaymentSuccess()` directly —
   booking `confirmed`, deposit `held`, allocation written, no money taken.

Neither is a design flaw. Both are one-line-shaped fixes to otherwise
well-built code. The work is repair and hardening, not a rewrite.

---

## What exists

### Database — `supabase/v2` (46 migrations)

Payment tables live in `20260819101400_billing_payments.sql` and
`…101500_billing_deposits_refunds.sql`. The separation the brief asks for is
already present and correct:

| Concept | Table | Notes |
|---|---|---|
| Payment order / intent | `payment_orders` | `invoice_id` NOT NULL — one order pays exactly one invoice. `idempotency_key` UNIQUE. `gateway_order_id` UNIQUE. |
| Payment transaction | `payment_transactions` | Append-only by trigger. `gateway_payment_id` UNIQUE — the system-wide idempotency anchor. |
| Allocation | `payment_allocations` | Append-only. Captured money applied to an invoice; supports partial payment. |
| Invoice / items | `invoices`, `invoice_items` | Gap-free numbering via `invoice_series` + row-locked trigger. Signed line amounts. |
| Refund | `refunds` | Single source of truth. `payment_transaction_id` NOT NULL. |
| Webhook event | `payment_webhook_events` | `gateway_event_id` UNIQUE. Verbatim payload. |
| Deposit | `deposits` | One per subscription. |
| Settlement | `rental_settlements` | Arithmetic enforced by CHECK constraints. |

**There is deliberately no `payment_attempt` table and no
`invoices.payment_status`.** Paid-ness is derived by `v_invoice_balances` from
real allocations. That is the right call and must not be undone.

Guards already in place:

- `assert_allocation_within_invoice()` — `SELECT … FOR UPDATE` on the invoice
  before summing, so two concurrent webhooks cannot both over-allocate.
- `assert_refund_within_payment()` — same lock pattern; total refunds cannot
  exceed the captured amount.
- `trg_append_only` on `payment_transactions` and `payment_allocations`.
- `trg_freeze_snapshots` on every `*_snapshot` money column.
- `assert_invoice_void_unallocated()` — a paid invoice cannot be voided.
- RLS on all 62 tables; every view `security_invoker`; writes are service-role
  only, with no client `INSERT`/`UPDATE`/`DELETE` policy anywhere.
- `payment_webhook_events` readable by **admin only**; `payment_orders`,
  `refunds`, `invoices` scoped to `user_id = auth.uid() OR is_staff()`.

### Backend — `apps/backend/src/modules/payments`

| File | Lines | Role |
|---|---|---|
| `payments.service.ts` | 904 | Order creation, client verify, webhook, `applyPaymentSuccess` |
| `payments.routes.ts` | 37 | 3 routes + unauthenticated webhook |
| `payments.controller.ts` | 35 | Thin |
| `payments.validation.ts` | 12 | Zod |
| `renewalFee.ts` | 75 | Late-fee computation, shared with the preview path |

Routes:

- `POST /payments/webhook` — mounted **before** `requireAuth`, correct.
- `POST /payments/bookings/:id/order` — `requireAuth` + `requireKycVerified`.
- `POST /payments/invoices/:id/order` — `requireAuth`.
- `POST /payments/verify` — `requireAuth`.

Things it already does right, which should be preserved:

- **Amount is computed server-side**, from `v_invoice_balances.balance_amount`
  plus a freshly computed late fee. The client sends only a UUID.
- Ownership is checked on every path (`booking.user_id !== actor.id` → 404, not
  403 — deliberate, avoids an enumeration oracle).
- Raw request bytes are captured in `app.ts` via the `express.json({ verify })`
  hook, so webhook signatures verify against the exact payload.
- `handleWebhook` distinguishes *seen* from *processed*: a `23505` on
  `gateway_event_id` re-reads the row and only short-circuits if `processed_at`
  is set, so a dispatch that threw is retried on redelivery.
- `applyPaymentSuccess` is idempotent on `payment_transactions.gateway_payment_id`.
- Allocation is capped at the **balance**, not the invoice total.
- `RAZORPAY_KEY_SECRET` is never returned to a client; only `keyId` is.
- Refunds are gated on `refunds.approve`, not `refunds.view` — the routes file
  documents exactly why.

### Mobile — `apps/mobile`

`react-native-razorpay@^2.3.0`, wrapped in `src/lib/razorpayCheckout.ts` with
hand-written types (the package ships none). Checkout is driven from
`src/app/booking/billing.tsx`: create order → open sheet → `POST /payments/verify`.
The client never computes or sends an amount.

### Web — `apps/web`

Staff/Admin pages exist: Payments, Billing & Charges, Refunds, Reconciliation.
Nav is `moduleKey`-gated and matches the backend's `requireAction` checks. No
Razorpay key of any kind appears in the web bundle. The Reconciliation page
already surfaces `payment_webhook_events` where `is_signature_valid = false` or
`processed_at IS NULL` — the right operational query.

---

## Findings

Severity is against a live, money-handling deployment.

### C1 — CRITICAL — The webhook has never been able to run

**File:** `apps/backend/src/modules/payments/payments.service.ts:486-495`

```ts
.insert({
    gateway: "razorpay",
    gateway_event_id: eventId,
    event_type: eventType,
    payload: body as unknown as Record<string, unknown>,
} as never)          // <- suppresses the missing is_signature_valid
```

`payment_webhook_events.is_signature_valid` is `boolean not null` with no
default (`20260819101400_billing_payments.sql:67`, confirmed against the
generated `database.types.ts` Insert type, where it is required). The `as never`
cast defeats the compile-time check.

**Attack scenario:** none needed — it is a correctness failure. Every delivery
raises `23502 not_null_violation`, the handler 500s, Razorpay retries, every
retry fails identically.
**Impact:** the authoritative server-side confirmation path is dead. All state
transitions depend on the client calling `/payments/verify`. A rider who kills
the app after paying is never confirmed, and no sweep repairs it.
`refund.processed` and `refund.failed` never land either, so refunds stay
`processing` forever.
**Fix:** set `is_signature_valid: true` at the insert and drop the `as never`.
Persist invalid-signature attempts as `false` rather than discarding them, so
the Reconciliation page's forgery query has something to show.

### C2 — CRITICAL — Mock mode marks unpaid bookings as paid

**File:** `payments.service.ts:60-67, 323-331, 362-372`; surfaced to the client
as `CreateOrderResult.mock` (`payments.types.ts:20`) and consumed at
`apps/mobile/src/app/booking/billing.tsx:63`.

```ts
function isGatewayConfigured() {
    return !!env.razorpayKeyId && !!env.razorpayKeySecret;
}
…
if (!configured) {
    await applyPaymentSuccess({ …, gatewayPaymentId: `mock_payment_${randomUUID()}`, … });
    return toOrderResult(order, true);
}
```

`env.ts` deliberately defaults both keys to `""` so the server boots without
them. That is reasonable for boot; it is not reasonable for checkout.

**Attack scenario:** no attacker required. A deploy where the secret is missing,
blank, or dropped by a config-map typo silently converts every checkout into a
free confirmed booking with a held deposit and a fully allocated invoice.
**Impact:** unbounded revenue loss, and the ledger records payments that never
existed — `payment_transactions` is append-only, so the fake rows cannot be
deleted, only compensated.
**Fix:** delete the mock path entirely. `getRazorpay()` already throws a clean
503; let it. Remove `mock` from `CreateOrderResult`, from the mobile
`ApiPaymentOrder` type, and from the mobile branch. Make the keys `required()`
when `NODE_ENV === "production"`.

### C3 — CRITICAL — Refunds have the same mock path

**File:** `apps/backend/src/modules/refunds/refunds.service.ts:64-65, 387-392`

`isGatewayConfigured()` false → `gateway_refund_id = mock_refund_<uuid>`, and
the refund is marked `succeeded` with `completed_at` set. Money never leaves,
but the deposit is released and the rider is notified that it did.

**Impact:** refund liability is discharged in the ledger without payment.
Because `assert_refund_within_payment` counts non-failed refunds, the fake
refund also consumes refundable headroom against the real payment.
**Fix:** same as C2 — remove the branch.

### H1 — HIGH — `/payments/verify` trusts the signature but never asks Razorpay what happened

**File:** `payments.service.ts:408-436`

The signature over `order_id|payment_id` proves the pair is genuine and belongs
to this merchant. It does **not** prove the payment was captured, nor for how
much. The handler then writes `status: "succeeded"` with
`amount: Number(order.amount)` — the amount *we asked for*, not the amount
*taken*.

**Attack scenario:** with auto-capture disabled, or on a payment that is
`authorized` and later voided, a valid signature confirms the booking and holds
the deposit against money that is never captured. A replayed but genuine
`(order_id, payment_id, signature)` triple is blocked by the
`gateway_payment_id` unique constraint — that part holds.
**Impact:** goods released against uncaptured funds.
**Fix:** after signature verification, `payments.fetch(razorpay_payment_id)`;
require `status === "captured"`, matching `order_id`, `currency === "INR"`, and
`amount === rupeesToPaise(order.amount)`. Use the fetched amount and method,
never the local ones.

### H2 — HIGH — Underpayment still confirms the booking

**File:** `payments.service.ts:684-715`

`applyPaymentSuccess` allocates `min(input.amount, owed)` and then calls
`applyInitialSuccess()` unconditionally on `purpose === 'initial'`. A capture
smaller than the invoice total leaves the invoice part-paid and the booking
`confirmed`, with the deposit `held`.

Razorpay orders reject mismatched amounts when `partial_payment` is false (the
default, and we never set it), so this is defence-in-depth rather than a live
hole — but the state machine should not depend on the gateway's configuration.
**Fix:** gate the `applyInitialSuccess` / `applyRenewalSuccess` calls on
`v_invoice_balances.is_paid` after the allocation, not on the bare purpose.

### H3 — HIGH — A stale order is reused after the amount has changed

**File:** `payments.service.ts:317-321, 377-388`

`idempotency_key` is `invoice:<id>:<amount>`, which correctly makes a re-tap at
the same price a no-op. But `findReusableOrder(invoiceId)` matches on
`invoice_id` and `status IN ('created','attempted')` **only** — it ignores the
amount. The late fee is recomputed on every call and grows daily, so a rider who
opens checkout on day 1 and pays on day 5 is charged day 1's amount.

**Attack scenario:** open checkout, wait, pay. Deterministic, no tooling needed.
**Impact:** revenue leak proportional to the late-fee rate; the invoice stays
part-paid and the rider looks delinquent despite having "paid".
**Fix:** add `.eq("amount", amount)` to `findReusableOrder`, and expire or
supersede orders whose amount no longer matches.

### H4 — HIGH — Webhook idempotency depends on a body field, with a random fallback

**File:** `payments.service.ts:467`

```ts
const eventId = body.id ?? randomUUID();
```

If `id` is ever absent the fallback is unique per call, so a redelivery inserts a
second row and re-dispatches. `applyPaymentSuccess` is protected by the
`gateway_payment_id` constraint, so the money stays right — but
`applyPaymentFailure` and `applyRefundWebhookResult` are not equally guarded,
and the audit trail gains phantom events.

**Fix:** key on the `x-razorpay-event-id` header, which Razorpay sends for
exactly this purpose, falling back to `body.id`. If neither is present, reject
with 400 rather than inventing an id.

### H5 — HIGH — No `payment.authorized` or `order.paid` handling

**File:** `payments.service.ts:538-571`

Only `payment.captured`, `payment.failed`, `refund.processed`, `refund.failed`
are dispatched. An authorized-but-not-captured payment is invisible, so
`payment_orders` never reaches `attempted` and the order-expiry sweep may
release a vehicle hold under a rider who is mid-payment.

**Fix:** handle `payment.authorized` by moving the order to `attempted` and
extending the hold; treat `order.paid` as a capture confirmation.

### M1 — MEDIUM — `payment_order_status` never reaches `attempted` or `expired`

Nothing writes either value. `idx_payment_orders_expiry` exists for a sweep that
does not exist in the v2 code path. Abandoned checkouts therefore rely solely on
the booking-expiry sweep calling `cancelAbandonedSubscription`.

### M2 — ~~MEDIUM~~ **WITHDRAWN** — Abandoned checkout leaves an `active` subscription

The FK chain `payment_orders.invoice_id → invoices.subscription_id` does force
the subscription to exist before money can be taken, and `subscription_status`
has no `pending` value, so an abandoned checkout does leave an `active`
subscription behind. That much is accurate and is documented candidly in the
service header (`payments.service.ts:39-43`).

**But the cleanup already exists and already works.** On a closer read,
`supabase/functions/booking-payment-expiry-sweep/index.ts` is fully v2-aware:
it reads `bookings.hold_expires_at`, checks for settlement through
`payment_allocations` (not an order status), cancels the orphaned subscription
under a status guard, and releases the never-held deposit. This finding was
wrong and is withdrawn.

What was genuinely missing is narrower and is recorded as M1 below.

### M3 — MEDIUM — Stale documentation asserts there is no gateway

**File:** `apps/web/src/services/api/payments.ts:44-47`

> "There's no payment gateway wired into this codebase, so no money actually moves"

False since the Razorpay work landed. `POST /invoices/:id/refund` creates a real
`refunds` row that a later `processRefund` will pay out. A staff member reading
this comment could believe a refund is bookkeeping-only.

### M4 — MEDIUM — Zero payment test coverage

`apps/backend/tests/payments.test.ts` contains only `addDays` date tests. Nothing
covers signature verification, webhook idempotency, allocation capping, refund
ceilings, or amount tampering. **These are date tests worth keeping — they should
be moved to a `dates.test.ts`, not deleted.**

### L1 — LOW — Failed webhook signatures are discarded

`handleWebhook` throws on an invalid signature before any row is written, so a
forgery attempt leaves no trace. The Reconciliation page queries for
`is_signature_valid = false` and will always find nothing.

### L2 — LOW — `console.warn` on the webhook reprocess path

`payments.service.ts:511` logs `eventId` and `eventType` only — no PII, no
secrets. Acceptable, but it should go through the structured logger.

---

## Explicitly checked and found clean

- No `RAZORPAY_KEY_SECRET` or `RAZORPAY_WEBHOOK_SECRET` in `apps/mobile` or
  `apps/web`. Only `keyId` crosses to a client.
- No `.env` file is tracked by git; `.gitignore` covers root and backend. Only
  `.env.example` files are committed, with placeholder values.
- No raw card number, CVV, or UPI PIN is stored, logged, or typed anywhere.
  `payment_transactions.raw_payload` holds Razorpay's own entity, which carries
  only the last four and the network.
- No client-side amount ever reaches the backend. Every order route takes a UUID
  and nothing else.
- No SQL injection surface: all access is PostgREST or parameterised RPC.
- No duplicate payment schema. The old `supabase/migrations` payment tables
  belong to a different Supabase project and are not applied here.
- RLS denies `anon` everywhere and grants no client write policy on any table.

---

## Verdict

**NOT PRODUCTION READY.** Three critical and five high findings are open. The v2
schema needs only additive changes; the backend needs targeted repair; the mobile
and web apps need the mock branch removed.
